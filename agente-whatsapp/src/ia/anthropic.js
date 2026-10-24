// Proveedor de IA: API de Claude (Anthropic) mediante el SDK oficial.
//
// - Las instrucciones del agente van en `system` con caché de prompt; el
//   contexto variable del turno va al final (mensaje de sistema intermedio),
//   para no invalidar la caché.
// - El historial entre turnos se reconstruye como texto: no se reenvían
//   bloques de razonamiento de turnos anteriores, por lo que no hay
//   "historial editado" que la API pueda rechazar.
// - Respaldo del servidor ante rechazos de los clasificadores de seguridad
//   (`fallbacks: "default"`), configurable con IA_FALLBACKS.

import Anthropic from "@anthropic-ai/sdk";

const ADMITE_FALLBACK = /^claude-(opus-5|opus-5-5|fable-5|fable-5-1|sonnet-5-5)$/;

export function crearProveedorAnthropic(cfgIa) {
  const cliente = new Anthropic({
    apiKey: cfgIa.apiKey,
    ...(cfgIa.baseUrl ? { baseURL: cfgIa.baseUrl } : {}),
    timeout: cfgIa.timeoutMs,
    maxRetries: 2
  });
  const usarFallback = cfgIa.fallbacks && ADMITE_FALLBACK.test(cfgIa.modelo);

  return {
    nombre: "anthropic",
    modelo: cfgIa.modelo,
    async generar({ system, mensajes, herramientas }) {
      const params = {
        model: cfgIa.modelo,
        max_tokens: 16000,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        tools: herramientas,
        messages: mensajes,
        thinking: { type: "adaptive" },
        output_config: { effort: cfgIa.esfuerzo }
      };
      try {
        const r = usarFallback
          ? await cliente.beta.messages.create({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
          : await cliente.messages.create(params);
        return { content: r.content, stop_reason: r.stop_reason, stop_details: r.stop_details ?? null, modelo: r.model, uso: r.usage };
      } catch (e) {
        // Mensaje sin datos sensibles; la clave nunca se incluye.
        if (e instanceof Anthropic.APIError) throw new Error(`anthropic ${e.status ?? "sin_estado"} ${e.constructor.name}: ${String(e.message).slice(0, 200)}`);
        throw e;
      }
    }
  };
}
