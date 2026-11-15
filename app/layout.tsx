import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import RegistroSW from "@/components/RegistroSW";
import "./globals.css";

// Una sola familia con eje de anchura: expandida para la marca y los nombres (como la cinta
// bordada del mono de vuelo), condensada para las cifras (como lecturas de instrumento).
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--fuente-archivo" });

export const metadata: Metadata = {
  title: "Órbita Vital | Salud de la tripulación",
  description: "Monitoreo de la salud de astronautas con detección a bordo, sin depender de la Tierra",
  appleWebApp: { capable: true, title: "Órbita Vital", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#000000" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`h-full antialiased ${archivo.variable}`}>
      <body className="min-h-full">
        {children}
        <RegistroSW />
      </body>
    </html>
  );
}
