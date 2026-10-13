// Motor de puntuación de "productos ganadores".
//
// IMPORTANTE: los umbrales de abajo son HEURÍSTICOS (criterios de práctica
// habitual en dropshipping), no un modelo validado estadísticamente. Están
// agrupados en UMBRALES para que puedas ajustarlos a tu experiencia.
//
// Funciona en el navegador (window.Scoring) y en Node (module.exports) para
// poder probarlo con `node tests/scoring.test.js`.

(function (global) {
  const UMBRALES = {
    engagementPleno: 0.10,   // 10 % de interacción sobre vistas = puntaje máximo
    vistasDiaPleno: 50000,   // vistas por día para puntaje máximo de velocidad
    margenPleno: 0.65,       // 65 % de margen bruto = puntaje máximo
    diasActivoPleno: 30,     // anuncio pagado activo 30+ días = señal fuerte
    intencionPleno: 0.25,    // 5 de cada 20 comentarios preguntan precio o "¿dónde lo compro?"
  };

  const PESOS = { demanda: 30, margen: 25, prueba: 15, checklist: 30 };

  // Criterios cualitativos. Los marcados `bloqueante` dejan el producto como
  // "No apto" si no se cumplen, sin importar el resto del puntaje.
  const CRITERIOS = [
    // `pregunta` y `ayuda` son el texto para principiantes del asistente.
    { id: "wow", texto: "Efecto 'wow' visible en video",
      pregunta: "¿Se ve llamativo o sorprendente en un video?", ayuda: "Si al verlo piensas \"¡qué buena idea!\", es un sí." },
    { id: "problema", texto: "Resuelve un problema concreto",
      pregunta: "¿Soluciona un problema o molestia del día a día?", ayuda: "Ej.: cables enredados, dolor de espalda, ropa con pelusas." },
    { id: "noLocal", texto: "Difícil de encontrar en tiendas locales",
      pregunta: "¿Es difícil encontrarlo en tiendas de tu ciudad?", ayuda: "Si se vende en cualquier supermercado, la gente no te lo comprará a ti." },
    { id: "tresSeg", texto: "Se entiende en los primeros 3 segundos",
      pregunta: "¿Se entiende para qué sirve en 3 segundos?", ayuda: "La gente pasa los videos muy rápido. Si hay que explicarlo mucho, es un no." },
    { id: "impulso", texto: "Precio de compra por impulso para tu público",
      pregunta: "¿Alguien lo compraría sin pensarlo mucho por su precio?", ayuda: "Productos baratos o medianos se compran por impulso; los caros no." },
    { id: "envio", texto: "Liviano, no frágil, fácil de enviar",
      pregunta: "¿Es liviano y no se rompe fácil?", ayuda: "Lo pesado o frágil encarece el envío y genera reclamos." },
    { id: "sinMarca", texto: "No usa marca registrada ni imita un producto de marca", bloqueante: true,
      pregunta: "¿Es un producto SIN marca famosa y que NO es copia de una?", ayuda: "Vender copias de Nike, Apple, Disney, etc. es ilegal y te pueden cerrar la tienda." },
    { id: "permitido", texto: "No es producto restringido (salud, cosmética regulada, armas, etc.)", bloqueante: true,
      pregunta: "¿Es un producto de venta libre (no es medicamento, suplemento, arma ni similar)?", ayuda: "Esos productos requieren permisos especiales. Si tienes dudas, responde \"No sé\"." },
  ];

  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  const tope = (x) => Math.max(0, Math.min(1, x));

  function diasDesde(fechaISO, hoy = new Date()) {
    if (!fechaISO) return 0;
    const f = new Date(fechaISO + (fechaISO.length === 10 ? "T00:00:00" : ""));
    if (isNaN(f)) return 0;
    return Math.max(1, Math.floor((hoy - f) / 86400000));
  }

  function metricas(g, hoy = new Date()) {
    const vistas = num(g.vistas);
    const interacciones = num(g.likes) + num(g.comentarios) + num(g.compartidos);
    const engagement = vistas ? interacciones / vistas : 0;
    const dias = diasDesde(g.fechaPublicacion, hoy);
    const vistasDia = dias ? vistas / dias : 0;
    const costoTotal = num(g.costoProducto) + num(g.costoEnvio);
    const precio = num(g.precioVenta);
    const margen = precio ? (precio - costoTotal) / precio : 0;
    const multiplicador = costoTotal ? precio / costoTotal : 0;
    // Intención de compra sobre una muestra de comentarios leídos (por defecto
    // 20): nadie puede leer los miles de comentarios de un video viral.
    const muestra = num(g.muestraComentarios) || (num(g.comentariosCompra) ? 20 : 0);
    const intencion = muestra ? Math.min(1, num(g.comentariosCompra) / muestra) : 0;
    return { vistas, interacciones, engagement, dias, vistasDia, costoTotal, precio, margen, multiplicador, intencion };
  }

  function puntuar(g, hoy = new Date()) {
    const m = metricas(g, hoy);
    const U = UMBRALES;

    // Demanda: mitad engagement, mitad velocidad (escala logarítmica para no
    // premiar en exceso a los virales extremos).
    const sEng = tope(m.engagement / U.engagementPleno);
    const sVel = m.vistasDia ? tope(Math.log10(m.vistasDia + 1) / Math.log10(U.vistasDiaPleno + 1)) : 0;
    const demanda = (sEng + sVel) / 2;

    const margen = tope(m.margen / U.margenPleno);

    // Prueba de rentabilidad: días activo del anuncio pagado (quien paga
    // publicidad por semanas probablemente está vendiendo) o, si no hay dato,
    // comentarios con intención de compra.
    const sDias = tope(num(g.diasActivo) / U.diasActivoPleno);
    const sInt = tope(m.intencion / U.intencionPleno);
    const prueba = Math.max(sDias, sInt);

    const marcados = g.criterios || {};
    const cumplidos = CRITERIOS.filter((c) => marcados[c.id]).length;
    const checklist = cumplidos / CRITERIOS.length;
    const bloqueos = CRITERIOS.filter((c) => c.bloqueante && !marcados[c.id]).map((c) => c.texto);

    const desglose = {
      demanda: Math.round(demanda * PESOS.demanda),
      margen: Math.round(margen * PESOS.margen),
      prueba: Math.round(prueba * PESOS.prueba),
      checklist: Math.round(checklist * PESOS.checklist),
    };
    const total = desglose.demanda + desglose.margen + desglose.prueba + desglose.checklist;

    let veredicto;
    if (bloqueos.length) veredicto = "No apto";
    else if (total >= 70) veredicto = "Ganador probable";
    else if (total >= 50) veredicto = "Testear con poco presupuesto";
    else veredicto = "Descartar";

    return { total, desglose, veredicto, bloqueos, metricas: m };
  }

  // Precio sugerido: costo total × multiplicador, con redondeo psicológico.
  function precioSugerido(costoTotal, multiplicador = 2.8, moneda = "CLP") {
    const base = num(costoTotal) * multiplicador;
    if (!base) return 0;
    if (moneda === "CLP") return Math.max(990, Math.ceil(base / 1000) * 1000 - 10); // 19.990
    return Number((Math.floor(base) + 0.99).toFixed(2)); // 24.99
  }

  // Frecuencia de cada valor de `campo` entre los ganadores dados.
  function frecuencias(lista, campo) {
    const cuenta = {};
    lista.forEach((g) => {
      const v = (g[campo] || "").trim();
      if (v) cuenta[v] = (cuenta[v] || 0) + 1;
    });
    return Object.entries(cuenta)
      .map(([valor, n]) => ({ valor, n, pct: n / lista.length }))
      .sort((a, b) => b.n - a.n);
  }

  function mediana(valores) {
    const v = valores.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
    if (!v.length) return 0;
    const mid = Math.floor(v.length / 2);
    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  }

// Entiende "1,2 M", "15 mil", "15K", "19.990", "24.99", "$ 4.500".
  function leerNumero(txt) {
    let s = String(txt ?? "").trim().toLowerCase().replace(/[$\s]/g, "").replace(/^(us|mx|clp|usd)/, "");
    if (!s) return "";
    const sufijo = s.match(/(millones|millón|millon|mill|mil|k|m)$/);
    let mult = 1;
    if (sufijo) {
      mult = sufijo[1] === "k" || sufijo[1] === "mil" ? 1e3 : 1e6;
      s = s.slice(0, -sufijo[1].length).replace(",", ".");
    } else if (/^\d{1,3}([.,]\d{3})+$/.test(s)) {
      s = s.replace(/[.,]/g, "");                 // 19.990 / 1,200,000
    } else if (s.includes(".") && s.includes(",")) {
      const decimal = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
      s = s.split(decimal === "," ? "." : ",").join("").replace(",", "."); // 1.234,50 / 1,234.50
    } else {
      s = s.replace(",", ".");
    }
    const n = parseFloat(s);
    return Number.isFinite(n) ? Math.round(n * mult * 100) / 100 : "";
  }

  const api = { leerNumero, UMBRALES, PESOS, CRITERIOS, metricas, puntuar, precioSugerido, frecuencias, mediana, diasDesde };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.Scoring = api;
})(typeof window !== "undefined" ? window : globalThis);
