/* ============================================================
   Bot de Contabilidad — lógica de la aplicación
   Sin servidor. Los datos se guardan en localStorage.
   Funciones: KPIs multi-moneda, presupuesto con alertas,
   gráfico de torta, resumen mensual, meta de ahorro,
   edición de movimientos e importación de CSV del banco.
   ============================================================ */

const STORAGE_KEY = "contabilidad.movimientos.v1";
const PRES_KEY = "contabilidad.presupuesto.v1";
const META_KEY = "contabilidad.meta.v1";

/* ---------- Configuración de monedas (debe ir antes de cargar datos) ---------- */
const BASE = window.MONEDA_BASE || "CLP";
const MONEDAS = window.MONEDAS || { CLP: { simbolo: "$", nombre: "Peso", tasaCLP: 1, decimales: 0 } };

/* ---------- Estado ---------- */
let movimientos = cargar();
let presupuesto = cargarPresupuesto();
let meta = cargarMeta();
let tipoNuevo = "gasto"; // tipo seleccionado en el formulario
let editandoId = null;   // id del movimiento que se está editando (null = alta nueva)

/* ---------- Utilidades ---------- */
const $ = (sel) => document.querySelector(sel);

function cargar() {
  try {
    const guardado = localStorage.getItem(STORAGE_KEY);
    if (guardado) return normalizar(JSON.parse(guardado));
  } catch (e) {
    console.warn("No se pudo leer localStorage:", e);
  }
  return normalizar((window.MOVIMIENTOS_SEED || []).map((m) => ({ ...m })));
}

// Garantiza que todo movimiento tenga moneda (compatibilidad con datos viejos)
function normalizar(lista) {
  return lista.map((m) => ({ moneda: BASE, ...m }));
}

function guardar() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(movimientos));
  } catch (e) {
    console.warn("No se pudo guardar en localStorage:", e);
  }
}

function cargarPresupuesto() {
  try {
    const v = localStorage.getItem(PRES_KEY);
    if (v !== null) return parseFloat(v);
  } catch (e) { /* ignore */ }
  return window.PRESUPUESTO_DEFAULT || 0;
}

function guardarPresupuesto() {
  try { localStorage.setItem(PRES_KEY, String(presupuesto)); } catch (e) { /* ignore */ }
}

function cargarMeta() {
  try {
    const v = localStorage.getItem(META_KEY);
    if (v) return JSON.parse(v);
  } catch (e) { /* ignore */ }
  return { nombre: "", objetivo: 0 };
}

function guardarMeta() {
  try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) { /* ignore */ }
}

// Convierte un monto de su moneda a la moneda base (CLP)
function aBase(m) {
  const info = MONEDAS[m.moneda] || MONEDAS[BASE];
  return m.monto * (info ? info.tasaCLP : 1);
}

function pesos(n) {
  const info = MONEDAS[BASE];
  return info.simbolo + Math.round(n).toLocaleString("es-CL");
}

function fmtMoneda(monto, moneda) {
  const info = MONEDAS[moneda] || MONEDAS[BASE];
  const dec = info.decimales || 0;
  return info.simbolo + monto.toLocaleString("es-CL", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function nuevoId() {
  return "m-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function nombreMes(ym) {
  const [a, m] = ym.split("-");
  const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  return `${meses[parseInt(m, 10) - 1]} ${a}`;
}

function mesCorto(ym) {
  const [a, m] = ym.split("-");
  const meses = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  return `${meses[parseInt(m, 10) - 1]} ${a.slice(2)}`;
}

/* ---------- Filtros ---------- */
function mesesDisponibles() {
  const set = new Set(movimientos.map((m) => m.fecha.slice(0, 7)));
  return [...set].sort().reverse();
}

function movimientosFiltrados() {
  const mes = $("#filtro-mes").value;
  const tipo = $("#filtro-tipo").value;
  return movimientos
    .filter((m) => (mes === "todos" ? true : m.fecha.slice(0, 7) === mes))
    .filter((m) => (tipo === "todos" ? true : m.tipo === tipo))
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
}

function mesActivo() {
  const mes = $("#filtro-mes").value;
  if (mes && mes !== "todos") return mes;
  const meses = mesesDisponibles();
  return meses[0] || null;
}

// Saldo global (todos los movimientos) en moneda base
function saldoGlobal() {
  return movimientos.reduce((s, m) => s + (m.tipo === "ingreso" ? aBase(m) : -aBase(m)), 0);
}

/* ---------- Render principal ---------- */
function render() {
  renderFiltroMes();
  const lista = movimientosFiltrados();
  renderKPIs(lista);
  renderPresupuesto();
  renderMeta();
  renderTorta(lista);
  renderMensual();
  renderLista(lista);
  $("#footer-count").textContent =
    `${movimientos.length} movimiento${movimientos.length === 1 ? "" : "s"} en total`;
}

function renderFiltroMes() {
  const select = $("#filtro-mes");
  const actual = select.value;
  const meses = mesesDisponibles();
  select.innerHTML =
    '<option value="todos">Todos los meses</option>' +
    meses.map((m) => `<option value="${m}">${nombreMes(m)}</option>`).join("");
  if (actual && [...select.options].some((o) => o.value === actual)) {
    select.value = actual;
  }
}

function renderKPIs(lista) {
  const ingresos = lista.filter((m) => m.tipo === "ingreso").reduce((s, m) => s + aBase(m), 0);
  const gastos = lista.filter((m) => m.tipo === "gasto").reduce((s, m) => s + aBase(m), 0);
  const saldo = ingresos - gastos;

  $("#kpi-ingresos").textContent = pesos(ingresos);
  $("#kpi-gastos").textContent = pesos(gastos);
  $("#kpi-saldo").textContent = pesos(saldo);
  $("#saldo-header").textContent = "Saldo " + pesos(saldo);
  $("#kpi-saldo").classList.toggle("negativo", saldo < 0);

  const otras = [...new Set(lista.map((m) => m.moneda).filter((c) => c !== BASE))];
  const nota = $("#nota-moneda");
  if (otras.length) {
    const tasas = otras.map((c) => `${MONEDAS[c].simbolo}1 = ${pesos(MONEDAS[c].tasaCLP)}`).join(" · ");
    nota.textContent = `Totales en ${MONEDAS[BASE].nombre} (${BASE}). Tipo de cambio: ${tasas}.`;
    nota.classList.remove("oculto");
  } else {
    nota.classList.add("oculto");
  }
}

/* ---------- Presupuesto ---------- */
function renderPresupuesto() {
  $("#pres-input").value = presupuesto || 0;
  $("#pres-moneda-base").textContent = BASE;

  const mes = mesActivo();
  const gastosMes = mes
    ? movimientos.filter((m) => m.tipo === "gasto" && m.fecha.slice(0, 7) === mes).reduce((s, m) => s + aBase(m), 0)
    : 0;

  const pct = presupuesto > 0 ? (gastosMes / presupuesto) * 100 : 0;
  const fill = $("#pres-fill");
  fill.style.width = Math.min(pct, 100) + "%";
  fill.classList.remove("ok", "warn", "over");
  fill.classList.add(pct >= 100 ? "over" : pct >= 80 ? "warn" : "ok");

  const restante = presupuesto - gastosMes;
  $("#pres-detalle").innerHTML = presupuesto > 0
    ? `Gastado <strong>${pesos(gastosMes)}</strong> de <strong>${pesos(presupuesto)}</strong> · ${Math.round(pct)}%`
        + (mes ? ` <span class="pres-mes">(${nombreMes(mes)})</span>` : "")
    : `Define un tope de gasto para activar las alertas.`;

  const alerta = $("#pres-alerta");
  if (presupuesto > 0 && pct >= 100) {
    alerta.textContent = `⛔ Sobrepasaste el presupuesto por ${pesos(Math.abs(restante))}.`;
    alerta.className = "pres-alerta over";
  } else if (presupuesto > 0 && pct >= 80) {
    alerta.textContent = `⚠️ Te quedan ${pesos(restante)} de presupuesto este mes.`;
    alerta.className = "pres-alerta warn";
  } else {
    alerta.className = "pres-alerta oculto";
  }
}

/* ---------- Meta de ahorro ---------- */
function renderMeta() {
  $("#meta-nombre").value = meta.nombre || "";
  $("#meta-objetivo").value = meta.objetivo || 0;
  $("#meta-moneda-base").textContent = BASE;

  const ahorrado = Math.max(0, saldoGlobal());
  const obj = meta.objetivo || 0;
  const pct = obj > 0 ? (ahorrado / obj) * 100 : 0;

  const fill = $("#meta-fill");
  fill.style.width = Math.min(pct, 100) + "%";
  fill.classList.remove("ok", "warn", "over");
  fill.classList.add(pct >= 100 ? "over" : "ok"); // 'over' aquí = meta cumplida (verde fuerte vía clase)

  if (obj > 0) {
    const falta = obj - ahorrado;
    $("#meta-detalle").innerHTML = pct >= 100
      ? `🎉 ¡Meta cumplida! Tienes <strong>${pesos(ahorrado)}</strong>` + (meta.nombre ? ` para «${escapar(meta.nombre)}»` : "")
      : `Llevas <strong>${pesos(ahorrado)}</strong> de <strong>${pesos(obj)}</strong> · ${Math.round(pct)}%`
        + ` · te faltan <strong>${pesos(falta)}</strong>`
        + (meta.nombre ? ` para «${escapar(meta.nombre)}»` : "");
  } else {
    $("#meta-detalle").innerHTML = "Define un objetivo de ahorro para seguir tu progreso (se mide con tu saldo total).";
  }
}

/* ---------- Gráfico de torta (gastos por categoría) ---------- */
function renderTorta(lista) {
  const gastos = lista.filter((m) => m.tipo === "gasto");
  const total = gastos.reduce((s, m) => s + aBase(m), 0);
  const cont = $("#torta");
  const leyenda = $("#torta-leyenda");
  const vacio = $("#torta-vacio");

  if (!gastos.length || total === 0) {
    cont.innerHTML = "";
    leyenda.innerHTML = "";
    vacio.classList.remove("oculto");
    return;
  }
  vacio.classList.add("oculto");

  const porCat = {};
  gastos.forEach((m) => { porCat[m.categoria] = (porCat[m.categoria] || 0) + aBase(m); });
  const entradas = Object.entries(porCat).sort((a, b) => b[1] - a[1]);

  const colores = ["#1b5e9b", "#d64541", "#2e9e5b", "#e8a33d", "#7b5ea7", "#3aa0a0", "#c2557a", "#6b7280"];

  const cx = 100, cy = 100, r = 80;
  let ang = -Math.PI / 2;
  let paths = "";
  entradas.forEach(([cat, val], i) => {
    const frac = val / total;
    const ang2 = ang + frac * 2 * Math.PI;
    const x1 = cx + r * Math.cos(ang), y1 = cy + r * Math.sin(ang);
    const x2 = cx + r * Math.cos(ang2), y2 = cy + r * Math.sin(ang2);
    const largo = frac > 0.5 ? 1 : 0;
    const color = colores[i % colores.length];
    if (entradas.length === 1) {
      paths += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"></circle>`;
    } else {
      paths += `<path d="M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${largo},1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${color}"></path>`;
    }
    ang = ang2;
  });

  cont.innerHTML =
    `<svg viewBox="0 0 200 200" width="180" height="180" role="img" aria-label="Gráfico de gastos por categoría">${paths}` +
    `<circle cx="${cx}" cy="${cy}" r="45" fill="#fff"></circle>` +
    `<text x="100" y="96" text-anchor="middle" class="torta-centro-1">Total</text>` +
    `<text x="100" y="116" text-anchor="middle" class="torta-centro-2">${pesos(total)}</text>` +
    `</svg>`;

  leyenda.innerHTML = entradas.map(([cat, val], i) => {
    const pct = Math.round((val / total) * 100);
    const color = colores[i % colores.length];
    return `<div class="ley-item">
      <span class="ley-color" style="background:${color}"></span>
      <span class="ley-cat">${escapar(cat)}</span>
      <span class="ley-val">${pesos(val)} · ${pct}%</span>
    </div>`;
  }).join("");
}

/* ---------- Resumen mensual (ingresos vs gastos) ---------- */
function renderMensual() {
  const cont = $("#grafico-mensual");
  const vacio = $("#mensual-vacio");

  const porMes = {};
  movimientos.forEach((m) => {
    const ym = m.fecha.slice(0, 7);
    if (!porMes[ym]) porMes[ym] = { ingreso: 0, gasto: 0 };
    porMes[ym][m.tipo] += aBase(m);
  });
  const meses = Object.keys(porMes).sort().slice(-6);

  if (!meses.length) {
    cont.innerHTML = "";
    vacio.classList.remove("oculto");
    return;
  }
  vacio.classList.add("oculto");

  const max = Math.max(1, ...meses.map((ym) => Math.max(porMes[ym].ingreso, porMes[ym].gasto)));
  const altoMax = 120;

  const barras = meses.map((ym) => {
    const d = porMes[ym];
    const hi = Math.round((d.ingreso / max) * altoMax);
    const hg = Math.round((d.gasto / max) * altoMax);
    return `<div class="mes-grupo">
      <div class="mes-barras" style="height:${altoMax}px">
        <div class="mes-barra ingreso" style="height:${hi}px" title="Ingresos ${pesos(d.ingreso)}"></div>
        <div class="mes-barra gasto" style="height:${hg}px" title="Gastos ${pesos(d.gasto)}"></div>
      </div>
      <div class="mes-label">${mesCorto(ym)}</div>
    </div>`;
  }).join("");

  cont.innerHTML =
    `<div class="mensual-leyenda">
       <span><i class="punto ingreso"></i>Ingresos</span>
       <span><i class="punto gasto"></i>Gastos</span>
     </div>
     <div class="mensual-barras">${barras}</div>`;
}

/* ---------- Lista de movimientos ---------- */
function renderLista(lista) {
  const ul = $("#lista-mov");
  $("#vacio").classList.toggle("oculto", lista.length > 0);

  ul.innerHTML = lista.map((m) => {
    const signo = m.tipo === "ingreso" ? "+" : "−";
    const enBase = m.moneda !== BASE
      ? `<span class="mov-base">≈ ${pesos(aBase(m))}</span>` : "";
    return `
      <li class="mov ${m.tipo}" data-id="${m.id}">
        <div class="mov-icono">${m.tipo === "ingreso" ? "↑" : "↓"}</div>
        <div class="mov-cuerpo">
          <div class="mov-desc">${escapar(m.descripcion)}</div>
          <div class="mov-meta">
            <span class="badge cat">${escapar(m.categoria)}</span>
            <span class="mov-fecha">${formatoFecha(m.fecha)}</span>
          </div>
        </div>
        <div class="mov-monto-col">
          <div class="mov-monto ${m.tipo}">${signo} ${fmtMoneda(m.monto, m.moneda)}</div>
          ${enBase}
        </div>
        <div class="mov-acciones">
          <button class="btn-icono" title="Editar" data-edit="${m.id}">✎</button>
          <button class="btn-del" title="Eliminar" data-del="${m.id}">×</button>
        </div>
      </li>`;
  }).join("");
}

function escapar(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function formatoFecha(iso) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/* ---------- Alta / edición de movimientos ---------- */
function guardarMovimiento(e) {
  e.preventDefault();
  const desc = $("#mov-desc").value.trim();
  const monto = parseFloat($("#mov-monto").value);
  const moneda = $("#mov-moneda").value;
  const categoria = $("#mov-categoria").value;
  const fecha = $("#mov-fecha").value;

  if (!desc || !monto || monto <= 0 || !fecha) return;

  if (editandoId) {
    const m = movimientos.find((x) => x.id === editandoId);
    if (m) {
      Object.assign(m, { tipo: tipoNuevo, descripcion: desc, monto, moneda: moneda || BASE, categoria, fecha });
    }
  } else {
    movimientos.push({
      id: nuevoId(), tipo: tipoNuevo, descripcion: desc, monto,
      moneda: moneda || BASE, categoria, fecha
    });
  }
  guardar();
  cerrarFormulario();
  render();
}

function editar(id) {
  const m = movimientos.find((x) => x.id === id);
  if (!m) return;
  editandoId = id;
  $("#form-mov").classList.remove("oculto");
  $("#form-titulo").textContent = "Editar movimiento";
  $("#btn-guardar").textContent = "Guardar cambios";
  poblarMonedas();
  setTipoNuevo(m.tipo);
  $("#mov-desc").value = m.descripcion;
  $("#mov-monto").value = m.monto;
  $("#mov-moneda").value = m.moneda;
  poblarCategorias();
  // asegurar que la categoría exista en el select (si no, agregarla)
  if (![...$("#mov-categoria").options].some((o) => o.value === m.categoria)) {
    const opt = document.createElement("option");
    opt.value = m.categoria; opt.textContent = m.categoria;
    $("#mov-categoria").appendChild(opt);
  }
  $("#mov-categoria").value = m.categoria;
  $("#mov-fecha").value = m.fecha;
  $("#form-mov").scrollIntoView({ behavior: "smooth", block: "center" });
  $("#mov-desc").focus();
}

function eliminar(id) {
  movimientos = movimientos.filter((m) => m.id !== id);
  if (editandoId === id) cerrarFormulario();
  guardar();
  render();
}

/* ---------- Presupuesto / meta: edición ---------- */
function actualizarPresupuesto() {
  const v = parseFloat($("#pres-input").value);
  presupuesto = isNaN(v) || v < 0 ? 0 : v;
  guardarPresupuesto();
  renderPresupuesto();
}

function actualizarMeta() {
  const v = parseFloat($("#meta-objetivo").value);
  meta = { nombre: $("#meta-nombre").value.trim(), objetivo: isNaN(v) || v < 0 ? 0 : v };
  guardarMeta();
  renderMeta();
}

/* ---------- Exportar CSV ---------- */
function exportarCSV() {
  const lista = movimientosFiltrados();
  const filas = [["Fecha", "Tipo", "Descripción", "Categoría", "Monto", "Moneda", "Monto " + BASE]];
  lista.forEach((m) => {
    filas.push([m.fecha, m.tipo, m.descripcion, m.categoria, m.monto, m.moneda, Math.round(aBase(m))]);
  });
  const csv = filas
    .map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "contabilidad.csv";
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------- Importar CSV del banco ---------- */
function importarArchivo(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const nuevos = parsearCSVBanco(ev.target.result);
      if (!nuevos.length) {
        alert("No se reconocieron movimientos en el archivo. Revisa que tenga columnas de fecha, descripción y monto.");
        return;
      }
      if (confirm(`Se encontraron ${nuevos.length} movimientos. ¿Importarlos?`)) {
        movimientos.push(...nuevos);
        guardar();
        render();
        alert(`✅ ${nuevos.length} movimientos importados.`);
      }
    } catch (err) {
      console.error(err);
      alert("No se pudo leer el archivo: " + err.message);
    } finally {
      e.target.value = ""; // permitir re-importar el mismo archivo
    }
  };
  reader.readAsText(file, "UTF-8");
}

// Divide una línea CSV respetando comillas. Soporta separador , o ;
function dividirLinea(linea, sep) {
  const out = [];
  let cur = "", dentro = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (dentro && linea[i + 1] === '"') { cur += '"'; i++; }
      else dentro = !dentro;
    } else if (c === sep && !dentro) {
      out.push(cur); cur = "";
    } else { cur += c; }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// Convierte una fecha en varios formatos a AAAA-MM-DD; null si no reconoce
function parsearFecha(s) {
  s = s.trim();
  let m;
  if ((m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/))) {
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  if ((m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/))) {
    return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  if ((m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2})$/))) {
    return `20${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

// Convierte un texto de monto (formatos CL/US) a número; NaN si no hay dígitos
function parsearMonto(s) {
  if (s == null) return NaN;
  let t = String(s).replace(/[^\d.,-]/g, "").trim();
  if (!/\d/.test(t)) return NaN;
  const tieneComa = t.includes(","), tienePunto = t.includes(".");
  if (tieneComa && tienePunto) {
    // el último separador es el decimal
    if (t.lastIndexOf(",") > t.lastIndexOf(".")) t = t.replace(/\./g, "").replace(",", ".");
    else t = t.replace(/,/g, "");
  } else if (tieneComa) {
    // coma como decimal sólo si hay 1-2 dígitos después; si no, es separador de miles
    t = /,\d{1,2}$/.test(t) ? t.replace(",", ".") : t.replace(/,/g, "");
  } else if (tienePunto) {
    if (!/\.\d{1,2}$/.test(t)) t = t.replace(/\./g, "");
  }
  return parseFloat(t);
}

function parsearCSVBanco(texto) {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (!lineas.length) return [];

  // separador: el que más aparezca en la primera línea
  const sep = (lineas[0].split(";").length > lineas[0].split(",").length) ? ";" : ",";

  // ¿la primera fila es encabezado? (no parece tener una fecha)
  const primera = dividirLinea(lineas[0], sep);
  const hayEncabezado = !primera.some((c) => parsearFecha(c));
  const filas = (hayEncabezado ? lineas.slice(1) : lineas).map((l) => dividirLinea(l, sep));

  // detectar índices de columnas usando una muestra de filas
  const muestra = filas.slice(0, 10);
  const nCols = Math.max(...filas.map((f) => f.length));
  let idxFecha = -1, idxMonto = -1;
  for (let c = 0; c < nCols; c++) {
    const valores = muestra.map((f) => f[c]).filter((v) => v != null && v !== "");
    if (idxFecha === -1 && valores.length && valores.every((v) => parsearFecha(v))) idxFecha = c;
  }
  // monto: columna numérica (que no sea la de fecha) con mayor cantidad de números
  let mejorConteo = 0;
  for (let c = 0; c < nCols; c++) {
    if (c === idxFecha) continue;
    const valores = muestra.map((f) => f[c]).filter((v) => v != null && v !== "");
    const numericos = valores.filter((v) => !isNaN(parsearMonto(v))).length;
    if (numericos > mejorConteo && numericos >= Math.ceil(valores.length / 2)) {
      mejorConteo = numericos; idxMonto = c;
    }
  }
  // descripción: la columna de texto más larga en promedio (no fecha ni monto)
  let idxDesc = -1, mejorLargo = -1;
  for (let c = 0; c < nCols; c++) {
    if (c === idxFecha || c === idxMonto) continue;
    const largos = muestra.map((f) => (f[c] || "").length);
    const prom = largos.reduce((a, b) => a + b, 0) / (largos.length || 1);
    if (prom > mejorLargo) { mejorLargo = prom; idxDesc = c; }
  }

  if (idxFecha === -1 || idxMonto === -1) return [];

  const resultado = [];
  filas.forEach((f) => {
    const fecha = parsearFecha(f[idxFecha] || "");
    const monto = parsearMonto(f[idxMonto] || "");
    if (!fecha || isNaN(monto) || monto === 0) return;
    const tipo = monto < 0 ? "gasto" : "ingreso";
    resultado.push({
      id: nuevoId(),
      tipo,
      descripcion: (idxDesc !== -1 && f[idxDesc]) ? f[idxDesc] : "Movimiento importado",
      monto: Math.abs(monto),
      moneda: BASE,
      categoria: tipo === "gasto" ? "Otros gastos" : "Otros ingresos",
      fecha
    });
  });
  return resultado;
}

function restaurar() {
  if (!confirm("¿Restaurar los datos de ejemplo? Se reemplazarán tus movimientos actuales.")) return;
  movimientos = normalizar((window.MOVIMIENTOS_SEED || []).map((m) => ({ ...m })));
  presupuesto = window.PRESUPUESTO_DEFAULT || 0;
  meta = { nombre: "", objetivo: 0 };
  guardar();
  guardarPresupuesto();
  guardarMeta();
  cerrarFormulario();
  render();
}

/* ---------- Formulario ---------- */
function abrirFormulario() {
  editandoId = null;
  $("#form-mov").classList.remove("oculto");
  $("#form-titulo").textContent = "Nuevo movimiento";
  $("#btn-guardar").textContent = "Guardar movimiento";
  setTipoNuevo("gasto");
  $("#mov-fecha").value = hoyISO();
  poblarMonedas();
  poblarCategorias();
  $("#mov-desc").focus();
}

function cerrarFormulario() {
  editandoId = null;
  $("#form-mov").classList.add("oculto");
  $("#form-mov").reset();
  $("#form-titulo").textContent = "Nuevo movimiento";
  $("#btn-guardar").textContent = "Guardar movimiento";
}

function poblarMonedas() {
  const select = $("#mov-moneda");
  select.innerHTML = Object.keys(MONEDAS).map((c) => `<option value="${c}">${c}</option>`).join("");
  select.value = BASE;
}

function poblarCategorias() {
  const select = $("#mov-categoria");
  const cats = (window.CATEGORIAS && window.CATEGORIAS[tipoNuevo]) || [];
  select.innerHTML = cats.map((c) => `<option value="${c}">${c}</option>`).join("");
}

function setTipoNuevo(tipo) {
  tipoNuevo = tipo;
  $("#t-gasto").classList.toggle("active", tipo === "gasto");
  $("#t-ingreso").classList.toggle("active", tipo === "ingreso");
  poblarCategorias();
}

function hoyISO() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/* ---------- Eventos ---------- */
function init() {
  $("#today").textContent = new Date().toLocaleDateString("es-CL", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });

  $("#btn-nuevo").addEventListener("click", abrirFormulario);
  $("#btn-cancelar").addEventListener("click", cerrarFormulario);
  $("#form-mov").addEventListener("submit", guardarMovimiento);
  $("#btn-csv").addEventListener("click", exportarCSV);
  $("#btn-importar").addEventListener("click", () => $("#file-csv").click());
  $("#file-csv").addEventListener("change", importarArchivo);
  $("#btn-reset").addEventListener("click", restaurar);
  $("#filtro-mes").addEventListener("change", render);
  $("#filtro-tipo").addEventListener("change", render);
  $("#t-gasto").addEventListener("click", () => setTipoNuevo("gasto"));
  $("#t-ingreso").addEventListener("click", () => setTipoNuevo("ingreso"));
  $("#pres-input").addEventListener("input", actualizarPresupuesto);
  $("#meta-nombre").addEventListener("input", actualizarMeta);
  $("#meta-objetivo").addEventListener("input", actualizarMeta);

  $("#lista-mov").addEventListener("click", (e) => {
    const del = e.target.getAttribute("data-del");
    const edit = e.target.getAttribute("data-edit");
    if (del) eliminar(del);
    else if (edit) editar(edit);
  });

  render();
}

document.addEventListener("DOMContentLoaded", init);
