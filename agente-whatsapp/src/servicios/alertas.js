// Alertas internas para Patricio. Se muestran en el panel y, si está
// configurado, se avisa por WhatsApp con una plantilla aprobada.

import { ahora } from "../db.js";
import { auditar } from "./auditoria.js";

let notificador = null;
export const fijarNotificador = (fn) => { notificador = fn; };

export function crearAlerta(db, { tipo, prioridad = "media", conversacionId = null, solicitudId = null, descripcion, fechaInformada = null, claveDedupe = null, actor = "sistema" }) {
  if (claveDedupe) {
    const existe = db.prepare("SELECT id FROM alertas WHERE clave_dedupe = ?").get(claveDedupe);
    if (existe) return { id: existe.id, nueva: false };
  }
  const r = db.prepare(
    `INSERT INTO alertas (tipo, prioridad, conversacion_id, solicitud_id, descripcion, fecha_informada, clave_dedupe, creado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(tipo, prioridad, conversacionId, solicitudId, String(descripcion).slice(0, 2000), fechaInformada, claveDedupe, ahora());
  const id = Number(r.lastInsertRowid);
  auditar(db, { actor, accion: "alerta.crear", conversacionId, detalle: { id, tipo, prioridad } });
  if (prioridad === "alta" && notificador) {
    Promise.resolve()
      .then(() => notificador({ id, tipo, prioridad }))
      .then((ok) => { if (ok) db.prepare("UPDATE alertas SET notificada = ? WHERE id = ?").run(ahora(), id); })
      .catch((e) => auditar(db, { actor: "sistema", accion: "alerta.notificar", conversacionId, resultado: "error", detalle: { id, error: String(e.message || e) } }));
  }
  return { id, nueva: true };
}

export function resolverAlerta(db, id, actor) {
  db.prepare("UPDATE alertas SET estado = 'resuelta', resuelta_en = ? WHERE id = ?").run(ahora(), id);
  auditar(db, { actor, accion: "alerta.resolver", detalle: { id } });
}
