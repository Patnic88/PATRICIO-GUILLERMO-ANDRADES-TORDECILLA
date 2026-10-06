// Radar Dropshipping: registro, ranking, patrones y aplicación a Shopify.
// Los ganadores se guardan en localStorage; el token de Meta también, aparte.

const STORAGE_KEY = "radar_dropshipping_v1";
const TOKEN_KEY = "radar_meta_token";
const UMBRAL_PATRON = 50;

let ganadores = [];

// ---- Persistencia --------------------------------------------------------

function cargar() {
  try {
    ganadores = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch (e) {
    ganadores = [];
  }
}

function guardar() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ganadores));
}

// ---- Utilidades ----------------------------------------------------------

const $ = (id) => document.getElementById(id);

function escapar(txt) {
  const d = document.createElement("div");
  d.textContent = txt ?? "";
  return d.innerHTML;
}

// Solo enlaces http(s): evita "javascript:" en respaldos importados.
const urlSegura = (u) => (/^https?:\/\//i.test(u || "") ? u : "");

const fmtNum = (n) => Number(n || 0).toLocaleString("es-CL", { maximumFractionDigits: 2 });
const fmtPct = (x) => `${(x * 100).toFixed(1)} %`;

function descargar(nombre, contenido, tipo) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = Object.assign(document.createElement("a"), { href: url, download: nombre });
  a.click();
  URL.revokeObjectURL(url);
}

function claseVeredicto(v) {
  return { "Ganador probable": "ok", "Testear con poco presupuesto": "medio", "Descartar": "bajo", "No apto": "bloqueado" }[v];
}

function puntuados() {
  return ganadores
    .map((g) => ({ g, p: Scoring.puntuar(g) }))
    .sort((a, b) => b.p.total - a.p.total);
}

// ---- Pestañas ------------------------------------------------------------

function mostrarPestana(nombre) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === nombre));
  document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("oculto", p.id !== `panel-${nombre}`));
  if (nombre === "ranking") renderRanking();
  if (nombre === "patrones") renderPatrones();
  if (nombre === "aplicar") renderSelectorAplicar();
}

// ---- 1. Registrar --------------------------------------------------------

function prepararFormulario() {
  $("selGancho").innerHTML = Object.keys(Generadores.GANCHOS).map((k) => `<option>${k}</option>`).join("");
  $("selFormato").innerHTML = Object.keys(Generadores.FORMATOS).map((k) => `<option>${k}</option>`).join("");
  $("criterios").innerHTML = Scoring.CRITERIOS.map((c) => `
    <label class="check ${c.bloqueante ? "bloqueante" : ""}">
      <input type="checkbox" name="crit_${c.id}" /> ${escapar(c.texto)}${c.bloqueante ? " <em>(obligatorio)</em>" : ""}
    </label>`).join("");
}

function leerFormulario() {
  const form = $("formGanador");
  const datos = Object.fromEntries(new FormData(form).entries());
  const criterios = {};
  Scoring.CRITERIOS.forEach((c) => {
    criterios[c.id] = !!form.elements[`crit_${c.id}`].checked;
    delete datos[`crit_${c.id}`];
  });
  return { ...datos, criterios, id: datos.id || `g-${Date.now()}` };
}

function llenarFormulario(g) {
  const form = $("formGanador");
  form.reset();
  Object.entries(g).forEach(([k, v]) => {
    if (form.elements[k] && typeof v !== "object") form.elements[k].value = v;
  });
  Scoring.CRITERIOS.forEach((c) => {
    form.elements[`crit_${c.id}`].checked = !!(g.criterios || {})[c.id];
  });
}

function onGuardar(e) {
  e.preventDefault();
  const g = leerFormulario();
  const i = ganadores.findIndex((x) => x.id === g.id);
  if (i >= 0) ganadores[i] = g; else ganadores.push(g);
  guardar();
  $("formGanador").reset();
  $("formGanador").elements.id.value = "";
  actualizarContador();
  actualizarNichos();
  mostrarPestana("ranking");
}

function actualizarNichos() {
  const nichos = [...new Set(ganadores.map((g) => g.nicho).filter(Boolean))];
  $("nichos").innerHTML = nichos.map((n) => `<option value="${escapar(n)}">`).join("");
}

function actualizarContador() {
  $("counter").textContent = `${ganadores.length} analizado${ganadores.length === 1 ? "" : "s"}`;
}

// ---- 2. Ranking ----------------------------------------------------------

function renderRanking() {
  const items = puntuados();
  $("rankingVacio").classList.toggle("oculto", items.length > 0);
  $("ranking").innerHTML = items.map(({ g, p }) => {
    const m = p.metricas;
    const enlace = urlSegura(g.enlace) ? `<a href="${escapar(urlSegura(g.enlace))}" target="_blank" rel="noopener">🔗 Ver fuente</a>` : "";
    const bloqueos = p.bloqueos.length
      ? `<div class="aviso">⛔ ${p.bloqueos.map(escapar).join(" · ")}</div>` : "";
    return `
      <li class="tarjeta">
        <div class="puntaje ${claseVeredicto(p.veredicto)}">${p.total}</div>
        <div class="cuerpo">
          <div class="titulo">${escapar(g.producto)} <span class="badge">${escapar(g.plataforma)}</span>
            ${g.nicho ? `<span class="badge">${escapar(g.nicho)}</span>` : ""}</div>
          <div class="veredicto ${claseVeredicto(p.veredicto)}">${p.veredicto}</div>
          <div class="metricas">
            Engagement ${fmtPct(m.engagement)} · ${fmtNum(Math.round(m.vistasDia))} vistas/día ·
            Margen ${fmtPct(m.margen)} (×${m.multiplicador.toFixed(1)}) ·
            ${g.diasActivo ? `${g.diasActivo} días activo` : `Intención de compra ${fmtPct(m.intencion)}`}
          </div>
          <div class="desglose">Demanda ${p.desglose.demanda}/30 · Margen ${p.desglose.margen}/25 ·
            Prueba ${p.desglose.prueba}/15 · Checklist ${p.desglose.checklist}/30</div>
          ${bloqueos}
          <div class="acciones">
            ${enlace}
            <button class="btn-link" data-accion="aplicar" data-id="${g.id}">🛒 Aplicar</button>
            <button class="btn-link" data-accion="editar" data-id="${g.id}">✏ Editar</button>
            <button class="btn-link peligro" data-accion="borrar" data-id="${g.id}">🗑 Borrar</button>
          </div>
        </div>
      </li>`;
  }).join("");
}

function onAccionRanking(e) {
  const btn = e.target.closest("[data-accion]");
  if (!btn) return;
  const g = ganadores.find((x) => x.id === btn.dataset.id);
  if (!g) return;
  if (btn.dataset.accion === "editar") {
    llenarFormulario(g);
    mostrarPestana("registrar");
  } else if (btn.dataset.accion === "borrar" && confirm(`¿Borrar "${g.producto}"?`)) {
    ganadores = ganadores.filter((x) => x.id !== g.id);
    guardar();
    actualizarContador();
    renderRanking();
  } else if (btn.dataset.accion === "aplicar") {
    mostrarPestana("aplicar");
    $("selAplicar").value = g.id;
    renderAplicar();
  }
}

// ---- 3. Patrones ---------------------------------------------------------

function renderPatrones() {
  $("umbralPatron").textContent = UMBRAL_PATRON;
  const top = puntuados().filter(({ p }) => p.total >= UMBRAL_PATRON && !p.bloqueos.length).map(({ g }) => g);
  if (!top.length) {
    $("patrones").innerHTML = `<p class="empty">Aún no hay productos con puntaje ≥ ${UMBRAL_PATRON}.</p>`;
    return;
  }
  const bloque = (titulo, campo) => {
    const filas = Scoring.frecuencias(top, campo).slice(0, 5);
    if (!filas.length) return "";
    return `<div class="patron"><h3>${titulo}</h3>${filas.map((f) => `
      <div class="barra"><span>${escapar(f.valor)}</span>
        <div class="relleno" style="width:${Math.round(f.pct * 100)}%"></div><b>${f.n}</b></div>`).join("")}</div>`;
  };
  const metr = top.map((g) => Scoring.metricas(g));
  const resumen = `
    <div class="patron"><h3>Números típicos (mediana)</h3>
      <p>Precio de venta: <b>${fmtNum(Scoring.mediana(metr.map((m) => m.precio)))}</b></p>
      <p>Margen: <b>${fmtPct(Scoring.mediana(metr.map((m) => m.margen)))}</b></p>
      <p>Multiplicador sobre costo: <b>×${Scoring.mediana(metr.map((m) => m.multiplicador)).toFixed(1)}</b></p>
      <p>Engagement: <b>${fmtPct(Scoring.mediana(metr.map((m) => m.engagement)))}</b></p>
      <p class="nota">Basado en ${top.length} producto${top.length === 1 ? "" : "s"}.</p>
    </div>`;
  $("patrones").innerHTML = resumen +
    bloque("Gancho que más se repite", "tipoGancho") +
    bloque("Formato de video", "formato") +
    bloque("Oferta", "oferta") +
    bloque("Plataforma", "plataforma") +
    bloque("Nicho", "nicho");
}

// ---- 4. Aplicar a mi tienda ----------------------------------------------

function opcionesPrecio() {
  return {
    moneda: $("selMoneda").value,
    multiplicador: Number($("inputMult").value) || 2.8,
    precioComparacion: $("chkComparar").checked,
  };
}

function renderSelectorAplicar() {
  const sel = $("selAplicar");
  const actual = sel.value;
  sel.innerHTML = puntuados().map(({ g, p }) =>
    `<option value="${g.id}">${escapar(g.producto)} — ${p.total} pts${p.bloqueos.length ? " (No apto)" : ""}</option>`).join("");
  if (actual) sel.value = actual;
  renderAplicar();
}

function renderAplicar() {
  const g = ganadores.find((x) => x.id === $("selAplicar").value);
  $("avisoComparar").classList.toggle("oculto", !$("chkComparar").checked);
  if (!g) {
    $("salidaAplicar").innerHTML = `<p class="empty">Registra al menos un producto primero.</p>`;
    return;
  }
  const p = Scoring.puntuar(g);
  const f = Generadores.ficha(g, opcionesPrecio());
  const json = JSON.stringify(Generadores.jsonShopify(f), null, 2);
  const bloqueo = p.bloqueos.length
    ? `<p class="aviso">⛔ Este producto está marcado como <b>No apto</b>: ${p.bloqueos.map(escapar).join(" · ")}. No lo publiques hasta resolverlo.</p>` : "";

  $("salidaAplicar").innerHTML = `
    ${bloqueo}
    <div class="salida">
      <h3>🏷 Ficha de producto</h3>
      <p><b>Título:</b> ${escapar(f.titulo)}</p>
      <p><b>Precio sugerido:</b> ${fmtNum(f.precio)} ${f.moneda}
        ${f.precioComparacion ? ` · <s>${fmtNum(f.precioComparacion)}</s>` : ""}
        <span class="nota">(costo total ${fmtNum(p.metricas.costoTotal)} × ${opcionesPrecio().multiplicador})</span></p>
      <div class="vista-previa">${f.descripcionHtml}</div>
      <p class="nota">Los textos entre [corchetes] faltan: complétalos en la pestaña 1 (Editar).</p>
    </div>
    <div class="salida">
      <h3>🎬 Guion de anuncio (estructura adaptada)</h3>
      <pre>${escapar(Generadores.guion(g))}</pre>
      <button class="btn-ghost" data-copiar="guion">📋 Copiar guion</button>
    </div>
    <div class="salida">
      <h3>🛍 Crear en Shopify con Claude</h3>
      <p>Copia este bloque y pégaselo a Claude con el conector de Shopify activo. Se crea como <b>borrador</b>.</p>
      <pre id="jsonShopify">${escapar(json)}</pre>
      <button class="btn-ghost" data-copiar="json">📋 Copiar JSON</button>
    </div>
    <div class="salida">
      <h3>✅ Antes de publicar</h3>
      <ul class="checklist">
        <li>Pide una muestra al proveedor y verifica calidad y plazo real de envío.</li>
        <li>Graba tu propio video; no reutilices el del anuncio original.</li>
        <li>Revisa que el producto no infrinja marcas ni patentes y que su venta esté permitida en tu país.</li>
        <li>Publica políticas de envío, cambios y devoluciones conforme a la ley de consumidor de tu país.</li>
        <li>Empieza con presupuesto bajo (prueba de 3–5 días) y compara tu costo por venta con tu margen.</li>
      </ul>
    </div>`;

  $("salidaAplicar").querySelectorAll("[data-copiar]").forEach((b) => b.addEventListener("click", () => {
    const texto = b.dataset.copiar === "json" ? json : Generadores.guion(g);
    navigator.clipboard.writeText(texto).then(() => { b.textContent = "✔ Copiado"; });
  }));
}

function onCSV() {
  const aptos = puntuados().filter(({ p }) => !p.bloqueos.length).map(({ g }) => Generadores.ficha(g, opcionesPrecio()));
  if (!aptos.length) return alert("No hay productos aptos para exportar.");
  descargar("productos_shopify.csv", Generadores.csvShopify(aptos), "text/csv;charset=utf-8");
}

// ---- 5. Meta Ad Library ----------------------------------------------------

let resultadosMeta = [];

async function onBuscarMeta() {
  const token = $("metaToken").value.trim();
  try { localStorage.setItem(TOKEN_KEY, token); } catch (e) { /* sin almacenamiento */ }
  $("metaError").classList.add("oculto");
  $("metaResultados").innerHTML = `<li class="empty">Buscando…</li>`;
  try {
    resultadosMeta = await MetaAPI.buscar({
      token,
      terminos: $("metaTerminos").value.trim(),
      pais: $("metaPais").value.trim() || "ES",
      version: $("metaVersion").value.trim() || "v25.0",
    });
    resultadosMeta.sort((a, b) => b.diasActivo - a.diasActivo);
    $("metaResultados").innerHTML = resultadosMeta.length ? resultadosMeta.map((a, i) => `
      <li class="tarjeta">
        <div class="puntaje ${a.diasActivo >= 30 ? "ok" : a.diasActivo >= 7 ? "medio" : "bajo"}">${a.diasActivo}<small>días</small></div>
        <div class="cuerpo">
          <div class="titulo">${escapar(a.pagina)} <span class="badge">${escapar(a.plataformas)}</span></div>
          <div class="metricas">Desde ${escapar(a.inicio)}${a.alcanceUE ? ` · alcance UE ${fmtNum(a.alcanceUE)}` : ""}</div>
          <p class="texto-anuncio">${escapar(a.titulo)} ${escapar(a.texto).slice(0, 280)}</p>
          <div class="acciones">
            <a href="${escapar(a.enlace)}" target="_blank" rel="noopener">🔗 Ver en la Biblioteca</a>
            <button class="btn-link" data-importar="${i}">➕ Analizar este anuncio</button>
          </div>
        </div>
      </li>`).join("") : `<li class="empty">Sin resultados.</li>`;
  } catch (err) {
    $("metaResultados").innerHTML = "";
    $("metaError").textContent = err.message;
    $("metaError").classList.remove("oculto");
  }
}

function onImportarMeta(e) {
  const btn = e.target.closest("[data-importar]");
  if (!btn) return;
  const a = resultadosMeta[Number(btn.dataset.importar)];
  llenarFormulario({
    producto: a.titulo || a.pagina,
    plataforma: "Meta Ads (Biblioteca)",
    enlace: a.enlace,
    fechaPublicacion: a.inicio,
    diasActivo: a.diasActivo,
  });
  mostrarPestana("registrar");
}

// ---- Respaldo -------------------------------------------------------------

function onExportar() {
  descargar(`radar_dropshipping_${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(ganadores, null, 2), "application/json");
}

function onImportar(e) {
  const archivo = e.target.files[0];
  if (!archivo) return;
  archivo.text().then((txt) => {
    try {
      const datos = JSON.parse(txt);
      if (!Array.isArray(datos)) throw new Error("formato");
      ganadores = datos;
      guardar();
      actualizarContador();
      renderRanking();
    } catch (err) {
      alert("El archivo no es un respaldo válido del Radar.");
    }
  });
  e.target.value = "";
}

// ---- Inicio ----------------------------------------------------------------

function iniciar() {
  cargar();
  prepararFormulario();
  actualizarContador();
  actualizarNichos();
  try { $("metaToken").value = localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { /* sin almacenamiento */ }

  $("tabs").addEventListener("click", (e) => {
    const t = e.target.closest(".tab");
    if (t) mostrarPestana(t.dataset.tab);
  });
  $("formGanador").addEventListener("submit", onGuardar);
  $("btnLimpiar").addEventListener("click", () => { $("formGanador").elements.id.value = ""; });
  $("ranking").addEventListener("click", onAccionRanking);
  ["selAplicar", "selMoneda", "inputMult", "chkComparar"].forEach((id) => $(id).addEventListener("input", renderAplicar));
  $("btnCSV").addEventListener("click", onCSV);
  $("btnMeta").addEventListener("click", onBuscarMeta);
  $("metaResultados").addEventListener("click", onImportarMeta);
  $("btnExportar").addEventListener("click", onExportar);
  $("inputImportar").addEventListener("change", onImportar);
}

document.addEventListener("DOMContentLoaded", iniciar);
