// Cliente mínimo de la API de Mercado Libre para UNA cuenta de vendedor.
//
// Endpoints y reglas tomados de extractos de la documentación oficial
// (developers.mercadolibre.cl / .com.ar). Las páginas no se pudieron abrir
// completas desde el entorno donde se escribió esto: revisa la sección
// "Pendiente de verificación" del README antes de usarlo con clientes.

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export const API = "https://api.mercadolibre.com";
// [VERIFICAR] La página chilena de autenticación muestra el ejemplo con el
// dominio .com.ar e indica usar el de cada país; se deja configurable.
export const AUTH_URL = process.env.ML_AUTH_URL || "https://auth.mercadolibre.cl/authorization";
export const LARGO_MAX_RESPUESTA = 2000;

export class ErrorML extends Error {
  constructor(mensaje, estado, cuerpo) {
    super(mensaje);
    this.estado = estado;
    this.cuerpo = cuerpo;
  }
}

const base64url = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function crearPKCE() {
  const verificador = base64url(crypto.randomBytes(32));
  const desafio = base64url(crypto.createHash("sha256").update(verificador).digest());
  return { verificador, desafio };
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export class ClienteML {
  constructor({ clientId, clientSecret, redirectUri, archivoTokens, fetch = globalThis.fetch, ahora = Date.now, pausa = espera }) {
    Object.assign(this, { clientId, clientSecret, redirectUri, archivoTokens, fetch, ahora, pausa });
    this.tokens = null;
    this.refrescando = null;
    this.cache = new Map(); // publicaciones leídas hace poco
  }

  async cargarTokens() {
    try { this.tokens = JSON.parse(await fs.readFile(this.archivoTokens, "utf8")); }
    catch { this.tokens = null; }
    return this.tokens;
  }

  async guardarTokens(t) {
    this.tokens = {
      access_token: t.access_token,
      refresh_token: t.refresh_token || (this.tokens && this.tokens.refresh_token),
      user_id: t.user_id || (this.tokens && this.tokens.user_id),
      // Se lee `expires_in` de cada respuesta: la documentación no es uniforme sobre la duración.
      expira: this.ahora() + (Number(t.expires_in) || 3600) * 1000,
    };
    await fs.mkdir(path.dirname(this.archivoTokens), { recursive: true });
    await fs.writeFile(this.archivoTokens, JSON.stringify(this.tokens), { mode: 0o600 });
  }

  conectado() { return Boolean(this.tokens && this.tokens.access_token); }

  urlAutorizacion({ estado, desafio }) {
    const q = new URLSearchParams({
      response_type: "code", client_id: this.clientId, redirect_uri: this.redirectUri,
      state: estado, code_challenge: desafio, code_challenge_method: "S256",
    });
    return `${AUTH_URL}?${q}`;
  }

  async #token(cuerpo) {
    const r = await this.fetch(`${API}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ client_id: this.clientId, client_secret: this.clientSecret, ...cuerpo }),
    });
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) throw new ErrorML(`No se pudo obtener el token (${datos.error || r.status}).`, r.status, datos);
    await this.guardarTokens(datos);
    return this.tokens;
  }

  canjearCodigo(codigo, verificador) {
    return this.#token({ grant_type: "authorization_code", code: codigo, redirect_uri: this.redirectUri, code_verifier: verificador });
  }

  // El refresh_token es de un solo uso: cada renovación entrega uno nuevo que
  // se guarda de inmediato. Se evita pedir dos renovaciones en paralelo.
  refrescar() {
    if (!this.tokens || !this.tokens.refresh_token) throw new ErrorML("La cuenta no está conectada.", 401);
    this.refrescando ||= this.#token({ grant_type: "refresh_token", refresh_token: this.tokens.refresh_token })
      .finally(() => { this.refrescando = null; });
    return this.refrescando;
  }

  async #tokenVigente() {
    if (!this.conectado()) throw new ErrorML("La cuenta no está conectada.", 401);
    if (this.tokens.expira - 60_000 <= this.ahora()) await this.refrescar();
    return this.tokens.access_token;
  }

  async pedir(metodo, ruta, cuerpo, intento = 0) {
    const r = await this.fetch(API + ruta, {
      method: metodo,
      headers: {
        authorization: `Bearer ${await this.#tokenVigente()}`,
        accept: "application/json",
        ...(cuerpo ? { "content-type": "application/json" } : {}),
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    if (r.status === 401 && intento === 0) {
      await this.refrescar();
      return this.pedir(metodo, ruta, cuerpo, 1);
    }
    if (r.status === 429 && intento < 3) {
      const segundos = Number(r.headers.get("retry-after"));
      await this.pausa(Number.isFinite(segundos) && segundos >= 0 ? segundos * 1000 : 1000 * 2 ** intento + Math.random() * 500);
      return this.pedir(metodo, ruta, cuerpo, intento + 1);
    }
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) throw new ErrorML(`La API respondió ${r.status} en ${ruta}: ${datos.message || datos.error || ""}`.trim(), r.status, datos);
    return datos;
  }

  usuario() { return this.pedir("GET", "/users/me"); }

  preguntasSinResponder(vendedorId) {
    const q = new URLSearchParams({ seller_id: vendedorId, status: "UNANSWERED", api_version: "4", sort_fields: "date_created", sort_types: "ASC" });
    return this.pedir("GET", `/questions/search?${q}`);
  }

  pregunta(id) { return this.pedir("GET", `/questions/${encodeURIComponent(id)}?api_version=4`); }

  async publicacion(id) {
    const guardada = this.cache.get(id);
    if (guardada && this.ahora() - guardada.t < 5 * 60_000) return guardada.datos;
    const datos = await this.pedir("GET", `/items/${encodeURIComponent(id)}`);
    this.cache.set(id, { t: this.ahora(), datos });
    return datos;
  }

  descripcion(id) { return this.pedir("GET", `/items/${encodeURIComponent(id)}/description`); }

  responder(preguntaId, texto) {
    if (!texto || texto.length > LARGO_MAX_RESPUESTA) throw new ErrorML(`La respuesta debe tener entre 1 y ${LARGO_MAX_RESPUESTA} caracteres.`, 400);
    return this.pedir("POST", "/answers", { question_id: Number(preguntaId), text: texto });
  }
}
