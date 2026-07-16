# 🧠 Segundo cerebro — bóveda de Obsidian conectada a Claude

Tu segundo cerebro personal, siguiendo la plantilla «Segundo Cerebro con
Claude Code» (Claudio Conde). Vive en este repositorio, así que **Claude ya
está conectado a él**: cualquier sesión de Claude sobre este repo lo lee, lo
organiza y lo consulta antes de responder.

## Abrirlo en Obsidian

1. Instala [Obsidian](https://obsidian.md) → **Abrir carpeta como bóveda** →
   elige esta carpeta `segundo-cerebro/`.
2. Empieza por `WIKI/index.md`. El grafo (Ctrl/Cmd+G) muestra las conexiones.

## Cómo funciona

| Carpeta | Qué va aquí | Quién la escribe |
|---|---|---|
| `RAW/` | TODO lo que quieras que Claude sepa: ideas, correos, transcripciones, apuntes | **Tú** (regla de oro: no organices, solo tira información) |
| `WIKI/` | El conocimiento organizado, con enlaces `[[así]]` | **Solo Claude** (no la edites a mano) |
| `OUTPUTS/` | Síntesis y respuestas importantes, con fecha | Solo Claude |
| `CLAUDE.md` | Las reglas del bibliotecario | Claude, a petición |

## Frases que puedes decirle a Claude (el ciclo)

- **Añadir algo:** «Añade esto a RAW como nota sobre [tema]: …» — o crea tú
  mismo un `.md` en `RAW/` desde Obsidian.
- **Organizar:** «Lee todo RAW y actualiza la wiki del segundo cerebro.»
- **Consultar:** «Según mi segundo cerebro, ¿…?» — Claude busca en WIKI/ y
  RAW/ antes de responder.
- **Sintetizar:** «Dame los 3 mejores [X] que investigué; guarda la respuesta
  en OUTPUTS con la fecha.»
- **Patrones (cada ~30 días):** «Analiza RAW y dime en qué invierto más
  tiempo, qué problemas se repiten y qué 3 temas debería investigar. Guárdalo
  en OUTPUTS como patron-trabajo-[fecha].»
- **Health check (mensual):** «Revisa toda la wiki: contradicciones,
  afirmaciones sin fuente, temas sin página y los 3 artículos que faltan.
  Guárdalo en OUTPUTS como health-check-[fecha].»
- **Que se mejore solo:** «Con lo de hoy, actualiza el CLAUDE.md del segundo
  cerebro: amplía la sección Contexto personal sin borrar lo existente.»

## Diferencia con la bóveda `vault/`

- `vault/` = tus **tareas** (pendientes accionables, sincronizados con la app
  y Gmail).
- `segundo-cerebro/` = tu **conocimiento** (contexto, personas, causas,
  métodos, decisiones). Son dos bóvedas separadas de Obsidian.
