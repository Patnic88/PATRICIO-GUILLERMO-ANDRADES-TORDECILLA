// Lista de tareas conectada a los correos de Gmail.
// Las tareas iniciales vienen de tasks.seed.js (extraídas de tus correos).
// El estado (completadas, nuevas, eliminadas) se guarda en localStorage.

const STORAGE_KEY = "tareas_patricio_v1";
const GMAIL_BASE = "https://mail.google.com/mail/u/0/#all/";
const WHATSAPP_NUM_KEY = "tareas_patricio_whatsapp";

let tareas = [];
let filtroActual = "todas";

// ---- Persistencia --------------------------------------------------------

function cargar() {
  const guardado = localStorage.getItem(STORAGE_KEY);
  if (guardado) {
    try {
      tareas = JSON.parse(guardado);
      return;
    } catch (e) {
      console.warn("No se pudo leer el almacenamiento, usando tareas de los correos.");
    }
  }
  tareas = clonarSemilla();
}

function guardar() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tareas));
}

function clonarSemilla() {
  return (window.SEED_TASKS || []).map((t) => ({ ...t }));
}

// ---- WhatsApp ------------------------------------------------------------
// Compartir tareas por WhatsApp sin servidor: armamos el texto y abrimos el
// enlace oficial "click to chat". Si hay un número guardado (config.js o
// localStorage) el mensaje va directo a ese chat; si no, WhatsApp deja elegir
// el contacto.

function numeroWhatsApp() {
  const guardado = localStorage.getItem(WHATSAPP_NUM_KEY);
  const num = (guardado ?? window.WHATSAPP_NUMERO ?? "").replace(/[^0-9]/g, "");
  return num;
}

function urlWhatsApp(texto) {
  const num = numeroWhatsApp();
  const t = encodeURIComponent(texto);
  return num
    ? `https://wa.me/${num}?text=${t}`
    : `https://api.whatsapp.com/send?text=${t}`;
}

function abrirWhatsApp(texto) {
  window.open(urlWhatsApp(texto), "_blank", "noopener");
}

function fechaCorta(vence) {
  if (!vence) return "";
  const f = new Date(vence + "T00:00:00");
  return f.toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
}

function textoTarea(t) {
  const lineas = [`📋 *${t.titulo}*`];
  const meta = [t.categoria, `prioridad ${t.prioridad}`].filter(Boolean).join(" · ");
  if (meta) lineas.push(meta);
  if (t.vence) lineas.push(`📅 vence ${fechaCorta(t.vence)}`);
  if (t.detalle) lineas.push(t.detalle);
  if (t.threadId) lineas.push(`🔗 ${GMAIL_BASE}${t.threadId}`);
  return lineas.join("\n");
}

function textoPendientes(lista) {
  const pend = lista.filter((t) => !t.hecha);
  if (!pend.length) return "✅ No tengo tareas pendientes.";
  const peso = { alta: 0, media: 1, baja: 2 };
  const orden = [...pend].sort((a, b) => (peso[a.prioridad] ?? 3) - (peso[b.prioridad] ?? 3));
  const items = orden.map((t, i) => {
    const vence = t.vence ? ` (vence ${fechaCorta(t.vence)})` : "";
    return `${i + 1}. ${t.titulo} — ${t.prioridad}${vence}`;
  });
  const titulo = pend.length === 1 ? "📋 Tengo 1 tarea pendiente:" : `📋 Tengo ${pend.length} tareas pendientes:`;
  return [titulo, "", ...items].join("\n");
}

// ---- Lógica de filtros ---------------------------------------------------

function filtrar(lista) {
  switch (filtroActual) {
    case "pendientes": return lista.filter((t) => !t.hecha);
    case "completadas": return lista.filter((t) => t.hecha);
    case "alta": return lista.filter((t) => t.prioridad === "alta" && !t.hecha);
    default: return lista;
  }
}

function ordenar(lista) {
  const peso = { alta: 0, media: 1, baja: 2 };
  return [...lista].sort((a, b) => {
    if (a.hecha !== b.hecha) return a.hecha ? 1 : -1;
    return (peso[a.prioridad] ?? 3) - (peso[b.prioridad] ?? 3);
  });
}

// ---- Render --------------------------------------------------------------

function escapar(txt) {
  const d = document.createElement("div");
  d.textContent = txt ?? "";
  return d.innerHTML;
}

function venceBadge(vence) {
  if (!vence) return "";
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(vence + "T00:00:00");
  const vencida = fecha < hoy;
  const fmt = fecha.toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
  return `<span class="badge vence ${vencida ? "vencida" : ""}">📅 ${vencida ? "venció " : "vence "}${fmt}</span>`;
}

function render() {
  const ul = document.getElementById("lista");
  const visibles = ordenar(filtrar(tareas));

  ul.innerHTML = visibles.map((t) => {
    const link = t.threadId
      ? `<a class="gmail-link" href="${GMAIL_BASE}${escapar(t.threadId)}" target="_blank" rel="noopener">🔗 Ver correo</a>`
      : "";
    const wa = `<button type="button" class="wa-link" title="Compartir por WhatsApp">💬 WhatsApp</button>`;
    const detalle = t.detalle ? `<div class="detalle">${escapar(t.detalle)}</div>` : "";
    const de = t.de ? `<span class="badge cat">${escapar(t.de)}</span>` : "";
    return `
      <li class="tarea prio-${t.prioridad} ${t.hecha ? "hecha" : ""}" data-id="${escapar(t.id)}">
        <input type="checkbox" class="check" ${t.hecha ? "checked" : ""} aria-label="Completar tarea" />
        <div class="tarea-cuerpo">
          <div class="titulo">${escapar(t.titulo)}</div>
          ${detalle}
          <div class="tarea-meta">
            <span class="badge cat">${escapar(t.categoria)}</span>
            <span class="badge prio-${t.prioridad}">${t.prioridad}</span>
            ${venceBadge(t.vence)}
            ${de}
            ${link}
            ${wa}
          </div>
        </div>
        <button class="btn-del" aria-label="Eliminar tarea" title="Eliminar">✕</button>
      </li>`;
  }).join("");

  const pendientes = tareas.filter((t) => !t.hecha).length;
  document.getElementById("counter").textContent =
    pendientes === 1 ? "1 pendiente" : `${pendientes} pendientes`;
  document.getElementById("vacio").classList.toggle("oculto", visibles.length > 0);
}

// ---- Eventos -------------------------------------------------------------

function porId(id) { return tareas.find((t) => t.id === id); }

document.getElementById("lista").addEventListener("click", (e) => {
  const li = e.target.closest(".tarea");
  if (!li) return;
  const tarea = porId(li.dataset.id);
  if (!tarea) return;

  if (e.target.classList.contains("check")) {
    tarea.hecha = e.target.checked;
    guardar();
    render();
  } else if (e.target.classList.contains("wa-link")) {
    abrirWhatsApp(textoTarea(tarea));
  } else if (e.target.classList.contains("btn-del")) {
    if (confirm("¿Eliminar esta tarea?")) {
      tareas = tareas.filter((t) => t.id !== tarea.id);
      guardar();
      render();
    }
  }
});

document.getElementById("filters").addEventListener("click", (e) => {
  if (!e.target.classList.contains("chip")) return;
  document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
  e.target.classList.add("active");
  filtroActual = e.target.dataset.filter;
  render();
});

// Formulario de nueva tarea
const form = document.getElementById("formNueva");
document.getElementById("btnNueva").addEventListener("click", () => {
  form.classList.toggle("oculto");
  if (!form.classList.contains("oculto")) document.getElementById("inputTitulo").focus();
});
document.getElementById("btnCancelar").addEventListener("click", () => {
  form.classList.add("oculto");
  form.reset();
});
form.addEventListener("submit", (e) => {
  e.preventDefault();
  tareas.unshift({
    id: "u-" + Date.now(),
    titulo: document.getElementById("inputTitulo").value.trim(),
    detalle: "",
    categoria: document.getElementById("inputCategoria").value,
    prioridad: document.getElementById("inputPrioridad").value,
    vence: document.getElementById("inputVence").value,
    de: "",
    threadId: "",
    hecha: false
  });
  guardar();
  form.reset();
  form.classList.add("oculto");
  render();
});

document.getElementById("btnReset").addEventListener("click", () => {
  if (confirm("Esto restaurará la lista con las tareas extraídas de tus correos y descartará los cambios locales. ¿Continuar?")) {
    tareas = clonarSemilla();
    guardar();
    render();
  }
});

// Enviar las tareas pendientes (según el filtro activo) por WhatsApp.
document.getElementById("btnWhatsApp").addEventListener("click", () => {
  const visibles = filtrar(tareas);
  abrirWhatsApp(textoPendientes(visibles.length ? visibles : tareas));
});

// Configurar / cambiar el número de WhatsApp por defecto.
document.getElementById("btnWhatsNum").addEventListener("click", () => {
  const actual = numeroWhatsApp();
  const valor = prompt(
    "Número de WhatsApp por defecto (con código de país, solo dígitos).\n" +
    "Ej. Chile: 56912345678.\n\nDéjalo vacío para elegir el contacto al compartir.",
    actual
  );
  if (valor === null) return; // Canceló
  const limpio = valor.replace(/[^0-9]/g, "");
  if (limpio) localStorage.setItem(WHATSAPP_NUM_KEY, limpio);
  else localStorage.removeItem(WHATSAPP_NUM_KEY);
  alert(limpio
    ? `Listo. Las tareas se enviarán a +${limpio}.`
    : "Listo. Al compartir, WhatsApp te dejará elegir el contacto.");
});

// ---- Sincronización automática con Gmail (opcional) ----------------------
// Si config.js define window.SYNC_URL, traemos las tareas desde el Apps
// Script que lee los correos etiquetados con "📋 Tarea". Usamos JSONP para
// que funcione incluso abriendo index.html como archivo local.

function sincronizarConGmail() {
  if (!window.SYNC_URL) return;
  const cb = "__onTareasGmail";
  window[cb] = (data) => {
    try {
      aplicarTareasRemotas((data && data.tasks) || []);
    } finally {
      delete window[cb];
      script.remove();
    }
  };
  const sep = window.SYNC_URL.includes("?") ? "&" : "?";
  const script = document.createElement("script");
  script.src = window.SYNC_URL + sep + "callback=" + cb;
  script.onerror = () => { delete window[cb]; script.remove(); };
  document.body.appendChild(script);
}

function aplicarTareasRemotas(remotas) {
  // Conserva el estado "hecha" por id y las tareas creadas a mano (id "u-").
  const estado = {};
  tareas.forEach((t) => { estado[t.id] = t.hecha; });
  const manuales = tareas.filter((t) => t.id.startsWith("u-"));
  const deGmail = remotas.map((t) => ({ ...t, hecha: estado[t.id] ?? t.hecha ?? false }));
  tareas = [...manuales, ...deGmail];
  guardar();
  render();
}

// Fecha de hoy en el encabezado
document.getElementById("today").textContent = new Date().toLocaleDateString("es-CL", {
  weekday: "long", day: "numeric", month: "long", year: "numeric"
});

// Init
cargar();
render();
sincronizarConGmail();
