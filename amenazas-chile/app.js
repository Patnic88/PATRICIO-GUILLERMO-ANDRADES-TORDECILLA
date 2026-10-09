// Amenazas Chile — interfaz: mapa Leaflet, filtros de fecha y área, pestañas
// de aluviones, factores, incendios y sismos.
// Los aluviones propios o importados y los ajustes se guardan en localStorage;
// los sismos y detecciones de incendios descargados viven solo en memoria.

const N = window.Nucleo;
const F = window.Fuentes;

const CLAVE_PROPIOS = "amenazas_aluviones_propios_v1";
const CLAVE_IMPORTADOS = "amenazas_aluviones_importados_v1";
const CLAVE_AJUSTES = "amenazas_ajustes_v1";
const CLAVE_UBICACIONES = "amenazas_ubicaciones_v1";
const FECHA_INICIO_TODO = "1900-01-01";
const MAX_DIAS_FIRMS = 92;
const MAX_MARCADORES = 20000;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const estado = {
  desde: "",
  hasta: "",
  area: "chile",
  semilla: [],
  propios: [],
  importados: [],
  sismos: [],
  incendios: [],
  incendiosCobertura: null,
  ajustes: { firmsClave: "", firmsFuente: "VIIRS_SNPP_NRT", magMin: 5, soloChile: true, factores: null },
  modoRegistro: false,
  nuevoPunto: null,
  ubicando: null, // id del aluvión del catálogo que se está ubicando en el mapa
  ubicaciones: {},
  punto: null,
};

// ---- Utilidades ------------------------------------------------------------

function leer(clave, porDefecto) {
  try {
    const v = localStorage.getItem(clave);
    return v ? JSON.parse(v) : porDefecto;
  } catch (e) {
    return porDefecto;
  }
}

function guardar(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch (e) {
    avisar("No se pudo guardar en este navegador (modo privado o sin espacio).");
  }
}

// Crea elementos con textContent (los datos importados nunca van como HTML).
function el(tag, props = {}, ...hijos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const h of hijos.flat()) {
    if (h === null || h === undefined || h === false) continue;
    e.append(h instanceof Node ? h : String(h));
  }
  return e;
}

const SVG = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs = {}) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

const $ = (id) => document.getElementById(id);
const fmtNum = (x, d = 0) =>
  Number.isFinite(x) ? x.toLocaleString("es-CL", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";

function fmtFecha(f) {
  if (!f) return "—";
  const [dia, hora] = f.split("T");
  const p = dia.split("-");
  const txt = p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : p.length === 2 ? `${MESES[Number(p[1]) - 1]} ${p[0]}` : p[0];
  return hora ? `${txt} ${hora} UTC` : txt;
}

function fmtPeriodo(k) {
  if (k.length === 10) return `${k.slice(8)}-${k.slice(5, 7)}-${k.slice(0, 4)}`;
  if (k.length === 7) return `${MESES[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}`;
  return k;
}

// En celular el mapa queda sobre el panel: lo trae a la vista antes de usarlo.
function mostrarMapa() {
  const m = $("mapa");
  if (m.getBoundingClientRect().bottom < 80 || m.getBoundingClientRect().top > window.innerHeight - 80) {
    m.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}
const volarA = (lat, lon, zoom) => {
  mostrarMapa();
  mapa.flyTo([lat, lon], zoom);
};

const urlSegura = (u) => (/^https?:\/\//i.test(u || "") ? u : null);
const hoy = () => F.horaActualChile().slice(0, 10);
const color = (variable) => getComputedStyle(document.documentElement).getPropertyValue(variable).trim();

let temporizadorAviso;
function avisar(texto) {
  const a = $("aviso");
  a.textContent = texto;
  a.classList.add("visible");
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => a.classList.remove("visible"), 4500);
}

function descargar(nombre, contenido, tipo) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = el("a", { href: url, download: nombre });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function leerArchivo(input, alLeer) {
  const archivo = input.files && input.files[0];
  if (!archivo) return;
  const lector = new FileReader();
  lector.onload = () => {
    try {
      alLeer(String(lector.result), archivo.name);
    } catch (e) {
      avisar(`No se pudo leer ${archivo.name}: ${e.message}`);
    }
    input.value = "";
  };
  lector.readAsText(archivo);
}

// ---- Configuración de factores (valores de partida + ajustes guardados) ----

function configFactores() {
  const base = JSON.parse(JSON.stringify(N.CONFIG_FACTORES));
  const g = estado.ajustes.factores;
  if (!g) return base;
  for (const z of base.zonas) {
    const gz = (g.zonas || []).find((x) => x.id === z.id);
    if (gz) Object.assign(z, { lluvia24: gz.lluvia24, lluviaHora: gz.lluviaHora });
  }
  Object.assign(base.pesos, g.pesos || {});
  for (const k of ["radioIncendioKm", "aniosIncendio", "radioHistorialKm", "relieveMin", "relievePleno"]) {
    if (Number.isFinite(g[k])) base[k] = g[k];
  }
  return base;
}

// ---- Mapa ------------------------------------------------------------------

const mapa = L.map("mapa", { preferCanvas: true });
const calles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(mapa);
const relieve = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
  maxZoom: 17,
  attribution: 'Mapa &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA), datos &copy; OpenStreetMap',
});
const capas = {
  aluviones: L.layerGroup().addTo(mapa),
  incendios: L.layerGroup().addTo(mapa),
  sismos: L.layerGroup().addTo(mapa),
  factores: L.layerGroup().addTo(mapa),
};
L.control
  .layers(
    { "Calles (OpenStreetMap)": calles, "Relieve (OpenTopoMap)": relieve },
    { "🌊 Aluviones": capas.aluviones, "🔥 Incendios": capas.incendios, "🌎 Sismos": capas.sismos, "⚠️ Factores evaluados": capas.factores },
    { collapsed: true }
  )
  .addTo(mapa);
L.control.scale({ imperial: false }).addTo(mapa);
mapa.fitBounds([[-55.9, -75.7], [-17.5, -66.4]]);

let marcaRegistro = null;
let marcaPunto = null;

mapa.on("click", (e) => {
  const { lat, lng } = e.latlng;
  if (estado.ubicando) {
    estado.ubicaciones[estado.ubicando] = { lat, lon: lng };
    guardar(CLAVE_UBICACIONES, estado.ubicaciones);
    estado.ubicando = null;
    document.body.classList.remove("modo-registro");
    aplicarUbicaciones();
    renderAluviones();
    avisar("Ubicación guardada en este navegador.");
    return;
  }
  if (estado.modoRegistro) {
    estado.nuevoPunto = { lat, lon: lng };
    if (marcaRegistro) marcaRegistro.remove();
    marcaRegistro = L.circleMarker([lat, lng], { radius: 9, color: color("--ink"), weight: 2, fillOpacity: 0 }).addTo(mapa);
    $("al-form-punto").textContent = `Ubicación: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    return;
  }
  const contenido = el(
    "div",
    {},
    el("p", { text: `${lat.toFixed(4)}, ${lng.toFixed(4)}` }),
    el("button", {
      type: "button",
      text: "⚠️ Evaluar factores de aluvión aquí",
      onclick: () => {
        mapa.closePopup();
        seleccionarPunto(lat, lng);
        abrirPestana("factores");
        evaluarSeleccion();
      },
    })
  );
  L.popup().setLatLng(e.latlng).setContent(contenido).openOn(mapa);
});

let temporizadorMapa;
mapa.on("moveend", () => {
  if (estado.area !== "visible") return;
  clearTimeout(temporizadorMapa);
  temporizadorMapa = setTimeout(renderEstadisticas, 250);
});

function cajaActual() {
  if (estado.area !== "visible") return null;
  const b = mapa.getBounds();
  return { sur: b.getSouth(), norte: b.getNorth(), oeste: b.getWest(), este: b.getEast() };
}

const filtroFecha = () => ({ desde: estado.desde, hasta: estado.hasta });
const filtroCompleto = () => ({ ...filtroFecha(), caja: cajaActual() });

// ---- Pestañas --------------------------------------------------------------

function abrirPestana(id) {
  document.querySelectorAll(".pestanas [role=tab]").forEach((b) => {
    const activa = b.dataset.tab === id;
    b.setAttribute("aria-selected", String(activa));
    $(`t-${b.dataset.tab}`).hidden = !activa;
  });
  // Los gráficos se dibujan con el ancho real del panel visible.
  renderEstadisticas();
}

document.querySelectorAll(".pestanas [role=tab]").forEach((b) => b.addEventListener("click", () => abrirPestana(b.dataset.tab)));

// ---- Filtros de fecha y área -------------------------------------------------

function fijarRango(desde, hasta) {
  estado.desde = desde;
  estado.hasta = hasta;
  $("desde").value = desde;
  $("hasta").value = hasta;
  document.querySelectorAll("[data-preset]").forEach((b) => b.setAttribute("aria-pressed", "false"));
  renderTodo();
}

document.querySelectorAll("[data-preset]").forEach((b) =>
  b.addEventListener("click", () => {
    const h = hoy();
    const d = b.dataset.preset === "todo" ? FECHA_INICIO_TODO : N.sumarDias(h, -Number(b.dataset.preset) + 1);
    fijarRango(d, h);
    b.setAttribute("aria-pressed", "true");
  })
);

["desde", "hasta"].forEach((id) =>
  $(id).addEventListener("change", () => {
    const d = $("desde").value;
    const h = $("hasta").value;
    if (!d || !h) return;
    if (d > h) {
      avisar("La fecha «Desde» es posterior a «Hasta».");
      return;
    }
    fijarRango(d, h);
  })
);

$("area").addEventListener("change", (e) => {
  estado.area = e.target.value;
  renderEstadisticas();
});

// ---- Gráfico de barras por período ----------------------------------------

function ticksLimpios(max) {
  if (max <= 0) return [0, 1];
  const bruto = max / 3;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const norm = bruto / mag;
  const paso = Math.max(1, Math.round((norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag));
  const t = [0];
  while (t[t.length - 1] < max) t.push(t[t.length - 1] + paso);
  return t;
}

function trazoBarra(x, y, w, h) {
  const r = Math.min(4, w / 2, h);
  const yb = y + h;
  return `M${x},${yb}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${yb}Z`;
}

// barras: [{ periodo, n, atenuada? }]. Una sola serie: sin leyenda, el título la nombra.
function grafico(contenedor, barras, { titulo, colorVar, unidad = "", decimales = 0 }) {
  contenedor.replaceChildren();
  if (!barras.length || barras.every((b) => !b.n)) {
    contenedor.append(el("p", { class: "nota", text: "Sin registros en el rango para graficar." }));
    return;
  }
  const W = Math.max(260, contenedor.clientWidth || 380);
  const H = 150;
  const m = { t: 8, r: 6, b: 22, l: 36 };
  const max = Math.max(...barras.map((b) => b.n));
  const ticks = ticksLimpios(decimales ? Math.ceil(max) : max);
  const yMax = ticks[ticks.length - 1];
  const alto = H - m.t - m.b;
  const banda = (W - m.l - m.r) / barras.length;
  const hueco = banda > 6 ? 2 : banda > 2.5 ? 1 : 0;
  const ancho = Math.max(0.6, Math.min(24, banda - hueco));
  const y = (v) => m.t + alto - (v / yMax) * alto;

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": titulo });
  for (const t of ticks) {
    svg.append(svgEl("line", { class: t === 0 ? "base" : "rejilla", x1: m.l, x2: W - m.r, y1: y(t), y2: y(t) }));
    const etq = svgEl("text", { x: m.l - 6, y: y(t) + 4, "text-anchor": "end" });
    etq.textContent = fmtNum(t);
    svg.append(etq);
  }
  const relleno = color(colorVar);
  const tooltip = el("div", { class: "tooltip", hidden: true });
  barras.forEach((b, i) => {
    const x = m.l + i * banda + (banda - ancho) / 2;
    const hit = svgEl("rect", { class: "barra-hit", x: m.l + i * banda, y: m.t, width: banda, height: alto });
    const h = b.n > 0 ? Math.max(1, (b.n / yMax) * alto) : 0;
    const dato = svgEl("path", { class: "barra-dato", d: trazoBarra(x, m.t + alto - h, ancho, h), fill: relleno });
    if (b.atenuada) dato.setAttribute("fill-opacity", "0.4");
    hit.addEventListener("pointermove", (ev) => {
      const caja = contenedor.getBoundingClientRect();
      tooltip.replaceChildren(el("b", { text: `${fmtNum(b.n, decimales)}${unidad}` }), " · ", fmtPeriodo(b.periodo));
      tooltip.hidden = false;
      const izq = Math.min(ev.clientX - caja.left + 10, caja.width - tooltip.offsetWidth - 4);
      tooltip.style.left = `${Math.max(0, izq)}px`;
      tooltip.style.top = `${ev.clientY - caja.top - 34}px`;
    });
    hit.addEventListener("pointerleave", () => (tooltip.hidden = true));
    svg.append(hit, dato);
  });
  const etiquetasX = barras.length > 2 ? [0, Math.floor(barras.length / 2), barras.length - 1] : barras.map((_, i) => i);
  for (const i of etiquetasX) {
    const t = svgEl("text", {
      x: m.l + i * banda + banda / 2,
      y: H - 6,
      "text-anchor": i === 0 && barras.length > 2 ? "start" : i === barras.length - 1 && barras.length > 2 ? "end" : "middle",
    });
    t.textContent = fmtPeriodo(barras[i].periodo);
    svg.append(t);
  }

  const filas = barras.filter((b) => b.n).map((b) => el("tr", {}, el("td", { text: fmtPeriodo(b.periodo) }), el("td", { class: "num", text: `${fmtNum(b.n, decimales)}${unidad}` })));
  contenedor.append(
    el("div", { class: "titulo", text: titulo }),
    svg,
    tooltip,
    el("details", { class: "tabla-datos" }, el("summary", { text: "Ver como tabla" }), el("table", {}, el("tbody", {}, filas)))
  );
}

const NOMBRE_PASO = { dia: "día", mes: "mes", anio: "año" };

function cifras(contenedor, items) {
  contenedor.replaceChildren(
    ...items.map((c) =>
      el("div", { class: "cifra" }, el("div", { class: "etiqueta", text: c.etiqueta }), el("div", { class: "valor", text: c.valor }), c.detalle && el("div", { class: "detalle", text: c.detalle }))
    )
  );
}

// ---- Aluviones -------------------------------------------------------------

const todosAluviones = () => [...estado.semilla, ...estado.propios, ...estado.importados];

const TEXTO_CONFIRMACION = { alta: "coincidencia alta", media: "coincidencia media", baja: "coincidencia baja" };

function selloAluvion(a) {
  if (a.origen === "Propio") return "Registro propio";
  if (a.origen === "Catálogo") {
    if (a.verificado) return "✔ Fuente verificada";
    return `Fuente ${a.tipo_fuente || ""} sin revisar · ${TEXTO_CONFIRMACION[a.confirmacion] || "sin grado"}`;
  }
  return `Importado (${a.origen})`;
}

function aplicarUbicaciones() {
  estado.semilla = (window.ALUVIONES_SEMILLA || []).map((a) => {
    const u = estado.ubicaciones[a.id];
    return u ? { ...a, lat: u.lat, lon: u.lon, coord_nota: "Ubicado por ti en el mapa", origen: "Catálogo" } : { ...a, origen: "Catálogo" };
  });
}

function ubicar(a) {
  estado.ubicando = a.id;
  document.body.classList.add("modo-registro");
  mostrarMapa();
  avisar(`Toca el mapa donde ocurrió: ${a.localidad}.`);
}

function textoFallecidos(a) {
  if (Number.isFinite(a.fallecidos)) return `Fallecidos: ${a.fallecidos}${a.fallecidos_nota ? ` (${a.fallecidos_nota})` : ""}`;
  return a.fallecidos_nota ? `Fallecidos: sin cifra (${a.fallecidos_nota})` : "";
}

function popupAluvion(a) {
  const enlace = urlSegura(a.fuente_url);
  return el(
    "div",
    {},
    el("b", { text: a.localidad || "Aluvión" }),
    el("p", { text: `${fmtFecha(a.fecha)}${a.comuna || a.region ? " · " + [a.comuna, a.region].filter(Boolean).join(", ") : ""}` }),
    a.descripcion && el("p", { text: a.descripcion }),
    textoFallecidos(a) && el("p", { text: textoFallecidos(a) }),
    a.coord_nota && el("p", { class: "nota", text: `Ubicación: ${a.coord_nota}` }),
    el("p", {}, el("span", { class: "sello", text: selloAluvion(a) }), " ", enlace && el("a", { href: enlace, target: "_blank", rel: "noopener", text: a.fuente_titulo || "Fuente" })),
    a.nota_verificacion && el("p", { class: "nota", text: a.nota_verificacion }),
    el("button", { type: "button", text: "🔎 Condiciones de esa fecha", onclick: () => condicionesDeEvento(a) })
  );
}

function renderAluviones() {
  const enRango = N.filtrar(todosAluviones(), filtroFecha());
  capas.aluviones.clearLayers();
  const fill = color("--aluviones");
  const anillo = color("--surface");
  for (const a of enRango.filter(N.tieneUbicacion)) {
    L.circleMarker([a.lat, a.lon], {
      radius: 8, color: anillo, weight: 2, fillColor: fill, fillOpacity: a.origen === "Catálogo" ? 0.95 : 0.6, bubblingMouseEvents: false,
    })
      .bindPopup(() => popupAluvion(a))
      .bindTooltip(`${a.localidad || "Aluvión"} · ${fmtFecha(a.fecha)}`)
      .addTo(capas.aluviones);
  }
  renderEstadisticasAluviones();
}

function renderEstadisticasAluviones() {
  const lista = N.filtrar(todosAluviones(), filtroCompleto()).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const r = N.resumenAluviones(lista);
  cifras($("al-cifras"), [
    { etiqueta: "Aluviones en el rango", valor: fmtNum(r.total), detalle: `${fmtNum(r.verificados)} con fuente ya revisada` },
    { etiqueta: "Fallecidos registrados", valor: fmtNum(r.fallecidosRegistrados), detalle: `suma de ${r.eventosConCifra} evento(s) con cifra` },
    { etiqueta: "Sin ubicación", valor: fmtNum(r.sinUbicacion), detalle: "no aparecen en el mapa" },
  ]);
  if (!$("t-aluviones").hidden) {
    const h = N.histograma(lista, estado.desde, estado.hasta);
    grafico($("al-grafico"), h.barras, { titulo: `Aluviones por ${NOMBRE_PASO[h.paso]}`, colorVar: "--aluviones" });
  }
  const ul = $("al-lista");
  ul.replaceChildren();
  if (!lista.length) {
    ul.append(el("li", { class: "nota" }, "No hay aluviones en este rango. ", el("button", { type: "button", text: "Ver todo el registro", onclick: () => document.querySelector('[data-preset="todo"]').click() })));
    return;
  }
  for (const a of lista.slice(0, 200)) {
    const enlace = urlSegura(a.fuente_url);
    ul.append(
      el(
        "li",
        { class: "evento" },
        el("div", { class: "cab" }, el("span", { class: "lugar", text: a.localidad || "Aluvión" }), el("span", { class: "fecha", text: fmtFecha(a.fecha) })),
        (a.comuna || a.region) && el("p", { text: [a.comuna, a.region].filter(Boolean).join(", ") }),
        a.descripcion && el("p", { text: a.descripcion }),
        textoFallecidos(a) && el("p", { text: textoFallecidos(a) }),
        a.nota_verificacion && el("p", { class: "nota", text: a.nota_verificacion }),
        el(
          "div",
          { class: "acciones" },
          el("span", { class: "sello", text: selloAluvion(a) }),
          N.tieneUbicacion(a)
            ? el("button", { type: "button", text: "📍 Ver", onclick: () => volarA(a.lat, a.lon, 11) })
            : el("button", { type: "button", text: "📍 Ubicar en el mapa", onclick: () => ubicar(a) }),
          N.tieneUbicacion(a) && el("button", { type: "button", text: "🔎 Condiciones de esa fecha", onclick: () => condicionesDeEvento(a) }),
          enlace && el("a", { class: "boton", href: enlace, target: "_blank", rel: "noopener", text: "Fuente" }),
          a.origen === "Propio" && el("button", { type: "button", text: "🗑️", "aria-label": "Borrar registro", onclick: () => borrarPropio(a.id) })
        )
      )
    );
  }
  if (lista.length > 200) ul.append(el("li", { class: "nota", text: `Se muestran 200 de ${lista.length}. Acota el rango o el área.` }));
}

function borrarPropio(id) {
  if (!confirm("¿Borrar este registro?")) return;
  estado.propios = estado.propios.filter((a) => a.id !== id);
  guardar(CLAVE_PROPIOS, estado.propios);
  renderAluviones();
}

$("al-registrar").addEventListener("click", () => {
  estado.modoRegistro = true;
  estado.nuevoPunto = null;
  document.body.classList.add("modo-registro");
  $("al-form").hidden = false;
  $("al-form-punto").textContent = "Toca el mapa donde ocurrió.";
  $("al-f-fecha").value = estado.hasta || hoy();
  mostrarMapa();
  avisar("Toca el mapa donde ocurrió el aluvión. Luego completa la ficha bajo el mapa.");
});

function salirRegistro() {
  estado.modoRegistro = false;
  document.body.classList.remove("modo-registro");
  $("al-form").hidden = true;
  $("al-form").reset();
  if (marcaRegistro) marcaRegistro.remove();
  marcaRegistro = null;
}

$("al-f-cancelar").addEventListener("click", salirRegistro);

$("al-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!estado.nuevoPunto) {
    avisar("Primero toca el mapa para ubicar el aluvión.");
    return;
  }
  const fallecidos = Number($("al-f-fallecidos").value);
  estado.propios.push({
    id: `propio-${Date.now()}`,
    fecha: $("al-f-fecha").value,
    localidad: $("al-f-localidad").value.trim(),
    descripcion: $("al-f-desc").value.trim(),
    fallecidos: $("al-f-fallecidos").value === "" ? null : fallecidos,
    fuente_url: $("al-f-fuente").value.trim(),
    lat: estado.nuevoPunto.lat,
    lon: estado.nuevoPunto.lon,
    origen: "Propio",
    verificado: false,
  });
  guardar(CLAVE_PROPIOS, estado.propios);
  salirRegistro();
  renderAluviones();
  avisar("Aluvión registrado.");
});

$("al-archivo").addEventListener("change", (e) =>
  leerArchivo(e.target, (texto, nombre) => {
    const nuevos = N.parsearAluviones(texto, nombre.replace(/\.[^.]+$/, ""));
    if (!nuevos.length) {
      avisar("No se encontraron filas con fecha, latitud y longitud (de Chile).");
      return;
    }
    estado.importados.push(...nuevos);
    guardar(CLAVE_IMPORTADOS, estado.importados);
    renderAluviones();
    avisar(`${nuevos.length} aluviones importados de ${nombre}.`);
  })
);

$("al-descargar").addEventListener("click", () => {
  const lista = N.filtrar(todosAluviones(), filtroCompleto());
  const cols = ["fecha", "localidad", "comuna", "region", "lat", "lon", "fallecidos", "desencadenante", "descripcion", "fuente_titulo", "fuente_url", "verificado", "origen"];
  descargar(`aluviones_${estado.desde}_${estado.hasta}.csv`, N.aCSV(lista, cols), "text/csv;charset=utf-8");
});

function condicionesDeEvento(a) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.fecha) || a.fecha < "1940-01-01") {
    avisar("Se necesita una fecha completa (día) desde 1940 para revisar el clima de ese evento.");
    return;
  }
  mapa.closePopup();
  document.querySelector('input[name="fx-modo"][value="fecha"]').checked = true;
  $("fx-fecha").disabled = false;
  $("fx-fecha").value = a.fecha;
  seleccionarPunto(a.lat, a.lon);
  abrirPestana("factores");
  evaluarSeleccion();
}

// ---- Factores --------------------------------------------------------------

function seleccionarPunto(lat, lon) {
  estado.punto = { lat, lon };
  if (marcaPunto) marcaPunto.remove();
  marcaPunto = L.circleMarker([lat, lon], { radius: 10, color: color("--ink"), weight: 2, fillOpacity: 0, dashArray: "3 3" }).addTo(mapa);
  $("fx-punto").textContent = `Punto: ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  $("fx-evaluar").disabled = false;
}

document.querySelectorAll('input[name="fx-modo"]').forEach((r) =>
  r.addEventListener("change", () => {
    const fecha = document.querySelector('input[name="fx-modo"]:checked').value === "fecha";
    $("fx-fecha").disabled = !fecha;
    if (fecha && !$("fx-fecha").value) $("fx-fecha").value = N.sumarDias(hoy(), -7);
  })
);

$("fx-evaluar").addEventListener("click", evaluarSeleccion);

function fechaEvaluacion() {
  const modo = document.querySelector('input[name="fx-modo"]:checked').value;
  return modo === "fecha" ? $("fx-fecha").value : null;
}

function contarIncendiosCercanos(lat, lon, ref, cfg) {
  const cob = estado.incendiosCobertura;
  const desde = N.sumarDias(ref, -365 * cfg.aniosIncendio);
  if (!cob || cob.hasta < desde || cob.desde > ref) return null;
  return N.contarCerca(estado.incendios, lat, lon, cfg.radioIncendioKm, { desde, hasta: ref });
}

async function evaluarEn(lat, lon, fecha) {
  const cfg = configFactores();
  const [rel, meteo] = await Promise.all([
    F.cargarRelieve(lat, lon),
    fecha ? F.cargarMeteoHistorico(lat, lon, fecha) : F.cargarMeteoPronostico(lat, lon),
  ]);
  const ref = fecha || hoy();
  const resultado = N.evaluarFactores(
    {
      lat,
      lon,
      meteo: meteo.resumen,
      relieve: rel,
      incendiosCercanos: contarIncendiosCercanos(lat, lon, ref, cfg),
      aluvionesCercanos: N.contarCerca(todosAluviones(), lat, lon, cfg.radioHistorialKm, { hasta: N.sumarDias(ref, -1) }),
    },
    cfg
  );
  return { resultado, meteo, relieve: rel };
}

async function evaluarSeleccion() {
  if (!estado.punto) return;
  const fecha = fechaEvaluacion();
  if (fecha === "") {
    avisar("Elige la fecha a evaluar.");
    return;
  }
  if (fecha && fecha < "1940-01-01") {
    avisar("El reanálisis climático disponible parte en 1940.");
    return;
  }
  if (fecha && fecha > N.sumarDias(hoy(), -7)) {
    avisar("El reanálisis llega con algunos días de retraso: para fechas recientes pueden faltar datos. Usa el modo pronóstico.");
  }
  const { lat, lon } = estado.punto;
  const caja = $("fx-resultado");
  const boton = $("fx-evaluar");
  boton.disabled = true;
  caja.replaceChildren(el("p", { class: "nota", text: "Consultando elevación y clima en Open-Meteo…" }));
  try {
    const r = await evaluarEn(lat, lon, fecha);
    renderResultado(caja, r, { lat, lon, fecha });
    marcarEvaluacion(lat, lon, r.resultado, fecha ? fmtFecha(fecha) : "pronóstico");
  } catch (e) {
    caja.replaceChildren(el("p", { class: "nota", text: `No se pudo evaluar: ${e.message}` }));
  } finally {
    boton.disabled = false;
  }
}

const ICONO_ESTADO = { si: "⚠️ Presente", parcial: "🔸 Parcial", no: "⚪ Ausente", sinDatos: "❔ Sin datos" };

function renderResultado(caja, { resultado: r, meteo, relieve: rel }, { fecha }) {
  const v = meteo.horas.slice(...meteo.ventana);
  const ventanaTxt = v.length
    ? `${fecha ? "Ventana" : "Pronóstico"}: ${fmtFecha(v[0].t.slice(0, 10))} a ${fmtFecha(v[v.length - 1].t.slice(0, 10))} (${v.length} h, hora de Chile).`
    : "Sin horas en la ventana evaluada.";
  const medidor = (texto, valor) =>
    el("div", { class: "medidor" }, el("div", { text: `${texto}: ${valor === null ? "sin datos" : `${valor} de 100`}` }), el("div", { class: "pista" }, el("div", { class: "relleno", style: `width:${valor || 0}%` })));

  // Lluvia diaria: la ventana evaluada a color pleno, los días previos atenuados.
  const porDia = new Map();
  meteo.horas.forEach((h, i) => {
    const d = h.t.slice(0, 10);
    const previo = porDia.get(d) || { periodo: d, n: 0, atenuada: true };
    previo.n += h.lluvia || 0;
    if (i >= meteo.ventana[0] && i < meteo.ventana[1]) previo.atenuada = false;
    porDia.set(d, previo);
  });
  const grafLluvia = el("div", { class: "grafico" });

  caja.replaceChildren(
    el(
      "div",
      { class: `semaforo ${r.nivel ? r.nivel.id : ""}` },
      el("div", { class: "nivel", text: r.nivel ? `${r.nivel.icono} ${r.nivel.texto}` : "Sin resultado" }),
      el("div", { class: "indice", text: r.indice === null ? "Faltan datos para calcular el índice." : `Índice ${r.indice} de 100 · ${r.zona.nombre}` }),
      el("p", { class: "nota", text: ventanaTxt }),
      medidor("Detonante meteorológico", r.detonante),
      medidor("Susceptibilidad del terreno", r.susceptibilidad),
      el("p", { class: "nota", text: "El índice solo sube cuando ambos se reúnen (raíz del producto). Es heurístico: no es una alerta." })
    ),
    el(
      "ul",
      { class: "factores" },
      r.factores.map((f) => el("li", {}, el("b", { text: `${ICONO_ESTADO[f.estado]} · ${f.nombre}` }), el("span", { text: f.texto })))
    ),
    grafLluvia,
    meteo.estimada &&
      el("p", { class: "nota", text: "Isoterma 0 °C estimada desde la temperatura a 2 m con el gradiente estándar (6,5 °C/km): con inversión térmica, frecuente en la costa norte, puede errar." }),
    fecha &&
      el("p", { class: "nota", text: "Fecha pasada: lluvia del reanálisis ERA5 (celdas de ~25 km). Suaviza los aguaceros locales, así que los milímetros suelen quedar bajo lo que midió un pluviómetro en el lugar." }),
    rel && Number.isFinite(rel.elevacion) && rel.elevacion === 0 && el("p", { class: "nota", text: "El punto parece estar en el mar o a nivel del mar." })
  );
  grafico(grafLluvia, [...porDia.values()], { titulo: "Lluvia diaria (mm) · color pleno = días evaluados", colorVar: "--aluviones", unidad: " mm", decimales: 1 });
}

const COLOR_NIVEL = { bajo: "--bueno", moderado: "--atencion", alto: "--serio", muyAlto: "--critico" };

function marcarEvaluacion(lat, lon, r, etiqueta) {
  if (!r.nivel) return;
  L.circleMarker([lat, lon], { radius: 9, color: color("--surface"), weight: 2, fillColor: color(COLOR_NIVEL[r.nivel.id]), fillOpacity: 1, bubblingMouseEvents: false })
    .bindTooltip(`${r.nivel.icono} ${r.nivel.texto} (${r.indice}/100) · ${etiqueta}`)
    .addTo(capas.factores);
}

// Revisa con el pronóstico cada lugar con aluviones registrados (sin repetir
// lugares a menos de 3 km).
function lugaresConHistorial() {
  const lugares = [];
  for (const a of todosAluviones().filter(N.tieneUbicacion)) {
    if (lugares.some((l) => N.distanciaKm(l.lat, l.lon, a.lat, a.lon) < 3)) continue;
    lugares.push({ nombre: a.localidad || "Aluvión", lat: a.lat, lon: a.lon });
  }
  return lugares;
}

$("fx-lote").addEventListener("click", async () => {
  const lugares = lugaresConHistorial();
  const caja = $("fx-lote-resultado");
  const boton = $("fx-lote");
  if (!lugares.length) {
    avisar("No hay lugares con aluviones registrados.");
    return;
  }
  boton.disabled = true;
  const filas = [];
  let errores = 0;
  for (let i = 0; i < lugares.length; i++) {
    caja.replaceChildren(el("p", { class: "nota", text: `Revisando ${i + 1} de ${lugares.length}: ${lugares[i].nombre}…` }));
    try {
      const { resultado, meteo } = await evaluarEn(lugares[i].lat, lugares[i].lon, null);
      filas.push({ ...lugares[i], r: resultado, m: meteo.resumen });
      marcarEvaluacion(lugares[i].lat, lugares[i].lon, resultado, `${lugares[i].nombre}, pronóstico`);
    } catch (e) {
      errores++;
    }
  }
  boton.disabled = false;
  filas.sort((a, b) => (b.r.indice ?? -1) - (a.r.indice ?? -1));
  caja.replaceChildren(
    el("h3", { text: "Pronóstico en lugares con historial" }),
    el(
      "table",
      {},
      el("thead", {}, el("tr", {}, el("th", { text: "Lugar" }), el("th", { text: "Nivel" }), el("th", { class: "num", text: "Lluvia 24 h" }), el("th", { class: "num", text: "Isoterma" }))),
      el(
        "tbody",
        {},
        filas.map((f) =>
          el(
            "tr",
            {},
            el("td", {}, el("button", { type: "button", text: f.nombre, onclick: () => { seleccionarPunto(f.lat, f.lon); volarA(f.lat, f.lon, 11); } })),
            el("td", { text: f.r.nivel ? `${f.r.nivel.icono} ${f.r.nivel.texto} (${f.r.indice})` : "—" }),
            el("td", { class: "num", text: `${fmtNum(f.m.lluvia24, 1)} mm` }),
            el("td", { class: "num", text: Number.isFinite(f.m.isotermaLluvia) ? `${fmtNum(f.m.isotermaLluvia)} m` : "—" })
          )
        )
      )
    ),
    errores ? el("p", { class: "nota", text: `${errores} lugar(es) no se pudieron consultar.` }) : null
  );
});

function renderAjustes() {
  const cfg = configFactores();
  const caja = $("fx-ajustes");
  const num = (valor, alCambiar, paso = 1) =>
    el("input", { type: "number", value: valor, step: paso, min: 0, style: "width:72px", onchange: (e) => { alCambiar(Number(e.target.value)); guardarAjustesFactores(cfg); } });
  caja.replaceChildren(
    el(
      "table",
      {},
      el("thead", {}, el("tr", {}, el("th", { text: "Zona" }), el("th", { class: "num", text: "mm en 24 h" }), el("th", { class: "num", text: "mm en 1 h" }))),
      el(
        "tbody",
        {},
        cfg.zonas.map((z) =>
          el("tr", {}, el("td", { text: z.nombre }), el("td", { class: "num" }, num(z.lluvia24, (v) => (z.lluvia24 = v))), el("td", { class: "num" }, num(z.lluviaHora, (v) => (z.lluviaHora = v))))
        )
      )
    ),
    el("h3", { text: "Pesos" }),
    el(
      "table",
      {},
      el(
        "tbody",
        {},
        [
          ["lluvia", "Lluvia intensa"],
          ["isoterma", "Isoterma alta durante la lluvia"],
          ["lluviaPrevia", "Lluvia de los 7 días previos"],
          ["relieve", "Relieve"],
          ["incendio", "Incendio reciente"],
          ["historial", "Aluviones previos"],
        ].map(([k, t]) => el("tr", {}, el("td", { text: t }), el("td", { class: "num" }, num(cfg.pesos[k], (v) => (cfg.pesos[k] = v)))))
      )
    ),
    el("h3", { text: "Distancias y relieve" }),
    el(
      "table",
      {},
      el(
        "tbody",
        {},
        [
          ["radioIncendioKm", "Radio para incendios (km)", 0.5],
          ["aniosIncendio", "Años hacia atrás para incendios", 1],
          ["radioHistorialKm", "Radio para aluviones previos (km)", 1],
          ["relieveMin", "Desnivel en 6 km que empieza a contar (m)", 50],
          ["relievePleno", "Desnivel en 6 km de puntaje máximo (m)", 50],
        ].map(([k, t, paso]) => el("tr", {}, el("td", { text: t }), el("td", { class: "num" }, num(cfg[k], (v) => (cfg[k] = v), paso))))
      )
    )
  );
}

function guardarAjustesFactores(cfg) {
  estado.ajustes.factores = {
    zonas: cfg.zonas.map((z) => ({ id: z.id, lluvia24: z.lluvia24, lluviaHora: z.lluviaHora })),
    pesos: { ...cfg.pesos },
    radioIncendioKm: cfg.radioIncendioKm,
    aniosIncendio: cfg.aniosIncendio,
    radioHistorialKm: cfg.radioHistorialKm,
    relieveMin: cfg.relieveMin,
    relievePleno: cfg.relievePleno,
  };
  guardar(CLAVE_AJUSTES, estado.ajustes);
}

$("fx-restaurar").addEventListener("click", () => {
  estado.ajustes.factores = null;
  guardar(CLAVE_AJUSTES, estado.ajustes);
  renderAjustes();
  avisar("Umbrales y pesos restaurados.");
});

// ---- Incendios -------------------------------------------------------------

$("in-fuente").replaceChildren(...F.FUENTES_FIRMS.map((f) => el("option", { value: f.id, text: f.texto })));

$("in-clave").addEventListener("change", (e) => {
  estado.ajustes.firmsClave = e.target.value.trim();
  guardar(CLAVE_AJUSTES, estado.ajustes);
});
$("in-fuente").addEventListener("change", (e) => {
  estado.ajustes.firmsFuente = e.target.value;
  guardar(CLAVE_AJUSTES, estado.ajustes);
});
["in-km", "in-dias"].forEach((id) => $(id).addEventListener("change", renderEstadisticasIncendios));

$("in-cargar").addEventListener("click", async () => {
  const clave = estado.ajustes.firmsClave;
  const info = $("in-estado");
  if (!clave) {
    avisar("Pega tu MAP_KEY de FIRMS.");
    $("in-clave").focus();
    return;
  }
  const dias = N.diasEntre(estado.desde, estado.hasta) + 1;
  if (dias > MAX_DIAS_FIRMS) {
    info.replaceChildren(
      `El rango tiene ${fmtNum(dias)} días. Carga hasta ${MAX_DIAS_FIRMS} días por vez; para historia larga usa «Importar CSV de FIRMS». `,
      el("button", { type: "button", text: "Usar últimos 30 días", onclick: () => document.querySelector('[data-preset="30"]').click() })
    );
    return;
  }
  const boton = $("in-cargar");
  boton.disabled = true;
  try {
    const datos = await F.cargarIncendios(
      { clave, fuente: estado.ajustes.firmsFuente, caja: N.CAJA_CHILE, desde: estado.desde, hasta: estado.hasta },
      (i, n) => (info.textContent = `Consultando FIRMS: tramo ${i + 1} de ${n}…`)
    );
    estado.incendios = datos;
    estado.incendiosCobertura = { desde: estado.desde, hasta: estado.hasta };
    info.textContent = datos.length
      ? `${fmtNum(datos.length)} detecciones recibidas (${estado.ajustes.firmsFuente}, ${fmtFecha(estado.desde)} a ${fmtFecha(estado.hasta)}).`
      : "FIRMS no devolvió detecciones para este rango. Si el rango es antiguo, los datos «casi tiempo real» pueden no cubrirlo: usa la descarga de archivo de FIRMS e impórtala.";
    renderIncendios();
  } catch (e) {
    info.textContent = e.message;
  } finally {
    boton.disabled = false;
  }
});

$("in-archivo").addEventListener("change", (e) =>
  leerArchivo(e.target, (texto, nombre) => {
    const datos = N.parsearFIRMS(texto, nombre.replace(/\.[^.]+$/, ""));
    if (!datos.length) {
      avisar("El archivo no tiene columnas latitude, longitude y acq_date.");
      return;
    }
    const fechas = datos.map((d) => N.soloDia(d.fecha)).sort();
    estado.incendios = datos;
    estado.incendiosCobertura = { desde: fechas[0], hasta: fechas[fechas.length - 1] };
    $("in-estado").textContent = `${fmtNum(datos.length)} detecciones importadas de ${nombre} (${fmtFecha(fechas[0])} a ${fmtFecha(fechas[fechas.length - 1])}).`;
    renderIncendios();
  })
);

function renderIncendios() {
  capas.incendios.clearLayers();
  const lista = N.filtrar(estado.incendios, filtroFecha());
  const fill = color("--incendios");
  for (const d of lista.slice(0, MAX_MARCADORES)) {
    L.circleMarker([d.lat, d.lon], { radius: 3, stroke: false, fillColor: fill, fillOpacity: 0.75, bubblingMouseEvents: false })
      .bindTooltip(`🔥 ${fmtFecha(d.fecha)}${Number.isFinite(d.frp) ? ` · FRP ${fmtNum(d.frp, 1)} MW` : ""}`)
      .addTo(capas.incendios);
  }
  renderEstadisticasIncendios();
}

function renderEstadisticasIncendios() {
  const caja = $("in-cifras");
  if (!estado.incendios.length) {
    cifras(caja, []);
    $("in-grafico").replaceChildren(el("p", { class: "nota", text: "Aún no hay detecciones cargadas." }));
    $("in-focos").replaceChildren();
    return;
  }
  const lista = N.filtrar(estado.incendios, filtroCompleto());
  const focos = N.agruparFocos(lista.map((d) => ({ ...d })), Number($("in-km").value) || 2, Number($("in-dias").value) || 0);
  const r = N.resumenIncendios(lista, focos);
  cifras(caja, [
    { etiqueta: "Detecciones", valor: fmtNum(r.detecciones) },
    { etiqueta: "Focos agrupados", valor: fmtNum(r.focos) },
    { etiqueta: "Días con fuego", valor: fmtNum(r.diasConActividad) },
    { etiqueta: "Potencia radiativa", valor: `${fmtNum(r.frpTotal)} MW`, detalle: `suma de FRP; máx. ${fmtNum(r.frpMax, 1)} MW` },
  ]);
  if (!$("t-incendios").hidden) {
    const h = N.histograma(lista, estado.desde, estado.hasta);
    grafico($("in-grafico"), h.barras, { titulo: `Detecciones por ${NOMBRE_PASO[h.paso]}`, colorVar: "--incendios" });
  }
  $("in-focos").replaceChildren(
    focos.length
      ? el(
          "table",
          {},
          el("thead", {}, el("tr", {}, el("th", { text: "Período" }), el("th", { class: "num", text: "Días" }), el("th", { class: "num", text: "Detecc." }), el("th", { class: "num", text: "FRP máx." }), el("th", { text: "" }))),
          el(
            "tbody",
            {},
            focos.slice(0, 15).map((f) =>
              el(
                "tr",
                {},
                el("td", { text: f.inicio === f.fin ? fmtFecha(f.inicio) : `${fmtFecha(f.inicio)} a ${fmtFecha(f.fin)}` }),
                el("td", { class: "num", text: fmtNum(f.dias) }),
                el("td", { class: "num", text: fmtNum(f.detecciones) }),
                el("td", { class: "num", text: Number.isFinite(f.frpMax) ? `${fmtNum(f.frpMax, 1)} MW` : "—" }),
                el("td", {}, el("button", { type: "button", text: "📍", "aria-label": "Ver foco en el mapa", onclick: () => volarA(f.lat, f.lon, 11) }))
              )
            )
          )
        )
      : el("p", { class: "nota", text: "Sin detecciones en el rango y área elegidos." })
  );
}

// ---- Sismos ----------------------------------------------------------------

$("si-mag").addEventListener("change", (e) => {
  estado.ajustes.magMin = Number(e.target.value);
  guardar(CLAVE_AJUSTES, estado.ajustes);
});
$("si-solochile").addEventListener("change", (e) => {
  estado.ajustes.soloChile = e.target.checked;
  guardar(CLAVE_AJUSTES, estado.ajustes);
  renderSismos();
});

$("si-cargar").addEventListener("click", async () => {
  const info = $("si-estado");
  const boton = $("si-cargar");
  boton.disabled = true;
  info.textContent = "Consultando USGS…";
  try {
    const datos = await F.cargarSismos({ desde: estado.desde, hasta: estado.hasta, magMin: estado.ajustes.magMin });
    estado.sismos = datos;
    const enChile = datos.filter((s) => /chile/i.test(s.lugar)).length;
    info.textContent =
      `USGS entregó ${fmtNum(datos.length)} sismos de magnitud ${fmtNum(estado.ajustes.magMin, 1)} o más en la zona (${fmtFecha(estado.desde)} a ${fmtFecha(estado.hasta)}); ` +
      `${fmtNum(enChile)} con «Chile» en la descripción.` +
      (datos.length >= 20000 ? " Se llegó al máximo de 20.000 por consulta: acota el rango o sube la magnitud." : "");
    renderSismos();
  } catch (e) {
    info.textContent = e.message;
  } finally {
    boton.disabled = false;
  }
});

$("si-archivo").addEventListener("change", (e) =>
  leerArchivo(e.target, (texto, nombre) => {
    const datos = N.parsearSismosCSV(texto, nombre.replace(/\.[^.]+$/, ""));
    if (!datos.length) {
      avisar("El archivo no tiene columnas de fecha, latitud y longitud reconocibles.");
      return;
    }
    estado.sismos = datos;
    $("si-estado").textContent = `${fmtNum(datos.length)} sismos importados de ${nombre}.`;
    renderSismos();
  })
);

const sismosVisibles = () => (estado.ajustes.soloChile ? estado.sismos.filter((e) => e.origen !== "USGS" || /chile/i.test(e.lugar)) : estado.sismos);

function renderSismos() {
  capas.sismos.clearLayers();
  const lista = N.filtrar(sismosVisibles(), filtroFecha());
  const fill = color("--sismos");
  const anillo = color("--surface");
  const ordenados = [...lista].sort((a, b) => (a.mag ?? 0) - (b.mag ?? 0)); // los mayores encima
  for (const s of ordenados.slice(-MAX_MARCADORES)) {
    const r = Number.isFinite(s.mag) ? N.limitar(2 + (s.mag - 2.5) * 2.4, 3, 20) : 3;
    const contenido = el(
      "div",
      {},
      el("b", { text: `M ${fmtNum(s.mag, 1)} · ${fmtFecha(s.fecha)}` }),
      el("p", { text: s.lugar || "" }),
      el("p", { text: `Profundidad: ${fmtNum(s.prof)} km · Fuente: ${s.origen}` }),
      urlSegura(s.url) && el("a", { href: s.url, target: "_blank", rel: "noopener", text: "Ficha del evento" })
    );
    L.circleMarker([s.lat, s.lon], { radius: r, color: anillo, weight: 1, fillColor: fill, fillOpacity: 0.6, bubblingMouseEvents: false })
      .bindPopup(contenido)
      .addTo(capas.sismos);
  }
  renderEstadisticasSismos();
}

function renderEstadisticasSismos() {
  if (!estado.sismos.length) {
    cifras($("si-cifras"), []);
    $("si-magnitudes").replaceChildren();
    $("si-grafico").replaceChildren(el("p", { class: "nota", text: "Aún no hay sismos cargados." }));
    $("si-lista").replaceChildren();
    return;
  }
  const lista = N.filtrar(sismosVisibles(), filtroCompleto());
  const r = N.resumenSismos(lista);
  cifras($("si-cifras"), [
    { etiqueta: "Sismos", valor: fmtNum(r.total) },
    { etiqueta: "Mayor magnitud", valor: r.mayor ? `M ${fmtNum(r.mayor.mag, 1)}` : "—", detalle: r.mayor ? `${fmtFecha(r.mayor.fecha)} · ${r.mayor.lugar}` : "" },
    { etiqueta: "Superficiales", valor: fmtNum(r.superficiales), detalle: "menos de 70 km de profundidad" },
    { etiqueta: "Profundidad mediana", valor: `${fmtNum(r.profundidadMediana)} km` },
  ]);
  const maxN = Math.max(1, ...r.porMagnitud.map((x) => x.n));
  $("si-magnitudes").replaceChildren(
    el("h3", { text: "Por magnitud" }),
    el(
      "table",
      {},
      el(
        "tbody",
        {},
        r.porMagnitud.map((x) =>
          el(
            "tr",
            {},
            el("td", { text: x.texto, style: "width:30%" }),
            el("td", {}, el("div", { style: `height:10px;border-radius:0 4px 4px 0;background:var(--sismos);width:${(x.n / maxN) * 100}%;min-width:${x.n ? 2 : 0}px` })),
            el("td", { class: "num", text: fmtNum(x.n), style: "width:18%" })
          )
        )
      )
    )
  );
  if (!$("t-sismos").hidden) {
    const h = N.histograma(lista, estado.desde, estado.hasta);
    grafico($("si-grafico"), h.barras, { titulo: `Sismos por ${NOMBRE_PASO[h.paso]}`, colorVar: "--sismos" });
  }
  const top = [...lista].filter((s) => Number.isFinite(s.mag)).sort((a, b) => b.mag - a.mag).slice(0, 20);
  $("si-lista").replaceChildren(
    el(
      "table",
      {},
      el("thead", {}, el("tr", {}, el("th", { text: "Fecha" }), el("th", { class: "num", text: "M" }), el("th", { class: "num", text: "Prof." }), el("th", { text: "Lugar" }))),
      el(
        "tbody",
        {},
        top.map((s) =>
          el(
            "tr",
            {},
            el("td", { text: fmtFecha(s.fecha) }),
            el("td", { class: "num", text: fmtNum(s.mag, 1) }),
            el("td", { class: "num", text: `${fmtNum(s.prof)} km` }),
            el("td", {}, el("button", { type: "button", text: s.lugar || "Ver", onclick: () => volarA(s.lat, s.lon, 8) }))
          )
        )
      )
    )
  );
}

// ---- Prueba de conexiones ----------------------------------------------------

const TEXTO_PRUEBA = { ok: "✅ Funciona", rara: "⚠️ Respuesta extraña", error: "❌ Falla", omitida: "➖ Omitida" };

function probarTeselas() {
  return new Promise((resolver) => {
    const img = new Image();
    const t0 = Date.now();
    const fin = (ok) => resolver({ nombre: "Mapa base (OpenStreetMap)", estado: ok ? "ok" : "error", ms: Date.now() - t0, detalle: ok ? "Cargan las imágenes del mapa." : "No cargan las imágenes del mapa." });
    img.onload = () => fin(true);
    img.onerror = () => fin(false);
    setTimeout(() => fin(false), 15000);
    img.src = "https://tile.openstreetmap.org/0/0/0.png";
  });
}

$("fu-probar").addEventListener("click", async () => {
  const boton = $("fu-probar");
  const caja = $("fu-pruebas");
  boton.disabled = true;
  caja.replaceChildren(el("p", { class: "nota", text: "Probando…" }));
  const pruebas = F.pruebasConexion({ clave: estado.ajustes.firmsClave, fuente: estado.ajustes.firmsFuente, hoy: hoy() });
  const resultados = await Promise.all([probarTeselas(), ...pruebas.map(F.probarConexion)]);
  boton.disabled = false;
  caja.replaceChildren(
    el(
      "table",
      {},
      el("tbody", {}, resultados.map((r) =>
        el("tr", {}, el("td", {}, el("b", { text: r.nombre }), el("br"), el("span", { class: "nota", text: r.detalle })),
          el("td", { text: TEXTO_PRUEBA[r.estado] }),
          el("td", { class: "num nota", text: Number.isFinite(r.ms) ? `${fmtNum(r.ms / 1000, 1)} s` : "" }))
      ))
    ),
    resultados.some((r) => r.estado === "error") &&
      el("p", { class: "nota", text: "Si una fuente no responde: revisa la conexión, prueba abriendo la app desde un servidor (ver README) o usa la importación de archivos de esa pestaña." })
  );
});

// ---- Respaldo --------------------------------------------------------------

$("fu-respaldo").addEventListener("click", () => {
  const { firmsClave, ...ajustesSinClave } = estado.ajustes;
  const datos = { app: "amenazas-chile", version: 1, fecha: hoy(), propios: estado.propios, importados: estado.importados, ubicaciones: estado.ubicaciones, ajustes: ajustesSinClave };
  descargar(`respaldo_amenazas_${hoy()}.json`, JSON.stringify(datos, null, 2), "application/json");
});

$("fu-restaurar").addEventListener("change", (e) =>
  leerArchivo(e.target, (texto) => {
    const datos = JSON.parse(texto);
    if (datos.app !== "amenazas-chile") throw new Error("no es un respaldo de esta app");
    const ids = new Set(estado.propios.map((a) => a.id));
    estado.propios.push(...(datos.propios || []).filter((a) => !ids.has(a.id)));
    estado.importados.push(...(datos.importados || []));
    estado.ubicaciones = { ...estado.ubicaciones, ...(datos.ubicaciones || {}) };
    guardar(CLAVE_UBICACIONES, estado.ubicaciones);
    aplicarUbicaciones();
    estado.ajustes = { ...estado.ajustes, ...(datos.ajustes || {}), firmsClave: estado.ajustes.firmsClave };
    guardar(CLAVE_PROPIOS, estado.propios);
    guardar(CLAVE_IMPORTADOS, estado.importados);
    guardar(CLAVE_AJUSTES, estado.ajustes);
    aplicarAjustesEnFormulario();
    renderTodo();
    avisar("Respaldo restaurado.");
  })
);

// ---- Arranque --------------------------------------------------------------

function renderEstadisticas() {
  renderEstadisticasAluviones();
  renderEstadisticasIncendios();
  renderEstadisticasSismos();
}

function renderTodo() {
  renderAluviones();
  renderIncendios();
  renderSismos();
}

function aplicarAjustesEnFormulario() {
  $("in-clave").value = estado.ajustes.firmsClave || "";
  $("in-fuente").value = estado.ajustes.firmsFuente;
  $("si-mag").value = String(estado.ajustes.magMin);
  $("si-solochile").checked = estado.ajustes.soloChile;
  renderAjustes();
}

estado.ubicaciones = leer(CLAVE_UBICACIONES, {});
aplicarUbicaciones();
estado.propios = leer(CLAVE_PROPIOS, []);
estado.importados = leer(CLAVE_IMPORTADOS, []);
estado.ajustes = { ...estado.ajustes, ...leer(CLAVE_AJUSTES, {}) };
aplicarAjustesEnFormulario();

// Al cambiar el tema del sistema se redibujan los colores de las capas.
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", renderTodo);

document.querySelector('[data-preset="todo"]').click();
