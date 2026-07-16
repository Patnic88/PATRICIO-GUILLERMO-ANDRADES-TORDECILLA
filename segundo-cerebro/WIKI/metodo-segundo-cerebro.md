# Método del segundo cerebro

Basado en la plantilla **«Segundo Cerebro con Claude Code»** de Claudio Conde
(PDF en el Google Drive de Patricio, compartido el 2026-07-14), inspirada en la
idea de archivos de texto de Andrej Karpathy.

## Las piezas

- `RAW/` — todo entra aquí, sin organizar (regla de oro: *no organices, solo
  tira información*).
- `WIKI/` — el conocimiento organizado; lo mantiene **solo Claude** (el
  bibliotecario): `index.md` + un tema por archivo + enlaces `[[así]]` +
  `changelog.md`.
- `OUTPUTS/` — síntesis y respuestas importantes, con fecha en el nombre.
- `CLAUDE.md` — las instrucciones del bibliotecario (el "cerebro del cerebro").

## El ciclo (efecto compuesto)

1. Tirar contexto a `RAW/` cada vez que aparezca algo valioso.
2. Pedir a Claude que reconstruya la `WIKI/` con lo nuevo.
3. Pedir síntesis («los 3 mejores X que investigué») → se guardan en `OUTPUTS/`.
4. Cada ~30 días: análisis de patrones; cada mes: health check de la wiki.
5. De vez en cuando: que Claude actualice su propio `CLAUDE.md` con los
   patrones detectados.

## Relación con Obsidian

Esta carpeta (`segundo-cerebro/`) es una bóveda de Obsidian: los `[[enlaces]]`
forman el grafo y las notas se editan igual desde Obsidian o desde Claude.

## Relacionado

- [[sistema-de-tareas]] — los pendientes operativos van allá, no aquí.
