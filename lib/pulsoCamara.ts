/**
 * Pulso con la cámara (fotopletismografía, PPG). Con cada latido entra más
 * sangre a los capilares y la piel absorbe un poco más de luz: el brillo
 * promedio de la imagen baja un poquito al ritmo del corazón.
 *
 * - Dedo sobre la cámara (con flash): se usa el canal rojo.
 * - Cara frente a la webcam (rPPG): se usa el canal verde de la frente.
 *
 * Este módulo no sabe nada de cámaras: recibe muestras (tiempo, brillo) y
 * devuelve la frecuencia cardiaca, la HRV y qué tan confiable es la medición.
 * Todo corre en el dispositivo, sin red.
 */

export interface Muestra {
  t: number; // ms
  v: number; // brillo promedio del canal elegido
}

export interface ResultadoPulso {
  fc: number | null; // lpm; null mientras no hay una estimación confiable
  hrv: number | null; // RMSSD en ms; null si no hay suficientes latidos limpios
  calidad: number; // 0 a 1
  latidos: number[]; // instantes (ms) de los latidos detectados en la ventana
  senal: number[]; // señal filtrada, para dibujar la onda
  segundos: number; // segundos de señal en la ventana
}

const VENTANA_MS = 12_000;
export const SEGUNDOS_MINIMOS = 6;
const FC_MIN = 40;
const FC_MAX = 180;

export class ProcesadorPulso {
  private muestras: Muestra[] = [];

  agregar(t: number, v: number) {
    if (!Number.isFinite(v)) return;
    const ultima = this.muestras.at(-1);
    if (ultima && t <= ultima.t) return;
    this.muestras.push({ t, v });
    const corte = t - VENTANA_MS;
    while (this.muestras.length && this.muestras[0].t < corte) this.muestras.shift();
  }

  reiniciar() {
    this.muestras = [];
  }

  calcular(): ResultadoPulso {
    return analizar(this.muestras);
  }
}

/** Análisis de una ventana de muestras. Exportado para poder probarlo. */
export function analizar(muestras: Muestra[]): ResultadoPulso {
  const vacio = (segundos: number, senal: number[] = []): ResultadoPulso => ({
    fc: null,
    hrv: null,
    calidad: 0,
    latidos: [],
    senal,
    segundos,
  });
  if (muestras.length < 10) return vacio(0);

  const t = muestras.map((m) => m.t);
  const segundos = (t.at(-1)! - t[0]) / 1000;
  const fps = (muestras.length - 1) / segundos;
  if (!Number.isFinite(fps) || fps < 8) return vacio(segundos);

  // Filtro pasa banda de 0.7 a 3.5 Hz (42 a 210 lpm): quita la deriva lenta
  // (respiración, cambios de luz) y el ruido rápido. Se aplica hacia adelante
  // y hacia atrás para no desplazar los picos en el tiempo.
  const v = muestras.map((m) => m.v);
  const media = v.reduce((a, x) => a + x, 0) / v.length;
  const centrada = v.map((x) => x - media);
  const pasos = [
    biquad("altos", 0.7, fps),
    biquad("altos", 0.7, fps),
    biquad("bajos", Math.min(3.5, fps * 0.45), fps),
  ];
  let senal = centrada;
  for (const f of pasos) senal = filtrarIdaYVuelta(senal, f);
  if (segundos < SEGUNDOS_MINIMOS) return vacio(segundos, senal);

  const energia = senal.reduce((s, x) => s + x * x, 0);
  if (energia === 0) return vacio(segundos, senal);

  // 3. Periodo dominante por autocorrelación: compara la señal consigo misma
  //    desplazada y busca el desfase que mejor se repite. Es robusto a la
  //    "muesca dícrota" (el segundo bultito de cada latido) que engaña a un
  //    detector de picos ingenuo.
  const kMin = Math.max(2, Math.floor((fps * 60) / FC_MAX));
  const kMax = Math.min(senal.length - 3, Math.ceil((fps * 60) / FC_MIN));
  const r = (k: number) => {
    let suma = 0;
    for (let i = 0; i + k < senal.length; i++) suma += senal[i] * senal[i + k];
    return suma / energia;
  };
  const rs: number[] = [];
  for (let k = kMin - 1; k <= kMax + 1; k++) rs[k] = r(k);
  // Solo cuentan máximos locales: cerca de desfase cero la señal siempre se
  // parece a sí misma, y eso no es un latido.
  let mejorK = -1;
  let mejorR = -Infinity;
  for (let k = kMin; k <= kMax; k++) {
    if (rs[k] >= rs[k - 1] && rs[k] > rs[k + 1] && rs[k] > mejorR) {
      mejorR = rs[k];
      mejorK = k;
    }
  }
  if (mejorK < 0 || mejorR <= 0) return vacio(segundos, senal);
  // Ajuste parabólico entre muestras vecinas para no depender de los fps.
  let kFino = mejorK;
  if (mejorK > kMin && mejorK < kMax) {
    const a = rs[mejorK - 1];
    const b = rs[mejorK];
    const c = rs[mejorK + 1];
    const den = a - 2 * b + c;
    if (den !== 0) kFino = mejorK + (0.5 * (a - c)) / den;
  }
  const periodoMs = (kFino / fps) * 1000;

  // 4. Un latido por periodo: el máximo dentro de ±30 % del periodo.
  const radio = Math.max(1, Math.round((periodoMs / 1000) * fps * 0.3));
  const latidos: { t: number; v: number }[] = [];
  for (let i = radio; i < senal.length - radio; i++) {
    const x = senal[i];
    if (x <= 0) continue;
    let esMaximo = true;
    for (let k = i - radio; k <= i + radio; k++) {
      if (senal[k] > x) {
        esMaximo = false;
        break;
      }
    }
    if (!esMaximo) continue;
    // Dos picos más cerca que 60 % del periodo son el mismo latido (el segundo
    // suele ser la muesca dícrota): se queda el más alto.
    const previo = latidos.at(-1);
    if (previo !== undefined && t[i] - previo.t < periodoMs * 0.6) {
      if (x > previo.v) latidos[latidos.length - 1] = { t: t[i], v: x };
      continue;
    }
    latidos.push({ t: t[i], v: x });
  }

  const intervalos: number[] = [];
  for (let i = 1; i < latidos.length; i++) intervalos.push(latidos[i].t - latidos[i - 1].t);
  const instantes = latidos.map((l) => l.t);
  const fcAuto = 60_000 / periodoMs;
  if (fcAuto < FC_MIN || fcAuto > FC_MAX) return { ...vacio(segundos, senal), latidos: instantes };

  // Calidad: qué tan periódica es la señal y cuántos intervalos cuadran con el periodo.
  const limpios = intervalos.filter((x) => x > periodoMs * 0.75 && x < periodoMs * 1.25);
  const proporcion = intervalos.length ? limpios.length / intervalos.length : 0;
  const periodicidad = Math.max(0, Math.min(1, (mejorR - 0.15) / 0.45));
  const calidad = Math.round(periodicidad * proporcion * 100) / 100;

  // Si los intervalos limpios son suficientes se usa su mediana (más precisa);
  // si no, el periodo de la autocorrelación.
  const fc = Math.round(limpios.length >= 4 ? 60_000 / mediana(limpios) : fcAuto);

  // HRV (RMSSD) solo con pares de intervalos limpios consecutivos.
  let hrv: number | null = null;
  if (calidad >= 0.5) {
    let suma = 0;
    let n = 0;
    const limpio = (x: number) => x > periodoMs * 0.75 && x < periodoMs * 1.25;
    for (let i = 1; i < intervalos.length; i++) {
      if (limpio(intervalos[i - 1]) && limpio(intervalos[i])) {
        suma += (intervalos[i] - intervalos[i - 1]) ** 2;
        n++;
      }
    }
    if (n >= 4) hrv = Math.round(Math.sqrt(suma / n));
  }

  return { fc: calidad >= 0.4 ? fc : null, hrv, calidad, latidos: instantes, senal, segundos };
}

/** ¿El dedo cubre la cámara? Con el flash encendido la imagen queda casi toda roja. */
export function dedoCubriendo(r: number, g: number, b: number): boolean {
  return r > 90 && r > g * 1.8 && r > b * 1.8;
}

function mediana(x: number[]): number {
  const o = [...x].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

interface Coefs {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** Filtro de segundo orden (Butterworth, recetario de R. Bristow-Johnson). */
function biquad(tipo: "altos" | "bajos", corte: number, fs: number): Coefs {
  const w0 = (2 * Math.PI * corte) / fs;
  const cos = Math.cos(w0);
  const alfa = Math.sin(w0) / (2 * Math.SQRT1_2);
  const a0 = 1 + alfa;
  const b1 = tipo === "bajos" ? 1 - cos : -(1 + cos);
  const b0 = tipo === "bajos" ? (1 - cos) / 2 : (1 + cos) / 2;
  return { b0: b0 / a0, b1: b1 / a0, b2: b0 / a0, a1: (-2 * cos) / a0, a2: (1 - alfa) / a0 };
}

function filtrar(x: number[], c: Coefs): number[] {
  const y = new Array<number>(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const yi = c.b0 * x[i] + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = yi;
    y[i] = yi;
  }
  return y;
}

function filtrarIdaYVuelta(x: number[], c: Coefs): number[] {
  return filtrar(filtrar(x, c).reverse(), c).reverse();
}
