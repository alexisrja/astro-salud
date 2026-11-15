"use client";

import { useEffect } from "react";

/**
 * Registra el service worker (solo en producción, para no estorbar al
 * desarrollar) y le pasa los archivos que la página ya cargó, para que la app
 * abra sin red desde la primera visita.
 */
export default function RegistroSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        const enviar = () => {
          const urls = [
            location.pathname,
            ...performance.getEntriesByType("resource").map((e) => e.name),
            ...Array.from(document.images, (i) => i.currentSrc || i.src),
          ].filter((u) => u.startsWith("/") || u.startsWith(location.origin));
          reg.active?.postMessage({ tipo: "guardar", urls });
        };
        enviar();
        // Las imágenes de abajo pueden cargar después: una segunda pasada.
        setTimeout(enviar, 4000);
      })
      .catch(() => {
        // Sin service worker la app funciona igual, solo no abre sin red.
      });
  }, []);
  return null;
}
