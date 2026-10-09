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
- **Reglas de corte de anuncios** (apagar a 1,5 × el CPA máximo sin ventas,
  escalar 20 % cada 2–3 días): heurísticas de práctica habitual, marcadas así
  en el texto. Ajústalas con tus resultados.

## Archivos

| Archivo | Descripción |
|---|---|
| `index.html` | Interfaz: perfil, ruta de plantillas, resultado y ayuda |
| `styles.css` | Estilos (modo claro y oscuro, celular) |
| `app.js` | Formulario, filtros, diálogo de resultado, copiar y descargar |
| `motor.js` | Armado de prompts (XML o Markdown), loops, skills y ZIP sin dependencias |
| `plantillas.js` | Catálogo de las 26 plantillas y el kit completo |
| `tests/motor.test.js` | Pruebas: `node tests/motor.test.js` |

Para agregar una plantilla, suma un objeto a `PLANTILLAS` en
`plantillas.js` con `tipo` (`prompt`, `skill` o `loop`), `etapa` (1 a 5),
`titulo`, `resumen` y `partes(perfil)`; las pruebas revisan que se genere
sin errores con perfil completo y vacío.
