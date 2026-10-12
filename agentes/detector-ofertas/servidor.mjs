// Servidor del Detector de Ofertas Falsas: sirve la interfaz y expone
// POST /api/analizar, que combina las reglas locales con el análisis de Claude.
//
// Uso: ANTHROPIC_API_KEY=... node servidor.mjs   (puerto: PUERTO, def. 8080)
//
// Variables opcionales (ver README):
//   CLAVES_CLIENTES   lista separada por comas; si existe, cada solicitud debe
//                     traer el encabezado x-clave-cliente con una de ellas.
//   LIMITE_POR_HORA   análisis con IA por clave (o IP) por hora. Def. 30.

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { analizarConIA as analizarReal, ErrorAnalisis } from "./analizar-ia.mjs";

const require = createRequire(import.meta.url);
const Senales = require("./senales.js");
const AQUI = path.dirname(fileURLToPath(import.meta.url));

// Solo estos archivos se sirven; el resto de la carpeta (código del servidor,
// package.json) queda fuera de alcance.
const ESTATICOS = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/senales.js": ["senales.js", "text/javascript; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
};

const TIPOS_IMAGEN = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_CUERPO = 8 * 1024 * 1024;
const MAX_TEXTO = 20000;

function responder(res, estado, datos) {
  res.writeHead(estado, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(datos));
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const partes = [];
    req.on("data", (c) => {
      total += c.length;
      if (total > MAX_CUERPO) { reject(new ErrorAnalisis("La solicitud es demasiado grande (máx. 8 MB).")); req.destroy(); }
      else partes.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(partes).toString("utf8")));
    req.on("error", reject);
  });
}

function validarEntrada(cuerpo) {
  let datos;
  try { datos = JSON.parse(cuerpo || "{}"); } catch { throw new ErrorAnalisis("El cuerpo no es JSON válido."); }
  const texto = typeof datos.texto === "string" ? datos.texto.slice(0, MAX_TEXTO) : "";
  let imagen = null;
  if (datos.imagen) {
    const { media_type, data } = datos.imagen;
    if (!TIPOS_IMAGEN.includes(media_type) || typeof data !== "string" || !data) {
      throw new ErrorAnalisis("La imagen debe ser PNG, JPG, WEBP o GIF.");
    }
    imagen = { media_type, data };
  }
  if (!texto.trim() && !imagen) throw new ErrorAnalisis("Pega el texto del aviso o adjunta una captura.");
  return { texto, imagen };
}

export function crearServidor({
  analizarConIA = analizarReal,
  claves = (process.env.CLAVES_CLIENTES || "").split(",").map((c) => c.trim()).filter(Boolean),
  limitePorHora = Number(process.env.LIMITE_POR_HORA) || 30,
  iaDisponible = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE),
  registrar = (linea) => console.log(JSON.stringify(linea)),
} = {}) {
  const usos = new Map(); // quién -> marcas de tiempo de la última hora

  function dentroDelLimite(quien) {
    const ahora = Date.now();
    const recientes = (usos.get(quien) || []).filter((t) => ahora - t < 3600_000);
    if (recientes.length >= limitePorHora) { usos.set(quien, recientes); return false; }
    recientes.push(ahora);
    usos.set(quien, recientes);
    return true;
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
      if (req.method === "GET" && ESTATICOS[url.pathname]) {
        const [archivo, tipo] = ESTATICOS[url.pathname];
        const contenido = await fs.readFile(path.join(AQUI, archivo));
        res.writeHead(200, { "content-type": tipo });
        return res.end(contenido);
      }

      if (req.method === "GET" && url.pathname === "/api/estado") {
        return responder(res, 200, { ia: iaDisponible, requiereClave: claves.length > 0 });
      }

      if (req.method === "POST" && url.pathname === "/api/analizar") {
        const clave = String(req.headers["x-clave-cliente"] || "");
        if (claves.length && !claves.includes(clave)) {
          return responder(res, 401, { error: "Clave de cliente inválida o ausente." });
        }
        const entrada = validarEntrada(await leerCuerpo(req));
        const reglas = Senales.analizar(entrada.texto);

        if (!iaDisponible) return responder(res, 200, { reglas, ia: null, avisoIA: "El servidor no tiene configurada la IA." });

        const quien = clave || req.socket.remoteAddress || "anonimo";
        if (!dentroDelLimite(quien)) {
          return responder(res, 429, { reglas, ia: null, error: "Llegaste al límite de análisis con IA por hora." });
        }

        try {
          const { resultado, modelo, uso } = await analizarConIA({ ...entrada, senalesLocales: reglas.senales });
          // Registro mínimo para facturar por uso: sin el contenido del aviso.
          registrar({ evento: "analisis", cliente: clave ? clave.slice(0, 4) + "…" : "sin-clave", modelo,
            entrada: uso && uso.input_tokens, salida: uso && uso.output_tokens, nivel: resultado.nivel_riesgo });
          return responder(res, 200, { reglas, ia: resultado });
        } catch (error) {
          return responder(res, 200, { reglas, ia: null, avisoIA: mensajeError(error) });
        }
      }

      responder(res, 404, { error: "No encontrado." });
    } catch (error) {
      if (error instanceof ErrorAnalisis) return responder(res, 400, { error: error.message });
      console.error(error);
      responder(res, 500, { error: "Error interno." });
    }
  });
}

function mensajeError(error) {
  if (error instanceof ErrorAnalisis) return error.message;
  if (error instanceof Anthropic.AuthenticationError) return "La clave de la API de Claude no es válida.";
  if (error instanceof Anthropic.RateLimitError) return "La IA está saturada en este momento. Intenta en un minuto.";
  if (error instanceof Anthropic.BadRequestError) return "La IA no pudo procesar este contenido (¿imagen dañada o muy grande?).";
  if (error instanceof Anthropic.APIError) return `La IA respondió con un error (${error.status}). Intenta de nuevo.`;
  return "No se pudo contactar a la IA. Se muestra solo el resultado de las reglas.";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const puerto = Number(process.env.PUERTO) || 8080;
  crearServidor().listen(puerto, () => console.log(`Detector de ofertas falsas en http://localhost:${puerto}`));
}
