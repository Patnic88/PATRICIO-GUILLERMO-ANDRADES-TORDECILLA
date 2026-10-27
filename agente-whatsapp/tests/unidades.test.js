// Pruebas unitarias: RUT, controles de salida, configuración y validación.
import { test } from "node:test";
import assert from "node:assert/strict";
import { rutValido, normalizarRut } from "../src/servicios/rut.js";
import { revisarRespuesta } from "../src/agente/guardas.js";
import { leerConfig, validarConfig } from "../src/config.js";
import { validar } from "../src/agente/validar.js";
import { HERRAMIENTAS } from "../src/agente/herramientas.js";

const turno = (o = {}) => ({ exito: new Set(), textoConocimiento: "", citaVigente: false, pagoVerificadoInformado: false, ...o });

test("RUT: dígito verificador y normalización", () => {
  assert.equal(rutValido("12.345.678-5"), true);
  assert.equal(rutValido("12.345.678-4"), false);
  assert.equal(normalizarRut("12.345.678-k"), "12345678-K");
});

test("controles de salida", () => {
  assert.equal(revisarRespuesta("Su cita quedó confirmada para el lunes.", turno()).ok, false);
  assert.equal(revisarRespuesta("Su cita quedó confirmada para el lunes.", turno({ exito: new Set(["agendar_cita"]) })).ok, true);
  assert.equal(revisarRespuesta("No pude completar la reserva, la cita no quedó agendada.", turno()).ok, true);
  assert.equal(revisarRespuesta("Su comprobante quedó pendiente de verificación.", turno()).ok, true);
  assert.equal(revisarRespuesta("Su pago está confirmado.", turno()).ok, false);
  assert.equal(revisarRespuesta("Su pago aún no está verificado.", turno()).ok, true);
  assert.equal(revisarRespuesta("El plazo vence el 3 de noviembre.", turno()).ok, false);
  assert.equal(revisarRespuesta("No puedo calcular plazos; Patricio lo revisará.", turno()).ok, true);
  assert.equal(revisarRespuesta("Le aseguro que va a ganar el juicio.", turno()).ok, false);
  assert.equal(revisarRespuesta("Hola, soy Patricio.", turno()).ok, false);
  assert.equal(revisarRespuesta("La consulta cuesta $30.000.", turno()).ok, false);
  assert.equal(revisarRespuesta("La consulta cuesta $30.000.", turno({ textoConocimiento: "La consulta inicial tiene un valor de $30.000." })).ok, true);
  assert.equal(revisarRespuesta("Le puedo ofrecer un descuento.", turno()).ok, false);
});

test("configuración: producción exige credenciales y prohíbe el simulador", () => {
  const { errores } = validarConfig(leerConfig({ MODO: "produccion" }));
  assert.ok(errores.some((e) => /WHATSAPP_APP_SECRET/.test(e)));
  assert.ok(errores.some((e) => /simulado/.test(e)));
  assert.equal(leerConfig({}).modo, "prueba", "el modo por defecto es prueba");
  assert.equal(leerConfig({}).campanasHabilitadas, false);
});

test("validación de entradas de herramientas", () => {
  const s = HERRAMIENTAS.agendar_cita.input_schema;
  assert.deepEqual(validar(s, { inicio: "2026-11-03T12:00:00.000Z", nombre: "A", motivo: "B" }), []);
  assert.ok(validar(s, { inicio: "x" }).length >= 2);
  assert.ok(validar(s, { inicio: "x", nombre: "A", motivo: "B", extra: 1 }).some((e) => /no permitido/.test(e)));
  assert.ok(validar(HERRAMIENTAS.registrar_solicitud.input_schema, { materia: "astrologia" }).length === 1);
});

test("modo prueba: respuestas automáticas solo a NUMEROS_PRUEBA; mensajes manuales siempre", async () => {
  const { crearClienteWhatsApp } = await import("../src/whatsapp/cliente.js");
  const cfg = leerConfig({ WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "1", NUMEROS_PRUEBA: "+56 9 1111 1111" });
  const llamadas = [];
  const fetchImpl = async (url, op) => { llamadas.push({ url, cuerpo: JSON.parse(op.body) }); return { ok: true, json: async () => ({ messages: [{ id: "wamid.x" }] }) }; };
  const w = crearClienteWhatsApp(cfg, { fetchImpl });
  assert.equal((await w.enviarTexto("56922222222", "hola")).simulado, true);
  assert.equal((await w.enviarTexto("56911111111", "hola")).simulado, false);
  assert.equal((await w.enviarTexto("56922222222", "hola", { manual: true })).simulado, false);
  assert.equal(llamadas.length, 2);
  assert.match(llamadas[0].url, /graph\.facebook\.com\/v26\.0\/1\/messages$/);
  assert.deepEqual(llamadas[0].cuerpo, { messaging_product: "whatsapp", recipient_type: "individual", to: "56911111111", type: "text", text: { preview_url: false, body: "hola" } });
});
