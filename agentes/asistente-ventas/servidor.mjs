// Servidor del Asistente de Respuestas: conecta la cuenta del vendedor,
// recibe avisos de preguntas nuevas, pide a Claude un borrador y lo muestra en
// un panel para aprobarlo, editarlo o descartarlo.
//
// Configuración por variables de entorno (ver README):
//   ML_CLIENT_ID, ML_CLIENT_SECRET, ML_REDIRECT_URI   datos de la app registrada
//   ANTHROPIC_API_KEY                                 clave de la API de Claude
//   PANEL_CLAVE (obligatoria), PANEL_USUARIO (def. "vendedor")
//   AUTO_PUBLICAR=true    publica solo los borradores de confianza alta y sin alertas
//   POLITICAS             archivo con las políticas de la tienda (def. politicas.md)
//   DATOS                 carpeta de datos (def. ./datos)
//   PUERTO                (def. 8090)

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { ClienteML, crearPKCE } from "./api-ml.mjs";
import { redactarBorrador } from "./agente.mjs";

const require = createRequire(import.meta.url);
const Reglas = require("./reglas-respuesta.js");
const AQUI = path.dirname(fileURLToPath(import.meta.url));

const ESTATICOS = {
  "/": ["panel.html", "text/html; charset=utf-8"],
  "/panel.js": ["panel.js", "text/javascript; charset=utf-8"],
  "/reglas-respuesta.js": ["reglas-respuesta.js", "text/javascript; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
};

// Borradores guardados en un JSON. Se guarda lo mínimo: id y texto de la
// pregunta, publicación, borrador y estado. No se guardan datos del comprador.
export class Almacen {
  constructor(archivo) { this.archivo = archivo; this.datos = { borradores: {}, vendedor: null }; }
  async cargar() {
    try { this.datos = JSON.parse(await fs.readFile(this.archivo, "utf8")); } catch { /* primera vez */ }
    return this;
  }
  async guardar() {
    await fs.mkdir(path.dirname(this.archivo), { recursive: true });
    await fs.writeFile(this.archivo, JSON.stringify(this.datos, null, 1), { mode: 0o600 });
  }
  obtener(id) { return this.datos.borradores[id]; }
  async poner(id, cambios) {
    this.datos.borradores[id] = { ...(this.datos.borradores[id] || { id: String(id) }), ...cambios, actualizado: new Date().toISOString() };
    await this.guardar();
    return this.datos.borradores[id];
  }
  lista() {
    return Object.values(this.datos.borradores).sort((a, b) => String(b.recibida).localeCompare(String(a.recibida)));
  }
}

function json(res, estado, datos) {
  res.writeHead(estado, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(datos));
}

function leerCuerpo(req, max = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const partes = [];
    req.on("data", (c) => { total += c.length; if (total > max) { req.destroy(); reject(new Error("cuerpo demasiado grande")); } else partes.push(c); });
    req.on("end", () => resolve(Buffer.concat(partes).toString("utf8")));
    req.on("error", reject);
  });
}

function igualSeguro(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function crearServidor({
  ml, almacen, politicas = "", redactar = redactarBorrador,
  usuario = "vendedor", clave, autoPublicar = false, applicationId = null,
  registrar = (l) => console.log(JSON.stringify(l)),
}) {
  if (!clave) throw new Error("Falta PANEL_CLAVE: el panel no puede quedar abierto.");
  const pendientesOAuth = new Map(); // estado -> { verificador, t }
  let cola = Promise.resolve();
  const encolar = (tarea) => (cola = cola.then(tarea).catch((e) => console.error(e)));

  function autorizado(req) {
    const [tipo, valor] = String(req.headers.authorization || "").split(" ");
    if (tipo !== "Basic" || !valor) return false;
    const [u, ...resto] = Buffer.from(valor, "base64").toString("utf8").split(":");
    return igualSeguro(u, usuario) && igualSeguro(resto.join(":"), clave);
  }

  async function publicar(id, texto, auto = false) {
    const revision = Reglas.revisar(texto);
    await ml.responder(id, revision.texto);
    registrar({ evento: "respuesta_publicada", pregunta: id, auto });
    return almacen.poner(id, { estado: "publicada", respuesta: revision.texto, publicada: new Date().toISOString(), auto });
  }

  async function procesarPregunta(id) {
    id = String(id);
    const previa = almacen.obtener(id);
    if (previa && previa.estado !== "error") return previa; // los avisos se reintentan: no duplicar
    const q = await ml.pregunta(id);
    const vendedor = almacen.datos.vendedor;
    if (q.status !== "UNANSWERED" || (vendedor && q.seller_id && String(q.seller_id) !== String(vendedor.id))) return null;

    let publicacion = {};
    try { publicacion = await ml.publicacion(q.item_id); } catch { /* el panel muestra solo el ID */ }
    const base = {
      pregunta: q.text, item_id: q.item_id, titulo: publicacion.title || "", enlace: publicacion.permalink || "",
      recibida: q.date_created || new Date().toISOString(),
    };
    await almacen.poner(id, { ...base, estado: "redactando" });

    let b;
    try {
      b = await redactar({ pregunta: q, ml, politicas });
    } catch (error) {
      return almacen.poner(id, { estado: "error", error: error.message, respuesta: "" });
    }
    registrar({ evento: "borrador", pregunta: id, modelo: b.modelo, entrada: b.uso && b.uso.input_tokens, salida: b.uso && b.uso.output_tokens, confianza: b.confianza });
    const entrada = await almacen.poner(id, {
      estado: "pendiente", respuesta: b.respuesta, confianza: b.confianza, requiere_revision: b.requiere_revision,
      motivo_revision: b.motivo_revision, datos_usados: b.datos_usados, alertas: b.alertas, publicable_solo: b.publicable_solo, error: "",
    });
    if (!autoPublicar || !b.publicable_solo) return entrada;
    try {
      return await publicar(id, b.respuesta, true);
    } catch (error) {
      return almacen.poner(id, { error: `No se pudo publicar automáticamente: ${error.message}` });
    }
  }

  async function revisarPendientes() {
    const vendedor = almacen.datos.vendedor;
    if (!vendedor) throw new Error("Primero conecta la cuenta.");
    const r = await ml.preguntasSinResponder(vendedor.id);
    const nuevas = (r.questions || []).filter((q) => !almacen.obtener(String(q.id)) || almacen.obtener(String(q.id)).estado === "error");
    // Por la misma cola que los avisos: en serie (controla el gasto) y sin duplicar.
    for (const q of nuevas) await encolar(() => procesarPregunta(q.id));
    return nuevas.length;
  }

  const servidor = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
      // Avisos de la plataforma: se responde 200 de inmediato (el plazo es
      // corto) y la pregunta se procesa después, en cola.
      if (req.method === "POST" && url.pathname === "/notificaciones") {
        const cuerpo = await leerCuerpo(req).catch(() => "");
        json(res, 200, { ok: true });
        let aviso;
        try { aviso = JSON.parse(cuerpo); } catch { return; }
        if (applicationId && String(aviso.application_id) !== String(applicationId)) return;
        const m = aviso.topic === "questions" && /\/questions\/(\d+)/.exec(String(aviso.resource || ""));
        if (m) encolar(() => procesarPregunta(m[1]));
        return;
      }

      // Regreso desde la autorización: lo protege el `state` de un solo uso.
      if (req.method === "GET" && url.pathname === "/callback") {
        const estado = url.searchParams.get("state");
        const pendiente = pendientesOAuth.get(estado);
        pendientesOAuth.delete(estado);
        if (!pendiente || Date.now() - pendiente.t > 10 * 60_000) return json(res, 400, { error: "Autorización vencida o inválida. Vuelve a conectar." });
        await ml.canjearCodigo(url.searchParams.get("code"), pendiente.verificador);
        const u = await ml.usuario();
        almacen.datos.vendedor = { id: u.id, apodo: u.nickname || "" };
        await almacen.guardar();
        res.writeHead(302, { location: "/" });
        return res.end();
      }

      if (!autorizado(req)) {
        res.writeHead(401, { "www-authenticate": 'Basic realm="Asistente de Respuestas", charset="UTF-8"' });
        return res.end("Se requiere usuario y clave.");
      }

      if (req.method === "GET" && ESTATICOS[url.pathname]) {
        const [archivo, tipo] = ESTATICOS[url.pathname];
        res.writeHead(200, { "content-type": tipo });
        return res.end(await fs.readFile(path.join(AQUI, archivo)));
      }

      if (req.method === "GET" && url.pathname === "/conectar") {
        const { verificador, desafio } = crearPKCE();
        const estado = crypto.randomBytes(16).toString("hex");
        pendientesOAuth.set(estado, { verificador, t: Date.now() });
        res.writeHead(302, { location: ml.urlAutorizacion({ estado, desafio }) });
        return res.end();
      }

      if (req.method === "GET" && url.pathname === "/api/estado") {
        return json(res, 200, { conectado: ml.conectado(), vendedor: almacen.datos.vendedor, autoPublicar, politicas: Boolean(politicas.trim()) });
      }

      if (req.method === "GET" && url.pathname === "/api/borradores") {
        return json(res, 200, { borradores: almacen.lista() });
      }

      if (req.method === "POST" && url.pathname === "/api/revisar") {
        return json(res, 200, { nuevas: await revisarPendientes() });
      }

      const accion = /^\/api\/borradores\/(\d+)\/(publicar|descartar)$/.exec(url.pathname);
      if (req.method === "POST" && accion) {
        const [, id, que] = accion;
        const entrada = almacen.obtener(id);
        if (!entrada) return json(res, 404, { error: "Borrador no encontrado." });
        if (entrada.estado === "publicada") return json(res, 409, { error: "Esta pregunta ya fue respondida." });
        if (que === "descartar") return json(res, 200, await almacen.poner(id, { estado: "descartada" }));

        const datos = JSON.parse((await leerCuerpo(req)) || "{}");
        const revision = Reglas.revisar(datos.texto ?? entrada.respuesta);
        if (revision.bloqueada && !datos.forzar) {
          return json(res, 422, { error: "La respuesta tiene alertas que impiden publicarla.", alertas: revision.alertas });
        }
        return json(res, 200, await publicar(id, revision.texto));
      }

      json(res, 404, { error: "No encontrado." });
    } catch (error) {
      if (!res.headersSent) json(res, error.estado && error.estado < 500 ? error.estado : 500, { error: error.message });
    }
  });

  servidor.procesarPregunta = procesarPregunta;
  servidor.esperarCola = () => cola;
  return servidor;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dirDatos = process.env.DATOS || path.join(AQUI, "datos");
  const ml = new ClienteML({
    clientId: process.env.ML_CLIENT_ID, clientSecret: process.env.ML_CLIENT_SECRET,
    redirectUri: process.env.ML_REDIRECT_URI, archivoTokens: path.join(dirDatos, "tokens.json"),
  });
  await ml.cargarTokens();
  const almacen = await new Almacen(path.join(dirDatos, "borradores.json")).cargar();
  const politicas = await fs.readFile(process.env.POLITICAS || path.join(AQUI, "politicas.md"), "utf8").catch(() => "");
  const puerto = Number(process.env.PUERTO) || 8090;
  crearServidor({
    ml, almacen, politicas,
    usuario: process.env.PANEL_USUARIO || "vendedor", clave: process.env.PANEL_CLAVE,
    autoPublicar: process.env.AUTO_PUBLICAR === "true", applicationId: process.env.ML_CLIENT_ID || null,
  }).listen(puerto, () => console.log(`Asistente de Respuestas en http://localhost:${puerto}`));
}
