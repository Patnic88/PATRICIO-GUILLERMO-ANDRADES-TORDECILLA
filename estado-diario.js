// Lista de Estado Diario — vinculada al agente estado-diario.gs.
// Si window.COURT_SYNC_URL apunta al Web App de Apps Script, los datos se
// traen de Gmail; si no, se muestran los datos de muestra de
// estado-diario.seed.js para que la página sea navegable de inmediato.

const STORAGE_KEY = "estado_diario_v1";
const GMAIL_BASE = "https://mail.google.com/mail/u/0/#all/";

let entradas = [];
let filtroActual = "todos";

// ---- Persistencia --------------------------------------------------------

function cargar() {
  const guardado = localStorage.getItem(STORAGE_KEY);
  if (guardado) {
    try { entradas = JSON.parse(guardado); return; }
    catch (e) { console.warn("No se pudo leer el almacenamiento de estado diario."); }
  }
  entradas = clonarSemilla();
}

function guardar() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entradas));
}

function clonarSemilla() {
  return (window.SEED_ESTADO_DIARIO || []).map((e) => ({ ...e }));
}

// ---- Filtros y orden -----------------------------------------------------

function esHoy(iso) {
  if (!iso) return false;
  const fecha = new Date(iso);
  const hoy = new Date();
  return fecha.toDateString() === hoy.toDateString();
}

function filtrar(lista) {
  switch (filtroActual) {
    case "hoy": return lista.filter((e) => esHoy(e.fechaIso));
    case "los-vilos": return lista.filter((e) => e.tipoTribunal === "los-vilos");
    case "corte-la-serena": return lista.filter((e) => e.tipoTribunal === "corte-la-serena");
    case "no-revisadas": return lista.filter((e) => !e.revisada);
    default: return lista;
  }
}

function ordenar(lista) {
  return [...lista].sort((a, b) => {
    const fa = a.fechaIso || a.fecha || "";
    const fb = b.fechaIso || b.fecha || "";
    return fb.localeCompare(fa);
  });
}

// ---- Render --------------------------------------------------------------

function escapar(txt) {
  const d = document.createElement("div");
  d.textContent = txt ?? "";
  return d.innerHTML;
}

function fechaCorta(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
  } catch (e) { return iso; }
}

function tribunalBadge(tipo, nombre) {
  const cls = tipo === "corte-la-serena" ? "badge tribunal corte" : "badge tribunal juzgado";
  const corto = tipo === "corte-la-serena" ? "Corte La Serena" : "Juzgado Los Vilos";
  return `<span class="${cls}" title="${escapar(nombre)}">${corto}</span>`;
}

function render() {
  const ul = document.getElementById("listaED");
  const visibles = ordenar(filtrar(entradas));

  ul.innerHTML = visibles.map((e) => {
    const link = e.threadId
      ? `<a class="gmail-link" href="${GMAIL_BASE}${escapar(e.threadId)}" target="_blank" rel="noopener">🔗 Ver correo</a>`
      : "";
    const rol = e.rol ? `<span class="badge rol">${escapar(e.rol)}</span>` : "";
    const tipoBadge = e.tipoResolucion
      ? `<span class="badge tipo">${escapar(e.tipoResolucion)}</span>` : "";
    return `
      <li class="tarea estado ${e.revisada ? "hecha" : ""}" data-id="${escapar(e.id)}">
        <input type="checkbox" class="check" ${e.revisada ? "checked" : ""} aria-label="Marcar como revisada" title="Marcar como revisada" />
        <div class="tarea-cuerpo">
          <div class="titulo">${escapar(e.caratulado || "(sin carátula)")}</div>
          <div class="detalle">${escapar(e.resumen || "")}</div>
          <div class="tarea-meta">
            ${tribunalBadge(e.tipoTribunal, e.tribunal)}
            ${rol}
            ${tipoBadge}
            <span class="badge fecha">📅 ${escapar(fechaCorta(e.fechaIso || e.fecha))}</span>
            ${link}
          </div>
        </div>
        <button class="btn-del" aria-label="Eliminar entrada" title="Quitar de la lista">✕</button>
      </li>`;
  }).join("");

  document.getElementById("counterED").textContent =
    visibles.length === 1 ? "1 movimiento" : `${visibles.length} movimientos`;
  document.getElementById("vacioED").classList.toggle("oculto", visibles.length > 0);

  const hoy = entradas.filter((e) => esHoy(e.fechaIso || e.fecha)).length;
  const counterHoy = document.getElementById("counterHoy");
  counterHoy.textContent = hoy === 1 ? "1 hoy" : `${hoy} hoy`;
  counterHoy.classList.toggle("oculto", hoy === 0);
}

// ---- Eventos -------------------------------------------------------------

function porId(id) { return entradas.find((e) => e.id === id); }

document.getElementById("listaED").addEventListener("click", (e) => {
  const li = e.target.closest(".tarea");
  if (!li) return;
  const entrada = porId(li.dataset.id);
  if (!entrada) return;

  if (e.target.classList.contains("check")) {
    entrada.revisada = e.target.checked;
    guardar();
    render();
  } else if (e.target.classList.contains("btn-del")) {
    if (confirm("¿Quitar este movimiento de la lista?")) {
      entradas = entradas.filter((x) => x.id !== entrada.id);
      guardar();
      render();
    }
  }
});

document.getElementById("filtersED").addEventListener("click", (e) => {
  if (!e.target.classList.contains("chip")) return;
  document.querySelectorAll("#filtersED .chip").forEach((c) => c.classList.remove("active"));
  e.target.classList.add("active");
  filtroActual = e.target.dataset.filter;
  render();
});

document.getElementById("btnResetED").addEventListener("click", () => {
  if (confirm("Esto restaurará los datos de muestra y descartará los cambios locales. ¿Continuar?")) {
    entradas = clonarSemilla();
    guardar();
    render();
  }
});

document.getElementById("btnRefrescarED").addEventListener("click", () => {
  if (!window.COURT_SYNC_URL) {
    alert("Para revisar tu correo, configura window.COURT_SYNC_URL en config.js apuntando al Web App de estado-diario.gs.");
    return;
  }
  sincronizarConGmail(true);
});

// ---- Agente: sincronización con Gmail ------------------------------------

function sincronizarConGmail(forzarAviso) {
  const nota = document.getElementById("agentNote");
  if (!window.COURT_SYNC_URL) {
    nota.textContent = "⚠️ Mostrando datos de muestra. Configura window.COURT_SYNC_URL en config.js para activar el agente que lee tu Gmail.";
    nota.classList.add("aviso");
    return;
  }
  nota.textContent = "⌛ Consultando tu correo en busca de movimientos del día...";
  nota.classList.remove("aviso");

  const cb = "__onEstadoDiario";
  window[cb] = (data) => {
    try {
      aplicarEntradasRemotas((data && data.entries) || []);
      const cuando = (data && data.updated) ? new Date(data.updated).toLocaleString("es-CL") : "ahora";
      nota.textContent = `✅ Agente actualizado (${cuando}). Mostrando ${entradas.length} movimientos.`;
    } catch (e) {
      nota.textContent = "❌ No se pudieron leer las notificaciones. Revisa la URL en config.js.";
      nota.classList.add("aviso");
    } finally {
      delete window[cb];
      script.remove();
    }
  };
  const sep = window.COURT_SYNC_URL.includes("?") ? "&" : "?";
  const script = document.createElement("script");
  script.src = window.COURT_SYNC_URL + sep + "callback=" + cb + "&dias=7";
  script.onerror = () => {
    nota.textContent = "❌ No se pudo contactar al agente. Verifica que el Apps Script esté publicado como Web App.";
    nota.classList.add("aviso");
    delete window[cb];
    script.remove();
  };
  document.body.appendChild(script);

  if (forzarAviso) nota.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function aplicarEntradasRemotas(remotas) {
  // Conserva el estado "revisada" por id.
  const estado = {};
  entradas.forEach((e) => { estado[e.id] = e.revisada; });
  entradas = remotas.map((e) => ({ ...e, revisada: estado[e.id] ?? e.revisada ?? false }));
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
sincronizarConGmail(false);
