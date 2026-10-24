// Registro de operaciones. Todo lo que hace el agente, el panel o el webhook
// queda trazado aquí, sin guardar secretos.

import { ahora } from "../db.js";

export function auditar(db, { actor, accion, conversacionId = null, resultado = "ok", detalle = null }) {
  db.prepare(
    "INSERT INTO auditoria (ts, actor, accion, conversacion_id, resultado, detalle) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(ahora(), actor, accion, conversacionId, resultado, detalle == null ? null : JSON.stringify(detalle));
}

export function log(nivel, mensaje, extra) {
  const linea = { ts: ahora(), nivel, mensaje, ...(extra || {}) };
  (nivel === "error" ? console.error : console.log)(JSON.stringify(linea));
}
