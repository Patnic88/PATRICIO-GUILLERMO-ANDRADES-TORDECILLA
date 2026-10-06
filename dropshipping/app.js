// Radar Dropshipping — interfaz para principiantes.
// Navegación por "#vista/id" (el botón Atrás del navegador funciona).
// Los productos se guardan en localStorage; el token de Meta y los ajustes, aparte.

const STORAGE_KEY = "radar_dropshipping_v1";
const AJUSTES_KEY = "radar_ajustes";
const TOKEN_KEY = "radar_meta_token";
const TOTAL_PASOS = 7;

let productos = [];
let ajustes = { moneda: "CLP", multiplicador: 2.8 };
let borrador = {};      // respuestas del asistente en curso
let paso = 1;
let modoEjemplo = false;

// ---- Opciones del asistente (valores = claves de Generadores) -------------

const PLATAFORMAS = [
  { v: "TikTok", e: "🎵" },
  { v: "Instagram Reels", t: "Instagram", e: "📸" },
  { v: "Facebook", e: "👍" },
  { v: "YouTube Shorts", t: "YouTube", e: "▶️" },
  { v: "Otro", e: "🌐" },
];

const ANUNCIO = [
  { v: "si", t: "Sí", e: "✅" },
  { v: "no", t: "No", e: "❌" },
  { v: "nose", t: "No me fijé", e: "🤷" },
];

const GANCHOS = [
  { v: "Problema / dolor", e: "😩", d: "Muestra un problema o molestia", ej: "«¿Cansado de los cables enredados?»" },
  { v: "Demostración directa", e: "👀", d: "Usa el producto desde el primer segundo", ej: "Manos usándolo de inmediato" },
  { v: "Antes / después", e: "🔄", d: "Muestra cómo era y cómo quedó", ej: "Una alfombra sucia y luego limpia" },
  { v: "Pregunta", e: "❓", d: "Empieza con una pregunta", ej: "«¿Sabías que…?»" },
  { v: "Curiosidad / sorpresa", e: "😲", d: "Algo inesperado que da curiosidad", ej: "«Nadie me creía que esto funcionara…»" },
  { v: "Prueba social", e: "⭐", d: "Opiniones o mucha gente usándolo", ej: "«Miles de personas ya lo usan»" },
  { v: "Oferta / precio", e: "🏷️", d: "Parte hablando del precio", ej: "«Lo encontré a mitad de precio»" },
];

const FORMATOS = [
  { v: "UGC (persona hablando a cámara)", t: "Persona hablando", e: "🤳", d: "Alguien lo recomienda mirando a la cámara" },
  { v: "Demostración del producto", t: "Demostración", e: "🖐", d: "Se ve el producto funcionando" },
  { v: "Antes / después", e: "🔄", d: "Comparan cómo era y cómo quedó" },
  { v: "Unboxing", t: "Abriendo la caja", e: "📦", d: "Muestran lo que llega en el paquete" },
  { v: "Comparación", e: "⚖️", d: "Este producto vs. la forma de siempre" },
  { v: "Tutorial / paso a paso", t: "Paso a paso", e: "🪜", d: "Enseñan a usarlo" },
  { v: "Slideshow de imágenes", t: "Fotos con texto", e: "🖼", d: "Imágenes con letras grandes" },
];

const OFERTAS = [
  { v: "Ninguna", t: "Nada especial", e: "➖" },
  { v: "Envío gratis", e: "🚚" },
  { v: "Descuento %", t: "Descuento", e: "💸" },
  { v: "2x1 / pack", t: "2x1 o pack", e: "👥" },
  { v: "Regalo incluido", e: "🎁" },
  { v: "Pago contra entrega", t: "Pagas al recibir", e: "💵" },
  { v: "Garantía de devolución", t: "Devolución garantizada", e: "🛡️" },
];

const SI_NO = [
  { v: "si", t: "Sí", e: "👍" },
  { v: "no", t: "No", e: "👎" },
  { v: "nose", t: "No sé", e: "🤷" },
];

const SEMAFORO = {
  "Ganador probable": { e: "🟢", clase: "verde", titulo: "¡Buen candidato!", texto: "Este producto muestra buenas señales. Vale la pena probarlo." },
  "Testear con poco presupuesto": { e: "🟡", clase: "amarillo", titulo: "Pruébalo con poco dinero", texto: "Tiene potencial, pero hay dudas. Si lo pruebas, invierte poco al comienzo." },
  "Descartar": { e: "⚪", clase: "gris", titulo: "Mejor busca otro", texto: "Hay pocas señales de que se venda bien. Es normal descartar muchos productos antes de encontrar uno bueno." },
  "No apto": { e: "🔴", clase: "rojo", titulo: "No lo vendas", texto: "Este producto podría traerte problemas legales o con la plataforma." },
};

const NUMERICOS = ["vistas", "likes", "comentarios", "compartidos", "diasPublicado", "diasActivo",
  "precioVenta", "costoProducto", "costoEnvio", "comentariosCompra"];

// Datos INVENTADOS para aprender a usar la app.
const EJEMPLO = {
  producto: "Ejemplo: organizador de cables", plataforma: "TikTok", ejemplo: true,
  vistas: 850000, likes: 62000, comentarios: 1400, compartidos: 9800, diasPublicado: 6,
  anuncioPagado: "si", diasActivo: 18, comentariosCompra: 6,
  tipoGancho: "Problema / dolor", formato: "Demostración del producto", oferta: "Envío gratis",
  precioVenta: 14990, costoProducto: 2800, costoEnvio: 2200, tiempoEnvio: "8 a 15 días hábiles",
  respuestas: { wow: "si", problema: "si", noLocal: "nose", tresSeg: "si", impulso: "si", envio: "si", sinMarca: "si", permitido: "si" },
  problema: "Los cables siempre se enredan detrás del escritorio",
  beneficioPrincipal: "Tener el escritorio ordenado en 5 minutos",
  beneficio1: "Se instala sin herramientas", beneficio2: "Sirve para varios cables", beneficio3: "Se ve limpio y ordenado",
  incluye: "1 organizador + clips adhesivos",
};

// ---- Utilidades ------------------------------------------------------------

const $ = (id) => document.getElementById(id);

function escapar(txt) {
  const d = document.createElement("div");
  d.textContent = txt ?? "";
  return d.innerHTML;
}

// Solo enlaces http(s): evita "javascript:" en copias importadas.
const urlSegura = (u) => (/^https?:\/\//i.test(u || "") ? u : "");

const leerNumero = Scoring.leerNumero;

function dinero(n) {
  try {
    return new Intl.NumberFormat("es-CL", { style: "currency", currency: ajustes.moneda,
      maximumFractionDigits: ajustes.moneda === "CLP" ? 0 : 2 }).format(n || 0);
  } catch (e) {
    return `${Math.round(n || 0)}`;
  }
}

const numero = (n) => Number(n || 0).toLocaleString("es-CL", { maximumFractionDigits: 1 });
const pct = (x) => `${Math.round((x || 0) * 100)} %`;

function fechaHaceDias(dias) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

function descargar(nombre, contenido, tipo) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = Object.assign(document.createElement("a"), { href: url, download: nombre });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

let toastTimer;
function aviso(texto) {
  const t = $("toast");
  t.textContent = texto;
  t.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("visible"), 2600);
}

function copiar(texto, boton) {
  const listo = () => { aviso("✔ Copiado. Ahora pégalo donde lo necesites."); if (boton) boton.textContent = "✔ Copiado"; };
  if (navigator.clipboard) navigator.clipboard.writeText(texto).then(listo, () => alert(texto));
  else alert(texto);
}

// ---- Persistencia ------------------------------------------------------------

function cargar() {
  try { productos = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch (e) { productos = []; }
  try { ajustes = { ...ajustes, ...JSON.parse(localStorage.getItem(AJUSTES_KEY)) }; } catch (e) { /* por defecto */ }
}

function guardar() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(productos)); }
  catch (e) { aviso("⚠ No se pudo guardar en este navegador."); }
}

function guardarAjustes() {
  try { localStorage.setItem(AJUSTES_KEY, JSON.stringify(ajustes)); } catch (e) { /* sin almacenamiento */ }
}

function puntuados() {
  return productos.map((g) => ({ g, p: Scoring.puntuar(g) })).sort((a, b) => b.p.total - a.p.total);
}

const buscar = (id) => productos.find((x) => x.id === id);

// ---- Navegación --------------------------------------------------------------

function router() {
  const [vista = "inicio", id, extra] = location.hash.slice(1).split("/");
  const vistas = ["inicio", "analizar", "resultado", "productos", "tienda", "tendencias"];
  const actual = vistas.includes(vista) ? vista : "inicio";

  document.querySelectorAll(".vista").forEach((v) => v.classList.toggle("oculto", v.id !== `v-${actual}`));
  const menuActivo = actual === "resultado" ? "productos" : actual;
  document.querySelectorAll("#menu a").forEach((a) => {
    const activo = a.dataset.vista === menuActivo;
    a.classList.toggle("activo", activo);
    if (activo) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });

  if (actual === "inicio") renderInicio();
  if (actual === "analizar") abrirAsistente(id, Number(extra) || 1);
  if (actual === "resultado") renderResultado(buscar(id));
  if (actual === "productos") renderProductos();
  if (actual === "tienda") renderTienda(id);
  if (actual === "tendencias") renderTendencias();

  window.scrollTo(0, 0);
  if (actual !== "analizar") $("contenido").focus({ preventScroll: true });
}

function ir(hash) {
  if (location.hash === hash) router(); else location.hash = hash;
}

// ---- Inicio --------------------------------------------------------------------

function renderInicio() {
  const n = productos.length;
  const buenos = puntuados().filter(({ p }) => p.veredicto === "Ganador probable").length;
  $("resumenProductos").textContent = n
    ? `${n} analizado${n === 1 ? "" : "s"} · ${buenos} 🟢`
    : "Aún no analizas ninguno";
}

// ---- Asistente -----------------------------------------------------------------

function tarjetas(grupo, opciones, nombre = grupo) {
  return opciones.map((o) => `
    <label class="opcion">
      <input type="radio" name="${nombre}" value="${escapar(o.v)}" />
      <span class="opcion-cuerpo">
        <span class="emoji" aria-hidden="true">${o.e}</span>
        <b>${escapar(o.t || o.v)}</b>
        ${o.d ? `<small>${escapar(o.d)}</small>` : ""}
        ${o.ej ? `<small class="ej">${escapar(o.ej)}</small>` : ""}
      </span>
    </label>`).join("");
}

function prepararAsistente() {
  const grupos = { plataforma: PLATAFORMAS, anuncioPagado: ANUNCIO, tipoGancho: GANCHOS, formato: FORMATOS, oferta: OFERTAS };
  document.querySelectorAll("[data-grupo]").forEach((el) => {
    el.innerHTML = tarjetas(el.dataset.grupo, grupos[el.dataset.grupo]);
  });
  $("preguntasCriterios").innerHTML = Scoring.CRITERIOS.map((c) => `
    <div class="criterio ${c.bloqueante ? "importante" : ""}" role="group" aria-label="${escapar(c.pregunta)}">
      <p class="pregunta">${c.bloqueante ? '<span class="etiqueta-imp">Importante</span> ' : ""}${escapar(c.pregunta)}</p>
      <small>${escapar(c.ayuda)}</small>
      <div class="tarjetas-opcion compactas">${tarjetas(c.id, SI_NO, `crit_${c.id}`)}</div>
    </div>`).join("");
}

function leerFormulario() {
  const form = $("asistente");
  const datos = Object.fromEntries(new FormData(form).entries());
  NUMERICOS.forEach((k) => { if (k in datos) datos[k] = leerNumero(datos[k]); });

  const respuestas = {};
  const criterios = {};
  Scoring.CRITERIOS.forEach((c) => {
    const v = datos[`crit_${c.id}`];
    delete datos[`crit_${c.id}`];
    if (v) respuestas[c.id] = v;
    criterios[c.id] = v === "si";
  });
  datos.respuestas = respuestas;
  datos.criterios = criterios;
  datos.muestraComentarios = 20;
  if (datos.anuncioPagado !== "si") datos.diasActivo = "";
  datos.fechaPublicacion = datos.diasPublicado ? fechaHaceDias(datos.diasPublicado) : "";
  return datos;
}

function llenarFormulario(g) {
  const form = $("asistente");
  form.reset();
  const datos = { ...g };
  if (!datos.diasPublicado && datos.fechaPublicacion) datos.diasPublicado = Scoring.diasDesde(datos.fechaPublicacion);
  const respuestas = datos.respuestas ||
    Object.fromEntries(Object.entries(datos.criterios || {}).filter(([, v]) => v).map(([k]) => [k, "si"]));
  Scoring.CRITERIOS.forEach((c) => { if (respuestas[c.id]) datos[`crit_${c.id}`] = respuestas[c.id]; });

  Object.entries(datos).forEach(([k, v]) => {
    const el = form.elements[k];
    if (!el || v === null || typeof v === "object") return;
    el.value = typeof v === "number" && el.inputMode !== "numeric" && el.type !== "range" ? numero(v) : v;
  });
  actualizarDependientes();
}

function actualizarDependientes() {
  const form = $("asistente");
  $("campoDiasActivo").classList.toggle("oculto", form.elements.anuncioPagado.value !== "si");
  $("valorIntencion").textContent = `${form.elements.comentariosCompra.value} de 20`;
  form.querySelectorAll(".chips button").forEach((b) => {
    b.classList.toggle("activo", b.dataset.valor === String(form.elements.diasPublicado.value));
  });
  actualizarCalculo();
}

function actualizarCalculo() {
  const form = $("asistente");
  const precio = leerNumero(form.elements.precioVenta.value) || 0;
  const costo = (leerNumero(form.elements.costoProducto.value) || 0) + (leerNumero(form.elements.costoEnvio.value) || 0);
  const caja = $("calculoGanancia");
  if (!precio || !costo) {
    caja.className = "calculo";
    caja.innerHTML = "Completa los precios y te diremos cuánto ganarías por venta.";
    return;
  }
  const ganancia = precio - costo;
  const margen = ganancia / precio;
  caja.className = `calculo ${margen >= 0.5 ? "bueno" : margen >= 0.3 ? "medio" : "malo"}`;
  caja.innerHTML = ganancia > 0
    ? `Por cada venta te quedarían <b>${dinero(ganancia)}</b> (${pct(margen)} del precio), antes de pagar publicidad.
       ${margen < 0.3 ? "<br>⚠ Es poco: la publicidad podría llevarse toda tu ganancia." : ""}`
    : `⚠ Con estos precios <b>perderías ${dinero(-ganancia)}</b> por venta.`;
}

function abrirAsistente(id, pasoInicial) {
  if (id && borrador.id !== id) {
    const g = buscar(id);
    if (!g) return ir("#analizar");
    borrador = { ...g };
    modoEjemplo = !!g.ejemplo;
    llenarFormulario(borrador);
  } else if (!id && borrador.id) {
    nuevoAnalisis(false);
  }
  $("avisoEjemplo").classList.toggle("oculto", !modoEjemplo);
  mostrarPaso(id ? pasoInicial : paso);
}

function nuevoAnalisis(navegar = true) {
  borrador = {};
  modoEjemplo = false;
  paso = 1;
  $("asistente").reset();
  $("asistente").elements.id.value = "";
  actualizarDependientes();
  if (navegar) ir("#analizar");
}

function mostrarPaso(n) {
  paso = Math.min(Math.max(1, n), TOTAL_PASOS);
  document.querySelectorAll(".paso").forEach((f) => f.classList.toggle("oculto", Number(f.dataset.paso) !== paso));
  $("barraProgreso").style.width = `${(paso / TOTAL_PASOS) * 100}%`;
  $("pasoIndicador").textContent = `Paso ${paso} de ${TOTAL_PASOS}`;
  $("btnAtras").textContent = paso === 1 ? "← Volver al inicio" : "← Atrás";
  $("btnSiguiente").textContent = paso === TOTAL_PASOS ? "Ver resultado ✓" : "Siguiente →";
  window.scrollTo(0, 0);
  const titulo = document.querySelector(`.paso[data-paso="${paso}"] h2`);
  if (titulo) { titulo.tabIndex = -1; titulo.focus({ preventScroll: true }); }
}

function validarPaso() {
  if (paso !== 1) return true;
  const campo = $("asistente").elements.producto;
  const ok = campo.value.trim().length > 0;
  $("errProducto").classList.toggle("oculto", ok);
  campo.setAttribute("aria-invalid", ok ? "false" : "true");
  if (!ok) campo.focus();
  return ok;
}

function onSiguiente() {
  if (!validarPaso()) return;
  if (paso < TOTAL_PASOS) return mostrarPaso(paso + 1);

  const datos = leerFormulario();
  const g = { ...borrador, ...datos, id: borrador.id || `g-${Date.now()}`, ejemplo: modoEjemplo || undefined };
  const i = productos.findIndex((x) => x.id === g.id);
  if (i >= 0) productos[i] = g; else productos.push(g);
  guardar();
  nuevoAnalisis(false);
  aviso("✔ Producto guardado");
  ir(`#resultado/${g.id}`);
}

function onAtras() {
  if (paso === 1) ir("#inicio"); else mostrarPaso(paso - 1);
}

function cargarEjemplo() {
  borrador = {};
  paso = 1;
  modoEjemplo = true;
  llenarFormulario(EJEMPLO);
  ir("#analizar");
}

// ---- Resultado -----------------------------------------------------------------

function razones(g, p) {
  const m = p.metricas;
  const r = [];
  const resp = g.respuestas || {};

  if (!m.vistas) r.push({ ok: null, t: "No anotaste las vistas, así que no pudimos medir el interés del público." });
  else if (p.desglose.demanda >= 20) r.push({ ok: true, t: `Mucha gente reaccionó: ${numero(m.vistas)} vistas y ${pct(m.engagement)} interactuó.` });
  else if (p.desglose.demanda >= 12) r.push({ ok: null, t: `Reacción moderada: ${numero(m.vistas)} vistas.` });
  else r.push({ ok: false, t: "Poca reacción del público en comparación con las vistas." });

  const ganancia = m.precio - m.costoTotal;
  if (!m.precio || !m.costoTotal) r.push({ ok: null, t: "Faltan precios para calcular tu ganancia." });
  else if (ganancia <= 0) r.push({ ok: false, t: `Con esos precios perderías ${dinero(-ganancia)} por venta.` });
  else if (m.margen >= 0.5) r.push({ ok: true, t: `Buena ganancia: te quedarían ${dinero(ganancia)} por venta (${pct(m.margen)}).` });
  else if (m.margen >= 0.3) r.push({ ok: null, t: `Ganancia justa: ${dinero(ganancia)} por venta. La publicidad podría llevársela.` });
  else r.push({ ok: false, t: `Ganancia baja: ${dinero(ganancia)} por venta.` });

  const dias = Number(g.diasActivo) || 0;
  const pide = Number(g.comentariosCompra) || 0;
  if (dias >= 14) r.push({ ok: true, t: `Alguien paga publicidad hace ${dias} días: probablemente le está funcionando.` });
  else if (pide >= 3) r.push({ ok: true, t: `${pide} de cada 20 comentarios preguntan cómo comprarlo.` });
  else if (dias || pide) r.push({ ok: null, t: "Hay algunas señales de venta, pero son débiles." });
  else r.push({ ok: false, t: "No vimos señales claras de que se esté vendiendo." });

  const cumplidos = Scoring.CRITERIOS.filter((c) => (g.criterios || {})[c.id]).length;
  r.push({ ok: cumplidos >= 6 ? true : cumplidos >= 4 ? null : false,
    t: `Cumple ${cumplidos} de ${Scoring.CRITERIOS.length} características de un buen producto.` });

  const dudas = Scoring.CRITERIOS.filter((c) => resp[c.id] === "nose");
  return { lista: r, dudas };
}

function renderResultado(g) {
  if (!g) return ir("#productos");
  const p = Scoring.puntuar(g);
  const s = SEMAFORO[p.veredicto];
  const { lista, dudas } = razones(g, p);
  const icono = (ok) => (ok === true ? "✅" : ok === false ? "❌" : "➖");
  const bloqueos = Scoring.CRITERIOS.filter((c) => c.bloqueante && !(g.criterios || {})[c.id]);

  $("resultado").innerHTML = `
    ${g.ejemplo ? '<p class="aviso-ejemplo">🎓 Este es un <b>ejemplo con datos inventados</b>.</p>' : ""}
    <div class="semaforo ${s.clase}">
      <div class="luz" aria-hidden="true">${s.e}</div>
      <p class="producto-nombre">${escapar(g.producto)}</p>
      <h1>${s.titulo}</h1>
      <p>${s.texto}</p>
    </div>

    ${bloqueos.length ? `<div class="alerta" role="alert"><b>Por qué no venderlo:</b><ul>${bloqueos.map((c) =>
      `<li>${(g.respuestas || {})[c.id] === "nose" ? "No sabes si cumple esto: " : "No cumple: "}${escapar(c.pregunta)}</li>`).join("")}</ul>
      Si lo averiguas y la respuesta es "Sí", corrige tus respuestas.</div>` : ""}

    <div class="tarjeta-blanca">
      <h2>¿Por qué este resultado?</h2>
      <ul class="razones">${lista.map((x) => `<li><span aria-hidden="true">${icono(x.ok)}</span> ${escapar(x.t)}</li>`).join("")}</ul>
      ${dudas.length ? `<p class="nota">💡 Respondiste "No sé" en: ${dudas.map((c) => escapar(c.pregunta)).join(" · ")}
        Averiguarlo puede mejorar (o empeorar) el resultado.</p>` : ""}
      <details class="donde">
        <summary>Ver puntaje detallado (${p.total} de 100)</summary>
        <p>Interés del público ${p.desglose.demanda}/30 · Ganancia ${p.desglose.margen}/25 ·
          Señales de venta ${p.desglose.prueba}/15 · Características ${p.desglose.checklist}/30.</p>
        <p class="nota">Es una guía basada en criterios habituales del rubro, no una garantía de ventas.</p>
      </details>
    </div>

    <div class="fila-botones grande">
      ${bloqueos.length ? "" : `<a class="btn-prim" href="#tienda/${g.id}">🛒 Llevar a mi tienda</a>`}
      <a class="btn-sec" href="#analizar/${g.id}">✏ Corregir respuestas</a>
      <button class="btn-sec" data-accion="nuevo">🔍 Analizar otro producto</button>
    </div>`;
}

// ---- Mis productos -------------------------------------------------------------

function renderProductos() {
  const items = puntuados();
  if (!items.length) {
    $("listaProductos").innerHTML = `
      <li class="vacio">
        <p>Todavía no analizas ningún producto.</p>
        <button class="btn-prim" data-accion="nuevo">🔍 Analizar mi primer producto</button>
        <button class="btn-sec" data-accion="ejemplo">🎓 Ver un ejemplo</button>
      </li>`;
    return;
  }
  $("listaProductos").innerHTML = items.map(({ g, p }) => {
    const s = SEMAFORO[p.veredicto];
    const enlace = urlSegura(g.enlace);
    return `
      <li class="producto ${s.clase}">
        <a class="producto-principal" href="#resultado/${g.id}">
          <span class="luz-chica" aria-hidden="true">${s.e}</span>
          <span>
            <b>${escapar(g.producto)}</b>${g.ejemplo ? ' <span class="etiqueta">Ejemplo</span>' : ""}
            <small>${s.titulo} · visto en ${escapar(g.plataforma || "—")}</small>
          </span>
        </a>
        <div class="producto-acciones">
          ${p.bloqueos.length ? "" : `<a href="#tienda/${g.id}">🛒 Mi tienda</a>`}
          ${enlace ? `<a href="${escapar(enlace)}" target="_blank" rel="noopener">▶ Ver video</a>` : ""}
          <a href="#analizar/${g.id}">✏ Corregir</a>
          <button class="btn-link peligro" data-borrar="${g.id}">🗑 Borrar</button>
        </div>
      </li>`;
  }).join("");
}

function onBorrar(e) {
  const btn = e.target.closest("[data-borrar]");
  if (!btn) return;
  const g = buscar(btn.dataset.borrar);
  if (g && confirm(`¿Seguro que quieres borrar "${g.producto}"? No se puede deshacer.`)) {
    productos = productos.filter((x) => x.id !== g.id);
    guardar();
    aviso("Producto borrado");
    renderProductos();
  }
}

// ---- Mi tienda -----------------------------------------------------------------

function renderTienda(id) {
  const items = puntuados();
  const sel = $("selProducto");
  if (!items.length) {
    sel.parentElement.classList.add("oculto");
    $("tienda").innerHTML = `<div class="vacio"><p>Primero analiza un producto para saber si vale la pena venderlo.</p>
      <button class="btn-prim" data-accion="nuevo">🔍 Analizar un producto</button></div>`;
    return;
  }
  sel.parentElement.classList.remove("oculto");
  sel.innerHTML = items.map(({ g, p }) =>
    `<option value="${g.id}">${SEMAFORO[p.veredicto].e} ${escapar(g.producto)}</option>`).join("");
  const elegido = buscar(id) ? id : (items.find(({ p }) => !p.bloqueos.length) || items[0]).g.id;
  sel.value = elegido;

  const g = buscar(elegido);
  const p = Scoring.puntuar(g);
  if (p.bloqueos.length) {
    $("tienda").innerHTML = `<div class="alerta" role="alert">🔴 <b>No recomendamos vender este producto.</b>
      Revisa por qué en su resultado.<div class="fila-botones">
      <a class="btn-sec" href="#resultado/${g.id}">Ver por qué</a></div></div>`;
    return;
  }

  const opciones = { moneda: ajustes.moneda, multiplicador: ajustes.multiplicador };
  const f = Generadores.ficha(g, opciones);
  const m = p.metricas;
  const ganancia = f.precio - m.costoTotal;
  const faltanTextos = /\[/.test(f.descripcionHtml);
  const textoClaude = JSON.stringify(Generadores.jsonShopify(f), null, 2);

  $("tienda").innerHTML = `
    <section class="etapa">
      <h2><span class="num">1</span> Tu precio de venta</h2>
      ${m.costoTotal ? `
        <p class="precio-grande">${dinero(f.precio)}</p>
        <p>Te cuesta <b>${dinero(m.costoTotal)}</b> (producto + envío). Ganarías <b>${dinero(ganancia)}</b> por venta, antes de publicidad.
          ${m.precio ? `<br><span class="nota">En el video lo venden a ${dinero(m.precio)}.</span>` : ""}</p>
        <label class="campo">¿Cuánto quieres cobrar? <span class="nota">(${String(ajustes.multiplicador).replace(".", ",")} veces lo que te cuesta)</span>
          <input type="range" id="rangoMult" min="2" max="4" step="0.1" value="${ajustes.multiplicador}" />
          <span class="rango-etiquetas"><span>Más barato, vende más</span><span>Más ganancia por venta</span></span>
        </label>`
      : `<p class="alerta">Falta el costo del proveedor para calcular tu precio. <a href="#analizar/${g.id}/5">Complétalo aquí</a>.</p>`}
      <label class="campo campo-corto">Moneda de tu tienda
        <select id="selMoneda">${["CLP", "USD", "EUR", "MXN", "PEN", "COP", "ARS"].map((c) =>
          `<option ${c === ajustes.moneda ? "selected" : ""}>${c}</option>`).join("")}</select>
      </label>
    </section>

    <section class="etapa">
      <h2><span class="num">2</span> Así se verá tu página de producto</h2>
      <div class="vista-tienda">
        <div class="foto" aria-hidden="true">📷<small>Aquí van tus fotos</small></div>
        <div>
          <h3>${escapar(f.titulo)}</h3>
          <p class="precio">${dinero(f.precio)}</p>
          <div class="descripcion">${f.descripcionHtml}</div>
        </div>
      </div>
      ${faltanTextos ? `<p class="nota">Lo que está entre [corchetes] falta por completar.
        <a href="#analizar/${g.id}/7">Completar textos</a></p>` : ""}
    </section>

    <section class="etapa">
      <h2><span class="num">3</span> Graba tu video</h2>
      <p>📱 <b>Cómo grabarlo:</b> ${escapar(Generadores.comoGrabar(g))}</p>
      <ol class="linea-tiempo">${Generadores.guionPasos(g).map((x) => `
        <li><span class="tiempo">${x.tiempo}</span><b>${escapar(x.titulo)}</b><p>${escapar(x.texto)}</p></li>`).join("")}
      </ol>
      <p class="nota">⚠ Graba tu propio video y usa tus palabras. Copiar el video, la música o el texto de otra persona está prohibido.</p>
      <button class="btn-sec" id="btnCopiarGuion">📋 Copiar guion</button>
    </section>

    <section class="etapa">
      <h2><span class="num">4</span> Súbelo a tu tienda Shopify</h2>
      <div class="dos-opciones">
        <div class="opcion-subida">
          <h3>📄 Opción A: con un archivo <span class="etiqueta">Recomendado</span></h3>
          <button class="btn-prim" id="btnCSV">⬇ Descargar archivo para Shopify</button>
          <ol>
            <li>Entra al panel de tu tienda Shopify.</li>
            <li>Ve a <b>Productos</b> y pulsa <b>Importar</b>.</li>
            <li>Elige el archivo que descargaste y confirma.</li>
            <li>El producto queda como <b>borrador</b> (tus clientes aún no lo ven). Agrega tus fotos y publícalo.</li>
          </ol>
        </div>
        <div class="opcion-subida">
          <h3>🤖 Opción B: pídeselo a Claude</h3>
          <p>Si usas Claude con tu tienda Shopify conectada, copia este texto y pégalo en el chat.</p>
          <button class="btn-sec" id="btnCopiarClaude">📋 Copiar texto para Claude</button>
          <details class="donde"><summary>Ver el texto</summary><pre>${escapar(textoClaude)}</pre></details>
        </div>
      </div>
    </section>

    <section class="etapa">
      <h2><span class="num">5</span> Antes de publicar</h2>
      <ul class="lista-chequeo">
        ${["Pide una muestra al proveedor y revisa la calidad y cuánto tarda en llegar.",
          "Toma tus propias fotos y graba tu propio video.",
          "Escribe en tu tienda cuánto tarda el envío y cómo funcionan los cambios y devoluciones.",
          "Empieza con poca publicidad (3 a 5 días) y revisa si lo que gastas por venta es menor que tu ganancia."]
          .map((t, i) => `<li><label><input type="checkbox" id="chk${i}" /> ${t}</label></li>`).join("")}
      </ul>
    </section>`;

  const rango = $("rangoMult");
  if (rango) rango.addEventListener("change", () => { ajustes.multiplicador = Number(rango.value); guardarAjustes(); renderTienda(g.id); });
  $("selMoneda").addEventListener("change", (e) => { ajustes.moneda = e.target.value; guardarAjustes(); renderTienda(g.id); });
  $("btnCopiarGuion").addEventListener("click", (e) => copiar(Generadores.guion(g), e.currentTarget));
  $("btnCopiarClaude").addEventListener("click", (e) => copiar(textoClaude, e.currentTarget));
  $("btnCSV").addEventListener("click", () => {
    descargar(`shopify_${f.handle}.csv`, Generadores.csvShopify([f]), "text/csv;charset=utf-8");
    aviso("⬇ Archivo descargado. Ahora súbelo en Shopify → Productos → Importar.");
  });
}

// ---- Tendencias ----------------------------------------------------------------

function renderTendencias() {
  const top = puntuados()
    .filter(({ p }) => p.veredicto === "Ganador probable" || p.veredicto === "Testear con poco presupuesto")
    .map(({ g }) => g);
  if (!top.length) {
    $("tendencias").innerHTML = `<div class="vacio"><p>Cuando tengas productos 🟢 o 🟡, aquí verás qué tienen en común.
      Así sabrás qué buscar y cómo hacer tus videos.</p>
      <button class="btn-prim" data-accion="nuevo">🔍 Analizar un producto</button></div>`;
    return;
  }
  const todas = [...PLATAFORMAS, ...GANCHOS, ...FORMATOS, ...OFERTAS];
  const etiqueta = (v) => { const o = todas.find((x) => x.v === v); return o ? `${o.e} ${o.t || o.v}` : v; };

  const bloque = (titulo, campo) => {
    const filas = Scoring.frecuencias(top, campo).slice(0, 4);
    if (!filas.length) return "";
    return `<div class="tarjeta-blanca">
      <h2>${titulo}</h2>
      <p class="destacado">${escapar(etiqueta(filas[0].valor))} <small>(en ${filas[0].n} de ${top.length})</small></p>
      ${filas.map((f) => `<div class="barra"><span>${escapar(etiqueta(f.valor))}</span>
        <div class="pista"><div class="relleno" style="width:${Math.round(f.pct * 100)}%"></div></div><b>${f.n}</b></div>`).join("")}
    </div>`;
  };
  const metr = top.map((g) => Scoring.metricas(g));
  const medPrecio = Scoring.mediana(metr.map((m) => m.precio));
  const medGanancia = Scoring.mediana(metr.map((m) => m.precio - m.costoTotal));
  const medMult = Scoring.mediana(metr.map((m) => m.multiplicador));

  $("tendencias").innerHTML = `
    ${top.length < 3 ? `<p class="aviso-ejemplo">Llevas ${top.length} producto${top.length === 1 ? "" : "s"} bueno${top.length === 1 ? "" : "s"}.
      Con al menos 3 las tendencias serán más confiables.</p>` : ""}
    <div class="tarjeta-blanca">
      <h2>💰 Los números de tus mejores productos</h2>
      <p>Precio de venta habitual: <b>${medPrecio ? dinero(medPrecio) : "—"}</b></p>
      <p>Ganancia habitual por venta: <b>${medGanancia ? dinero(medGanancia) : "—"}</b></p>
      <p>Se venden a unas <b>${medMult ? medMult.toFixed(1).replace(".", ",") : "—"} veces</b> lo que cuestan.</p>
    </div>
    <div class="grilla-tendencias">
      ${bloque("🎬 Cómo empiezan los videos", "tipoGancho")}
      ${bloque("📹 Tipo de video", "formato")}
      ${bloque("🎁 Qué ofrecen", "oferta")}
      ${bloque("📱 Dónde los encontraste", "plataforma")}
    </div>
    <p class="nota">Usa esto como pista: busca productos y graba videos con la misma fórmula, pero con tu propio contenido.</p>`;
}

// ---- Herramientas avanzadas ------------------------------------------------------

let resultadosMeta = [];

async function onBuscarMeta() {
  const token = $("metaToken").value.trim();
  try { localStorage.setItem(TOKEN_KEY, token); } catch (e) { /* sin almacenamiento */ }
  $("metaError").classList.add("oculto");
  $("metaResultados").innerHTML = `<li class="nota">Buscando…</li>`;
  try {
    resultadosMeta = await MetaAPI.buscar({
      token,
      terminos: $("metaTerminos").value.trim(),
      pais: $("metaPais").value.trim() || "ES",
      version: $("metaVersion").value.trim() || "v25.0",
    });
    resultadosMeta.sort((a, b) => b.diasActivo - a.diasActivo);
    $("metaResultados").innerHTML = resultadosMeta.length ? resultadosMeta.map((a, i) => `
      <li class="producto">
        <div class="producto-principal">
          <span class="luz-chica" aria-hidden="true">${a.diasActivo >= 30 ? "🟢" : a.diasActivo >= 7 ? "🟡" : "⚪"}</span>
          <span><b>${escapar(a.pagina)}</b><small>Activo hace ${a.diasActivo} días · ${escapar(a.plataformas)}</small>
            <small>${escapar(`${a.titulo} ${a.texto}`.slice(0, 200))}</small></span>
        </div>
        <div class="producto-acciones">
          <a href="${escapar(a.enlace)}" target="_blank" rel="noopener">▶ Ver anuncio</a>
          <button class="btn-link" data-importar="${i}">🔍 Analizar este</button>
        </div>
      </li>`).join("") : `<li class="nota">Sin resultados.</li>`;
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
  borrador = {};
  paso = 1;
  modoEjemplo = false;
  llenarFormulario({
    producto: a.titulo || a.pagina, plataforma: "Facebook", enlace: a.enlace,
    diasPublicado: a.diasActivo, anuncioPagado: "si", diasActivo: a.diasActivo,
  });
  ir("#analizar");
}

function onExportar() {
  descargar(`radar_dropshipping_${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(productos, null, 2), "application/json");
  aviso("⬇ Copia descargada. Guárdala en un lugar seguro.");
}

function onImportar(e) {
  const archivo = e.target.files[0];
  if (!archivo) return;
  archivo.text().then((txt) => {
    try {
      const datos = JSON.parse(txt);
      if (!Array.isArray(datos)) throw new Error("formato");
      if (productos.length && !confirm("Esto reemplazará tus productos actuales por los de la copia. ¿Continuar?")) return;
      productos = datos;
      guardar();
      aviso(`✔ ${datos.length} productos recuperados`);
      renderInicio();
    } catch (err) {
      alert("Ese archivo no es una copia válida del Radar.");
    }
  });
  e.target.value = "";
}

function onCSVTodos() {
  const opciones = { moneda: ajustes.moneda, multiplicador: ajustes.multiplicador };
  const aptos = puntuados().filter(({ p }) => !p.bloqueos.length).map(({ g }) => Generadores.ficha(g, opciones));
  if (!aptos.length) return aviso("No hay productos aptos para exportar.");
  descargar("productos_shopify.csv", Generadores.csvShopify(aptos), "text/csv;charset=utf-8");
}

// ---- Inicio de la app ------------------------------------------------------------

function iniciar() {
  cargar();
  prepararAsistente();
  try { $("metaToken").value = localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { /* sin almacenamiento */ }

  const form = $("asistente");
  form.addEventListener("input", actualizarDependientes);
  form.addEventListener("change", actualizarDependientes);
  form.addEventListener("submit", (e) => e.preventDefault());
  form.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target.type !== "radio") { e.preventDefault(); onSiguiente(); }
  });
  form.querySelectorAll(".chips button").forEach((b) => b.addEventListener("click", () => {
    form.elements.diasPublicado.value = b.dataset.valor;
    actualizarDependientes();
  }));
  $("btnSiguiente").addEventListener("click", onSiguiente);
  $("btnAtras").addEventListener("click", onAtras);

  // Botones con data-accion repartidos por varias vistas.
  document.addEventListener("click", (e) => {
    const accion = e.target.closest("[data-accion]");
    if (accion?.dataset.accion === "nuevo") nuevoAnalisis();
    if (accion?.dataset.accion === "ejemplo") cargarEjemplo();
  });
  $("btnEjemplo").addEventListener("click", cargarEjemplo);
  $("btnEmpezar").addEventListener("click", (e) => {
    if (borrador.id || modoEjemplo) { e.preventDefault(); nuevoAnalisis(); }
  });
  $("listaProductos").addEventListener("click", onBorrar);
  $("selProducto").addEventListener("change", (e) => ir(`#tienda/${e.target.value}`));

  $("btnAyuda").addEventListener("click", () => $("dlgAyuda").showModal());
  $("btnMeta").addEventListener("click", onBuscarMeta);
  $("metaResultados").addEventListener("click", onImportarMeta);
  $("btnExportar").addEventListener("click", onExportar);
  $("inputImportar").addEventListener("change", onImportar);
  $("btnCSVTodos").addEventListener("click", onCSVTodos);

  window.addEventListener("hashchange", router);
  actualizarDependientes();
  router();
}

document.addEventListener("DOMContentLoaded", iniciar);
