// Módulo opcional: búsqueda en la Biblioteca de Anuncios de Meta (Ad Library API).
//
// Alcance (verificado con fuentes secundarias; revisa la documentación oficial
// en developers.facebook.com/docs/graph-api/reference/ads_archive antes de
// depender de esto):
//   - Con ad_type=ALL, la API devuelve anuncios comerciales solo si fueron
//     mostrados en la UE o el Reino Unido. Para otros países (incluido Chile)
//     queda limitada en la práctica a anuncios políticos o de temas sociales.
//   - Requiere un token de acceso de una app de Meta con acceso a la Ad
//     Library API (identidad verificada en facebook.com/ID).
//
// El token se guarda solo en este navegador (localStorage).

(function (global) {
  const CAMPOS = [
    "id", "page_name", "ad_creative_bodies", "ad_creative_link_titles",
    "ad_delivery_start_time", "ad_delivery_stop_time",
    "publisher_platforms", "eu_total_reach",
  ].join(",");

  async function buscar({ token, terminos, pais = "ES", version = "v25.0", soloActivos = true, limite = 25 }) {
    if (!token) throw new Error("Falta el token de acceso de Meta.");
    if (!terminos) throw new Error("Escribe un término de búsqueda (ej.: 'corrector de postura').");
    const params = new URLSearchParams({
      access_token: token,
      search_terms: terminos,
      ad_reached_countries: JSON.stringify([pais.toUpperCase()]),
      ad_type: "ALL",
      ad_active_status: soloActivos ? "ACTIVE" : "ALL",
      fields: CAMPOS,
      limit: String(limite),
    });
    const resp = await fetch(`https://graph.facebook.com/${version}/ads_archive?${params}`);
    const json = await resp.json();
    if (json.error) throw new Error(`Meta respondió: ${json.error.message}`);
    return (json.data || []).map(normalizar);
  }

  function normalizar(a) {
    const inicio = (a.ad_delivery_start_time || "").slice(0, 10);
    const fin = a.ad_delivery_stop_time ? new Date(a.ad_delivery_stop_time) : new Date();
    const dias = inicio ? Math.max(1, Math.round((fin - new Date(inicio + "T00:00:00")) / 86400000)) : 0;
    return {
      id: a.id,
      pagina: a.page_name || "",
      texto: (a.ad_creative_bodies || [])[0] || "",
      titulo: (a.ad_creative_link_titles || [])[0] || "",
      inicio,
      diasActivo: dias,
      plataformas: (a.publisher_platforms || []).join(", "),
      alcanceUE: a.eu_total_reach || null,
      // Enlace público a la Biblioteca de Anuncios. No se usa ad_snapshot_url
      // porque incluye el token de acceso en la URL.
      enlace: `https://www.facebook.com/ads/library/?id=${encodeURIComponent(a.id)}`,
    };
  }

  global.MetaAPI = { buscar, normalizar };
})(window);
