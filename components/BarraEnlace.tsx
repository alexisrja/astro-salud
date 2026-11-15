import { RETRASO_MARTE_MIN, type EstadoEnlace } from "@/lib/enlace";

interface Props {
  enlace: EstadoEnlace;
  apagon: boolean; // simulado o real (sin internet)
  sinInternet: boolean;
  restaurado: number | null; // cuándo se guardó lo que se recuperó al abrir
  onAlternar: () => void;
}

const hora = (ms: number) => new Date(ms).toISOString().slice(11, 19);

/**
 * Estado del enlace con la Tierra. El mensaje central de la demo: aunque se
 * corte la comunicación, la detección sigue a bordo y los resúmenes esperan en cola.
 */
export default function BarraEnlace({ enlace, apagon, sinInternet, restaurado, onAlternar }: Props) {
  const color = apagon ? "var(--color-rojo)" : "var(--color-verde)";
  return (
    <section
      aria-label="Enlace con la Tierra"
      className={`-mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-[3px] border px-4 py-3 transition-colors ${apagon ? "enlace-apagon" : ""}`}
      style={{ borderColor: apagon ? "var(--color-rojo)" : "var(--color-borde)" }}
    >
      <div className="flex items-center gap-3">
        <Antena color={color} activa={!apagon} />
        <div>
          <p className="text-xs text-tenue">Enlace con la Tierra</p>
          <p className="font-semibold" style={{ color }} aria-live="polite">
            {apagon ? (sinInternet ? "Sin internet" : "Apagón de comunicaciones") : "Conectado"}
          </p>
        </div>
      </div>

      <p className="min-w-0 flex-1 text-sm text-tenue">
        {apagon ? (
          <>
            <span className="text-texto">La detección sigue funcionando a bordo.</span>{" "}
            {enlace.cola.length} {enlace.cola.length === 1 ? "resumen espera" : "resúmenes esperan"} en cola.
          </>
        ) : (
          <>
            Retraso de la señal ~{RETRASO_MARTE_MIN} min · {enlace.enviados}{" "}
            {enlace.enviados === 1 ? "resumen enviado" : "resúmenes enviados"}
            {enlace.ultimoEnvio !== null && <> · último {hora(enlace.ultimoEnvio)} UTC</>}
          </>
        )}
        <span className="block text-xs">
          {restaurado !== null
            ? `Memoria del dispositivo: se recuperó lo aprendido (guardado ${hora(restaurado)} UTC).`
            : "Memoria del dispositivo activa: lo aprendido sobrevive a un reinicio."}
        </span>
      </p>

      <button
        type="button"
        onClick={onAlternar}
        disabled={sinInternet && !enlace.apagon}
        className="min-h-10 rounded-[3px] border border-borde bg-panel-2 px-3 text-sm font-medium hover:border-texto focus-visible:outline-2 focus-visible:outline-acento disabled:cursor-not-allowed disabled:opacity-50"
      >
        {enlace.apagon ? "Restablecer enlace" : "Simular apagón"}
      </button>
    </section>
  );
}

function Antena({ color, activa }: { color: string; activa: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
      <path d="M8 26h16M16 26V15" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="13" r="2.5" fill={color} />
      <g className={activa ? "ondas" : ""} stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" opacity={activa ? 1 : 0.35}>
        <path d="M11 8a7 7 0 0 0 0 10M21 8a7 7 0 0 1 0 10" />
        <path d="M7 4.5a12 12 0 0 0 0 17M25 4.5a12 12 0 0 1 0 17" />
      </g>
      {!activa && <path d="M6 6l20 20" stroke={color} strokeWidth="2.2" strokeLinecap="round" />}
    </svg>
  );
}
