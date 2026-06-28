/* ============================================================
   Bot de Contabilidad — lógica de la aplicación
   Sin servidor. Los datos se guardan en localStorage.
   ============================================================ */

const STORAGE_KEY = "contabilidad.movimientos.v1";

/* ---------- Estado ---------- */
let movimientos = cargar();
let tipoNuevo = "gasto"; // tipo seleccionado en el formulario

/* ---------- Utilidades ---------- */
const $ = (sel) => document.querySelector(sel);

function cargar() {
  try {
    const guardado = localStorage.getItem(STORAGE_KEY);
    if (guardado) return JSON.parse(guardado);
  } catch (e) {
    console.warn("No se pudo leer localStorage:", e);
  }
  // Primera vez: usar datos de ejemplo
  return (window.MOVIMIENTOS_SEED || []).map((m) => ({ ...m }));
}

function guardar() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(movimientos));
  } catch (e) {
    console.warn("No se pudo guardar en localStorage:", e);
  }
}

function pesos(n) {
  return "$" + Math.round(n).toLocaleString("es-CL");
}

function nuevoId() {
  return "m-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function nombreMes(ym) {
  // ym = "2026-06"  ->  "junio 2026"
  const [a, m] = ym.split("-");
  const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  return `${meses[parseInt(m, 10) - 1]} ${a}`;
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

/* ---------- Render ---------- */
function render() {
  renderFiltroMes();
  const lista = movimientosFiltrados();
  renderKPIs(lista);
  renderCategorias(lista);
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
  // mantener selección si sigue existiendo
  if (actual && [...select.options].some((o) => o.value === actual)) {
    select.value = actual;
  }
}

function renderKPIs(lista) {
  const ingresos = lista.filter((m) => m.tipo === "ingreso").reduce((s, m) => s + m.monto, 0);
  const gastos = lista.filter((m) => m.tipo === "gasto").reduce((s, m) => s + m.monto, 0);
  const saldo = ingresos - gastos;

  $("#kpi-ingresos").textContent = pesos(ingresos);
  $("#kpi-gastos").textContent = pesos(gastos);
  $("#kpi-saldo").textContent = pesos(saldo);
  $("#saldo-header").textContent = "Saldo " + pesos(saldo);

  const saldoEl = $("#kpi-saldo");
  saldoEl.classList.toggle("negativo", saldo < 0);
}

function renderCategorias(lista) {
  const cont = $("#cat-resumen");
  const gastos = lista.filter((m) => m.tipo === "gasto");
  const total = gastos.reduce((s, m) => s + m.monto, 0);

  if (!gastos.length) {
    cont.innerHTML = "";
    return;
  }

  const porCat = {};
  gastos.forEach((m) => {
    porCat[m.categoria] = (porCat[m.categoria] || 0) + m.monto;
  });

  const filas = Object.entries(porCat)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, monto]) => {
      const pct = total ? Math.round((monto / total) * 100) : 0;
      return `
        <div class="cat-fila">
          <div class="cat-info">
            <span class="cat-nombre">${cat}</span>
            <span class="cat-monto">${pesos(monto)} · ${pct}%</span>
          </div>
          <div class="cat-barra"><div class="cat-barra-fill" style="width:${pct}%"></div></div>
        </div>`;
    })
    .join("");

  cont.innerHTML = `<h3 class="cat-titulo">Gastos por categoría</h3>${filas}`;
}

function renderLista(lista) {
  const ul = $("#lista-mov");
  $("#vacio").classList.toggle("oculto", lista.length > 0);

  ul.innerHTML = lista
    .map((m) => {
      const signo = m.tipo === "ingreso" ? "+" : "−";
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
        <div class="mov-monto ${m.tipo}">${signo} ${pesos(m.monto)}</div>
        <button class="btn-del" title="Eliminar" data-del="${m.id}">×</button>
      </li>`;
    })
    .join("");
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

/* ---------- Acciones ---------- */
function agregarMovimiento(e) {
  e.preventDefault();
  const desc = $("#mov-desc").value.trim();
  const monto = parseInt($("#mov-monto").value, 10);
  const categoria = $("#mov-categoria").value;
  const fecha = $("#mov-fecha").value;

  if (!desc || !monto || monto <= 0 || !fecha) return;

  movimientos.push({
    id: nuevoId(),
    tipo: tipoNuevo,
    descripcion: desc,
    monto: monto,
    categoria: categoria,
    fecha: fecha
  });
  guardar();
  cerrarFormulario();
  render();
}

function eliminar(id) {
  movimientos = movimientos.filter((m) => m.id !== id);
  guardar();
  render();
}

function exportarCSV() {
  const lista = movimientosFiltrados();
  const filas = [["Fecha", "Tipo", "Descripción", "Categoría", "Monto"]];
  lista.forEach((m) => {
    filas.push([m.fecha, m.tipo, m.descripcion, m.categoria, m.monto]);
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

function restaurar() {
  if (!confirm("¿Restaurar los datos de ejemplo? Se reemplazarán tus movimientos actuales.")) return;
  movimientos = (window.MOVIMIENTOS_SEED || []).map((m) => ({ ...m }));
  guardar();
  render();
}

/* ---------- Formulario ---------- */
function abrirFormulario() {
  $("#form-mov").classList.remove("oculto");
  $("#mov-fecha").value = hoyISO();
  poblarCategorias();
  $("#mov-desc").focus();
}

function cerrarFormulario() {
  $("#form-mov").classList.add("oculto");
  $("#form-mov").reset();
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
  // Fecha de hoy en el encabezado
  $("#today").textContent = new Date().toLocaleDateString("es-CL", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });

  $("#btn-nuevo").addEventListener("click", abrirFormulario);
  $("#btn-cancelar").addEventListener("click", cerrarFormulario);
  $("#form-mov").addEventListener("submit", agregarMovimiento);
  $("#btn-csv").addEventListener("click", exportarCSV);
  $("#btn-reset").addEventListener("click", restaurar);
  $("#filtro-mes").addEventListener("change", render);
  $("#filtro-tipo").addEventListener("change", render);
  $("#t-gasto").addEventListener("click", () => setTipoNuevo("gasto"));
  $("#t-ingreso").addEventListener("click", () => setTipoNuevo("ingreso"));

  // Eliminar (delegación de eventos)
  $("#lista-mov").addEventListener("click", (e) => {
    const id = e.target.getAttribute("data-del");
    if (id) eliminar(id);
  });

  render();
}

document.addEventListener("DOMContentLoaded", init);
