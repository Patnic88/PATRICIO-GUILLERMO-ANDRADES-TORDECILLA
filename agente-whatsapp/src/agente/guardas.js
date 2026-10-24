// Revisión de la respuesta final antes de enviarla. Son controles de código,
// independientes del modelo: si la respuesta afirma algo que ninguna
// herramienta respaldó en este turno, no se envía.
//
// Se revisa oración por oración. Las preguntas ("¿Desea que le agende una
// hora?") no son afirmaciones y no se revisan. Las reglas que aceptan
// negación solo la reconocen inmediatamente antes del verbo ("su cita no
// quedó agendada"), no en cualquier parte de la frase.

import { sinTildes } from "../servicios/conocimiento.js";

const NEG = "(?:(?<neg>no|aun no|todavia no|tampoco)\\s+)?(?:se\\s+)?";
const NUM = "(?:\\d+|un|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|quince|veinte|treinta|sesenta|noventa)";
const DIAS = "(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)";

// Cada regla define patrones sobre el texto sin tildes (`re`) o con tildes
// (`reTildes`, para distinguir "reservé" de "reserve"). Si el patrón tiene
// un grupo de negación con valor, esa coincidencia no cuenta.
const REGLAS = [
  {
    id: "cita_sin_reserva",
    descripcion: "Afirma que una cita quedó confirmada sin una reserva registrada",
    re: [
      new RegExp(`\\b(cita|hora|reunion|atencion|horario)\\b[^.?!\\n]{0,40}?\\b${NEG}(quedo|queda|esta|ha quedado|ha sido|fue|se encuentra)\\s+(confirmad|agendad|reservad)`),
      /\b(cita|hora|reunion)\s+(confirmad|agendad|reservad)[ao]\b/,
      new RegExp(`\\b${NEG}(quedo|queda|ha quedado|esta|fue)\\s+(confirmad|agendad|reservad)[ao]\\s+para\\b`)
    ],
    reTildes: [/(?<!\p{L})(agendé|reservé|confirmé|ya agendamos|ya reservamos|ya confirmamos)(?!\p{L})/u],
    permitido: (t) => t.exito.has("agendar_cita") || t.citaConfirmadaPorHerramienta || (t.citaVigente && !t.reservaFallida)
  },
  {
    id: "pago_sin_verificacion",
    descripcion: "Afirma que un pago está confirmado o verificado",
    re: [
      new RegExp(`\\b(pago|transferencia|abono|deposito|comprobante)\\b[^.?!\\n]{0,40}?\\b${NEG}(fue|esta|quedo|ha sido|ha quedado|se encuentra)\\s+(confirmad|verificad|acreditad|aprobad|validad)`),
      new RegExp(`\\b(pago|transferencia|abono|deposito)\\b[^.?!\\n]{0,40}?\\b${NEG}(acredito|confirmo|verifico|valido)\\b`),
      /\b(pago|transferencia|abono|deposito)\s+(confirmad|verificad|acreditad|aprobad|validad)[ao]\b/,
      /\brecibid[oa] conforme\b/
    ],
    reTildes: [/(?<!\p{L})(verifiqué|confirmé|acredité|validé|ya verificamos|ya confirmamos)(?!\p{L})[^.?!\n]{0,40}(?<!\p{L})(pago|transferencia|abono|depósito|deposito)/u],
    permitido: (t) => t.pagoVerificadoInformado && !t.exito.has("registrar_comprobante")
  },
  {
    id: "calculo_de_plazo",
    descripcion: "Calcula o afirma un plazo jurídico",
    re: [
      new RegExp(`\\bplazo\\b[^.?!\\n]{0,80}?\\b(vence|vencio|termina|expira|es de ${NUM}|de ${NUM} dias)`),
      new RegExp(`\\b(tiene|tienes|tienen|le quedan|te quedan|quedan|dispone de|cuenta con)\\s+${NUM}\\s+dias`),
      new RegExp(`\\b(tiene|tienes|tienen|plazo)\\s+hasta (el|este|el proximo)\\s+(\\d|${DIAS})`),
      new RegExp(`\\bvence (el|este|el proximo)\\s+(\\d|${DIAS})`),
      /\b\d+\s+dias\s+(habiles|corridos)\b/
    ],
    permitido: () => false,
    respaldoKb: true
  },
  {
    id: "promesa_resultado",
    descripcion: "Promete resultados",
    re: [
      /\b(le|te|les) (aseguro|garantizo|garantizamos|aseguramos) que (va|van|vamos|ganara|ganaran|ganaremos|obtendra|obtendremos|saldra|lograra|lograremos|recuperara|le pagaran)/,
      /\b(caso|juicio|causa) (ganado|asegurado)\b/,
      /\b(vamos a|va a|van a) ganar\b/,
      /\bganara (el|su) (juicio|caso|causa)\b/,
      /\bgarantizamos (el|un|su) (resultado|exito)\b/
    ],
    permitido: () => false
  },
  {
    id: "suplantacion",
    descripcion: "Se presenta como Patricio",
    re: [/\b(soy|habla|le escribe|te escribe) (patricio|el abogado|su abogado|el contador)\b/],
    permitido: () => false
  }
];

const RE_MONTO = /\$\s?\d{1,3}(?:\.\d{3})+(?:,\d+)?|\$\s?\d+(?:,\d+)?|\b\d+(?:[.,]\d+)?\s?(?:uf|utm|pesos|clp)\b/gi;
const normalizarMonto = (m) => sinTildes(m).replace(/\s+/g, "");

function oraciones(texto) {
  return String(texto || "").split(/(?<=[.!?\n])\s*/).map((o) => o.trim()).filter(Boolean);
}
const esPregunta = (o) => o.startsWith("¿") || o.endsWith("?");

export function revisarRespuesta(texto, turno) {
  const problemas = new Set();
  const fuente = sinTildes(turno.textoConocimiento || "");
  const respaldoMontos = normalizarMonto(`${turno.textoConocimiento || ""} ${turno.textoRespaldo || ""}`);
  for (const o of oraciones(texto)) {
    if (esPregunta(o)) continue;
    const t = sinTildes(o);
    const tildes = o.toLowerCase();
    for (const r of REGLAS) {
      if (problemas.has(r.id) || r.permitido(turno)) continue;
      const afirma = (r.re || []).some((re) => [...t.matchAll(new RegExp(re.source, "g"))].some((m) => !m.groups?.neg && !(r.respaldoKb && fuente.includes(m[0]))))
        || (r.reTildes || []).some((re) => re.test(tildes));
      if (afirma) problemas.add(r.id);
    }
    // Montos: solo si constan en la base de conocimiento aprobada, en lo que
    // escribió el cliente o en datos devueltos por las herramientas del turno.
    for (const m of o.match(RE_MONTO) || []) {
      if (!respaldoMontos.includes(normalizarMonto(m))) problemas.add("monto_no_respaldado");
    }
    // Descuentos: solo si la base aprobada los menciona, salvo que se nieguen.
    if (/\bdescuento/.test(t) && !/\bno\b/.test(t) && !fuente.includes("descuento")) problemas.add("descuento_no_aprobado");
  }
  return { ok: problemas.size === 0, problemas: [...problemas] };
}

export const DESCRIPCIONES = Object.fromEntries(REGLAS.map((r) => [r.id, r.descripcion]).concat([
  ["monto_no_respaldado", "Informa montos que no están en la base de conocimiento aprobada ni en los datos del caso"],
  ["descuento_no_aprobado", "Ofrece descuentos no aprobados"]
]));
