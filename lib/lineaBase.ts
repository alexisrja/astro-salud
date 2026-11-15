import type { Lectura } from "./tipos";

/**
 * Línea base personal. Cada astronauta aprende su propio "normal" y se le
 * avisa cuando una métrica se aleja de él de forma sostenida, aunque siga
 * dentro de los umbrales fijos de salud.ts. Corre a bordo, sin red.
 *
 * Método: media y varianza con promedio móvil exponencial (EWMA). Las lecturas
 * que ya se consideran desviadas no actualizan la línea base, así un deterioro
 * lento no "contamina" el normal y se sigue detectando.
 */

export type MetricaBase = "fc" | "spo2" | "temp" | "hrv" | "sueno";

interface DefBase {
  etiqueta: string;
  unidad: string;
  decimales: number;
  malo: 1 | -1; // 1: subir es malo; -1: bajar es malo
  sdMin: number; // piso de desviación estándar para no alarmar por ruido mínimo
}

export const DEF_BASE: Record<MetricaBase, DefBase> = {
  fc: { etiqueta: "Frecuencia cardiaca", unidad: "lpm", decimales: 0, malo: 1, sdMin: 2 },
  spo2: { etiqueta: "Oxígeno en sangre", unidad: "%", decimales: 0, malo: -1, sdMin: 0.8 },
  temp: { etiqueta: "Temperatura", unidad: "°C", decimales: 1, malo: 1, sdMin: 0.15 },
  hrv: { etiqueta: "HRV", unidad: "ms", decimales: 0, malo: -1, sdMin: 3 },
  sueno: { etiqueta: "Sueño", unidad: "h", decimales: 1, malo: -1, sdMin: 0.3 },
};

const METRICAS_BASE = Object.keys(DEF_BASE) as MetricaBase[];

export const CALENTAMIENTO = 15; // lecturas antes de empezar a juzgar
export const Z_ALERTA = 3; // desviaciones estándar en la dirección mala
export const PERSISTENCIA = 4; // lecturas seguidas fuera de rango para avisar
const Z_APRENDE = 2; // por encima de esto la lectura ya es dudosa y no enseña el normal
// Qué tan rápido aprende el normal: al inicio es un promedio simple de todo lo
// visto y después pasa a un promedio móvil lento.
const ALFA_MIN = 0.01;

export interface Desviacion {
  metrica: MetricaBase;
  z: number; // positivo = hacia el lado malo
  normal: number;
  actual: number;
  mensaje: string;
}

interface Estado {
  media: number;
  varianza: number;
  n: number;
  racha: number;
}

export class LineaBase {
  private estados = new Map<string, Record<MetricaBase, Estado>>();

  /** Incorpora una lectura y devuelve las desviaciones sostenidas actuales. */
  actualizar(l: Lectura): Desviacion[] {
    let porMetrica = this.estados.get(l.astronauta_id);
    if (!porMetrica) {
      porMetrica = Object.fromEntries(
        METRICAS_BASE.map((m) => [m, { media: l[m], varianza: 0, n: 0, racha: 0 }]),
      ) as Record<MetricaBase, Estado>;
      this.estados.set(l.astronauta_id, porMetrica);
    }

    const desviaciones: Desviacion[] = [];
    for (const m of METRICAS_BASE) {
      const def = DEF_BASE[m];
      const e = porMetrica[m];
      const v = l[m];
      const sd = Math.max(Math.sqrt(e.varianza), def.sdMin);
      const z = ((v - e.media) / sd) * def.malo;
      const fuera = e.n >= CALENTAMIENTO && z >= Z_ALERTA;

      e.racha = fuera ? e.racha + 1 : 0;
      if (e.n < CALENTAMIENTO || z < Z_APRENDE) {
        // Solo lo que parece normal enseña lo que es normal: así una deriva
        // lenta no arrastra la línea base con ella.
        const alfa = Math.max(1 / (e.n + 1), ALFA_MIN);
        const diff = v - e.media;
        e.media += alfa * diff;
        e.varianza = (1 - alfa) * (e.varianza + alfa * diff * diff);
        e.n++;
      }

      if (e.racha >= PERSISTENCIA) {
        desviaciones.push({ metrica: m, z, normal: e.media, actual: v, mensaje: mensaje(m, e.media, v) });
      }
    }
    return desviaciones.sort((a, b) => b.z - a.z);
  }

  /** true mientras el astronauta todavía no tiene suficientes datos. */
  aprendiendo(id: string): boolean {
    const e = this.estados.get(id);
    return !e || e.fc.n < CALENTAMIENTO;
  }

  reiniciar(id: string) {
    this.estados.delete(id);
  }

  /** Copia serializable para guardarla en el dispositivo (IndexedDB). */
  exportar(): Record<string, Record<MetricaBase, Estado>> {
    return structuredClone(Object.fromEntries(this.estados));
  }

  /** Restaura lo aprendido. Ignora entradas con forma inesperada. */
  importar(datos: unknown) {
    if (!datos || typeof datos !== "object") return;
    for (const [id, porMetrica] of Object.entries(datos as Record<string, unknown>)) {
      if (!porMetrica || typeof porMetrica !== "object") continue;
      const p = porMetrica as Record<string, Partial<Estado>>;
      const valido = METRICAS_BASE.every(
        (m) => p[m] && ["media", "varianza", "n", "racha"].every((k) => Number.isFinite(p[m]![k as keyof Estado])),
      );
      // La racha no se restaura: tras un reinicio se vuelve a confirmar la desviación.
      if (valido) {
        this.estados.set(
          id,
          Object.fromEntries(METRICAS_BASE.map((m) => [m, { ...(p[m] as Estado), racha: 0 }])) as Record<
            MetricaBase,
            Estado
          >,
        );
      }
    }
  }
}

function mensaje(m: MetricaBase, normal: number, actual: number): string {
  const def = DEF_BASE[m];
  const f = (x: number) => x.toFixed(def.decimales);
  const sentido = actual > normal ? "arriba" : "debajo";
  // En temperatura y oxígeno un porcentaje engaña (37.3 vs 36.6 °C es "2 %"): se da la diferencia.
  const cuanto =
    m === "temp" || m === "spo2"
      ? `${f(Math.abs(actual - normal))} ${def.unidad}`
      : `${Math.round((Math.abs(actual - normal) / Math.abs(normal)) * 100)} %`;
  return `${def.etiqueta} ${cuanto} por ${sentido} de tu normal (${f(normal)} → ${f(actual)} ${def.unidad})`;
}
