// Revisión automática de una respuesta antes de publicarla.
//
// Las alertas "bloqueantes" impiden publicar sin confirmación expresa del
// vendedor. Son reglas prudentes de la herramienta (no sacar al comprador de
// la plataforma, no pedir pagos por fuera), no una transcripción de las
// políticas del marketplace: revísalas contra esas políticas.
//
// Funciona en el navegador (window.ReglasRespuesta) y en Node.

(function (global) {
  const LARGO_MAX = 2000;

  const REGLAS = [
    { id: "contacto", bloqueante: true,
      mensaje: "Incluye datos de contacto o redes (teléfono, correo, WhatsApp, Instagram…). Las consultas y la compra se coordinan dentro de la plataforma.",
      patron: /[\w.+-]+@[\w-]+\.[\w.]+|\+?56\s?9[\s-]?\d{4}[\s-]?\d{4}|\b9\s?\d{4}\s?\d{4}\b|whats\s?app|\bwsp\b|telegram|instagram|facebook|\btik\s?tok\b|ll[aá]ma(me|nos)|escr[ií]be(me|nos) al/i },
    { id: "enlace", bloqueante: true,
      mensaje: "Incluye un enlace externo.",
      patron: /https?:\/\/|www\.|\b[a-z0-9-]+\.(cl|com|net|org|xyz|ly)\b\/?/i },
    { id: "pagoExterno", bloqueante: true,
      mensaje: "Sugiere pagar por fuera (transferencia, depósito, efectivo). Eso deja al comprador sin la protección de la plataforma.",
      patron: /transferencia|dep[oó]sit|cuenta rut|cuenta corriente|efectivo|pago (por|en) fuera|por fuera de la plataforma/i },
    { id: "promesa", bloqueante: false,
      mensaje: "Contiene una promesa absoluta. Confirma que puedes cumplirla.",
      patron: /garantizad[oa]|100\s?% (seguro|original)|nunca falla|llega (hoy|mañana) seguro|sin falta/i },
  ];

  function revisar(texto) {
    const t = String(texto || "").trim();
    const alertas = [];
    if (!t) alertas.push({ id: "vacia", bloqueante: true, mensaje: "La respuesta está vacía." });
    if (t.length > LARGO_MAX) alertas.push({ id: "larga", bloqueante: true, mensaje: `Supera los ${LARGO_MAX} caracteres (tiene ${t.length}).` });
    for (const r of REGLAS) {
      if (r.patron.test(t)) alertas.push({ id: r.id, bloqueante: r.bloqueante, mensaje: r.mensaje });
    }
    return { texto: t, alertas, bloqueada: alertas.some((a) => a.bloqueante) };
  }

  const api = { revisar, REGLAS, LARGO_MAX };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.ReglasRespuesta = api;
})(typeof window !== "undefined" ? window : globalThis);
