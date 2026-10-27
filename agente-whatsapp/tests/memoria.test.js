// Memoria persistente y separación entre clientes y conversaciones.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearAppPrueba, decir, crearCliente, crearAsunto } from "./ayuda.js";
import { construirEstado, textoContexto } from "../src/agente/contexto.js";
import { leerConversacion, leerContacto } from "../src/servicios/conversaciones.js";

function contextoDe(app, telefono) {
  const conv = app.db.prepare("SELECT c.* FROM conversaciones c JOIN contactos k ON k.id = c.contacto_id WHERE k.telefono = ?").get(telefono);
  return textoContexto(construirEstado(app, leerConversacion(app.db, conv.id), leerContacto(app.db, conv.contacto_id), [], { senales: [], fechasLiterales: [], urgencia: "normal" }));
}

test("la memoria persiste entre mensajes: lo registrado aparece en el contexto", async () => {
  const { app } = crearAppPrueba();
  await decir(app, "56940000001", "Me llamo Carla Muñoz y vivo en la comuna de Salamanca");
  const ctx = contextoDe(app, "56940000001");
  assert.match(ctx, /Carla Muñoz/);
  assert.match(ctx, /Salamanca/);
  assert.doesNotMatch(ctx.split("Antecedentes que aún faltan:")[1], /nombre|comuna/);
});

test("dos números distintos nunca comparten antecedentes", async () => {
  const { app } = crearAppPrueba();
  await decir(app, "56940000002", "Me llamo Luis Araya, tengo un problema con mi arriendo");
  await decir(app, "56940000003", "Hola");
  const ctx = contextoDe(app, "56940000003");
  assert.doesNotMatch(ctx, /Luis|Araya|arriendo/);
});

test("número asociado a una ficha pero sin verificar: el contexto no revela la ficha", async () => {
  const { app, db } = crearAppPrueba();
  const id = crearCliente(db, { nombre: "María González", telefono: "56940000004" });
  crearAsunto(db, id, { titulo: "Recurso de protección municipal" });
  await decir(app, "56940000004", "Hola");
  const ctx = contextoDe(app, "56940000004");
  assert.match(ctx, /identidad NO está verificada/);
  assert.doesNotMatch(ctx, /María|González|Recurso de protección/);
});

test("sin verificación, la memoria se limita a la ventana de sesión", async () => {
  const { app, db } = crearAppPrueba();
  await decir(app, "56940000005", "Me llamo Jorge Pizarro");
  db.prepare("UPDATE solicitudes SET actualizado = '2026-01-01T00:00:00.000Z'").run();
  db.prepare("UPDATE mensajes SET creado = '2026-01-01T00:00:00.000Z'").run();
  const ctx = contextoDe(app, "56940000005");
  assert.doesNotMatch(ctx, /Jorge/);
});

test("con identidad verificada, el contexto incluye los asuntos del cliente", async () => {
  const { app, db } = crearAppPrueba();
  const id = crearCliente(db, { nombre: "Elena Vargas", rut: "11.111.111-1", pin: "246810", telefono: "56940000006" });
  crearAsunto(db, id, { titulo: "Juicio laboral Vargas con Comercial Sur" });
  await decir(app, "56940000006", "Mi RUT es 11.111.111-1 y mi código 246810");
  const ctx = contextoDe(app, "56940000006");
  assert.match(ctx, /IDENTIDAD VERIFICADA/);
  assert.match(ctx, /Juicio laboral Vargas/);
});
