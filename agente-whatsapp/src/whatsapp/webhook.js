// Webhook de WhatsApp: verificación de suscripción (GET), validación de la
// firma X-Hub-Signature-256 (HMAC-SHA256 del cuerpo crudo con el App Secret)
// y extracción de mensajes, estados de entrega y ecos.

import { createHmac, timingSafeEqual } from "node:crypto";

export function verificarSuscripcion(query, verifyToken) {
  if (!verifyToken) return null;
  if (query.get("hub.mode") !== "subscribe") return null;
  const token = query.get("hub.verify_token") || "";
  const a = Buffer.from(token), b = Buffer.from(verifyToken);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return query.get("hub.challenge");
}

export function firmaValida(cuerpoCrudo, cabecera, appSecret) {
  if (!appSecret || !cabecera || !cabecera.startsWith("sha256=")) return false;
  const esperado = createHmac("sha256", appSecret).update(cuerpoCrudo).digest("hex");
  const recibido = cabecera.slice(7);
  if (!/^[0-9a-f]{64}$/i.test(recibido)) return false;
  return timingSafeEqual(Buffer.from(recibido, "hex"), Buffer.from(esperado, "hex"));
}

const MEDIA = ["image", "document", "audio", "video", "sticker"];

function normalizarMensaje(m, perfiles) {
  const base = { waId: m.id, de: m.from, nombrePerfil: perfiles.get(m.from) || null, timestamp: m.timestamp ? Number(m.timestamp) : null, tipo: m.type, texto: null, media: null };
  switch (m.type) {
    case "text": base.texto = m.text?.body ?? ""; break;
    case "button": base.texto = m.button?.text ?? ""; break;
    case "interactive": base.texto = m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? ""; break;
    case "location": base.texto = `[Ubicación compartida${m.location?.name ? `: ${m.location.name}` : ""}]`; break;
    case "contacts": base.texto = "[Tarjeta de contacto compartida]"; break;
    case "reaction": return null; // las reacciones no requieren respuesta
    default:
      if (MEDIA.includes(m.type)) {
        const d = m[m.type] || {};
        base.media = { id: d.id, mime: d.mime_type || null, nombre: d.filename || null, sha256: d.sha256 || null };
        base.texto = d.caption || null;
      } else {
        base.texto = "[Mensaje de un tipo no admitido]";
      }
  }
  return base;
}

// Devuelve { mensajes, estados, ecos, descartados } a partir del JSON del webhook.
// Solo se aceptan eventos del número configurado (phone_number_id).
export function extraerEventos(payload, phoneNumberId) {
  const salida = { mensajes: [], estados: [], ecos: [], descartados: 0 };
  if (payload?.object !== "whatsapp_business_account") return salida;
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      if (phoneNumberId && v.metadata?.phone_number_id !== phoneNumberId) { salida.descartados++; continue; }
      if (change.field === "messages") {
        const perfiles = new Map((v.contacts || []).map((c) => [c.wa_id, c.profile?.name || null]));
        for (const m of v.messages || []) { const n = normalizarMensaje(m, perfiles); if (n) salida.mensajes.push(n); }
        for (const s of v.statuses || []) salida.estados.push({ waId: s.id, estado: s.status, destinatario: s.recipient_id, errores: s.errors || null });
      } else if (change.field === "smb_message_echoes") {
        // Coexistencia con la app WhatsApp Business: mensajes que Patricio
        // envía desde el teléfono. Se usan para pausar el agente en ese chat.
        for (const e of v.message_echoes || []) salida.ecos.push({ waId: e.id, para: e.to, texto: e.text?.body ?? null });
      }
    }
  }
  return salida;
}
