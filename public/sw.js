/*
 * Service worker de Órbita Vital: deja la app lista para abrir sin red.
 *
 * - La página se pide primero a la red (para tener la versión nueva) y, si no
 *   hay red, se sirve la última copia guardada.
 * - Los archivos con nombre único (/_next/static, fotos, íconos) se sirven
 *   desde la copia guardada y solo se piden a la red la primera vez.
 * - Al cargar, la página le pasa la lista de archivos que usó para guardarlos
 *   todos desde la primera visita.
 */
const VERSION = "orbita-vital-v1"; // súbelo para invalidar la copia guardada
const ESENCIALES = ["/", "/manifest.webmanifest", "/icono-192.png", "/icono-512.png"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(ESENCIALES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const inmutable = (url) =>
  url.pathname.startsWith("/_next/static/") ||
  url.pathname.startsWith("/_next/image") ||
  url.pathname.startsWith("/astronautas/") ||
  /\.(png|jpg|jpeg|webp|svg|woff2?|ico)$/.test(url.pathname);

self.addEventListener("fetch", (evento) => {
  const peticion = evento.request;
  if (peticion.method !== "GET") return;
  const url = new URL(peticion.url);
  if (url.origin !== self.location.origin) return; // Supabase y otros: siempre a la red

  if (peticion.mode === "navigate") {
    evento.respondWith(
      fetch(peticion)
        .then((r) => {
          const copia = r.clone();
          if (r.ok) caches.open(VERSION).then((c) => c.put("/", copia));
          return r;
        })
        .catch(() => caches.match("/", { ignoreVary: true }).then((r) => r || Response.error())),
    );
    return;
  }

  if (inmutable(url)) {
    evento.respondWith(
      caches.match(peticion, { ignoreVary: true }).then(
        (guardada) =>
          guardada ||
          fetch(peticion).then((r) => {
            const copia = r.clone();
            if (r.ok) caches.open(VERSION).then((c) => c.put(peticion, copia));
            return r;
          }),
      ),
    );
    return;
  }

  // Lo demás: red primero, copia guardada si no hay red.
  evento.respondWith(
    fetch(peticion)
      .then((r) => {
        const copia = r.clone();
        if (r.ok) caches.open(VERSION).then((c) => c.put(peticion, copia));
        return r;
      })
      .catch(() => caches.match(peticion, { ignoreVary: true }).then((r) => r || Response.error())),
  );
});

// La página manda la lista de archivos que ya cargó para guardarlos.
self.addEventListener("message", (evento) => {
  const datos = evento.data;
  if (!datos || datos.tipo !== "guardar" || !Array.isArray(datos.urls)) return;
  const propias = datos.urls.filter((u) => {
    try {
      return new URL(u, self.location.origin).origin === self.location.origin;
    } catch {
      return false;
    }
  });
  evento.waitUntil(
    caches.open(VERSION).then((c) =>
      Promise.all(propias.map((u) => c.match(u, { ignoreVary: true }).then((ya) => ya || c.add(u).catch(() => undefined)))),
    ),
  );
});
