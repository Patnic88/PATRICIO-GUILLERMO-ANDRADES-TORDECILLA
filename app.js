// Lista de tareas conectada a los correos de Gmail.
// Las tareas iniciales vienen de tasks.seed.js (extraídas de tus correos).
// El estado (completadas, nuevas, eliminadas) se guarda en localStorage.

const STORAGE_KEY = "tareas_patricio_v1";
const GMAIL_BASE = "https://mail.google.com/mail/u/0/#all/";

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

// Fecha de hoy en el encabezado
document.getElementById("today").textContent = new Date().toLocaleDateString("es-CL", {
  weekday: "long", day: "numeric", month: "long", year: "numeric"
});

// Init
cargar();
render();
