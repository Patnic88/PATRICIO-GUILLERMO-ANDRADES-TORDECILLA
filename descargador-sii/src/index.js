#!/usr/bin/env node
// Descargador automático del SII (Chile).
// Punto de entrada: lee la configuración, abre el navegador, inicia sesión y
// descarga el RCV (CSV) de compras y ventas del periodo indicado, para cada RUT.

import { join } from "node:path";
import { mkdirSync, appendFileSync } from "node:fs";
import {
  RAIZ,
  cargarConfig,
  cargarRuts,
  resolverPeriodo,
  etiquetaPeriodo,
} from "./config.js";
import { abrirNavegador, asegurarLogin, procesarRut } from "./sii.js";

const PERFIL_DIR = join(RAIZ, ".perfil-navegador");

function ahora() {
  return new Date().toLocaleString("es-CL");
}

function crearLogger(rutaLog) {
  return (msg = "") => {
    console.log(msg);
    try {
      appendFileSync(rutaLog, `${msg}\n`);
    } catch {
      /* no romper si no se puede escribir el log */
    }
  };
}

async function main() {
  const cfg = cargarConfig();
  const ruts = cargarRuts();
  const periodo = resolverPeriodo(cfg.periodo);
  const etiqueta = etiquetaPeriodo(periodo);

  mkdirSync(cfg.carpetaDescargasAbs, { recursive: true });
  const rutaLog = join(cfg.carpetaDescargasAbs, `descarga_${etiqueta}.log`);
  const log = crearLogger(rutaLog);

  log("════════════════════════════════════════════════════════════════");
  log(`  Descargador SII — ${ahora()}`);
  log(`  Periodo: ${etiqueta}   |   RUT a procesar: ${ruts.length}`);
  log(`  Carpeta: ${cfg.carpetaDescargasAbs}`);
  log("════════════════════════════════════════════════════════════════");

  const contexto = await abrirNavegador(cfg, PERFIL_DIR);
  const page = contexto.pages()[0] || (await contexto.newPage());

  let totalArchivos = 0;
  const resumen = [];
  try {
    await asegurarLogin(page, cfg, log);

    for (const [i, { rut, nombre }] of ruts.entries()) {
      log("");
      log(`[${i + 1}/${ruts.length}] RUT ${rut}${nombre ? ` — ${nombre}` : ""}`);
      const baseDir = join(cfg.carpetaDescargasAbs, sanear(rut), etiqueta);
      let archivos = 0;
      try {
        archivos = await procesarRut(page, cfg, {
          rut,
          nombre,
          anio: periodo.anio,
          mes: periodo.mes,
          baseDir,
          log,
        });
      } catch (e) {
        log(`  ⚠ Error procesando ${rut}: ${e.message.split("\n")[0]}`);
      }
      totalArchivos += archivos;
      resumen.push({ rut, nombre, archivos });
    }
  } finally {
    await contexto.close().catch(() => {});
  }

  log("");
  log("──────────────────────── RESUMEN ────────────────────────");
  for (const r of resumen) {
    const estado = r.archivos > 0 ? `${r.archivos} archivo(s)` : "sin descargas";
    log(`  ${r.rut}${r.nombre ? ` (${r.nombre})` : ""}: ${estado}`);
  }
  log(`  TOTAL: ${totalArchivos} archivo(s) descargado(s).`);
  log(`  Guardado en: ${cfg.carpetaDescargasAbs}`);
  log("──────────────────────────────────────────────────────────");

  // Código de salida 0 si descargó algo, 2 si no descargó nada (para scripts).
  process.exit(totalArchivos > 0 ? 0 : 2);
}

function sanear(s) {
  return String(s).replace(/[^\w.-]+/g, "_");
}

main().catch((e) => {
  console.error("\n✗ Error fatal:", e.message);
  process.exit(1);
});
