// Agenda propia de la oficina. Los bloques de atención los define Patricio en
// el panel; mientras no lo haga, la agenda queda "no configurada" y el
// agente no ofrece horas.

import { ahora, leerAjuste, guardarAjuste, transaccion } from "../db.js";
import { localAUtc, fechaLocal, diaSemanaLocal, sumarDias, describir } from "./fechas.js";

export const AGENDA_POR_DEFECTO = {
  configurada: false,
  duracionMinutos: 45,
  anticipacionHoras: 24,
  diasVista: 14,
  maxOpciones: 6,
  modalidades: [],
  bloques: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] },
  excepciones: []
};

export const leerAgenda = (db) => ({ ...AGENDA_POR_DEFECTO, ...(leerAjuste(db, "agenda") || {}) });
export const guardarAgenda = (db, agenda) => guardarAjuste(db, "agenda", agenda);

// Bloques libres desde "ahora + anticipación" hasta "diasVista" días.
export function bloquesLibres(db, tz, { referencia = new Date(), dias } = {}) {
  const ag = leerAgenda(db);
  if (!ag.configurada) return { configurada: false, bloques: [] };
  const minimo = referencia.getTime() + ag.anticipacionHoras * 3600_000;
  const ocupados = new Set(db.prepare("SELECT inicio FROM citas WHERE estado = 'confirmada' AND inicio >= ?").all(new Date(referencia).toISOString()).map((c) => c.inicio));
  const hoy = fechaLocal(referencia, tz);
  const libres = [];
  for (let i = 0; i <= (dias ?? ag.diasVista); i++) {
    const dia = sumarDias(hoy, i);
    if (ag.excepciones.includes(dia)) continue;
    const mediodia = localAUtc(dia, "12:00", tz);
    const horas = ag.bloques[diaSemanaLocal(mediodia, tz)] || [];
    for (const h of [...horas].sort()) {
      const inicio = localAUtc(dia, h, tz);
      if (inicio.getTime() < minimo) continue;
      const iso = inicio.toISOString();
      if (ocupados.has(iso)) continue;
      const fin = new Date(inicio.getTime() + ag.duracionMinutos * 60_000);
      libres.push({ inicio: iso, fin: fin.toISOString(), texto: describir(inicio, tz) });
    }
  }
  return { configurada: true, modalidades: ag.modalidades, duracionMinutos: ag.duracionMinutos, bloques: libres };
}

// Reserva un bloque. Garantías: el bloque debe estar ofrecido y libre; un
// índice único en la base impide dos reservas confirmadas simultáneas; un
// mismo contacto no acumula reservas futuras duplicadas.
export function reservarCita(db, tz, { contactoId, conversacionId, clienteId = null, solicitudId = null, inicio, modalidad = null, motivo = null, nombre = null }) {
  const ag = leerAgenda(db);
  if (!ag.configurada) return { ok: false, motivo: "agenda_no_configurada" };
  const inicioIso = new Date(inicio).toISOString();
  return transaccion(db, () => {
    const existente = db.prepare("SELECT id, inicio FROM citas WHERE contacto_id = ? AND estado = 'confirmada' AND inicio >= ? ORDER BY inicio LIMIT 1").get(contactoId, ahora());
    if (existente) return { ok: false, motivo: "ya_tiene_cita", cita_id: existente.id, inicio: existente.inicio, texto: describir(new Date(existente.inicio), tz) };
    const libre = bloquesLibres(db, tz).bloques.find((b) => b.inicio === inicioIso);
    if (!libre) return { ok: false, motivo: "bloque_no_disponible" };
    if (modalidad && ag.modalidades.length && !ag.modalidades.includes(modalidad)) return { ok: false, motivo: "modalidad_no_disponible", modalidades: ag.modalidades };
    try {
      const r = db.prepare(
        `INSERT INTO citas (contacto_id, conversacion_id, cliente_id, solicitud_id, inicio, fin, modalidad, motivo, nombre, estado, creado, actualizado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmada', ?, ?)`
      ).run(contactoId, conversacionId, clienteId, solicitudId, libre.inicio, libre.fin, modalidad, motivo, nombre, ahora(), ahora());
      return { ok: true, cita_id: Number(r.lastInsertRowid), inicio: libre.inicio, fin: libre.fin, texto: libre.texto, modalidad };
    } catch (e) {
      if (/UNIQUE/i.test(String(e.message))) return { ok: false, motivo: "bloque_no_disponible" };
      throw e;
    }
  });
}

export function cancelarCita(db, { citaId, contactoId = null }) {
  const cita = db.prepare("SELECT * FROM citas WHERE id = ?").get(citaId);
  if (!cita || (contactoId !== null && cita.contacto_id !== contactoId)) return { ok: false, motivo: "cita_no_encontrada" };
  if (cita.estado !== "confirmada") return { ok: false, motivo: "cita_no_vigente" };
  db.prepare("UPDATE citas SET estado = 'cancelada', actualizado = ? WHERE id = ?").run(ahora(), citaId);
  return { ok: true, cita_id: citaId };
}
