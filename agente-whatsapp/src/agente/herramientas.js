// Herramientas que el agente puede usar. Cada una valida su entrada, aplica
// las reglas de la oficina en código (no en el prompt) y deja registro.
//
// Reglas aplicadas aquí, independientemente de lo que pida el modelo:
// - Expedientes, pagos y documentos de un cliente solo con identidad verificada.
// - Ningún dato de otra conversación o de otro cliente es accesible.
// - Un comprobante siempre queda "pendiente de verificación".
// - Una cita solo existe si la reserva se guardó en la base de datos.
// - El agente no puede marcar antecedentes como "verificados".

import { ahora } from "../db.js";
import { validar } from "./validar.js";
import { auditar } from "../servicios/auditoria.js";
import { crearAlerta } from "../servicios/alertas.js";
import { buscarConocimiento } from "../servicios/conocimiento.js";
import { bloquesLibres, reservarCita, cancelarCita, leerAgenda } from "../servicios/agenda.js";
import { leerConversacion, sesionVerificada, verificarIdentidad, fijarModo } from "../servicios/conversaciones.js";
import { maxUrgencia } from "./urgencias.js";

const MATERIAS = ["civil", "laboral", "migratoria", "administrativa", "municipal", "tributaria", "contable", "constitucion_empresa", "familia", "penal", "otra", "no_determinada"];
const texto = (max, descripcion) => ({ type: "string", maxLength: max, description: descripcion });

// ---------------------------------------------------------------------------
// Utilidades de acceso, siempre acotadas a la conversación actual
// ---------------------------------------------------------------------------

function ventanaDesde(ctx) {
  return new Date(Date.now() - ctx.cfg.agente.memoriaSesionHoras * 3600_000).toISOString();
}

export function solicitudVigente(ctx) {
  const conv = leerConversacion(ctx.db, ctx.conversacionId);
  const verificado = sesionVerificada(conv);
  return ctx.db.prepare(
    `SELECT * FROM solicitudes WHERE conversacion_id = ? AND estado = 'abierta' ${verificado ? "" : "AND actualizado >= ?"} ORDER BY id DESC LIMIT 1`
  ).get(...(verificado ? [ctx.conversacionId] : [ctx.conversacionId, ventanaDesde(ctx)]));
}

const esJudicial = (s, datos) =>
  !!(datos.tribunal || datos.rol_rit || /\b(causa|juicio|demanda|tribunal|juzgado|audiencia|notific|rol|rit)\b/i.test(s.motivo || ""));

export function calcularFaltantes(s) {
  const datos = JSON.parse(s.datos || "{}");
  const faltan = [];
  if (!s.nombre_declarado) faltan.push("nombre");
  if (!s.motivo) faltan.push("motivo");
  if (!s.materia || s.materia === "no_determinada") faltan.push("materia");
  if (!s.comuna) faltan.push("comuna");
  if (esJudicial(s, datos)) for (const c of ["tribunal", "rol_rit", "resolucion", "fecha_notificacion"]) if (!datos[c]) faltan.push(c);
  if (!(datos.documentos_disponibles || []).length) faltan.push("documentos_disponibles");
  if (!datos.hay_fechas_relevantes && !(datos.fechas_relevantes || []).length) faltan.push("fechas_relevantes");
  return faltan;
}

function guardarAntecedente(ctx, { campo, valor, origen, solicitudId = null, documentoId = null, asuntoId = null }) {
  const conv = leerConversacion(ctx.db, ctx.conversacionId);
  const clienteId = sesionVerificada(conv) ? conv.verificado_cliente_id : null;
  const repetido = ctx.db.prepare(
    "SELECT id FROM antecedentes WHERE contacto_id = ? AND campo = ? AND valor = ? AND COALESCE(solicitud_id, 0) = COALESCE(?, 0)"
  ).get(ctx.contactoId, campo, String(valor), solicitudId);
  if (repetido) return repetido.id;
  const r = ctx.db.prepare(
    `INSERT INTO antecedentes (contacto_id, cliente_id, asunto_id, solicitud_id, campo, valor, origen, documento_id, registrado_por, creado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'agente', ?)`
  ).run(ctx.contactoId, clienteId, asuntoId, solicitudId, campo, String(valor).slice(0, 1000), origen, documentoId, ahora());
  return Number(r.lastInsertRowid);
}

function documentoPropio(ctx, id) {
  return ctx.db.prepare("SELECT * FROM documentos WHERE id = ? AND conversacion_id = ?").get(id, ctx.conversacionId);
}

function asuntoPropio(ctx, asuntoId) {
  const conv = leerConversacion(ctx.db, ctx.conversacionId);
  if (!sesionVerificada(conv)) return null;
  return ctx.db.prepare("SELECT * FROM asuntos WHERE id = ? AND cliente_id = ?").get(asuntoId, conv.verificado_cliente_id);
}

// ---------------------------------------------------------------------------
// Definiciones
// ---------------------------------------------------------------------------

export const HERRAMIENTAS = {
  consultar_base_conocimiento: {
    description: "Busca en la base de conocimiento aprobada por la oficina (servicios, honorarios, horarios, dirección, medios de pago, requisitos y documentos por materia). Úsala antes de responder cualquier pregunta sobre la oficina. Solo puedes informar lo que venga en 'aprobadas'. Lo que aparezca en 'pendientes' aún no está aprobado: dilo así y deriva.",
    input_schema: { type: "object", properties: { consulta: texto(300, "Tema buscado, en pocas palabras") }, required: ["consulta"], additionalProperties: false },
    ejecutar(ctx, { consulta }) {
      const r = buscarConocimiento(ctx.db, consulta);
      ctx.turno.textoConocimiento += " " + r.aprobadas.map((a) => a.contenido).join(" ");
      const sinDato = !r.aprobadas.length || r.mejor_coincidencia?.estado !== "aprobado";
      return { ...r, instruccion: sinDato ? "La información más cercana a la pregunta NO está aprobada. No la infieras ni respondas con otra entrada: indica que Patricio deberá confirmarlo." : "Responde solo con este contenido aprobado." };
    }
  },

  registrar_solicitud: {
    description: "Crea o actualiza la solicitud de atención de esta conversación con los antecedentes que el cliente entregó y su clasificación. Llámala cada vez que el cliente aporte un dato nuevo. Registra solo lo que el cliente dijo (origen: declarado). La respuesta indica qué antecedentes faltan. Para fechas, copia el texto literal informado por el cliente; no calcules plazos.",
    input_schema: {
      type: "object",
      properties: {
        tipo_cliente: { type: "string", enum: ["nuevo", "existente", "trabajo_en_curso", "no_determinado"] },
        tipo: { type: "string", enum: ["consulta", "cita", "documentos", "estado_asunto", "pago", "otro"] },
        materia: { type: "string", enum: MATERIAS },
        motivo: texto(600, "Resumen breve y fiel del motivo, sin conclusiones jurídicas"),
        nombre_declarado: texto(120),
        comuna: texto(80),
        urgencia: { type: "string", enum: ["normal", "prioritaria", "urgente"] },
        siguiente_accion: { type: "string", enum: ["recopilar_antecedentes", "agendar_cita", "revision_patricio", "esperar_documentos", "informar_servicios", "cerrar"] },
        tribunal: texto(200, "Tribunal u organismo, o 'no dispone'"),
        rol_rit: texto(80, "Rol, RIT o RUC, o 'no dispone'"),
        resolucion: texto(400, "Resolución o actuación notificada, o 'no dispone'"),
        fecha_notificacion: texto(80, "Fecha de notificación tal como la informó el cliente, o 'no dispone'"),
        hay_fechas_relevantes: { type: "string", enum: ["si", "no", "no_sabe"] },
        fechas_relevantes: { type: "array", maxItems: 10, items: { type: "object", properties: { descripcion: texto(200), fecha_texto: texto(80) }, required: ["descripcion", "fecha_texto"], additionalProperties: false } },
        documentos_disponibles: { type: "array", maxItems: 20, items: texto(150), description: "Documentos que el cliente dice tener, o ['ninguno']" }
      },
      additionalProperties: false
    },
    ejecutar(ctx, e) {
      const { db } = ctx;
      let s = solicitudVigente(ctx);
      const conv = leerConversacion(db, ctx.conversacionId);
      const clienteId = sesionVerificada(conv) ? conv.verificado_cliente_id : null;
      if (!s) {
        const r = db.prepare("INSERT INTO solicitudes (conversacion_id, contacto_id, cliente_id, creado, actualizado) VALUES (?, ?, ?, ?, ?)")
          .run(ctx.conversacionId, ctx.contactoId, clienteId, ahora(), ahora());
        s = db.prepare("SELECT * FROM solicitudes WHERE id = ?").get(r.lastInsertRowid);
      }
      const datos = JSON.parse(s.datos || "{}");
      const simples = ["tipo_cliente", "tipo", "materia", "motivo", "nombre_declarado", "comuna", "siguiente_accion"];
      const cambios = {};
      for (const c of simples) if (e[c]) cambios[c] = e[c];
      for (const c of ["tribunal", "rol_rit", "resolucion", "fecha_notificacion", "hay_fechas_relevantes"]) if (e[c]) datos[c] = e[c];
      if (e.fechas_relevantes?.length) {
        const previas = datos.fechas_relevantes || [];
        for (const f of e.fechas_relevantes) if (!previas.some((p) => p.fecha_texto === f.fecha_texto && p.descripcion === f.descripcion)) previas.push(f);
        datos.fechas_relevantes = previas;
        datos.hay_fechas_relevantes = "si";
      }
      if (e.documentos_disponibles?.length) datos.documentos_disponibles = [...new Set([...(datos.documentos_disponibles || []), ...e.documentos_disponibles])];
      const urgencia = maxUrgencia(maxUrgencia(s.urgencia, e.urgencia), ctx.turno.senales?.urgencia);
      const sets = Object.keys(cambios).map((c) => `${c} = ?`).concat(["urgencia = ?", "datos = ?", "cliente_id = COALESCE(cliente_id, ?)", "actualizado = ?"]);
      db.prepare(`UPDATE solicitudes SET ${sets.join(", ")} WHERE id = ?`).run(...Object.values(cambios), urgencia, JSON.stringify(datos), clienteId, ahora(), s.id);

      for (const [c, v] of Object.entries(cambios)) if (["motivo", "nombre_declarado", "comuna", "materia"].includes(c)) guardarAntecedente(ctx, { campo: c, valor: v, origen: "declarado", solicitudId: s.id });
      for (const c of ["tribunal", "rol_rit", "resolucion", "fecha_notificacion"]) if (e[c]) guardarAntecedente(ctx, { campo: c, valor: e[c], origen: "declarado", solicitudId: s.id });

      const alertas = [];
      const fechas = [...(e.fecha_notificacion && !/no dispone/i.test(e.fecha_notificacion) ? [{ descripcion: "Fecha de notificación", fecha_texto: e.fecha_notificacion }] : []), ...(e.fechas_relevantes || [])];
      for (const f of fechas) {
        guardarAntecedente(ctx, { campo: `fecha: ${f.descripcion}`, valor: f.fecha_texto, origen: "declarado", solicitudId: s.id });
        const a = crearAlerta(db, {
          tipo: "plazo", prioridad: "alta", conversacionId: ctx.conversacionId, solicitudId: s.id, actor: "agente",
          descripcion: `El cliente informó "${f.descripcion}: ${f.fecha_texto}". No se calculó ningún plazo; requiere revisión de la regla aplicable por Patricio.`,
          fechaInformada: f.fecha_texto, claveDedupe: `fecha-${s.id}-${f.descripcion}-${f.fecha_texto}`
        });
        if (a.nueva) alertas.push(a.id);
      }
      if (urgencia === "urgente" && s.urgencia !== "urgente") {
        const a = crearAlerta(db, { tipo: "urgencia", prioridad: "alta", conversacionId: ctx.conversacionId, solicitudId: s.id, actor: "agente", descripcion: `Solicitud #${s.id} clasificada como urgente. Motivo: ${cambios.motivo || s.motivo || "(sin detalle)"}`, claveDedupe: `urgente-${s.id}` });
        if (a.nueva) alertas.push(a.id);
      }
      const actual = db.prepare("SELECT * FROM solicitudes WHERE id = ?").get(s.id);
      return { ok: true, solicitud_id: s.id, urgencia, faltan: calcularFaltantes(actual), alertas_creadas: alertas };
    }
  },

  registrar_antecedente: {
    description: "Guarda un antecedente puntual del caso (por ejemplo 'fecha de inicio de la relación laboral'). origen='declarado' si lo dijo el cliente; origen='documental' solo si consta en un documento recibido en esta conversación (indica documento_id). Nunca registres conclusiones jurídicas.",
    input_schema: {
      type: "object",
      properties: { campo: texto(120), valor: texto(800), origen: { type: "string", enum: ["declarado", "documental"] }, documento_id: { type: "integer" } },
      required: ["campo", "valor", "origen"], additionalProperties: false
    },
    ejecutar(ctx, e) {
      if (e.origen === "documental") {
        if (!e.documento_id || !documentoPropio(ctx, e.documento_id)) return { ok: false, error: "documento_no_encontrado", instruccion: "Un antecedente documental requiere un documento recibido en esta conversación." };
      }
      const s = solicitudVigente(ctx);
      const id = guardarAntecedente(ctx, { campo: e.campo, valor: e.valor, origen: e.origen, solicitudId: s?.id ?? null, documentoId: e.documento_id ?? null });
      return { ok: true, antecedente_id: id, origen: e.origen };
    }
  },

  asociar_documento: {
    description: "Asocia un documento recibido en esta conversación a la solicitud vigente (o a un asunto del cliente si la identidad está verificada) y registra una descripción breve de lo que el cliente dice que es.",
    input_schema: {
      type: "object",
      properties: { documento_id: { type: "integer" }, descripcion: texto(300), asunto_id: { type: "integer" } },
      required: ["documento_id", "descripcion"], additionalProperties: false
    },
    ejecutar(ctx, e) {
      const doc = documentoPropio(ctx, e.documento_id);
      if (!doc) return { ok: false, error: "documento_no_encontrado" };
      if (doc.estado === "error_descarga") return { ok: false, error: "documento_no_descargado", instruccion: "El archivo no se pudo descargar. Pide al cliente que lo reenvíe." };
      let asuntoId = null;
      if (e.asunto_id) {
        if (!asuntoPropio(ctx, e.asunto_id)) return { ok: false, error: "asunto_no_autorizado", instruccion: "Solo se puede asociar a un asunto del cliente verificado." };
        asuntoId = e.asunto_id;
      }
      const s = solicitudVigente(ctx);
      const conv = leerConversacion(ctx.db, ctx.conversacionId);
      ctx.db.prepare("UPDATE documentos SET descripcion = ?, solicitud_id = COALESCE(?, solicitud_id), asunto_id = COALESCE(?, asunto_id), cliente_id = COALESCE(cliente_id, ?), estado = 'asociado' WHERE id = ?")
        .run(e.descripcion, s?.id ?? null, asuntoId, sesionVerificada(conv) ? conv.verificado_cliente_id : null, doc.id);
      return { ok: true, documento_id: doc.id, solicitud_id: s?.id ?? null, asunto_id: asuntoId };
    }
  },

  consultar_disponibilidad: {
    description: "Consulta los bloques libres de la agenda de la oficina. Ofrece al cliente solo bloques devueltos aquí, con su texto. Si la agenda no está configurada, no ofrezcas horas.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    ejecutar(ctx) {
      const r = bloquesLibres(ctx.db, ctx.cfg.zonaHoraria);
      if (!r.configurada) return { configurada: false, opciones: [], instruccion: "La agenda en línea no está habilitada. Registra la solicitud de cita (registrar_solicitud con tipo='cita') e informa que Patricio coordinará el horario." };
      const max = leerAgenda(ctx.db).maxOpciones;
      return { configurada: true, modalidades: r.modalidades, duracion_minutos: r.duracionMinutos, opciones: r.bloques.slice(0, max).map(({ inicio, texto }) => ({ inicio, texto })) };
    }
  },

  agendar_cita: {
    description: "Reserva un bloque de la agenda. 'inicio' debe ser exactamente uno de los valores 'inicio' devueltos por consultar_disponibilidad. Solo informa que la cita quedó confirmada si esta herramienta responde ok=true.",
    input_schema: {
      type: "object",
      properties: { inicio: texto(40), nombre: texto(120), motivo: texto(300), modalidad: texto(40) },
      required: ["inicio", "nombre", "motivo"], additionalProperties: false
    },
    ejecutar(ctx, e) {
      if (Number.isNaN(Date.parse(e.inicio))) return { ok: false, error: "inicio_invalido" };
      const conv = leerConversacion(ctx.db, ctx.conversacionId);
      const s = solicitudVigente(ctx);
      const r = reservarCita(ctx.db, ctx.cfg.zonaHoraria, {
        contactoId: ctx.contactoId, conversacionId: ctx.conversacionId, clienteId: sesionVerificada(conv) ? conv.verificado_cliente_id : null,
        solicitudId: s?.id ?? null, inicio: e.inicio, modalidad: e.modalidad || null, motivo: e.motivo, nombre: e.nombre
      });
      if (r.ok) {
        if (s) ctx.db.prepare("UPDATE solicitudes SET siguiente_accion = 'revision_patricio', actualizado = ? WHERE id = ?").run(ahora(), s.id);
        crearAlerta(ctx.db, { tipo: "cita", prioridad: "media", conversacionId: ctx.conversacionId, solicitudId: s?.id ?? null, actor: "agente", descripcion: `Cita agendada para ${r.texto} (${e.nombre}): ${e.motivo}`, claveDedupe: `cita-${r.cita_id}` });
      }
      if (r.motivo === "ya_tiene_cita") ctx.turno.citaVigente = true;
      return r;
    }
  },

  cancelar_cita: {
    description: "Cancela una cita confirmada de este mismo contacto cuando el cliente lo pide expresamente.",
    input_schema: { type: "object", properties: { cita_id: { type: "integer" } }, required: ["cita_id"], additionalProperties: false },
    ejecutar(ctx, e) {
      const r = cancelarCita(ctx.db, { citaId: e.cita_id, contactoId: ctx.contactoId });
      if (r.ok) crearAlerta(ctx.db, { tipo: "cita", prioridad: "media", conversacionId: ctx.conversacionId, actor: "agente", descripcion: `El cliente canceló la cita #${e.cita_id}.`, claveDedupe: `cita-cancelada-${e.cita_id}` });
      return r;
    }
  },

  registrar_comprobante: {
    description: "Registra un comprobante de pago recibido en esta conversación para que la oficina lo revise. Siempre queda 'pendiente_verificacion'. Nunca digas que el pago está confirmado.",
    input_schema: {
      type: "object",
      properties: { documento_id: { type: "integer" }, monto_declarado: texto(40), fecha_declarada: texto(40), concepto: texto(200) },
      required: ["documento_id"], additionalProperties: false
    },
    ejecutar(ctx, e) {
      const doc = documentoPropio(ctx, e.documento_id);
      if (!doc) return { ok: false, error: "documento_no_encontrado" };
      const previo = ctx.db.prepare("SELECT id, estado FROM pagos WHERE documento_id = ?").get(doc.id);
      if (previo) return { ok: true, pago_id: previo.id, estado: previo.estado, ya_registrado: true };
      const conv = leerConversacion(ctx.db, ctx.conversacionId);
      const r = ctx.db.prepare(
        `INSERT INTO pagos (contacto_id, conversacion_id, cliente_id, documento_id, monto_declarado, fecha_declarada, concepto, estado, creado)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente_verificacion', ?)`
      ).run(ctx.contactoId, ctx.conversacionId, sesionVerificada(conv) ? conv.verificado_cliente_id : null, doc.id, e.monto_declarado || null, e.fecha_declarada || null, e.concepto || null, ahora());
      ctx.db.prepare("UPDATE documentos SET clase = 'comprobante', estado = 'asociado' WHERE id = ?").run(doc.id);
      const pagoId = Number(r.lastInsertRowid);
      crearAlerta(ctx.db, { tipo: "pago", prioridad: "media", conversacionId: ctx.conversacionId, actor: "agente", descripcion: `Comprobante recibido (pago #${pagoId}${e.monto_declarado ? `, monto declarado ${e.monto_declarado}` : ""}). Pendiente de verificación.`, claveDedupe: `pago-${pagoId}` });
      return { ok: true, pago_id: pagoId, estado: "pendiente_verificacion", instruccion: "Informa que el comprobante quedó registrado y pendiente de verificación por la oficina." };
    }
  },

  crear_alerta: {
    description: "Crea una alerta interna para Patricio. Úsala ante audiencias, notificaciones, posibles vencimientos, remates, reclamos o cualquier situación que requiera revisión prioritaria.",
    input_schema: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: ["urgencia", "plazo", "audiencia", "remate", "notificacion", "revision", "reclamo", "otro"] },
        prioridad: { type: "string", enum: ["alta", "media", "baja"] },
        descripcion: texto(800),
        fecha_informada: texto(80)
      },
      required: ["tipo", "prioridad", "descripcion"], additionalProperties: false
    },
    ejecutar(ctx, e) {
      const s = solicitudVigente(ctx);
      const r = crearAlerta(ctx.db, { tipo: e.tipo, prioridad: e.prioridad, conversacionId: ctx.conversacionId, solicitudId: s?.id ?? null, descripcion: e.descripcion, fechaInformada: e.fecha_informada || null, actor: "agente", claveDedupe: `agente-${ctx.conversacionId}-${e.tipo}-${e.descripcion.slice(0, 80)}` });
      return { ok: true, alerta_id: r.id };
    }
  },

  transferir_a_patricio: {
    description: "Deriva la conversación a Patricio y pausa las respuestas automáticas. Úsala cuando el cliente lo pida, cuando la consulta requiera criterio profesional, estrategia, cálculo de plazos o tributario, compromisos de honorarios, reclamos, o cuando no puedas ayudar con seguridad.",
    input_schema: {
      type: "object",
      properties: { motivo: texto(300), resumen: texto(1200, "Resumen de lo conversado y de lo pendiente") },
      required: ["motivo", "resumen"], additionalProperties: false
    },
    ejecutar(ctx, e) {
      fijarModo(ctx.db, ctx.conversacionId, "humano", e.motivo, "agente");
      const s = solicitudVigente(ctx);
      if (s) ctx.db.prepare("UPDATE solicitudes SET estado = 'derivada', siguiente_accion = 'revision_patricio', actualizado = ? WHERE id = ?").run(ahora(), s.id);
      crearAlerta(ctx.db, { tipo: "derivacion", prioridad: "alta", conversacionId: ctx.conversacionId, solicitudId: s?.id ?? null, actor: "agente", descripcion: `Derivación: ${e.motivo}. Resumen: ${e.resumen}` });
      return { ok: true, instruccion: "Informa en un mensaje breve que Patricio continuará personalmente la conversación. No prometas un plazo de respuesta." };
    }
  },

  verificar_identidad: {
    description: "Verifica la identidad del cliente con su RUT y el código personal que le entregó la oficina. Es obligatoria antes de comunicar cualquier dato de expedientes, pagos o documentos. No repitas el código en tu respuesta.",
    input_schema: { type: "object", properties: { rut: texto(20), codigo: texto(12) }, required: ["rut", "codigo"], additionalProperties: false },
    ejecutar(ctx, e) {
      const r = verificarIdentidad(ctx.db, ctx.cfg.agente, ctx.conversacionId, e);
      if (r.ok) return { ok: true, nombre: r.nombre, valida_hasta: r.valida_hasta };
      return { ok: false, motivo: r.motivo, intentos_restantes: r.intentos_restantes, instruccion: r.motivo === "bloqueado_temporalmente" ? "La verificación quedó bloqueada temporalmente y se avisó a Patricio. No entregues información confidencial." : "Los datos no coinciden. No indiques cuál dato falló." };
    }
  },

  consultar_expediente: {
    description: "Entrega los asuntos, gestiones visibles, documentos recibidos, pagos y citas del cliente verificado. Requiere identidad verificada en esta conversación. Comunica solo lo que venga aquí, distinguiendo el origen de cada antecedente.",
    input_schema: { type: "object", properties: { asunto_id: { type: "integer" } }, additionalProperties: false },
    requiereVerificacion: true,
    ejecutar(ctx, e) {
      const { db } = ctx;
      const conv = leerConversacion(db, ctx.conversacionId);
      const clienteId = conv.verificado_cliente_id;
      const asuntos = db.prepare(`SELECT id, titulo, materia, estado, tribunal, rol, siguiente_accion, resumen_cliente, actualizado FROM asuntos WHERE cliente_id = ? ${e.asunto_id ? "AND id = ?" : ""} ORDER BY actualizado DESC`)
        .all(...(e.asunto_id ? [clienteId, e.asunto_id] : [clienteId]));
      if (e.asunto_id && !asuntos.length) return { ok: false, error: "asunto_no_encontrado" };
      for (const a of asuntos) {
        a.gestiones = db.prepare("SELECT fecha, descripcion FROM gestiones WHERE asunto_id = ? AND visible_cliente = 1 ORDER BY fecha DESC LIMIT 5").all(a.id);
      }
      const documentos = db.prepare("SELECT id, nombre, clase, descripcion, creado FROM documentos WHERE cliente_id = ? ORDER BY id DESC LIMIT 15").all(clienteId);
      const pagos = db.prepare("SELECT id, monto_declarado, concepto, estado, creado FROM pagos WHERE cliente_id = ? ORDER BY id DESC LIMIT 10").all(clienteId);
      const citas = db.prepare("SELECT id, inicio, modalidad, estado FROM citas WHERE cliente_id = ? AND estado = 'confirmada' AND inicio >= ? ORDER BY inicio").all(clienteId, ahora());
      const antecedentes = db.prepare("SELECT campo, valor, origen FROM antecedentes WHERE cliente_id = ? ORDER BY id DESC LIMIT 20").all(clienteId);
      if (pagos.some((p) => p.estado === "verificado")) ctx.turno.pagoVerificadoInformado = true;
      if (citas.length) ctx.turno.citaVigente = true;
      auditar(db, { actor: "agente", accion: "expediente.consulta", conversacionId: ctx.conversacionId, detalle: { cliente_id: clienteId, asuntos: asuntos.map((a) => a.id) } });
      return { ok: true, asuntos, documentos, pagos, citas_futuras: citas, antecedentes, nota: "Antecedentes 'declarado' = dichos por el cliente; 'documental' = constan en un documento; 'verificado' = confirmados por la oficina. Pagos 'pendiente_verificacion' NO están confirmados." };
    }
  }
};

export const definicionesParaIA = (registro = HERRAMIENTAS) =>
  Object.entries(registro).map(([name, h]) => ({ name, description: h.description, input_schema: h.input_schema }));

function sanear(nombre, entrada) {
  if (nombre === "verificar_identidad") return { rut: entrada?.rut ? "[rut]" : undefined, codigo: "[omitido]" };
  return entrada;
}

// Ejecuta una herramienta con validación, control de acceso y registro. Un
// fallo nunca se oculta: el resultado lo informa para que el agente no
// afirme que la gestión se hizo.
export async function ejecutarHerramienta(ctx, nombre, entrada) {
  const h = (ctx.herramientas || HERRAMIENTAS)[nombre];
  const registrar = (resultado, detalle) => {
    ctx.turno.acciones.push({ herramienta: nombre, entrada: sanear(nombre, entrada), resultado: detalle });
    auditar(ctx.db, { actor: "agente", accion: `herramienta.${nombre}`, conversacionId: ctx.conversacionId, resultado, detalle: { entrada: sanear(nombre, entrada) } });
  };
  if (!h) { registrar("error", { error: "herramienta_desconocida" }); return { error: "herramienta_desconocida" }; }
  const errores = validar(h.input_schema, entrada ?? {});
  if (errores.length) { const r = { error: "entrada_invalida", detalle: errores }; registrar("error", r); return r; }
  if (h.requiereVerificacion && !sesionVerificada(leerConversacion(ctx.db, ctx.conversacionId))) {
    const r = { error: "identidad_no_verificada", instruccion: "No entregues información del expediente. Pide RUT y código de verificación entregado por la oficina." };
    registrar("rechazado", r);
    return r;
  }
  try {
    const r = await h.ejecutar(ctx, entrada ?? {});
    const exito = r && r.ok !== false && !r.error;
    if (exito) ctx.turno.exito.add(nombre);
    registrar(exito ? "ok" : "rechazado", r);
    return r;
  } catch (err) {
    const r = { error: "fallo_interno", instruccion: "La herramienta falló. Informa que no se pudo completar esta gestión y que se avisó a Patricio. No afirmes que se realizó." };
    registrar("error", { error: String(err?.message || err) });
    crearAlerta(ctx.db, { tipo: "fallo_herramienta", prioridad: "alta", conversacionId: ctx.conversacionId, descripcion: `Falló la herramienta ${nombre}: ${String(err?.message || err).slice(0, 300)}`, claveDedupe: `fallo-${ctx.conversacionId}-${nombre}-${ahora().slice(0, 13)}` });
    return r;
  }
}
