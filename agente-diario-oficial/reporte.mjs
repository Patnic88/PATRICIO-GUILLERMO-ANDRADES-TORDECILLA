#!/usr/bin/env node
// Agente Diario Oficial — ejecutor para Claude (rutina diaria o skill).
//
// Reutiliza la lógica de diario-oficial.gs (el mismo archivo que corre en
// Apps Script): lee la edición electrónica, arma el reporte y lo deja en
// archivos para que Claude lo envíe con el conector de Gmail. Este programa
// no envía correos.
//
// Uso:
//   node reporte.mjs --salida <dir> [--fecha DD-MM-AAAA] [--reintentos 2]
//                    [--espera-seg 240] [--base-url <url>]
//
// Escribe en <dir>: reporte.html, reporte.txt y resultado.json. El mismo
// JSON se imprime por stdout. Código de salida 0 = hay correo listo para
// enviar ("reporte" o "aviso"); 1 = falla interna (JSON con accion "error").

import { readFileSync, writeFileSync, mkdirSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const AQUI = dirname(fileURLToPath(import.meta.url));

const FIRMA = "Generado por el agente Diario Oficial (rutina diaria de Claude).";
const AYUDA_FALLA = "Si se repite, revisa que www.diariooficial.interior.gob.cl esté permitido "
  + "en la red del entorno de Claude (Network access → Allowed domains).";

// ---------------------------------------------------------------------------
// Equivalentes mínimos de los servicios de Apps Script que usa el .gs
// ---------------------------------------------------------------------------

const Utilities = {
  formatDate(date, tz, fmt) {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23"
      }).formatToParts(date).map((x) => [x.type, x.value])
    );
    if (fmt === "H") return String(parseInt(p.hour, 10));
    return fmt.replace("yyyy", p.year).replace("MM", p.month).replace("dd", p.day)
      .replace("HH", p.hour).replace("mm", p.minute);
  },
  sleep(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  }
};

/** Descarga con curl (respeta HTTPS_PROXY y el CA del entorno). */
function fetchConCurl(url) {
  const dir = mkdtempSync(join(tmpdir(), "diario-oficial-"));
  const cuerpo = join(dir, "cuerpo");
  const cabeceras = join(dir, "cabeceras");
  try {
    let code;
    try {
      code = execFileSync("curl", [
        "-sS", "-L", "--max-time", "60", "-o", cuerpo, "-D", cabeceras, "-w", "%{http_code}", url
      ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) {
      const detalle = String(err.stderr || err.message).trim();
      if (/CONNECT tunnel failed, response 40[37]/.test(detalle)) {
        throw new Error("bloqueado por la red del entorno de Claude (el proxy rechazó "
          + new URL(url).host + "); hay que permitir el dominio en Network access → Allowed domains");
      }
      throw new Error(detalle.replace(/^curl:\s*/, "curl: "));
    }
    const buf = existsSync(cuerpo) ? readFileSync(cuerpo) : Buffer.alloc(0);
    const headers = {};
    const bloques = (existsSync(cabeceras) ? readFileSync(cabeceras, "latin1") : "").split(/\r?\n\r?\n/).filter(Boolean);
    (bloques[bloques.length - 1] || "").split(/\r?\n/).slice(1).forEach((linea) => {
      const i = linea.indexOf(":");
      if (i > 0) headers[linea.slice(0, i).trim().toLowerCase()] = linea.slice(i + 1).trim();
    });
    return {
      getResponseCode: () => parseInt(code, 10) || 0,
      getContentText: () => buf.toString("utf8"),
      getBlob: () => ({
        getDataAsString: (cs) => buf.toString(/8859|latin/i.test(cs || "") ? "latin1" : "utf8")
      }),
      getHeaders: () => headers
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const noDisponible = (nombre) => new Proxy({}, {
  get: () => () => { throw new Error(nombre + " no está disponible en el ejecutor de Claude"); }
});

/** Carga diario-oficial.gs en un sandbox y devuelve sus funciones. */
export function cargarAgente() {
  const ruta = [join(AQUI, "diario-oficial.gs"), join(AQUI, "..", "diario-oficial.gs")].find(existsSync);
  if (!ruta) throw new Error("No encontré diario-oficial.gs junto a reporte.mjs ni en el directorio superior");
  const codigo = readFileSync(ruta, "utf8");
  return new Function(
    "Utilities", "UrlFetchApp", "Logger", "MailApp", "PropertiesService", "ScriptApp",
    codigo +
    "\nreturn { leerSeccion: leerSeccion, construirReporte: construirReporte," +
    " construirAviso: construirAviso, edicionEsDeHoy: edicionEsDeHoy, fechaChile: fechaChile," +
    " secciones: function () { return DO_SECCIONES; }," +
    " destinatarios: function () { return { para: DIGEST_TO, cc: DIGEST_CC }; }," +
    " configurar: function (o) {" +
    "   if (o.baseUrl) DO_BASE_URL = o.baseUrl;" +
    "   if (o.firma) DO_FIRMA = o.firma;" +
    "   if (o.ayudaFalla) DO_AYUDA_FALLA = o.ayudaFalla;" +
    " } };"
  )(
    Utilities, { fetch: (url) => fetchConCurl(url) }, { log: (m) => console.error(m) },
    noDisponible("MailApp"), noDisponible("PropertiesService"), noDisponible("ScriptApp")
  );
}

const lista = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
const esBloqueo = (r) => /bloqueado por la red del entorno/.test(r.error || "");

/**
 * Lee el Diario Oficial y deja el correo listo en `salida`.
 * Devuelve el resumen que también se guarda en resultado.json.
 */
export async function generar({ salida, fecha, reintentos = 2, esperaSeg = 240, baseUrl } = {}) {
  const agente = cargarAgente();
  agente.configurar({ baseUrl, firma: FIRMA, ayudaFalla: AYUDA_FALLA });
  const hoy = fecha || agente.fechaChile(new Date());
  const [principalSec, ...resto] = agente.secciones();

  // Si la edición de hoy aún no aparece, se espera y se reintenta (salvo que
  // la red del entorno bloquee el sitio: reintentar no cambia nada).
  let principal = agente.leerSeccion(principalSec);
  for (let i = 0; i < reintentos && !agente.edicionEsDeHoy(principal, hoy) && !esBloqueo(principal); i++) {
    console.error(`Edición de hoy no disponible (estado: ${principal.estado}, fecha: ${principal.fecha || "?"}); reintento en ${esperaSeg} s`);
    await new Promise((r) => setTimeout(r, esperaSeg * 1000));
    principal = agente.leerSeccion(principalSec);
  }

  let accion, msg, leidas;
  if (agente.edicionEsDeHoy(principal, hoy)) {
    leidas = [principal, ...resto.map((sec) => agente.leerSeccion(sec))];
    msg = agente.construirReporte(leidas, hoy);
    accion = "reporte";
  } else {
    leidas = [principal];
    msg = agente.construirAviso(principal, hoy);
    accion = "aviso";
  }

  mkdirSync(salida, { recursive: true });
  const archivos = { html: join(salida, "reporte.html"), texto: join(salida, "reporte.txt") };
  writeFileSync(archivos.html, msg.html);
  writeFileSync(archivos.texto, msg.plain);

  const { para, cc } = agente.destinatarios();
  const resumen = {
    accion,
    asunto: msg.subject,
    para: lista(para),
    cc: lista(cc),
    hoy,
    fechaEdicion: principal.fecha || "",
    edicion: principal.edicion || "",
    archivos,
    secciones: leidas.map((r) => ({
      id: r.seccion.id, estado: r.estado, http: r.http, error: r.error || "", publicaciones: r.items.length
    }))
  };
  writeFileSync(join(salida, "resultado.json"), JSON.stringify(resumen, null, 2));
  return resumen;
}

function leerArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const clave = argv[i].replace(/^--/, "");
    const valor = argv[i + 1];
    if (!argv[i].startsWith("--") || valor === undefined) throw new Error("Argumento inválido: " + argv[i]);
    i++;
    if (clave === "salida") o.salida = resolve(valor);
    else if (clave === "fecha") o.fecha = valor;
    else if (clave === "reintentos") o.reintentos = parseInt(valor, 10);
    else if (clave === "espera-seg") o.esperaSeg = parseInt(valor, 10);
    else if (clave === "base-url") o.baseUrl = valor;
    else throw new Error("Opción desconocida: --" + clave);
  }
  if (!o.salida) o.salida = mkdtempSync(join(tmpdir(), "reporte-diario-oficial-"));
  return o;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const resumen = await generar(leerArgs(process.argv.slice(2)));
    console.log(JSON.stringify(resumen, null, 2));
  } catch (err) {
    console.log(JSON.stringify({ accion: "error", error: String((err && err.message) || err) }, null, 2));
    process.exit(1);
  }
}
