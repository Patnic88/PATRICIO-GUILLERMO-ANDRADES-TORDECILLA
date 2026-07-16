# 🗂️ Bóveda de Obsidian — Tareas de la Dirección Jurídica

Esta carpeta (`vault/`) es una **bóveda de Obsidian**. Cada tarea de la lista
(`tasks.seed.js` de la app) es aquí una nota Markdown dentro de `Tareas/`, con
sus datos en las **Propiedades** (frontmatter) y una casilla de verificación.

## Abrirla en Obsidian

1. Instala [Obsidian](https://obsidian.md) (gratis).
2. **Abrir carpeta como bóveda** → elige esta carpeta `vault/`.
3. Empieza por la nota **`Tablero de Tareas`**: es el índice de todo.

> La primera vez, Obsidian creará archivos de configuración dentro de
> `.obsidian/`. Es normal.

## Plugins recomendados (opcionales)

Desde *Ajustes → Plugins de la comunidad*:

- **Tasks** — agrupa todas las casillas pendientes en un solo lugar. El
  `Tablero de Tareas` ya trae una consulta lista para este plugin.
- **Dataview** — tablas dinámicas por prioridad/categoría (también hay una
  consulta preparada en el tablero).

Sin plugins también funciona: el tablero incluye listas y enlaces estáticos.

## Cómo se relaciona con la app y con Gmail

```
Gmail  ──(gmail-sync.gs)──►  tasks.seed.js  ◄──(obsidian-sync.js)──►  vault/  (Obsidian)
                                   │
                                   └──►  index.html  (la app web)
```

`tasks.seed.js` es la fuente de datos común. El script `obsidian-sync.js`
(en la raíz del repo) mantiene sincronizadas la app y esta bóveda:

| Quieres… | Ejecuta en la raíz del repo |
|---|---|
| Reflejar en Obsidian las tareas de la app | `node obsidian-sync.js` |
| Volcar a la app los cambios hechos en Obsidian | `node obsidian-sync.js import` |

O simplemente **pídeselo a Claude** ("actualiza la bóveda de Obsidian" /
"pasa mis cambios de Obsidian a la app").

## Reglas para que nada se pise

- **`Tablero de Tareas.md` se genera solo**: no lo edites a mano.
- Para editar una tarea, cambia sus **Propiedades** o su texto en la nota de
  `Tareas/`. Para marcarla como hecha, usa su **casilla** `- [ ]`.
- Tras editar en Obsidian, corre `node obsidian-sync.js import` para que la app
  se entere (y viceversa con `node obsidian-sync.js`).
- Para una tarea nueva, copia `Plantillas/Tarea.md` a `Tareas/`.
