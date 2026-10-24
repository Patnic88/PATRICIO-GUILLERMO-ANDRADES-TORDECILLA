// Utilidades comunes de prueba: app con base en memoria, WhatsApp falso y
// proveedor simulado (o uno guionado por la prueba).

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHmac } from "node:crypto";
import { leerConfig } from "../src/config.js";
import { abrirDb, ahora } from "../src/db.js";
import { crearApp } from "../src/app.js";
import { hashClave } from "../src/servicios/seguridad.js";
import { guardarAgenda, AGENDA_POR_DEFECTO } from "../src/servicios/agenda.js";

export const SECRETO = "secreto-de-prueba";

export function whatsappFalso() {
  const enviados = [];
  return {
    credenciales: true,
    enviados,
    fallar: false,
    puedeEnviarReal: () => true,
    async enviarTexto(telefono, texto, opciones = {}) {
      if (this.fallar) throw new Error("WhatsApp API 500: error simulado");
      enviados.push({ telefono, texto, ...opciones });
      return { simulado: false, id: `wamid.salida.${enviados.length}` };
    },
    async enviarPlantilla() { return { simulado: true, id: null }; },
    async descargarMedia(mediaId) {
      const bytes = Buffer.from(`contenido de ${mediaId}`);
      const { createHash } = await import("node:crypto");
      return { bytes, mime: "image/jpeg", sha256: createHash("sha256").update(bytes).digest("hex") };
    }
  };
}

export function crearAppPrueba({ env = {}, ia = null, herramientas = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "agente-aa-"));
  const cfg = leerConfig({ DIR_DATOS: dir, DEBOUNCE_MS: "0", WHATSAPP_APP_SECRET: SECRETO, WHATSAPP_VERIFY_TOKEN: "token-verif", WHATSAPP_PHONE_NUMBER_ID: "111", ...env });
  const whatsapp = whatsappFalso();
  const app = crearApp({ cfg, db: abrirDb(":memory:"), ia, whatsapp, herramientas });
  return { app, db: app.db, whatsapp, cfg };
}

// Envía un mensaje de texto por el mismo camino que el simulador y devuelve
// la respuesta del agente (o null).
export async function decir(app, telefono, texto, archivo = null) {
  const r = await app.procesador.simularEntrante({ telefono, texto, archivo });
  return { texto: r.turno?.texto ?? null, r };
}

export function crearCliente(db, { nombre = "Juan Soto", rut = "12.345.678-5", pin = "482915", telefono = null } = {}) {
  const id = Number(db.prepare("INSERT INTO clientes (nombre, rut, tipo, pin_hash, creado, actualizado) VALUES (?, ?, 'persona', ?, ?, ?)").run(nombre, rut.replace(/\./g, ""), hashClave(pin), ahora(), ahora()).lastInsertRowid);
  if (telefono) {
    db.prepare("INSERT OR IGNORE INTO contactos (telefono, creado) VALUES (?, ?)").run(telefono, ahora());
    db.prepare("UPDATE contactos SET cliente_id = ? WHERE telefono = ?").run(id, telefono);
  }
  return id;
}

export function crearAsunto(db, clienteId, { titulo = "Demanda laboral contra Empresa X", estado = "en_curso", siguiente = "Esperar audiencia preparatoria" } = {}) {
  const id = Number(db.prepare("INSERT INTO asuntos (cliente_id, titulo, materia, estado, siguiente_accion, creado, actualizado) VALUES (?, ?, 'laboral', ?, ?, ?, ?)").run(clienteId, titulo, estado, siguiente, ahora(), ahora()).lastInsertRowid);
  db.prepare("INSERT INTO gestiones (asunto_id, fecha, descripcion, visible_cliente, creado) VALUES (?, '2026-10-15', 'Se presentó la demanda', 1, ?)").run(id, ahora());
  return id;
}

// Agenda con bloques todos los días a las 09:00 y 11:00, sin anticipación.
export function habilitarAgenda(db) {
  const bloques = {};
  for (let d = 1; d <= 7; d++) bloques[d] = ["09:00", "11:00"];
  guardarAgenda(db, { ...AGENDA_POR_DEFECTO, configurada: true, anticipacionHoras: 0, diasVista: 7, bloques });
}

export function firmar(cuerpo) {
  return "sha256=" + createHmac("sha256", SECRETO).update(cuerpo).digest("hex");
}

export function payloadTexto({ de = "56922222222", id = "wamid.entrada.1", texto = "Hola", phoneNumberId = "111", nombre = "Cliente" } = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [{ field: "messages", value: {
      messaging_product: "whatsapp", metadata: { display_phone_number: "56900000000", phone_number_id: phoneNumberId },
      contacts: [{ profile: { name: nombre }, wa_id: de }],
      messages: [{ from: de, id, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: texto } }]
    } }] }]
  };
}

export const alertas = (db, tipo = null) => (tipo ? db.prepare("SELECT * FROM alertas WHERE tipo = ?").all(tipo) : db.prepare("SELECT * FROM alertas").all());

// Proveedor guionado: devuelve en orden las respuestas indicadas. Cada
// respuesta es texto o { herramienta, entrada }.
export function iaGuionada(pasos) {
  let i = 0, n = 0;
  return {
    nombre: "guionado",
    llamadas: [],
    async generar(params) {
      this.llamadas.push(params);
      const p = pasos[i++];
      if (p === undefined) return { content: [{ type: "text", text: "(fin del guion)" }], stop_reason: "end_turn", modelo: "guion" };
      if (p instanceof Error) throw p;
      if (typeof p === "string") return { content: [{ type: "text", text: p }], stop_reason: "end_turn", modelo: "guion" };
      return { content: [{ type: "tool_use", id: `toolu_g${++n}`, name: p.herramienta, input: p.entrada || {} }], stop_reason: "tool_use", modelo: "guion" };
    }
  };
}
