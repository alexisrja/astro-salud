import assert from "node:assert/strict";
import { test } from "node:test";
import { cambiarApagon, enlaceInicial, MAX_COLA, registrar, restaurarEnlace } from "./enlace";

const resumen = (creado: number) => ({ creado, nivel: "verde" as const, texto: "Tripulación estable" });

test("con enlace, los resúmenes se envían de inmediato", () => {
  const e = registrar(enlaceInicial(), resumen(1000));
  assert.equal(e.enviados, 1);
  assert.equal(e.cola.length, 0);
  assert.equal(e.ultimoEnvio, 1000);
});

test("durante un apagón se encolan y al volver el enlace se envían todos", () => {
  let e = cambiarApagon(enlaceInicial(), true, 0).estado;
  e = registrar(e, resumen(1));
  e = registrar(e, resumen(2));
  assert.equal(e.enviados, 0);
  assert.deepEqual(
    e.cola.map((r) => r.id),
    [1, 2],
  );
  const { estado, enviadosAhora } = cambiarApagon(e, false, 99);
  assert.equal(enviadosAhora, 2);
  assert.equal(estado.cola.length, 0);
  assert.equal(estado.enviados, 2);
  assert.equal(estado.ultimoEnvio, 99);
});

test("la cola tiene tope y conserva lo más reciente", () => {
  let e = cambiarApagon(enlaceInicial(), true, 0).estado;
  for (let i = 0; i < MAX_COLA + 10; i++) e = registrar(e, resumen(i));
  assert.equal(e.cola.length, MAX_COLA);
  assert.equal(e.cola.at(-1)!.creado, MAX_COLA + 9);
});

test("repetir el mismo estado no cambia nada", () => {
  const e = enlaceInicial();
  assert.equal(cambiarApagon(e, false, 5).estado, e);
});

test("restaurar datos dañados empieza de cero", () => {
  assert.deepEqual(restaurarEnlace(null), enlaceInicial());
  assert.deepEqual(restaurarEnlace({ apagon: "sí" }), enlaceInicial());
  const guardado = registrar(enlaceInicial(), resumen(7));
  assert.deepEqual(restaurarEnlace(JSON.parse(JSON.stringify(guardado))), guardado);
});
