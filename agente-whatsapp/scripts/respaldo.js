// Respaldo en caliente de la base de datos (VACUUM INTO) con fecha en el nombre.
// Uso: npm run respaldo   (programar una vez al día con cron o systemd timer)
import { join } from "node:path";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { cargarEnv, leerConfig } from "../src/config.js";
import { abrirDb } from "../src/db.js";

cargarEnv();
const cfg = leerConfig();
const dir = join(cfg.dirDatos, "respaldos");
mkdirSync(dir, { recursive: true });
const destino = join(dir, `agente-${new Date().toISOString().replace(/[:.]/g, "-")}.db`);
const db = abrirDb(join(cfg.dirDatos, "agente.db"));
db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
db.close();
// Conserva los 30 respaldos más recientes.
const archivos = readdirSync(dir).filter((f) => f.startsWith("agente-")).sort();
for (const f of archivos.slice(0, Math.max(0, archivos.length - 30))) rmSync(join(dir, f));
console.log(`Respaldo creado: ${destino}`);
console.log("Los documentos recibidos están en", join(cfg.dirDatos, "documentos"), "— inclúyalos en su copia externa.");
