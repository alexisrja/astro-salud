import type { Desviacion } from "@/lib/lineaBase";
import { evaluar, METRICAS, META_EJERCICIO } from "@/lib/salud";
import { ESCENARIOS, type Astronauta, type Escenario, type Lectura, type Nivel } from "@/lib/tipos";
import Corazon from "./Corazon";
import FotoAstronauta from "./FotoAstronauta";
import GotaOxigeno from "./GotaOxigeno";
import LunaSueno from "./LunaSueno";
import Sparkline from "./Sparkline";
import Termometro from "./Termometro";

export const COLOR: Record<Nivel, string> = {
  verde: "var(--color-verde)",
  amarillo: "var(--color-amarillo)",
  rojo: "var(--color-rojo)",
};

export const ETIQUETA: Record<Nivel, string> = {
  verde: "Estable",
  amarillo: "Precaución",
  rojo: "Crítico",
};

const TENUE = "var(--color-tenue)";

interface Props {
  astronauta: Astronauta;
  historial: Lectura[];
  escenario: Escenario;
  sinSenal: boolean;
  desviaciones: Desviacion[]; // métricas fuera del normal de este astronauta
  aprendiendo: boolean; // la línea base todavía junta datos
  pulsoReal: boolean; // el pulso viene de la cámara, no del simulador
  segundosDesde: number | null;
  onEscenario: (e: Escenario) => void;
  onAbrirFicha: () => void;
  /** Incidente simulado que afecta a este tripulante, si hay uno en curso. */
  incidente: string | null;
}

/**
 * Columna de un tripulante, como en la plantilla oficial de una misión: el
 * retrato arriba, una franja con su estado y debajo sus lecturas.
 */
export default function TarjetaAstronauta({
  astronauta,
  historial,
  escenario,
  sinSenal,
  desviaciones,
  aprendiendo,
  pulsoReal,
  segundosDesde,
  onEscenario,
  onAbrirFicha,
  incidente,
}: Props) {
  const ultima = historial.at(-1);
  const evaluacion = ultima ? evaluar(ultima) : null;
  const vigente = !!evaluacion && !sinSenal;
  // Desviaciones que todavía no rebasan un umbral: solo las ve la línea base.
  const soloBase = evaluacion
    ? desviaciones.filter((d) => !evaluacion.alertas.some((a) => a.metrica === d.metrica))
    : [];
  const vigilar = vigente && evaluacion.nivel === "verde" && soloBase.length > 0;
  const nivel: Nivel = vigilar ? "amarillo" : (evaluacion?.nivel ?? "verde");
  // Cada métrica fuera de su normal resta 5 puntos al índice.
  const indice = evaluacion ? Math.max(0, evaluacion.indice - (vigente ? soloBase.length * 5 : 0)) : 0;
  const color = vigente ? COLOR[nivel] : TENUE;
  const colorDe = (n: Nivel) => (sinSenal ? TENUE : COLOR[n]);
  const idSelect = `escenario-${astronauta.id}`;
  const estado = sinSenal ? "Sin señal" : !evaluacion ? "Esperando datos" : vigilar ? "Vigilar" : ETIQUETA[nivel];
  const vivo = <K extends keyof Lectura>(k: K) => (ultima && !sinSenal ? ultima[k] : null);

  const nFc = evaluacion?.porMetrica.fc ?? "verde";
  const nSpo2 = evaluacion?.porMetrica.spo2 ?? "verde";

  return (
    <article className="flex flex-col">
      {/* El botón está en el encabezado (un <h2> no puede ir dentro de un <button>) y su área
          se estira sobre el retrato con ::after, así toda la parte de arriba abre la ficha. */}
      <div className="group relative">
        <div className="relative overflow-hidden rounded-[3px]">
          <FotoAstronauta
            astronauta={astronauta}
            sizes="(min-width: 1280px) 22vw, (min-width: 768px) 45vw, 100vw"
            // En el teléfono, más apaisado para no ocupar toda la pantalla.
            aspecto="aspect-[5/4] md:aspect-[4/5]"
            className="transition-[filter] duration-200 group-hover:brightness-110"
          />
          {/* Franja de estado: el único color fuerte de la columna. */}
          <span
            className={`absolute inset-x-0 bottom-0 h-1.5 ${vigente && nivel === "rojo" ? "franja-critica" : ""}`}
            style={{ background: color }}
            aria-hidden
          />
        </div>
        <div className="mt-4 flex items-baseline justify-between gap-3">
          <h2 className="ancho-expandido text-xl font-semibold leading-tight tracking-tight">
            <button
              type="button"
              onClick={onAbrirFicha}
              aria-haspopup="dialog"
              className="text-left after:absolute after:inset-0 after:rounded-[3px] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-4 focus-visible:after:outline-acento"
            >
              {astronauta.nombre}
            </button>
          </h2>
          <span className="shrink-0 text-sm text-tenue underline-offset-4 group-hover:text-texto group-hover:underline" aria-hidden>
            Abrir ficha
          </span>
        </div>
        <p className="mt-1 text-sm text-tenue">{astronauta.rol}</p>
      </div>

      <p className="mt-3 flex items-baseline gap-2 text-sm" style={{ color }}>
        <span className="font-semibold">{estado}</span>
        {vigente && <span className="text-tenue">índice de salud {indice}</span>}
      </p>

      <div className="mt-5 grid grid-cols-2 gap-x-4 border-t border-borde pt-4">
        <Lectura
          icono={<Corazon fc={vivo("fc")} color={colorDe(nFc)} className="size-5" />}
          etiqueta="Pulso"
          insignia={pulsoReal ? "Cámara en vivo" : null}
          titulo="Frecuencia cardiaca"
          valor={ultima?.fc ?? null}
          unidad="lpm"
          color={colorDe(nFc)}
          serie={historial.map((l) => l.fc)}
        />
        <Lectura
          icono={<GotaOxigeno spo2={vivo("spo2")} color={colorDe(nSpo2)} className="size-5" />}
          etiqueta="Oxígeno"
          titulo="Oxígeno en sangre"
          valor={ultima?.spo2 ?? null}
          unidad="%"
          color={colorDe(nSpo2)}
          serie={historial.map((l) => l.spo2)}
        />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-borde pt-4 text-sm">
        {METRICAS.filter((m) => m.id !== "fc" && m.id !== "spo2").map((m) => {
          const n = evaluacion?.porMetrica[m.id] ?? "verde";
          const valor = ultima ? ultima[m.id] : null;
          const colorValor = sinSenal ? TENUE : n === "verde" ? undefined : COLOR[n];
          const colorIcono = sinSenal ? TENUE : n === "verde" ? TENUE : COLOR[n];
          return (
            <div key={m.id} className="min-w-0">
              <dt className="flex items-center gap-1.5 text-tenue">
                {m.id === "temp" && (
                  <Termometro temp={vivo("temp")} color={colorIcono} alerta={!sinSenal && n !== "verde"} className="size-4" />
                )}
                {m.id === "sueno" && <LunaSueno horas={vivo("sueno")} color={colorIcono} className="size-4" />}
                <span className="truncate">{m.etiqueta}</span>
              </dt>
              <dd className="ancho-condensado mt-0.5 text-lg font-semibold tabular-nums" style={{ color: colorValor }}>
                {valor === null ? "--" : valor.toFixed(m.decimales)}
                <span className="ml-1 text-xs font-normal text-tenue [font-variation-settings:'wdth'_100]">
                  {m.id === "ejercicio" ? `de ${META_EJERCICIO} ${m.unidad}` : m.unidad}
                </span>
              </dd>
              {m.id === "ejercicio" && (
                // Meta diaria: la barra muestra cuánto falta para los 120 minutos.
                <div className="mt-1.5 h-0.5 bg-borde" aria-hidden>
                  <div
                    className="barra-meta h-full bg-texto"
                    style={{ width: `${Math.min(100, ((valor ?? 0) / META_EJERCICIO) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </dl>

      {incidente && (
        <p className="mt-4 border-l-2 border-amarillo pl-3 text-sm">
          <span className="text-tenue">Simulando:</span> {incidente.toLowerCase()}
        </p>
      )}

      <ul className="mt-4 min-h-5 space-y-1 text-sm">
        {sinSenal ? (
          <li className="text-tenue">No llegan lecturas del reloj. Revisa la conexión.</li>
        ) : evaluacion && (evaluacion.alertas.length > 0 || soloBase.length > 0) ? (
          <>
            {evaluacion.alertas.map((a) => (
              <li key={a.metrica} style={{ color: COLOR[a.nivel] }}>
                {a.mensaje}
              </li>
            ))}
            {soloBase.map((d) => (
              <li key={`base-${d.metrica}`} className="aparece" style={{ color: COLOR.amarillo }}>
                ◆ {d.mensaje}
              </li>
            ))}
          </>
        ) : (
          <li className="text-tenue">Sin alertas.</li>
        )}
        {vigente && (aprendiendo || soloBase.length > 0) && (
          <li className="pt-1 text-xs text-tenue">
            {aprendiendo ? "Aprendiendo su normal…" : "◆ fuera de su normal personal, aunque siga dentro de los umbrales"}
          </li>
        )}
      </ul>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-5 text-xs text-tenue">
        <p>{segundosDesde === null ? "Sin lecturas todavía" : `Última lectura hace ${segundosDesde} s`}</p>
        <label className="flex items-center gap-2" htmlFor={idSelect}>
          Simular
          <select
            id={idSelect}
            value={escenario}
            onChange={(e) => onEscenario(e.target.value as Escenario)}
            className="min-h-9 rounded-[3px] border border-borde bg-fondo px-2 text-sm text-texto focus-visible:outline-2 focus-visible:outline-acento"
          >
            {ESCENARIOS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.etiqueta}
              </option>
            ))}
          </select>
        </label>
      </footer>
    </article>
  );
}

function Lectura({
  icono,
  etiqueta,
  insignia = null,
  titulo,
  valor,
  unidad,
  color,
  serie,
}: {
  icono: React.ReactNode;
  etiqueta: string;
  insignia?: string | null;
  titulo: string;
  valor: number | null;
  unidad: string;
  color: string;
  serie: number[];
}) {
  return (
    <div title={titulo}>
      <p className="flex items-center gap-2 text-sm text-tenue">
        {icono}
        {etiqueta}
      </p>
      {insignia && (
        <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-rojo">
          <span className="pulso inline-block size-1.5 rounded-full bg-rojo" aria-hidden />
          {insignia}
        </p>
      )}
      <p className="ancho-condensado mt-1 text-5xl font-bold leading-none tabular-nums" style={{ color }}>
        {valor ?? "--"}
        <span className="ml-1 text-sm font-normal text-tenue [font-variation-settings:'wdth'_100]">{unidad}</span>
      </p>
      <div className="mt-2">
        <Sparkline valores={serie} color={color} etiqueta={`Tendencia de ${titulo.toLowerCase()}`} />
      </div>
    </div>
  );
}
