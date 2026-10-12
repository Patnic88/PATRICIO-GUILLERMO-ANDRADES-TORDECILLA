// Pruebas del cliente de la API con un fetch falso. Ejecutar: node tests/api-ml.test.mjs
import assert from "node:assert";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ClienteML, crearPKCE, AUTH_URL } from "../api-ml.mjs";

const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ml-"));
const llamadas = [];
let reloj = 1_000_000;
let respuestas = [];
const fetchFalso = async (url, init = {}) => {
  llamadas.push({ url, ...init });
  const r = respuestas.shift();
  return new Response(JSON.stringify(r.json || {}), { status: r.status || 200, headers: r.headers || {} });
};
const ml = new ClienteML({
  clientId: "APP1", clientSecret: "SECRETO", redirectUri: "https://ejemplo.cl/callback",
  archivoTokens: path.join(dir, "tokens.json"), fetch: fetchFalso, ahora: () => reloj, pausa: async () => {},
});

// PKCE S256 y URL de autorización
const { verificador, desafio } = crearPKCE();
assert.ok(verificador.length >= 43 && !/[+/=]/.test(desafio));
const u = new URL(ml.urlAutorizacion({ estado: "abc", desafio }));
assert.strictEqual(u.origin + u.pathname, AUTH_URL);
assert.strictEqual(u.searchParams.get("code_challenge_method"), "S256");
assert.strictEqual(u.searchParams.get("state"), "abc");

// Canje del código: form-urlencoded, guarda tokens con permisos 600
respuestas = [{ json: { access_token: "A1", refresh_token: "R1", expires_in: 21600, user_id: 77 } }];
await ml.canjearCodigo("CODIGO", verificador);
const canje = llamadas.at(-1);
assert.strictEqual(canje.url, "https://api.mercadolibre.com/oauth/token");
assert.strictEqual(canje.headers["content-type"], "application/x-www-form-urlencoded");
const form = new URLSearchParams(canje.body.toString());
assert.strictEqual(form.get("grant_type"), "authorization_code");
assert.strictEqual(form.get("code_verifier"), verificador);
const guardado = JSON.parse(await fs.readFile(path.join(dir, "tokens.json"), "utf8"));
assert.strictEqual(guardado.refresh_token, "R1");
assert.strictEqual((await fs.stat(path.join(dir, "tokens.json"))).mode & 0o777, 0o600);

// Token vigente: GET directo con Bearer
respuestas = [{ json: { id: 77, nickname: "TIENDA" } }];
assert.strictEqual((await ml.usuario()).nickname, "TIENDA");
assert.strictEqual(llamadas.at(-1).headers.authorization, "Bearer A1");

// Token vencido: renueva antes y guarda el NUEVO refresh_token (son de un solo uso)
reloj += 21600 * 1000;
respuestas = [{ json: { access_token: "A2", refresh_token: "R2", expires_in: 21600 } }, { json: { questions: [] } }];
await ml.preguntasSinResponder(77);
const refresco = new URLSearchParams(llamadas.at(-2).body.toString());
assert.strictEqual(refresco.get("grant_type"), "refresh_token");
assert.strictEqual(refresco.get("refresh_token"), "R1");
assert.strictEqual(ml.tokens.refresh_token, "R2");
assert.strictEqual(ml.tokens.user_id, 77, "conserva el user_id");
const busqueda = new URL(llamadas.at(-1).url);
assert.strictEqual(busqueda.pathname, "/questions/search");
assert.strictEqual(busqueda.searchParams.get("status"), "UNANSWERED");
assert.strictEqual(busqueda.searchParams.get("api_version"), "4");

// 401 inesperado: renueva una vez y reintenta
respuestas = [{ status: 401 }, { json: { access_token: "A3", refresh_token: "R3", expires_in: 21600 } }, { json: { id: "MLC1", title: "Lámpara" } }];
assert.strictEqual((await ml.publicacion("MLC1")).title, "Lámpara");
assert.strictEqual(llamadas.at(-1).headers.authorization, "Bearer A3");

// Caché de publicaciones (5 min): no vuelve a llamar
const antes = llamadas.length;
await ml.publicacion("MLC1");
assert.strictEqual(llamadas.length, antes);

// 429: espera y reintenta
respuestas = [{ status: 429, headers: { "retry-after": "0" } }, { json: { plain_text: "Descripción" } }];
assert.strictEqual((await ml.descripcion("MLC1")).plain_text, "Descripción");

// Responder: POST /answers con question_id numérico; valida largo
respuestas = [{ json: { ok: true } }];
await ml.responder("123", "Hola, sí hay stock.");
assert.strictEqual(llamadas.at(-1).url, "https://api.mercadolibre.com/answers");
assert.deepStrictEqual(JSON.parse(llamadas.at(-1).body), { question_id: 123, text: "Hola, sí hay stock." });
assert.throws(() => ml.responder("123", "x".repeat(2001)), /2000/);

// Error de la API: mensaje legible con estado
respuestas = [{ status: 404, json: { message: "item not found" } }];
await assert.rejects(ml.descripcion("MLC9"), (e) => e.estado === 404 && /item not found/.test(e.message));

await fs.rm(dir, { recursive: true });
console.log("api-ml.test.mjs: OK");
