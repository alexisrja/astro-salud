/**
 * Memoria del dispositivo (IndexedDB). Guarda lo necesario para que un
 * reinicio no borre lo aprendido: la línea base, el historial reciente y la
 * cola de resúmenes para la Tierra. Si el navegador no deja guardar (modo
 * privado, almacenamiento lleno), la app sigue funcionando sin memoria.
 */

const BASE = "orbita-vital";
const TABLA = "estado";
const CLAVE = "mision";
export const VERSION_DATOS = 1;

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolver, rechazar) => {
    const pet = indexedDB.open(BASE, 1);
    pet.onupgradeneeded = () => pet.result.createObjectStore(TABLA);
    pet.onsuccess = () => resolver(pet.result);
    pet.onerror = () => rechazar(pet.error);
  });
}

export async function cargar<T>(): Promise<T | null> {
  try {
    if (typeof indexedDB === "undefined") return null;
    const db = await abrir();
    return await new Promise<T | null>((resolver) => {
      const pet = db.transaction(TABLA, "readonly").objectStore(TABLA).get(CLAVE);
      pet.onsuccess = () => resolver((pet.result as T) ?? null);
      pet.onerror = () => resolver(null);
    }).finally(() => db.close());
  } catch {
    return null;
  }
}

export async function guardar(datos: unknown): Promise<boolean> {
  try {
    if (typeof indexedDB === "undefined") return false;
    const db = await abrir();
    return await new Promise<boolean>((resolver) => {
      const tx = db.transaction(TABLA, "readwrite");
      tx.objectStore(TABLA).put(datos, CLAVE);
      tx.oncomplete = () => resolver(true);
      tx.onerror = () => resolver(false);
      tx.onabort = () => resolver(false);
    }).finally(() => db.close());
  } catch {
    return false;
  }
}

export async function borrar(): Promise<void> {
  try {
    if (typeof indexedDB === "undefined") return;
    const db = await abrir();
    await new Promise<void>((resolver) => {
      const tx = db.transaction(TABLA, "readwrite");
      tx.objectStore(TABLA).delete(CLAVE);
      tx.oncomplete = () => resolver();
      tx.onerror = () => resolver();
    }).finally(() => db.close());
  } catch {
    // Sin memoria disponible: no hay nada que borrar.
  }
}
