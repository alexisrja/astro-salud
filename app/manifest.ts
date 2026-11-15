import type { MetadataRoute } from "next";

// Instalable como app: abre a pantalla completa y funciona sin red (ver public/sw.js).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Órbita Vital",
    short_name: "Órbita Vital",
    description: "Monitoreo de salud de la tripulación, con detección a bordo y sin depender de la Tierra",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    lang: "es",
    icons: [
      { src: "/icono-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icono-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icono-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
