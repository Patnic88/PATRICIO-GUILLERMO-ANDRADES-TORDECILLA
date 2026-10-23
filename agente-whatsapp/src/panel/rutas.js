// Rutas del panel de administración. Requiere sesión (salvo /login) y token
// CSRF en toda acción POST.

import { readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ahora, leerAjuste, guardarAjuste } from "../db.js";
import { h, html, json, redirigir, enviar, leerCuerpo, leerCookies, ipCliente, ErrorHttp } from "../http-util.js";
import { verificarClave, igualesSeguro, tokenAleatorio, sha256, hashClave, generarPin } from "../servicios/seguridad.js";
import { auditar } from "../servicios/auditoria.js";
import { resolverAlerta } from "../servicios/alertas.js";
import { normalizarRut, rutValido } from "../servicios/rut.js";
import { leerAgenda, guardarAgenda, cancelarCita } from "../servicios/agenda.js";
import { fijarModo, verificarManual, revocarVerificacion, sesionVerificada } from "../servicios/conversaciones.js";
import { layout, tabla, etiqueta, fecha, seleccion, formulario, login } from "./vistas.js";

const ESTATICOS = join(dirname(fileURLToPath(import.meta.url)), "estaticos");
const COOKIE = "aa_sesion";
const intentosLogin = new Map(); // ip -> { n, desde }

// ---------------------------------------------------------------------------
// Sesión
// ---------------------------------------------------------------------------

function sesionDe(app, req) {
  const token = leerCookies(req)[COOKIE];
  if (!token) return null;
  const s = app.db.prepare("SELECT * FROM sesiones_admin WHERE token_hash = ?").get(sha256(token));
  if (!s || new Date(s.expira) < new Date()) return null;
  return s;
}

function crearSesion(app, usuario) {
  const token = tokenAleatorio();
  const csrfToken = tokenAleatorio(24);
  const expira = new Date(Date.now() + app.cfg.admin.sesionHoras * 3600_000).toISOString();
  app.db.prepare("DELETE FROM sesiones_admin WHERE expira < ?").run(ahora());
  app.db.prepare("INSERT INTO sesiones_admin (token_hash, usuario, csrf, expira) VALUES (?, ?, ?, ?)").run(sha256(token), usuario, csrfToken, expira);
  const atributos = [`${COOKIE}=${token}`, "HttpOnly", "SameSite=Strict", "Path=/panel", `Max-Age=${app.cfg.admin.sesionHoras * 3600}`];
  if (app.cfg.admin.cookieSegura) atributos.push("Secure");
  return atributos.join("; ");
}

function limiteLogin(ip) {
  const r = intentosLogin.get(ip);
  if (!r || Date.now() - r.desde > 15 * 60_000) return false;
  return r.n >= 5;
}
function falloLogin(ip) {
  const r = intentosLogin.get(ip);
  if (!r || Date.now() - r.desde > 15 * 60_000) intentosLogin.set(ip, { n: 1, desde: Date.now() });
  else r.n++;
}

async function formularioDe(req, limite) {
  const crudo = (await leerCuerpo(req, limite)).toString("utf8");
  if ((req.headers["content-type"] || "").includes("application/json")) return JSON.parse(crudo || "{}");
  return Object.fromEntries(new URLSearchParams(crudo));
}

// ---------------------------------------------------------------------------
// Páginas
// ---------------------------------------------------------------------------

function pagina(app, res, sesion, titulo, cuerpo, aviso = null, estado = 200) {
  const alertasAbiertas = app.db.prepare("SELECT COUNT(*) n FROM alertas WHERE estado = 'abierta'").get().n;
  html(res, layout({ titulo, cuerpo, sesion, cfg: app.cfg, alertasAbiertas, aviso }), estado);
}

const enlaceConv = (id) => (id ? `<a href="/panel/conversaciones/${id}">#${id}</a>` : "—");

function listaAlertas(app, sesion, filas) {
  return tabla(["Prioridad", "Tipo", "Descripción", "Fecha informada", "Conversación", "Creada", ""], filas.map((a) => [
    etiqueta(a.prioridad, a.prioridad), h(a.tipo), h(a.descripcion), h(a.fecha_informada || "—"), enlaceConv(a.conversacion_id), fecha(a.creado),
    a.estado === "abierta" ? formulario(`/panel/alertas/${a.id}/resolver`, sesion, "", "Resolver", "en-linea") : etiqueta("resuelta")
  ]), "No hay alertas.");
}

function resumen(app, sesion) {
  const { db, cfg } = app;
  const n = (sql, ...p) => db.prepare(sql).get(...p).n;
  const pausado = leerAjuste(db, "agente_pausado", false);
  const alertas = db.prepare("SELECT * FROM alertas WHERE estado = 'abierta' ORDER BY CASE prioridad WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, id DESC LIMIT 15").all();
  const kbPend = n("SELECT COUNT(*) n FROM conocimiento WHERE estado != 'aprobado'");
  const agenda = leerAgenda(db);
  return `
  <section class="tarjetas">
    <div class="tarjeta"><b>${n("SELECT COUNT(*) n FROM alertas WHERE estado='abierta' AND prioridad='alta'")}</b> alertas de prioridad alta</div>
    <div class="tarjeta"><b>${n("SELECT COUNT(*) n FROM solicitudes WHERE estado='abierta'")}</b> solicitudes abiertas</div>
    <div class="tarjeta"><b>${n("SELECT COUNT(*) n FROM conversaciones WHERE modo='humano'")}</b> conversaciones atendidas por Patricio</div>
    <div class="tarjeta"><b>${n("SELECT COUNT(*) n FROM pagos WHERE estado='pendiente_verificacion'")}</b> comprobantes por verificar</div>
    <div class="tarjeta"><b>${n("SELECT COUNT(*) n FROM citas WHERE estado='confirmada' AND inicio >= ?", ahora())}</b> citas próximas</div>
  </section>
  <section class="tarjeta">
    <h2>Estado del servicio</h2>
    <ul>
      <li>Modo: <b>${h(cfg.modo)}</b>. Proveedor de IA: <b>${h(app.ia.nombre)}</b>${app.ia.nombre === "simulado" ? " (reglas fijas de demostración, no es IA)" : ` (${h(cfg.ia.modelo)})`}.</li>
      <li>WhatsApp: ${app.whatsapp.credenciales ? "credenciales configuradas" : "<b>sin credenciales</b> (todo envío queda simulado)"}.</li>
      <li>Agenda en línea: ${agenda.configurada ? "habilitada" : "<b>no configurada</b> (el agente no ofrece horas)"}.</li>
      <li>Base de conocimiento: ${kbPend ? `<a href="/panel/conocimiento"><b>${kbPend}</b> entradas pendientes o en borrador</a>` : "todas aprobadas"}.</li>
      <li>Respuestas automáticas: ${pausado ? "<b>PAUSADAS para todas las conversaciones</b>" : "activas"}.</li>
    </ul>
    ${formulario("/panel/ajustes/pausa", sesion, `<input type="hidden" name="pausar" value="${pausado ? "0" : "1"}">`, pausado ? "Reanudar respuestas automáticas" : "Pausar todas las respuestas automáticas")}
  </section>
  <h2>Alertas abiertas</h2>${listaAlertas(app, sesion, alertas)}`;
}

function conversaciones(app) {
  const filas = app.db.prepare(`
    SELECT c.*, k.telefono, k.nombre_perfil, k.cliente_id, cl.nombre AS cliente_nombre,
      (SELECT texto FROM mensajes m WHERE m.conversacion_id = c.id ORDER BY m.id DESC LIMIT 1) AS ultimo_texto,
      (SELECT creado FROM mensajes m WHERE m.conversacion_id = c.id ORDER BY m.id DESC LIMIT 1) AS ultimo_ts
    FROM conversaciones c JOIN contactos k ON k.id = c.contacto_id LEFT JOIN clientes cl ON cl.id = k.cliente_id
    ORDER BY ultimo_ts DESC NULLS LAST LIMIT 200`).all();
  return tabla(["#", "Teléfono", "Perfil", "Ficha asociada", "Modo", "Identidad", "Último mensaje", ""], filas.map((c) => [
    `<a href="/panel/conversaciones/${c.id}">${c.id}</a>`, h(c.telefono) + (c.es_prueba ? " " + etiqueta("prueba") : ""), h(c.nombre_perfil || "—"),
    c.cliente_id ? `<a href="/panel/clientes/${c.cliente_id}">${h(c.cliente_nombre)}</a>` : "—",
    etiqueta(c.modo === "humano" ? "Patricio" : "agente", c.modo), sesionVerificada(c) ? etiqueta("verificada", "ok") : "—",
    h((c.ultimo_texto || "").slice(0, 80)), fecha(c.ultimo_ts)
  ]), "Aún no hay conversaciones.");
}

function detalleConversacion(app, sesion, id) {
  const { db } = app;
  const c = db.prepare("SELECT c.*, k.telefono, k.nombre_perfil, k.cliente_id FROM conversaciones c JOIN contactos k ON k.id = c.contacto_id WHERE c.id = ?").get(id);
  if (!c) return null;
  const clientes = db.prepare("SELECT id, nombre, rut FROM clientes ORDER BY nombre").all();
  const opcionesClientes = [["", "— elegir —"], ...clientes.map((x) => [x.id, `${x.nombre} (${x.rut || "sin RUT"})`])];
  const mensajes = db.prepare("SELECT * FROM mensajes WHERE conversacion_id = ? ORDER BY id DESC LIMIT 200").all(id).reverse();
  const docs = db.prepare("SELECT * FROM documentos WHERE conversacion_id = ? ORDER BY id DESC").all(id);
  const solicitudes = db.prepare("SELECT * FROM solicitudes WHERE conversacion_id = ? ORDER BY id DESC").all(id);
  const auditoria = db.prepare("SELECT * FROM auditoria WHERE conversacion_id = ? ORDER BY id DESC LIMIT 60").all(id);
  const verificado = sesionVerificada(c);
  const cliVer = verificado ? db.prepare("SELECT nombre FROM clientes WHERE id = ?").get(c.verificado_cliente_id) : null;
  return `
  <section class="tarjeta">
    <p>Teléfono <b>${h(c.telefono)}</b> · perfil «${h(c.nombre_perfil || "—")}» · ${c.es_prueba ? etiqueta("conversación de prueba") : ""}</p>
    <p>Modo: ${etiqueta(c.modo === "humano" ? "atendida por Patricio (agente pausado)" : "agente automático", c.modo)} ${c.motivo_modo ? `· ${h(c.motivo_modo)}` : ""}</p>
    ${formulario(`/panel/conversaciones/${id}/modo`, sesion, `<input type="hidden" name="modo" value="${c.modo === "humano" ? "auto" : "humano"}">`, c.modo === "humano" ? "Devolver al agente" : "Tomar la conversación (pausar agente)", "en-linea")}
    <p>Identidad: ${verificado ? `${etiqueta("verificada", "ok")} como <b>${h(cliVer?.nombre)}</b> hasta ${fecha(c.verificado_hasta)} (${h(c.verificado_por)})` : "no verificada"}${c.bloqueado_hasta && new Date(c.bloqueado_hasta) > new Date() ? ` · ${etiqueta("verificación bloqueada hasta " + new Date(c.bloqueado_hasta).toLocaleTimeString("es-CL", { timeZone: "America/Santiago" }), "alta")}` : ""}</p>
    <div class="fila">
      ${formulario(`/panel/conversaciones/${id}/vincular`, sesion, `<label>Asociar número a ficha ${seleccion("cliente_id", opcionesClientes, c.cliente_id)}</label>`, "Asociar", "en-linea")}
      ${formulario(`/panel/conversaciones/${id}/verificar`, sesion, `<label>Verificar identidad manualmente como ${seleccion("cliente_id", opcionesClientes, c.verificado_cliente_id)}</label>`, "Verificar", "en-linea")}
      ${verificado ? formulario(`/panel/conversaciones/${id}/revocar`, sesion, "", "Revocar verificación", "en-linea") : ""}
    </div>
  </section>
  <section class="chat">${mensajes.map((m) => `
    <div class="burbuja ${m.direccion} ${m.autor}">
      <div class="meta">${h(m.autor)} · ${fecha(m.creado)} · ${h(m.estado)}${m.documento_id ? ` · <a href="/panel/documentos/${m.documento_id}">documento #${m.documento_id}</a>` : ""}</div>
      <div>${h(m.texto || (m.documento_id ? "(adjunto)" : ""))}</div>${m.error ? `<div class="error">${h(m.error)}</div>` : ""}
    </div>`).join("")}
  </section>
  ${formulario(`/panel/conversaciones/${id}/responder`, sesion, `<label>Responder como Patricio (pausa el agente en esta conversación)<textarea name="texto" rows="3" maxlength="4000" required></textarea></label>`, "Enviar")}
  <h2>Solicitudes</h2>${tabla(["#", "Tipo", "Materia", "Urgencia", "Nombre declarado", "Comuna", "Siguiente acción", "Estado", "Datos"], solicitudes.map((s) => [
    `<a href="/panel/solicitudes#s${s.id}">${s.id}</a>`, h(s.tipo), h(s.materia || "—"), etiqueta(s.urgencia, s.urgencia), h(s.nombre_declarado || "—"), h(s.comuna || "—"), h(s.siguiente_accion || "—"), h(s.estado), `<code>${h(s.datos)}</code>`
  ]))}
  <h2>Documentos</h2>${tabla(["#", "Clase", "Nombre", "Tipo", "Estado", "Descripción", "Recibido"], docs.map((d) => [
    d.ruta ? `<a href="/panel/documentos/${d.id}">${d.id}</a>` : d.id, h(d.clase), h(d.nombre || "—"), h(d.mime || "—"), h(d.estado) + (d.error ? ` (${h(d.error)})` : ""), h(d.descripcion || "—"), fecha(d.creado)
  ]))}
  <h2>Registro de operaciones de esta conversación</h2>${tablaAuditoria(auditoria)}`;
}

function tablaAuditoria(filas) {
  return tabla(["Fecha", "Actor", "Acción", "Resultado", "Detalle"], filas.map((a) => [fecha(a.ts), h(a.actor), h(a.accion), etiqueta(a.resultado || "", a.resultado === "ok" ? "ok" : a.resultado === "error" ? "alta" : ""), `<code>${h((a.detalle || "").slice(0, 400))}</code>`]));
}

function solicitudes(app, sesion) {
  const filas = app.db.prepare("SELECT s.*, k.telefono FROM solicitudes s JOIN contactos k ON k.id = s.contacto_id ORDER BY CASE s.estado WHEN 'abierta' THEN 0 WHEN 'derivada' THEN 1 ELSE 2 END, CASE s.urgencia WHEN 'urgente' THEN 0 WHEN 'prioritaria' THEN 1 ELSE 2 END, s.actualizado DESC LIMIT 300").all();
  const clientes = app.db.prepare("SELECT id, nombre FROM clientes ORDER BY nombre").all();
  return tabla(["#", "Conv.", "Tipo", "Cliente", "Materia", "Urgencia", "Nombre / comuna", "Motivo", "Siguiente acción", "Gestión"], filas.map((s) => [
    `<span id="s${s.id}">${s.id}</span>`, enlaceConv(s.conversacion_id), h(s.tipo) + "<br>" + h(s.tipo_cliente || ""), s.cliente_id ? `<a href="/panel/clientes/${s.cliente_id}">ficha #${s.cliente_id}</a>` : "—",
    h(s.materia || "—"), etiqueta(s.urgencia, s.urgencia), `${h(s.nombre_declarado || "—")}<br>${h(s.comuna || "")}`, h((s.motivo || "").slice(0, 200)), h(s.siguiente_accion || "—"),
    formulario(`/panel/solicitudes/${s.id}`, sesion, `${seleccion("estado", ["abierta", "derivada", "cerrada"], s.estado)} ${seleccion("urgencia", ["normal", "prioritaria", "urgente"], s.urgencia)}`, "Actualizar", "en-linea") +
    (s.asunto_id ? `<br>Asunto #${s.asunto_id}` : formulario(`/panel/solicitudes/${s.id}/asunto`, sesion,
      `<label>Aceptar como asunto de ${seleccion("cliente_id", [["", "— ficha existente —"], ...clientes.map((c) => [c.id, c.nombre])], s.cliente_id)}</label><label>o crear ficha: nombre <input name="nuevo_nombre" value="${h(s.nombre_declarado || "")}"></label><label>RUT <input name="nuevo_rut"></label><label>Título del asunto <input name="titulo" required value="${h((s.motivo || "").slice(0, 80))}"></label>`, "Crear asunto"))
  ]), "No hay solicitudes.");
}

function clientes(app, sesion) {
  const filas = app.db.prepare("SELECT c.*, (SELECT COUNT(*) FROM asuntos a WHERE a.cliente_id = c.id) AS n_asuntos FROM clientes c ORDER BY c.nombre").all();
  return `${tabla(["#", "Nombre", "RUT", "Tipo", "Asuntos", "Código de verificación"], filas.map((c) => [
    `<a href="/panel/clientes/${c.id}">${c.id}</a>`, `<a href="/panel/clientes/${c.id}">${h(c.nombre)}</a>`, h(c.rut || "—"), h(c.tipo), c.n_asuntos, c.pin_hash ? etiqueta("asignado", "ok") : etiqueta("sin código")
  ]), "Aún no hay clientes registrados.")}
  <h2>Nuevo cliente</h2>
  ${formulario("/panel/clientes", sesion, `<label>Nombre <input name="nombre" required maxlength="160"></label><label>RUT <input name="rut" maxlength="15"></label><label>Tipo ${seleccion("tipo", ["persona", "empresa"], "persona")}</label><label>Correo <input name="email" type="email" maxlength="160"></label><label>Notas internas <textarea name="notas" rows="2"></textarea></label>`, "Crear")}`;
}

function detalleCliente(app, sesion, id, pinNuevo = null) {
  const { db } = app;
  const c = db.prepare("SELECT * FROM clientes WHERE id = ?").get(id);
  if (!c) return null;
  const asuntos = db.prepare("SELECT * FROM asuntos WHERE cliente_id = ? ORDER BY actualizado DESC").all(id);
  const contactos = db.prepare("SELECT * FROM contactos WHERE cliente_id = ?").all(id);
  const antecedentes = db.prepare("SELECT * FROM antecedentes WHERE cliente_id = ? ORDER BY id DESC LIMIT 100").all(id);
  const pagos = db.prepare("SELECT * FROM pagos WHERE cliente_id = ? ORDER BY id DESC").all(id);
  const docs = db.prepare("SELECT * FROM documentos WHERE cliente_id = ? ORDER BY id DESC").all(id);
  return `
  ${pinNuevo ? `<p class="aviso">Código de verificación nuevo: <b class="pin">${h(pinNuevo)}</b>. Entréguelo al cliente por un canal seguro (en persona o llamada). No se volverá a mostrar.</p>` : ""}
  <section class="tarjeta">
  ${formulario(`/panel/clientes/${id}`, sesion, `<label>Nombre <input name="nombre" required value="${h(c.nombre)}"></label><label>RUT <input name="rut" value="${h(c.rut || "")}"></label><label>Tipo ${seleccion("tipo", ["persona", "empresa"], c.tipo)}</label><label>Correo <input name="email" type="email" value="${h(c.email || "")}"></label><label>Notas internas <textarea name="notas" rows="2">${h(c.notas || "")}</textarea></label>`)}
  ${formulario(`/panel/clientes/${id}/pin`, sesion, "<p>El código, junto con el RUT, permite al cliente verificar su identidad por WhatsApp.</p>", c.pin_hash ? "Generar un código nuevo (reemplaza el anterior)" : "Generar código de verificación")}
  <p>Números asociados: ${contactos.length ? contactos.map((k) => h(k.telefono)).join(", ") : "ninguno"} (se asocian desde la conversación).</p>
  </section>
  <h2>Asuntos</h2>
  ${asuntos.map((a) => {
    const gestiones = db.prepare("SELECT * FROM gestiones WHERE asunto_id = ? ORDER BY fecha DESC").all(a.id);
    return `<section class="tarjeta"><h3>#${a.id} ${h(a.titulo)}</h3>
    ${formulario(`/panel/asuntos/${a.id}`, sesion, `<label>Título <input name="titulo" value="${h(a.titulo)}"></label><label>Materia <input name="materia" value="${h(a.materia || "")}"></label><label>Estado ${seleccion("estado", ["en_evaluacion", "en_curso", "suspendido", "cerrado"], a.estado)}</label><label>Tribunal u organismo <input name="tribunal" value="${h(a.tribunal || "")}"></label><label>Rol / RIT <input name="rol" value="${h(a.rol || "")}"></label><label>Próximo paso (visible al cliente verificado) <input name="siguiente_accion" value="${h(a.siguiente_accion || "")}"></label><label>Resumen para el cliente <textarea name="resumen_cliente" rows="2">${h(a.resumen_cliente || "")}</textarea></label>`)}
    ${tabla(["Fecha", "Gestión", "Visible al cliente"], gestiones.map((g) => [h(g.fecha), h(g.descripcion), g.visible_cliente ? "sí" : "no"]), "Sin gestiones registradas.")}
    ${formulario(`/panel/asuntos/${a.id}/gestiones`, sesion, `<label>Fecha <input name="fecha" type="date" required></label><label>Gestión <input name="descripcion" required maxlength="500"></label><label><input type="checkbox" name="visible" value="1" checked> visible al cliente verificado</label>`, "Agregar gestión")}
    </section>`;
  }).join("")}
  ${formulario(`/panel/clientes/${id}/asuntos`, sesion, `<label>Título <input name="titulo" required></label><label>Materia <input name="materia"></label>`, "Crear asunto")}
  <h2>Antecedentes</h2>
  ${tabla(["Campo", "Valor", "Origen", "Registrado por", "Fecha", ""], antecedentes.map((x) => [h(x.campo), h(x.valor), etiqueta(x.origen, x.origen === "verificado" ? "ok" : ""), h(x.registrado_por), fecha(x.creado),
    x.origen !== "verificado" ? formulario(`/panel/antecedentes/${x.id}/verificar`, sesion, "", "Marcar verificado", "en-linea") : ""]))}
  <h2>Pagos</h2>${tabla(["#", "Monto declarado", "Concepto", "Estado", "Fecha"], pagos.map((p) => [p.id, h(p.monto_declarado || "—"), h(p.concepto || "—"), etiqueta(p.estado, p.estado === "verificado" ? "ok" : ""), fecha(p.creado)]))}
  <h2>Documentos</h2>${tabla(["#", "Nombre", "Clase", "Descripción", "Fecha"], docs.map((d) => [d.ruta ? `<a href="/panel/documentos/${d.id}">${d.id}</a>` : d.id, h(d.nombre || "—"), h(d.clase), h(d.descripcion || "—"), fecha(d.creado)]))}`;
}

function citas(app, sesion) {
  const filas = app.db.prepare("SELECT c.*, k.telefono FROM citas c JOIN contactos k ON k.id = c.contacto_id WHERE c.inicio >= ? ORDER BY c.inicio").all(new Date(Date.now() - 86400_000).toISOString());
  const ag = leerAgenda(app.db);
  const dias = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  return `${tabla(["#", "Inicio", "Nombre", "Teléfono", "Motivo", "Modalidad", "Estado", ""], filas.map((c) => [
    c.id, fecha(c.inicio), h(c.nombre || "—"), h(c.telefono), h(c.motivo || "—"), h(c.modalidad || "—"), etiqueta(c.estado, c.estado === "confirmada" ? "ok" : ""),
    c.estado === "confirmada" ? formulario(`/panel/citas/${c.id}/cancelar`, sesion, "", "Cancelar", "en-linea") : ""
  ]), "No hay citas próximas.")}
  <h2>Configuración de la agenda</h2>
  <p>Mientras la agenda no esté habilitada, el agente no ofrece horas y deja la solicitud para que usted la coordine. Indique las horas de inicio de cada bloque, separadas por coma (por ejemplo <code>09:00, 10:00</code>).</p>
  ${formulario("/panel/agenda", sesion, `
    <label><input type="checkbox" name="configurada" value="1"${ag.configurada ? " checked" : ""}> Agenda en línea habilitada</label>
    <label>Duración de cada cita (minutos) <input name="duracionMinutos" type="number" min="10" max="240" value="${ag.duracionMinutos}"></label>
    <label>Anticipación mínima (horas) <input name="anticipacionHoras" type="number" min="0" max="336" value="${ag.anticipacionHoras}"></label>
    <label>Días hacia adelante que se ofrecen <input name="diasVista" type="number" min="1" max="60" value="${ag.diasVista}"></label>
    <label>Modalidades (separadas por coma) <input name="modalidades" value="${h(ag.modalidades.join(", "))}"></label>
    ${dias.slice(1).map((d, i) => `<label>${d} <input name="bloque_${i + 1}" value="${h((ag.bloques[i + 1] || []).join(", "))}"></label>`).join("")}
    <label>Días sin atención (AAAA-MM-DD, separados por coma) <input name="excepciones" value="${h(ag.excepciones.join(", "))}"></label>`, "Guardar agenda")}`;
}

function pagos(app, sesion) {
  const filas = app.db.prepare("SELECT p.*, k.telefono FROM pagos p JOIN contactos k ON k.id = p.contacto_id ORDER BY CASE p.estado WHEN 'pendiente_verificacion' THEN 0 ELSE 1 END, p.id DESC LIMIT 300").all();
  return `<p>Un comprobante queda pendiente hasta que usted lo verifique contra su cartola u otra fuente autorizada.</p>` + tabla(["#", "Conv.", "Teléfono", "Comprobante", "Monto declarado", "Concepto", "Estado", "Gestión"], filas.map((p) => [
    p.id, enlaceConv(p.conversacion_id), h(p.telefono), p.documento_id ? `<a href="/panel/documentos/${p.documento_id}">documento #${p.documento_id}</a>` : "—", h(p.monto_declarado || "—"), h(p.concepto || "—"),
    etiqueta(p.estado, p.estado === "verificado" ? "ok" : p.estado === "rechazado" ? "alta" : "") + (p.verificado_por ? `<br>${h(p.verificado_por)} ${fecha(p.verificado_en)}` : ""),
    p.estado === "pendiente_verificacion" ? formulario(`/panel/pagos/${p.id}`, sesion, `${seleccion("estado", [["verificado", "Verificado"], ["rechazado", "Rechazado"]], "verificado")}<input name="nota" placeholder="Nota (fuente de verificación)" maxlength="300">`, "Registrar", "en-linea") : h(p.nota || "")
  ]), "No hay comprobantes.");
}

function conocimiento(app, sesion) {
  const filas = app.db.prepare("SELECT * FROM conocimiento ORDER BY CASE estado WHEN 'pendiente' THEN 0 WHEN 'borrador' THEN 1 ELSE 2 END, categoria, clave").all();
  return `<p>El agente solo usa entradas <b>aprobadas</b>. Las <b>pendientes</b> tienen datos por completar; los <b>borradores</b> son textos propuestos para su revisión.</p>
  ${filas.map((k) => `<section class="tarjeta kb ${h(k.estado)}" id="kb${k.id}">
    ${formulario(`/panel/conocimiento/${k.id}`, sesion, `<p><code>${h(k.clave)}</code> · ${h(k.categoria)} · ${etiqueta(k.estado, k.estado === "aprobado" ? "ok" : k.estado === "pendiente" ? "alta" : "")} · actualizado ${fecha(k.actualizado)} por ${h(k.actualizado_por)}</p>
      <label>Título <input name="titulo" value="${h(k.titulo)}" maxlength="200"></label>
      <label>Contenido (lo que el agente puede decir) <textarea name="contenido" rows="3" maxlength="3000">${h(k.contenido)}</textarea></label>
      <label>Estado ${seleccion("estado", ["aprobado", "pendiente", "borrador"], k.estado)}</label>
      <label>Nota interna (no la ve el agente) <input name="nota_interna" value="${h(k.nota_interna || "")}"></label>`)}
  </section>`).join("")}
  <h2>Nueva entrada</h2>
  ${formulario("/panel/conocimiento", sesion, `<label>Clave (ej. honorarios.laboral) <input name="clave" required pattern="[a-z0-9_.]+" maxlength="80"></label><label>Categoría <input name="categoria" required maxlength="40"></label><label>Título <input name="titulo" required></label><label>Contenido <textarea name="contenido" rows="3" required></textarea></label><label>Estado ${seleccion("estado", ["borrador", "aprobado", "pendiente"], "borrador")}</label>`, "Crear")}`;
}

function simulador(app) {
  return `<p>Converse con el agente como si fuera un cliente. Los mensajes pasan por el mismo proceso que los de WhatsApp (memoria, herramientas, alertas y controles), pero la respuesta no se envía a ningún teléfono. Use números distintos para simular clientes distintos.</p>
  <div class="simulador">
    <div>
      <label>Número simulado <input id="sim-telefono" value="56900000001" maxlength="15"></label>
      <div id="sim-chat" class="chat"></div>
      <form id="sim-form">
        <textarea id="sim-texto" rows="2" placeholder="Escriba un mensaje…"></textarea>
        <label>Adjuntar archivo (opcional) <input id="sim-archivo" type="file"></label>
        <button>Enviar</button> <button type="button" id="sim-reiniciar" class="secundario">Reiniciar este número</button>
      </form>
    </div>
    <aside><h2>Qué hizo el agente</h2><div id="sim-traza"><p class="vacio">Aún no hay acciones.</p></div></aside>
  </div>
  <script src="/panel/estaticos/simulador.js"></script>`;
}

// ---------------------------------------------------------------------------
// Acciones POST
// ---------------------------------------------------------------------------

function borrarConversacionPrueba(db, telefono) {
  const fila = db.prepare("SELECT c.id, c.contacto_id FROM conversaciones c JOIN contactos k ON k.id = c.contacto_id WHERE k.telefono = ? AND c.es_prueba = 1").get(telefono);
  if (!fila) return false;
  for (const t of ["pagos", "citas", "antecedentes"]) db.prepare(`DELETE FROM ${t} WHERE contacto_id = ?`).run(fila.contacto_id);
  db.prepare("UPDATE mensajes SET documento_id = NULL, en_respuesta_a = NULL WHERE conversacion_id = ?").run(fila.id);
  db.prepare("DELETE FROM documentos WHERE conversacion_id = ?").run(fila.id);
  db.prepare("DELETE FROM alertas WHERE conversacion_id = ?").run(fila.id);
  db.prepare("DELETE FROM solicitudes WHERE conversacion_id = ?").run(fila.id);
  db.prepare("DELETE FROM mensajes WHERE conversacion_id = ?").run(fila.id);
  db.prepare("DELETE FROM conversaciones WHERE id = ?").run(fila.id);
  db.prepare("DELETE FROM contactos WHERE id = ?").run(fila.contacto_id);
  return true;
}

async function accion(app, req, res, sesion, partes, f) {
  const { db, cfg } = app;
  const actor = `admin:${sesion.usuario}`;
  const [seccion, idTxt, sub] = partes;
  const id = Number(idTxt);
  const volver = (ruta) => redirigir(res, ruta);

  if (seccion === "ajustes" && idTxt === "pausa") {
    guardarAjuste(db, "agente_pausado", f.pausar === "1");
    auditar(db, { actor, accion: f.pausar === "1" ? "agente.pausar_todo" : "agente.reanudar_todo" });
    return volver("/panel");
  }
  if (seccion === "conversaciones" && id) {
    if (sub === "modo") { fijarModo(db, id, f.modo === "humano" ? "humano" : "auto", f.modo === "humano" ? "Patricio tomó la conversación" : "Devuelta al agente", actor); return volver(`/panel/conversaciones/${id}`); }
    if (sub === "responder") {
      const r = await app.procesador.enviarManual(id, String(f.texto || "").slice(0, 4000), actor);
      if (r.error) return pagina(app, res, sesion, `Conversación #${id}`, detalleConversacion(app, sesion, id), r.detalle || r.error, 400);
      return volver(`/panel/conversaciones/${id}`);
    }
    if (sub === "vincular") {
      const conv = db.prepare("SELECT contacto_id FROM conversaciones WHERE id = ?").get(id);
      db.prepare("UPDATE contactos SET cliente_id = ? WHERE id = ?").run(f.cliente_id ? Number(f.cliente_id) : null, conv.contacto_id);
      auditar(db, { actor, accion: "contacto.vincular", conversacionId: id, detalle: { cliente_id: f.cliente_id || null } });
      return volver(`/panel/conversaciones/${id}`);
    }
    if (sub === "verificar" && f.cliente_id) { verificarManual(db, cfg.agente, id, Number(f.cliente_id), actor); return volver(`/panel/conversaciones/${id}`); }
    if (sub === "revocar") { revocarVerificacion(db, id, actor); return volver(`/panel/conversaciones/${id}`); }
  }
  if (seccion === "alertas" && id && sub === "resolver") { resolverAlerta(db, id, actor); return volver(req.headers.referer?.includes("/panel/alertas") ? "/panel/alertas" : "/panel"); }
  if (seccion === "clientes") {
    const datos = () => {
      const rut = f.rut ? normalizarRut(f.rut) : null;
      if (f.rut && !rutValido(f.rut)) throw new ErrorHttp(400, "RUT inválido");
      return [String(f.nombre || "").trim().slice(0, 160), rut, f.tipo === "empresa" ? "empresa" : "persona", f.email || null, f.notas || null];
    };
    if (!idTxt) {
      const r = db.prepare("INSERT INTO clientes (nombre, rut, tipo, email, notas, creado, actualizado) VALUES (?, ?, ?, ?, ?, ?, ?)").run(...datos(), ahora(), ahora());
      auditar(db, { actor, accion: "cliente.crear", detalle: { id: Number(r.lastInsertRowid) } });
      return volver(`/panel/clientes/${r.lastInsertRowid}`);
    }
    if (!sub) { db.prepare("UPDATE clientes SET nombre = ?, rut = ?, tipo = ?, email = ?, notas = ?, actualizado = ? WHERE id = ?").run(...datos(), ahora(), id); auditar(db, { actor, accion: "cliente.editar", detalle: { id } }); return volver(`/panel/clientes/${id}`); }
    if (sub === "pin") {
      const pin = generarPin();
      db.prepare("UPDATE clientes SET pin_hash = ?, actualizado = ? WHERE id = ?").run(hashClave(pin), ahora(), id);
      auditar(db, { actor, accion: "cliente.generar_codigo", detalle: { id } });
      return pagina(app, res, sesion, "Ficha de cliente", detalleCliente(app, sesion, id, pin));
    }
    if (sub === "asuntos") {
      const r = db.prepare("INSERT INTO asuntos (cliente_id, titulo, materia, estado, creado, actualizado) VALUES (?, ?, ?, 'en_curso', ?, ?)").run(id, String(f.titulo).slice(0, 200), f.materia || null, ahora(), ahora());
      auditar(db, { actor, accion: "asunto.crear", detalle: { id: Number(r.lastInsertRowid), cliente_id: id } });
      return volver(`/panel/clientes/${id}`);
    }
  }
  if (seccion === "asuntos" && id) {
    const a = db.prepare("SELECT cliente_id FROM asuntos WHERE id = ?").get(id);
    if (!a) throw new ErrorHttp(404, "asunto_no_encontrado");
    if (!sub) {
      db.prepare("UPDATE asuntos SET titulo = ?, materia = ?, estado = ?, tribunal = ?, rol = ?, siguiente_accion = ?, resumen_cliente = ?, actualizado = ? WHERE id = ?")
        .run(f.titulo, f.materia || null, f.estado, f.tribunal || null, f.rol || null, f.siguiente_accion || null, f.resumen_cliente || null, ahora(), id);
      auditar(db, { actor, accion: "asunto.editar", detalle: { id } });
    } else if (sub === "gestiones") {
      db.prepare("INSERT INTO gestiones (asunto_id, fecha, descripcion, visible_cliente, creado) VALUES (?, ?, ?, ?, ?)").run(id, f.fecha, String(f.descripcion).slice(0, 500), f.visible === "1" ? 1 : 0, ahora());
      db.prepare("UPDATE asuntos SET actualizado = ? WHERE id = ?").run(ahora(), id);
      auditar(db, { actor, accion: "gestion.crear", detalle: { asunto_id: id } });
    }
    return volver(`/panel/clientes/${a.cliente_id}`);
  }
  if (seccion === "antecedentes" && id && sub === "verificar") {
    const x = db.prepare("SELECT * FROM antecedentes WHERE id = ?").get(id);
    db.prepare("UPDATE antecedentes SET origen = 'verificado', registrado_por = ? WHERE id = ?").run(`${x.registrado_por} (${x.origen}) → verificado por ${actor}`, id);
    auditar(db, { actor, accion: "antecedente.verificar", detalle: { id } });
    return volver(x.cliente_id ? `/panel/clientes/${x.cliente_id}` : "/panel/solicitudes");
  }
  if (seccion === "solicitudes" && id) {
    if (!sub) {
      db.prepare("UPDATE solicitudes SET estado = ?, urgencia = ?, actualizado = ? WHERE id = ?").run(f.estado, f.urgencia, ahora(), id);
      auditar(db, { actor, accion: "solicitud.editar", detalle: { id, estado: f.estado } });
      return volver("/panel/solicitudes");
    }
    if (sub === "asunto") {
      const s = db.prepare("SELECT * FROM solicitudes WHERE id = ?").get(id);
      let clienteId = f.cliente_id ? Number(f.cliente_id) : null;
      if (!clienteId) {
        if (!f.nuevo_nombre) throw new ErrorHttp(400, "Indique una ficha existente o el nombre de la nueva ficha");
        if (f.nuevo_rut && !rutValido(f.nuevo_rut)) throw new ErrorHttp(400, "RUT inválido");
        clienteId = Number(db.prepare("INSERT INTO clientes (nombre, rut, tipo, creado, actualizado) VALUES (?, ?, 'persona', ?, ?)").run(f.nuevo_nombre, f.nuevo_rut ? normalizarRut(f.nuevo_rut) : null, ahora(), ahora()).lastInsertRowid);
      }
      const asuntoId = Number(db.prepare("INSERT INTO asuntos (cliente_id, titulo, materia, estado, creado, actualizado) VALUES (?, ?, ?, 'en_evaluacion', ?, ?)").run(clienteId, String(f.titulo).slice(0, 200), s.materia, ahora(), ahora()).lastInsertRowid);
      db.prepare("UPDATE solicitudes SET asunto_id = ?, cliente_id = ?, actualizado = ? WHERE id = ?").run(asuntoId, clienteId, ahora(), id);
      db.prepare("UPDATE documentos SET cliente_id = ?, asunto_id = COALESCE(asunto_id, ?) WHERE solicitud_id = ?").run(clienteId, asuntoId, id);
      db.prepare("UPDATE antecedentes SET cliente_id = ?, asunto_id = COALESCE(asunto_id, ?) WHERE solicitud_id = ?").run(clienteId, asuntoId, id);
      auditar(db, { actor, accion: "solicitud.aceptar_asunto", conversacionId: s.conversacion_id, detalle: { solicitud_id: id, asunto_id: asuntoId, cliente_id: clienteId } });
      return volver(`/panel/clientes/${clienteId}`);
    }
  }
  if (seccion === "citas" && id && sub === "cancelar") { cancelarCita(db, { citaId: id }); auditar(db, { actor, accion: "cita.cancelar", detalle: { id } }); return volver("/panel/citas"); }
  if (seccion === "agenda") {
    const horas = (v) => String(v || "").split(",").map((s) => s.trim()).filter((s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s));
    const bloques = {};
    for (let d = 1; d <= 7; d++) bloques[d] = horas(f[`bloque_${d}`]);
    guardarAgenda(db, {
      configurada: f.configurada === "1",
      duracionMinutos: Math.min(240, Math.max(10, Number(f.duracionMinutos) || 45)),
      anticipacionHoras: Math.min(336, Math.max(0, Number(f.anticipacionHoras) || 0)),
      diasVista: Math.min(60, Math.max(1, Number(f.diasVista) || 14)),
      maxOpciones: 6,
      modalidades: String(f.modalidades || "").split(",").map((s) => s.trim()).filter(Boolean),
      bloques,
      excepciones: String(f.excepciones || "").split(",").map((s) => s.trim()).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s))
    });
    auditar(db, { actor, accion: "agenda.configurar" });
    return volver("/panel/citas");
  }
  if (seccion === "pagos" && id) {
    if (!["verificado", "rechazado"].includes(f.estado)) throw new ErrorHttp(400, "estado_invalido");
    db.prepare("UPDATE pagos SET estado = ?, verificado_por = ?, verificado_en = ?, nota = ? WHERE id = ? AND estado = 'pendiente_verificacion'").run(f.estado, actor, ahora(), f.nota || null, id);
    auditar(db, { actor, accion: `pago.${f.estado}`, detalle: { id } });
    return volver("/panel/pagos");
  }
  if (seccion === "conocimiento") {
    if (!["aprobado", "pendiente", "borrador"].includes(f.estado)) throw new ErrorHttp(400, "estado_invalido");
    if (id) {
      db.prepare("UPDATE conocimiento SET titulo = ?, contenido = ?, estado = ?, nota_interna = ?, actualizado = ?, actualizado_por = ? WHERE id = ?").run(String(f.titulo).slice(0, 200), String(f.contenido).slice(0, 3000), f.estado, f.nota_interna || null, ahora(), actor, id);
      auditar(db, { actor, accion: "conocimiento.editar", detalle: { id, estado: f.estado } });
      return volver(`/panel/conocimiento#kb${id}`);
    }
    if (!/^[a-z0-9_.]{3,80}$/.test(f.clave || "")) throw new ErrorHttp(400, "Clave inválida: use minúsculas, números, punto o guion bajo");
    if (db.prepare("SELECT 1 FROM conocimiento WHERE clave = ?").get(f.clave)) throw new ErrorHttp(400, "Ya existe una entrada con esa clave");
    db.prepare("INSERT INTO conocimiento (clave, categoria, titulo, contenido, estado, actualizado, actualizado_por) VALUES (?, ?, ?, ?, ?, ?, ?)").run(f.clave, String(f.categoria).slice(0, 40), String(f.titulo).slice(0, 200), String(f.contenido).slice(0, 3000), f.estado, ahora(), actor);
    auditar(db, { actor, accion: "conocimiento.crear", detalle: { clave: f.clave } });
    return volver("/panel/conocimiento");
  }
  if (seccion === "simulador") {
    const telefono = String(f.telefono || "").replace(/\D/g, "");
    if (!telefono) return json(res, { error: "telefono_requerido" }, 400);
    if (idTxt === "reiniciar") return json(res, { ok: borrarConversacionPrueba(db, telefono) });
    const existente = db.prepare("SELECT c.es_prueba FROM conversaciones c JOIN contactos k ON k.id = c.contacto_id WHERE k.telefono = ?").get(telefono);
    if (existente && !existente.es_prueba) return json(res, { error: "Ese número pertenece a una conversación real. Use otro número para simular." }, 400);
    const r = await app.procesador.simularEntrante({ telefono, texto: f.texto ? String(f.texto).slice(0, 4000) : null, archivo: f.archivo || null });
    const respuesta = r.envio?.id ? db.prepare("SELECT texto FROM mensajes WHERE id = ?").get(r.envio.id)?.texto : null;
    const alertas = r.conversacionId ? db.prepare("SELECT tipo, prioridad, descripcion FROM alertas WHERE conversacion_id = ? AND estado = 'abierta' ORDER BY id DESC LIMIT 5").all(r.conversacionId) : [];
    return json(res, { conversacion_id: r.conversacionId, respuesta, sin_respuesta: !!r.sinRespuesta, acciones: r.turno?.acciones || [], problemas: r.turno?.problemas || [], error: r.turno?.error || r.error || null, alertas });
  }
  throw new ErrorHttp(404, "accion_no_encontrada");
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export async function manejarPanel(app, req, res, url) {
  const partes = url.pathname.replace(/^\/panel\/?/, "").split("/").filter(Boolean);

  if (partes[0] === "estaticos") {
    const nombre = partes[1];
    if (!/^[a-z-]+\.(css|js)$/.test(nombre || "")) return enviar(res, 404, "no_encontrado");
    const ruta = join(ESTATICOS, nombre);
    if (!existsSync(ruta)) return enviar(res, 404, "no_encontrado");
    return enviar(res, 200, readFileSync(ruta), nombre.endsWith(".css") ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8");
  }

  if (partes[0] === "login") {
    if (req.method === "POST") {
      const ip = ipCliente(req);
      if (limiteLogin(ip)) return html(res, layout({ titulo: "Ingreso", cuerpo: login("Demasiados intentos. Espere 15 minutos."), cfg: app.cfg }), 429);
      const f = await formularioDe(req, 10_000);
      const ok = !!app.cfg.admin.claveHash && igualesSeguro(f.usuario || "", app.cfg.admin.usuario) && verificarClave(f.clave || "", app.cfg.admin.claveHash);
      auditar(app.db, { actor: "panel", accion: "panel.login", resultado: ok ? "ok" : "rechazado", detalle: { ip } });
      if (!ok) { falloLogin(ip); return html(res, layout({ titulo: "Ingreso", cuerpo: login(app.cfg.admin.claveHash ? "Usuario o clave incorrectos." : "El panel no tiene clave configurada (ADMIN_CLAVE_HASH)."), cfg: app.cfg }), 401); }
      intentosLogin.delete(ip);
      return redirigir(res, "/panel", { "Set-Cookie": crearSesion(app, f.usuario) });
    }
    return html(res, layout({ titulo: "Ingreso", cuerpo: login(), cfg: app.cfg }));
  }

  const sesion = sesionDe(app, req);
  if (!sesion) {
    if (req.method === "POST" && partes[0] === "simulador") return json(res, { error: "sesion_expirada" }, 401);
    return redirigir(res, "/panel/login");
  }

  if (req.method === "POST") {
    const f = await formularioDe(req, partes[0] === "simulador" ? 25_000_000 : 1_000_000);
    const token = req.headers["x-csrf"] || f._csrf;
    if (!token || !igualesSeguro(token, sesion.csrf)) return enviar(res, 403, "csrf_invalido");
    if (partes[0] === "salir") {
      app.db.prepare("DELETE FROM sesiones_admin WHERE token_hash = ?").run(sesion.token_hash);
      return redirigir(res, "/panel/login", { "Set-Cookie": `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/panel; Max-Age=0` });
    }
    return accion(app, req, res, sesion, partes, f);
  }

  const [seccion, idTxt] = partes;
  const id = Number(idTxt);
  switch (seccion) {
    case undefined: return pagina(app, res, sesion, "Resumen", resumen(app, sesion));
    case "alertas": {
      const filas = app.db.prepare("SELECT * FROM alertas ORDER BY CASE estado WHEN 'abierta' THEN 0 ELSE 1 END, CASE prioridad WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, id DESC LIMIT 300").all();
      return pagina(app, res, sesion, "Alertas", listaAlertas(app, sesion, filas));
    }
    case "conversaciones": {
      if (idTxt) { const c = detalleConversacion(app, sesion, id); return c ? pagina(app, res, sesion, `Conversación #${id}`, c) : enviar(res, 404, "no_encontrado"); }
      return pagina(app, res, sesion, "Conversaciones", conversaciones(app));
    }
    case "solicitudes": return pagina(app, res, sesion, "Solicitudes", solicitudes(app, sesion));
    case "clientes": {
      if (idTxt) { const c = detalleCliente(app, sesion, id); return c ? pagina(app, res, sesion, "Ficha de cliente", c) : enviar(res, 404, "no_encontrado"); }
      return pagina(app, res, sesion, "Clientes", clientes(app, sesion));
    }
    case "citas": return pagina(app, res, sesion, "Citas", citas(app, sesion));
    case "pagos": return pagina(app, res, sesion, "Comprobantes de pago", pagos(app, sesion));
    case "conocimiento": return pagina(app, res, sesion, "Base de conocimiento", conocimiento(app, sesion));
    case "simulador": return pagina(app, res, sesion, "Simulador", simulador(app));
    case "auditoria": {
      const filas = app.db.prepare("SELECT * FROM auditoria ORDER BY id DESC LIMIT 300").all();
      return pagina(app, res, sesion, "Registro de operaciones", tablaAuditoria(filas.map((a) => ({ ...a, accion: a.conversacion_id ? `${a.accion} (conv. #${a.conversacion_id})` : a.accion }))));
    }
    case "documentos": {
      const d = app.db.prepare("SELECT * FROM documentos WHERE id = ?").get(id);
      const base = resolve(app.cfg.dirDatos);
      if (!d?.ruta || !resolve(d.ruta).startsWith(base + "/") || !existsSync(d.ruta)) return enviar(res, 404, "no_encontrado");
      auditar(app.db, { actor: `admin:${sesion.usuario}`, accion: "documento.descargar", conversacionId: d.conversacion_id, detalle: { id } });
      const nombre = (d.nombre || `documento-${d.id}`).replace(/[^\w.\-áéíóúñÁÉÍÓÚÑ ]/g, "_").slice(0, 100);
      return enviar(res, 200, readFileSync(d.ruta), "application/octet-stream", { "Content-Disposition": `attachment; filename="${encodeURIComponent(nombre)}"` });
    }
    default: return enviar(res, 404, "no_encontrado");
  }
}
