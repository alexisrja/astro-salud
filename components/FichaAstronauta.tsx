"use client";

import { useEffect, useRef } from "react";
import { analiticaDe, ANTES, DESPUES, ESTUDIOS_OSDR, fueraDeRango } from "@/lib/analiticas";
import type { Desviacion } from "@/lib/lineaBase";
import type { Evaluacion } from "@/lib/salud";
import type { Astronauta, Nivel } from "@/lib/tipos";
import Corazon from "./Corazon";
import FotoAstronauta from "./FotoAstronauta";
import { COLOR, ETIQUETA } from "./TarjetaAstronauta";

interface Props {
  /** Último astronauta elegido: se mantiene al cerrar para que el contenido no desaparezca durante la animación. */
  astronauta: Astronauta | null;
  abierta: boolean;
  evaluacion: Evaluacion | null;
  fcActual: number | null;
  sinSenal: boolean;
  desviaciones: Desviacion[];
  onMedirPulso: () => void;
  onCerrar: () => void;
}

const formatoHoras = (h: number) => (Number.isInteger(h) ? `${h} h` : `${h.toFixed(1)} h`);

/**
 * Dosier del tripulante, centrado sobre el panel. Usa <dialog> nativo: atrapa
 * el foco, cierra con Escape y devuelve el foco a la columna que lo abrió.
 */
export default function FichaAstronauta({
  astronauta: a,
  abierta,
  evaluacion,
  fcActual,
  sinSenal,
  desviaciones,
  onMedirPulso,
  onCerrar,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierta && !d.open) d.showModal();
    if (!abierta && d.open) d.close();
  }, [abierta]);

  const vigente = !!evaluacion && !sinSenal;
  // Igual que en la columna: fuera de su normal sin umbral rebasado es "Vigilar".
  const soloBase = evaluacion
    ? desviaciones.filter((d) => !evaluacion.alertas.some((x) => x.metrica === d.metrica))
    : [];
  const vigilar = vigente && evaluacion.nivel === "verde" && soloBase.length > 0;
  const nivel: Nivel = vigilar ? "amarillo" : (evaluacion?.nivel ?? "verde");
  const indice = evaluacion ? Math.max(0, evaluacion.indice - (vigente ? soloBase.length * 5 : 0)) : 0;
  const color = vigente ? COLOR[nivel] : "var(--color-tenue)";
  const estado = sinSenal ? "Sin señal" : !evaluacion ? "Esperando datos" : vigilar ? "Vigilar" : ETIQUETA[nivel];

  return (
    <dialog
      ref={ref}
      className="ficha"
      aria-labelledby="ficha-nombre"
      onClose={onCerrar}
      // Clic en el fondo oscuro (fuera del dosier) lo cierra.
      onClick={(e) => e.target === e.currentTarget && ref.current?.close()}
    >
      {a && (
        <div className="grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          {/* El retrato se queda fijo arriba mientras se desplazan los datos. */}
          <div className="relative md:sticky md:top-0 md:self-start">
            <FotoAstronauta
              astronauta={a}
              alt={`Retrato de ${a.nombre}`}
              sizes="(max-width: 768px) 100vw, 400px"
              aspecto="aspect-[5/4] md:aspect-[4/5]"
            />
            <span className="absolute inset-x-0 bottom-0 h-1.5" style={{ background: color }} aria-hidden />
          </div>

          <div className="flex flex-col gap-7 p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="ficha-nombre" className="ancho-expandido text-3xl font-semibold leading-tight tracking-tight">
                  {a.nombre}
                </h2>
                <p className="mt-1 text-tenue">
                  {a.rol}. Indicativo por radio: {a.indicativo}
                </p>
              </div>
              <button
                type="button"
                onClick={() => ref.current?.close()}
                className="grid size-10 shrink-0 place-items-center rounded-[3px] border border-borde text-tenue hover:border-texto hover:text-texto focus-visible:outline-2 focus-visible:outline-acento"
                aria-label="Cerrar ficha"
                title="Cerrar (Esc)"
              >
                <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
                  <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-5 border-y border-borde py-5">
              <Corazon fc={sinSenal ? null : fcActual} color={color} className="size-12" />
              <div>
                <p className="ancho-condensado text-6xl font-bold leading-none tabular-nums" style={{ color }}>
                  {fcActual !== null && !sinSenal ? fcActual : "--"}
                  <span className="ml-2 text-base font-normal text-tenue [font-variation-settings:'wdth'_100]">
                    lpm ahora
                  </span>
                </p>
                <p className="mt-2 text-sm" style={{ color }}>
                  <span className="font-semibold">{estado}</span>
                  {vigente && <span className="text-tenue">, índice de salud {indice} de 100</span>}
                </p>
              </div>
              <button
                type="button"
                onClick={onMedirPulso}
                className="ml-auto min-h-10 rounded-[3px] border border-texto px-3 text-sm font-medium hover:bg-texto hover:text-fondo focus-visible:outline-2 focus-visible:outline-acento"
              >
                Medir con cámara
              </button>
            </div>

            {desviaciones.length > 0 && !sinSenal && (
              <section aria-labelledby="ficha-normal" className="border-l-2 border-amarillo pl-4">
                <h3 id="ficha-normal" className="text-sm font-semibold text-amarillo">
                  Fuera de su normal
                </h3>
                <ul className="mt-1 space-y-1 text-sm">
                  {desviaciones.map((d) => (
                    <li key={d.metrica}>◆ {d.mensaje}</li>
                  ))}
                </ul>
              </section>
            )}

            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
              <Dato termino="Edad" valor={`${a.edad} años`} />
              <Dato termino="Grupo sanguíneo" valor={a.grupoSanguineo} />
              <Dato termino="Pulso en reposo" valor={`${a.fcReposo} lpm`} />
              <Dato termino="País" valor={a.pais} />
              <Dato termino="Especialidad" valor={a.especialidad} />
              <Dato termino="Días en esta misión" valor={String(a.diasEnMision)} />
              <Dato termino="Misiones previas" valor={a.misionesPrevias === 0 ? "Ninguna" : String(a.misionesPrevias)} />
              <Dato termino="Paseos espaciales" valor={a.horasEva === 0 ? "Ninguno" : formatoHoras(a.horasEva)} />
              <Dato termino="Alergias" valor={a.alergias} />
              <Dato termino="Agencia" valor={a.agencia} ancho />
            </dl>

            <section aria-labelledby="ficha-nota" className="border-t border-borde pt-5">
              <h3 id="ficha-nota" className="text-sm text-tenue">
                Nota médica
              </h3>
              <p className="mt-1 max-w-prose leading-relaxed">{a.notaMedica}</p>
            </section>

            <AnalisisSangre tripulante={a.analiticaOsdr} />
          </div>
        </div>
      )}
    </dialog>
  );
}

function Dato({ termino, valor, ancho = false }: { termino: string; valor: string; ancho?: boolean }) {
  return (
    <div className={ancho ? "col-span-2 sm:col-span-3" : ""}>
      <dt className="text-tenue">{termino}</dt>
      <dd className="mt-0.5 text-base">{valor}</dd>
    </div>
  );
}

/** Análisis de sangre reales de Inspiration4 (NASA OSDR): antes del vuelo y al volver. */
function AnalisisSangre({ tripulante }: { tripulante: string }) {
  const marcadores = analiticaDe(tripulante);
  if (!marcadores) return null;
  const fuera = marcadores.filter(
    (m) => fueraDeRango(m.valores[ANTES], m.min, m.max) || fueraDeRango(m.valores[DESPUES], m.min, m.max),
  ).length;

  return (
    <section aria-labelledby="ficha-sangre" className="border-t border-borde pt-5">
      <h3 id="ficha-sangre" className="ancho-expandido text-lg font-semibold">
        Análisis de sangre
      </h3>
      <p className="mt-1 max-w-prose text-sm text-tenue">
        Datos reales del tripulante {tripulante} de Inspiration4, la misión civil de SpaceX de 2021 (3 días en
        órbita), publicados por la NASA. Comparan la muestra de 3 días antes del lanzamiento con la del día siguiente
        al aterrizaje. {fuera === 0 ? "Todo dentro de rango." : `${fuera} ${fuera === 1 ? "marcador sale" : "marcadores salen"} del rango del laboratorio.`}
      </p>

      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="text-left text-tenue">
            <th scope="col" className="pb-2 font-normal">Marcador</th>
            <th scope="col" className="pb-2 text-right font-normal">Antes</th>
            <th scope="col" className="pb-2 text-right font-normal">Al volver</th>
            <th scope="col" className="hidden pb-2 text-right font-normal sm:table-cell">Rango</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borde">
          {marcadores.map((m) => (
            <tr key={m.id}>
              <th scope="row" className="py-2 text-left font-normal">
                {m.nombre} <span className="text-tenue">{m.unidad}</span>
              </th>
              <Valor valor={m.valores[ANTES]} min={m.min} max={m.max} />
              <Valor valor={m.valores[DESPUES]} min={m.min} max={m.max} />
              <td className="ancho-condensado hidden py-2 text-right tabular-nums text-tenue sm:table-cell">
                {m.min ?? "?"}–{m.max ?? "?"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-3 text-xs text-tenue">
        Fuente: NASA Open Science Data Repository,{" "}
        {ESTUDIOS_OSDR.map((e, i) => (
          <span key={e.id}>
            {i > 0 && " y "}
            <a href={e.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-texto">
              {e.id} ({e.titulo.toLowerCase()})
            </a>
          </span>
        ))}
        .
      </p>
    </section>
  );
}

function Valor({ valor, min, max }: { valor: number | null; min: number | null; max: number | null }) {
  const fuera = fueraDeRango(valor, min, max);
  return (
    <td
      className="ancho-condensado py-2 text-right text-base font-semibold tabular-nums"
      style={fuera ? { color: "var(--color-amarillo)" } : undefined}
    >
      {valor ?? "--"}
      {fuera && <span className="ml-1 text-xs font-normal [font-variation-settings:'wdth'_100]">{fuera}</span>}
    </td>
  );
}
