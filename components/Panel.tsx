"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as almacen from "@/lib/almacen";
import { cambiarApagon, enlaceInicial, registrar, restaurarEnlace, type EstadoEnlace } from "@/lib/enlace";
import { esperaHastaSiguiente, planificar, type EstadoIncidente, type Incidente } from "@/lib/incidentes";
import { LineaBase, type Desviacion } from "@/lib/lineaBase";
import { evaluar, METRICAS, peorNivel } from "@/lib/salud";
import { Simulador } from "@/lib/simulador";
import { supabase } from "@/lib/supabase";
import { ASTRONAUTAS, type Escenario, type Lectura, type Nivel } from "@/lib/tipos";
import BarraEnlace from "./BarraEnlace";
import FichaAstronauta from "./FichaAstronauta";
import MedirPulso from "./MedirPulso";
import TarjetaAstronauta, { COLOR, ETIQUETA } from "./TarjetaAstronauta";

const MAX_PUNTOS = 60; // lecturas guardadas por astronauta para las gráficas
const INTERVALO_MS = 2000;
const SEGUNDOS_SIN_SENAL = 10;
const RESUMEN_CADA_MS = 15_000; // cada cuánto se arma un resumen para la Tierra
const GUARDAR_CADA_MS = 5_000;
const VIGENCIA_GUARDADO_MS = 12 * 60 * 60 * 1000; // lo guardado hace más de 12 h se descarta
// La misión empezó con la llegada de la comandante: su contador marca el día.
const MAX_BITACORA = 6; // incidentes que se muestran en la bitácora
const horaUTC = (ms: number) => new Date(ms).toISOString().slice(11, 19);
const DIA_DE_MISION = Math.max(...ASTRONAUTAS.map((a) => a.diasEnMision));

type Historial = Record<string, Lectura[]>;
type Escenarios = Record<string, Escenario>;

/** Lo que se guarda en el dispositivo para sobrevivir a un reinicio. */
interface Guardado {
  version: number;
  guardado: number;
  historial: Historial;
  lineaBase: unknown;
  enlace: unknown;
}

const historialVacio = (): Historial => Object.fromEntries(ASTRONAUTAS.map((a) => [a.id, []]));
const escenariosIniciales = (): Escenarios => Object.fromEntries(ASTRONAUTAS.map((a) => [a.id, "normal"]));

function agregar(h: Historial, nuevas: Lectura[]): Historial {
  const copia = { ...h };
  for (const l of nuevas) {
    const lista = copia[l.astronauta_id];
    if (!lista) continue;
    const t = Date.parse(l.creado_en);
    const ultima = lista.at(-1);
    // Caso normal: la lectura es más reciente que la última y va al final.
    if (!ultima || t > Date.parse(ultima.creado_en)) {
      copia[l.astronauta_id] = [...lista, l].slice(-MAX_PUNTOS);
      continue;
    }
    // Llegó fuera de orden (carga inicial tras una lectura en vivo): se descarta
    // si ya está y, si no, se inserta en su lugar.
    if (lista.some((x) => Date.parse(x.creado_en) === t)) continue;
    copia[l.astronauta_id] = [...lista, l]
      .sort((a, b) => Date.parse(a.creado_en) - Date.parse(b.creado_en))
      .slice(-MAX_PUNTOS);
  }
  return copia;
}

// Supabase puede devolver columnas numeric como texto: se normalizan aquí.
function normalizar(f: Record<string, unknown>): Lectura {
  return {
    astronauta_id: String(f.astronauta_id),
    fc: Number(f.fc),
    spo2: Number(f.spo2),
    temp: Number(f.temp),
    hrv: Number(f.hrv),
    sueno: Number(f.sueno),
    ejercicio: Number(f.ejercicio),
    creado_en: String(f.creado_en),
  };
}

export default function Panel() {
  const modoDemo = supabase === null;
  const [historial, setHistorial] = useState<Historial>(historialVacio);
  const [escenarios, setEscenarios] = useState<Escenarios>(escenariosIniciales);
  // Hora local en que llegó la última lectura en vivo de cada astronauta. Evita
  // comparar el reloj del navegador con el de quien generó la lectura.
  const [recibido, setRecibido] = useState<Record<string, number>>({});
  const [ahora, setAhora] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // El id se conserva al cerrar para que la ficha mantenga su contenido mientras sale.
  const [ficha, setFicha] = useState<{ id: string; abierta: boolean } | null>(null);
  // Incidentes simulados automáticamente cada cierto tiempo (activos por defecto).
  const [autoIncidentes, setAutoIncidentes] = useState(true);
  const [bitacora, setBitacora] = useState<Incidente[]>([]);
  const idIncidente = useRef(0);
  const ultimoIncidente = useRef<Incidente | null>(null);
  const sim = useRef<Simulador | null>(null);

  // Línea base personal de cada astronauta: aprende su normal a bordo.
  const lineaBase = useRef(new LineaBase());
  const [desviaciones, setDesviaciones] = useState<Record<string, Desviacion[]>>({});
  const [aprendiendo, setAprendiendo] = useState<Record<string, boolean>>({});

  // Enlace con la Tierra: el apagón puede ser simulado o real (sin internet).
  const [enlace, setEnlace] = useState<EstadoEnlace>(enlaceInicial);
  const [sinInternet, setSinInternet] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [restaurado, setRestaurado] = useState<number | null>(null);

  // Pulso medido con la cámara: sustituye al simulado de ese astronauta.
  const [camara, setCamara] = useState<string | null>(null);
  const [conPulsoReal, setConPulsoReal] = useState<string | null>(null);

  // Pasa lecturas nuevas por la línea base, una vez y en orden de llegada.
  // Se llama fuera de los actualizadores de estado (que React puede repetir).
  const procesar = useCallback((lecturas: Lectura[]) => {
    const lb = lineaBase.current;
    const nuevas: Record<string, Desviacion[]> = {};
    const aprende: Record<string, boolean> = {};
    for (const l of lecturas) {
      nuevas[l.astronauta_id] = lb.actualizar(l);
      aprende[l.astronauta_id] = lb.aprendiendo(l.astronauta_id);
    }
    setDesviaciones((d) => ({ ...d, ...nuevas }));
    setAprendiendo((a) => ({ ...a, ...aprende }));
  }, []);

  // Reloj: también sirve para detectar relojes que dejaron de transmitir.
  useEffect(() => {
    // La hora no puede calcularse al renderizar (el HTML del servidor no coincidiría).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAhora(Date.now());
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Modo demo: el simulador corre en el navegador. Antes de arrancar se
  // recupera lo guardado en el dispositivo, así un reinicio no borra lo aprendido.
  useEffect(() => {
    if (!modoDemo) return;
    let activo = true;
    let t: ReturnType<typeof setInterval> | undefined;
    const s = new Simulador();
    sim.current = s;

    (async () => {
      const g = await almacen.cargar<Guardado>();
      if (!activo) return;
      const vigente =
        g && g.version === almacen.VERSION_DATOS && Date.now() - g.guardado < VIGENCIA_GUARDADO_MS && g.historial;
      let inicial = historialVacio();
      if (vigente) {
        lineaBase.current.importar(g.lineaBase);
        setEnlace(restaurarEnlace(g.enlace));
        inicial = agregar(inicial, Object.values(g.historial).flat());
        setRestaurado(g.guardado);
      } else {
        // Unos segundos de historia para que las gráficas no empiecen vacías.
        const semilla: Lectura[] = [];
        for (let i = 20; i > 0; i--) {
          const lecturas = s.tick(new Date(Date.now() - i * INTERVALO_MS));
          semilla.push(...lecturas);
          inicial = agregar(inicial, lecturas);
        }
        procesar(semilla);
      }
      setHistorial(inicial);
      // tick() muta el simulador: se llama fuera del actualizador, que React
      // puede ejecutar dos veces en modo estricto.
      t = setInterval(() => {
        const lecturas = s.tick();
        procesar(lecturas);
        setHistorial((h) => agregar(h, lecturas));
      }, INTERVALO_MS);
    })();

    return () => {
      activo = false;
      clearInterval(t);
    };
  }, [modoDemo, procesar]);

  // Guardar en el dispositivo cada pocos segundos y al ocultar la pestaña.
  const paraGuardar = useRef<{ historial: Historial; enlace: EstadoEnlace }>({ historial: {}, enlace: enlaceInicial() });
  useEffect(() => {
    paraGuardar.current = { historial, enlace };
  }, [historial, enlace]);
  useEffect(() => {
    if (!modoDemo) return;
    const guardarAhora = () => {
      const { historial: h, enlace: e } = paraGuardar.current;
      if (!Object.values(h).some((l) => l.length)) return;
      const datos: Guardado = {
        version: almacen.VERSION_DATOS,
        guardado: Date.now(),
        historial: h,
        lineaBase: lineaBase.current.exportar(),
        enlace: e,
      };
      void almacen.guardar(datos);
    };
    const t = setInterval(guardarAhora, GUARDAR_CADA_MS);
    const alOcultar = () => document.visibilityState === "hidden" && guardarAhora();
    document.addEventListener("visibilitychange", alOcultar);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", alOcultar);
    };
  }, [modoDemo]);

  // Internet real: si se cae, también es un apagón con la Tierra.
  useEffect(() => {
    const actualizar = () => setSinInternet(!navigator.onLine);
    actualizar();
    window.addEventListener("online", actualizar);
    window.addEventListener("offline", actualizar);
    return () => {
      window.removeEventListener("online", actualizar);
      window.removeEventListener("offline", actualizar);
    };
  }, []);

  // Modo Supabase: historia reciente + lecturas nuevas por Realtime.
  useEffect(() => {
    if (!supabase) return;
    const cliente = supabase;
    let activo = true;

    (async () => {
      const { data, error } = await cliente
        .from("lecturas")
        .select("*")
        .order("creado_en", { ascending: false })
        .limit(MAX_PUNTOS * ASTRONAUTAS.length);
      if (!activo) return;
      if (error) return setError(`No se pudo leer la tabla lecturas: ${error.message}`);
      const previas = (data ?? []).reverse().map(normalizar);
      procesar(previas);
      setHistorial((h) => agregar(h, previas));

      const esc = await cliente.from("escenarios").select("astronauta_id, escenario");
      if (activo && esc.data) {
        setEscenarios((e) => ({
          ...e,
          ...Object.fromEntries(esc.data.map((f) => [f.astronauta_id, f.escenario as Escenario])),
        }));
      }
    })();

    const canal = cliente
      .channel("lecturas-en-vivo")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "lecturas" }, (p) => {
        const lectura = normalizar(p.new);
        const llegada = Date.now();
        setRecibido((r) => ({ ...r, [lectura.astronauta_id]: llegada }));
        procesar([lectura]);
        setHistorial((h) => agregar(h, [lectura]));
      })
      // Escenarios cambiados desde otro panel abierto.
      .on("postgres_changes", { event: "*", schema: "public", table: "escenarios" }, (p) => {
        const f = p.new as { astronauta_id?: string; escenario?: Escenario };
        const { astronauta_id, escenario } = f;
        if (astronauta_id && escenario) setEscenarios((e) => ({ ...e, [astronauta_id]: escenario }));
      })
      .subscribe((estado) => {
        if (estado === "CHANNEL_ERROR" || estado === "TIMED_OUT") {
          setError("Se perdió la conexión en tiempo real con Supabase.");
        } else if (estado === "SUBSCRIBED") {
          setError(null);
        }
      });

    return () => {
      activo = false;
      cliente.removeChannel(canal);
    };
  }, [procesar]);

  const cambiarEscenario = useCallback(async (id: string, escenario: Escenario) => {
    const previo = escenarios[id];
    setEscenarios((e) => ({ ...e, [id]: escenario }));
    if (!supabase) {
      sim.current?.setEscenario(id, escenario);
      return;
    }
    const { error } = await supabase
      .from("escenarios")
      .upsert({ astronauta_id: id, escenario, actualizado_en: new Date().toISOString() });
    if (error) {
      // El cambio no se guardó: el selector vuelve al valor anterior.
      setEscenarios((e) => ({ ...e, [id]: previo }));
      setError(`No se pudo cambiar el escenario: ${error.message}`);
    }
  }, [escenarios]);

  // Los temporizadores de incidentes usan siempre la versión más reciente de cambiarEscenario.
  const cambiarRef = useRef(cambiarEscenario);
  useEffect(() => {
    cambiarRef.current = cambiarEscenario;
  }, [cambiarEscenario]);

  const enCurso = bitacora.find((i) => i.estado === "en-curso") ?? null;

  const iniciarIncidente = useCallback(() => {
    idIncidente.current += 1;
    const ids = ASTRONAUTAS.map((a) => a.id);
    const inc = planificar(Math.random, Date.now(), ids, idIncidente.current, ultimoIncidente.current ?? undefined);
    ultimoIncidente.current = inc;
    setBitacora((b) => [inc, ...b].slice(0, MAX_BITACORA));
    cambiarRef.current(inc.astronautaId, inc.tipo.escenario);
  }, []);

  const terminarIncidente = useCallback(
    (inc: Incidente, estado: Exclude<EstadoIncidente, "en-curso">, volverANormal = true) => {
      const ahora = Date.now();
      setBitacora((b) => b.map((i) => (i.id === inc.id ? { ...i, estado, fin: ahora } : i)));
      if (volverANormal) cambiarRef.current(inc.astronautaId, "normal");
    },
    [],
  );

  // Programa el siguiente incidente o el final del que está en curso.
  useEffect(() => {
    if (!autoIncidentes) return;
    if (enCurso) {
      const t = setTimeout(() => terminarIncidente(enCurso, "resuelto"), Math.max(0, enCurso.fin - Date.now()));
      return () => clearTimeout(t);
    }
    const t = setTimeout(iniciarIncidente, esperaHastaSiguiente(Math.random, bitacora.length === 0));
    return () => clearTimeout(t);
  }, [autoIncidentes, enCurso, bitacora.length, iniciarIncidente, terminarIncidente]);

  const alternarIncidentes = () => {
    if (autoIncidentes && enCurso) terminarIncidente(enCurso, "detenido");
    setAutoIncidentes((a) => !a);
  };

  // Un cambio manual en el astronauta afectado detiene el incidente simulado.
  const elegirEscenario = (id: string, escenario: Escenario) => {
    if (enCurso?.astronautaId === id) terminarIncidente(enCurso, "detenido", false);
    cambiarEscenario(id, escenario);
  };

  const restablecer = () => {
    if (enCurso) terminarIncidente(enCurso, "detenido", false);
    ASTRONAUTAS.forEach((a) => cambiarEscenario(a.id, "normal"));
  };

  // Pulso de la cámara hacia el simulador (modo demo) o hacia Supabase.
  const recibirPulso = useCallback((id: string, m: { fc: number; hrv: number | null } | null) => {
    sim.current ??= new Simulador();
    sim.current.setReal(id, m);
    setConPulsoReal(m ? id : null);
  }, []);
  // En modo Supabase este panel envía las lecturas del astronauta medido.
  useEffect(() => {
    const s = sim.current;
    if (!supabase || !conPulsoReal || !s) return;
    const cliente = supabase;
    const t = setInterval(async () => {
      const lecturas = s.tick().filter((l) => l.astronauta_id === conPulsoReal);
      const { error } = await cliente.from("lecturas").insert(lecturas);
      if (error) setError(`No se pudo enviar el pulso medido: ${error.message}`);
    }, INTERVALO_MS);
    return () => clearInterval(t);
  }, [conPulsoReal]);

  const apagonEfectivo = enlace.apagon || sinInternet;
  const alternarApagon = () => {
    const { estado, enviadosAhora } = cambiarApagon(enlace, !enlace.apagon, Date.now());
    setEnlace(estado);
    if (!estado.apagon && !sinInternet) {
      setAviso(
        enviadosAhora > 0
          ? `Enlace recuperado: ${enviadosAhora} ${enviadosAhora === 1 ? "resumen enviado" : "resúmenes enviados"} a la Tierra.`
          : "Enlace recuperado.",
      );
    } else {
      setAviso(null);
    }
  };
  // Si vuelve el internet real y no hay apagón simulado, se vacía la cola.
  useEffect(() => {
    if (sinInternet || enlace.apagon || enlace.cola.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnlace((e) => cambiarApagon({ ...e, apagon: true }, false, Date.now()).estado);
  }, [sinInternet, enlace.apagon, enlace.cola.length]);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 6000);
    return () => clearTimeout(t);
  }, [aviso]);


  // Estado de cada astronauta a partir de su última lectura.
  const estados = ASTRONAUTAS.map((a) => {
    const ultima = historial[a.id].at(-1);
    // Se prefiere la hora de llegada local; `creado_en` solo se usa para la
    // historia cargada al abrir, antes de que llegue una lectura en vivo.
    const referencia = recibido[a.id] ?? (ultima ? Date.parse(ultima.creado_en) : null);
    const segundosDesde =
      referencia !== null && ahora !== null ? Math.max(0, Math.round((ahora - referencia) / 1000)) : null;
    const sinSenal = segundosDesde !== null && segundosDesde > SEGUNDOS_SIN_SENAL;
    return { astronauta: a, ultima, segundosDesde, sinSenal, evaluacion: ultima ? evaluar(ultima) : null };
  });

  const conDatos = estados.filter((e) => e.evaluacion && !e.sinSenal);
  // Fuera de su normal cuenta como precaución aunque los umbrales digan verde.
  const desvDe = (id: string) => desviaciones[id] ?? [];
  const nivelDe = (e: (typeof estados)[number]): Nivel =>
    e.evaluacion!.nivel === "verde" && desvDe(e.astronauta.id).length > 0 ? "amarillo" : e.evaluacion!.nivel;
  const nivelTripulacion: Nivel = peorNivel(conDatos.map(nivelDe));
  const tendencias = conDatos.filter((e) => e.evaluacion!.nivel !== "rojo" && desvDe(e.astronauta.id).length > 0);
  const etiquetaMetrica = (id: string) => METRICAS.find((m) => m.id === id)?.etiqueta.toLowerCase() ?? id;
  const alertas = conDatos.flatMap((e) =>
    e.evaluacion!.alertas.map((a) => ({ ...a, nombre: e.astronauta.nombre, id: `${e.astronauta.id}-${a.metrica}` })),
  );
  const criticas = alertas.filter((a) => a.nivel === "rojo");

  // Resumen periódico para la Tierra: solo el estado general, no los datos crudos.
  const resumenActual = useRef<{ nivel: Nivel; texto: string } | null>(null);
  useEffect(() => {
    resumenActual.current =
      conDatos.length === 0
        ? null
        : {
            nivel: nivelTripulacion,
            texto: [
              `Tripulación ${ETIQUETA[nivelTripulacion].toLowerCase()}`,
              ...criticas.map((a) => `${a.nombre}: ${a.mensaje}`),
              ...tendencias.map((e) => `${e.astronauta.nombre}: fuera de su normal`),
            ].join(". "),
          };
  });
  useEffect(() => {
    const t = setInterval(() => {
      const r = resumenActual.current;
      if (r) setEnlace((e) => registrar(e, { ...r, creado: Date.now() }));
    }, RESUMEN_CADA_MS);
    return () => clearInterval(t);
  }, []);
  const hayEscenarioActivo = Object.values(escenarios).some((e) => e !== "normal");

  // Texto para lectores de pantalla: no incluye los valores medidos, así solo
  // cambia (y se anuncia) cuando cambia el nivel o el conjunto de alertas críticas.
  const anuncio =
    conDatos.length === 0
      ? ""
      : [
          `Tripulación: ${ETIQUETA[nivelTripulacion].toLowerCase()}.`,
          ...criticas.map(
            (a) => `${a.nombre}: ${METRICAS.find((m) => m.id === a.metrica)!.etiqueta.toLowerCase()} en nivel crítico.`,
          ),
        ].join(" ");

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-8 sm:px-6 lg:py-12">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-6">
        <div>
          <h1 className="ancho-expandido text-5xl font-semibold leading-none tracking-tight sm:text-6xl">Órbita Vital</h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-tenue">
            Salud de la tripulación, medida a bordo.
            <span
              className="rounded-[3px] border border-borde px-1.5 py-0.5 text-xs"
              title={modoDemo ? "Los datos los genera un simulador en este navegador" : "Datos en vivo desde Supabase"}
            >
              {modoDemo ? "Modo demo" : "En vivo"}
            </span>
            <span
              className="rounded-[3px] border border-verde/50 px-1.5 py-0.5 text-xs text-verde"
              title="La detección, la línea base y la memoria corren en este dispositivo, sin nube"
            >
              Detección a bordo
            </span>
          </p>
        </div>
        <div className="sm:text-right">
          <p className="text-sm text-tenue">Día {DIA_DE_MISION} de misión</p>
          <p className="ancho-condensado text-4xl font-semibold leading-tight tabular-nums">
            {ahora === null ? "--:--:--" : new Date(ahora).toISOString().slice(11, 19)}
            <span className="ml-2 text-sm font-normal text-tenue [font-variation-settings:'wdth'_100]">UTC</span>
          </p>
        </div>
      </header>

      <BarraEnlace
        enlace={enlace}
        apagon={apagonEfectivo}
        sinInternet={sinInternet}
        restaurado={restaurado}
        onAlternar={alternarApagon}
      />

      {aviso && (
        <p role="status" className="aviso -mt-6 rounded-[3px] border border-verde/50 px-4 py-3 text-sm text-verde">
          {aviso}
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-[3px] border border-rojo px-4 py-3 text-sm text-rojo">
          {error}
        </p>
      )}

      <p className="sr-only" aria-live="assertive" aria-atomic="true">
        {anuncio}
      </p>

      <section className="-mt-4 flex flex-col gap-3 border-y border-borde py-4" aria-label="Estado de la tripulación">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <p className="flex items-center gap-3 text-lg">
            <span
              className={`inline-block size-2.5 rounded-full ${nivelTripulacion === "rojo" && conDatos.length ? "pulso" : ""}`}
              style={{ background: conDatos.length ? COLOR[nivelTripulacion] : "var(--color-tenue)" }}
              aria-hidden
            />
            <span>
              <span className="font-semibold" style={{ color: conDatos.length ? COLOR[nivelTripulacion] : undefined }}>
                {conDatos.length === 0
                  ? "Esperando lecturas de los relojes"
                  : `Tripulación ${ETIQUETA[nivelTripulacion].toLowerCase()}.`}
              </span>{" "}
              <span className="text-tenue">
                {conDatos.length} de {ASTRONAUTAS.length} relojes transmitiendo,{" "}
                {alertas.length === 0 ? "sin alertas" : `${alertas.length} ${alertas.length === 1 ? "alerta" : "alertas"}`}.
              </span>
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={alternarIncidentes}
              aria-pressed={!autoIncidentes}
              className="min-h-10 rounded-[3px] border border-borde px-3 text-sm hover:border-texto focus-visible:outline-2 focus-visible:outline-acento"
            >
              {autoIncidentes ? "Pausar incidentes" : "Reanudar incidentes"}
            </button>
            <button
              type="button"
              onClick={restablecer}
              disabled={!hayEscenarioActivo}
              className="min-h-10 rounded-[3px] border border-borde px-3 text-sm hover:border-texto focus-visible:outline-2 focus-visible:outline-acento disabled:cursor-not-allowed disabled:opacity-40"
            >
              Restablecer escenarios
            </button>
          </div>
        </div>
        {enCurso && (
          <p className="text-sm">
            <span className="font-semibold">Simulando: {enCurso.tipo.titulo.toLowerCase()}</span>{" "}
            <span className="text-tenue">
              ({ASTRONAUTAS.find((a) => a.id === enCurso.astronautaId)?.nombre}). En sus signos vitales{" "}
              {enCurso.tipo.efecto}. Se resuelve
              {ahora !== null ? ` en ${Math.max(0, Math.ceil((enCurso.fin - ahora) / 1000))} s.` : " solo."}
            </span>
          </p>
        )}
        {criticas.length > 0 && (
          <ul className="space-y-1 text-sm">
            {criticas.map((a) => (
              <li key={a.id} className="text-rojo">
                ▲ <span className="font-medium">{a.nombre}:</span> {a.mensaje}. Avisar a la médica de a bordo.
              </li>
            ))}
          </ul>
        )}
        {tendencias.length > 0 && (
          <ul className="space-y-1 text-sm">
            {tendencias.map((e) => (
              <li key={e.astronauta.id} className="aparece text-amarillo">
                ◆ <span className="font-medium">{e.astronauta.nombre}:</span> fuera de su normal en{" "}
                {desvDe(e.astronauta.id)
                  .map((d) => etiquetaMetrica(d.metrica))
                  .join(", ")}
                . Los umbrales todavía no lo marcan.
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-x-8 gap-y-14 md:grid-cols-2 xl:grid-cols-4" aria-label="Tripulación">
        {estados.map((e) => (
          <TarjetaAstronauta
            key={e.astronauta.id}
            astronauta={e.astronauta}
            historial={historial[e.astronauta.id]}
            escenario={escenarios[e.astronauta.id]}
            sinSenal={e.sinSenal}
            desviaciones={desvDe(e.astronauta.id)}
            aprendiendo={aprendiendo[e.astronauta.id] ?? true}
            pulsoReal={camara === e.astronauta.id && conPulsoReal === e.astronauta.id}
            segundosDesde={e.segundosDesde}
            onEscenario={(esc) => elegirEscenario(e.astronauta.id, esc)}
            incidente={enCurso?.astronautaId === e.astronauta.id ? enCurso.tipo.titulo : null}
            onAbrirFicha={() => setFicha({ id: e.astronauta.id, abierta: true })}
          />
        ))}
      </section>

      {(() => {
        const e = estados.find((x) => x.astronauta.id === ficha?.id);
        return (
          <FichaAstronauta
            astronauta={e?.astronauta ?? null}
            abierta={ficha?.abierta ?? false}
            evaluacion={e?.evaluacion ?? null}
            fcActual={e?.ultima?.fc ?? null}
            sinSenal={e?.sinSenal ?? false}
            desviaciones={e ? desvDe(e.astronauta.id) : []}
            onMedirPulso={() => {
              if (!e) return;
              setFicha((f) => (f ? { ...f, abierta: false } : f));
              setCamara(e.astronauta.id);
            }}
            onCerrar={() => setFicha((f) => (f ? { ...f, abierta: false } : f))}
          />
        );
      })()}

      {camara && (
        <MedirPulso
          key={camara}
          astronauta={ASTRONAUTAS.find((a) => a.id === camara)!}
          onMedicion={(m) => recibirPulso(camara, m)}
          onCerrar={() => setCamara(null)}
        />
      )}

      <section aria-labelledby="bitacora-titulo" className="border-t border-borde pt-5">
        <h2 id="bitacora-titulo" className="ancho-expandido text-lg font-semibold">
          Bitácora de incidentes
        </h2>
        <p className="mt-1 text-sm text-tenue">
          {autoIncidentes
            ? "Cada minuto, más o menos, se simula un problema real de salud en un tripulante."
            : "Incidentes automáticos en pausa."}
        </p>
        {bitacora.length === 0 ? (
          <p className="mt-4 text-sm text-tenue">
            {autoIncidentes ? "El primer incidente llegará en unos segundos." : "Todavía no ha habido incidentes."}
          </p>
        ) : (
          <ol className="mt-4 divide-y divide-borde text-sm" aria-live="polite">
            {bitacora.map((i) => (
              <li key={i.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 py-2.5 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                <span className="ancho-condensado text-base font-semibold tabular-nums text-tenue">
                  {horaUTC(i.inicio)}
                </span>
                <span>
                  {i.tipo.titulo}{" "}
                  <span className="text-tenue">({ASTRONAUTAS.find((a) => a.id === i.astronautaId)?.nombre})</span>
                </span>
                <span
                  className="col-start-2 text-tenue sm:col-start-auto"
                  style={i.estado === "en-curso" ? { color: "var(--color-amarillo)" } : undefined}
                >
                  {i.estado === "en-curso"
                    ? "En curso"
                    : i.estado === "resuelto"
                      ? `Resuelto a las ${horaUTC(i.fin)}`
                      : `Detenido a las ${horaUTC(i.fin)}`}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <footer className="border-t border-borde pt-4 text-xs text-tenue">
        Prototipo de hackathon con datos simulados. Los umbrales son ilustrativos y no sustituyen criterio médico.
      </footer>
    </main>
  );
}
