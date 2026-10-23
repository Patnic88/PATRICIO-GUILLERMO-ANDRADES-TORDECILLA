// Detección determinista de señales que requieren revisión prioritaria.
// Funciona aunque el modelo de IA falle u omita la clasificación: el código
// crea la alerta, no el modelo. No calcula plazos; solo registra lo que el
// cliente informó, en forma literal.

import { sinTildes } from "../servicios/conocimiento.js";

const SENALES = [
  { tipo: "audiencia", etiqueta: "audiencia", re: /\baudiencia/ },
  { tipo: "remate", etiqueta: "remate o subasta", re: /\b(remate|rematar|subasta)/ },
  { tipo: "notificacion", etiqueta: "notificación judicial o administrativa", re: /\b(notific|me (llego|llegaron) (una |la )?(cedula|carta certificada|demanda)|receptor judicial)/ },
  { tipo: "plazo", etiqueta: "plazo o vencimiento", re: /\b(plazo|vence|vencimiento|vencio|ultimo dia)\b/ },
  { tipo: "embargo", etiqueta: "embargo", re: /\bembarg/ },
  { tipo: "lanzamiento", etiqueta: "desalojo o lanzamiento", re: /\b(lanzamiento|desalojo|desahucio|me quieren sacar de)/ },
  { tipo: "detencion", etiqueta: "detención o formalización", re: /\b(detenid|detencion|formaliz)/ },
  { tipo: "demanda", etiqueta: "demanda recibida", re: /\b(me demandaron|demanda en (mi|nuestra) contra|fui demandad|nos demandaron)/ },
  { tipo: "despido", etiqueta: "despido (posible plazo para reclamar)", re: /\b(me despidieron|despid|carta de aviso|me echaron)/ },
  { tipo: "migratorio", etiqueta: "situación migratoria con posible plazo", re: /\b(expulsi|orden de abandono|rechaz\w* (mi |la )?(visa|residencia|solicitud)|reconsideracion)/ },
  { tipo: "citacion", etiqueta: "citación o comparecencia", re: /\b(citacion|citado a|me citaron|comparecer)/ },
  { tipo: "fiscalizacion", etiqueta: "fiscalización o liquidación tributaria", re: /\b(liquidacion del sii|giro del sii|fiscaliz|citacion del sii)/ }
];

const INMEDIATEZ = /\b(hoy|manana|pasado manana|esta semana|este (lunes|martes|miercoles|jueves|viernes|sabado)|en (\d|un|dos|tres) dias?)\b/;
const GRAVES = new Set(["audiencia", "remate", "plazo", "lanzamiento", "detencion", "migratorio", "notificacion", "citacion"]);

const MESES = "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre";
const RE_FECHAS = new RegExp(
  `\\b(\\d{1,2}[/-]\\d{1,2}(?:[/-]\\d{2,4})?|\\d{1,2} de (?:${MESES})(?: de(?:l)? \\d{4})?|hoy|pasado manana|manana|el (?:lunes|martes|miercoles|jueves|viernes|sabado|domingo))\\b`,
  "g"
);

export function detectarSenales(texto) {
  const original = String(texto || "").normalize("NFC");
  const t = sinTildes(original);
  const encontradas = SENALES.filter((s) => s.re.test(t)).map(({ tipo, etiqueta }) => ({ tipo, etiqueta }));
  // Las fechas se devuelven tal como las escribió el cliente (con tildes).
  const alineado = original.length === t.length;
  const fechas = [...new Set([...t.matchAll(RE_FECHAS)].map((m) => (alineado ? original.slice(m.index, m.index + m[0].length) : m[0]).trim()))];
  let urgencia = "normal";
  if (encontradas.length) urgencia = "prioritaria";
  if (encontradas.some((s) => GRAVES.has(s.tipo)) && (INMEDIATEZ.test(t) || fechas.length)) urgencia = "urgente";
  return { senales: encontradas, fechasLiterales: fechas, urgencia };
}

export const NIVEL = { normal: 0, prioritaria: 1, urgente: 2 };
export const maxUrgencia = (a, b) => (NIVEL[a || "normal"] >= NIVEL[b || "normal"] ? a || "normal" : b);
