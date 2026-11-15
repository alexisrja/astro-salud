import { ASTRONAUTAS, type Escenario, type Lectura } from "./tipos";

/**
 * Simulador de smartwatch. Lo usan tanto el navegador (modo demo) como
 * `scripts/simulador.ts` (modo Supabase), así ambos generan los mismos datos.
 */

interface Estado {
  fc: number;
  spo2: number;
  temp: number;
  hrv: number;
  sueno: number;
  ejercicio: number;
}

// Valores hacia los que tiende cada escenario.
const OBJETIVOS: Record<Escenario, Partial<Estado>> = {
  normal: {},
  hipoxia: { spo2: 85, fc: 118, hrv: 24 },
  taquicardia: { fc: 148, hrv: 14 },
  fiebre: { temp: 38.9, fc: 108, hrv: 28 },
  fatiga: { hrv: 17, sueno: 3.4, fc: 92 },
  deterioro: {}, // relativo a la base de cada quien: ver DETERIORO
};

/**
 * Deterioro lento: lo que en una misión larga pasa en semanas (fatiga crónica,
 * mal sueño, inflamación). Se queda a propósito dentro de los umbrales fijos
 * de salud.ts, así que solo lo detecta la línea base personal.
 */
const DETERIORO = (b: Estado): Partial<Estado> => ({
  fc: b.fc + 14,
  hrv: Math.max(b.hrv * 0.7, 41),
  sueno: Math.max(b.sueno - 1.2, 6.1),
  temp: b.temp + 0.6,
});

// Qué tan rápido se acerca cada escenario a su objetivo en cada paso.
const VELOCIDAD: Partial<Record<Escenario, number>> = { deterioro: 0.02 };
const VELOCIDAD_NORMAL = 0.25;

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const ruido = (amplitud: number) => (Math.random() - 0.5) * 2 * amplitud;

/** Lo que aporta una medición real (cámara o reloj): la HRV es null si no se pudo calcular. */
export interface DatosReales {
  fc: number;
  hrv: number | null;
}

export class Simulador {
  private base = new Map<string, Estado>();
  private estado = new Map<string, Estado>();
  // Ruido de cada métrica, separado de la tendencia: así un escenario lento
  // cambia el nivel sin que el ruido se acumule como caminata aleatoria.
  private jitter = new Map<string, { fc: number; spo2: number; temp: number; hrv: number }>();
  escenarios = new Map<string, Escenario>();
  // Valores medidos por un reloj real; sustituyen a los simulados.
  private real = new Map<string, DatosReales>();

  constructor() {
    ASTRONAUTAS.forEach((a, i) => {
      const base: Estado = {
        fc: 62 + i * 4,
        spo2: 98 - (i % 2),
        temp: 36.5 + i * 0.1,
        hrv: 62 - i * 6,
        sueno: 7.2 - i * 0.3,
        ejercicio: 35 + i * 20,
      };
      this.base.set(a.id, base);
      this.estado.set(a.id, { ...base });
      this.jitter.set(a.id, { fc: 0, spo2: 0, temp: 0, hrv: 0 });
      this.escenarios.set(a.id, "normal");
    });
  }

  setEscenario(id: string, escenario: Escenario) {
    if (this.escenarios.has(id)) this.escenarios.set(id, escenario);
  }

  /** Fija (o quita, con null) los valores reales de un astronauta. */
  setReal(id: string, datos: DatosReales | null) {
    if (!this.estado.has(id)) return;
    if (datos) this.real.set(id, datos);
    else this.real.delete(id);
  }

  tieneReal(id: string) {
    return this.real.has(id);
  }

  /** Avanza un paso y devuelve una lectura por astronauta. */
  tick(ahora = new Date()): Lectura[] {
    return ASTRONAUTAS.map((a) => {
      const base = this.base.get(a.id)!;
      const e = this.estado.get(a.id)!;
      const escenario = this.escenarios.get(a.id) ?? "normal";
      const objetivo = {
        ...base,
        ...(escenario === "deterioro" ? DETERIORO(base) : OBJETIVOS[escenario]),
      };
      const k = VELOCIDAD[escenario] ?? VELOCIDAD_NORMAL;

      // El nivel de cada valor se acerca poco a poco a su objetivo...
      e.fc += (objetivo.fc - e.fc) * k;
      e.spo2 += (objetivo.spo2 - e.spo2) * k;
      e.temp += (objetivo.temp - e.temp) * k * 0.8;
      e.hrv += (objetivo.hrv - e.hrv) * k;
      // ...y encima lleva un ruido con algo de memoria, como un sensor real.
      const j = this.jitter.get(a.id)!;
      j.fc = j.fc * 0.75 + ruido(2.2);
      j.spo2 = j.spo2 * 0.75 + ruido(0.5);
      j.temp = j.temp * 0.75 + ruido(0.05);
      j.hrv = j.hrv * 0.75 + ruido(2.5);
      e.sueno = limitar(e.sueno + (objetivo.sueno - e.sueno) * k * 1.2, 0, 10);
      e.ejercicio = Math.min(150, e.ejercicio + (Math.random() < 0.15 ? 1 : 0));

      // Con reloj real, sus valores mandan. Se guardan en el estado para que,
      // al desconectarlo, la simulación continúe desde ahí sin saltos.
      let fc = limitar(e.fc + j.fc, 35, 190);
      let hrv = limitar(e.hrv + j.hrv, 5, 120);
      const real = this.real.get(a.id);
      if (real) {
        fc = e.fc = limitar(real.fc, 0, 255);
        j.fc = 0;
        if (real.hrv !== null) {
          hrv = e.hrv = limitar(real.hrv, 0, 300);
          j.hrv = 0;
        }
      }

      return {
        astronauta_id: a.id,
        fc: Math.round(fc),
        spo2: Math.round(limitar(e.spo2 + j.spo2, 70, 100)),
        temp: Math.round(limitar(e.temp + j.temp, 34, 41) * 10) / 10,
        hrv: Math.round(hrv),
        sueno: Math.round(e.sueno * 10) / 10,
        ejercicio: Math.round(e.ejercicio),
        creado_en: ahora.toISOString(),
      };
    });
  }
}
