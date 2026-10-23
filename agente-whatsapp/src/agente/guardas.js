// Revisión de la respuesta final antes de enviarla. Son controles de código,
// independientes del modelo: si la respuesta afirma algo que ninguna
// herramienta respaldó en este turno, no se envía.

import { sinTildes } from "../servicios/conocimiento.js";

const REGLAS = [
  {
    id: "cita_sin_reserva",
    descripcion: "Afirma que una cita quedó confirmada sin una reserva registrada",
    re: /\b(cita|hora|reunion|atencion)\b[^.?!\n]{0,40}\b(quedo|queda|esta|ha sido|fue|quedara)\s+(confirmad|agendad|reservad|lista)|\b(confirme|agende|reserve|agendamos|reservamos|confirmamos)\b[^.?!\n]{0,20}\b(su|la|una|tu)\s+(cita|hora|reunion)/,
    negable: true,
    permitido: (t) => t.exito.has("agendar_cita") || t.citaVigente
  },
  {
    id: "pago_sin_verificacion",
    descripcion: "Afirma que un pago está confirmado o verificado",
    re: /\b(pago|transferencia|abono|deposito)\b[^.?!\n]{0,40}\b(fue|esta|quedo|ha sido|se encuentra)\s+(confirmad|verificad|acreditad|aprobad)|\b(confirmamos|verificamos|acreditamos|recibimos conforme)\b[^.?!\n]{0,20}\b(su|el|tu)\s+(pago|transferencia|abono)/,
    negable: true,
    permitido: (t) => t.pagoVerificadoInformado
  },
  {
    id: "calculo_de_plazo",
    descripcion: "Calcula o afirma un plazo jurídico",
    re: /\bplazo\b[^.?!\n]{0,30}\b(vence|vencio|termina|expira|es de \d|de \d+ dias)|\btiene(s|n)?\s+(\d+|un|dos|tres|cinco|diez|quince|treinta|sesenta|noventa)\s+dias(\s+habiles|\s+corridos)?\s+(para|de plazo)|\bvence el (\d|lunes|martes|miercoles|jueves|viernes|sabado|domingo)/,
    permitido: () => false
  },
  {
    id: "promesa_resultado",
    descripcion: "Promete resultados",
    re: /\b(le|te) (aseguro|garantizo)\b|\b(caso|juicio|causa) (ganado|asegurado)\b|\b(vamos a|va a|van a) ganar\b|\bganara (el|su) (juicio|caso)|\bgarantizamos\b/,
    permitido: () => false
  },
  {
    id: "suplantacion",
    descripcion: "Se presenta como Patricio",
    re: /\b(soy|habla|le escribe|te escribe) (patricio|el abogado|su abogado)\b/,
    permitido: () => false
  }
];

const RE_MONTO = /(\$\s?\d[\d.]*|\b\d[\d.,]*\s?(uf|utm|pesos|clp)\b|\bdescuento)/gi;

export function revisarRespuesta(texto, turno) {
  const problemas = [];
  const t = sinTildes(texto || "");
  for (const r of REGLAS) {
    if (r.permitido(turno)) continue;
    const global = new RegExp(r.re.source, "g");
    // Una frase negada ("su cita no quedó agendada") no es una afirmación.
    const afirmaciones = [...t.matchAll(global)].filter((m) => !(r.negable && /\b(no|aun no|todavia no)\b/.test(m[0])));
    if (afirmaciones.length) problemas.push(r.id);
  }
  // Montos y descuentos solo si aparecen en la base de conocimiento aprobada
  // consultada en este mismo turno.
  const montos = (texto || "").match(RE_MONTO) || [];
  const fuente = sinTildes(turno.textoConocimiento || "");
  for (const m of montos) {
    if (!fuente.includes(sinTildes(m).replace(/\s+/g, " ").trim())) { problemas.push("monto_no_respaldado"); break; }
  }
  return { ok: problemas.length === 0, problemas };
}

export const DESCRIPCIONES = Object.fromEntries(REGLAS.map((r) => [r.id, r.descripcion]).concat([["monto_no_respaldado", "Informa montos o descuentos que no están en la base de conocimiento aprobada"]]));
