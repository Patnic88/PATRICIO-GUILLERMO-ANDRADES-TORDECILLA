// Un turno del agente: toma los mensajes nuevos de una conversación, consulta
// al modelo con las herramientas, revisa la respuesta y devuelve el texto a
// enviar. No envía nada por sí mismo (eso lo hace la cola).

import { ahora } from "../db.js";
import { leerConversacion, leerContacto } from "../servicios/conversaciones.js";
import { crearAlerta } from "../servicios/alertas.js";
import { auditar, log } from "../servicios/auditoria.js";
import { fechaLocal } from "../servicios/fechas.js";
import { detectarSenales } from "./urgencias.js";
import { revisarRespuesta, DESCRIPCIONES } from "./guardas.js";
import { HERRAMIENTAS, definicionesParaIA, ejecutarHerramienta } from "./herramientas.js";
import { construirEstado, construirMensajes } from "./contexto.js";

export const MENSAJE_FALLO_TECNICO = "Disculpe, en este momento tengo un problema técnico y no puedo responderle. Su mensaje quedó registrado y avisé a Patricio para que lo revise.";
export const MENSAJE_REVISION = "Gracias por su mensaje. Para responderle con precisión, Patricio revisará personalmente su consulta. Su mensaje quedó registrado.";
const LIMITE_WHATSAPP = 4000;

export class ErrorAgente extends Error {}

const textoDe = (content) => content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();

async function ejecutarAgente(app, ctx, mensajes, estado) {
  const registro = ctx.herramientas;
  const herramientas = definicionesParaIA(registro);
  const msgs = mensajes.slice();
  for (let i = 0; i < app.cfg.ia.maxIteraciones; i++) {
    const r = await app.ia.generar({ system: app.instrucciones, mensajes: msgs, herramientas, estado });
    ctx.turno.modelo = r.modelo;
    ctx.turno.llamadas += 1;
    if (r.uso) for (const [k, v] of Object.entries(r.uso)) if (typeof v === "number") ctx.turno.uso[k] = (ctx.turno.uso[k] || 0) + v;
    if (r.stop_reason === "refusal") throw new ErrorAgente("rechazo_del_modelo");
    if (r.stop_reason === "max_tokens") throw new ErrorAgente("respuesta_truncada");
    if (r.stop_reason === "pause_turn") { msgs.push({ role: "assistant", content: r.content }); continue; }
    const usos = r.content.filter((b) => b.type === "tool_use");
    if (!usos.length) {
      const texto = textoDe(r.content);
      if (!texto) throw new ErrorAgente("respuesta_vacia");
      return texto;
    }
    msgs.push({ role: "assistant", content: r.content });
    const resultados = [];
    for (const u of usos) {
      const res = await ejecutarHerramienta(ctx, u.name, u.input);
      resultados.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(res), ...(res?.error ? { is_error: true } : {}) });
    }
    msgs.push({ role: "user", content: resultados });
  }
  throw new ErrorAgente("demasiadas_iteraciones");
}

export async function procesarTurno(app, conversacionId, nuevos) {
  const { db, cfg } = app;
  const conv = leerConversacion(db, conversacionId);
  const contacto = leerContacto(db, conv.contacto_id);
  const textoNuevo = nuevos.map((m) => m.texto || "").join("\n");

  // 1. Señales de urgencia: el código crea la alerta aunque el modelo falle.
  const senales = detectarSenales(textoNuevo);
  senales.alertaNueva = false;
  if (senales.senales.length) {
    senales.alertaNueva = crearAlerta(db, {
      tipo: "urgencia", prioridad: senales.urgencia === "urgente" ? "alta" : "media", conversacionId,
      descripcion: `Señales detectadas: ${senales.senales.map((s) => s.etiqueta).join(", ")}. Mensaje: "${textoNuevo.slice(0, 300)}"${senales.fechasLiterales.length ? `. Fechas mencionadas (literal): ${senales.fechasLiterales.join(", ")}` : ""}. Ningún plazo fue calculado.`,
      fechaInformada: senales.fechasLiterales.join(", ") || null,
      claveDedupe: `senal-${conversacionId}-${senales.senales.map((s) => s.tipo).sort().join("+")}-${fechaLocal(new Date(), cfg.zonaHoraria)}`
    }).nueva;
  }

  // 2. Contexto y mensajes.
  const estado = construirEstado(app, conv, contacto, nuevos, senales);
  const { mensajes } = construirMensajes(app, conv, nuevos, estado);
  const ctx = {
    db, cfg, conversacionId, contactoId: contacto.id, herramientas: app.herramientas || HERRAMIENTAS,
    turno: { exito: new Set(), acciones: [], textoConocimiento: "", citaVigente: estado.citas.length > 0, pagoVerificadoInformado: false, senales, uso: {}, llamadas: 0, modelo: null }
  };

  // 3. Modelo + herramientas.
  let texto, error = null;
  try {
    texto = await ejecutarAgente(app, ctx, mensajes, estado);
  } catch (e) {
    error = e instanceof ErrorAgente ? e.message : `fallo_proveedor: ${String(e?.message || e).slice(0, 300)}`;
    log("error", "fallo del agente", { conversacionId, error });
    crearAlerta(db, { tipo: "fallo_ia", prioridad: "alta", conversacionId, descripcion: `El agente no pudo responder (${error}). Revise la conversación.`, claveDedupe: `fallo-ia-${conversacionId}-${ahora().slice(0, 13)}` });
    const c = leerConversacion(db, conversacionId);
    const reciente = c.ultimo_aviso_fallo && Date.now() - new Date(c.ultimo_aviso_fallo).getTime() < cfg.agente.avisoFalloMinutos * 60_000;
    texto = reciente ? null : MENSAJE_FALLO_TECNICO;
    if (texto) db.prepare("UPDATE conversaciones SET ultimo_aviso_fallo = ? WHERE id = ?").run(ahora(), conversacionId);
  }

  // 4. Revisión de la respuesta: nada que las herramientas no respalden.
  let problemas = [];
  if (texto && !error) {
    const rev = revisarRespuesta(texto, ctx.turno);
    if (!rev.ok) {
      problemas = rev.problemas;
      crearAlerta(db, { tipo: "respuesta_bloqueada", prioridad: "alta", conversacionId, descripcion: `Se bloqueó una respuesta del agente (${problemas.map((p) => DESCRIPCIONES[p] || p).join("; ")}). Texto bloqueado: "${texto.slice(0, 500)}"` });
      auditar(db, { actor: "sistema", accion: "respuesta.bloqueada", conversacionId, resultado: "rechazado", detalle: { problemas, texto } });
      texto = MENSAJE_REVISION;
    }
  }
  if (texto && texto.length > LIMITE_WHATSAPP) texto = texto.slice(0, LIMITE_WHATSAPP - 1) + "…";

  auditar(db, {
    actor: "agente", accion: "turno", conversacionId, resultado: error ? "error" : problemas.length ? "bloqueado" : "ok",
    detalle: { mensajes: nuevos.map((m) => m.id), herramientas: ctx.turno.acciones.map((a) => a.herramienta), llamadas: ctx.turno.llamadas, modelo: ctx.turno.modelo, uso: ctx.turno.uso, error, problemas }
  });
  return { texto, acciones: ctx.turno.acciones, problemas, error, estado };
}
