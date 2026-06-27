#!/usr/bin/env node
/*
 * Supervisor de Codex
 * -------------------
 * Lanza el agente Codex (la CLI de OpenAI) sobre una tarea y VIGILA su ejecución:
 *   - lo arranca con la instrucción que le des,
 *   - guarda todo lo que hace en un archivo de registro (logs/),
 *   - si Codex falla (termina con error o se cae), lo REINTENTA con esperas
 *     crecientes (backoff),
 *   - registra un historial de cada ejecución en history.json.
 *
 * No tiene dependencias: solo necesita Node.js (que ya tienes instalado) y la
 * CLI de Codex (ver README para instalarla).
 *
 * Uso rápido:
 *   node supervisor.js "Arregla los tests que están fallando"
 *   node supervisor.js --file tareas.txt          (una tarea por línea)
 *   node supervisor.js --help
 *
 * La configuración por defecto vive en config.json (se crea sola la 1ª vez).
 */

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const CONFIG_PATH = path.join(DIR, 'config.json');
const LOG_DIR = path.join(DIR, 'logs');
const HISTORY_PATH = path.join(DIR, 'history.json');

// --- Configuración por defecto -------------------------------------------
const DEFAULT_CONFIG = {
  // Comando de la CLI de Codex y los argumentos para correr en modo no
  // interactivo. Por defecto usamos `codex exec "<tarea>"`, que ejecuta una
  // tarea de principio a fin sin pedir confirmaciones.
  codexCommand: 'codex',
  codexArgs: ['exec'],
  // Cuántas veces reintentar si Codex falla, y cuánto esperar entre intentos.
  maxRetries: 3,
  retryBackoffSeconds: [10, 30, 60],
  // Si una ejecución supera estos minutos, se considera colgada y se corta.
  timeoutMinutes: 30,
  // Carpeta de trabajo donde Codex debe operar (por defecto, el directorio
  // padre de este supervisor: la raíz de tu proyecto).
  workingDir: '..',
};

// --- Utilidades ----------------------------------------------------------
function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
    log(`Creé un config.json con valores por defecto en ${CONFIG_PATH}`);
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return { ...DEFAULT_CONFIG, ...raw };
  } catch (e) {
    log(`⚠️  config.json no es JSON válido (${e.message}). Uso valores por defecto.`);
    return { ...DEFAULT_CONFIG };
  }
}

function timestamp() {
  return new Date().toISOString();
}

function log(msg) {
  process.stdout.write(`[${timestamp()}] ${msg}\n`);
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'tarea';
}

function appendHistory(entry) {
  let history = [];
  if (fs.existsSync(HISTORY_PATH)) {
    try {
      history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
    } catch {
      history = [];
    }
  }
  history.push(entry);
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2) + '\n');
}

function sleep(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

// --- Ejecución de una tarea bajo supervisión -----------------------------
function runCodexOnce(task, config, logStream) {
  return new Promise((resolve) => {
    const args = [...config.codexArgs, task];
    const cwd = path.resolve(DIR, config.workingDir);

    logStream.write(`\n===== INTENTO @ ${timestamp()} =====\n`);
    logStream.write(`$ ${config.codexCommand} ${args.join(' ')}\n`);
    logStream.write(`(directorio de trabajo: ${cwd})\n\n`);

    let child;
    try {
      child = spawn(config.codexCommand, args, {
        cwd,
        shell: process.platform === 'win32', // en Windows ayuda a resolver el .cmd
        env: process.env,
      });
    } catch (e) {
      logStream.write(`No se pudo lanzar Codex: ${e.message}\n`);
      return resolve({ ok: false, code: null, reason: `spawn_error: ${e.message}` });
    }

    let killedByTimeout = false;
    const timeoutMs = config.timeoutMinutes * 60 * 1000;
    const timer = setTimeout(() => {
      killedByTimeout = true;
      logStream.write(`\n⏱️  Tiempo excedido (${config.timeoutMinutes} min). Cortando Codex.\n`);
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.on('data', (d) => {
      process.stdout.write(d);
      logStream.write(d);
    });
    child.stderr.on('data', (d) => {
      process.stderr.write(d);
      logStream.write(d);
    });

    child.on('error', (e) => {
      clearTimeout(timer);
      logStream.write(`\nError al ejecutar Codex: ${e.message}\n`);
      const hint = e.code === 'ENOENT'
        ? 'comando_no_encontrado (¿está instalada la CLI de Codex y en el PATH?)'
        : e.message;
      resolve({ ok: false, code: null, reason: hint });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (killedByTimeout) {
        return resolve({ ok: false, code, reason: 'timeout' });
      }
      resolve({ ok: code === 0, code, reason: code === 0 ? 'ok' : `exit_${code}` });
    });
  });
}

async function superviseTask(task, config) {
  const slug = slugify(task);
  const stamp = timestamp().replace(/[:.]/g, '-');
  const logPath = path.join(LOG_DIR, `${stamp}_${slug}.log`);
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });

  log(`▶️  Tarea: "${task}"`);
  log(`   Registro: ${logPath}`);

  const startedAt = timestamp();
  let attempt = 0;
  let result;

  while (attempt <= config.maxRetries) {
    attempt += 1;
    if (attempt > 1) {
      const idx = Math.min(attempt - 2, config.retryBackoffSeconds.length - 1);
      const wait = config.retryBackoffSeconds[idx] ?? 30;
      log(`   Reintento ${attempt - 1}/${config.maxRetries} en ${wait}s…`);
      await sleep(wait);
    }
    result = await runCodexOnce(task, config, logStream);
    if (result.ok) break;
    log(`   ⚠️  Falló (${result.reason}).`);
    if (result.reason && result.reason.startsWith('comando_no_encontrado')) {
      log('   ⛔ Codex no está instalado o no está en el PATH. No tiene sentido reintentar.');
      break;
    }
  }

  logStream.end();
  const finishedAt = timestamp();

  const entry = {
    task,
    startedAt,
    finishedAt,
    attempts: attempt,
    success: !!result.ok,
    lastReason: result.reason,
    log: path.relative(DIR, logPath),
  };
  appendHistory(entry);

  if (result.ok) {
    log(`   ✅ Completada tras ${attempt} intento(s).`);
  } else {
    log(`   ❌ No se completó tras ${attempt} intento(s). Último motivo: ${result.reason}`);
  }
  return entry;
}

// --- Manejo de argumentos -----------------------------------------------
function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { tasks: [], file: null, help: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--file' || a === '-f') opts.file = args[++i];
    else opts.tasks.push(a);
  }
  return opts;
}

function printHelp() {
  process.stdout.write(`
Supervisor de Codex — lanza y vigila al agente Codex sobre tus tareas.

USO:
  node supervisor.js "Tu instrucción para Codex"
  node supervisor.js --file tareas.txt     (una tarea por línea; '#' = comentario)
  node supervisor.js --help

QUÉ HACE:
  • Ejecuta Codex con tu tarea y muestra/guarda todo en logs/.
  • Si falla, reintenta con esperas crecientes (config.json → maxRetries).
  • Corta la ejecución si se cuelga (config.json → timeoutMinutes).
  • Anota cada ejecución en history.json.

CONFIGURACIÓN:
  Edita config.json (se crea solo la 1ª vez). Allí defines el comando de Codex,
  reintentos, tiempo máximo y la carpeta de trabajo.

REQUISITOS:
  • Node.js (ya lo tienes).
  • La CLI de Codex instalada y autenticada (ver README.md).
`);
}

function readTaskFile(file) {
  const abs = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
  const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
  return lines
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

// --- Punto de entrada ----------------------------------------------------
async function main() {
  const opts = parseArgs(process.argv);

  if (opts.help) {
    printHelp();
    return;
  }

  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  const config = loadConfig();

  let tasks = opts.tasks;
  if (opts.file) {
    try {
      tasks = tasks.concat(readTaskFile(opts.file));
    } catch (e) {
      log(`⛔ No pude leer el archivo de tareas "${opts.file}": ${e.message}`);
      process.exit(1);
    }
  }

  if (tasks.length === 0) {
    log('No me diste ninguna tarea.');
    printHelp();
    process.exit(1);
  }

  log(`Supervisor iniciado. ${tasks.length} tarea(s) en cola.`);
  log(`Comando de Codex: "${config.codexCommand} ${config.codexArgs.join(' ')} <tarea>"`);

  const results = [];
  for (const task of tasks) {
    results.push(await superviseTask(task, config));
  }

  const ok = results.filter((r) => r.success).length;
  const fail = results.length - ok;
  log(`Listo. Completadas: ${ok}. Con problemas: ${fail}. Historial en history.json.`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  log(`Error inesperado en el supervisor: ${e.stack || e.message}`);
  process.exit(1);
});
