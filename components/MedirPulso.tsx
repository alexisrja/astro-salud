"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { dedoCubriendo, ProcesadorPulso, SEGUNDOS_MINIMOS, type ResultadoPulso } from "@/lib/pulsoCamara";
import type { Astronauta } from "@/lib/tipos";
import Corazon from "./Corazon";

type Modo = "dedo" | "cara";
type Fase = "eligiendo" | "iniciando" | "midiendo" | "error";

interface Props {
  astronauta: Astronauta;
  /** Cada lectura confiable (o null cuando se pierde la señal). */
  onMedicion: (m: { fc: number; hrv: number | null } | null) => void;
  onCerrar: () => void;
}

const ANCHO = 64; // la imagen se reduce mucho: basta con el brillo promedio
const ALTO = 48;

/**
 * Sensor de pulso con la cámara. Panel flotante (no modal) para que se vea la
 * tarjeta del astronauta actualizándose en vivo mientras se mide.
 */
export default function MedirPulso({ astronauta, onMedicion, onCerrar }: Props) {
  const [modo, setModo] = useState<Modo | null>(null);
  const [fase, setFase] = useState<Fase>("eligiendo");
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoPulso | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [linterna, setLinterna] = useState(false);

  const video = useRef<HTMLVideoElement>(null);
  const lienzoOnda = useRef<HTMLCanvasElement>(null);
  const flujo = useRef<MediaStream | null>(null);
  const procesador = useRef(new ProcesadorPulso());
  const cuadro = useRef<number | null>(null);
  const onMedicionRef = useRef(onMedicion);
  useEffect(() => {
    onMedicionRef.current = onMedicion;
  }, [onMedicion]);

  const detener = useCallback(() => {
    if (cuadro.current !== null) cancelAnimationFrame(cuadro.current);
    cuadro.current = null;
    flujo.current?.getTracks().forEach((t) => t.stop());
    flujo.current = null;
  }, []);

  useEffect(() => detener, [detener]);

  const iniciar = async (m: Modo) => {
    setModo(m);
    setFase("iniciando");
    setError(null);
    procesador.current.reiniciar();
    setResultado(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setFase("error");
      setError("Este navegador no permite usar la cámara. Prueba en Chrome, en https o localhost.");
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: m === "dedo" ? "environment" : "user",
          width: { ideal: 320 },
          height: { ideal: 240 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });
      flujo.current = s;
      // Con el dedo, la linterna ilumina el tejido. No todos los equipos la tienen.
      let conLuz = false;
      if (m === "dedo") {
        try {
          await s.getVideoTracks()[0].applyConstraints({ advanced: [{ torch: true } as MediaTrackConstraintSet] });
          conLuz = true;
        } catch {
          conLuz = false;
        }
      }
      setLinterna(conLuz);
      const v = video.current!;
      v.srcObject = s;
      await v.play();
      setFase("midiendo");
      bucle(m);
    } catch (e) {
      setFase("error");
      const nombre = e instanceof DOMException ? e.name : "";
      setError(
        nombre === "NotAllowedError"
          ? "No se dio permiso para usar la cámara."
          : nombre === "NotFoundError"
            ? "No se encontró una cámara."
            : "No se pudo abrir la cámara.",
      );
    }
  };

  const bucle = (m: Modo) => {
    const lienzo = document.createElement("canvas");
    lienzo.width = ANCHO;
    lienzo.height = ALTO;
    const ctx = lienzo.getContext("2d", { willReadFrequently: true })!;
    let ultimoCalculo = 0;

    const paso = () => {
      const v = video.current;
      if (!v || !flujo.current) return;
      if (v.readyState >= 2) {
        ctx.drawImage(v, 0, 0, ANCHO, ALTO);
        // Cara: solo la frente (franja centrada arriba), que tiene piel y se mueve poco.
        const [x, y, w, h] = m === "cara" ? [ANCHO * 0.35, ALTO * 0.12, ANCHO * 0.3, ALTO * 0.18] : [0, 0, ANCHO, ALTO];
        const px = ctx.getImageData(Math.round(x), Math.round(y), Math.round(w), Math.round(h)).data;
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < px.length; i += 4) {
          r += px[i];
          g += px[i + 1];
          b += px[i + 2];
        }
        const n = px.length / 4;
        r /= n;
        g /= n;
        b /= n;
        const ahora = performance.now();
        // Más sangre = menos luz reflejada: se invierte para que el latido sea un pico.
        procesador.current.agregar(ahora, -(m === "dedo" ? r : g));

        if (ahora - ultimoCalculo > 400) {
          ultimoCalculo = ahora;
          const res = procesador.current.calcular();
          setResultado(res);
          if (m === "dedo" && !dedoCubriendo(r, g, b)) setAviso("Cubre por completo la cámara con la yema del dedo.");
          else if (m === "cara" && (g < 30 || g > 235)) setAviso("Busca una luz pareja sobre tu cara.");
          else setAviso(null);
          // Solo se manda la FC: la HRV de unos segundos de cámara es demasiado
          // inestable para disparar alertas (se muestra aquí como referencia).
          onMedicionRef.current(res.fc !== null ? { fc: res.fc, hrv: null } : null);
          dibujarOnda(lienzoOnda.current, res);
        }
      }
      cuadro.current = requestAnimationFrame(paso);
    };
    cuadro.current = requestAnimationFrame(paso);
  };

  const cerrar = () => {
    detener();
    onMedicionRef.current(null);
    onCerrar();
  };

  const progreso = resultado ? Math.min(1, resultado.segundos / SEGUNDOS_MINIMOS) : 0;
  const fc = resultado?.fc ?? null;

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="sensor-titulo"
      className="sensor fixed bottom-4 right-4 z-40 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-[3px] border border-borde bg-panel shadow-2xl shadow-black/60"
    >
      <header className="flex items-center justify-between gap-3 border-b border-borde px-4 py-3">
        <div>
          <p id="sensor-titulo" className="font-semibold">
            Pulso con cámara
          </p>
          <p className="text-xs text-tenue">{astronauta.nombre} · todo se procesa en este dispositivo</p>
        </div>
        <button
          type="button"
          onClick={cerrar}
          className="grid size-9 place-items-center rounded-[3px] border border-borde bg-panel-2 text-tenue hover:border-texto hover:text-texto focus-visible:outline-2 focus-visible:outline-acento"
          aria-label="Cerrar sensor"
        >
          <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
            <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <div className="space-y-4 p-4">
        {fase === "eligiendo" && (
          <div className="grid gap-2">
            <BotonModo
              titulo="Dedo en la cámara"
              detalle="Celular: tapa la cámara trasera con la yema del dedo. Más preciso."
              onClick={() => iniciar("dedo")}
            />
            <BotonModo
              titulo="Cara frente a la webcam"
              detalle="Sin tocar nada. Quédate quieto, con buena luz, 10 segundos."
              onClick={() => iniciar("cara")}
            />
          </div>
        )}

        <div className={fase === "midiendo" || fase === "iniciando" ? "relative" : "hidden"}>
          <video
            ref={video}
            muted
            playsInline
            className={`h-36 w-full rounded-[3px] bg-black object-cover ${modo === "cara" ? "-scale-x-100" : ""}`}
          />
          {modo === "cara" && (
            // Guía: dónde debe quedar la frente.
            <div
              className="pointer-events-none absolute rounded-[3px] border-2 border-dashed border-acento/80"
              style={{ left: "35%", top: "12%", width: "30%", height: "18%" }}
              aria-hidden
            />
          )}
          {fase === "iniciando" && (
            <p className="absolute inset-0 grid place-items-center text-sm text-tenue">Abriendo cámara…</p>
          )}
        </div>

        {fase === "midiendo" && (
          <>
            <div className="flex items-center gap-4">
              <Corazon fc={fc} color={fc ? "var(--color-rojo)" : "var(--color-tenue)"} className="size-12" />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-4xl font-semibold tabular-nums leading-none" aria-live="polite">
                  {fc ?? "--"}
                  <span className="ml-1 font-sans text-sm font-normal text-tenue">lpm</span>
                </p>
                <p className="mt-1 text-xs text-tenue">
                  {fc === null
                    ? progreso < 1
                      ? `Midiendo… ${Math.round(progreso * 100)} %`
                      : "Buscando un ritmo estable…"
                    : `Confianza ${Math.round((resultado?.calidad ?? 0) * 100)} %${resultado?.hrv ? ` · HRV aprox. ${resultado.hrv} ms` : ""}`}
                </p>
              </div>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-panel-2" aria-hidden>
              <div className="barra-meta h-full rounded-full bg-acento" style={{ width: `${progreso * 100}%` }} />
            </div>
            <canvas ref={lienzoOnda} width={640} height={120} className="h-16 w-full" aria-label="Onda del pulso" />
            {aviso && <p className="text-sm text-amarillo">{aviso}</p>}
            {modo === "dedo" && !linterna && (
              <p className="text-xs text-tenue">Este equipo no deja prender la linterna: busca una luz fuerte detrás del dedo.</p>
            )}
            {fc !== null && (
              <p className="text-xs text-verde">
                Enviando al panel: la tarjeta de {astronauta.nombre.split(" ")[0]} usa este pulso real.
              </p>
            )}
          </>
        )}

        {fase === "error" && (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-rojo">
              {error}
            </p>
            <button
              type="button"
              onClick={() => setFase("eligiendo")}
              className="min-h-9 rounded-[3px] border border-borde bg-panel-2 px-3 text-sm hover:border-texto"
            >
              Intentar de nuevo
            </button>
          </div>
        )}

        <p className="text-[11px] leading-snug text-tenue">
          Estimación por fotopletismografía, ilustrativa para el prototipo. No es un dispositivo médico.
        </p>
      </div>
    </section>
  );
}

function BotonModo({ titulo, detalle, onClick }: { titulo: string; detalle: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[3px] border border-borde bg-panel-2 p-3 text-left hover:border-texto focus-visible:outline-2 focus-visible:outline-acento"
    >
      <span className="block font-medium">{titulo}</span>
      <span className="mt-0.5 block text-sm text-tenue">{detalle}</span>
    </button>
  );
}

/** Dibuja los últimos segundos de la señal filtrada y marca los latidos. */
function dibujarOnda(lienzo: HTMLCanvasElement | null, r: ResultadoPulso) {
  if (!lienzo) return;
  const ctx = lienzo.getContext("2d");
  if (!ctx) return;
  const { width: w, height: h } = lienzo;
  ctx.clearRect(0, 0, w, h);
  const s = r.senal.slice(-150);
  if (s.length < 2) return;
  const max = Math.max(...s.map(Math.abs)) || 1;
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.strokeStyle = r.fc !== null ? "#ff5d6c" : "#8b98b3";
  ctx.beginPath();
  s.forEach((v, i) => {
    const x = (i / (s.length - 1)) * w;
    const y = h / 2 - (v / max) * (h / 2 - 6);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}
