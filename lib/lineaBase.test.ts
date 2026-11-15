import assert from "node:assert/strict";
import { test } from "node:test";
import { CALENTAMIENTO, LineaBase, PERSISTENCIA } from "./lineaBase";
import { evaluar } from "./salud";
import { Simulador } from "./simulador";
import { ASTRONAUTAS, type Lectura } from "./tipos";

const ID = ASTRONAUTAS[0].id;
const lectura = (cambios: Partial<Lectura> = {}): Lectura => ({
  astronauta_id: ID,
  fc: 62,
  spo2: 98,
  temp: 36.5,
  hrv: 60,
  sueno: 7.2,
  ejercicio: 40,
  creado_en: "2026-01-01T00:00:00.000Z",
  ...cambios,
});

test("no juzga mientras aprende", () => {
  const lb = new LineaBase();
  assert.equal(lb.aprendiendo(ID), true);
  for (let i = 0; i < CALENTAMIENTO; i++) lb.actualizar(lectura());
  assert.equal(lb.aprendiendo(ID), false);
});

test("un cambio sostenido hacia el lado malo se avisa tras la persistencia", () => {
  const lb = new LineaBase();
  for (let i = 0; i < 40; i++) lb.actualizar(lectura());
  for (let i = 1; i < PERSISTENCIA; i++) assert.deepEqual(lb.actualizar(lectura({ fc: 80 })), []);
  const d = lb.actualizar(lectura({ fc: 80 }));
  assert.equal(d.length, 1);
  assert.equal(d[0].metrica, "fc");
  assert.match(d[0].mensaje, /por arriba de tu normal/);
});

test("un pico aislado no genera aviso", () => {
  const lb = new LineaBase();
  for (let i = 0; i < 40; i++) lb.actualizar(lectura());
  assert.deepEqual(lb.actualizar(lectura({ fc: 95 })), []);
  assert.deepEqual(lb.actualizar(lectura()), []);
});

test("cambiar hacia el lado bueno no es alerta", () => {
  const lb = new LineaBase();
  for (let i = 0; i < 40; i++) lb.actualizar(lectura());
  let d: ReturnType<LineaBase["actualizar"]> = [];
  for (let i = 0; i < 10; i++) d = lb.actualizar(lectura({ hrv: 90, sueno: 8.5, fc: 55 }));
  assert.deepEqual(d, []);
});

test("cada astronauta tiene su propio normal", () => {
  const lb = new LineaBase();
  const otro = ASTRONAUTAS[1].id;
  for (let i = 0; i < 40; i++) {
    lb.actualizar(lectura({ fc: 60 }));
    lb.actualizar(lectura({ astronauta_id: otro, fc: 85 }));
  }
  // 85 lpm es normal para el segundo, pero no para el primero.
  let primero: ReturnType<LineaBase["actualizar"]> = [];
  let segundo: ReturnType<LineaBase["actualizar"]> = [];
  for (let i = 0; i < PERSISTENCIA; i++) {
    primero = lb.actualizar(lectura({ fc: 85 }));
    segundo = lb.actualizar(lectura({ astronauta_id: otro, fc: 85 }));
  }
  assert.equal(primero[0]?.metrica, "fc");
  assert.deepEqual(segundo, []);
});

test("con la tripulación en normal casi no hay falsas alarmas", () => {
  let avisos = 0;
  for (let corrida = 0; corrida < 10; corrida++) {
    const s = new Simulador();
    const lb = new LineaBase();
    for (let i = 0; i < 300; i++) for (const l of s.tick()) avisos += lb.actualizar(l).length;
  }
  // 10 corridas x 300 pasos x 4 astronautas x 5 métricas = 60 000 oportunidades.
  assert.ok(avisos < 30, `avisos = ${avisos}`);
});

test("el deterioro lento se detecta mientras los umbrales fijos siguen en verde", () => {
  const s = new Simulador();
  const lb = new LineaBase();
  for (let i = 0; i < 40; i++) s.tick().forEach((l) => lb.actualizar(l));
  s.setEscenario(ID, "deterioro");

  let paso = 0;
  let detectado: Lectura | null = null;
  for (; paso < 150 && !detectado; paso++) {
    const l = s.tick().find((x) => x.astronauta_id === ID)!;
    if (lb.actualizar(l).length > 0) detectado = l;
  }
  assert.ok(detectado, "la línea base no detectó el deterioro");
  assert.equal(evaluar(detectado).nivel, "verde");
});

test("lo aprendido se puede guardar y restaurar", () => {
  const lb = new LineaBase();
  for (let i = 0; i < 40; i++) lb.actualizar(lectura());
  const copia = new LineaBase();
  copia.importar(JSON.parse(JSON.stringify(lb.exportar())));
  assert.equal(copia.aprendiendo(ID), false);
  let d: ReturnType<LineaBase["actualizar"]> = [];
  for (let i = 0; i < PERSISTENCIA; i++) d = copia.actualizar(lectura({ fc: 80 }));
  assert.equal(d[0]?.metrica, "fc");
});

test("importar datos con forma inválida no rompe nada", () => {
  const lb = new LineaBase();
  lb.importar(null);
  lb.importar({ [ID]: { fc: { media: "x" } } });
  assert.equal(lb.aprendiendo(ID), true);
});
