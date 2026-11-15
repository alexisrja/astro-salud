export type Nivel = "verde" | "amarillo" | "rojo";

export type Escenario = "normal" | "hipoxia" | "taquicardia" | "fiebre" | "fatiga" | "deterioro";

export interface Astronauta {
  id: string;
  nombre: string;
  rol: string;
  indicativo: string; // nombre corto por radio
  /** Ruta en /public. Sin foto se muestran sus iniciales. */
  foto?: string;
  pais: string;
  agencia: string;
  edad: number;
  grupoSanguineo: string;
  especialidad: string;
  diasEnMision: number;
  misionesPrevias: number;
  horasEva: number; // horas de actividad extravehicular acumuladas
  fcReposo: number; // lpm medidos antes del lanzamiento
  alergias: string;
  notaMedica: string;
  /** Tripulante de Inspiration4 (C001–C004) cuya analítica real se muestra en la ficha. */
  analiticaOsdr: string;
}

/** Una lectura del smartwatch. Coincide con las columnas de la tabla `lecturas`. */
export interface Lectura {
  astronauta_id: string;
  fc: number; // frecuencia cardiaca (lpm)
  spo2: number; // oxígeno en sangre (%)
  temp: number; // temperatura corporal (°C)
  hrv: number; // variabilidad cardiaca RMSSD (ms)
  sueno: number; // horas dormidas en el último ciclo
  ejercicio: number; // minutos de ejercicio hoy
  creado_en: string; // ISO
}

// Tripulación ficticia para la demo. Los retratos están generados con IA.
export const ASTRONAUTAS: Astronauta[] = [
  {
    id: "ast-1",
    analiticaOsdr: "C002",
    foto: "/astronautas/ast-1.jpg",
    nombre: "Valeria Ríos",
    rol: "Comandante",
    indicativo: "Cóndor",
    pais: "México",
    agencia: "Agencia Espacial Mexicana",
    edad: 44,
    grupoSanguineo: "O+",
    especialidad: "Piloto de pruebas",
    diasEnMision: 118,
    misionesPrevias: 2,
    horasEva: 21.5,
    fcReposo: 58,
    alergias: "Ninguna conocida",
    notaMedica: "Densidad ósea vigilada tras su segunda misión. Mantiene 2 h diarias de ejercicio de resistencia.",
  },
  {
    id: "ast-2",
    analiticaOsdr: "C001",
    foto: "/astronautas/ast-2.jpg",
    nombre: "Mateo Salas",
    rol: "Ingeniero de vuelo",
    indicativo: "Brújula",
    pais: "Chile",
    agencia: "Agencia Espacial de Chile",
    edad: 39,
    grupoSanguineo: "A+",
    especialidad: "Sistemas de soporte vital",
    diasEnMision: 118,
    misionesPrevias: 1,
    horasEva: 9,
    fcReposo: 63,
    alergias: "Penicilina",
    notaMedica: "Antecedente de cinetosis los primeros días en órbita, ya resuelta. Usar macrólidos si necesita antibiótico.",
  },
  {
    id: "ast-3",
    analiticaOsdr: "C003",
    foto: "/astronautas/ast-3.jpg",
    nombre: "Akira Tanaka",
    rol: "Médica de a bordo",
    indicativo: "Pulso",
    pais: "Japón",
    agencia: "Agencia Japonesa de Exploración Aeroespacial",
    edad: 41,
    grupoSanguineo: "B−",
    especialidad: "Medicina aeroespacial",
    diasEnMision: 64,
    misionesPrevias: 1,
    horasEva: 0,
    fcReposo: 66,
    alergias: "Ninguna conocida",
    notaMedica: "Responsable médica de la tripulación. Su propio seguimiento lo revisa el médico de vuelo en Tierra.",
  },
  {
    id: "ast-4",
    analiticaOsdr: "C004",
    foto: "/astronautas/ast-4.jpg",
    nombre: "Lucas Ferreira",
    rol: "Especialista de misión",
    indicativo: "Ancla",
    pais: "Brasil",
    agencia: "Agência Espacial Brasileira",
    edad: 35,
    grupoSanguineo: "AB+",
    especialidad: "Biología de plantas",
    diasEnMision: 64,
    misionesPrevias: 0,
    horasEva: 4.5,
    fcReposo: 70,
    alergias: "Polen de gramíneas",
    notaMedica: "Primera misión. Sueño irregular las primeras semanas; mejora con el horario fijo de iluminación.",
  },
];

export const iniciales = (nombre: string) =>
  nombre
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");

/** Escenarios que se pueden elegir en el panel. */
export const ESCENARIOS: { id: Escenario; etiqueta: string }[] = [
  { id: "normal", etiqueta: "Normal" },
  { id: "hipoxia", etiqueta: "Hipoxia" },
  { id: "taquicardia", etiqueta: "Taquicardia" },
  { id: "fiebre", etiqueta: "Fiebre" },
  { id: "fatiga", etiqueta: "Fatiga" },
  { id: "deterioro", etiqueta: "Deterioro lento" },
];
