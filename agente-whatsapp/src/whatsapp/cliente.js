// Cliente de la API oficial de WhatsApp Business (Cloud API de Meta).
//
// En MODO=prueba solo se envían mensajes reales a los números listados en
// NUMEROS_PRUEBA (y solo si hay credenciales); el resto queda "simulado" en la
// base de datos. No existe función de envío masivo.

import { createHash } from "node:crypto";

export class ErrorWhatsApp extends Error {
  constructor(mensaje, { estado = null, codigo = null } = {}) {
    super(mensaje);
    this.estado = estado;
    this.codigo = codigo;
  }
}

export function crearClienteWhatsApp(cfg, { fetchImpl = globalThis.fetch } = {}) {
  const w = cfg.whatsapp;
  const base = `${w.graphUrl}/${w.apiVersion}`;
  const credenciales = !!(w.token && w.phoneNumberId);

  // Las respuestas automáticas en modo prueba solo salen a NUMEROS_PRUEBA.
  // Lo que Patricio escribe a mano desde el panel siempre se envía.
  const puedeEnviarReal = (telefono, { manual = false } = {}) => {
    if (!credenciales) return false;
    if (cfg.modo === "produccion" || manual) return true;
    return w.numerosPrueba.includes(String(telefono).replace(/\D/g, ""));
  };

  async function llamar(ruta, { metodo = "GET", cuerpo = null } = {}) {
    const r = await fetchImpl(`${base}${ruta}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${w.token}`, ...(cuerpo ? { "Content-Type": "application/json" } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: AbortSignal.timeout(15_000)
    });
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) throw new ErrorWhatsApp(`WhatsApp API ${r.status}: ${datos?.error?.message || "error"}`.slice(0, 300), { estado: r.status, codigo: datos?.error?.code ?? null });
    return datos;
  }

  return {
    credenciales,
    puedeEnviarReal,

    // Respuesta de texto dentro de la ventana de atención abierta por el cliente.
    async enviarTexto(telefono, texto, { manual = false } = {}) {
      if (!puedeEnviarReal(telefono, { manual })) return { simulado: true, id: null };
      const d = await llamar(`/${w.phoneNumberId}/messages`, {
        metodo: "POST",
        cuerpo: { messaging_product: "whatsapp", recipient_type: "individual", to: telefono, type: "text", text: { preview_url: false, body: texto } }
      });
      return { simulado: false, id: d?.messages?.[0]?.id ?? null };
    },

    // Mensaje de plantilla (solo para avisos internos a Patricio; requiere una
    // plantilla aprobada por Meta).
    async enviarPlantilla(telefono, nombre, idioma, parametros = []) {
      if (!puedeEnviarReal(telefono)) return { simulado: true, id: null };
      const d = await llamar(`/${w.phoneNumberId}/messages`, {
        metodo: "POST",
        cuerpo: {
          messaging_product: "whatsapp", to: telefono, type: "template",
          template: { name: nombre, language: { code: idioma }, components: parametros.length ? [{ type: "body", parameters: parametros.map((p) => ({ type: "text", text: String(p).slice(0, 200) })) }] : [] }
        }
      });
      return { simulado: false, id: d?.messages?.[0]?.id ?? null };
    },

    // Descarga un archivo recibido: primero se obtiene la URL temporal del
    // medio y luego el contenido, ambas con el token de acceso.
    async descargarMedia(mediaId) {
      if (!credenciales) throw new ErrorWhatsApp("sin_credenciales_whatsapp");
      const meta = await llamar(`/${encodeURIComponent(mediaId)}`);
      if (meta.file_size && meta.file_size > w.maxBytesMedia) throw new ErrorWhatsApp(`archivo_demasiado_grande (${meta.file_size} bytes)`);
      const r = await fetchImpl(meta.url, { headers: { Authorization: `Bearer ${w.token}` }, signal: AbortSignal.timeout(60_000) });
      if (!r.ok) throw new ErrorWhatsApp(`descarga_media ${r.status}`, { estado: r.status });
      const bytes = Buffer.from(await r.arrayBuffer());
      if (bytes.length > w.maxBytesMedia) throw new ErrorWhatsApp("archivo_demasiado_grande");
      const hash = createHash("sha256").update(bytes).digest("hex");
      if (meta.sha256 && meta.sha256 !== hash) throw new ErrorWhatsApp("sha256_no_coincide");
      return { bytes, mime: meta.mime_type || "application/octet-stream", sha256: hash };
    }
  };
}
