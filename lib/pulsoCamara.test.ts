import assert from "node:assert/strict";
import { test } from "node:test";
import { analizar, dedoCubriendo, ProcesadorPulso, SEGUNDOS_MINIMOS, type Muestra } from "./pulsoCamara";

// Generador determinista para que las pruebas no dependan del azar.
function aleatorio(semilla: number) {
  let s = semilla;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296 - 0.5;
  };
}

/** Señal parecida a la de una cámara: latidos, deriva por respiración y ruido. */
function senalSintetica(fc: number, segundos: number, opciones: { fps?: number; ruido?: number; variacion?: number } = {}) {
  const { fps = 30, ruido = 0.15, variacion = 0.03 } = opciones;
  const rnd = aleatorio(7);
  const latidos: number[] = [];
  for (let t = 300; t < segundos * 1000; ) {
    latidos.push(t);
    t += (60_000 / fc) * (1 + rnd() * 2 * variacion);
  }
  const muestras: Muestra[] = [];
  for (let i = 0; i < segundos * fps; i++) {
    const t = (i * 1000) / fps;
    let v = 100 + 3 * Math.sin((2 * Math.PI * t) / 4000); // respiración
    for (const l of latidos) {
      const d = t - l;
      v += Math.exp(-((d / 70) ** 2)) + 0.35 * Math.exp(-(((d - 300) / 90) ** 2));
    }
    v += rnd() * 2 * ruido;
    muestras.push({ t, v });
  }
  return muestras;
}

for (const fc of [55, 72, 95, 130]) {
  test(`estima ${fc} lpm con margen de ±3`, () => {
    const r = analizar(senalSintetica(fc, 12));
    assert.ok(r.fc !== null, "sin estimación");
    assert.ok(Math.abs(r.fc - fc) <= 3, `fc = ${r.fc}`);
    assert.ok(r.calidad >= 0.5, `calidad = ${r.calidad}`);
  });
}

test("funciona con una webcam lenta de 15 cuadros por segundo", () => {
  const r = analizar(senalSintetica(80, 12, { fps: 15 }));
  assert.ok(r.fc !== null && Math.abs(r.fc - 80) <= 4, `fc = ${r.fc}`);
});

test("calcula una HRV razonable con latidos limpios", () => {
  const r = analizar(senalSintetica(70, 12, { variacion: 0.05 }));
  assert.ok(r.hrv !== null && r.hrv > 5 && r.hrv < 150, `hrv = ${r.hrv}`);
});

test("no da número antes del mínimo de segundos", () => {
  const r = analizar(senalSintetica(72, SEGUNDOS_MINIMOS - 2));
  assert.equal(r.fc, null);
});

test("puro ruido no produce una frecuencia confiable", () => {
  const rnd = aleatorio(3);
  const muestras: Muestra[] = Array.from({ length: 360 }, (_, i) => ({ t: (i * 1000) / 30, v: 100 + rnd() * 4 }));
  const r = analizar(muestras);
  assert.ok(r.fc === null || r.calidad < 0.5, `fc = ${r.fc}, calidad = ${r.calidad}`);
});

test("una imagen quieta no produce frecuencia", () => {
  const muestras: Muestra[] = Array.from({ length: 360 }, (_, i) => ({ t: (i * 1000) / 30, v: 120 }));
  assert.equal(analizar(muestras).fc, null);
});

test("el procesador conserva solo la ventana reciente e ignora tiempos repetidos", () => {
  const p = new ProcesadorPulso();
  for (const m of senalSintetica(72, 30)) p.agregar(m.t, m.v);
  p.agregar(1, 999); // tiempo viejo: se ignora
  const r = p.calcular();
  assert.ok(r.segundos <= 12.1, `segundos = ${r.segundos}`);
  assert.ok(r.fc !== null && Math.abs(r.fc - 72) <= 3, `fc = ${r.fc}`);
});

test("detecta cuando el dedo cubre la cámara", () => {
  assert.equal(dedoCubriendo(200, 40, 30), true);
  assert.equal(dedoCubriendo(120, 110, 100), false);
  assert.equal(dedoCubriendo(30, 5, 5), false); // muy oscuro: no hay luz suficiente
});
