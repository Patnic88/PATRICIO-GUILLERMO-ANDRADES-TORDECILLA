# 🤖 Asistente IA Dropshipping

App web sin servidor que genera **prompts, skills y loops** de IA,
personalizados con los datos de tu tienda, para montar y operar una tienda
online de dropshipping con Claude, ChatGPT o Gemini.

## Cómo usarla

Abre `index.html` en el navegador (computador o celular). También se llega
desde el inicio del Radar Dropshipping (tarjeta **🤖 Asistente IA**).

1. **Cuéntanos de tu tienda**: nombre, qué vendes, a quién, país, qué IA
   usas y en qué plataforma está la tienda. En **➕ Más detalles** (opcional):
   proveedor, tono de marca, experiencia, redes y tus números (precio, costo,
   envío y presupuesto de anuncios). Con precio y costo muestra en vivo la
   ganancia por venta. Si analizaste productos en el Radar y ambas páginas
   comparten almacenamiento en tu navegador, puedes traer uno con un clic.
2. **Elige qué crear**: 26 plantillas ordenadas como ruta de lanzamiento en
   5 etapas, con filtros por tipo.
3. **Copia o descarga** el resultado. Cada uno trae sus pasos de uso y el
   texto se puede editar antes de copiarlo.

### En tu computadora

No necesita servidor, instalación ni internet. Copia la carpeta
`dropshipping/` **completa** (el Asistente vuelve al Radar con
`../index.html` y lee los productos guardados por el Radar), descomprímela
si viene en ZIP y abre `dropshipping/asistente-ia/index.html` con doble clic.
Se probó en Chromium (motor de Chrome y Edge); en otros navegadores no está
probado. Para dejarla a mano, guárdala en Favoritos (Ctrl + D).

**🎓 Usar un ejemplo** llena el perfil con datos inventados («Casa Zen»).
**📦 Descargar kit** baja todo en un ZIP con un `LEEME.md` que explica el orden.

Lo que no completes queda como `[COMPLETAR: …]` y la IA te lo preguntará
antes de empezar. El perfil se guarda solo en ese navegador (`localStorage`).

## Qué genera

| Tipo | Para qué | Formato |
|---|---|---|
| 💬 **Prompt** (16) | Una tarea puntual: nicho, validación, competencia, proveedor, precio, marca, estructura de la tienda, ficha, políticas, SEO, guiones, anuncios, calendario, correos, atención al cliente y métricas | Para Claude, con etiquetas XML (`<rol>`, `<contexto>`, `<tarea>`…); para otras IA, en Markdown |
| 🧩 **Skill** (6) | Asistentes reutilizables: validador de productos, redactor de marca, lanzador de tienda, creador de videos, atención al cliente y analista de métricas | `SKILL.md` en un ZIP para Claude, y la versión «instrucciones» para un GPT, Proyecto o Gem |
| 🔁 **Loop** (4) | Procesos por ciclos con tabla de estado, meta, máximo de ciclos y corte si no hay avance: cazar productos, pulir la ficha, testear anuncios y revisión diaria | Para el chat (se avanza escribiendo CONTINUAR); los de anuncios y revisión diaria tienen además un comando `/loop` para Claude Code |

Todos los prompts y loops incluyen reglas de veracidad: no inventar cifras ni
testimonios, distinguir DATO / ESTIMACIÓN / OPINIÓN, citar fuentes, marcar
`[VERIFICAR]` lo no confirmado y no citar normas sin número y artículo. Los
loops prohíben a la IA gastar, publicar o contactar a alguien en tu nombre.

El validador de productos (prompt, skill y loop) usa **la misma rúbrica del
Radar** (`../scoring.js`): Demanda 30, Margen 25, Señales de venta 15 y
Checklist 30, con los mismos umbrales y criterios bloqueantes. Son
heurísticos, no un modelo validado con datos de ventas.

## ▶ Ejecutar con Claude (API)

Con una clave de la Consola de Claude (platform.claude.com), los prompts,
skills y loops se ejecutan **dentro de la página**, sin copiar y pegar, con
cargo al saldo de la API de esa cuenta.

1. **Paso 3 → 🔌 Conectar y ajustes** (o el botón **🔌 Claude** arriba): pega
   la clave, elige el modelo por defecto y el presupuesto (100 USD por
   defecto). «Guardar y probar» consulta la ficha del modelo, que no gasta
   tokens.
2. En cualquier resultado pulsa **▶ Ejecutar con Claude** (en los skills,
   **▶ Probar este skill**). Se abre una conversación con el prompt listo;
   eliges modelo, profundidad y si permites búsqueda web, y pulsas **Enviar**.
3. Cada respuesta muestra su **costo estimado**; arriba se ve el total de la
   conversación y el gastado contra el presupuesto. En los loops aparece el
   botón **➡️ CONTINUAR**.
4. Las conversaciones quedan en **Mis conversaciones** (este navegador, máx.
   30) y se pueden retomar o descargar en `.md`.

### Modelos y precios (USD por millón de tokens)

Fuente: [platform.claude.com/docs/en/about-claude/pricing](https://platform.claude.com/docs/en/about-claude/pricing), consultada el 9-oct-2026.

| Modelo | ID | Entrada | Salida | Lectura de caché | Escritura de caché (5 min) |
|---|---|---|---|---|---|
| Claude Haiku 5.5 (prompts ≤ 100.000 tokens) | `claude-haiku-5-5` | 0,10 | 0,50 | 0,01 | 0,125 |
| Claude Haiku 5.5 (prompts > 100.000 tokens) | `claude-haiku-5-5` | 0,50 | 2,50 | 0,05 | 0,625 |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | 2 | 10 | 0,10 | 2,50 |

Búsqueda web: **USD 10 por cada 1.000 búsquedas**, más los tokens de los
resultados, que se cobran como entrada. El razonamiento del modelo se cobra
como salida.

**Costos aproximados (ESTIMACIÓN, calculada con la tabla; varía según el
largo real):**

| Uso | Supuesto | Haiku 5.5 | Sonnet 5.5 |
|---|---|---|---|
| Un prompt | ~3.000 tokens de entrada y ~2.500 de salida | ≈ USD 0,002 | ≈ USD 0,03 |
| Un loop de 6 ciclos, sin búsqueda | historial reenviado en cada ciclo (~63.000 de entrada en total) y ~18.000 de salida, sin descontar la caché | ≈ USD 0,02 | ≈ USD 0,31 |
| Con búsqueda web | hasta 5 búsquedas por respuesta (USD 0,05) más resultados como entrada | sube poco | puede pasar de USD 0,10 por respuesta |

Con 100 USD alcanzaría, según esos supuestos, para decenas de miles de prompts
con Haiku o unos 3.000 con Sonnet.

### Presupuesto y límite real

- El presupuesto y el gastado de la app son una **estimación** calculada con
  el `usage` de cada respuesta. Al llegar al presupuesto, la app deja de
  enviar. Al 80 % muestra un aviso.
- El tope que de verdad corta el gasto se configura en la Consola:
  **Settings → Billing → Spend limits** (según la página oficial de
  [rate limits](https://platform.claude.com/docs/en/api/rate-limits)). Al
  alcanzarlo, la API responde con un error que la app traduce.

### Seguridad de la clave

- La app llama a la API directamente desde el navegador (opción
  `dangerouslyAllowBrowser` del SDK). Comprobé que la API responde a esas
  llamadas (`access-control-allow-origin: *`).
- Si no marcas «Recordar», la clave vive solo en memoria y se borra al cerrar
  la página. Si la recuerdas, queda en el `localStorage` del navegador; en
  Chrome los archivos abiertos desde el disco comparten ese almacenamiento, así
  que **usa una clave exclusiva para esta app** y revócala si dejas de usarla.
- Lo que ejecutas se envía a la API de Anthropic. El resto de la app sigue
  funcionando sin conexión.

### Cómo llama a la API

- SDK oficial `@anthropic-ai/sdk` 0.132.1 (MIT) empaquetado en
  `vendor/anthropic-sdk.js` para que funcione sin servidor ni compilación.
  Su licencia está en `vendor/LICENSE-anthropic-sdk.txt`.
- Streaming, `max_tokens` 32.000, razonamiento adaptativo con resumen visible
  (`thinking: {type: "adaptive", display: "summarized"}`), profundidad con
  `output_config.effort` (Rápido = `low`, Normal = `medium`, A fondo = `high`).
- Caché automática del historial (`cache_control` en el nivel superior): en
  conversaciones largas los mensajes anteriores se cobran a precio de lectura
  de caché.
- Búsqueda web opcional: `web_search_20250305` con `max_uses: 5`. Si la API
  pausa el turno (`pause_turn`), la app lo reanuda hasta 3 veces.
- Sonnet 5.5 usa el respaldo del servidor ante rechazos de los clasificadores
  (`fallbacks: "default"` con la cabecera `server-side-fallback-2026-07-01`).
  Haiku 5.5 no tiene respaldo del servidor. Si Claude rechaza la solicitud, la
  app lo avisa y devuelve el texto para reformularlo.
- El historial solo se agrega, nunca se edita: el razonamiento firmado de cada
  respuesta se reenvía tal cual. Por eso modelo, profundidad y búsqueda quedan
  fijos en cada conversación.

## Formatos verificados (documentación oficial, consultada el 8-oct-2026)

- **Skills** — `SKILL.md` con encabezado YAML `name` y `description`
  ([platform.claude.com, Agent Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)).
  `name`: minúsculas, números y guiones, máximo 64 caracteres, sin las
  palabras reservadas «anthropic» ni «claude»
  ([buenas prácticas](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)).
  La app solo usa `name` y `description`, que son campos aceptados fuera de
  Claude Code.
- **Largo de la descripción** — hay una diferencia entre fuentes oficiales:
  la documentación de la plataforma indica 1.024 caracteres y el centro de
  ayuda de claude.ai, 200
  ([Creating custom skills](https://support.claude.com/en/articles/12512198-creating-custom-skills)).
  La app usa **200** para que el ZIP sirva en ambos casos.
- **Subir a claude.ai** — ZIP cuya raíz es la carpeta del skill, con el mismo
  nombre del skill; menú Personalizar → Skills; requiere la ejecución de
  código activada
  ([Using skills in Claude](https://support.claude.com/en/articles/12512180-using-skills-in-claude)).
- **Claude Code** — skills personales en `~/.claude/skills/<nombre>/SKILL.md`
  ([code.claude.com/docs/en/skills](https://code.claude.com/docs/en/skills)).
  `/loop <intervalo> <instrucción>` con unidades s, m, h, d; la tarea vive
  mientras la sesión está abierta y vence a los 7 días
  ([scheduled-tasks](https://code.claude.com/docs/en/scheduled-tasks)).
- **Etiquetas XML para Claude** — recomendadas en la guía de prompting de
  Anthropic
  ([prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)).

## Pendiente de verificación

- **Nombre del archivo en claude.ai**: el centro de ayuda escribe
  `skill.md` y la documentación para desarrolladores `SKILL.md`. La app usa
  `SKILL.md`; no pude confirmar si claude.ai distingue mayúsculas.
- **Menús de ChatGPT y Gemini** (GPT personalizado, Proyectos, Gems): las
  instrucciones de uso se basan en el funcionamiento conocido de esas
  herramientas, no en su documentación consultada en esta sesión.
- **Normas chilenas** en el prompt de políticas: Ley 19.496 (art. 3 bis,
  retracto en compras a distancia, modificado por la Ley 21.398) y Ley
  19.628. Se confirmaron solo con fuentes secundarias; el texto generado las
  marca `[VERIFICAR texto vigente en bcn.cl/leychile]`.
- **Ejecución con Claude contra la API real:** se probó con el SDK real
  contra una API simulada (servidor local en Node y respuestas interceptadas
  en Chromium), no contra la API de Anthropic, porque en este entorno no hay
  clave. La primera vez, haz una prueba corta con Haiku y compara el costo
  estimado con el de la Consola (Usage).
- **Búsqueda web en Haiku 5.5:** la documentación consultada no lista
  explícitamente qué versión de la herramienta acepta Haiku 5.5. La app usa la
  versión básica (`web_search_20250305`) y, al activarla, consulta
  `capabilities.server_tools.web_search.supported` en la API de modelos.
- **Precio de lectura de caché en Sonnet 5.5:** la página oficial de precios
  indica USD 0,10 por millón de tokens y la guía de migración, USD 0,20. La
  app usa la página de precios.
- **Reglas de corte de anuncios** (apagar a 1,5 × el CPA máximo sin ventas,
  escalar 20 % cada 2–3 días): heurísticas de práctica habitual, marcadas así
  en el texto. Ajústalas con tus resultados.

## Archivos

| Archivo | Descripción |
|---|---|
| `index.html` | Interfaz: perfil, ruta de plantillas, resultado, conexión con Claude, conversación y ayuda |
| `styles.css` | Estilos (modo claro y oscuro, celular) |
| `app.js` | Formulario, filtros, diálogo de resultado, copiar y descargar |
| `motor.js` | Armado de prompts (XML o Markdown), loops, skills y ZIP sin dependencias |
| `plantillas.js` | Catálogo de las 26 plantillas y el kit completo |
| `claude.js` | Modelos, precios, costo estimado, presupuesto, solicitud y ejecución en streaming |
| `chat.js` | Ventana de conexión, conversación y «Mis conversaciones» |
| `markdown.js` | Muestra las respuestas con formato sin interpretar HTML del modelo |
| `vendor/` | SDK oficial de Anthropic empaquetado y su licencia |
| `tests/motor.test.js` | Pruebas del motor y las plantillas: `node tests/motor.test.js` |
| `tests/claude.test.js` | Pruebas de la conexión contra una API simulada: `node tests/claude.test.js` |
| `tests/prueba-real.js` | Prueba **real** con Haiku 5.5 (gasta ≈ USD 0,002; no es parte de las pruebas automáticas). Requiere `ANTHROPIC_API_KEY`: `node tests/prueba-real.js` |

Para agregar una plantilla, suma un objeto a `PLANTILLAS` en
`plantillas.js` con `tipo` (`prompt`, `skill` o `loop`), `etapa` (1 a 5),
`titulo`, `resumen` y `partes(perfil)`; las pruebas revisan que se genere
sin errores con perfil completo y vacío.
