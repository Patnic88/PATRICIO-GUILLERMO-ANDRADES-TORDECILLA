// Conexión con la API de Claude usando el SDK oficial (vendor/anthropic-sdk.js):
// modelos y precios, costo estimado por respuesta, presupuesto local, armado
// de la solicitud y ejecución en streaming con pausa (pause_turn) y rechazos.
//
// Precios: platform.claude.com/docs/en/about-claude/pricing (consultado el
// 9-oct-2026). Son estimaciones: el cobro real está en la Consola de Claude.
(function (global) {
  "use strict";

  const FUENTE_PRECIOS = "platform.claude.com/docs/en/about-claude/pricing (consultado el 9-oct-2026)";

  // USD por millón de tokens. Haiku 5.5 tiene dos tarifas según el largo del
  // prompt (entrada + lectura de caché + escritura de caché).
  const PRECIOS = {
    "claude-haiku-5-5": [
      { hasta: 100000, entrada: 0.10, escritura: 0.125, lectura: 0.01, salida: 0.50 },
      { hasta: Infinity, entrada: 0.50, escritura: 0.625, lectura: 0.05, salida: 2.50 },
    ],
    "claude-sonnet-5-5": [{ hasta: Infinity, entrada: 2, escritura: 2.50, lectura: 0.10, salida: 10 }],
    // Modelo al que puede derivar el respaldo automático de Sonnet 5.5.
    "claude-sonnet-5": [{ hasta: Infinity, entrada: 2, escritura: 2.50, lectura: 0.20, salida: 10 }],
  };
  const PRECIO_BUSQUEDA = 0.01; // USD 10 por cada 1.000 búsquedas web

  const MODELOS = [
    { id: "claude-haiku-5-5", nombre: "Claude Haiku 5.5", corto: "Haiku 5.5",
      explica: "Muy barato y rápido: loops, borradores, atención al cliente y revisión diaria." },
    { id: "claude-sonnet-5-5", nombre: "Claude Sonnet 5.5", corto: "Sonnet 5.5",
      explica: "Más calidad: estrategia, marca, fichas y anuncios. Cuesta unas 20 veces más que Haiku." },
  ];

  const ESFUERZOS = [
    { id: "low", nombre: "Rápido" },
    { id: "medium", nombre: "Normal" },
    { id: "high", nombre: "A fondo" },
  ];

  const MAX_TOKENS = 32000;
  const MAX_BUSQUEDAS = 5;
  const MAX_REANUDACIONES = 3;

  // ---- Costos -------------------------------------------------------------

  function tarifa(modelo, tokensPrompt) {
    const tabla = PRECIOS[modelo] || PRECIOS["claude-sonnet-5-5"];
    return tabla.find((t) => tokensPrompt <= t.hasta) || tabla[tabla.length - 1];
  }

  // usage: el objeto `usage` de la respuesta. Devuelve USD y el detalle.
  function costo(usage, modelo) {
    const u = usage || {};
    const entrada = u.input_tokens || 0;
    const escritura = u.cache_creation_input_tokens || 0;
    const lectura = u.cache_read_input_tokens || 0;
    const salida = u.output_tokens || 0;
    const busquedas = (u.server_tool_use && u.server_tool_use.web_search_requests) || 0;
    const t = tarifa(modelo, entrada + escritura + lectura);
    const detalle = {
      entrada: (entrada * t.entrada) / 1e6,
      escritura: (escritura * t.escritura) / 1e6,
      lectura: (lectura * t.lectura) / 1e6,
      salida: (salida * t.salida) / 1e6,
      busquedas: busquedas * PRECIO_BUSQUEDA,
    };
    const total = Object.values(detalle).reduce((s, v) => s + v, 0);
    return { total, detalle, tokens: { entrada, escritura, lectura, salida, busquedas }, conocido: Boolean(PRECIOS[modelo]) };
  }

  function usd(n) {
    if (!n) return "USD 0";
    if (n < 0.01) return "USD " + n.toFixed(4).replace(".", ",");
    return "USD " + n.toFixed(2).replace(".", ",");
  }

  // ---- Ajustes, clave y gasto (localStorage) --------------------------------

  const KEY_AJUSTES = "asistente_ia_claude_ajustes_v1";
  const KEY_CLAVE = "asistente_ia_claude_clave_v1";
  const AJUSTES_BASE = { modelo: "claude-haiku-5-5", esfuerzo: "medium", presupuesto: 100, gastado: 0, recordar: false };
  let claveEnMemoria = "";

  function leer(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }
  function escribir(key, valor) { try { localStorage.setItem(key, JSON.stringify(valor)); return true; } catch (e) { return false; } }

  function ajustes() { return { ...AJUSTES_BASE, ...(leer(KEY_AJUSTES) || {}) }; }
  function guardarAjustes(cambios) { const a = { ...ajustes(), ...cambios }; escribir(KEY_AJUSTES, a); return a; }

  function sumarGasto(monto) { return guardarAjustes({ gastado: Math.round((ajustes().gastado + (monto || 0)) * 1e6) / 1e6 }); }

  function clave() {
    if (claveEnMemoria) return claveEnMemoria;
    const guardada = leer(KEY_CLAVE);
    return typeof guardada === "string" ? guardada : "";
  }

  function guardarClave(valor, recordar) {
    claveEnMemoria = String(valor || "").trim();
    try {
      if (recordar && claveEnMemoria) localStorage.setItem(KEY_CLAVE, JSON.stringify(claveEnMemoria));
      else localStorage.removeItem(KEY_CLAVE);
    } catch (e) { /* sin almacenamiento: queda solo en memoria */ }
    guardarAjustes({ recordar: Boolean(recordar) });
  }

  function olvidarClave() {
    claveEnMemoria = "";
    try { localStorage.removeItem(KEY_CLAVE); } catch (e) { /* nada que borrar */ }
  }

  function formatoClaveValido(valor) { return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(String(valor || "").trim()); }

  // Estado del presupuesto: "ok", "aviso" (≥ 80 %) o "agotado".
  function estadoPresupuesto(a) {
    const x = a || ajustes();
    if (!(x.presupuesto > 0)) return "ok";
    if (x.gastado >= x.presupuesto) return "agotado";
    if (x.gastado >= 0.8 * x.presupuesto) return "aviso";
    return "ok";
  }

  // ---- Solicitud ---------------------------------------------------------------

  function sistemaBase({ fecha, pais, busqueda }) {
    const lineas = [
      "Eres el asistente de IA de una tienda online de dropshipping. Respondes en español, de forma clara y práctica, con tablas cuando ayudan a comparar.",
      `La fecha de hoy es ${fecha}.`,
    ];
    if (busqueda) {
      lineas.push(
        "Tienes búsqueda web. Tus datos de entrenamiento terminan bastante antes de hoy: precios, reglas, plataformas, proveedores, tendencias y todo lo «último» pueden haber cambiado, así que búscalos antes de afirmarlos, aunque te sientas seguro. Lo que no puede cambiar no necesita búsqueda.",
        `Cuando la respuesta dependa del país del usuario${pais ? ` (${pais})` : ""}, incluye el país en la búsqueda. Cita la fuente (nombre y enlace) de cada dato que saques de internet.`
      );
    } else {
      lineas.push("En esta conversación no tienes acceso a internet: no digas que buscaste algo y marca [VERIFICAR] todo dato que requiera información actual.");
    }
    return lineas.join("\n");
  }

  // conv: { modelo, esfuerzo, busqueda, sistema, mensajes }
  function armarSolicitud(conv) {
    const p = {
      model: conv.modelo,
      max_tokens: MAX_TOKENS,
      system: conv.sistema,
      messages: conv.mensajes,
      cache_control: { type: "ephemeral" }, // caché automática del historial
      thinking: { type: "adaptive", display: "summarized" },
      output_config: { effort: conv.esfuerzo || "medium" },
    };
    if (conv.busqueda) p.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: MAX_BUSQUEDAS }];
    // Sonnet 5.5: respaldo automático del servidor si un clasificador rechaza
    // la solicitud. Haiku 5.5 no tiene respaldo del lado del servidor.
    if (conv.modelo === "claude-sonnet-5-5") {
      p.betas = ["server-side-fallback-2026-07-01"];
      p.fallbacks = "default";
    }
    return p;
  }

  // Tras un respaldo a mitad de respuesta, antes del último bloque `fallback`
  // se omiten razonamientos y llamadas a herramientas sin su resultado.
  function contenidoParaHistorial(content) {
    const bloques = Array.isArray(content) ? content : [];
    let corte = -1;
    bloques.forEach((b, i) => { if (b && b.type === "fallback") corte = i; });
    if (corte < 0) return bloques;
    const conResultado = new Set(bloques.filter((b) => b && b.tool_use_id).map((b) => b.tool_use_id));
    return bloques.filter((b, i) => {
      if (i >= corte) return true;
      if (b.type === "text") return true;
      if (b.type === "server_tool_use") return conResultado.has(b.id);
      if (b.type === "web_search_tool_result") return true;
      return false;
    });
  }

  // ---- Errores -------------------------------------------------------------------

  function explicarError(err) {
    const SDK = global.AnthropicSDK && global.AnthropicSDK.default;
    const mensaje = (err && err.message) || String(err);
    const cuerpo = err && err.error && err.error.error;
    const codigo = cuerpo && cuerpo.details && cuerpo.details.error_code;
    if (SDK && err instanceof SDK.APIUserAbortError) return { tipo: "detenido", texto: "Detuviste la respuesta." };
    if (SDK && err instanceof SDK.AuthenticationError) return { tipo: "clave", texto: "La clave de API no es válida o fue revocada. Revísala en la Consola de Claude y vuelve a conectarla." };
    if (SDK && err instanceof SDK.PermissionDeniedError) return { tipo: "permiso", texto: "Tu clave no tiene permiso para esta acción o modelo. Detalle: " + mensaje };
    if (SDK && err instanceof SDK.RateLimitError) {
      if (codigo === "enforced_spend_limit_reached") return { tipo: "tope", texto: "Tu organización llegó al tope mensual de gasto de su nivel. La API se reactiva el día 1 del próximo mes (UTC) o al subir de nivel." };
      return { tipo: "limite", texto: "Demasiadas solicitudes por minuto. Espera un momento y vuelve a intentar." };
    }
    if (SDK && err instanceof SDK.BadRequestError) {
      if (/specified (workspace )?API usage limits/i.test(mensaje)) return { tipo: "tope", texto: "Llegaste al límite de gasto que configuraste en la Consola de Claude (Settings → Billing → Spend limits). Súbelo allí si quieres seguir." };
      if (/web search/i.test(mensaje) && /enabled/i.test(mensaje)) return { tipo: "busqueda", texto: "La búsqueda web está desactivada para tu organización en la Consola de Claude. Desmarca «Búsqueda web» o actívala allí." };
      return { tipo: "solicitud", texto: "La API rechazó la solicitud: " + mensaje };
    }
    if (SDK && err instanceof SDK.APIConnectionError) return { tipo: "red", texto: "No hay conexión con la API de Claude. Revisa tu internet e intenta de nuevo." };
    if (SDK && err instanceof SDK.InternalServerError) return { tipo: "servidor", texto: "Claude está con problemas o sobrecargado. Intenta de nuevo en unos minutos." };
    if (SDK && err instanceof SDK.APIError) return { tipo: "api", texto: `Error de la API (${err.status || "?"}): ${mensaje}` };
    return { tipo: "desconocido", texto: "Error inesperado: " + mensaje };
  }

  // ---- Cliente y ejecución ---------------------------------------------------------

  function crearCliente(apiKey) {
    const SDK = global.AnthropicSDK && global.AnthropicSDK.default;
    if (!SDK) throw new Error("No se cargó el SDK de Anthropic (vendor/anthropic-sdk.js).");
    return new SDK({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
  }

  // Verifica la clave sin gastar tokens: consulta la ficha del modelo.
  async function probarConexion(apiKey, modelo) {
    const cliente = crearCliente(apiKey);
    return cliente.models.retrieve(modelo);
  }

  // Ejecuta un turno: envía conv.mensajes (que ya termina en el mensaje del
  // usuario) y va avisando por `eventos`. Reanuda solo si la API pausa el turno.
  // Devuelve { respuestas, costos (USD por respuesta), costo, stop_reason, refusal }.
  async function ejecutarTurno(cliente, conv, eventos, senal) {
    const e = eventos || {};
    const respuestas = [];
    const costos = [];
    let costoTotal = 0;
    for (let ronda = 0; ronda <= MAX_REANUDACIONES; ronda++) {
      const solicitud = armarSolicitud({ ...conv, mensajes: conv.mensajes.concat(respuestas.map((m) => ({ role: "assistant", content: contenidoParaHistorial(m.content) }))) });
      const stream = solicitud.betas ? cliente.beta.messages.stream(solicitud) : cliente.messages.stream(solicitud);
      if (senal) senal.abortar = () => stream.abort();
      for await (const ev of stream) {
        if (ev.type === "content_block_start") e.inicioBloque && e.inicioBloque(ev.content_block);
        else if (ev.type === "content_block_delta") {
          if (ev.delta.type === "text_delta") e.texto && e.texto(ev.delta.text);
          else if (ev.delta.type === "thinking_delta") e.razonamiento && e.razonamiento(ev.delta.thinking);
          else if (ev.delta.type === "input_json_delta") e.entradaHerramienta && e.entradaHerramienta(ev.delta.partial_json);
        }
      }
      const final = await stream.finalMessage();
      const c = costo(final.usage, final.model || conv.modelo);
      costoTotal += c.total;
      costos.push(c.total);
      e.costo && e.costo(c, final);
      respuestas.push(final);
      if (final.stop_reason !== "pause_turn") break;
    }
    const ultima = respuestas[respuestas.length - 1];
    return {
      respuestas,
      costos,
      costo: costoTotal,
      stop_reason: ultima && ultima.stop_reason,
      refusal: ultima && ultima.stop_reason === "refusal" ? (ultima.stop_details || {}) : null,
    };
  }

  // Texto, razonamiento, búsquedas y fuentes de una lista de bloques.
  function resumirBloques(content) {
    const r = { texto: "", razonamiento: "", busquedas: [], fuentes: [], respaldo: null };
    const vistas = new Set();
    for (const b of content || []) {
      if (b.type === "text") {
        r.texto += b.text;
        for (const c of b.citations || []) {
          if (c.url && !vistas.has(c.url)) { vistas.add(c.url); r.fuentes.push({ url: c.url, titulo: c.title || c.url }); }
        }
      } else if (b.type === "thinking" && b.thinking) r.razonamiento += (r.razonamiento ? "\n\n" : "") + b.thinking;
      else if (b.type === "server_tool_use" && b.name === "web_search" && b.input && b.input.query) r.busquedas.push(b.input.query);
      else if (b.type === "fallback") r.respaldo = `${(b.from && b.from.model) || "?"} → ${(b.to && b.to.model) || "?"}`;
    }
    return r;
  }

  const api = {
    FUENTE_PRECIOS, PRECIOS, PRECIO_BUSQUEDA, MODELOS, ESFUERZOS, MAX_TOKENS, MAX_BUSQUEDAS,
    costo, usd, tarifa, ajustes, guardarAjustes, sumarGasto, clave, guardarClave, olvidarClave, formatoClaveValido,
    estadoPresupuesto, sistemaBase, armarSolicitud, contenidoParaHistorial, explicarError, crearCliente, probarConexion,
    ejecutarTurno, resumirBloques,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.ClaudeAPI = api;
})(typeof window !== "undefined" ? window : globalThis);
