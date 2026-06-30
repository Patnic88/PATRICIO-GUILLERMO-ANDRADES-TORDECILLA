// Lector de PDF en voz alta.
// 1) pdf.js extrae el texto del PDF (todo ocurre en el navegador).
// 2) La API Web Speech (speechSynthesis) lo lee en voz alta.
// El texto se divide en frases para resaltar lo que se está leyendo y para
// evitar el corte de utterances largas que sufren algunos navegadores.

// ---- Configuración de pdf.js --------------------------------------------
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

const synth = window.speechSynthesis;

// Estado
let frases = [];          // [{ texto, el, palabras: [{ el, start }], pagina }]
let indiceActual = 0;     // frase que se está leyendo
let leyendo = false;      // hay una lectura en curso (aunque esté en pausa)
let palabraActual = null; // span de la palabra resaltada en curso
let finLectura = Infinity; // índice de la última frase a leer en este tramo
let paginasTexto = [];    // texto crudo por página (para descargar)
let totalPaginas = 0;     // nº de páginas del PDF
let nombreArchivo = "";   // nombre del PDF cargado

// ---- Referencias al DOM --------------------------------------------------
const $ = (id) => document.getElementById(id);
const dropzone = $("dropzone");
const inputPdf = $("inputPdf");
const estado = $("estado");
const lector = $("lector");
const docNombre = $("docNombre");
const textoEl = $("texto");
const btnPlay = $("btnPlay");
const btnPausa = $("btnPausa");
const btnStop = $("btnStop");
const btnOtro = $("btnOtro");
const btnDescargar = $("btnDescargar");
const rango = $("rango");
const inpDesde = $("inpDesde");
const inpHasta = $("inpHasta");
const rangoTotal = $("rangoTotal");
const progresoBarra = $("progresoBarra");
const progresoTxt = $("progresoTxt");
const selVoz = $("selVoz");
const rngVel = $("rngVel");
const rngTono = $("rngTono");
const valVel = $("valVel");
const valTono = $("valTono");

// ---- Carga del PDF -------------------------------------------------------

dropzone.addEventListener("click", () => inputPdf.click());
inputPdf.addEventListener("change", (e) => {
  if (e.target.files[0]) cargarPdf(e.target.files[0]);
});

["dragenter", "dragover"].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  })
);
["dragleave", "drop"].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
  })
);
dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (file && file.type === "application/pdf") cargarPdf(file);
  else mostrarEstado("Eso no parece un archivo PDF.", true);
});

btnOtro.addEventListener("click", () => {
  detener();
  lector.classList.add("oculto");
  dropzone.classList.remove("oculto");
  inputPdf.value = "";
});

function mostrarEstado(msg, esError = false) {
  estado.textContent = msg;
  estado.classList.toggle("error", esError);
  estado.classList.remove("oculto");
}

async function cargarPdf(file) {
  detener();
  if (!window.pdfjsLib) {
    mostrarEstado("No se pudo cargar el motor de PDF. Revisa tu conexión a internet.", true);
    return;
  }
  dropzone.classList.add("oculto");
  lector.classList.add("oculto");
  mostrarEstado("Procesando “" + file.name + "”…");

  try {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const paginas = [];

    for (let n = 1; n <= pdf.numPages; n++) {
      mostrarEstado(`Extrayendo texto… página ${n} de ${pdf.numPages}`);
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      const texto = unirItems(content.items);
      paginas.push(texto);
    }

    const completo = paginas.join("\n\n").trim();
    if (!completo) {
      mostrarEstado(
        "No se encontró texto seleccionable en este PDF. Puede que sea un documento escaneado (imágenes).",
        true
      );
      dropzone.classList.remove("oculto");
      return;
    }

    nombreArchivo = file.name;
    paginasTexto = paginas;
    totalPaginas = paginas.length;
    docNombre.textContent = "📄 " + file.name;
    configurarRango();
    construirFrases(paginas);
    estado.classList.add("oculto");
    lector.classList.remove("oculto");
  } catch (err) {
    console.error(err);
    mostrarEstado("No se pudo leer el PDF: " + (err.message || err), true);
    dropzone.classList.remove("oculto");
  }
}

// Une los fragmentos de texto de pdf.js respetando los saltos de línea.
function unirItems(items) {
  let out = "";
  for (const it of items) {
    out += it.str;
    if (it.hasEOL) out += "\n";
    else if (it.str && !it.str.endsWith(" ")) out += " ";
  }
  return out.replace(/[ \t]+/g, " ").replace(/\n /g, "\n");
}

// ---- Construcción de frases y resaltado ---------------------------------

// Divide en frases: corta en . ! ? … y en saltos de párrafo. Trocea frases
// muy largas para que el resaltado sea fluido y la voz no se corte.
function dividirEnFrases(texto) {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (!limpio) return [];
  const crudas = limpio.match(/[^.!?…]+[.!?…]*\s*/g) || [limpio];
  const res = [];
  for (let f of crudas) {
    f = f.trim();
    if (!f) continue;
    if (f.length <= 240) {
      res.push(f);
    } else {
      // Trocear por comas o cada ~200 caracteres.
      let resto = f;
      while (resto.length > 240) {
        let corte = resto.lastIndexOf(",", 240);
        if (corte < 100) corte = resto.lastIndexOf(" ", 240);
        if (corte < 100) corte = 240;
        res.push(resto.slice(0, corte + 1).trim());
        resto = resto.slice(corte + 1).trim();
      }
      if (resto) res.push(resto);
    }
  }
  return res;
}

function construirFrases(paginas) {
  frases = [];
  indiceActual = 0;
  textoEl.innerHTML = "";

  paginas.forEach((textoPag, i) => {
    if (i > 0) {
      const sep = document.createElement("span");
      sep.className = "pagina-sep";
      sep.textContent = `— Página ${i + 1} —`;
      textoEl.appendChild(sep);
    }
    dividirEnFrases(textoPag).forEach((t) => {
      const span = document.createElement("span");
      span.className = "frase";
      const palabras = construirPalabras(t, span);
      span.addEventListener("click", () => {
        // Clic en una frase = leer desde ahí hasta el final.
        indiceActual = frases.findIndex((fr) => fr.el === span);
        reproducirDesde(indiceActual, frases.length - 1);
      });
      textoEl.appendChild(span);
      frases.push({ texto: t, el: span, palabras, pagina: i });
    });
  });

  actualizarProgreso();
}

// Configura los campos "Leer páginas X a Y" según el PDF cargado.
function configurarRango() {
  inpDesde.max = totalPaginas;
  inpHasta.max = totalPaginas;
  inpDesde.value = 1;
  inpHasta.value = totalPaginas;
  rangoTotal.textContent = `de ${totalPaginas}`;
  rango.classList.toggle("oculto", totalPaginas <= 1);
}

// Devuelve los índices de la primera y última frase dentro del rango elegido.
function rangoFrases() {
  let d = parseInt(inpDesde.value, 10) || 1;
  let h = parseInt(inpHasta.value, 10) || totalPaginas;
  d = Math.min(Math.max(1, d), totalPaginas);
  h = Math.min(Math.max(d, h), totalPaginas);
  let ini = frases.findIndex((fr) => fr.pagina + 1 >= d);
  if (ini < 0) ini = 0;
  let fin = ini;
  for (let k = 0; k < frases.length; k++) {
    if (frases[k].pagina + 1 <= h) fin = k;
  }
  return { ini, fin };
}

// Envuelve cada palabra de la frase en un <span> y guarda el desplazamiento de
// caracteres donde empieza, para poder resaltarla con el evento "boundary".
function construirPalabras(texto, parent) {
  const palabras = [];
  const re = /\S+/g;
  let m, last = 0;
  while ((m = re.exec(texto)) !== null) {
    if (m.index > last) parent.appendChild(document.createTextNode(texto.slice(last, m.index)));
    const w = document.createElement("span");
    w.className = "palabra";
    w.textContent = m[0];
    parent.appendChild(w);
    palabras.push({ el: w, start: m.index });
    last = m.index + m[0].length;
  }
  if (last < texto.length) parent.appendChild(document.createTextNode(texto.slice(last)));
  parent.appendChild(document.createTextNode(" "));
  return palabras;
}

function resaltar(i) {
  limpiarPalabra();
  frases.forEach((fr, idx) => fr.el.classList.toggle("activa", idx === i));
  const activa = frases[i] && frases[i].el;
  if (activa) activa.scrollIntoView({ block: "center", behavior: "smooth" });
}

function limpiarPalabra() {
  if (palabraActual) palabraActual.classList.remove("activa");
  palabraActual = null;
}

// Resalta la palabra que corresponde al carácter `charIndex` dentro de la frase.
function resaltarPalabra(i, charIndex) {
  const fr = frases[i];
  if (!fr) return;
  let elegido = null;
  for (const p of fr.palabras) {
    if (charIndex >= p.start) elegido = p;
    else break;
  }
  limpiarPalabra();
  if (elegido) {
    elegido.el.classList.add("activa");
    palabraActual = elegido.el;
    elegido.el.scrollIntoView({ block: "nearest" });
  }
}

function actualizarProgreso() {
  const total = frases.length;
  const actual = leyendo ? Math.min(indiceActual + 1, total) : indiceActual;
  progresoTxt.textContent = `${actual} / ${total}`;
  progresoBarra.style.width = total ? (actual / total) * 100 + "%" : "0%";
}

// ---- Lectura por voz -----------------------------------------------------

function vozElegida() {
  const voces = synth.getVoices();
  const id = selVoz.value;
  return voces.find((v) => v.voiceURI === id) || voces.find((v) => /es/i.test(v.lang)) || voces[0];
}

function hablarFrase(i) {
  if (i >= frases.length || i > finLectura) {
    detener();
    return;
  }
  indiceActual = i;
  resaltar(i);
  actualizarProgreso();

  const u = new SpeechSynthesisUtterance(frases[i].texto);
  const voz = vozElegida();
  if (voz) {
    u.voice = voz;
    u.lang = voz.lang;
  } else {
    u.lang = "es-ES";
  }
  u.rate = parseFloat(rngVel.value);
  u.pitch = parseFloat(rngTono.value);

  // Resalta palabra por palabra mientras la voz avanza (donde el navegador
  // lo soporte; si no, queda el resaltado de la frase completa).
  u.onboundary = (e) => {
    if (e.name && e.name !== "word") return;
    resaltarPalabra(i, e.charIndex);
  };

  u.onend = () => {
    if (leyendo && !synth.paused) hablarFrase(i + 1);
  };
  u.onerror = (e) => {
    if (e.error !== "interrupted" && e.error !== "canceled") {
      console.warn("Error de voz:", e.error);
    }
  };
  synth.speak(u);
}

function reproducirDesde(i, fin) {
  synth.cancel();
  finLectura = fin == null ? frases.length - 1 : fin;
  leyendo = true;
  actualizarBotones();
  hablarFrase(i);
}

function reproducir() {
  if (synth.paused && leyendo) {
    synth.resume();
    actualizarBotones();
    return;
  }
  if (!frases.length) return;
  // El botón ▶︎ lee el rango de páginas elegido.
  const { ini, fin } = rangoFrases();
  const inicio = indiceActual >= ini && indiceActual <= fin ? indiceActual : ini;
  reproducirDesde(inicio, fin);
}

function pausar() {
  if (leyendo && !synth.paused) {
    synth.pause();
    actualizarBotones();
  }
}

function detener() {
  leyendo = false;
  synth.cancel();
  limpiarPalabra();
  if (frases.length) frases.forEach((fr) => fr.el.classList.remove("activa"));
  indiceActual = 0;
  actualizarBotones();
  actualizarProgreso();
}

function actualizarBotones() {
  const enPausa = synth.paused && leyendo;
  btnPlay.textContent = enPausa ? "▶︎ Reanudar" : (leyendo ? "▶︎ Reproduciendo" : "▶︎ Reproducir");
  btnPlay.disabled = leyendo && !enPausa;
  btnPausa.disabled = !leyendo || enPausa;
  btnStop.disabled = !leyendo;
}

btnPlay.addEventListener("click", reproducir);
btnPausa.addEventListener("click", pausar);
btnStop.addEventListener("click", detener);

// Cambiar el rango detiene la lectura en curso para evitar confusiones.
[inpDesde, inpHasta].forEach((inp) => inp.addEventListener("change", () => {
  if (leyendo) detener();
}));

// ---- Descargar el texto extraído como .txt -------------------------------
btnDescargar.addEventListener("click", () => {
  if (!paginasTexto.length) return;
  const texto = paginasTexto
    .map((t, i) => (totalPaginas > 1 ? `--- Página ${i + 1} ---\n` : "") + t.trim())
    .join("\n\n");
  const blob = new Blob([texto], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (nombreArchivo.replace(/\.pdf$/i, "") || "documento") + ".txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
});

// ---- Ajustes de voz ------------------------------------------------------

function poblarVoces() {
  const voces = synth.getVoices();
  if (!voces.length) return;
  // Voces en español primero.
  voces.sort((a, b) => {
    const ea = /es/i.test(a.lang) ? 0 : 1;
    const eb = /es/i.test(b.lang) ? 0 : 1;
    return ea - eb || a.name.localeCompare(b.name);
  });
  const previa = selVoz.value;
  selVoz.innerHTML = voces
    .map((v) => `<option value="${v.voiceURI}">${v.name} (${v.lang})${v.default ? " — predeterminada" : ""}</option>`)
    .join("");
  if (previa) selVoz.value = previa;
}

poblarVoces();
if (typeof synth.onvoiceschanged !== "undefined") {
  synth.onvoiceschanged = poblarVoces;
}

rngVel.addEventListener("input", () => { valVel.textContent = parseFloat(rngVel.value).toFixed(1) + "×"; });
rngTono.addEventListener("input", () => { valTono.textContent = parseFloat(rngTono.value).toFixed(1); });

// Aviso si el navegador no soporta la API de voz.
if (!synth) {
  mostrarEstado("Tu navegador no soporta lectura por voz (Web Speech). Prueba con Chrome, Edge o Safari.", true);
}

// ---- Atajos de teclado ---------------------------------------------------
// Espacio: reproducir/pausar · Esc: detener · ← →: frase anterior/siguiente
document.addEventListener("keydown", (e) => {
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
  if (lector.classList.contains("oculto") || !frases.length) return;

  switch (e.key) {
    case " ":
      e.preventDefault();
      if (leyendo && !synth.paused) pausar();
      else reproducir();
      break;
    case "Escape":
      detener();
      break;
    case "ArrowRight":
      e.preventDefault();
      reproducirDesde(Math.min(indiceActual + 1, frases.length - 1));
      break;
    case "ArrowLeft":
      e.preventDefault();
      reproducirDesde(Math.max(indiceActual - 1, 0));
      break;
  }
});

// Algunos navegadores pausan la síntesis en segundo plano; al cerrar la
// página detenemos cualquier lectura en curso.
window.addEventListener("beforeunload", () => synth.cancel());
