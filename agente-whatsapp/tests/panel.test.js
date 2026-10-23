// Panel de administración: acceso, CSRF, cabeceras y simulador.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearServidor } from "../src/servidor.js";
import { hashClave } from "../src/servicios/seguridad.js";
import { crearAppPrueba } from "./ayuda.js";

async function levantar() {
  const { app, db } = crearAppPrueba({ env: { ADMIN_CLAVE_HASH: hashClave("clave-larga-de-prueba"), ADMIN_USUARIO: "patricio" } });
  const srv = crearServidor(app).listen(0);
  const base = `http://127.0.0.1:${srv.address().port}`;
  return { app, db, srv, base };
}

async function ingresar(base) {
  const r = await fetch(`${base}/panel/login`, { method: "POST", redirect: "manual", body: new URLSearchParams({ usuario: "patricio", clave: "clave-larga-de-prueba" }) });
  assert.equal(r.status, 303);
  const cookie = r.headers.get("set-cookie").split(";")[0];
  const pagina = await (await fetch(`${base}/panel`, { headers: { cookie } })).text();
  const csrf = pagina.match(/name="csrf" content="([^"]+)"/)[1];
  return { cookie, csrf };
}

test("sin sesión redirige al ingreso; clave incorrecta se rechaza", async () => {
  const { srv, base } = await levantar();
  try {
    const r = await fetch(`${base}/panel/conversaciones`, { redirect: "manual" });
    assert.equal(r.status, 303);
    assert.equal(r.headers.get("location"), "/panel/login");
    const mala = await fetch(`${base}/panel/login`, { method: "POST", body: new URLSearchParams({ usuario: "patricio", clave: "otra" }) });
    assert.equal(mala.status, 401);
  } finally { srv.close(); }
});

test("cabeceras de seguridad y cookie HttpOnly/SameSite", async () => {
  const { srv, base } = await levantar();
  try {
    const r = await fetch(`${base}/panel/login`, { method: "POST", redirect: "manual", body: new URLSearchParams({ usuario: "patricio", clave: "clave-larga-de-prueba" }) });
    assert.match(r.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
    assert.match(r.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  } finally { srv.close(); }
});

test("acciones POST exigen token CSRF", async () => {
  const { srv, base, db } = await levantar();
  try {
    const { cookie, csrf } = await ingresar(base);
    const sin = await fetch(`${base}/panel/ajustes/pausa`, { method: "POST", headers: { cookie }, body: new URLSearchParams({ pausar: "1" }) });
    assert.equal(sin.status, 403);
    const con = await fetch(`${base}/panel/ajustes/pausa`, { method: "POST", redirect: "manual", headers: { cookie }, body: new URLSearchParams({ pausar: "1", _csrf: csrf }) });
    assert.equal(con.status, 303);
    assert.equal(JSON.parse(db.prepare("SELECT valor FROM ajustes WHERE clave = 'agente_pausado'").get().valor), true);
  } finally { srv.close(); }
});

test("simulador: conversa con el agente y devuelve la traza de herramientas", async () => {
  const { srv, base } = await levantar();
  try {
    const { cookie, csrf } = await ingresar(base);
    const r = await fetch(`${base}/panel/simulador/enviar`, { method: "POST", headers: { cookie, "x-csrf": csrf, "content-type": "application/json" }, body: JSON.stringify({ telefono: "56900000009", texto: "Me llamo Laura Pinto" }) });
    const d = await r.json();
    assert.match(d.respuesta, /Laura Pinto/);
    assert.equal(d.acciones[0].herramienta, "registrar_solicitud");
    for (const ruta of ["/panel", "/panel/conversaciones", "/panel/solicitudes", "/panel/alertas", "/panel/clientes", "/panel/citas", "/panel/pagos", "/panel/conocimiento", "/panel/auditoria", "/panel/simulador", `/panel/conversaciones/${d.conversacion_id}`]) {
      const p = await fetch(`${base}${ruta}`, { headers: { cookie } });
      assert.equal(p.status, 200, ruta);
    }
  } finally { srv.close(); }
});

test("generar código de verificación lo muestra una sola vez y guarda solo el hash", async () => {
  const { srv, base, db } = await levantar();
  try {
    const { cookie, csrf } = await ingresar(base);
    await fetch(`${base}/panel/clientes`, { method: "POST", redirect: "manual", headers: { cookie }, body: new URLSearchParams({ nombre: "Cliente Panel", rut: "11.111.111-1", tipo: "persona", _csrf: csrf }) });
    const id = db.prepare("SELECT id FROM clientes").get().id;
    const html = await (await fetch(`${base}/panel/clientes/${id}/pin`, { method: "POST", headers: { cookie }, body: new URLSearchParams({ _csrf: csrf }) })).text();
    const pin = html.match(/class="pin">(\d{6})</)[1];
    const fila = db.prepare("SELECT pin_hash FROM clientes WHERE id = ?").get(id);
    assert.ok(fila.pin_hash.startsWith("scrypt$") && !fila.pin_hash.includes(pin));
    const otra = await (await fetch(`${base}/panel/clientes/${id}`, { headers: { cookie } })).text();
    assert.doesNotMatch(otra, new RegExp(pin));
    const rutMalo = await fetch(`${base}/panel/clientes`, { method: "POST", headers: { cookie }, body: new URLSearchParams({ nombre: "X", rut: "11.111.111-2", _csrf: csrf }) });
    assert.equal(rutMalo.status, 400);
  } finally { srv.close(); }
});

test("documentos solo se descargan con sesión", async () => {
  const { srv, base } = await levantar();
  try {
    const r = await fetch(`${base}/panel/documentos/1`, { redirect: "manual" });
    assert.equal(r.status, 303);
  } finally { srv.close(); }
});
