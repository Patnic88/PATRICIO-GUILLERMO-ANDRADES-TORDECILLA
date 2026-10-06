/* Facturador A&A: interfaz. Vanilla JS, sin dependencias. */
"use strict";

const estado = {
  config: {},
  tipos: {},
  periodicidades: [],
  hoy: "",
  clientes: [],
  servicios: [],
  vista: "panel",
  filtrosDocs: { estado: "", tipo: "", buscar: "", desde: "", hasta: "" },
  periodoPlanes: "",
};

// ------------------------------------------------------------------ utilidades

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function clp(n) {
  n = Math.round(Number(n) || 0);
  const s = Math.abs(n).toLocaleString("es-CL");
  return (n < 0 ? "-" : "") + "$ " + s;
}

function fecha(iso) {
  if (!iso) return "";
  const p = String(iso).slice(0, 10).split("-");
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : iso;
}

function formatearRut(rut) {
  const limpio = String(rut || "").replace(/[^0-9kK]/g, "").toUpperCase();
  if (limpio.length < 2) return limpio;
  const cuerpo = limpio.slice(0, -1), dv = limpio.slice(-1);
  return cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "-" + dv;
}

function rutValido(rut) {
  const limpio = String(rut || "").replace(/[^0-9kK]/g, "").toUpperCase();
  if (limpio.length < 2) return false;
  const cuerpo = limpio.slice(0, -1), dv = limpio.slice(-1);
  if (!/^\d{1,8}$/.test(cuerpo)) return false;
  let suma = 0, factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  const esperado = resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
  return esperado === dv;
}

function aviso(texto, tipo = "") {
  const el = document.createElement("div");
  el.className = "aviso " + tipo;
  el.textContent = texto;
  $("#avisos").appendChild(el);
  setTimeout(() => el.remove(), tipo === "error" ? 6000 : 3500);
}

async function api(ruta, opciones = {}) {
  const init = { method: opciones.metodo || "GET", headers: {} };
  if (opciones.cuerpo !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opciones.cuerpo);
  }
  const resp = await fetch("/api" + ruta, init);
  let datos = null;
  try { datos = await resp.json(); } catch (e) { datos = null; }
  if (!resp.ok) {
    const mensaje = (datos && datos.error) || `Error ${resp.status}`;
    throw new Error(mensaje);
  }
  return datos;
}

function periodoActual() {
  return (estado.hoy || new Date().toISOString()).slice(0, 7);
}

function nombrePeriodo(p) {
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
    "septiembre", "octubre", "noviembre", "diciembre"];
  const [a, m] = p.split("-").map(Number);
  return `${meses[m - 1]} ${a}`;
}

function opcionesSelect(lista, valorActual, obtener = x => [x.id, x.nombre]) {
  return lista.map(x => {
    const [v, t] = obtener(x);
    return `<option value="${esc(v)}" ${String(v) === String(valorActual) ? "selected" : ""}>${esc(t)}</option>`;
  }).join("");
}

function datosFormulario(form) {
  const datos = {};
  new FormData(form).forEach((v, k) => { datos[k] = v; });
  $$("input[type=checkbox]", form).forEach(c => { datos[c.name] = c.checked ? 1 : 0; });
  return datos;
}

// ---------------------------------------------------------------------- modal

function abrirModal(html, { ancho = false } = {}) {
  const modal = $("#modal");
  modal.className = ancho ? "ancho" : "";
  modal.innerHTML = html;
  $("#modal-fondo").classList.remove("oculta");
  $$("[data-cerrar]", modal).forEach(b => b.addEventListener("click", cerrarModal));
  const primero = $("input, select, textarea", modal);
  if (primero) primero.focus();
  return modal;
}

function cerrarModal() {
  $("#modal-fondo").classList.add("oculta");
  $("#modal").innerHTML = "";
}

$("#modal-fondo").addEventListener("click", e => { if (e.target.id === "modal-fondo") cerrarModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") cerrarModal(); });

function confirmar(mensaje, { textoBoton = "Confirmar", peligro = true, campo = null } = {}) {
  return new Promise(resolve => {
    const modal = abrirModal(`
      <h2>Confirmar</h2>
      <p>${esc(mensaje)}</p>
      ${campo ? `<label class="ancho">${esc(campo)}<br><input id="confirmar-campo" style="width:100%"></label>` : ""}
      <div class="pie-modal">
        <button data-cerrar>Cancelar</button>
        <button id="confirmar-ok" class="${peligro ? "peligro" : "primario"}">${esc(textoBoton)}</button>
      </div>`);
    $("#confirmar-ok", modal).addEventListener("click", () => {
      const valor = campo ? $("#confirmar-campo", modal).value : true;
      cerrarModal();
      resolve(valor);
    });
    $$("[data-cerrar]", modal).forEach(b => b.addEventListener("click", () => resolve(null)));
  });
}

// ---------------------------------------------------------------- navegación

function mostrarVista(nombre) {
  estado.vista = nombre;
  $$("#navegacion button").forEach(b => b.classList.toggle("activo", b.dataset.vista === nombre));
  $$(".vista").forEach(v => v.classList.toggle("oculta", v.id !== "vista-" + nombre));
  const cargadores = {
    panel: cargarPanel, documentos: cargarDocumentos, clientes: cargarClientes,
    servicios: cargarServicios, planes: cargarPlanes, configuracion: cargarConfiguracion,
  };
  cargadores[nombre]().catch(e => aviso(e.message, "error"));
}

$$("#navegacion button").forEach(b => b.addEventListener("click", () => mostrarVista(b.dataset.vista)));

async function cargarEstado() {
  const datos = await api("/estado");
  estado.config = datos.configuracion;
  estado.tipos = datos.tipos_documento;
  estado.periodicidades = datos.periodicidades;
  estado.hoy = datos.hoy;
  estado.rutaDatos = datos.ruta_datos;
  estado.version = datos.version;
  $("#emisor-nombre").textContent = estado.config.emisor_razon_social || "Emisor sin configurar";
  return datos;
}

async function cargarCatalogos() {
  [estado.clientes, estado.servicios] = await Promise.all([api("/clientes"), api("/servicios")]);
}

// --------------------------------------------------------------------- panel

async function cargarPanel() {
  const datos = await cargarEstado();
  const r = datos.resumen;
  const [vencidas, borradores] = await Promise.all([
    api("/documentos?estado=VENCIDA"), api("/documentos?estado=BORRADOR")]);
  const sinEmisor = !estado.config.emisor_razon_social || !estado.config.emisor_rut;
  const v = $("#vista-panel");
  v.innerHTML = `
    <h1>Panel · ${esc(r.periodo_nombre)}</h1>
    ${sinEmisor ? `<div class="banner info"><span>Antes de emitir documentos, completa los datos del emisor.</span>
      <div class="acciones"><button class="primario" data-ir="configuracion">Ir a Configuración</button></div></div>` : ""}
    ${r.planes_pendientes ? `<div class="banner alerta">
      <span><strong>${r.planes_pendientes}</strong> cobro(s) automático(s) por generar en ${esc(r.periodo_nombre)}
      (${clp(r.monto_planes_pendientes)}).</span>
      <div class="acciones">
        <button data-ir="planes">Revisar</button>
        <button class="primario" id="panel-generar">Generar borradores ahora</button>
      </div></div>` : ""}
    <div class="cifras">
      <div class="cifra"><div class="etiqueta">Emitido en el mes</div><div class="valor">${clp(r.emitido_mes)}</div>
        <div class="detalle">${r.docs_mes} documento(s)</div></div>
      <div class="cifra exito"><div class="etiqueta">Cobrado en el mes</div><div class="valor">${clp(r.cobrado_mes)}</div></div>
      <div class="cifra"><div class="etiqueta">Por cobrar</div><div class="valor">${clp(r.por_cobrar)}</div>
        <div class="detalle">${r.docs_por_cobrar} documento(s) emitido(s)</div></div>
      <div class="cifra ${r.vencido ? "peligro" : ""}"><div class="etiqueta">Vencido</div><div class="valor">${clp(r.vencido)}</div>
        <div class="detalle">${r.docs_vencidos} documento(s)</div></div>
      <div class="cifra"><div class="etiqueta">Clientes activos</div><div class="valor">${r.clientes_activos}</div>
        <div class="detalle">${r.planes_activos} cobro(s) automático(s)</div></div>
    </div>
    <div class="acciones-vista">
      <button class="primario" id="panel-nuevo">+ Nuevo documento</button>
      <button data-ir="documentos">Ver todos los documentos</button>
    </div>
    <div class="dos-columnas">
      <div class="tarjeta">
        <h2>Documentos vencidos</h2>
        ${tablaResumen(vencidas, "Sin documentos vencidos. 🎉")}
      </div>
      <div class="tarjeta">
        <h2>Borradores por emitir</h2>
        ${tablaResumen(borradores, "No hay borradores pendientes.")}
      </div>
    </div>`;
  $$("[data-ir]", v).forEach(b => b.addEventListener("click", () => mostrarVista(b.dataset.ir)));
  $("#panel-nuevo", v).addEventListener("click", () => editorDocumento());
  const gen = $("#panel-generar", v);
  if (gen) gen.addEventListener("click", () => generarPeriodo(r.periodo, false));
  $$("[data-abrir-doc]", v).forEach(b => b.addEventListener("click", () => detalleDocumento(Number(b.dataset.abrirDoc))));
}

function tablaResumen(docs, vacio) {
  if (!docs.length) return `<div class="vacio">${esc(vacio)}</div>`;
  return `<table><thead><tr><th>Doc.</th><th>Cliente</th><th>Vence</th><th class="num">Saldo</th><th></th></tr></thead>
    <tbody>${docs.slice(0, 8).map(d => `<tr>
      <td>${esc(abreviaturaTipo(d.tipo))} ${d.folio ? "N° " + d.folio : "<small>borrador</small>"}</td>
      <td>${esc(d.cliente)}</td><td>${fecha(d.fecha_vencimiento)}</td>
      <td class="num">${clp(d.estado === "BORRADOR" ? d.total : d.saldo)}</td>
      <td class="acciones"><button class="pequeno" data-abrir-doc="${d.id}">Abrir</button></td></tr>`).join("")}
    </tbody></table>${docs.length > 8 ? `<p class="suave">y ${docs.length - 8} más…</p>` : ""}`;
}

function abreviaturaTipo(tipo) {
  return { FACTURA: "Factura", FACTURA_EXENTA: "F. exenta", BOLETA_HONORARIOS: "Boleta hon.", NOTA_COBRO: "Nota cobro" }[tipo] || tipo;
}

// ---------------------------------------------------------------- documentos

async function cargarDocumentos() {
  await cargarEstado();
  const f = estado.filtrosDocs;
  const consulta = new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v)));
  const docs = await api("/documentos?" + consulta.toString());
  const v = $("#vista-documentos");
  v.innerHTML = `
    <h1>Documentos</h1>
    <div class="acciones-vista">
      <button class="primario" id="docs-nuevo">+ Nuevo documento</button>
      <div class="derecha">
        <a class="boton" href="/api/exportar/documentos.csv?${esc(consulta.toString())}" download>⬇ Exportar CSV (filtro actual)</a>
      </div>
    </div>
    <form class="filtros" id="docs-filtros">
      <label>Buscar<input name="buscar" placeholder="Cliente, RUT o folio" value="${esc(f.buscar)}"></label>
      <label>Estado<select name="estado">
        <option value="">Todos</option>
        ${["BORRADOR", "EMITIDA", "VENCIDA", "PAGADA", "ANULADA"].map(e => `<option ${f.estado === e ? "selected" : ""}>${e}</option>`).join("")}
      </select></label>
      <label>Tipo<select name="tipo"><option value="">Todos</option>
        ${Object.entries(estado.tipos).map(([k, n]) => `<option value="${k}" ${f.tipo === k ? "selected" : ""}>${esc(n)}</option>`).join("")}
      </select></label>
      <label>Desde<input type="date" name="desde" value="${esc(f.desde)}"></label>
      <label>Hasta<input type="date" name="hasta" value="${esc(f.hasta)}"></label>
      <button type="submit">Filtrar</button>
      <button type="button" id="docs-limpiar">Limpiar</button>
    </form>
    ${docs.length ? `<table><thead><tr><th>Tipo</th><th>Folio</th><th>Fecha</th><th>Cliente</th><th>Vence</th>
      <th>Estado</th><th class="num">Total</th><th class="num">Saldo</th><th></th></tr></thead><tbody>
      ${docs.map(d => `<tr>
        <td>${esc(abreviaturaTipo(d.tipo))}</td>
        <td>${d.folio ?? "—"}${d.folio_sii ? `<br><small>SII ${esc(d.folio_sii)}</small>` : ""}</td>
        <td>${fecha(d.fecha_emision)}</td>
        <td>${esc(d.cliente)}<br><small>${esc(formatearRut(d.cliente_rut))}</small></td>
        <td>${fecha(d.fecha_vencimiento)}</td>
        <td><span class="chip ${d.vencida ? "VENCIDA" : d.estado}">${d.vencida ? "VENCIDA" : d.estado}</span></td>
        <td class="num">${clp(d.total)}</td>
        <td class="num">${clp(d.saldo)}</td>
        <td class="acciones"><button class="pequeno" data-abrir-doc="${d.id}">Abrir</button>
          <a class="boton pequeno" href="/documento/${d.id}/imprimir" target="_blank">🖨</a></td>
      </tr>`).join("")}</tbody></table>
      <p class="suave">${docs.length} documento(s) · Total ${clp(docs.reduce((s, d) => s + (d.estado === "ANULADA" ? 0 : d.total), 0))}
      · Saldo ${clp(docs.reduce((s, d) => s + d.saldo, 0))}</p>`
      : `<div class="tarjeta vacio">No hay documentos con ese filtro.</div>`}`;
  $("#docs-nuevo", v).addEventListener("click", () => editorDocumento());
  $("#docs-filtros", v).addEventListener("submit", e => {
    e.preventDefault();
    estado.filtrosDocs = datosFormulario(e.target);
    cargarDocumentos();
  });
  $("#docs-limpiar", v).addEventListener("click", () => {
    estado.filtrosDocs = { estado: "", tipo: "", buscar: "", desde: "", hasta: "" };
    cargarDocumentos();
  });
  $$("[data-abrir-doc]", v).forEach(b => b.addEventListener("click", () => detalleDocumento(Number(b.dataset.abrirDoc))));
}

function lineaHtml(l = {}) {
  return `<tr>
    <td><input name="descripcion" value="${esc(l.descripcion || "")}" placeholder="Descripción del servicio" list="lista-servicios"></td>
    <td class="col-cant"><input name="cantidad" type="number" min="0.01" step="0.01" value="${esc(l.cantidad ?? 1)}"></td>
    <td class="col-precio"><input name="precio_unitario" type="number" min="0" step="1" value="${esc(l.precio_unitario ?? 0)}"></td>
    <td class="col-ex"><input name="exento" type="checkbox" ${l.exento ? "checked" : ""} title="Exento de IVA"></td>
    <td class="col-sub num"><span class="subtotal">${clp((l.cantidad ?? 1) * (l.precio_unitario ?? 0))}</span></td>
    <td class="col-x"><button type="button" class="pequeno peligro" data-quitar>✕</button></td>
  </tr>`;
}

function leerLineas(modal) {
  return $$("table.lineas tbody tr", modal).map(tr => ({
    descripcion: $("[name=descripcion]", tr).value,
    cantidad: Number($("[name=cantidad]", tr).value) || 0,
    precio_unitario: Number($("[name=precio_unitario]", tr).value) || 0,
    exento: $("[name=exento]", tr).checked ? 1 : 0,
  }));
}

function calcularTotales(lineas, tipo) {
  const iva = Number(estado.config.tasa_iva) || 0, ret = Number(estado.config.tasa_retencion) || 0;
  let neto = 0, exento = 0;
  lineas.forEach(l => {
    const sub = Math.round(l.cantidad * l.precio_unitario);
    if (tipo !== "FACTURA" || l.exento) exento += sub; else neto += sub;
  });
  const montoIva = tipo === "FACTURA" ? Math.round(neto * iva / 100) : 0;
  const retencion = tipo === "BOLETA_HONORARIOS" ? Math.round(exento * ret / 100) : 0;
  return { neto, exento, iva: montoIva, retencion, total: neto + exento + montoIva - retencion };
}

function htmlTotales(t, tipo) {
  const filas = [];
  if (tipo === "FACTURA") {
    filas.push(["Neto", t.neto]);
    if (t.exento) filas.push(["Exento", t.exento]);
    filas.push([`IVA ${estado.config.tasa_iva} %`, t.iva]);
  } else if (tipo === "BOLETA_HONORARIOS") {
    filas.push(["Honorarios brutos", t.exento]);
    filas.push([`Retención ${estado.config.tasa_retencion} %`, -t.retencion]);
  } else {
    filas.push(["Monto exento", t.exento]);
  }
  return filas.map(([e, m]) => `<div><span>${esc(e)}</span><span>${clp(m)}</span></div>`).join("")
    + `<div class="total"><span>${tipo === "BOLETA_HONORARIOS" ? "Líquido" : "Total"}</span><span>${clp(t.total)}</span></div>`;
}

async function editorDocumento(doc = null) {
  await cargarEstado();
  await cargarCatalogos();
  const clientes = estado.clientes.filter(c => c.activo || (doc && c.id === doc.cliente_id));
  if (!clientes.length) {
    aviso("Primero registra al menos un cliente.", "error");
    return mostrarVista("clientes");
  }
  const tipo = doc ? doc.tipo : estado.config.tipo_documento_defecto;
  const lineas = doc ? doc.lineas : [{}];
  const modal = abrirModal(`
    <h2>${doc ? "Editar borrador" : "Nuevo documento"}</h2>
    <form id="form-doc" class="formulario">
      <label>Tipo de documento<select name="tipo">${Object.entries(estado.tipos).map(([k, n]) =>
        `<option value="${k}" ${k === tipo ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
      <label>Cliente<select name="cliente_id">${opcionesSelect(clientes, doc ? doc.cliente_id : "",
        c => [c.id, `${c.razon_social} (${formatearRut(c.rut)})`])}</select></label>
      <label>Fecha de emisión<input type="date" name="fecha_emision" value="${esc(doc ? doc.fecha_emision : estado.hoy)}"></label>
      <label>Vencimiento <small>(vacío = ${esc(estado.config.dias_plazo_pago)} días)</small>
        <input type="date" name="fecha_vencimiento" value="${esc(doc ? doc.fecha_vencimiento : "")}"></label>
      <div class="ancho">
        <table class="lineas"><thead><tr><th>Descripción</th><th>Cant.</th><th>Precio unit.</th><th title="Exento de IVA">Ex.</th><th class="num">Subtotal</th><th></th></tr></thead>
        <tbody>${lineas.map(lineaHtml).join("")}</tbody></table>
        <datalist id="lista-servicios">${estado.servicios.filter(s => s.activo).map(s => `<option value="${esc(s.descripcion)}">`).join("")}</datalist>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          <button type="button" id="agregar-linea">+ Línea</button>
          <select id="agregar-servicio"><option value="">Agregar desde catálogo…</option>
            ${estado.servicios.filter(s => s.activo).map(s => `<option value="${s.id}">${esc(s.descripcion)} · ${clp(s.precio_unitario)}</option>`).join("")}</select>
        </div>
        <div class="totales" id="doc-totales"></div>
      </div>
      <label class="ancho">Observaciones<textarea name="observaciones">${esc(doc ? doc.observaciones : "")}</textarea></label>
      <label>Folio SII <small>(cuando lo emitas en sii.cl)</small><input name="folio_sii" value="${esc(doc ? doc.folio_sii : "")}"></label>
    </form>
    <p class="nota">Este programa numera y controla tus documentos. El documento tributario oficial
      (factura o boleta electrónica) se emite en sii.cl; anota aquí su folio para dejarlo vinculado.</p>
    <div class="pie-modal">
      <button data-cerrar>Cancelar</button>
      <button id="doc-guardar">Guardar borrador</button>
      <button id="doc-emitir" class="primario">Guardar y emitir</button>
    </div>`, { ancho: true });
  const form = $("#form-doc", modal);
  const tbody = $("table.lineas tbody", modal);

  function refrescarTotales() {
    const t = calcularTotales(leerLineas(modal), form.tipo.value);
    $$("tbody tr", tbody).forEach(tr => {
      const c = Number($("[name=cantidad]", tr).value) || 0, p = Number($("[name=precio_unitario]", tr).value) || 0;
      $(".subtotal", tr).textContent = clp(Math.round(c * p));
    });
    $("#doc-totales", modal).innerHTML = htmlTotales(t, form.tipo.value);
  }
  form.addEventListener("input", refrescarTotales);
  form.addEventListener("change", refrescarTotales);
  tbody.addEventListener("click", e => {
    if (e.target.matches("[data-quitar]")) {
      if ($$("tr", tbody).length > 1) e.target.closest("tr").remove(); else aviso("Debe quedar al menos una línea.");
      refrescarTotales();
    }
  });
  $("#agregar-linea", modal).addEventListener("click", () => {
    tbody.insertAdjacentHTML("beforeend", lineaHtml());
    $("tr:last-child [name=descripcion]", tbody).focus();
  });
  $("#agregar-servicio", modal).addEventListener("change", e => {
    const s = estado.servicios.find(x => String(x.id) === e.target.value);
    if (!s) return;
    const ultima = $("tr:last-child", tbody);
    const vacia = ultima && !$("[name=descripcion]", ultima).value && Number($("[name=precio_unitario]", ultima).value) === 0;
    if (vacia) ultima.remove();
    tbody.insertAdjacentHTML("beforeend", lineaHtml({ descripcion: s.descripcion, cantidad: 1, precio_unitario: s.precio_unitario, exento: s.exento }));
    e.target.value = "";
    refrescarTotales();
  });
  refrescarTotales();

  async function guardar(emitir) {
    const datos = datosFormulario(form);
    delete datos.descripcion; delete datos.cantidad; delete datos.precio_unitario; delete datos.exento;
    datos.lineas = leerLineas(modal);
    datos.emitir = emitir;
    try {
      let guardado;
      if (doc) {
        guardado = await api(`/documentos/${doc.id}`, { metodo: "PUT", cuerpo: datos });
        if (emitir) guardado = await api(`/documentos/${doc.id}/emitir`, { metodo: "POST" });
      } else {
        guardado = await api("/documentos", { metodo: "POST", cuerpo: datos });
      }
      cerrarModal();
      aviso(emitir ? `Documento emitido con folio N° ${guardado.folio}.` : "Borrador guardado.", "exito");
      mostrarVista(estado.vista === "panel" ? "panel" : "documentos");
      detalleDocumento(guardado.id);
    } catch (e) { aviso(e.message, "error"); }
  }
  $("#doc-guardar", modal).addEventListener("click", () => guardar(false));
  $("#doc-emitir", modal).addEventListener("click", () => guardar(true));
}

async function detalleDocumento(id) {
  let d;
  try { d = await api(`/documentos/${id}`); } catch (e) { return aviso(e.message, "error"); }
  const vencida = d.estado === "EMITIDA" && d.fecha_vencimiento < estado.hoy;
  const modal = abrirModal(`
    <h2>${esc(d.tipo_nombre)} ${d.folio ? "N° " + d.folio : "(borrador)"}
      <span class="chip ${vencida ? "VENCIDA" : d.estado}">${vencida ? "VENCIDA" : d.estado}</span></h2>
    <div class="dos-columnas">
      <div>
        <p><strong>${esc(d.cliente)}</strong><br><small>${esc(formatearRut(d.cliente_rut))}${d.cliente_email ? " · " + esc(d.cliente_email) : ""}</small></p>
        <p>Emisión: ${fecha(d.fecha_emision)} · Vence: ${fecha(d.fecha_vencimiento)}</p>
        ${d.folio_sii ? `<p>Folio SII: <strong>${esc(d.folio_sii)}</strong></p>` : ""}
        ${d.periodo ? `<p><small>Generado automáticamente · período ${esc(d.periodo)}</small></p>` : ""}
        ${d.observaciones ? `<p class="nota">${esc(d.observaciones)}</p>` : ""}
        ${d.estado === "ANULADA" ? `<p class="nota">Anulado el ${esc(d.anulado_en)}: ${esc(d.motivo_anulacion || "sin motivo")}</p>` : ""}
      </div>
      <div class="totales">${htmlTotales({ neto: d.neto, exento: d.exento, iva: d.iva, retencion: d.retencion, total: d.total }, d.tipo)}
        ${d.pagado ? `<div><span>Pagado</span><span>${clp(d.pagado)}</span></div><div><span>Saldo</span><span><strong>${clp(d.saldo)}</strong></span></div>` : ""}
      </div>
    </div>
    <table><thead><tr><th>Descripción</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Subtotal</th></tr></thead>
      <tbody>${d.lineas.map(l => `<tr><td>${esc(l.descripcion)}${l.exento && d.tipo === "FACTURA" ? " <small>(exento)</small>" : ""}</td>
        <td class="num">${l.cantidad}</td><td class="num">${clp(l.precio_unitario)}</td><td class="num">${clp(l.subtotal)}</td></tr>`).join("")}</tbody></table>
    ${d.pagos.length ? `<h2>Pagos</h2><table><thead><tr><th>Fecha</th><th>Medio</th><th>Referencia</th><th class="num">Monto</th><th></th></tr></thead>
      <tbody>${d.pagos.map(p => `<tr><td>${fecha(p.fecha)}</td><td>${esc(p.medio)}</td><td>${esc(p.referencia)}</td>
        <td class="num">${clp(p.monto)}</td><td class="acciones"><button class="pequeno peligro" data-quitar-pago="${p.id}">Quitar</button></td></tr>`).join("")}</tbody></table>` : ""}
    <div class="pie-modal">
      <div class="izquierda">
        <a class="boton" href="/documento/${d.id}/imprimir" target="_blank">🖨 Imprimir / PDF</a>
        ${["EMITIDA", "PAGADA"].includes(d.estado) ? `<button id="det-recordatorio">✉ Recordatorio de cobro</button>` : ""}
      </div>
      <button data-cerrar>Cerrar</button>
      ${d.estado === "BORRADOR" ? `<button id="det-eliminar" class="peligro">Eliminar</button>
        <button id="det-editar">Editar</button><button id="det-emitir" class="primario">Emitir</button>` : ""}
      ${d.estado === "EMITIDA" ? `<button id="det-anular" class="peligro">Anular</button>
        <button id="det-folio">Folio SII</button><button id="det-pagar" class="primario">Registrar pago</button>` : ""}
      ${d.estado === "PAGADA" ? `<button id="det-anular" class="peligro">Anular</button>` : ""}
    </div>`, { ancho: true });

  const refrescar = () => { mostrarVista(estado.vista); detalleDocumento(id); };
  const on = (sel, fn) => { const el = $(sel, modal); if (el) el.addEventListener("click", fn); };
  on("#det-editar", () => editorDocumento(d));
  on("#det-emitir", async () => {
    try { const g = await api(`/documentos/${id}/emitir`, { metodo: "POST" }); aviso(`Emitido con folio N° ${g.folio}.`, "exito"); refrescar(); }
    catch (e) { aviso(e.message, "error"); }
  });
  on("#det-eliminar", async () => {
    if (!await confirmar("¿Eliminar este borrador? No se puede deshacer.", { textoBoton: "Eliminar" })) return;
    try { await api(`/documentos/${id}`, { metodo: "DELETE" }); aviso("Borrador eliminado."); mostrarVista(estado.vista); }
    catch (e) { aviso(e.message, "error"); }
  });
  on("#det-anular", async () => {
    const motivo = await confirmar("¿Anular este documento? Quedará registrado como anulado.", { textoBoton: "Anular", campo: "Motivo" });
    if (motivo === null) return;
    try { await api(`/documentos/${id}/anular`, { metodo: "POST", cuerpo: { motivo } }); aviso("Documento anulado."); refrescar(); }
    catch (e) { aviso(e.message, "error"); }
  });
  on("#det-folio", async () => {
    const folio = await confirmar("Folio asignado por el SII al documento oficial:", { textoBoton: "Guardar", peligro: false, campo: "Folio SII" });
    if (folio === null) return;
    try { await api(`/documentos/${id}`, { metodo: "PUT", cuerpo: { folio_sii: folio } }); refrescar(); }
    catch (e) { aviso(e.message, "error"); }
  });
  on("#det-pagar", () => formularioPago(d));
  on("#det-recordatorio", () => recordatorio(d));
  $$("[data-quitar-pago]", modal).forEach(b => b.addEventListener("click", async () => {
    try { await api(`/pagos/${b.dataset.quitarPago}`, { metodo: "DELETE" }); refrescar(); }
    catch (e) { aviso(e.message, "error"); }
  }));
}

function formularioPago(d) {
  const modal = abrirModal(`
    <h2>Registrar pago · ${esc(abreviaturaTipo(d.tipo))} N° ${d.folio}</h2>
    <p>Saldo pendiente: <strong>${clp(d.saldo)}</strong></p>
    <form id="form-pago" class="formulario">
      <label>Monto<input type="number" name="monto" min="1" step="1" value="${d.saldo}" required></label>
      <label>Fecha<input type="date" name="fecha" value="${esc(estado.hoy)}" required></label>
      <label>Medio<select name="medio">${["TRANSFERENCIA", "EFECTIVO", "CHEQUE", "TARJETA", "OTRO"].map(m => `<option>${m}</option>`).join("")}</select></label>
      <label>Referencia<input name="referencia" placeholder="N° de operación, banco…"></label>
    </form>
    <div class="pie-modal"><button data-cerrar>Cancelar</button><button id="pago-ok" class="primario">Registrar</button></div>`);
  $("#pago-ok", modal).addEventListener("click", async () => {
    try {
      await api(`/documentos/${d.id}/pagos`, { metodo: "POST", cuerpo: datosFormulario($("#form-pago", modal)) });
      aviso("Pago registrado.", "exito");
      mostrarVista(estado.vista); detalleDocumento(d.id);
    } catch (e) { aviso(e.message, "error"); }
  });
}

async function recordatorio(d) {
  let r;
  try { r = await api(`/documentos/${d.id}/recordatorio`); } catch (e) { return aviso(e.message, "error"); }
  const asunto = `Recordatorio de pago · ${d.tipo_nombre} N° ${d.folio_sii || d.folio}`;
  const mailto = `mailto:${encodeURIComponent(r.email)}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(r.texto)}`;
  const modal = abrirModal(`
    <h2>Recordatorio de cobro</h2>
    <pre class="texto" id="texto-recordatorio">${esc(r.texto)}</pre>
    <div class="pie-modal">
      <button data-cerrar>Cerrar</button>
      <button id="rec-copiar">Copiar texto</button>
      <a class="boton primario" href="${mailto}">Abrir en mi correo</a>
    </div>`);
  $("#rec-copiar", modal).addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(r.texto); aviso("Texto copiado.", "exito"); }
    catch (e) { aviso("No se pudo copiar automáticamente; selecciona el texto y cópialo.", "error"); }
  });
}

// ------------------------------------------------------------------ clientes

async function cargarClientes(buscar = "") {
  const clientes = await api("/clientes?buscar=" + encodeURIComponent(buscar));
  estado.clientes = clientes;
  const v = $("#vista-clientes");
  v.innerHTML = `
    <h1>Clientes</h1>
    <div class="acciones-vista">
      <button class="primario" id="cli-nuevo">+ Nuevo cliente</button>
      <input id="cli-buscar" placeholder="Buscar por nombre, RUT o contacto" value="${esc(buscar)}" style="min-width:260px">
      <div class="derecha">
        <button id="cli-importar">⬆ Importar CSV</button>
        <a class="boton" href="/api/exportar/clientes.csv" download>⬇ Exportar CSV</a>
      </div>
    </div>
    ${clientes.length ? `<table><thead><tr><th>RUT</th><th>Razón social</th><th>Giro</th><th>Contacto</th><th>Correo</th><th></th></tr></thead>
      <tbody>${clientes.map(c => `<tr class="${c.activo ? "" : "inactivo"}">
        <td>${esc(formatearRut(c.rut))}</td><td>${esc(c.razon_social)}${c.activo ? "" : " <small>(inactivo)</small>"}</td>
        <td>${esc(c.giro)}</td><td>${esc(c.contacto)}<br><small>${esc(c.telefono)}</small></td><td>${esc(c.email)}</td>
        <td class="acciones"><button class="pequeno" data-doc-cliente="${c.id}">+ Documento</button>
          <button class="pequeno" data-editar="${c.id}">Editar</button></td></tr>`).join("")}</tbody></table>`
      : `<div class="tarjeta vacio">Aún no hay clientes. Crea el primero o importa un CSV con columnas RUT y Razón social.</div>`}`;
  $("#cli-nuevo", v).addEventListener("click", () => editorCliente());
  let temporizador;
  $("#cli-buscar", v).addEventListener("input", e => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => cargarClientes(e.target.value).then(() => $("#cli-buscar").focus()), 250);
  });
  $("#cli-importar", v).addEventListener("click", importarClientes);
  $$("[data-editar]", v).forEach(b => b.addEventListener("click", () => editorCliente(clientes.find(c => c.id === Number(b.dataset.editar)))));
  $$("[data-doc-cliente]", v).forEach(b => b.addEventListener("click", () =>
    editorDocumento({ cliente_id: Number(b.dataset.docCliente), tipo: estado.config.tipo_documento_defecto,
      lineas: [{}], fecha_emision: estado.hoy, fecha_vencimiento: "", observaciones: "", folio_sii: "", id: null })));
}

function editorCliente(c = null) {
  const campo = (n, et, extra = "") => `<label>${et}<input name="${n}" value="${esc(c ? c[n] : "")}" ${extra}></label>`;
  const modal = abrirModal(`
    <h2>${c ? "Editar cliente" : "Nuevo cliente"}</h2>
    <form id="form-cliente" class="formulario">
      ${campo("rut", "RUT", 'required placeholder="76.086.428-5"')}
      ${campo("razon_social", "Razón social / Nombre", "required")}
      ${campo("giro", "Giro")}
      ${campo("email", "Correo electrónico", 'type="email"')}
      ${campo("direccion", "Dirección")}
      ${campo("comuna", "Comuna")}
      ${campo("ciudad", "Ciudad")}
      ${campo("telefono", "Teléfono")}
      ${campo("contacto", "Persona de contacto")}
      <label class="ancho">Notas<textarea name="notas">${esc(c ? c.notas : "")}</textarea></label>
      ${c ? `<label class="fila"><input type="checkbox" name="activo" ${c.activo ? "checked" : ""}> Cliente activo</label>` : ""}
      <div class="error-campo ancho" id="cli-error"></div>
    </form>
    <div class="pie-modal">
      ${c ? `<button class="peligro izquierda" id="cli-eliminar">Eliminar</button>` : ""}
      <button data-cerrar>Cancelar</button><button id="cli-guardar" class="primario">Guardar</button>
    </div>`);
  const form = $("#form-cliente", modal);
  form.rut.addEventListener("blur", () => {
    form.rut.value = formatearRut(form.rut.value);
    $("#cli-error", modal).textContent = form.rut.value && !rutValido(form.rut.value) ? "El RUT no es válido (dígito verificador incorrecto)." : "";
  });
  $("#cli-guardar", modal).addEventListener("click", async () => {
    const datos = datosFormulario(form);
    if (!c) datos.activo = 1;
    try {
      if (c) await api(`/clientes/${c.id}`, { metodo: "PUT", cuerpo: datos });
      else await api("/clientes", { metodo: "POST", cuerpo: datos });
      cerrarModal(); aviso("Cliente guardado.", "exito"); cargarClientes();
    } catch (e) { $("#cli-error", modal).textContent = e.message; }
  });
  const eliminar = $("#cli-eliminar", modal);
  if (eliminar) eliminar.addEventListener("click", async () => {
    if (!await confirmar(`¿Eliminar al cliente ${c.razon_social}? Solo es posible si no tiene documentos.`, { textoBoton: "Eliminar" })) return;
    try { await api(`/clientes/${c.id}`, { metodo: "DELETE" }); aviso("Cliente eliminado."); cargarClientes(); }
    catch (e) { aviso(e.message, "error"); }
  });
}

function importarClientes() {
  const modal = abrirModal(`
    <h2>Importar clientes desde CSV</h2>
    <p class="suave">Columnas reconocidas: RUT, Razón social (o Nombre), Giro, Dirección, Comuna, Ciudad, Email, Teléfono, Contacto, Notas.
      Separador ; o , (como lo exporta Excel). Los RUT duplicados o inválidos se informan y se omiten.</p>
    <input type="file" id="archivo-csv" accept=".csv,text/csv">
    <div id="resultado-importacion"></div>
    <div class="pie-modal"><button data-cerrar>Cerrar</button><button id="imp-ok" class="primario" disabled>Importar</button></div>`);
  let texto = "";
  $("#archivo-csv", modal).addEventListener("change", async e => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    const bytes = await archivo.arrayBuffer();
    try { texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch (err) { texto = new TextDecoder("windows-1252").decode(bytes); }
    $("#imp-ok", modal).disabled = false;
  });
  $("#imp-ok", modal).addEventListener("click", async () => {
    try {
      const r = await api("/clientes/importar", { metodo: "POST", cuerpo: { csv: texto } });
      $("#resultado-importacion", modal).innerHTML = `<p><strong>${r.creados}</strong> cliente(s) importado(s).</p>
        ${r.errores.length ? `<p class="error-campo">Omitidos:</p><ul>${r.errores.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}`;
      $("#imp-ok", modal).disabled = true;
      cargarClientes();
    } catch (e) { aviso(e.message, "error"); }
  });
}

// ----------------------------------------------------------------- servicios

async function cargarServicios() {
  const servicios = await api("/servicios");
  estado.servicios = servicios;
  const v = $("#vista-servicios");
  v.innerHTML = `
    <h1>Catálogo de servicios</h1>
    <p class="suave">Servicios frecuentes con su precio neto, para agregarlos a un documento con un clic.</p>
    <div class="acciones-vista"><button class="primario" id="srv-nuevo">+ Nuevo servicio</button></div>
    ${servicios.length ? `<table><thead><tr><th>Descripción</th><th class="num">Precio neto</th><th>IVA</th><th></th></tr></thead>
      <tbody>${servicios.map(s => `<tr class="${s.activo ? "" : "inactivo"}"><td>${esc(s.descripcion)}${s.activo ? "" : " <small>(inactivo)</small>"}</td>
        <td class="num">${clp(s.precio_unitario)}</td><td>${s.exento ? "Exento" : "Afecto"}</td>
        <td class="acciones"><button class="pequeno" data-editar="${s.id}">Editar</button>
          <button class="pequeno peligro" data-eliminar="${s.id}">Eliminar</button></td></tr>`).join("")}</tbody></table>`
      : `<div class="tarjeta vacio">Sin servicios en el catálogo.</div>`}`;
  $("#srv-nuevo", v).addEventListener("click", () => editorServicio());
  $$("[data-editar]", v).forEach(b => b.addEventListener("click", () => editorServicio(servicios.find(s => s.id === Number(b.dataset.editar)))));
  $$("[data-eliminar]", v).forEach(b => b.addEventListener("click", async () => {
    if (!await confirmar("¿Eliminar este servicio del catálogo?", { textoBoton: "Eliminar" })) return;
    try { await api(`/servicios/${b.dataset.eliminar}`, { metodo: "DELETE" }); cargarServicios(); }
    catch (e) { aviso(e.message, "error"); }
  }));
}

function editorServicio(s = null) {
  const modal = abrirModal(`
    <h2>${s ? "Editar servicio" : "Nuevo servicio"}</h2>
    <form id="form-srv" class="formulario">
      <label class="ancho">Descripción<input name="descripcion" value="${esc(s ? s.descripcion : "")}" required></label>
      <label>Precio neto (CLP)<input type="number" name="precio_unitario" min="0" step="1" value="${s ? s.precio_unitario : ""}" required></label>
      <label class="fila"><input type="checkbox" name="exento" ${s && s.exento ? "checked" : ""}> Exento de IVA</label>
      ${s ? `<label class="fila"><input type="checkbox" name="activo" ${s.activo ? "checked" : ""}> Activo</label>` : ""}
    </form>
    <div class="pie-modal"><button data-cerrar>Cancelar</button><button id="srv-guardar" class="primario">Guardar</button></div>`);
  $("#srv-guardar", modal).addEventListener("click", async () => {
    const datos = datosFormulario($("#form-srv", modal));
    if (!s) datos.activo = 1;
    try {
      if (s) await api(`/servicios/${s.id}`, { metodo: "PUT", cuerpo: datos });
      else await api("/servicios", { metodo: "POST", cuerpo: datos });
      cerrarModal(); cargarServicios();
    } catch (e) { aviso(e.message, "error"); }
  });
}

// -------------------------------------------------------- planes (automáticos)

async function cargarPlanes() {
  await cargarEstado();
  if (!estado.periodoPlanes) estado.periodoPlanes = periodoActual();
  const periodo = estado.periodoPlanes;
  const [planes, pendientes] = await Promise.all([api("/planes"), api("/automatizacion/pendientes?periodo=" + periodo)]);
  const v = $("#vista-planes");
  const etiquetaPeriodicidad = { MENSUAL: "Mensual", BIMESTRAL: "Cada 2 meses", TRIMESTRAL: "Trimestral", SEMESTRAL: "Semestral", ANUAL: "Anual" };
  v.innerHTML = `
    <h1>Cobros automáticos</h1>
    <p class="suave">Define qué se le cobra a cada cliente y cada cuánto. El programa genera los documentos del
      período con un clic, sin duplicarlos, y te avisa en el Panel cuando hay cobros por generar.</p>
    <div class="tarjeta">
      <div class="acciones-vista">
        <label>Período <input type="month" id="plan-periodo" value="${esc(periodo)}"></label>
        <strong>${pendientes.planes.length} por generar en ${esc(pendientes.periodo_nombre)}</strong>
        <div class="derecha">
          <button id="plan-generar-borr" ${pendientes.planes.length ? "" : "disabled"}>Generar como borradores</button>
          <button id="plan-generar-emit" class="primario" ${pendientes.planes.length ? "" : "disabled"}>Generar y emitir</button>
        </div>
      </div>
      ${pendientes.planes.length ? `<table><thead><tr><th>Cliente</th><th>Concepto</th><th>Documento</th><th>Fecha emisión</th><th class="num">Monto</th></tr></thead>
        <tbody>${pendientes.planes.map(p => `<tr><td>${esc(p.cliente)}</td><td>${esc(p.descripcion)}</td><td>${esc(abreviaturaTipo(p.tipo_documento))}</td>
          <td>${fecha(p.fecha_emision)}</td><td class="num">${clp(p.monto)}</td></tr>`).join("")}</tbody></table>`
        : `<div class="vacio">Todos los cobros de ${esc(pendientes.periodo_nombre)} ya están generados.</div>`}
    </div>
    <div class="acciones-vista"><button class="primario" id="plan-nuevo">+ Nuevo cobro automático</button></div>
    ${planes.length ? `<table><thead><tr><th>Cliente</th><th>Concepto</th><th>Documento</th><th>Frecuencia</th><th>Día</th><th>Vigencia</th><th class="num">Monto</th><th></th></tr></thead>
      <tbody>${planes.map(p => `<tr class="${p.activo ? "" : "inactivo"}"><td>${esc(p.cliente)}</td><td>${esc(p.descripcion)}${p.activo ? "" : " <small>(inactivo)</small>"}</td>
        <td>${esc(abreviaturaTipo(p.tipo_documento))}</td><td>${etiquetaPeriodicidad[p.periodicidad] || p.periodicidad}</td><td>${p.dia_emision}</td>
        <td>${esc(p.mes_inicio)}${p.mes_fin ? " → " + esc(p.mes_fin) : " →"}</td><td class="num">${clp(p.monto)}</td>
        <td class="acciones"><button class="pequeno" data-editar="${p.id}">Editar</button></td></tr>`).join("")}</tbody></table>`
      : `<div class="tarjeta vacio">Sin cobros automáticos. Crea uno para que el programa prepare los documentos de cada mes.</div>`}`;
  $("#plan-periodo", v).addEventListener("change", e => { estado.periodoPlanes = e.target.value || periodoActual(); cargarPlanes(); });
  $("#plan-generar-borr", v).addEventListener("click", () => generarPeriodo(periodo, false));
  $("#plan-generar-emit", v).addEventListener("click", () => generarPeriodo(periodo, true));
  $("#plan-nuevo", v).addEventListener("click", () => editorPlan());
  $$("[data-editar]", v).forEach(b => b.addEventListener("click", () => editorPlan(planes.find(p => p.id === Number(b.dataset.editar)))));
}

async function generarPeriodo(periodo, emitir) {
  const ok = await confirmar(emitir
    ? `Se generarán y EMITIRÁN (con folio) los documentos pendientes de ${nombrePeriodo(periodo)}. ¿Continuar?`
    : `Se crearán como borradores los documentos pendientes de ${nombrePeriodo(periodo)} para que los revises antes de emitir. ¿Continuar?`,
    { textoBoton: emitir ? "Generar y emitir" : "Generar borradores", peligro: false });
  if (!ok) return;
  try {
    const r = await api("/automatizacion/generar", { metodo: "POST", cuerpo: { periodo, emitir } });
    aviso(`${r.cantidad} documento(s) generado(s)${emitir ? " y emitido(s)" : " como borrador"}.`, "exito");
    estado.filtrosDocs = { estado: emitir ? "EMITIDA" : "BORRADOR", tipo: "", buscar: "", desde: "", hasta: "" };
    mostrarVista("documentos");
  } catch (e) { aviso(e.message, "error"); }
}

async function editorPlan(p = null) {
  await cargarCatalogos();
  const clientes = estado.clientes.filter(c => c.activo || (p && c.id === p.cliente_id));
  if (!clientes.length) { aviso("Primero registra al menos un cliente.", "error"); return mostrarVista("clientes"); }
  const modal = abrirModal(`
    <h2>${p ? "Editar cobro automático" : "Nuevo cobro automático"}</h2>
    <form id="form-plan" class="formulario">
      <label class="ancho">Cliente<select name="cliente_id">${opcionesSelect(clientes, p ? p.cliente_id : "", c => [c.id, `${c.razon_social} (${formatearRut(c.rut)})`])}</select></label>
      <label class="ancho">Concepto (se agrega el nombre del mes)<input name="descripcion" value="${esc(p ? p.descripcion : "")}" placeholder="Asesoría contable mensual" required list="lista-servicios-plan">
        <datalist id="lista-servicios-plan">${estado.servicios.filter(s => s.activo).map(s => `<option value="${esc(s.descripcion)}">`).join("")}</datalist></label>
      <label>Monto neto (CLP)<input type="number" name="monto" min="1" step="1" value="${p ? p.monto : ""}" required></label>
      <label>Tipo de documento<select name="tipo_documento">${Object.entries(estado.tipos).map(([k, n]) =>
        `<option value="${k}" ${(p ? p.tipo_documento : estado.config.tipo_documento_defecto) === k ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
      <label>Frecuencia<select name="periodicidad">${estado.periodicidades.map(x => `<option ${p && p.periodicidad === x ? "selected" : ""}>${x}</option>`).join("")}</select></label>
      <label>Día de emisión (1-31)<input type="number" name="dia_emision" min="1" max="31" value="${p ? p.dia_emision : 1}"></label>
      <label>Mes de inicio<input type="month" name="mes_inicio" value="${esc(p ? p.mes_inicio : periodoActual())}" required></label>
      <label>Mes de término (opcional)<input type="month" name="mes_fin" value="${esc(p && p.mes_fin ? p.mes_fin : "")}"></label>
      <label class="ancho">Observaciones para el documento<textarea name="notas">${esc(p ? p.notas : "")}</textarea></label>
      ${p ? `<label class="fila"><input type="checkbox" name="activo" ${p.activo ? "checked" : ""}> Cobro activo</label>` : ""}
    </form>
    <div class="pie-modal">
      ${p ? `<button class="peligro izquierda" id="plan-eliminar">Eliminar</button>` : ""}
      <button data-cerrar>Cancelar</button><button id="plan-guardar" class="primario">Guardar</button>
    </div>`);
  $("#plan-guardar", modal).addEventListener("click", async () => {
    const datos = datosFormulario($("#form-plan", modal));
    if (!p) datos.activo = 1;
    try {
      if (p) await api(`/planes/${p.id}`, { metodo: "PUT", cuerpo: datos });
      else await api("/planes", { metodo: "POST", cuerpo: datos });
      cerrarModal(); aviso("Cobro automático guardado.", "exito"); cargarPlanes();
    } catch (e) { aviso(e.message, "error"); }
  });
  const eliminar = $("#plan-eliminar", modal);
  if (eliminar) eliminar.addEventListener("click", async () => {
    if (!await confirmar("¿Eliminar este cobro automático? Los documentos ya generados se conservan.", { textoBoton: "Eliminar" })) return;
    try { await api(`/planes/${p.id}`, { metodo: "DELETE" }); cerrarModal(); cargarPlanes(); }
    catch (e) { aviso(e.message, "error"); }
  });
}

// ------------------------------------------------------------- configuración

async function cargarConfiguracion() {
  await cargarEstado();
  const c = estado.config;
  const campo = (n, et, extra = "") => `<label>${et}<input name="${n}" value="${esc(c[n] ?? "")}" ${extra}></label>`;
  const v = $("#vista-configuracion");
  v.innerHTML = `
    <h1>Configuración</h1>
    <form id="form-config">
      <div class="tarjeta"><h2>Datos del emisor</h2><div class="formulario">
        ${campo("emisor_razon_social", "Razón social / Nombre")}
        ${campo("emisor_rut", "RUT", 'placeholder="12.345.678-5"')}
        ${campo("emisor_giro", "Giro")}
        ${campo("emisor_email", "Correo electrónico")}
        ${campo("emisor_direccion", "Dirección")}
        ${campo("emisor_comuna", "Comuna")}
        ${campo("emisor_ciudad", "Ciudad")}
        ${campo("emisor_telefono", "Teléfono")}
      </div></div>
      <div class="tarjeta"><h2>Parámetros de facturación</h2><div class="formulario">
        <label>Tipo de documento por defecto<select name="tipo_documento_defecto">${Object.entries(estado.tipos).map(([k, n]) =>
          `<option value="${k}" ${c.tipo_documento_defecto === k ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
        ${campo("dias_plazo_pago", "Plazo de pago (días)", 'type="number" min="0"')}
        ${campo("tasa_iva", "Tasa de IVA (%)", 'type="number" step="0.01" min="0"')}
        ${campo("tasa_retencion", "Retención boletas de honorarios (%)", 'type="number" step="0.01" min="0"')}
        <p class="ayuda ancho">La retención de honorarios cambia cada año según la Ley 21.133. Verifica la tasa vigente en sii.cl antes de emitir boletas.</p>
        <label class="ancho">Datos para transferencia (se imprimen en el documento)<textarea name="datos_transferencia">${esc(c.datos_transferencia)}</textarea></label>
        <label class="ancho">Pie del documento<textarea name="pie_documento">${esc(c.pie_documento)}</textarea></label>
      </div></div>
      <div class="tarjeta"><h2>Numeración interna</h2>
        <p class="ayuda">Próximo folio que se asignará al emitir cada tipo de documento.</p>
        <div class="formulario">
        ${Object.keys(estado.tipos).map(t => campo("folio_siguiente_" + t, estado.tipos[t], 'type="number" min="1"')).join("")}
      </div></div>
      <div class="pie-modal"><button type="submit" class="primario">Guardar configuración</button></div>
    </form>
    <div class="tarjeta"><h2>Datos y respaldo</h2>
      <p>Base de datos: <code>${esc(estado.rutaDatos)}</code></p>
      <p class="suave">Copia ese archivo (o descarga el respaldo) para llevar tus datos a otro computador.
        Para restaurar un respaldo .sql, consulta el README.</p>
      <div class="acciones-vista">
        <a class="boton" href="/api/respaldo" download>⬇ Descargar respaldo</a>
        <button id="cfg-salir" class="peligro">Cerrar el programa</button>
        <span class="suave">Versión ${esc(estado.version)}</span>
      </div>
    </div>`;
  $("#form-config", v).addEventListener("submit", async e => {
    e.preventDefault();
    try {
      await api("/configuracion", { metodo: "PUT", cuerpo: datosFormulario(e.target) });
      aviso("Configuración guardada.", "exito");
      cargarConfiguracion();
    } catch (err) { aviso(err.message, "error"); }
  });
  $("#cfg-salir", v).addEventListener("click", async () => {
    if (!await confirmar("¿Cerrar el programa? Podrás volver a abrirlo cuando quieras.", { textoBoton: "Cerrar" })) return;
    try { await api("/salir", { metodo: "POST" }); } catch (e) { /* el servidor ya se detuvo */ }
    document.body.innerHTML = '<main><div class="tarjeta vacio"><h1>Programa cerrado</h1><p>Puedes cerrar esta pestaña.</p></div></main>';
  });
}

// --------------------------------------------------------------------- inicio

mostrarVista("panel");
