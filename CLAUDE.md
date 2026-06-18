# CLAUDE.md

Guidance for AI assistants (Claude Code) working in this repository.

## What this is

A **serverless, single-page task list** for Patricio Andrades (Dirección
Jurídica — Municipalidad de Los Vilos). Tasks are derived from his recent Gmail
threads, and each task links back to its original email. There is **no backend,
no build step, and no dependencies** — it is plain HTML/CSS/vanilla JS that runs
by opening `index.html` directly in a browser (including from `file://`).

The entire UI and all content are in **Spanish (es-CL)**. Match this language
in code comments, UI strings, commit messages, and any task data you generate.

## Running it

There is nothing to install or build:

- Open `index.html` in a browser (double-click, or drag into a tab), **or**
- Serve the folder statically, e.g. `python3 -m http.server` and visit the page.

There are **no tests, linters, or package manager** in this repo. Do not add a
`package.json` or a build toolchain unless explicitly asked — the "no server,
no build" property is a core design goal.

## File structure

| File | Role |
|---|---|
| `index.html` | Page structure. Loads scripts in order: `config.js`, `tasks.seed.js`, `app.js`. |
| `styles.css` | All styling. CSS custom properties (`:root`) define the palette; priority colors are `--alta`/`--media`/`--baja`. |
| `app.js` | All app logic: persistence, filtering, sorting, rendering, events, optional Gmail sync. |
| `tasks.seed.js` | Seed data: `window.SEED_TASKS`, a snapshot of tasks extracted from Gmail. Editable. |
| `config.js` | Single config knob: `window.SYNC_URL` for optional Gmail auto-sync. |
| `gmail-sync.gs` | Google Apps Script (runs in the user's Google account) that serves labeled emails as JSON. Not part of the web bundle. |
| `README.md` | End-user docs, in Spanish. |

Scripts communicate through **globals on `window`** (`SEED_TASKS`, `SYNC_URL`),
not modules/imports. Keep that pattern — there is no bundler.

## How the app works

- **State**: a single `tareas` array in `app.js`, persisted to `localStorage`
  under the key `tareas_patricio_v1`. On load, `cargar()` reads localStorage;
  if empty/corrupt it falls back to a clone of `window.SEED_TASKS`.
- **Render flow**: `render()` runs `ordenar(filtrar(tareas))` and rebuilds the
  `<ul id="lista">` innerHTML. Sorting puts incomplete tasks first, then by
  priority (alta → media → baja).
- **Events** are delegated from `#lista`, `#filters`, and the form — re-rendering
  after each mutation. Mutations call `guardar()` then `render()`.
- **Security**: user/email-derived text is escaped via `escapar()` before being
  inserted into innerHTML. **Always route untrusted strings through `escapar()`**
  when adding new rendered fields — do not interpolate raw values into HTML.
- **IDs**: seed/Gmail tasks use `g-<threadId>`; manually-added tasks use
  `u-<timestamp>`. Sync logic relies on this prefix convention to preserve
  hand-added tasks — keep it.

## The task object shape

Every task (in `tasks.seed.js`, from Gmail sync, or created in the UI) has this
shape. Preserve it exactly when generating or editing tasks:

```js
{
  id: "g-<threadId>",        // unique id ("g-" from Gmail, "u-" if user-created)
  titulo: "...",             // what needs doing
  detalle: "...",            // context from the email
  categoria: "Judicial",     // Judicial | Convenios | Transparencia | Concejo | Administrativo | Otro
  prioridad: "alta",         // alta | media | baja
  vence: "2026-05-29",       // optional due date, format YYYY-MM-DD ("" if none)
  de: "remitente@...",       // sender email
  threadId: "19e7...",       // Gmail thread id, used to build the "Ver correo" link
  hecha: false               // completed flag
}
```

`GMAIL_BASE + threadId` (see `app.js`) builds the link that opens the original
thread in Gmail.

## Optional Gmail auto-sync

Two-part, opt-in feature:

1. `gmail-sync.gs` is deployed by the user as a Google Apps Script **Web App**.
   It reads threads with the Gmail label `📋 Tarea`, maps them to task objects
   (see `buildTasks()` / `guessCategory()`), and returns JSON. It supports a
   `?callback=` param for **JSONP** so the page works even from `file://`.
2. The user pastes the deployed `/exec` URL into `config.js` (`window.SYNC_URL`).

When `SYNC_URL` is set, `sincronizarConGmail()` injects a JSONP `<script>` on
load and `aplicarTareasRemotas()` merges results — **preserving** the `hecha`
state of existing tasks (by id) and any manually-added `u-` tasks. When
`SYNC_URL` is empty, the app just uses `tasks.seed.js`.

The label name (`LABEL_NAME = "📋 Tarea"`) and thread cap (`MAX_THREADS = 100`)
live at the top of `gmail-sync.gs`.

## Conventions

- **Spanish everywhere** — identifiers, comments, UI text, and dates
  (`toLocaleDateString("es-CL", ...)`). Don't anglicize existing names.
- **No dependencies / no build** — vanilla JS, scripts wired via `<script>`
  tags and `window` globals. Don't introduce frameworks, bundlers, or npm.
- **Escape before render** — untrusted text goes through `escapar()`.
- **Persist then render** — after mutating `tareas`, call `guardar()` then
  `render()`.
- Keep `index.html`'s script load order: `config.js` → `tasks.seed.js` → `app.js`.

## Updating tasks from email

`tasks.seed.js` is a point-in-time snapshot. To refresh it, re-read the user's
labeled/starred Gmail threads and regenerate `window.SEED_TASKS` following the
object shape above (use the real `threadId` so the "Ver correo" link works).
This repo's session has Gmail/Calendar MCP tools available for that.

## Git workflow

- Active development branch: **`claude/claude-md-docs-gl84c0`**. Develop, commit,
  and push there; do not push to other branches without explicit permission.
- Push with `git push -u origin <branch>`; after pushing, open a **draft** PR if
  none exists.
- Do not commit a real `window.SYNC_URL` value or other personal endpoints —
  keep `config.js` blank by default.
