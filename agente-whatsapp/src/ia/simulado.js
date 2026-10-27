// Proveedor SIMULADO. No es inteligencia artificial: es un conjunto de reglas
// fijas que imita el formato de respuesta de la API (texto y llamadas a
// herramientas) para revisar el sistema completo sin claves ni costos:
// webhook, memoria, herramientas, citas, comprobantes, alertas, derivación y
// controles de seguridad. Sus respuestas son deliberadamente simples; la
// calidad conversacional real se evalúa con el proveedor "anthropic".

import { sinTildes } from "../servicios/conocimiento.js";

const PREGUNTAS = {
  nombre: "¿Me indica su nombre, por favor?",
  motivo: "¿Me cuenta brevemente el motivo de su consulta?",
  materia: "¿Su consulta es laboral, civil, tributaria, contable, migratoria, municipal, administrativa o sobre constitución de empresas?",
  comuna: "¿En qué comuna vive o dónde ocurrió la situación?",
  tribunal: "¿Sabe en qué tribunal está la causa?",
  rol_rit: "¿Tiene el rol o RIT de la causa?",
  resolucion: "¿Qué resolución o documento le notificaron?",
  fecha_notificacion: "¿En qué fecha fue notificado?",
  documentos_disponibles: "¿Tiene documentos relacionados, como contratos, notificaciones o resoluciones? Puede enviarlos por aquí.",
  fechas_relevantes: "¿Hay alguna fecha importante, como una audiencia, una notificación o un vencimiento?"
};

const MATERIAS = [
  ["laboral", /\b(despid|trabajo|emplead|empleador|finiquito|sueldo|remuneraci|licencia medica|contrato de trabajo|cotizaciones|jefe|horas extra|carta de aviso)/],
  ["migratoria", /\b(visa|residencia|extranjer|migra|permanencia|expulsi|pasaporte|nacionalidad)/],
  ["tributaria", /\b(sii|impuesto|iva|renta|tributari|giro|liquidacion del sii|declaracion)/],
  ["contable", /\b(contabilidad|contable|balance|libro de compras|remuneraciones mensuales)/],
  ["constitucion_empresa", /\b(constituir|crear una empresa|formar una empresa|sociedad|spa\b|eirl|iniciar actividades|emprendimiento)/],
  ["municipal", /\b(municipal|municipio|patente|permiso de circulacion|alcald|concejo|ordenanza)/],
  ["administrativa", /\b(sumario|contraloria|servicio publico|funcionari|reclamo administrativo|seremi)/],
  ["familia", /\b(pension de alimentos|divorcio|cuidado personal|tuicion|visitas|separacion)/],
  ["civil", /\b(arriendo|arrendatario|contrato|deuda|cobro|herencia|posesion efectiva|propiedad|remate|embargo|demanda|indemnizacion|choque|vecino)/]
];

const RE_INYECCION = /(ignora|olvida|omite|desobedece)\b.{0,40}(instrucciones|reglas|indicaciones)|modo (desarrollador|administrador|dios)|prompt del sistema|system prompt|(datos|informacion|expediente|conversacion)(es)? de (otro|otra|otros|otras) cliente|muestrame (todos|todas) (los|las) (clientes|conversaciones|expedientes)/;
const RE_ESTADO = /(estado|como va|novedad|avance|que paso con)\b.{0,40}\b(causa|caso|juicio|tramite|asunto|expediente|demanda|solicitud)|\bmis (pagos|documentos)\b|\bcomo va (mi|la|el)\b/;
const RE_HUMANO = /(hablar|conversar|comunicarme|contactar)\b.{0,10}\bcon (patricio|el abogado|don patricio|una persona|alguien|un humano|el contador)|quiero (una persona|un humano)/;
const RE_CITA = /\b(agendar|agenda|cita|reunion|reservar|una hora|hora de atencion|atenderme|cuando puedo ir|disponibilidad)\b/;
const RE_INFO = /(cuanto (cobra|cobran|cuesta|vale|sale)|\bvalor\b|precio|honorario|tarifa|costo|horario|direccion|donde (estan|quedan|queda|atienden)|ubicad|que servicios|servicios|atienden|cuenta (corriente|bancaria|rut|vista)|medios? de pago|como (les )?pago)/;
const RE_PAGO = /(pague|pagado|pago|transferi|transferencia|comprobante|abono|abone|deposit)/;
const RE_SALUDO = /^((hola|buen(as|os)( dias| tardes| noches)?|saludos|alo|que tal)[\s!.,¡]*)+$/;
const RE_NEGATIVA = /^(no|no tengo|ninguno|ninguna|nada|no se|todavia no|aun no|no por ahora)\b/;
const RE_RUT = /\b(\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK])\b/;

const ETIQUETA_ESTADO = { en_evaluacion: "en evaluación", en_curso: "en curso", suspendido: "suspendido", cerrado: "cerrado" };

let contador = 0;
const usar = (name, input) => ({ type: "tool_use", id: `toolu_sim_${Date.now().toString(36)}_${++contador}`, name, input });
const texto = (t) => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn", modelo: "simulado", uso: {} });

function desescapar(s) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

// Separa: texto de los mensajes nuevos del cliente y resultados de
// herramientas ya ejecutadas en este turno.
function leerTurno(mensajes) {
  let iSistema = mensajes.findIndex((m) => m.role === "system");
  let iUsuario = iSistema > 0 ? iSistema - 1 : -1;
  if (iSistema < 0) {
    // Contexto incrustado en el último mensaje de usuario con texto.
    for (let i = mensajes.length - 1; i >= 0; i--) {
      if (mensajes[i].role === "user" && mensajes[i].content.some((b) => b.type === "text")) { iUsuario = i; break; }
    }
    iSistema = iUsuario;
  }
  const bloques = (mensajes[iUsuario]?.content || []).filter((b) => b.type === "text" && !b.text.startsWith("<contexto_interno>"));
  const crudo = bloques.map((b) => b.text).join("\n");
  const textoCliente = desescapar(crudo.replace(/<mensaje_cliente[^>]*>/g, "").replace(/<\/mensaje_cliente>/g, "\n").replace(/\[Adjunto recibido:[^\]]*\]/g, "")).trim();
  const previos = mensajes.slice(0, iUsuario).filter((m) => m.role === "user").flatMap((m) => m.content.filter((b) => b.type === "text").map((b) => desescapar(b.text)));
  const ultimoAgente = [...mensajes.slice(0, iUsuario)].reverse().find((m) => m.role === "assistant")?.content?.map((b) => b.text || "").join(" ") || "";
  const resultados = [];
  for (let i = iSistema + 1; i < mensajes.length; i++) {
    const m = mensajes[i];
    if (m.role !== "assistant") continue;
    for (const b of m.content) {
      if (b.type !== "tool_use") continue;
      const res = mensajes[i + 1]?.content?.find((r) => r.type === "tool_result" && r.tool_use_id === b.id);
      let salida = null;
      try { salida = res ? JSON.parse(res.content) : null; } catch { salida = { error: "resultado_ilegible" }; }
      resultados.push({ name: b.name, input: b.input, output: salida || {} });
    }
  }
  return { textoCliente, resultados, previos, ultimoAgente };
}

function falloGestion(r) {
  return r?.output?.error === "fallo_interno";
}
const MSG_FALLO = "No pude completar esa gestión por un problema técnico, así que no quedó realizada. Ya avisé a Patricio para que la revise.";

function siguientePregunta(faltan, excluir = []) {
  const f = (faltan || []).find((x) => !excluir.includes(x));
  return f ? PREGUNTAS[f] : null;
}

function extraerDatos(original, t, estado) {
  const d = {};
  const faltan = estado.faltan || [];
  const primero = faltan[0];
  const palabras = original.trim().split(/\s+/).filter(Boolean);
  const corto = palabras.length <= 4 && !/\d/.test(original);

  const mNombre = original.match(/\b(?:me llamo|mi nombre es|soy)\s+(?!de\b|del\b|cliente\b|la\b|el\b|un\b|una\b)([A-Za-zÁÉÍÓÚÑáéíóúñ]+(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]+){0,3})/i);
  if (mNombre) d.nombre_declarado = mNombre[1].split(/\s+(?:y|de la comuna|vivo|tengo|necesito|quiero|desde|me|mi)\b/i)[0].trim();
  else if (primero === "nombre" && corto && !RE_SALUDO.test(t) && !RE_NEGATIVA.test(t)) d.nombre_declarado = original.trim();

  const mComuna = original.match(/\b(?:[Cc]omuna de|[Vv]ivo en|[Ss]oy de|[Dd]esde la comuna de)\s+([A-ZÁÉÍÓÚÑ][\wáéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+){0,2})/);
  if (mComuna) d.comuna = mComuna[1];
  else if (primero === "comuna" && corto && !RE_NEGATIVA.test(t)) d.comuna = original.trim();

  const materia = MATERIAS.find(([, re]) => re.test(t));
  if (materia) d.materia = materia[0];
  else if (primero === "materia") {
    const m = ["laboral", "civil", "tributaria", "contable", "migratoria", "municipal", "administrativa"].find((x) => t.includes(x.slice(0, 6)));
    if (m) d.materia = m;
  }

  if (palabras.length >= 6 && !estado.solicitud?.motivo) d.motivo = original.trim().slice(0, 500);

  const mRol = original.match(/\b(?:rol|rit|ruc)\s*(?:n[°ºo.]*\s*)?:?\s*([A-Za-z]?-?\d{1,6}-\d{4})/i);
  if (mRol) d.rol_rit = mRol[1].toUpperCase();
  const mTrib = original.match(/\b((?:juzgado|tribunal|corte)\s[^.,\n]{3,60})/i);
  if (mTrib) d.tribunal = mTrib[1].trim();

  const fechas = estado.senales?.fechasLiterales || [];
  const mNotif = original.match(/notific\w*\s+(?:el\s+)?(?:d[ií]a\s+)?(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{1,2} de [a-záéíóú]+)/i);
  if (mNotif) d.fecha_notificacion = mNotif[1];
  const senales = (estado.senales?.senales || []).map((s) => s.etiqueta).join(", ");
  const otras = fechas.filter((f) => f !== d.fecha_notificacion);
  // Sin un modelo de lenguaje no es posible saber a qué hecho corresponde
  // cada fecha: se registran tal cual, junto a las señales del mensaje.
  if (senales && otras.length) d.fechas_relevantes = otras.map((f) => ({ descripcion: `fecha mencionada (${senales})`, fecha_texto: f }));

  if (RE_NEGATIVA.test(t) && palabras.length <= 6) {
    if (primero === "documentos_disponibles") d.documentos_disponibles = ["ninguno"];
    else if (primero === "fechas_relevantes") d.hay_fechas_relevantes = "no";
    else if (["tribunal", "rol_rit", "resolucion", "fecha_notificacion"].includes(primero)) d[primero] = "no dispone";
  } else if (primero === "documentos_disponibles" && /\b(si|tengo|tenemos)\b/.test(t)) {
    d.documentos_disponibles = [original.trim().slice(0, 150)];
  } else if (primero === "fechas_relevantes" && fechas.length && !d.fechas_relevantes) {
    d.fechas_relevantes = [{ descripcion: original.trim().slice(0, 150), fecha_texto: fechas[0] }];
  } else if (primero === "resolucion" && !RE_NEGATIVA.test(t) && palabras.length >= 1 && !d.rol_rit) {
    d.resolucion = original.trim().slice(0, 300);
  }

  if (/\b(ya soy cliente|soy cliente)\b/.test(t)) d.tipo_cliente = "existente";
  else if (!estado.vinculado && !estado.solicitud) d.tipo_cliente = "nuevo";
  if (estado.senales?.urgencia && estado.senales.urgencia !== "normal") d.urgencia = estado.senales.urgencia;
  return d;
}

function resumenExpediente(out) {
  if (!out?.ok) return "No pude obtener la información de su asunto en este momento. Avisé a Patricio para que la revise.";
  if (!out.asuntos.length) return "No encuentro asuntos registrados a su nombre. Si cree que es un error, puedo dejar el aviso a Patricio.";
  const a = out.asuntos[0];
  const partes = [`Su asunto «${a.titulo}» figura ${ETIQUETA_ESTADO[a.estado] || a.estado}.`];
  if (a.gestiones?.length) partes.push(`Última gestión registrada (${a.gestiones[0].fecha}): ${a.gestiones[0].descripcion}.`);
  if (a.siguiente_accion) partes.push(`Próximo paso informado por la oficina: ${a.siguiente_accion}.`);
  const pend = out.pagos.filter((p) => p.estado === "pendiente_verificacion").length;
  if (pend) partes.push(`Tiene ${pend} comprobante(s) pendiente(s) de verificación por la oficina.`);
  const ver = out.pagos.filter((p) => p.estado === "verificado");
  if (ver.length) partes.push(`La oficina registra ${ver.length} pago(s) verificado(s).`);
  return partes.join(" ") + " ¿Necesita algo más sobre este asunto?";
}

function planificar(original, estado, previos = [], ultimoAgente = "") {
  const t = sinTildes(original).trim();
  const nombreConocido = estado.solicitud?.nombre_declarado || estado.cliente?.nombre || null;
  const saludo = estado.primerContacto ? "Hola, soy el asistente virtual de A & A jurídico y contable. " : "";

  // 1. Intentos de alterar las reglas o de obtener datos ajenos.
  if (RE_INYECCION.test(t)) {
    return { pasos: [], final: () => "No puedo atender esa solicitud. Puedo ayudarle con información sobre nuestros servicios o con su propia consulta." };
  }

  // 2. Documentos recibidos.
  const docs = estado.documentosNuevos || [];
  if (docs.length) {
    const audio = docs.find((d) => d.clase === "audio");
    if (audio && docs.length === 1) return { pasos: [], final: () => `${saludo}Recibí una nota de voz, pero no puedo escuchar audios. ¿Me podría escribir su consulta, por favor?` };
    const esPago = RE_PAGO.test(t) || docs.some((d) => /comprobante|transferencia|voucher|pago/i.test(d.nombre || ""));
    if (esPago) {
      const monto = original.match(/\$\s?[\d.]+/)?.[0];
      return {
        pasos: docs.map((d) => () => usar("registrar_comprobante", { documento_id: d.id, ...(monto ? { monto_declarado: monto } : {}) })),
        final: (res) => res.some(falloGestion) ? MSG_FALLO
          : `${saludo}Recibí su comprobante. Quedó registrado como pendiente de verificación: la oficina lo revisará y le avisará cuando el pago esté verificado.`
      };
    }
    return {
      pasos: [
        ...docs.map((d) => () => usar("asociar_documento", { documento_id: d.id, descripcion: (original || d.nombre || "Documento enviado por el cliente").slice(0, 300) })),
        () => usar("registrar_solicitud", { documentos_disponibles: docs.map((d) => d.nombre || `documento #${d.id}`) })
      ],
      final: (res) => {
        if (res.some(falloGestion)) return MSG_FALLO;
        const reg = res.find((r) => r.name === "registrar_solicitud")?.output;
        const pregunta = siguientePregunta(reg?.faltan, ["documentos_disponibles"]);
        return `${saludo}Recibí ${docs.length > 1 ? "los documentos" : `el documento «${docs[0].nombre || "sin nombre"}»`} y quedó asociado a su solicitud.${pregunta ? ` ${pregunta}` : " ¿Tiene algún otro antecedente que agregar?"}`;
      }
    };
  }

  // 3. Verificación de identidad (RUT + código).
  // Si el cliente envía solo el código, se usa el RUT que dio en sus mensajes recientes.
  const hablaCodigo = /\b(codigo|clave|pin)\b/.test(t) || /^\s*\d{4,8}\s*$/.test(t) || /RUT|código/.test(ultimoAgente);
  const mRut = original.match(RE_RUT) || (hablaCodigo ? [...previos].slice(-6).reverse().map((x) => x.match(RE_RUT)).find(Boolean) : null);
  const sinRut = mRut ? original.replace(mRut[0], " ") : original;
  const mCodigo = sinRut.match(/\b(\d{4,8})\b/);
  if (mRut && mCodigo && !estado.verificado) {
    if (estado.bloqueadoHasta) return { pasos: [], final: () => "Por seguridad, la verificación de identidad está bloqueada temporalmente. Avisé a Patricio para que se comunique con usted." };
    return {
      pasos: [
        () => usar("verificar_identidad", { rut: mRut[1], codigo: mCodigo[1] }),
        (res) => (res[0].output.ok ? usar("consultar_expediente", {}) : null)
      ],
      final: (res) => {
        const v = res[0].output;
        if (falloGestion(res[0])) return MSG_FALLO;
        if (!v.ok) return v.motivo === "bloqueado_temporalmente"
          ? "Por seguridad, la verificación quedó bloqueada temporalmente. Avisé a Patricio para que se comunique con usted."
          : "Los datos no coinciden con nuestros registros. ¿Puede revisarlos e intentarlo nuevamente?";
        return `Gracias, ${v.nombre}. Su identidad quedó verificada. ${resumenExpediente(res[1]?.output)}`;
      }
    };
  }

  // 4. Consulta sobre un asunto en curso.
  if (RE_ESTADO.test(t)) {
    if (estado.verificado) return { pasos: [() => usar("consultar_expediente", {})], final: (res) => resumenExpediente(res[0].output) };
    if (estado.bloqueadoHasta) return { pasos: [], final: () => "Por seguridad, la verificación de identidad está bloqueada temporalmente. Avisé a Patricio para que se comunique con usted." };
    return { pasos: [], final: () => `${saludo}Para resguardar la confidencialidad, antes de revisar un asunto necesito verificar su identidad. ¿Me indica su RUT y el código de verificación que le entregó la oficina?` };
  }

  // 5. Pide hablar con una persona.
  if (RE_HUMANO.test(t)) {
    return {
      pasos: [() => usar("transferir_a_patricio", { motivo: "El cliente pidió hablar con Patricio", resumen: (estado.solicitud?.motivo || original).slice(0, 1000) })],
      final: (res) => (res[0].output.ok ? "Entendido. Dejé aviso a Patricio para que continúe personalmente esta conversación." : MSG_FALLO)
    };
  }

  // 6. Citas.
  const enAgenda = estado.solicitud?.siguiente_accion === "agendar_cita";
  const eleccion = enAgenda ? (t.match(/^(?:la |el |opcion |numero )?([1-6])\b/) || t.match(/\b(primera|segunda|tercera|cuarta|quinta|sexta)\b/)) : null;
  if (eleccion) {
    const idx = /^\d$/.test(eleccion[1]) ? Number(eleccion[1]) - 1 : ["primera", "segunda", "tercera", "cuarta", "quinta", "sexta"].indexOf(eleccion[1]);
    return {
      pasos: [
        () => usar("consultar_disponibilidad", {}),
        (res) => {
          const op = res[0].output.opciones?.[idx];
          return op ? usar("agendar_cita", { inicio: op.inicio, nombre: nombreConocido || "Sin nombre", motivo: estado.solicitud?.motivo || "Consulta (motivo por registrar)" }) : null;
        }
      ],
      final: (res) => {
        const ag = res.find((r) => r.name === "agendar_cita");
        if (!ag) return res[0].output.configurada ? "No encuentro esa opción. ¿Le muestro nuevamente los horarios disponibles?" : "Por ahora no tengo horarios para ofrecer en línea. Su solicitud de cita quedó registrada y Patricio la coordinará con usted.";
        if (falloGestion(ag)) return "No pude completar la reserva por un problema técnico, así que la cita no quedó agendada. Avisé a Patricio para que la coordine.";
        const o = ag.output;
        if (o.ok) return `Listo, su cita quedó confirmada para el ${o.texto}. Si necesita cambiarla, avíseme por aquí.`;
        if (o.motivo === "ya_tiene_cita") return `Usted ya tiene una cita confirmada para el ${o.texto}. ¿Desea mantenerla?`;
        return "Ese horario ya no está disponible. ¿Le muestro otras opciones?";
      }
    };
  }
  if (RE_CITA.test(t)) {
    if (!nombreConocido && !extraerDatos(original, t, estado).nombre_declarado) {
      return {
        pasos: [() => usar("registrar_solicitud", { tipo: "cita", siguiente_accion: "agendar_cita", ...(estado.solicitud ? {} : { tipo_cliente: estado.vinculado ? "no_determinado" : "nuevo" }) })],
        final: (res) => (falloGestion(res[0]) ? MSG_FALLO : `${saludo}Con gusto le ayudo con una cita. ¿A nombre de quién la dejo?`)
      };
    }
    const { motivo: _pedido, ...datosCita } = extraerDatos(original, t, estado);
    return {
      pasos: [() => usar("registrar_solicitud", { tipo: "cita", siguiente_accion: "agendar_cita", ...datosCita }), () => usar("consultar_disponibilidad", {})],
      final: (res) => ofrecerHoras(res, saludo)
    };
  }

  // 7. Preguntas sobre la oficina.
  if (RE_INFO.test(t)) {
    return {
      pasos: [
        () => usar("consultar_base_conocimiento", { consulta: original.slice(0, 300) }),
        (res) => (res[0].output.mejor_coincidencia?.estado === "aprobado" ? null : usar("registrar_solicitud", { tipo: "consulta", siguiente_accion: "revision_patricio", motivo: `Pregunta sobre la oficina: ${original}`.slice(0, 600) }))
      ],
      final: (res) => {
        const kb = res[0].output;
        if (kb.mejor_coincidencia?.estado === "aprobado") return `${saludo}${kb.aprobadas[0].contenido} ¿Le puedo ayudar en algo más?`;
        return `${saludo}Esa información todavía no está confirmada por la oficina, así que prefiero no darle un dato incorrecto. Dejé registrada su pregunta para que Patricio le responda.`;
      }
    };
  }

  // 8. Recepción de antecedentes.
  const datos = extraerDatos(original, t, estado);
  const utiles = Object.keys(datos).filter((k) => !["tipo_cliente", "urgencia"].includes(k));
  if (utiles.length || (estado.senales?.senales?.length && estado.solicitud)) {
    return {
      pasos: [
        () => usar("registrar_solicitud", datos),
        (res) => (estado.solicitud?.siguiente_accion === "agendar_cita" && datos.nombre_declarado ? usar("consultar_disponibilidad", {}) : null)
      ],
      final: (res) => {
        if (falloGestion(res[0])) return MSG_FALLO;
        if (res[1]) return ofrecerHoras(res.slice(1), `Gracias, ${datos.nombre_declarado}. `);
        const reg = res[0].output;
        const urg = estado.senales?.alertaNueva ? "Registré su caso como prioritario y avisé a Patricio para que lo revise. " : "";
        const fechas = estado.senales?.fechasLiterales?.length ? "Dejé anotada la fecha que me indicó; no puedo calcular plazos, eso lo revisará Patricio. " : "";
        const gracias = datos.nombre_declarado ? `Gracias, ${datos.nombre_declarado}. ` : "Gracias. ";
        const pregunta = siguientePregunta(reg.faltan);
        return `${saludo}${gracias}${urg}${fechas}${pregunta || "Ya registré los antecedentes principales. Patricio los revisará y le indicará los pasos a seguir. ¿Desea agendar una atención?"}`;
      }
    };
  }
  if (estado.primerContacto || RE_SALUDO.test(t)) {
    return { pasos: [], final: () => `${saludo || "Hola. "}Puedo ayudarle a registrar una consulta, agendar una atención o recibir documentos. ${nombreConocido ? "¿En qué le puedo ayudar?" : PREGUNTAS.nombre}` };
  }
  const pregunta = siguientePregunta(estado.faltan);
  return { pasos: [], final: () => `Gracias. ${pregunta || "¿Hay algo más en que le pueda ayudar?"}` };
}

function ofrecerHoras(res, prefijo = "") {
  const disp = res.find((r) => r.name === "consultar_disponibilidad")?.output;
  if (!disp || res.some(falloGestion)) return MSG_FALLO;
  if (!disp.configurada || !disp.opciones?.length) return `${prefijo}Por ahora no tengo horarios disponibles para ofrecer en línea. Registré su solicitud de cita y Patricio la coordinará con usted.`;
  const lista = disp.opciones.map((o, i) => `${i + 1}) ${o.texto}`).join("\n");
  return `${prefijo}Tengo estas opciones disponibles:\n${lista}\n¿Cuál le acomoda? Responda con el número.`;
}

export function crearProveedorSimulado() {
  return {
    nombre: "simulado",
    modelo: "simulado",
    async generar({ mensajes, estado }) {
      const { textoCliente, resultados, previos, ultimoAgente } = leerTurno(mensajes);
      const plan = planificar(textoCliente, estado, previos, ultimoAgente);
      const n = resultados.length;
      if (n < plan.pasos.length) {
        const llamada = plan.pasos[n](resultados);
        if (llamada) return { content: [{ type: "text", text: "" }, llamada].filter((b) => b.type !== "text"), stop_reason: "tool_use", modelo: "simulado", uso: {} };
      }
      return texto(plan.final(resultados));
    }
  };
}
