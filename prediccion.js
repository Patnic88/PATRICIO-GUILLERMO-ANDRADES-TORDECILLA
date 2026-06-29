// Predicción de Juicios — análisis de jurisprudencia de la Corte Suprema.
//
// Cómo funciona (de forma transparente, para que puedas auditarlo):
//  1. Mantienes tu propia base de fallos de la Corte Suprema (se guarda en
//     localStorage; la semilla inicial viene de jurisprudencia.seed.js).
//  2. Describes tu caso: tipo de recurso, sala, tema y los hechos/argumentos.
//  3. El módulo compara tu caso con cada fallo por: coincidencia de recurso,
//     de sala, de tema y solape de palabras clave (texto). Pondera por
//     similitud y por antigüedad (los fallos más recientes pesan más).
//  4. Entrega una probabilidad estimada de resultado favorable (que se ACOJA),
//     un nivel de confianza y los fallos más influyentes, con su criterio.
//
// ⚠️ Es una herramienta de APOYO. No predice con certeza: la decisión
// judicial depende de factores que ningún modelo captura por completo.

const FALLOS_KEY = "fallos_cs_v1";
const RECURSOS = [
  "Protección", "Amparo", "Casación en el fondo", "Casación en la forma",
  "Nulidad de derecho público", "Reclamación ambiental", "Reclamación de ilegalidad municipal",
  "Unificación de jurisprudencia", "Apelación", "Queja", "Otro"
];
const SALAS = ["Primera", "Segunda", "Tercera", "Cuarta", "Pleno"];

let fallos = [];

// ---- Persistencia --------------------------------------------------------

function cargarFallos() {
  const guardado = localStorage.getItem(FALLOS_KEY);
  if (guardado) {
    try { fallos = JSON.parse(guardado); return; }
    catch (e) { console.warn("No se pudo leer la base de fallos; usando la semilla."); }
  }
  fallos = (window.SEED_FALLOS || []).map((f) => ({ ...f }));
}

function guardarFallos() {
  localStorage.setItem(FALLOS_KEY, JSON.stringify(fallos));
}

// ---- Procesamiento de texto ----------------------------------------------

const STOPWORDS = new Set((
  "el la los las un una unos unas de del al a ante con contra desde en entre hacia hasta para por segun sin so sobre tras y o u e ni que se su sus le les lo me mi mis te ti tu tus nos os es son fue ser estar este esta estos estas ese esa eso aquel cual cuales como mas pero si no ya muy mismo misma tambien entonces porque cuando donde quien cuyo cuya ha han haber hay sea fueron era eran "
).split(/\s+/));

function normalizar(txt) {
  return (txt || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // quita tildes
    .replace(/[^a-z0-9ñ\s]/g, " ");
}

function tokens(txt) {
  return normalizar(txt)
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
}

function setDe(txt) { return new Set(tokens(txt)); }

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  a.forEach((x) => { if (b.has(x)) inter++; });
  return inter / (a.size + b.size - inter);
}

// ---- Cálculo de similitud y predicción ------------------------------------

// Texto representativo de un fallo (para comparar palabras).
function textoFallo(f) {
  return [f.tema, f.resumen, (f.palabras || []).join(" "), f.texto].join(" ");
}

// Similitud 0..1 entre el caso y un fallo.
function similitud(caso, f) {
  const palabrasCaso = setDe(caso.hechos + " " + caso.tema);
  const semTexto = jaccard(palabrasCaso, setDe(textoFallo(f)));      // 0..1
  const mismoRecurso = caso.recurso && f.recurso === caso.recurso ? 1 : 0;
  const mismaSala = caso.sala && f.sala === caso.sala ? 1 : 0;
  const mismoTema = caso.tema && f.tema &&
    normalizar(f.tema) === normalizar(caso.tema) ? 1 : 0;

  // Pesos: el texto manda, pero recurso/sala/tema ubican el contexto.
  const score = 0.50 * semTexto + 0.22 * mismoRecurso + 0.13 * mismaSala + 0.15 * mismoTema;
  return { score, semTexto, mismoRecurso, mismaSala, mismoTema };
}

// Peso por antigüedad: más reciente = más peso (0.5 a 1).
function pesoAnio(anio, anioActual) {
  if (!anio) return 0.7;
  const diff = Math.max(0, anioActual - anio);
  return Math.max(0.5, 1 - diff * 0.05); // ~10 años para llegar al piso
}

function valorResultado(r) {
  if (r === "acoge") return 1;
  if (r === "acoge_parcial") return 0.5;
  return 0; // rechaza
}

function etiquetaResultado(r) {
  return r === "acoge" ? "Acoge" : r === "acoge_parcial" ? "Acoge parcial" : "Rechaza";
}

function predecir(caso, anioActual) {
  const evaluados = fallos
    .map((f) => {
      const sim = similitud(caso, f);
      return { fallo: f, ...sim, peso: sim.score * pesoAnio(f.anio, anioActual) };
    })
    .filter((e) => e.score > 0.05)
    .sort((a, b) => b.peso - a.peso);

  if (evaluados.length === 0) {
    return { ok: false, motivo: "Sin coincidencias en tu base de fallos. Agrega sentencias del mismo tipo de recurso/tema." };
  }

  // Tomamos los más relevantes (hasta 8).
  const top = evaluados.slice(0, 8);
  const sumaPeso = top.reduce((s, e) => s + e.peso, 0);
  const favorable = top.reduce((s, e) => s + e.peso * valorResultado(e.fallo.resultado), 0);
  const probabilidad = sumaPeso > 0 ? favorable / sumaPeso : 0;

  // Confianza: depende de cuántos fallos relevantes hay y qué tan similares son.
  const nRelevantes = top.filter((e) => e.score > 0.2).length;
  const simPromedio = top.reduce((s, e) => s + e.score, 0) / top.length;
  let confianza = "baja";
  if (nRelevantes >= 4 && simPromedio > 0.3) confianza = "alta";
  else if (nRelevantes >= 2 && simPromedio > 0.18) confianza = "media";

  // ¿Hay consenso o la jurisprudencia está dividida?
  const acoge = top.filter((e) => valorResultado(e.fallo.resultado) >= 0.5).length;
  const dividida = acoge > 0 && acoge < top.length && Math.abs(probabilidad - 0.5) < 0.2;

  return {
    ok: true,
    probabilidad,
    confianza,
    dividida,
    nAnalizados: evaluados.length,
    top
  };
}

// ---- Render de resultados -------------------------------------------------

function escapar(txt) {
  const d = document.createElement("div");
  d.textContent = txt ?? "";
  return d.innerHTML;
}

function pct(x) { return Math.round(x * 100); }

function colorProb(p) {
  if (p >= 0.6) return "var(--baja)";
  if (p <= 0.4) return "var(--alta)";
  return "var(--media)";
}

function renderResultado(caso, res) {
  const cont = document.getElementById("resultado");
  cont.classList.remove("oculto");

  if (!res.ok) {
    cont.innerHTML = `<div class="pred-card"><p class="empty">${escapar(res.motivo)}</p></div>`;
    return;
  }

  const p = res.probabilidad;
  const conf = { alta: "Alta", media: "Media", baja: "Baja" }[res.confianza];
  const recomendacion = p >= 0.6
    ? "La jurisprudencia analizada tiende a ser FAVORABLE a acoger."
    : p <= 0.4
      ? "La jurisprudencia analizada tiende a RECHAZAR."
      : "La jurisprudencia está dividida o es poco concluyente.";

  const filas = res.top.map((e) => {
    const f = e.fallo;
    const link = f.link
      ? `<a class="gmail-link" href="${escapar(f.link)}" target="_blank" rel="noopener">ver fallo</a>` : "";
    const cls = valorResultado(f.resultado) >= 0.5 ? "res-acoge" : "res-rechaza";
    return `
      <li class="fallo-rel">
        <div class="fallo-rel-top">
          <span class="badge ${cls}">${etiquetaResultado(f.resultado)}</span>
          <strong>Rol ${escapar(f.rol)}</strong>
          <span class="badge cat">${escapar(f.sala)}ª Sala · ${escapar(f.anio || "s/f")}</span>
          <span class="badge cat">${escapar(f.tema || "")}</span>
          <span class="sim">similitud ${pct(e.score)}%</span>
          ${link}
        </div>
        <div class="detalle">${escapar(f.resumen)}</div>
      </li>`;
  }).join("");

  cont.innerHTML = `
    <div class="pred-card">
      <div class="gauge">
        <div class="gauge-num" style="color:${colorProb(p)}">${pct(p)}%</div>
        <div class="gauge-lbl">probabilidad estimada de que se <strong>ACOJA</strong></div>
        <div class="gauge-bar"><span style="width:${pct(p)}%;background:${colorProb(p)}"></span></div>
      </div>
      <p class="pred-reco">${recomendacion}</p>
      <div class="pred-meta">
        <span class="badge cat">Confianza: ${conf}</span>
        <span class="badge cat">${res.top.length} fallos influyentes · ${res.nAnalizados} con coincidencia</span>
        ${res.dividida ? `<span class="badge res-rechaza">Jurisprudencia dividida</span>` : ""}
      </div>
      <p class="aviso">⚠️ Estimación orientativa basada solo en tu base de fallos. No constituye
      asesoría definitiva ni garantiza el resultado del juicio. Revisa siempre los fallos citados.</p>
    </div>
    <h3 class="seccion-tit">Fallos más influyentes en esta estimación</h3>
    <ul class="lista">${filas}</ul>
  `;
  cont.scrollIntoView({ behavior: "smooth", block: "start" });

  // Si hay IA configurada, ofrecemos el análisis ampliado.
  if (window.IA_URL) ofrecerIA(caso, res);
}

// ---- Enchufe opcional de IA ------------------------------------------------
// Si config.js define window.IA_URL (un proxy que reenvía al modelo), enviamos
// el caso + los fallos influyentes para un análisis razonado en lenguaje
// natural. El proxy evita exponer claves de API en el navegador.

function ofrecerIA(caso, res) {
  const cont = document.getElementById("resultado");
  const btn = document.createElement("button");
  btn.className = "btn-primary";
  btn.style.marginTop = "16px";
  btn.textContent = "🤖 Análisis ampliado con IA";
  btn.onclick = () => analizarConIA(caso, res, btn);
  cont.appendChild(btn);
}

async function analizarConIA(caso, res, btn) {
  btn.disabled = true;
  btn.textContent = "Analizando…";
  const payload = {
    caso,
    fallos: res.top.map((e) => ({
      rol: e.fallo.rol, anio: e.fallo.anio, sala: e.fallo.sala,
      recurso: e.fallo.recurso, tema: e.fallo.tema,
      resultado: e.fallo.resultado, resumen: e.fallo.resumen, similitud: e.score
    })),
    probabilidad: res.probabilidad
  };
  try {
    // Content-Type text/plain evita el "preflight" CORS: así el POST funciona
    // contra el Web App de Apps Script (que no responde a peticiones OPTIONS).
    const r = await fetch(window.IA_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
    const data = await r.json();
    const texto = data.analisis || data.text;
    if (!texto) {
      btn.disabled = false;
      btn.textContent = "🤖 Reintentar análisis con IA";
      alert("El servicio de IA respondió con un problema: " + (data.error || "respuesta vacía."));
      return;
    }
    const div = document.createElement("div");
    div.className = "pred-card ia-card";
    div.innerHTML = `<h3 class="seccion-tit">🤖 Análisis de IA</h3>
      <div class="ia-texto">${escapar(texto)}</div>
      <p class="aviso">Generado por IA a partir de los fallos citados. Verifica antes de usar.</p>`;
    btn.replaceWith(div);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "🤖 Reintentar análisis con IA";
    alert("No se pudo conectar con el servicio de IA. Revisa window.IA_URL en config.js.");
  }
}

// ---- Gestión de la base de fallos -----------------------------------------

function renderFallos() {
  const ul = document.getElementById("listaFallos");
  document.getElementById("contadorFallos").textContent =
    fallos.length === 1 ? "1 fallo" : `${fallos.length} fallos`;
  ul.innerHTML = fallos.map((f) => `
    <li class="fallo-rel" data-id="${escapar(f.id)}">
      <div class="fallo-rel-top">
        <span class="badge ${valorResultado(f.resultado) >= 0.5 ? "res-acoge" : "res-rechaza"}">${etiquetaResultado(f.resultado)}</span>
        <strong>Rol ${escapar(f.rol)}</strong>
        <span class="badge cat">${escapar(f.sala)}ª · ${escapar(f.recurso)}</span>
        <span class="badge cat">${escapar(f.tema || "")}</span>
        <button class="btn-del" title="Eliminar fallo">✕</button>
      </div>
      <div class="detalle">${escapar(f.resumen)}</div>
    </li>`).join("");
}

document.getElementById("listaFallos").addEventListener("click", (e) => {
  if (!e.target.classList.contains("btn-del")) return;
  const li = e.target.closest(".fallo-rel");
  if (!li) return;
  if (confirm("¿Eliminar este fallo de tu base?")) {
    fallos = fallos.filter((f) => f.id !== li.dataset.id);
    guardarFallos();
    renderFallos();
  }
});

// ---- Inicialización de formularios ----------------------------------------

function llenarSelect(id, opciones, incluyeVacio) {
  const sel = document.getElementById(id);
  const base = incluyeVacio ? `<option value="">(cualquiera)</option>` : "";
  sel.innerHTML = base + opciones.map((o) => `<option value="${o}">${o}</option>`).join("");
}

function initFormularios() {
  llenarSelect("casoRecurso", RECURSOS, true);
  llenarSelect("casoSala", SALAS, true);
  llenarSelect("fRecurso", RECURSOS, false);
  llenarSelect("fSala", SALAS, false);

  // Predecir
  document.getElementById("formCaso").addEventListener("submit", (e) => {
    e.preventDefault();
    const caso = {
      recurso: document.getElementById("casoRecurso").value,
      sala: document.getElementById("casoSala").value,
      tema: document.getElementById("casoTema").value.trim(),
      hechos: document.getElementById("casoHechos").value.trim()
    };
    if (!caso.hechos && !caso.tema) {
      alert("Describe al menos el tema o los hechos del caso.");
      return;
    }
    const anioActual = new Date().getFullYear();
    renderResultado(caso, predecir(caso, anioActual));
  });

  // Agregar fallo a la base
  const formFallo = document.getElementById("formFallo");
  document.getElementById("btnAgregarFallo").addEventListener("click", () => {
    formFallo.classList.toggle("oculto");
  });
  document.getElementById("btnCancelarFallo").addEventListener("click", () => {
    formFallo.classList.add("oculto");
    formFallo.reset();
  });
  formFallo.addEventListener("submit", (e) => {
    e.preventDefault();
    const rol = document.getElementById("fRol").value.trim();
    fallos.unshift({
      id: "cs-u-" + Date.now(),
      rol: rol || "s/n",
      anio: parseInt(document.getElementById("fAnio").value, 10) || null,
      sala: document.getElementById("fSala").value,
      recurso: document.getElementById("fRecurso").value,
      tema: document.getElementById("fTema").value.trim(),
      resultado: document.getElementById("fResultado").value,
      resumen: document.getElementById("fResumen").value.trim(),
      palabras: document.getElementById("fPalabras").value.split(",").map((s) => s.trim()).filter(Boolean),
      texto: document.getElementById("fTexto").value.trim(),
      link: document.getElementById("fLink").value.trim()
    });
    guardarFallos();
    renderFallos();
    formFallo.reset();
    formFallo.classList.add("oculto");
  });

  document.getElementById("btnResetFallos").addEventListener("click", () => {
    if (confirm("Esto restaurará la base con los fallos de ejemplo y descartará tus cambios. ¿Continuar?")) {
      fallos = (window.SEED_FALLOS || []).map((f) => ({ ...f }));
      guardarFallos();
      renderFallos();
    }
  });
}

// ---- Init -----------------------------------------------------------------

document.getElementById("today").textContent = new Date().toLocaleDateString("es-CL", {
  weekday: "long", day: "numeric", month: "long", year: "numeric"
});

cargarFallos();
initFormularios();
renderFallos();
