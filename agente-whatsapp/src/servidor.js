// Servidor HTTP: webhook de WhatsApp, panel de administración y estado.

import http from "node:http";
import { pathToFileURL } from "node:url";
import { cargarEnv, leerConfig, validarConfig } from "./config.js";
import { crearApp } from "./app.js";
import { auditar, log } from "./servicios/auditoria.js";
import { verificarSuscripcion, firmaValida } from "./whatsapp/webhook.js";
import { manejarPanel } from "./panel/rutas.js";
import { ErrorHttp, leerCuerpo, cabecerasSeguridad, enviar, json, redirigir } from "./http-util.js";

export function crearServidor(app) {
  return http.createServer(async (req, res) => {
    cabecerasSeguridad(res);
    let url;
    try {
      url = new URL(req.url, "http://localhost");
    } catch {
      return enviar(res, 400, "url_invalida");
    }
    try {
      if (url.pathname === "/salud") {
        return json(res, { ok: true, modo: app.cfg.modo, proveedor_ia: app.ia.nombre, whatsapp_configurado: app.whatsapp.credenciales });
      }
      if (url.pathname === "/webhook/whatsapp") {
        if (req.method === "GET") {
          const reto = verificarSuscripcion(url.searchParams, app.cfg.whatsapp.verifyToken);
          auditar(app.db, { actor: "webhook", accion: "webhook.verificar", resultado: reto ? "ok" : "rechazado" });
          return reto ? enviar(res, 200, reto) : enviar(res, 403, "forbidden");
        }
        if (req.method === "POST") {
          const crudo = await leerCuerpo(req, 2_000_000);
          if (!firmaValida(crudo, req.headers["x-hub-signature-256"], app.cfg.whatsapp.appSecret)) {
            auditar(app.db, { actor: "webhook", accion: "webhook.firma", resultado: "rechazado", detalle: { ip: req.socket.remoteAddress } });
            return enviar(res, 401, "firma_invalida");
          }
          let payload;
          try { payload = JSON.parse(crudo.toString("utf8")); } catch { return enviar(res, 400, "json_invalido"); }
          app.procesador.ingresarWebhook(payload);
          return enviar(res, 200, "EVENT_RECEIVED");
        }
        return enviar(res, 405, "metodo_no_permitido");
      }
      if (url.pathname === "/") return redirigir(res, "/panel");
      if (url.pathname === "/favicon.ico") return enviar(res, 204, "");
      if (url.pathname === "/panel" || url.pathname.startsWith("/panel/")) return await manejarPanel(app, req, res, url);
      return enviar(res, 404, "no_encontrado");
    } catch (e) {
      if (e instanceof ErrorHttp) return enviar(res, e.estado, e.message);
      log("error", "error http", { ruta: url.pathname, error: String(e.stack || e) });
      if (!res.headersSent) enviar(res, 500, "error_interno");
    }
  });
}

// Arranque directo: `npm start`.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  cargarEnv();
  const cfg = leerConfig();
  const { errores, avisos } = validarConfig(cfg);
  for (const a of avisos) log("aviso", a);
  if (errores.length) {
    for (const e of errores) log("error", e);
    process.exit(1);
  }
  const app = crearApp({ cfg });
  app.procesador.iniciar();
  const servidor = crearServidor(app);
  servidor.listen(cfg.puerto, cfg.host, () => {
    log("info", "servicio iniciado", { url: `http://${cfg.host}:${cfg.puerto}`, modo: cfg.modo, proveedor_ia: app.ia.nombre, whatsapp_real: app.whatsapp.credenciales });
    if (cfg.modo === "prueba") log("info", "MODO PRUEBA: solo se envían mensajes reales a NUMEROS_PRUEBA; el resto queda simulado.");
  });
  // Un error no previsto se registra; no debe detener el servicio.
  process.on("unhandledRejection", (e) => log("error", "promesa rechazada sin manejar", { error: String(e?.stack || e) }));
  const cerrar = () => { app.procesador.detener(); servidor.close(() => { app.db.close(); process.exit(0); }); };
  process.on("SIGTERM", cerrar);
  process.on("SIGINT", cerrar);
}
