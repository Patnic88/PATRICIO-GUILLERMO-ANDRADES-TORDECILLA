// Modo navegador — paso 1: lista "Noticias sobre fallos" de la jurisdicción
// C.A. de La Serena, solo del período.
//
// Se ejecuta en una pestaña del navegador de la persona, ya abierta en
// https://www.pjud.cl/prensa-y-comunicaciones/noticias-del-poder-judicial
// (si el sitio pidió verificación humana, ella ya la resolvió). Hace el mismo
// POST que el botón "Filtrar" del sitio y devuelve solo las notas del período,
// para que el resultado sea corto. Cambia las dos fechas de la última línea.
//
// Devuelve un texto: "VERIFICACION" si el sitio pide CAPTCHA; si no, el HTML
// de las notas del período (lo que reporte.mjs --entrada reconoce como lista).
(async (desde, hasta) => {
  const fd = new FormData();
  fd.append("id_jurisdiction", "7");
  fd.append("new_type_id", "48");
  const r = await fetch("/ajax/news/getNewsForFilters", {
    method: "POST", body: fd, headers: { "X-Requested-With": "XMLHttpRequest" }
  });
  const html = await r.text();
  if (/What code is in the image|testing whether you are a human|ha sido rechazada/i.test(html)) return "VERIFICACION";
  if (!r.ok) return `ERROR HTTP ${r.status}`;
  const bloques = html.match(/<div class="row mb-2 col-12 jtpaginators[\s\S]*?<\/a>\s*<\/div>/g) || [];
  const enPeriodo = bloques.filter((b) => {
    const f = b.match(/(\d{2})-(\d{2})-(\d{4})/);
    const iso = f ? `${f[3]}-${f[2]}-${f[1]}` : "";
    return iso >= desde && iso <= hasta;
  });
  return `<!-- Lista pjud.cl (C.A de La Serena · Noticias sobre fallos) del ${desde} al ${hasta}: ${enPeriodo.length} de ${bloques.length} notas -->\n`
    + enPeriodo.join("\n");
})("2026-10-19", "2026-10-25")
