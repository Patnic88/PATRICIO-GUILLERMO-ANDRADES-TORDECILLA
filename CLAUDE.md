# Guía para Claude

Repositorio de una lista de tareas (app web sin servidor) para la Dirección
Jurídica de la Municipalidad de Los Vilos, con integración a Gmail y a Obsidian.

## Fuente de datos

`tasks.seed.js` (`window.SEED_TASKS = [...]`) es la fuente de datos común.
La consumen tanto la app web (`index.html`) como la bóveda de Obsidian (`vault/`).

Cada tarea tiene: `id`, `titulo`, `detalle`, `categoria`
(Judicial · Convenios · Transparencia · Concejo · Administrativo · Otro),
`prioridad` (alta · media · baja), `vence` (AAAA-MM-DD, opcional), `de`,
`threadId` (hilo de Gmail) y `hecha`.

## Integración con Obsidian (`vault/`)

`vault/` es una bóveda de Obsidian. Cada tarea es una nota en `vault/Tareas/`
con los datos en el frontmatter YAML y una casilla `- [ ]`. El índice es
`vault/Tablero de Tareas.md` (generado, no editar a mano).

El puente es `obsidian-sync.js` (Node, sin dependencias):

- **Tareas → Obsidian:** `node obsidian-sync.js`  (regenera `vault/`)
- **Obsidian → Tareas:** `node obsidian-sync.js import`  (reescribe `tasks.seed.js`)

### Reglas
- Mantén `tasks.seed.js` y `vault/` sincronizados: si editas uno, ejecuta el
  comando correspondiente para actualizar el otro.
- Al actualizar tareas desde Gmail, edita `tasks.seed.js` y luego corre
  `node obsidian-sync.js` para reflejarlo en la bóveda.
- No edites `vault/Tablero de Tareas.md` a mano; se regenera.
