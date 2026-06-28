// ============================================================================
//  Consultor Laboral y Tributario · Chile — lógica
//  Sin servidor. Los valores y el banco de consultas viven en referencias.js.
//  El estado del banco de consultas se guarda en localStorage.
// ============================================================================

const V = window.VALORES || {};
const STORE_CONSULTAS = "consultas_chile_v1";

// ---- Utilidades ----------------------------------------------------------

function clp(n) {
  return "$" + Math.round(n).toLocaleString("es-CL");
}
function esc(txt) {
  const d = document.createElement("div");
  d.textContent = txt ?? "";
  return d.innerHTML;
}
function num(id) {
  return parseFloat(document.getElementById(id).value) || 0;
}

// ---- Navegación por pestañas --------------------------------------------

document.getElementById("tabs").addEventListener("click", (e) => {
  const tab = e.target.closest(".tab");
  if (!tab) return;
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  tab.classList.add("active");
  const destino = tab.dataset.tab;
  document.querySelectorAll(".panel").forEach((p) => {
    p.classList.toggle("oculto", p.id !== "panel-" + destino);
  });
});

// ============================================================================
//  BANCO DE CONSULTAS
// ============================================================================

let consultas = [];
let areaActual = "todas";
let textoBusqueda = "";

function cargarConsultas() {
  const guardado = localStorage.getItem(STORE_CONSULTAS);
  if (guardado) {
    try { consultas = JSON.parse(guardado); return; } catch (e) { /* usa semilla */ }
  }
  consultas = clonarConsultas();
}
function guardarConsultas() {
  localStorage.setItem(STORE_CONSULTAS, JSON.stringify(consultas));
}
function clonarConsultas() {
  return (window.CONSULTAS_SEED || []).map((c) => ({ ...c, abierta: false }));
}

function consultasVisibles() {
  const q = textoBusqueda.trim().toLowerCase();
  return consultas.filter((c) => {
    if (areaActual !== "todas" && c.area !== areaActual) return false;
    if (!q) return true;
    const blob = [c.pregunta, c.respuesta, c.tema, c.fundamento, (c.etiquetas || []).join(" ")]
      .join(" ").toLowerCase();
    return blob.includes(q);
  });
}

function renderConsultas() {
  const ul = document.getElementById("listaConsultas");
  const vis = consultasVisibles();
  ul.innerHTML = vis.map((c) => {
    const fundamento = c.fundamento
      ? `<span class="fundamento">⚖️ ${esc(c.fundamento)}</span>` : "";
    const tema = c.tema ? `<span class="badge cat">${esc(c.tema)}</span>` : "";
    const respuesta = c.abierta
      ? `<div class="respuesta">${esc(c.respuesta)}${fundamento ? "<br>" + fundamento : ""}</div>` : "";
    return `
      <li class="consulta area-${esc(c.area)} ${c.abierta ? "abierta" : ""}" data-id="${esc(c.id)}">
        <div class="consulta-head">
          <div class="pregunta" data-toggle>${esc(c.pregunta)}</div>
          <button class="btn-del" title="Eliminar" aria-label="Eliminar">✕</button>
        </div>
        <div class="consulta-meta">
          <span class="badge area-${esc(c.area)}">${esc(c.area)}</span>
          ${tema}
        </div>
        ${respuesta}
      </li>`;
  }).join("");
  document.getElementById("consultasVacio").classList.toggle("oculto", vis.length > 0);
}

document.getElementById("listaConsultas").addEventListener("click", (e) => {
  const li = e.target.closest(".consulta");
  if (!li) return;
  const c = consultas.find((x) => x.id === li.dataset.id);
  if (!c) return;
  if (e.target.classList.contains("btn-del")) {
    if (confirm("¿Eliminar esta consulta del banco?")) {
      consultas = consultas.filter((x) => x.id !== c.id);
      guardarConsultas();
      renderConsultas();
    }
  } else if (e.target.hasAttribute("data-toggle")) {
    c.abierta = !c.abierta;
    guardarConsultas();
    renderConsultas();
  }
});

document.getElementById("areaFilters").addEventListener("click", (e) => {
  if (!e.target.classList.contains("chip")) return;
  document.querySelectorAll("#areaFilters .chip").forEach((c) => c.classList.remove("active"));
  e.target.classList.add("active");
  areaActual = e.target.dataset.area;
  renderConsultas();
});

document.getElementById("buscar").addEventListener("input", (e) => {
  textoBusqueda = e.target.value;
  renderConsultas();
});

// Formulario nueva consulta
const formC = document.getElementById("formConsulta");
document.getElementById("btnNuevaConsulta").addEventListener("click", () => {
  formC.classList.toggle("oculto");
  if (!formC.classList.contains("oculto")) document.getElementById("cPregunta").focus();
});
document.getElementById("cCancelar").addEventListener("click", () => {
  formC.classList.add("oculto");
  formC.reset();
});
formC.addEventListener("submit", (e) => {
  e.preventDefault();
  consultas.unshift({
    id: "u-" + Date.now(),
    area: document.getElementById("cArea").value,
    tema: document.getElementById("cTema").value.trim(),
    pregunta: document.getElementById("cPregunta").value.trim(),
    respuesta: document.getElementById("cRespuesta").value.trim(),
    fundamento: document.getElementById("cFundamento").value.trim(),
    etiquetas: [],
    abierta: true,
  });
  guardarConsultas();
  formC.reset();
  formC.classList.add("oculto");
  renderConsultas();
});

document.getElementById("btnResetConsultas").addEventListener("click", () => {
  if (confirm("Esto restaurará el banco original y descartará tus cambios locales. ¿Continuar?")) {
    consultas = clonarConsultas();
    guardarConsultas();
    renderConsultas();
  }
});

// ============================================================================
//  CALCULADORA DE FINIQUITO
// ============================================================================

function mesesEntre(d1, d2) {
  // Retorna {anios, mesesFraccion, totalMeses} entre dos fechas.
  let meses = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
  if (d2.getDate() < d1.getDate()) meses -= 1;
  if (meses < 0) meses = 0;
  return meses;
}

function aniosIndemnizables(fIngreso, fTermino) {
  const totalMeses = mesesEntre(fIngreso, fTermino);
  const aniosCompletos = Math.floor(totalMeses / 12);
  const mesesResto = totalMeses % 12;
  // Fracción superior a 6 meses se cuenta como un año completo.
  return mesesResto > 6 ? aniosCompletos + 1 : aniosCompletos;
}

document.getElementById("fCalcular").addEventListener("click", () => {
  const out = document.getElementById("fResultado");
  const remBruta = num("fRemuneracion");
  const ingreso = document.getElementById("fIngreso").value;
  const termino = document.getElementById("fTermino").value;
  const causal = document.getElementById("fCausal").value;
  const dioAviso = document.getElementById("fAviso").checked;
  const diasFeriado = num("fFeriado");

  if (!ingreso || !termino) {
    out.classList.remove("oculto");
    out.innerHTML = `<p class="nota">Ingresa la fecha de ingreso y de término para calcular.</p>`;
    return;
  }
  const dIngreso = new Date(ingreso + "T00:00:00");
  const dTermino = new Date(termino + "T00:00:00");
  if (dTermino <= dIngreso) {
    out.classList.remove("oculto");
    out.innerHTML = `<p class="nota">La fecha de término debe ser posterior a la de ingreso.</p>`;
    return;
  }

  // Tope de remuneración: 90 UF
  const topeRem = V.topeIndemnizacionUF * V.uf;
  const remTope = Math.min(remBruta, topeRem);
  const topeada = remBruta > topeRem;

  const aniosReales = aniosIndemnizables(dIngreso, dTermino);
  const generaIndem = causal === "161" || causal === "injustificado";
  const aniosPagables = generaIndem ? Math.min(aniosReales, V.topeAniosIndemnizacion) : 0;

  const indemAnios = aniosPagables * remTope;
  const indemAviso = (generaIndem && !dioAviso) ? remTope : 0;

  // Feriado proporcional: valor del día = remuneración / 30; días hábiles
  // se convierten a corridos aprox. (×1,4) para una estimación prudente.
  const valorDiaFeriado = remBruta / 30;
  const feriadoProporcional = diasFeriado * valorDiaFeriado * 1.4;

  const total = indemAnios + indemAviso + feriadoProporcional;

  const filas = [];
  if (generaIndem) {
    filas.push(["Indemnización años de servicio", `${aniosPagables} año(s) × ${clp(remTope)}`, indemAnios]);
    if (aniosReales > V.topeAniosIndemnizacion) {
      filas.push(["", `Topeado a ${V.topeAniosIndemnizacion} años (de ${aniosReales} reales)`, null]);
    }
    filas.push([
      indemAviso > 0 ? "Indemnización sustitutiva aviso previo" : "Aviso previo dado (sin pago sustitutivo)",
      indemAviso > 0 ? "1 mes" : "—", indemAviso,
    ]);
  } else {
    filas.push(["Indemnización años de servicio", "No aplica para esta causal", 0]);
  }
  if (diasFeriado > 0) {
    filas.push(["Feriado proporcional (estimado)", `${diasFeriado} días hábiles`, feriadoProporcional]);
  }

  out.classList.remove("oculto");
  out.innerHTML = `
    <h3>Resultado estimado</h3>
    <table>
      ${filas.map(([k, sub, val]) => `
        <tr>
          <td>${esc(k)}${sub ? `<br><span class="nota">${esc(sub)}</span>` : ""}</td>
          <td>${val === null ? "" : clp(val)}</td>
        </tr>`).join("")}
      <tr class="total"><td>Total finiquito (estimado)</td><td>${clp(total)}</td></tr>
    </table>
    <p class="nota">
      ${topeada ? `La remuneración (${clp(remBruta)}) supera el tope de 90 UF (${clp(topeRem)}); la indemnización se calcula sobre el tope. ` : ""}
      Estimación referencial. El feriado proporcional se aproxima convirtiendo días hábiles a corridos;
      el cálculo exacto depende de la fecha de ingreso. No incluye remuneraciones ni gratificaciones pendientes.
    </p>`;
});

// ============================================================================
//  LIQUIDACIÓN DE SUELDO
// ============================================================================

document.getElementById("lCalcular").addEventListener("click", () => {
  const out = document.getElementById("lResultado");
  const bruto = num("lBruto");
  const indefinido = document.getElementById("lIndefinido").checked;

  // Tope imponible AFP/salud
  const topeAFP = V.topeImponibleUF * V.uf;
  const topeAFC = V.topeImponibleAFCUF * V.uf;
  const imponibleAFP = Math.min(bruto, topeAFP);
  const imponibleAFC = Math.min(bruto, topeAFC);

  const afp = imponibleAFP * V.tasaAFPObligatoria;
  const comision = imponibleAFP * V.tasaComisionAFP;
  const salud = imponibleAFP * V.tasaSalud;
  const cesantia = indefinido ? imponibleAFC * V.afcTrabajadorIndefinido : 0;

  const totalPrevisional = afp + comision + salud + cesantia;
  const baseTributable = bruto - totalPrevisional;
  const impuesto = impuestoUnico(baseTributable).impuesto;

  const liquido = bruto - totalPrevisional - impuesto;

  out.classList.remove("oculto");
  out.innerHTML = `
    <h3>Liquidación estimada</h3>
    <table>
      <tr><td>Sueldo bruto imponible</td><td>${clp(bruto)}</td></tr>
      <tr class="resta"><td>AFP (10%)</td><td>− ${clp(afp)}</td></tr>
      <tr class="resta"><td>Comisión AFP (${(V.tasaComisionAFP * 100).toFixed(2)}%)</td><td>− ${clp(comision)}</td></tr>
      <tr class="resta"><td>Salud (7%)</td><td>− ${clp(salud)}</td></tr>
      ${indefinido ? `<tr class="resta"><td>Seguro cesantía (0,6%)</td><td>− ${clp(cesantia)}</td></tr>` : ""}
      <tr class="resta"><td>Impuesto único 2ª categoría</td><td>− ${clp(impuesto)}</td></tr>
      <tr class="total"><td>Líquido aproximado</td><td>${clp(liquido)}</td></tr>
    </table>
    <p class="nota">
      Base tributable: ${clp(baseTributable)}. Comisión AFP referencial (varía por AFP).
      No considera asignaciones no imponibles (colación, movilización) ni cargas familiares.
      ${bruto > topeAFP ? `El sueldo supera el tope imponible (${clp(topeAFP)}); las cotizaciones se calculan sobre el tope.` : ""}
    </p>`;
});

// ============================================================================
//  IMPUESTO ÚNICO DE SEGUNDA CATEGORÍA
// ============================================================================

function impuestoUnico(base) {
  const tabla = window.TABLA_IUSC || [];
  const utm = V.utm;
  const baseUTM = base / utm;
  for (const tramo of tabla) {
    if (baseUTM > tramo.desdeUTM && baseUTM <= tramo.hastaUTM) {
      const impuesto = Math.max(0, base * tramo.factor - tramo.rebajaUTM * utm);
      const tasaEfectiva = base > 0 ? impuesto / base : 0;
      return { impuesto, tramo, tasaEfectiva, baseUTM };
    }
  }
  return { impuesto: 0, tramo: tabla[0], tasaEfectiva: 0, baseUTM };
}

function renderTablaIusc(baseUTMactiva) {
  const tabla = window.TABLA_IUSC || [];
  const utm = V.utm;
  const filas = tabla.map((t) => {
    const desde = clp(t.desdeUTM * utm);
    const hasta = t.hastaUTM === Infinity ? "y más" : clp(t.hastaUTM * utm);
    const activo = baseUTMactiva != null && baseUTMactiva > t.desdeUTM && baseUTMactiva <= t.hastaUTM;
    return `<tr class="${activo ? "activo" : ""}">
      <td>${t.desdeUTM} – ${t.hastaUTM === Infinity ? "∞" : t.hastaUTM} UTM</td>
      <td>${desde} – ${hasta}</td>
      <td>${(t.factor * 100).toFixed(1)}%</td>
      <td>${t.rebajaUTM} UTM</td>
    </tr>`;
  }).join("");
  document.getElementById("tablaIusc").innerHTML = `
    <thead><tr><th>Tramo (UTM)</th><th>Tramo ($)</th><th>Factor</th><th>Rebaja</th></tr></thead>
    <tbody>${filas}</tbody>`;
}

document.getElementById("iCalcular").addEventListener("click", () => {
  const out = document.getElementById("iResultado");
  const base = num("iBase");
  const r = impuestoUnico(base);
  renderTablaIusc(r.baseUTM);
  out.classList.remove("oculto");
  out.innerHTML = `
    <h3>Impuesto estimado</h3>
    <table>
      <tr><td>Base tributable</td><td>${clp(base)} (${r.baseUTM.toFixed(2)} UTM)</td></tr>
      <tr><td>Tramo aplicable</td><td>${(r.tramo.factor * 100).toFixed(1)}% · rebaja ${r.tramo.rebajaUTM} UTM</td></tr>
      <tr class="total"><td>Impuesto único</td><td>${clp(r.impuesto)}</td></tr>
      <tr><td>Tasa efectiva</td><td>${(r.tasaEfectiva * 100).toFixed(2)}%</td></tr>
    </table>
    <p class="nota">Cálculo con UTM = ${clp(V.utm)}. Fórmula SII: base × factor − rebaja × UTM.</p>`;
});

// ============================================================================
//  VALORES VIGENTES
// ============================================================================

function renderValores() {
  document.getElementById("valoresVigencia").textContent = "Vigencia: " + (window.REF_VIGENCIA || "—");
  const items = [
    ["UF", clp(V.uf)],
    ["UTM", clp(V.utm)],
    ["UTA", clp(V.uta)],
    ["Ingreso mínimo", clp(V.ingresoMinimo)],
    ["Tope imponible AFP/salud", V.topeImponibleUF + " UF"],
    ["Tope imponible cesantía", V.topeImponibleAFCUF + " UF"],
    ["Cotización AFP", (V.tasaAFPObligatoria * 100) + "%"],
    ["Salud", (V.tasaSalud * 100) + "%"],
    ["Seguro cesantía (trab.)", (V.afcTrabajadorIndefinido * 100) + "%"],
    ["Tope indemnización", V.topeIndemnizacionUF + " UF"],
    ["Tope años indemnizables", V.topeAniosIndemnizacion + " años"],
    ["Gratificación tope", V.gratificacionTopeIMM + " IMM/año"],
  ];
  document.getElementById("valoresGrid").innerHTML = items.map(([etq, num]) => `
    <div class="valor-card">
      <div class="etq">${esc(etq)}</div>
      <div class="num">${esc(num)}</div>
    </div>`).join("");
}

// ============================================================================
//  INIT
// ============================================================================

document.getElementById("today").textContent = new Date().toLocaleDateString("es-CL", {
  weekday: "long", day: "numeric", month: "long", year: "numeric",
});
document.getElementById("vigencia").textContent = window.REF_VIGENCIA
  ? "UF " + clp(V.uf) + " · UTM " + clp(V.utm) : "valores referenciales";

cargarConsultas();
renderConsultas();
renderTablaIusc(null);
renderValores();
