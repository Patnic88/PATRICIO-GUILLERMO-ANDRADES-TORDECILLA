#!/usr/bin/env node
/**
 * obsidian-sync.js — Puente entre la lista de tareas y una bóveda de Obsidian.
 * ---------------------------------------------------------------------------
 * La bóveda vive en ./vault y contiene:
 *   - una nota Markdown por tarea dentro de "Tareas/"
 *   - un "Tablero de Tareas.md" con el resumen
 *
 * Cada nota guarda los datos de la tarea en el frontmatter YAML (las
 * "Propiedades" de Obsidian) y una casilla de verificación compatible con el
 * plugin Tasks. Así puedes abrir la carpeta ./vault como bóveda en Obsidian y,
 * a la vez, Claude puede leer y editar las mismas notas.
 *
 * Uso (no requiere dependencias externas, solo Node.js):
 *   node obsidian-sync.js            # exporta:  tasks.seed.js  ->  vault/
 *   node obsidian-sync.js export     # (igual que lo anterior)
 *   node obsidian-sync.js import     # importa:  vault/  ->  tasks.seed.js
 *   node obsidian-sync.js import <archivo>   # importa a otro archivo (pruebas)
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SEED_PATH = path.join(ROOT, 'tasks.seed.js');
const VAULT = path.join(ROOT, 'vault');
const TAREAS_DIR = path.join(VAULT, 'Tareas');
const DASHBOARD = path.join(VAULT, 'Tablero de Tareas.md');
const GMAIL_BASE = 'https://mail.google.com/mail/u/0/#all/';

const PRIO_EMOJI = { alta: '⏫', media: '🔼', baja: '🔽' };
const PRIO_PESO = { alta: 0, media: 1, baja: 2 };

// ---- utilidades ----------------------------------------------------------

function slugify(s) {
  return (
    String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // quita acentos
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/g, '') || 'tarea'
  );
}

// Envuelve un valor como cadena YAML entre comillas dobles y escapa lo necesario.
function yamlStr(s) {
  return '"' + String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

// Revierte una cadena YAML entre comillas dobles.
function unquote(v) {
  v = String(v).trim();
  if (v.length >= 2 && v[0] === '"' && v[v.length - 1] === '"') {
    return v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return v;
}

// ---- carga de la semilla (tasks.seed.js) ---------------------------------

function loadSeed() {
  const code = fs.readFileSync(SEED_PATH, 'utf8');
  // tasks.seed.js hace `window.SEED_TASKS = [...]`; le pasamos un window falso.
  const fn = new Function('window', code + '\n;return window.SEED_TASKS;');
  return fn({}) || [];
}

// ---- generación de notas (export) ----------------------------------------

function noteFilename(t) {
  return slugify(t.titulo) + '.md';
}

function taskLine(t) {
  const box = t.hecha ? '[x]' : '[ ]';
  let line = `- ${box} ${t.titulo}`;
  const emo = PRIO_EMOJI[t.prioridad];
  if (emo) line += ' ' + emo;
  if (t.vence) line += ' 📅 ' + t.vence;
  return line;
}

function renderNote(t) {
  const gmail = t.threadId ? GMAIL_BASE + t.threadId : '';
  const tags = ['tarea', slugify(t.categoria || 'otro')];
  const fm = [
    '---',
    'id: ' + yamlStr(t.id),
    'titulo: ' + yamlStr(t.titulo),
    'detalle: ' + yamlStr(t.detalle),
    'categoria: ' + (t.categoria || 'Otro'),
    'prioridad: ' + (t.prioridad || 'media'),
    'vence: ' + (t.vence ? t.vence : '""'),
    'de: ' + yamlStr(t.de),
    'threadId: ' + yamlStr(t.threadId),
    'hecha: ' + (t.hecha ? 'true' : 'false'),
    'gmail: ' + yamlStr(gmail),
    'tags:',
    ...tags.map((x) => '  - ' + x),
    '---',
    '',
  ].join('\n');

  const body = ['', '# ' + t.titulo, ''];
  if (t.detalle) {
    body.push('> [!info] Contexto del correo');
    t.detalle.split(/\r?\n/).forEach((l) => body.push('> ' + l));
    body.push('');
  }
  body.push(taskLine(t));
  body.push('');

  const meta = [];
  meta.push(
    '**Categoría:** ' +
      (t.categoria || 'Otro') +
      ' · **Prioridad:** ' +
      (t.prioridad || 'media') +
      (t.vence ? ' · **Vence:** ' + t.vence : '')
  );
  if (t.de) meta.push('**De:** ' + t.de);
  if (gmail) meta.push('[🔗 Ver correo en Gmail](' + gmail + ')');
  body.push(meta.join('  \n')); // dos espacios = salto de línea en Markdown
  body.push('');

  return fm + body.join('\n');
}

function renderDashboard(tasks) {
  const pend = tasks.filter((t) => !t.hecha);
  const done = tasks.filter((t) => t.hecha);
  const byPrio = (p) =>
    pend
      .filter((t) => t.prioridad === p)
      .sort((a, b) => (a.vence || '9999').localeCompare(b.vence || '9999'));

  const L = [];
  L.push('# 📋 Tablero de Tareas');
  L.push('');
  L.push('> Patricio Andrades · Dirección Jurídica — Municipalidad de Los Vilos');
  L.push('');
  L.push(`**${pend.length}** pendientes · **${done.length}** completadas · **${tasks.length}** en total`);
  L.push('');
  L.push('_Este tablero se genera con `node obsidian-sync.js`. No lo edites a mano: edita cada tarea o vuelve a exportar._');
  L.push('');

  const linkItem = (t) => {
    const slug = slugify(t.titulo);
    const venc = t.vence ? ` · 📅 ${t.vence}` : '';
    return `- [[Tareas/${slug}|${t.titulo}]] — ${t.categoria}${venc}`;
  };

  for (const p of ['alta', 'media', 'baja']) {
    const arr = byPrio(p);
    if (!arr.length) continue;
    L.push(`## ${PRIO_EMOJI[p]} Prioridad ${p}`);
    L.push('');
    arr.forEach((t) => L.push(linkItem(t)));
    L.push('');
  }

  if (done.length) {
    L.push('## ✅ Completadas');
    L.push('');
    done.forEach((t) => L.push(`- [[Tareas/${slugify(t.titulo)}|${t.titulo}]]`));
    L.push('');
  }

  L.push('---');
  L.push('');
  L.push('## 🔎 Consultas dinámicas (opcionales)');
  L.push('');
  L.push('Si instalas el plugin **Tasks**, esta consulta reúne todas las casillas pendientes de la bóveda:');
  L.push('');
  L.push('```tasks');
  L.push('not done');
  L.push('path includes Tareas');
  L.push('sort by priority');
  L.push('```');
  L.push('');
  L.push('Si instalas el plugin **Dataview**, esta tabla lista las tareas por prioridad:');
  L.push('');
  L.push('```dataview');
  L.push('TABLE prioridad AS "Prioridad", categoria AS "Categoría", vence AS "Vence"');
  L.push('FROM "Tareas"');
  L.push('WHERE hecha = false');
  L.push('SORT prioridad ASC, vence ASC');
  L.push('```');
  L.push('');
  return L.join('\n');
}

function exportVault() {
  const tasks = loadSeed();
  fs.mkdirSync(TAREAS_DIR, { recursive: true });

  const written = new Set();
  for (const t of tasks) {
    const name = noteFilename(t);
    fs.writeFileSync(path.join(TAREAS_DIR, name), renderNote(t), 'utf8');
    written.add(name);
  }
  fs.writeFileSync(DASHBOARD, renderDashboard(tasks), 'utf8');

  const existing = fs.readdirSync(TAREAS_DIR).filter((f) => f.endsWith('.md'));
  const orphans = existing.filter((f) => !written.has(f));
  console.log(`✔ Exportadas ${tasks.length} tareas a ${path.relative(ROOT, TAREAS_DIR)}/`);
  console.log(`✔ Tablero: ${path.relative(ROOT, DASHBOARD)}`);
  if (orphans.length) {
    console.log(`⚠ Notas sin tarea asociada en tasks.seed.js (revísalas y bórralas si quieres): ${orphans.join(', ')}`);
  }
}

// ---- lectura de notas (import) -------------------------------------------

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  const data = {};
  if (!m) return data;
  let curKey = null;
  for (const raw of m[1].split('\n')) {
    const listItem = raw.match(/^\s+-\s+(.*)$/);
    if (listItem && curKey) {
      (data[curKey] = data[curKey] || []).push(unquote(listItem[1]));
      continue;
    }
    const kv = raw.match(/^(\w+):\s*(.*)$/);
    if (kv) {
      curKey = kv[1];
      data[curKey] = kv[2] === '' ? '' : unquote(kv[2]);
    }
  }
  return data;
}

function parseChecked(text) {
  const body = text.replace(/^---\n[\s\S]*?\n---/, '');
  const m = body.match(/^- \[( |x|X)\]/m);
  if (!m) return null;
  return m[1].toLowerCase() === 'x';
}

function serializeSeed(tasks) {
  const header =
    '// Tareas extraídas de los correos recientes de Gmail (al 2026-06-01).\n' +
    '// Cada tarea enlaza al hilo original mediante su threadId de Gmail.\n' +
    '// Para regenerar o ampliar esta lista, pídele a Claude que vuelva a revisar\n' +
    '// tus correos etiquetados o destacados.\n' +
    '// (Se sincroniza con la bóveda de Obsidian mediante obsidian-sync.js.)\n' +
    'window.SEED_TASKS = [\n';
  const order = ['id', 'titulo', 'detalle', 'categoria', 'prioridad', 'vence', 'de', 'threadId', 'hecha'];
  const body = tasks
    .map((t) => {
      const inner = order
        .map((k) => {
          const val = k === 'hecha' ? (t[k] ? 'true' : 'false') : JSON.stringify(t[k] == null ? '' : t[k]);
          return `    ${k}: ${val}`;
        })
        .join(',\n');
      return '  {\n' + inner + '\n  }';
    })
    .join(',\n');
  return header + body + '\n];\n';
}

function importVault(outPath) {
  const files = fs.readdirSync(TAREAS_DIR).filter((f) => f.endsWith('.md'));
  const tasks = [];
  for (const f of files) {
    const text = fs.readFileSync(path.join(TAREAS_DIR, f), 'utf8');
    const fm = parseFrontmatter(text);
    if (!fm.titulo && !fm.id) continue; // no parece una nota de tarea
    const checked = parseChecked(text);
    tasks.push({
      id: fm.id || 'u-' + slugify(fm.titulo || f),
      titulo: fm.titulo || '',
      detalle: fm.detalle || '',
      categoria: fm.categoria || 'Otro',
      prioridad: fm.prioridad || 'media',
      vence: fm.vence || '',
      de: fm.de || '',
      threadId: fm.threadId || '',
      hecha: checked != null ? checked : fm.hecha === 'true' || fm.hecha === true,
    });
  }
  tasks.sort((a, b) => {
    if (a.hecha !== b.hecha) return a.hecha ? 1 : -1;
    return (PRIO_PESO[a.prioridad] ?? 3) - (PRIO_PESO[b.prioridad] ?? 3);
  });
  fs.writeFileSync(outPath, serializeSeed(tasks), 'utf8');
  console.log(`✔ Importadas ${tasks.length} tareas desde ${path.relative(ROOT, TAREAS_DIR)}/ → ${path.relative(ROOT, outPath)}`);
}

// ---- CLI -----------------------------------------------------------------

const cmd = (process.argv[2] || 'export').toLowerCase();
if (cmd === 'export') {
  exportVault();
} else if (cmd === 'import') {
  importVault(process.argv[3] ? path.resolve(process.argv[3]) : SEED_PATH);
} else {
  console.error('Comando desconocido. Usa:  node obsidian-sync.js [export|import]');
  process.exit(1);
}
