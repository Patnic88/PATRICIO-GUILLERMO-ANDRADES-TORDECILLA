// Configuración del servicio. Todo se lee desde variables de entorno (archivo
// .env opcional). Ningún secreto se escribe en el código ni en el repositorio.

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Carga un archivo .env simple (CLAVE=valor). No sobrescribe variables ya
// definidas en el entorno del proceso.
export function cargarEnv(ruta = resolve(RAIZ, ".env")) {
  if (!existsSync(ruta)) return;
  for (const linea of readFileSync(ruta, "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || linea.trim().startsWith("#")) continue;
    let valor = m[2];
    if (/^".*"$|^'.*'$/.test(valor)) valor = valor.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = valor;
  }
}

const lista = (v) => (v || "").split(",").map((s) => s.trim()).filter(Boolean);
const entero = (v, def) => (v === undefined || v === "" ? def : Number.parseInt(v, 10));
const booleano = (v, def) => (v === undefined || v === "" ? def : /^(1|true|si|sí|yes)$/i.test(v));

export function leerConfig(env = process.env) {
  const modo = (env.MODO || "prueba").toLowerCase();
  const cfg = {
    modo, // "prueba" | "produccion"
    puerto: entero(env.PUERTO, 3000),
    host: env.HOST || "127.0.0.1",
    dirDatos: resolve(RAIZ, env.DIR_DATOS || "data"),
    urlPublica: env.URL_PUBLICA || "",
    zonaHoraria: env.ZONA_HORARIA || "America/Santiago",

    whatsapp: {
      token: env.WHATSAPP_TOKEN || "",
      phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || "",
      appSecret: env.WHATSAPP_APP_SECRET || "",
      verifyToken: env.WHATSAPP_VERIFY_TOKEN || "",
      apiVersion: env.WHATSAPP_API_VERSION || "v26.0",
      graphUrl: env.WHATSAPP_GRAPH_URL || "https://graph.facebook.com",
      // En modo prueba solo se envían mensajes reales a estos números.
      numerosPrueba: lista(env.NUMEROS_PRUEBA).map((n) => n.replace(/\D/g, "")),
      maxBytesMedia: entero(env.MAX_MB_ARCHIVO, 16) * 1024 * 1024
    },

    ia: {
      proveedor: (env.IA_PROVEEDOR || "simulado").toLowerCase(), // "anthropic" | "simulado"
      apiKey: env.ANTHROPIC_API_KEY || "",
      baseUrl: env.IA_BASE_URL || "",
      modelo: env.IA_MODELO || "claude-opus-5-5",
      esfuerzo: env.IA_ESFUERZO || "medium",
      fallbacks: booleano(env.IA_FALLBACKS, true),
      // El contexto interno (memoria del cliente) se envía como mensaje de
      // sistema intermedio; desactivar si el modelo elegido no lo admite.
      contextoComoSistema: booleano(env.IA_CONTEXTO_COMO_SISTEMA, true),
      maxIteraciones: entero(env.IA_MAX_ITERACIONES, 6),
      timeoutMs: entero(env.IA_TIMEOUT_MS, 90_000)
    },

    admin: {
      usuario: env.ADMIN_USUARIO || "patricio",
      claveHash: env.ADMIN_CLAVE_HASH || "",
      cookieSegura: booleano(env.COOKIE_SEGURA, modo === "produccion"),
      // Detrás de un proxy (Caddy) la IP real viene en X-Forwarded-For.
      confiarProxy: booleano(env.CONFIAR_PROXY, false),
      sesionHoras: entero(env.SESION_HORAS, 12)
    },

    agente: {
      debounceMs: entero(env.DEBOUNCE_MS, 3000),
      historialMensajes: entero(env.HISTORIAL_MENSAJES, 30),
      // Ventana de memoria de la conversación cuando la identidad NO está
      // verificada: solo se usa lo que el contacto dijo en este lapso.
      memoriaSesionHoras: entero(env.MEMORIA_SESION_HORAS, 72),
      verificacionHoras: entero(env.VERIFICACION_HORAS, 12),
      intentosVerificacion: entero(env.INTENTOS_VERIFICACION, 3),
      // Intentos fallidos contra un mismo RUT, sumando todos los números.
      intentosPorCliente: entero(env.INTENTOS_POR_CLIENTE, 5),
      bloqueoMinutos: entero(env.BLOQUEO_MINUTOS, 30),
      avisoFalloMinutos: entero(env.AVISO_FALLO_MINUTOS, 30),
      // Tope de respuestas automáticas por conversación y hora (abuso / costos).
      maxTurnosHora: entero(env.MAX_TURNOS_HORA, 30)
    },

    notificaciones: {
      numeroPatricio: (env.NUMERO_PATRICIO || "").replace(/\D/g, ""),
      plantillaAlerta: env.PLANTILLA_ALERTA || "",
      idiomaPlantilla: env.IDIOMA_PLANTILLA || "es"
    },

    // Las campañas y envíos masivos no están implementados. Esta constante
    // existe para que cualquier intento futuro tenga que cambiarla a la vista.
    campanasHabilitadas: false
  };
  return cfg;
}

// Devuelve la lista de problemas que impiden arrancar en el modo pedido.
export function validarConfig(cfg) {
  const errores = [];
  const avisos = [];
  if (!["prueba", "produccion"].includes(cfg.modo)) errores.push(`MODO inválido: ${cfg.modo}`);
  if (!["anthropic", "simulado"].includes(cfg.ia.proveedor)) errores.push(`IA_PROVEEDOR inválido: ${cfg.ia.proveedor}`);
  if (!cfg.admin.claveHash) avisos.push("ADMIN_CLAVE_HASH vacío: el panel no permitirá iniciar sesión (use `npm run clave`).");
  if (cfg.ia.proveedor === "anthropic" && !cfg.ia.apiKey) errores.push("IA_PROVEEDOR=anthropic requiere ANTHROPIC_API_KEY.");
  if (cfg.modo === "produccion") {
    for (const [k, v] of Object.entries({
      WHATSAPP_TOKEN: cfg.whatsapp.token,
      WHATSAPP_PHONE_NUMBER_ID: cfg.whatsapp.phoneNumberId,
      WHATSAPP_APP_SECRET: cfg.whatsapp.appSecret,
      WHATSAPP_VERIFY_TOKEN: cfg.whatsapp.verifyToken,
      ADMIN_CLAVE_HASH: cfg.admin.claveHash
    })) if (!v) errores.push(`MODO=produccion requiere ${k}.`);
    if (cfg.ia.proveedor === "simulado") errores.push("MODO=produccion no puede usar IA_PROVEEDOR=simulado.");
    if (!cfg.admin.cookieSegura) avisos.push("COOKIE_SEGURA desactivado en producción.");
  }
  if (cfg.campanasHabilitadas) errores.push("Las campañas masivas deben permanecer desactivadas.");
  return { errores, avisos };
}
