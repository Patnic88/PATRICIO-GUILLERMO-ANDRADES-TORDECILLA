// Motor de predicción (lógica pura, sin DOM).
// Se usa tanto en el navegador (prediccion.js) como en las pruebas (Node).
// Patrón UMD: en el navegador expone las funciones como globales; en Node las
// exporta con module.exports.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;         // Node / pruebas
  } else {
    Object.assign(root, api);     // Navegador: funciones globales
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

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

  // ---- Cálculo de similitud (TF-IDF + coseno) ------------------------------

  function textoFallo(f) {
    return [f.tema, f.resumen, (f.palabras || []).join(" "), f.texto].join(" ");
  }

  function frecuencias(txt) {
    const m = new Map();
    tokens(txt).forEach((t) => m.set(t, (m.get(t) || 0) + 1));
    return m;
  }

  // IDF: los términos que aparecen en muchos documentos pesan menos.
  function calcularIDF(documentos) {
    const N = documentos.length;
    const df = new Map();
    documentos.forEach((freqs) => {
      freqs.forEach((_, token) => df.set(token, (df.get(token) || 0) + 1));
    });
    const idf = new Map();
    df.forEach((n, token) => idf.set(token, Math.log(1 + N / n)));
    return idf;
  }

  function vectorTFIDF(freqs, idf) {
    const v = new Map();
    freqs.forEach((tf, token) => v.set(token, tf * (idf.get(token) || 0)));
    return v;
  }

  function coseno(a, b) {
    let dot = 0, na = 0, nb = 0;
    a.forEach((wa, t) => { na += wa * wa; if (b.has(t)) dot += wa * b.get(t); });
    b.forEach((wb) => { nb += wb * wb; });
    if (na === 0 || nb === 0) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  function terminosComunes(freqsCaso, freqsFallo, idf, max) {
    const comunes = [];
    freqsCaso.forEach((_, t) => { if (freqsFallo.has(t)) comunes.push(t); });
    return comunes
      .sort((x, y) => (idf.get(y) || 0) - (idf.get(x) || 0))
      .slice(0, max || 4);
  }

  function similitud(caso, f, ctx) {
    const semTexto = coseno(ctx.vectorCaso, ctx.vectores.get(f.id));
    const mismoRecurso = caso.recurso && f.recurso === caso.recurso ? 1 : 0;
    const mismaSala = caso.sala && f.sala === caso.sala ? 1 : 0;
    const temaSolape = caso.tema && f.tema
      ? jaccard(setDe(caso.tema), setDe(f.tema)) : 0;

    const score = 0.50 * semTexto + 0.22 * mismoRecurso + 0.13 * mismaSala + 0.15 * temaSolape;
    const comunes = terminosComunes(ctx.freqsCaso, ctx.freqsFallos.get(f.id), ctx.idf);
    return { score, semTexto, mismoRecurso, mismaSala, temaSolape, comunes };
  }

  // Peso por antigüedad: más reciente = más peso (0.5 a 1).
  function pesoAnio(anio, anioActual) {
    if (!anio) return 0.7;
    const diff = Math.max(0, anioActual - anio);
    return Math.max(0.5, 1 - diff * 0.05);
  }

  function valorResultado(r) {
    if (r === "acoge") return 1;
    if (r === "acoge_parcial") return 0.5;
    return 0; // rechaza
  }

  function etiquetaResultado(r) {
    return r === "acoge" ? "Acoge" : r === "acoge_parcial" ? "Acoge parcial" : "Rechaza";
  }

  function construirContexto(fallos, caso) {
    const freqsCaso = frecuencias(caso.hechos + " " + caso.tema);
    const freqsFallos = new Map();
    fallos.forEach((f) => freqsFallos.set(f.id, frecuencias(textoFallo(f))));

    const idf = calcularIDF([freqsCaso, ...freqsFallos.values()]);
    const vectorCaso = vectorTFIDF(freqsCaso, idf);
    const vectores = new Map();
    freqsFallos.forEach((fr, id) => vectores.set(id, vectorTFIDF(fr, idf)));

    return { freqsCaso, freqsFallos, idf, vectorCaso, vectores };
  }

  // Núcleo de la predicción (recibe la base de fallos como parámetro).
  function predecirCore(fallos, caso, anioActual) {
    const ctx = construirContexto(fallos, caso);
    const evaluados = fallos
      .map((f) => {
        const sim = similitud(caso, f, ctx);
        return { fallo: f, ...sim, peso: sim.score * pesoAnio(f.anio, anioActual) };
      })
      .filter((e) => e.score > 0.05)
      .sort((a, b) => b.peso - a.peso);

    if (evaluados.length === 0) {
      return { ok: false, motivo: "Sin coincidencias en tu base de fallos. Agrega sentencias del mismo tipo de recurso/tema." };
    }

    const top = evaluados.slice(0, 8);
    const sumaPeso = top.reduce((s, e) => s + e.peso, 0);
    const favorable = top.reduce((s, e) => s + e.peso * valorResultado(e.fallo.resultado), 0);
    const probabilidad = sumaPeso > 0 ? favorable / sumaPeso : 0;

    const nRelevantes = top.filter((e) => e.score > 0.2).length;
    const simPromedio = top.reduce((s, e) => s + e.score, 0) / top.length;
    let confianza = "baja";
    if (nRelevantes >= 4 && simPromedio > 0.3) confianza = "alta";
    else if (nRelevantes >= 2 && simPromedio > 0.18) confianza = "media";

    const acoge = top.filter((e) => valorResultado(e.fallo.resultado) >= 0.5).length;
    const dividida = acoge > 0 && acoge < top.length && Math.abs(probabilidad - 0.5) < 0.2;

    return { ok: true, probabilidad, confianza, dividida, nAnalizados: evaluados.length, top };
  }

  return {
    STOPWORDS, normalizar, tokens, setDe, jaccard,
    textoFallo, frecuencias, calcularIDF, vectorTFIDF, coseno, terminosComunes,
    similitud, pesoAnio, valorResultado, etiquetaResultado,
    construirContexto, predecirCore
  };
});
