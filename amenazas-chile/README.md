# 🗺️ Amenazas Chile

App web sin servidor con un mapa de Chile para:

1. **Aluviones**: ver por fecha dónde ocurrieron (registro histórico con fuente),
   agregar registros propios e importar catálogos.
2. **Factores**: evaluar si en un punto se reúnen las condiciones que suelen
   preceder a un aluvión, con el pronóstico de los próximos 3 días o para una
   fecha pasada.
3. **Incendios y sismos**: ubicarlos y cuantificarlos ("cubicar") por rango de
   fechas y área: cantidad, focos, días con actividad, magnitudes, profundidad.

## Cómo usarla

Abre `index.html` en el navegador (computador o celular) con conexión a
internet. Si el navegador bloquea las consultas al abrir el archivo
directamente, sírvela con cualquier servidor estático, por ejemplo
`npx http-server amenazas-chile` y abre la dirección que indique.

- **Filtros (arriba)**: rango *Desde / Hasta* con atajos (7 días, 30 días,
  1 año, 10 años, Todo) y *Área*: todo Chile o solo lo visible en el mapa.
  Todas las cifras y gráficos de las pestañas usan ese mismo filtro.
- **🌊 Aluviones**: cifras del rango, gráfico por día/mes/año, lista con fuente.
  *➕ Registrar aluvión* → toca el mapa → completa la ficha. *🔎 Condiciones de
  esa fecha* abre la evaluación de factores con el clima de ese día.
- **⚠️ Factores**: toca cualquier punto del mapa → *Evaluar factores de aluvión
  aquí*. *📋 Revisar lugares con historial* evalúa con el pronóstico todos los
  lugares con aluviones registrados y los ordena de mayor a menor.
- **🔥 Incendios**: pega tu MAP_KEY de NASA FIRMS (gratuita) y pulsa *Cargar
  detecciones del rango* (hasta 92 días por vez), o importa un CSV descargado
  de FIRMS para períodos antiguos.
- **🌎 Sismos**: elige la magnitud mínima y pulsa *Cargar sismos del rango*
  (USGS), o importa un CSV de otro catálogo (por ejemplo, del Centro
  Sismológico Nacional) con columnas de fecha, latitud, longitud, magnitud y
  profundidad. Acepta separador `,` o `;` y decimales con coma.
- **ℹ️ Fuentes**: de dónde sale cada dato, sus límites, el respaldo de tus
  registros y **🔌 Probar conexiones**, que hace una consulta mínima a cada
  fuente (USGS, Open-Meteo, FIRMS y el mapa base) desde tu navegador y dice
  cuál funciona, cuál falla y por qué. Úsalo la primera vez.

Las fechas y horas de sismos e incendios están en **UTC** (así las entregan
USGS y FIRMS); un evento de la noche en Chile puede quedar en el día
siguiente.

## 🤖 Funciones con IA (Claude)

Tres funciones usan la API de Claude con **tu propia clave**. Se configuran en
**ℹ️ Fuentes → Asistente IA**.

| Función | Dónde | Qué hace | Salvaguardas |
|---|---|---|---|
| Extraer de un texto | 🌊 Aluviones → *🤖 Extraer de un texto* | Pegas una noticia o informe y propone registros (fecha, localidad, comuna, región, fallecidos, desencadenante) con la frase que los respalda | Solo usa el texto, deja vacío lo que no está. La app comprueba que la cita aparezca **literalmente** en el texto y avisa si no. Nada se guarda hasta que revisas y pulsas *Agregar*. El registro queda sin coordenadas: lo ubicas tú en el mapa |
| Verificar fuente | Botón *🤖 Verificar fuente* en cada evento con enlace | Claude abre la página de la fuente (herramienta *web fetch* de Anthropic) y dice si confirma la fecha y el lugar, con una cita | Solo cuenta lo que dice la página. El evento queda **verificado solo cuando tú** abres la fuente, compruebas la cita y pulsas *Revisé la fuente* |
| Explicar el índice | ⚠️ Factores → *🤖 Redactar explicación para un informe* | Un párrafo para un informe interno con el resultado | Solo usa los datos calculados por la app y termina siempre con la advertencia de que no reemplaza los avisos de la DMC, SENAPRED ni SERNAGEOMIN |

**Cómo empezar**

1. Crea una clave en la consola de Anthropic (platform.claude.com) y, de
   preferencia, una exclusiva para esta app con **límite de gasto**.
2. Pégala en *Fuentes → Asistente IA*. Por defecto queda solo mientras la
   pestaña esté abierta; marca *Recordarla* si la usas en tu computador.
3. Elige el modelo y el presupuesto (por defecto US$ 100).

**Modelos y precios** (US$ por millón de tokens, tabla de Anthropic al
06-10-2026 [VERIFICAR vigencia en la página de precios de Anthropic]):

| Modelo | Entrada | Salida | Extraer* | Verificar* | Explicar* |
|---|---|---|---|---|---|
| Claude Opus 5.5 (por defecto) | 4 | 20 | ~US$ 0,06 | ~US$ 0,14 | ~US$ 0,03 |
| Claude Sonnet 5.5 | 2 | 10 | ~US$ 0,03 | ~US$ 0,07 | ~US$ 0,01 |
| Claude Haiku 5.5 | 0,10 | 0,50 | ~US$ 0,002 | ~US$ 0,004 | ~US$ 0,001 |

\* Estimación con supuestos de tokens (extraer: 3.000 de entrada y 2.500 de
salida; verificar: 20.000 y 3.000; explicar: 1.500 y 1.000; la salida incluye
el razonamiento del modelo). El costo real de cada uso se muestra al terminar.
Con Opus 5.5, los 100 dólares alcanzan para unas 700 verificaciones o 1.600
extracciones según estos supuestos.

**Control de gasto**: antes de cada llamada la app revisa el presupuesto y,
al terminar, suma el costo que informa la API (avisa al 80 % y se detiene al
100 %). Es una estimación de lo que gasta esta app **en este navegador**; el
saldo real está en la consola de Anthropic.

**Detalles técnicos**: SDK oficial `@anthropic-ai/sdk` 0.127.0 incluido en
`vendor/` (no requiere instalación). Las llamadas van directo desde el
navegador a `api.anthropic.com` con la opción `dangerouslyAllowBrowser`; la
clave queda en el navegador, por eso conviene una clave exclusiva con límite.
Salida estructurada con esquema JSON para la extracción y herramienta con
`strict: true` para el veredicto. En Opus y Sonnet está activado el
**respaldo automático** de la API (`fallbacks: "default"`): si el modelo
rechaza una solicitud por una regla de seguridad, la API la reintenta en otro
modelo, y el costo se calcula al precio del más caro.

**Prueba real con la API** (gasta créditos; con Haiku 5.5 se estima en
menos de US$ 0,01 la prueba básica y unos US$ 0,10 verificando el catálogo
completo):

```bash
AMENAZAS_CLAUDE_API_KEY=sk-ant-... node tests/prueba-real-ia.js                  # explicar, extraer y verificar 1 evento
AMENAZAS_CLAUDE_API_KEY=sk-ant-... node tests/prueba-real-ia.js --verificar-todo \
  --salida verificacion.json                                                       # verifica las 28 fuentes del catálogo
```

Usa Haiku 5.5 por defecto (`--modelo` para otro) y se detiene al llegar a
`--tope` dólares (0,25 por defecto; 1 con `--verificar-todo`). La clave se lee
de la variable de entorno y no se guarda en ningún archivo. Las
verificaciones del script **no** marcan eventos como verificados: el
resultado es para que una persona revise cada fuente.

## Cómo se calcula el indicador de factores

El indicador es **heurístico y orientativo: no es una alerta oficial**. Las
alertas las emiten la Dirección Meteorológica de Chile (avisos, alertas y
alarmas meteorológicas) y SENAPRED (alertas de protección civil).

Se calculan dos grupos (0–100 cada uno) y se combinan con la raíz del
producto, para que el resultado solo sea alto cuando **ambos** se reúnen:

| Grupo | Factor | Peso | Dato | Puntaje máximo cuando… |
|---|---|---|---|---|
| Detonante | Lluvia intensa | 55 | Máximo acumulado en 24 h y máximo horario (Open-Meteo) | se alcanza el umbral de la zona (tabla abajo) |
| Detonante | Isoterma 0 °C alta durante la lluvia | 35 | Altura de la isoterma ponderada por los mm de cada hora | la isoterma supera el cerro más alto en 10 km (toda la cuenca recibe lluvia en vez de nieve) |
| Detonante | Lluvia de los 7 días previos | 10 | Suma de 7 días | iguala el umbral de 24 h de la zona |
| Susceptibilidad | Relieve | 50 | Desnivel en 6 km (Copernicus DEM 90 m) | ≥ 1.000 m |
| Susceptibilidad | Incendio reciente | 25 | Detecciones FIRMS cargadas a < 5 km en los 3 años previos | hay al menos una (si no hay datos de incendios cargados, el factor no se evalúa) |
| Susceptibilidad | Aluviones previos | 25 | Registros a < 15 km antes de la fecha | hay al menos uno |

Umbrales de lluvia por zona (valores de partida):

| Zona | Latitud | mm en 24 h | mm en 1 h | Base |
|---|---|---|---|---|
| Norte Grande | −17° a −26° | 15 | 5 | Heurístico. Referencia: Antofagasta 1991, 42 mm en 3–4 h y 24 mm/h máx. |
| Norte Chico | −26° a −32° | 25 | 7 | Heurístico. Referencia: Atacama 2015, 77 mm en 51 h y 7,5 mm/h máx. |
| Zona Central | −32° a −38° | 60 | 10 | > 60 mm/día ≈ 50 % de probabilidad de flujos en la precordillera de Santiago; 12 mm/h en Macul 1993 |
| Zona Sur | −38° a −44° | 80 | 12 | Heurístico, sin umbral publicado encontrado |
| Zona Austral | al sur de −44° | 80 | 12 | Heurístico, sin umbral publicado encontrado |

Semáforo: 🟢 Bajo < 20 · 🟡 Moderado 20–39 · 🟠 Alto 40–59 · 🔴 Muy alto ≥ 60.

**Los pesos, los cortes del semáforo y la mayoría de los umbrales son
heurísticos**: no provienen de un modelo validado con datos chilenos. Se
pueden cambiar en *⚙️ Ajustar umbrales y pesos*. Ver "Respaldo bibliográfico
de los factores" más abajo para lo que sí está documentado.

Limitaciones conocidas:

- El pronóstico y el reanálisis tienen celdas de kilómetros: no ven una
  tormenta convectiva local que cae sobre una sola quebrada.
- Para fechas pasadas la isoterma se **estima** desde la temperatura a 2 m con
  el gradiente de la atmósfera estándar (6,5 °C/km), porque el reanálisis
  ERA5 publicado por Open-Meteo no la entrega. Con inversión térmica
  (habitual en la costa del norte) la estimación puede errar mucho.
- El relieve se mide con 33 puntos alrededor del lugar, no con la cuenca real
  que drena hacia él.
- No considera material suelto disponible, obras de mitigación ni
  desbordes de lagunas glaciares.

## Respaldo bibliográfico de los factores

Las referencias se identificaron con búsqueda web en octubre de 2026. **Ninguna
página pudo abrirse desde el entorno de trabajo**: autor, año y dato vienen de
los extractos del buscador. Todas quedan como [VERIFICAR] antes de citarlas
en un documento.

| Factor | Qué se encontró | Referencia |
|---|---|---|
| Lluvia del mismo día | En la precordillera de Santiago, la lluvia del día del evento pesó más que la acumulada y la cota de nieve | Sepúlveda, S.A. & Padilla, C. (2008). *Natural Hazards* 47:201–215 [VERIFICAR] |
| Umbral diario Santiago | > 60 mm/día ≈ 50 % de probabilidad de flujos | Hauser (1985), citado por Sepúlveda & Padilla (2008) [VERIFICAR] |
| Intensidad | 12 mm/h máx. en la Quebrada de Macul (3-5-1993), ~30 mm en el día | Naranjo & Varela (1996), citado por Sepúlveda, Rebolledo & Vargas (2006), *Quaternary International* 158:83–95 [VERIFICAR] |
| Isoterma 0 °C | Separa la zona que recibe lluvia de la que recibe nieve; al subir, aumenta el área de la cuenca que aporta agua. Tormenta media de Chile central ~2.200 m; frías < 1.500 m; cálidas > 3.500 m. En Macul 1993 subió a ~4.000 m | Garreaud, R., análisis CR2 y Garreaud (2013), *J. Hydrometeorology* 14:1515–1534; Sepúlveda & Padilla (2008) [VERIFICAR] |
| Isoterma vs. intensidad | En el Elqui medio, la temperatura (indicador de la isoterma) influyó más que la lluvia máxima en 1 h | Vergara Dal Pont et al. (2018), *Natural Hazards* 93:531–546 [VERIFICAR] |
| Atacama 2015 | Toda la precipitación cayó como lluvia, también sobre 4.000 m; 77 mm en 51 h en Cine Inca (2.240 m) | Wilcox et al. (2016), *Geophysical Research Letters*, doi:10.1002/2016GL069751 [VERIFICAR] |
| Antofagasta 1991 | 42 mm en 3–4 h, máx. 24 mm/h | Garreaud & Rutllant (1996), *Atmósfera* 9:251–271, citado por Sepúlveda et al. (2006) [VERIFICAR] |
| Relieve y cuenca | Área, pendiente, razón de Melton y de relieve resultaron significativas en el Huasco; el sedimento almacenado importa | Aguilar et al. (2020), *NHESS* 20:1247–1265 [VERIFICAR] |
| Lluvia previa | Evidencia mixta: relevante en algunos estudios, descartada en el Elqui | Moreiras et al. (2021), *Geosciences* 11(2):43; Vergara Dal Pont et al. (2018) [VERIFICAR] |
| Incendios | No se encontró un umbral de lluvia post-incendio publicado para Chile; la app lo usa solo como agravante sí/no | — |

Cómo comunican las alertas los organismos (según los mismos extractos): la
DMC emite avisos (A), alertas (AA) y alarmas (AAA) que indican lluvia "en
corto periodo" e "isoterma cero alta"; SERNAGEOMIN publica una minuta técnica
con la posibilidad de aluviones alta, moderada o baja por zona, a partir del
pronóstico de la DMC y del historial; SENAPRED declara Alerta Temprana
Preventiva, Amarilla o Roja.

## Fuentes de datos

| Dato | Fuente | Acceso |
|---|---|---|
| Sismos | USGS, FDSN Event Web Service (`earthquake.usgs.gov/fdsnws/event/1`) | Libre. Máximo 20.000 eventos por consulta según documentación de terceros [VERIFICAR en la documentación oficial]. |
| Incendios | NASA FIRMS, API *area* (`firms.modaps.eosdis.nasa.gov/api/area`) | MAP_KEY gratuita. La fecha de la consulta es el primer día del tramo. La página oficial indica de 1 a 5 días por consulta (otra copia de la documentación dice 1 a 10): la app pide tramos de 5 días. |
| Lluvia e isoterma (pronóstico) | Open-Meteo Forecast API, variables `precipitation` y `freezing_level_height` | Libre para uso no comercial. |
| Lluvia y temperatura (pasado) | Open-Meteo Historical Weather API (ERA5, desde 1940) | Libre para uso no comercial. |
| Elevación | Open-Meteo Elevation API (Copernicus DEM GLO-90, hasta 100 puntos por consulta) | Libre; requiere atribución a Copernicus y Open-Meteo. |
| Mapa base | OpenStreetMap y OpenTopoMap | Atribución en el mapa. |
| Aluviones históricos | Catálogo precargado en `datos/aluviones.js` (28 eventos, de Camiña 2012 a Villa Santa Lucía 2017) | Cada evento trae su fuente y un grado de coincidencia (alta, media o baja). **Ninguno está marcado como verificado**: las fuentes se identificaron por búsqueda y no se abrieron. |
| Catastro nacional (opcional) | SERNAGEOMIN, catastro de remociones en masa 1762–2021, publicado en Datos para Resiliencia (doi:10.71578/QRDY49) en CSV y GeoJSON | Se puede importar con *📂 Importar CSV/GeoJSON*. Nombres de columnas no confirmados [VERIFICAR]: si no se reconocen fecha y coordenadas, la app avisa. Incluye todo tipo de remociones, no solo aluviones. |

## Archivos

| Archivo | Descripción |
|---|---|
| `index.html` | Interfaz: filtros, mapa y pestañas |
| `styles.css` | Estilos (modo claro y oscuro) |
| `app.js` | Mapa Leaflet, pestañas, gráficos, registro y persistencia |
| `nucleo.js` | Cálculos: lectura de CSV/GeoJSON, filtros, histogramas, focos de incendio, resumen de sismos e indicador de factores |
| `fuentes.js` | Direcciones de las APIs y descarga de datos |
| `datos/aluviones.js` | Catálogo histórico de aluviones con fuente por evento |
| `ia.js` | Funciones con IA: extracción, verificación, explicación, costos y presupuesto |
| `vendor/` | SDK oficial de Anthropic empaquetado (ver `vendor/LEEME.md`) |
| `tests/nucleo.test.js` | Pruebas del núcleo: `node tests/nucleo.test.js` |
| `tests/ia.test.js` | Pruebas de IA con respuestas simuladas: `node tests/ia.test.js` |
| `tests/prueba-real-ia.js` | Prueba contra la API real de Claude (gasta créditos; ver arriba) |

## Pendiente de verificación

- **IA, primera llamada real**: las funciones de IA se probaron con el SDK
  real y respuestas simuladas, pero sin la API de verdad (este entorno no
  tiene tu clave). Haz la primera prueba con *Explicar el índice*, que es la
  más barata. Si la verificación de fuentes falla con un error de permisos,
  puede que la lectura web (*web fetch*) deba habilitarse en la configuración
  de tu organización en la consola de Anthropic [VERIFICAR]. Si abres la app
  con doble clic (`file://`) y la IA no conecta, ábrela con un servidor local
  (ver *Cómo usarla*).

- **Catálogo de aluviones**: abrir la `fuente_url` de cada evento y cambiar
  `verificado` a `true` solo si la página confirma fecha y lugar. Cinco
  eventos no tienen coordenadas (El Salado 2015, Cruz de Caña 2026,
  Infiernillo 2026, Los Molles 2002, El Melocotón 2016): se ubican con
  *📍 Ubicar en el mapa* y la ubicación queda guardada en el navegador. En
  Curarrehue 2023 y Lago Cabrera 1965 la coordenada es del pueblo o del volcán,
  no del sitio exacto. Las fechas de Chañaral 1972 (solo año), Chañaral 2017
  y Los Molles 2002 (solo mes) son parciales.

- **Consultas en vivo**: el entorno donde se construyó la app no tenía salida a
  `earthquake.usgs.gov`, `firms.modaps.eosdis.nasa.gov` ni `api.open-meteo.com`.
  Las direcciones y parámetros siguen la documentación de cada servicio, y la
  interfaz se probó con respuestas simuladas, pero **la primera consulta real
  debe hacerse en tu navegador**: pulsa *🔌 Probar conexiones* en la pestaña
  Fuentes. Si una fuente no permite consultas desde el
  navegador (CORS), la app lo informa; en ese caso usa la importación de
  archivos (FIRMS y catálogos de sismos ofrecen descarga en CSV).
- Nombres de satélites de FIRMS distintos de `VIIRS_SNPP_NRT`
  (`VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_NRT`, `MODIS_NRT`): tomados de la
  documentación de FIRMS citada por terceros [VERIFICAR].
- Cobertura temporal de los datos "casi tiempo real" (NRT) de FIRMS en la API:
  para períodos antiguos usa la descarga de archivo de FIRMS.
