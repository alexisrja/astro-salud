# Órbita Vital

Monitoreo de la salud de astronautas con **detección a bordo**: la app aprende el normal de cada
tripulante, mide el pulso con la cámara y sigue funcionando aunque se corte el enlace con la Tierra.
Next.js + Tailwind para el panel, simulador de relojes y Supabase Realtime opcional.

Demo publicada: https://astro-salud.vercel.app (modo demo; cada subida a `main` se despliega sola en Vercel).

## Arrancar en 1 minuto (modo demo, sin Supabase)

```bash
npm install
npm run dev
```

Abre http://localhost:3000. El simulador corre dentro del navegador.
Usa "Simular escenario" en cada tarjeta para provocar una emergencia durante la demo.

## Guion de demo (3 minutos)

1. **Línea base personal.** En la tarjeta de Valeria elige *Simular → Deterioro lento*. En un minuto
   aproximadamente pasa a **Vigilar** con alertas ◆ ("frecuencia cardiaca 15 % por arriba de tu
   normal"), aunque todos los umbrales siguen en verde. Es lo que en una misión larga pasa en semanas.
2. **Pulso real con la cámara.** Abre la ficha de un tripulante → *Medir con cámara*. En celular, tapa
   la cámara trasera con la yema del dedo (prende la linterna sola en Android). En laptop, elige *Cara
   frente a la webcam*. En unos 8 segundos sale el pulso y la tarjeta muestra "Cámara en vivo".
3. **Apagón de comunicaciones.** Pulsa *Simular apagón*: la barra se pone roja, la detección sigue
   igual y los resúmenes para la Tierra se quedan en cola. *Restablecer enlace* los envía todos.
4. **Sin internet de verdad.** Con la app ya abierta una vez, desconecta el wifi y recarga: abre igual
   y recupera lo aprendido de la memoria del dispositivo.

## Cómo funciona lo "a bordo"

| Pieza | Qué hace | Archivo |
|---|---|---|
| Línea base personal | Promedio móvil por tripulante y métrica; avisa cuando una métrica se aleja 3 desviaciones de *su* normal durante 4 lecturas seguidas. Lo dudoso no le enseña el normal, así una deriva lenta no la arrastra. | `lib/lineaBase.ts` |
| Pulso por cámara | Fotopletismografía: canal rojo (dedo) o verde de la frente (cara), filtro pasa banda 0.7–3.5 Hz, periodo por autocorrelación y un latido por periodo. Solo se usa la FC; la HRV de unos segundos es demasiado inestable. | `lib/pulsoCamara.ts`, `components/MedirPulso.tsx` |
| Enlace con la Tierra | Cada 15 s arma un resumen. Con enlace se envía; en apagón (simulado o sin internet real) se encola y sale al volver. | `lib/enlace.ts`, `components/BarraEnlace.tsx` |
| Memoria del dispositivo | Guarda en IndexedDB la línea base, el historial reciente y la cola cada 5 s. Al abrir recupera lo de las últimas 12 h. | `lib/almacen.ts` |
| App instalable sin red | Service worker que guarda la página y sus archivos; manifest para instalarla en el celular. Solo se activa en producción (`npm run build && npm start` o Vercel). | `public/sw.js`, `app/manifest.ts`, `components/RegistroSW.tsx` |

La cámara necesita https (Vercel) o `localhost`.

## Conectar Supabase Realtime

1. Crea un proyecto en https://supabase.com.
2. En SQL Editor, pega y ejecuta `supabase/esquema.sql`.
3. Copia `.env.example` como `.env.local` y llena la URL y la clave anon (Project Settings > API).
4. En dos terminales:

```bash
npm run dev          # panel
npm run simulador    # relojes simulados que envían lecturas cada 2 s
```

El panel detecta las variables y cambia solo a "Supabase Realtime". Los escenarios que elijas en el
panel se guardan en la tabla `escenarios` y el simulador los obedece. Si detienes el simulador, a los
10 segundos las tarjetas marcan "Sin señal".

## Dónde está cada cosa

| Archivo | Qué hace |
|---|---|
| `lib/salud.ts` | Umbrales, alertas e índice de salud 0 a 100. Aquí se ajustan las reglas. |
| `lib/simulador.ts` | Genera signos vitales y escenarios (hipoxia, taquicardia, fiebre, fatiga, deterioro lento). Acepta un pulso real con `setReal`. |
| `lib/tipos.ts` | Tripulación (ficha personal y médica) y forma de una lectura. |
| `components/FichaAstronauta.tsx` | Ficha lateral que se abre al tocar la cabecera de una tarjeta. |
| `components/Panel.tsx` | Panel, conexión Realtime y modo demo. |
| `components/TarjetaAstronauta.tsx` | Tarjeta por astronauta. |
| `scripts/simulador.ts` | Envía lecturas a Supabase. |
| `supabase/esquema.sql` | Tablas, políticas y Realtime. |

## Datos reales de la NASA

La ficha de cada astronauta muestra un análisis de sangre real de un tripulante de Inspiration4
(SpaceX, 2021), descargado del [NASA Open Science Data Repository](https://osdr.nasa.gov):
[OSD-569](https://osdr.nasa.gov/bio/repo/data/studies/OSD-569) (hemograma) y
[OSD-575](https://osdr.nasa.gov/bio/repo/data/studies/OSD-575) (panel metabólico). Los datos están en
`lib/analiticas-osdr.json` y se regeneran con:

```bash
npm run datos:osdr
```

Las lecturas del reloj (pulso, oxígeno, temperatura, sueño) siguen siendo simuladas: OSDR no publica en
abierto los datos de los relojes de esa misión.

## Fotos de la tripulación

Los retratos de `public/astronautas/` están generados con IA (personas ficticias). Sin foto, un astronauta muestra sus iniciales. Para poner una, guarda la imagen en
`public/astronautas/` (por ejemplo `ast-1.jpg`, mejor vertical 4:5) y añade
`foto: "/astronautas/ast-1.jpg"` a ese astronauta en `lib/tipos.ts`.

Para otras fuentes (una app de Wear OS, por ejemplo) basta con insertar filas en `lecturas` con las
mismas columnas.

## Comprobaciones

```bash
npm test             # reglas de salud, simulador, línea base, pulso por cámara y enlace
npm run lint
npm run typecheck
```

## Notas

- Las políticas de `esquema.sql` son abiertas para la demo. No uses datos reales con ellas.
- La tabla `lecturas` solo conserva la última hora: un disparador borra lo anterior en cada inserción.
- `esquema.sql` se puede volver a ejecutar sin errores; hazlo si creaste las tablas con una versión anterior.
- Los umbrales son ilustrativos y no sustituyen criterio médico.
