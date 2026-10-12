// Motor de señales de riesgo para ofertas de trabajo (sin IA, sin internet).
//
// IMPORTANTE: las reglas y pesos de abajo son HEURÍSTICOS. Recogen patrones
// descritos en advertencias públicas sobre "estafas de tareas" y ofertas
// falsas (pago diario alto, tareas vagas, traslado a WhatsApp/Telegram,
// cobro por "activar" la cuenta), no un modelo validado con casos reales.
// Un resultado "bajo" NO certifica que la oferta sea legítima: solo indica que
// el texto no contiene las señales que estas reglas buscan.
//
// Funciona en el navegador (window.Senales) y en Node (module.exports) para
// poder probarlo con `node tests/senales.test.js`.

(function (global) {
  // Marcas que suelen usarse para dar credibilidad a avisos falsos. `dominios`
  // son los dominios oficiales contra los que se comparan los enlaces del
  // aviso; déjalo vacío si no lo has verificado. Amplía la lista a tu gusto.
  const MARCAS = [
    { nombre: "Mercado Libre", patron: /mercado\s*libre|mercadolibre/i,
      // [VERIFICAR] dominios oficiales antes de vender el servicio.
      dominios: ["mercadolibre.cl", "mercadolibre.com", "mercadopago.cl", "mercadopago.com"] },
    { nombre: "Mercado Pago", patron: /mercado\s*pago/i,
      dominios: ["mercadopago.cl", "mercadopago.com", "mercadolibre.cl", "mercadolibre.com"] },
    { nombre: "Amazon", patron: /\bamazon\b/i, dominios: [] },
    { nombre: "Falabella", patron: /falabella/i, dominios: [] },
    { nombre: "Ripley", patron: /\bripley\b/i, dominios: [] },
    { nombre: "Paris", patron: /\btiendas? paris\b|\bparis\.cl\b/i, dominios: [] },
    { nombre: "Lider / Walmart", patron: /\blider\b|walmart/i, dominios: [] },
    { nombre: "Shein", patron: /\bshein\b/i, dominios: [] },
    { nombre: "Temu", patron: /\btemu\b/i, dominios: [] },
    { nombre: "AliExpress", patron: /aliexpress/i, dominios: [] },
    { nombre: "TikTok", patron: /tik\s*tok/i, dominios: [] },
    { nombre: "Correos de Chile", patron: /correos de chile/i, dominios: [] },
    { nombre: "Chilexpress", patron: /chilexpress/i, dominios: [] },
    { nombre: "Starken", patron: /starken/i, dominios: [] },
    { nombre: "BancoEstado", patron: /banco\s*estado/i, dominios: [] },
  ];

  const EMPLEO = /\b(trabajo|trabajar|empleo|vacante|postula|únete|unete|equipo|reclut|contrat(amos|ando)|buscamos personal|oferta laboral|turnos?)\b/i;

  const ACORTADORES = ["bit.ly", "tinyurl.com", "cutt.ly", "t.co", "is.gd", "rb.gy", "shorturl.at", "s.id", "ow.ly", "goo.su", "t.ly"];
  const TLD_RIESGO = ["xyz", "top", "club", "icu", "cyou", "vip", "shop", "online", "site", "live", "buzz", "work", "click", "info"];

  // Cada señal: `peso` suma al puntaje; `critica` fuerza riesgo alto.
  // `patron` es una RegExp o una función (texto, ctx) => evidencia | null.
  const SENALES = [
    {
      id: "pidePago", peso: 35, critica: true,
      titulo: "Te piden pagar, depositar o recargar",
      explicacion: "Es la señal más grave. En las estafas de tareas, después de pagos pequeños se pide un depósito para \"desbloquear\" ganancias. Si te cobran por trabajar, no es un trabajo.",
      patron: /dep[oó]sit\w*|transfi[ée]re\w*|recarga\w*|inversi[oó]n (inicial|m[ií]nima)|pago de inscripci[oó]n|cuota de (ingreso|inscripci[oó]n)|activar (tu |la )?cuenta|desbloquea\w*|comisi[oó]n por adelantado|\busdt\b|criptomoneda\w*|binance|kit de inicio/i,
    },
    {
      id: "datosSensibles", peso: 30, critica: true,
      titulo: "Te piden claves o datos sensibles",
      explicacion: "Ningún proceso de selección necesita tu clave bancaria, códigos que te llegan por SMS, datos de tu tarjeta ni fotos de tu carnet para empezar.",
      patron: /\b(tu|su) clave\b|clave (bancaria|de (tu )?banco|secreta|[uú]nica)|contrase[nñ]a|c[oó]digo (de verificaci[oó]n|sms|que te lleg)|\bcvv\b|n[uú]mero de (tu )?tarjeta|foto (de )?(tu )?(carnet|c[eé]dula)|datos bancarios/i,
    },
    {
      id: "marcaEmpleo", peso: 20,
      titulo: "Usa una marca conocida para ofrecer trabajo",
      explicacion: "Los avisos falsos suelen usar marcas conocidas para dar confianza. Que un aviso use una marca no prueba que venga de esa empresa: búscalo en su sitio oficial de empleos.",
      patron: (texto, ctx) => (ctx.marca && EMPLEO.test(texto) ? ctx.marca.evidencia : null),
    },
    {
      id: "montoDiario", peso: 20,
      titulo: "Promete un monto por día u hora",
      explicacion: "Las ofertas formales suelen indicar sueldo mensual, tipo de contrato y requisitos. Un monto diario alto por una tarea simple es un anzuelo frecuente.",
      patron: /(ingreso|ganancia|pago|sueldo|gana[rs]?|ganar[aá]s)\w*\s*(diari[oa]s?|al d[ií]a|por d[ií]a|por hora|cada d[ií]a)[^\n]{0,30}?\d[\d.,]*|\$?\s?\d{1,3}(?:[.,]\d{3})+\s*(?:clp|pesos(?: chilenos)?)?[^\n]{0,25}?(al d[ií]a|diari[oa]s?|por d[ií]a|por hora|cada d[ií]a)/i,
    },
    {
      id: "mensajeria", peso: 12,
      titulo: "Te lleva a WhatsApp, Telegram o a un número personal",
      explicacion: "Sacar la conversación de la plataforma dificulta verificar quién está detrás y es un paso habitual de estas estafas.",
      patron: /whats\s?app|\bwsp\b|wa\.me|telegram|t\.me\/|escr[ií]be(nos|me) al|\+?56\s?9[\s-]?\d{4}[\s-]?\d{4}/i,
    },
    {
      id: "tareaVaga", peso: 15,
      titulo: "La tarea es vaga o \"demasiado simple\"",
      explicacion: "\"Procesar pedidos\", \"dar me gusta\" o \"calificar productos\" sin explicar para quién ni cómo se calcula el pago es un patrón típico de las estafas de tareas.",
      patron: /procesar (los )?pedidos|dar (me gusta|likes?)|\blikes\b|calificar (productos|tiendas)|evaluar productos|(escribir|dejar) rese[nñ]as|completar tareas|tareas (simples|sencillas|diarias)|aumentar (las )?ventas|impulsar (los )?pedidos|ver videos|seguir cuentas/i,
    },
    {
      id: "enlaceSospechoso", peso: 10,
      titulo: "Enlace acortado o de dominio poco habitual",
      explicacion: "Los acortadores ocultan el destino real y algunos dominios baratos se usan para sitios de una sola campaña. Escribe tú la dirección oficial en el navegador.",
      patron: (texto, ctx) => {
        const malo = ctx.enlaces.find((e) => ACORTADORES.includes(e.host) ||
          TLD_RIESGO.includes(e.host.split(".").pop()));
        return malo ? malo.url : null;
      },
    },
    {
      id: "dominioNoOficial", peso: 15,
      titulo: "El enlace no es del dominio oficial de la marca",
      explicacion: "El aviso nombra una marca, pero el enlace lleva a otro sitio. Los sitios falsos suelen imitar el nombre de la marca con guiones o palabras extra.",
      patron: (texto, ctx) => {
        if (!ctx.marca || !ctx.marca.dominios.length) return null;
        const ajeno = ctx.enlaces.find((e) => !ctx.marca.dominios.some((d) => e.host === d || e.host.endsWith("." + d)));
        return ajeno ? ajeno.url : null;
      },
    },
    {
      id: "sinRequisitos", peso: 8,
      titulo: "No pide experiencia ni requisitos",
      explicacion: "\"Sin experiencia\" o \"solo necesitas tu celular\" no es ilegal, pero junto a un pago alto es una combinación habitual en avisos falsos.",
      patron: /sin experiencia|no (se )?requiere(s)? experiencia|solo (necesitas|requieres) (un |tu )?(celular|tel[eé]fono|m[oó]vil)|cualquier persona puede/i,
    },
    {
      id: "pagoDiario", peso: 8,
      titulo: "Ofrece \"pago diario\" o inmediato",
      explicacion: "El pago diario o inmediato por tareas en línea se usa para ganar confianza rápido antes de pedir dinero.",
      patron: /pago\s+(diario|inmediato|al instante)|te pagamos (todos los d[ií]as|al instante|de inmediato)|retiro inmediato/i,
    },
    {
      id: "urgencia", peso: 6,
      titulo: "Te apura",
      explicacion: "La prisa (\"últimos cupos\", \"solo hoy\") busca que no alcances a verificar.",
      patron: /cupos? limitad\w*|[uú]ltimos cupos|solo (por )?hoy|post[uú]la (ya|ahora)|solicita (ya|ahora)|reserva(r)? ahora|inscr[ií]bete (ya|ahora)|no te lo pierdas|por tiempo limitado|hasta agotar/i,
    },
    {
      id: "facilidad", peso: 5,
      titulo: "Promete dinero fácil",
      explicacion: "Ningún trabajo real se describe solo por lo fácil que es ganar dinero.",
      patron: /dinero f[aá]cil|sin esfuerzo|(trabajo|proceso|tarea)s? (muy )?(f[aá]cil|sencill[oa]|simple)\w*/i,
    },
    {
      id: "desdeCasa", peso: 4,
      titulo: "Trabajo desde casa",
      explicacion: "Hay trabajos remotos legítimos; esta señal solo pesa si va junto a las demás.",
      patron: /desde (tu |la )?casa|home ?office|teletrabajo|100\s?% remoto/i,
    },
    {
      id: "horarioFlexible", peso: 3,
      titulo: "Horario \"a tu elección\"",
      explicacion: "Por sí sola no es mala señal; suma cuando el resto del aviso es vago.",
      patron: /horario flexible|elige (tu|el) horario|t[uú] eliges (el|tu) horario|puedes elegir el horario/i,
    },
  ];

  // Señales de formalidad: restan puntaje si no hay señales críticas.
  const A_FAVOR = [
    { id: "contrato", peso: 8, titulo: "Menciona contrato o sueldo mensual",
      patron: /contrato (indefinido|a plazo fijo|de trabajo)|sueldo (base|l[ií]quido|bruto|mensual)|renta (l[ií]quida|bruta|mensual)/i },
    { id: "procesoFormal", peso: 6, titulo: "Describe un proceso de selección (CV, entrevista)",
      patron: /(enviar|env[ií]a|adjunta)\w* (tu |el )?(cv|curr[ií]culum)|entrevista (presencial|personal|por video)|requisitos:/i },
  ];

  const UMBRALES = { alto: 50, medio: 25 };

  function normalizar(texto) {
    return String(texto || "").replace(/\s+/g, " ").trim();
  }

  // Extrae un fragmento corto alrededor de la coincidencia, como evidencia.
  // Corta en espacios para no partir palabras.
  function fragmento(texto, m) {
    let ini = Math.max(0, m.index - 30);
    let fin = Math.min(texto.length, m.index + m[0].length + 30);
    if (ini > 0) { const e = texto.indexOf(" ", ini); if (e !== -1 && e < m.index) ini = e + 1; }
    if (fin < texto.length) { const e = texto.lastIndexOf(" ", fin); if (e > m.index + m[0].length) fin = e; }
    return (ini > 0 ? "…" : "") + texto.slice(ini, fin).trim() + (fin < texto.length ? "…" : "");
  }

  function extraerEnlaces(texto) {
    // El lookbehind descarta correos (usuario@dominio.cl) y fragmentos de palabras.
    const re = /(?<![@\w.-])((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s)]*)?)/gi;
    const vistos = new Set();
    const enlaces = [];
    let m;
    while ((m = re.exec(texto))) {
      const url = m[1].replace(/[.,;:!?]+$/, "");
      let host;
      try { host = new URL(/^https?:\/\//i.test(url) ? url : "https://" + url).hostname.toLowerCase(); }
      catch (e) { continue; }
      if (host.startsWith("www.")) host = host.slice(4);
      // Evita confundir montos como "60.000" o abreviaturas con dominios.
      if (!/[a-z]/.test(host.split(".").pop()) || vistos.has(host + url)) continue;
      vistos.add(host + url);
      enlaces.push({ url, host });
    }
    return enlaces;
  }

  function detectarMarca(texto) {
    for (const marca of MARCAS) {
      const m = texto.match(marca.patron);
      if (m) return { nombre: marca.nombre, dominios: marca.dominios, evidencia: fragmento(texto, m) };
    }
    return null;
  }

  function evaluar(patron, texto, ctx) {
    if (typeof patron === "function") return patron(texto, ctx);
    const m = texto.match(patron);
    return m ? fragmento(texto, m) : null;
  }

  function analizar(entrada) {
    const texto = normalizar(entrada);
    if (texto.length < 15) {
      return { nivel: "sin_datos", puntaje: 0, senales: [], aFavor: [], marca: null, enlaces: [] };
    }
    const ctx = { marca: detectarMarca(texto), enlaces: extraerEnlaces(texto) };

    const senales = [];
    for (const s of SENALES) {
      const evidencia = evaluar(s.patron, texto, ctx);
      if (evidencia) senales.push({ id: s.id, titulo: s.titulo, explicacion: s.explicacion, peso: s.peso, critica: !!s.critica, evidencia });
    }
    const aFavor = [];
    for (const s of A_FAVOR) {
      const evidencia = evaluar(s.patron, texto, ctx);
      if (evidencia) aFavor.push({ id: s.id, titulo: s.titulo, peso: s.peso, evidencia });
    }

    const critica = senales.some((s) => s.critica);
    const bruto = senales.reduce((t, s) => t + s.peso, 0) - (critica ? 0 : aFavor.reduce((t, s) => t + s.peso, 0));
    const puntaje = Math.max(0, Math.min(100, bruto));
    const nivel = critica || puntaje >= UMBRALES.alto ? "alto" : puntaje >= UMBRALES.medio ? "medio" : "bajo";

    return { nivel, puntaje, senales, aFavor, marca: ctx.marca && ctx.marca.nombre, enlaces: ctx.enlaces };
  }

  const NIVELES = {
    alto: { etiqueta: "Alto riesgo", resumen: "El aviso reúne varias señales típicas de ofertas falsas. No postules ni entregues datos hasta verificarlo en la fuente oficial." },
    medio: { etiqueta: "Riesgo medio", resumen: "Hay señales que conviene revisar. Verifica la oferta en el sitio oficial de la empresa antes de entregar cualquier dato." },
    bajo: { etiqueta: "Pocas señales", resumen: "No se detectaron las señales que estas reglas buscan. Eso no prueba que sea legítima: verifica igual antes de postular." },
    sin_datos: { etiqueta: "Falta texto", resumen: "Pega el texto completo del aviso para analizarlo." },
  };

  const CONSEJOS = {
    hacer: [
      "Busca la oferta en el sitio oficial de empleos de la empresa o en su página de LinkedIn. Escribe tú la dirección; no uses el enlace del aviso.",
      "Si ya entregaste datos o dinero, guarda capturas, chats y comprobantes.",
      "Reporta el anuncio en la red social donde lo viste.",
      "Si perdiste dinero, denuncia en Carabineros, PDI o Fiscalía.",
    ],
    noHacer: [
      "No deposites ni transfieras dinero para \"activar\" o \"desbloquear\" nada.",
      "No entregues claves, códigos que te lleguen por SMS, datos de tarjeta ni fotos de tu carnet.",
      "No sigas la conversación por WhatsApp o Telegram con desconocidos que te apuran.",
    ],
  };

  const api = { analizar, extraerEnlaces, detectarMarca, MARCAS, SENALES, A_FAVOR, UMBRALES, NIVELES, CONSEJOS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.Senales = api;
})(typeof window !== "undefined" ? window : globalThis);
