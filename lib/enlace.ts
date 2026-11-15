import type { Nivel } from "./tipos";

/**
 * Enlace con la Tierra. La detección corre a bordo; a la Tierra solo viajan
 * resúmenes periódicos. Si el enlace se corta (apagón, sombra de un planeta,
 * falla de antena), los resúmenes se guardan en cola y se envían al volver.
 */

export interface Resumen {
  id: number;
  creado: number; // ms
  nivel: Nivel;
  texto: string;
}

export interface EstadoEnlace {
  apagon: boolean;
  cola: Resumen[];
  enviados: number;
  ultimoEnvio: number | null;
  siguienteId: number;
}

export const MAX_COLA = 500;

/** Retraso de la señal en un sentido, en minutos (Marte: de 3 a 22 según la posición). */
export const RETRASO_MARTE_MIN = 12;

export const enlaceInicial = (): EstadoEnlace => ({
  apagon: false,
  cola: [],
  enviados: 0,
  ultimoEnvio: null,
  siguienteId: 1,
});

/** Registra un resumen: se envía si hay enlace o se encola si no. */
export function registrar(e: EstadoEnlace, r: Omit<Resumen, "id">): EstadoEnlace {
  const resumen = { ...r, id: e.siguienteId };
  if (e.apagon) {
    // Si la cola se llena se descartan los más viejos: lo reciente importa más.
    return { ...e, cola: [...e.cola, resumen].slice(-MAX_COLA), siguienteId: e.siguienteId + 1 };
  }
  return { ...e, enviados: e.enviados + 1, ultimoEnvio: r.creado, siguienteId: e.siguienteId + 1 };
}

/**
 * Cambia el estado del enlace. Al recuperarlo se envía toda la cola.
 * Devuelve también cuántos resúmenes salieron en ese momento.
 */
export function cambiarApagon(e: EstadoEnlace, apagon: boolean, ahora: number): { estado: EstadoEnlace; enviadosAhora: number } {
  if (apagon === e.apagon) return { estado: e, enviadosAhora: 0 };
  if (apagon) return { estado: { ...e, apagon: true }, enviadosAhora: 0 };
  const n = e.cola.length;
  return {
    estado: { ...e, apagon: false, cola: [], enviados: e.enviados + n, ultimoEnvio: n > 0 ? ahora : e.ultimoEnvio },
    enviadosAhora: n,
  };
}

/** Restaura un estado guardado; si algo no cuadra, empieza de cero. */
export function restaurarEnlace(datos: unknown): EstadoEnlace {
  const d = datos as Partial<EstadoEnlace> | null;
  if (
    !d ||
    typeof d.apagon !== "boolean" ||
    !Array.isArray(d.cola) ||
    !Number.isFinite(d.enviados) ||
    !Number.isFinite(d.siguienteId)
  ) {
    return enlaceInicial();
  }
  return {
    apagon: d.apagon,
    cola: d.cola.slice(-MAX_COLA),
    enviados: d.enviados!,
    ultimoEnvio: Number.isFinite(d.ultimoEnvio) ? d.ultimoEnvio! : null,
    siguienteId: d.siguienteId!,
  };
}
