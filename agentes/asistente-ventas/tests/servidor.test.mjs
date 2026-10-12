// Pruebas del servidor con dobles de la API y del agente. Ejecutar: node tests/servidor.test.mjs
import assert from "node:assert";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { crearServidor, Almacen } from "../servidor.mjs";

const dir = await fs.mkdtemp(path.join(os.tmpdir(), "asistente-"));
const almacen = await new Almacen(path.join(dir, "borradores.json")).cargar();
almacen.datos.vendedor = { id: 77, apodo: "TIENDA" };

const publicadas = [];
const preguntas = {
  "101": { id: 101, text: "¿Tienes stock?", item_id: "MLC1", seller_id: 77, status: "UNANSWERED", date_created: "2026-10-12T10:00:00Z" },
  "102": { id: 102, text: "¿Hacen factura?", item_id: "MLC1", seller_id: 77, status: "UNANSWERED", date_created: "2026-10-12T11:00:00Z" },
  "103": { id: 103, text: "Ya respondida", item_id: "MLC1", seller_id: 77, status: "ANSWERED" },
};
const ml = {
  conectado: () => true,
  urlAutorizacion: ({ estado, desafio }) => `https://auth.ejemplo/authorization?state=${estado}&code_challenge=${desafio}`,
  pregunta: async (id) => preguntas[id],
  publicacion: async () => ({ title: "Lámpara LED", permalink: "https://articulo.ejemplo/MLC1" }),
  preguntasSinResponder: async () => ({ questions: [preguntas["101"], preguntas["102"]] }),
  responder: async (id, texto) => { publicadas.push({ id: String(id), texto }); return {}; },
};
let llamadasIA = 0;
const redactar = async ({ pregunta }) => {
  llamadasIA++;
  return pregunta.id === 101
    ? { respuesta: "¡Hola! Sí, hay 3 unidades.", confianza: "alta", requiere_revision: false, motivo_revision: "", datos_usados: ["stock: 3"], alertas: [], publicable_solo: true }
    : { respuesta: "Hola, lo confirmo enseguida.", confianza: "baja", requiere_revision: true, motivo_revision: "Falta política de facturación.", datos_usados: [], alertas: [], publicable_solo: false };
};

assert.throws(() => crearServidor({ ml, almacen }), /PANEL_CLAVE/);

const servidor = crearServidor({ ml, almacen, redactar, clave: "secreta", autoPublicar: true, applicationId: "APP1", registrar: () => {} });
await new Promise((r) => servidor.listen(0, r));
const base = `http://127.0.0.1:${servidor.address().port}`;
const auth = { authorization: "Basic " + Buffer.from("vendedor:secreta").toString("base64") };
const notificar = (cuerpo) => fetch(base + "/notificaciones", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) });

try {
  // Panel protegido
  assert.strictEqual((await fetch(base + "/")).status, 401);
  assert.strictEqual((await fetch(base + "/", { headers: { authorization: "Basic " + Buffer.from("vendedor:otra").toString("base64") } })).status, 401);
  assert.strictEqual((await fetch(base + "/", { headers: auth })).status, 200);
  assert.strictEqual((await fetch(base + "/servidor.mjs", { headers: auth })).status, 404);

  // Conectar: redirige con state y PKCE; callback con state inventado se rechaza
  const conectar = await fetch(base + "/conectar", { headers: auth, redirect: "manual" });
  assert.strictEqual(conectar.status, 302);
  assert.ok(/code_challenge=[\w-]{43}/.test(conectar.headers.get("location")));
  assert.strictEqual((await fetch(base + "/callback?code=X&state=inventado")).status, 400);

  // Aviso de otra app: se ignora. Aviso válido: 200 inmediato y se publica solo (confianza alta).
  assert.strictEqual((await notificar({ topic: "questions", resource: "/questions/101", application_id: "OTRA" })).status, 200);
  await servidor.esperarCola();
  assert.strictEqual(almacen.obtener("101"), undefined);

  assert.strictEqual((await notificar({ topic: "questions", resource: "/questions/101", application_id: "APP1", user_id: 77 })).status, 200);
  await notificar({ topic: "questions", resource: "/questions/101", application_id: "APP1" }); // reintento duplicado
  await servidor.esperarCola();
  assert.strictEqual(llamadasIA, 1, "no redacta dos veces la misma pregunta");
  assert.strictEqual(almacen.obtener("101").estado, "publicada");
  assert.strictEqual(almacen.obtener("101").auto, true);
  assert.deepStrictEqual(publicadas, [{ id: "101", texto: "¡Hola! Sí, hay 3 unidades." }]);

  // Pregunta ya respondida en la plataforma: no se procesa
  await notificar({ topic: "questions", resource: "/questions/103", application_id: "APP1" });
  await servidor.esperarCola();
  assert.strictEqual(almacen.obtener("103"), undefined);

  // Revisar pendientes: la 102 queda para revisión humana (confianza baja)
  const rev = await (await fetch(base + "/api/revisar", { method: "POST", headers: auth })).json();
  assert.strictEqual(rev.nuevas, 1);
  assert.strictEqual(almacen.obtener("102").estado, "pendiente");
  assert.strictEqual(publicadas.length, 1);

  // Publicar con datos de contacto: bloqueado salvo confirmación expresa
  const publicar = (cuerpo) => fetch(base + "/api/borradores/102/publicar", { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify(cuerpo) });
  const bloqueada = await publicar({ texto: "Escríbeme al WhatsApp +56 9 1234 5678" });
  assert.strictEqual(bloqueada.status, 422);
  assert.ok((await bloqueada.json()).alertas.some((a) => a.id === "contacto"));

  const ok = await publicar({ texto: "Hola, sí emitimos factura. Indícanos tu RUT al comprar." });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(almacen.obtener("102").estado, "publicada");
  assert.strictEqual(publicadas.at(-1).texto, "Hola, sí emitimos factura. Indícanos tu RUT al comprar.");
  assert.strictEqual((await publicar({ texto: "otra" })).status, 409, "no responde dos veces");

  // Lista y persistencia en disco
  const lista = await (await fetch(base + "/api/borradores", { headers: auth })).json();
  assert.deepStrictEqual(lista.borradores.map((b) => b.id), ["102", "101"]);
  const enDisco = JSON.parse(await fs.readFile(path.join(dir, "borradores.json"), "utf8"));
  assert.strictEqual(enDisco.borradores["102"].estado, "publicada");
  assert.ok(!JSON.stringify(enDisco).includes("seller_id"), "no guarda el objeto completo de la API");
} finally {
  servidor.close();
  await fs.rm(dir, { recursive: true });
}

console.log("servidor.test.mjs: OK");
