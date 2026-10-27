// Base de conocimiento editable. El agente solo recibe entradas aprobadas;
// las pendientes se informan como "no disponible" para que derive.

import { readFileSync } from "node:fs";
import { ahora } from "../db.js";

export const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const VACIAS = new Set("el la los las un una unos unas de del al a y o que en por para con sin su sus es son se lo le me mi tu cual cuales cuanto cuanta como donde cuando hay tiene tienen tengo quiero quisiera saber necesito favor hola buenas buenos dias tardes noches".split(" "));

// Sinónimos frecuentes en preguntas por WhatsApp → términos de la base.
const SINONIMOS = [
  [/^(cobr|preci|valor|cost|tarif|honor|cuest|vale|sale)/, ["honorarios", "valor"]],
  [/^(direcc|ubica|donde|quedan|oficin)/, ["direccion", "oficina"]],
  [/^(horar|abren|atiend|cierran)/, ["horario", "atencion"]],
  [/^(pag|transf|cuent|banco|deposit)/, ["pagos", "medios", "transferencia"]],
  [/^(contrat|encarg)/, ["contratacion", "encargo"]],
  [/^(cita|reuni|presenc|videoll)/, ["citas", "modalidades"]],
  [/^(document|papel|antecedent)/, ["documentos"]]
];

function terminos(s) {
  const base = sinTildes(s).split(/[^a-z0-9ñ]+/).filter((t) => t.length > 2 && !VACIAS.has(t));
  const extra = base.flatMap((t) => SINONIMOS.filter(([re]) => re.test(t)).flatMap(([, v]) => v));
  return [...new Set([...base, ...extra])];
}

// Inserta las entradas de la semilla que todavía no existen. Nunca
// sobrescribe lo que Patricio ya editó en el panel.
export function cargarSemilla(db, ruta) {
  const semilla = JSON.parse(readFileSync(ruta, "utf8"));
  const ins = db.prepare(
    `INSERT OR IGNORE INTO conocimiento (clave, categoria, titulo, contenido, estado, nota_interna, actualizado, actualizado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'semilla')`
  );
  let n = 0;
  for (const e of semilla.entradas) {
    n += Number(ins.run(e.clave, e.categoria, e.titulo, e.contenido, e.estado, e.nota_interna || null, ahora()).changes);
  }
  return n;
}

export function buscarConocimiento(db, consulta, limite = 5) {
  const q = terminos(consulta);
  const filas = db.prepare("SELECT clave, categoria, titulo, contenido, estado FROM conocimiento").all();
  const puntuar = (f) => {
    const texto = sinTildes(`${f.clave} ${f.categoria} ${f.titulo} ${f.contenido}`);
    const titulo = sinTildes(`${f.clave} ${f.titulo}`);
    let p = 0;
    for (const t of q) {
      const raiz = t.length > 5 ? t.slice(0, 5) : t;
      if (titulo.includes(raiz)) p += 3;
      else if (texto.includes(raiz)) p += 1;
    }
    return p;
  };
  const conPuntaje = filas.map((f) => ({ ...f, p: q.length ? puntuar(f) : 0 })).filter((f) => f.p > 0).sort((a, b) => b.p - a.p);
  const aprobadas = conPuntaje.filter((f) => f.estado === "aprobado").slice(0, limite)
    .map(({ clave, titulo, contenido }) => ({ clave, titulo, contenido }));
  const pendientes = conPuntaje.filter((f) => f.estado !== "aprobado").slice(0, limite)
    .map(({ clave, titulo }) => ({ clave, titulo }));
  // La coincidencia más cercana: si no está aprobada, la respuesta correcta
  // es "pendiente", aunque haya otras entradas aprobadas parecidas.
  const mejor = conPuntaje[0] ? { clave: conPuntaje[0].clave, estado: conPuntaje[0].estado === "aprobado" ? "aprobado" : "no_aprobado" } : null;
  return { aprobadas, pendientes, mejor_coincidencia: mejor };
}

export function listarAprobadasCategoria(db, categoria) {
  return db.prepare("SELECT clave, titulo, contenido FROM conocimiento WHERE estado = 'aprobado' AND categoria = ? ORDER BY clave").all(categoria);
}
