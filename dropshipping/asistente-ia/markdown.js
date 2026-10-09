// Markdown mínimo y seguro para mostrar las respuestas de Claude: primero
// escapa TODO el HTML y después aplica formato (títulos, listas, tablas,
// negritas, código y enlaces http/https). Nada del texto del modelo se
// interpreta como HTML.
(function (global) {
  "use strict";

  function escapar(t) {
    return String(t)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // Formato dentro de una línea (el texto ya viene escapado).
  function enLinea(t) {
    const codigos = [];
    let s = t.replace(/`([^`]+)`/g, (_, c) => { codigos.push(c); return `\u0000${codigos.length - 1}\u0000`; });
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:!?]|$)/g, "$1<em>$2</em>");
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codigos[Number(i)]}</code>`);
  }

  function celdas(linea) {
    return linea.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  }

  function aHtml(texto) {
    const lineas = escapar(String(texto || "").replace(/\r\n?/g, "\n")).split("\n");
    const out = [];
    let i = 0;
    while (i < lineas.length) {
      const l = lineas[i];
      if (/^```/.test(l)) {
        const bloque = [];
        i++;
        while (i < lineas.length && !/^```/.test(lineas[i])) bloque.push(lineas[i++]);
        i++;
        out.push(`<pre><code>${bloque.join("\n")}</code></pre>`);
        continue;
      }
      if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lineas.length && /^\s*\|?\s*:?-{2,}/.test(lineas[i + 1])) {
        const cab = celdas(l);
        i += 2;
        const filas = [];
        while (i < lineas.length && /^\s*\|.*\|\s*$/.test(lineas[i])) filas.push(celdas(lineas[i++]));
        out.push('<div class="tabla-scroll"><table><thead><tr>' + cab.map((c) => `<th>${enLinea(c)}</th>`).join("") +
          "</tr></thead><tbody>" + filas.map((f) => "<tr>" + f.map((c) => `<td>${enLinea(c)}</td>`).join("") + "</tr>").join("") +
          "</tbody></table></div>");
        continue;
      }
      const h = /^(#{1,4})\s+(.*)$/.exec(l);
      if (h) { const n = Math.min(h[1].length + 2, 6); out.push(`<h${n}>${enLinea(h[2])}</h${n}>`); i++; continue; }
      if (/^\s*([-*•])\s+/.test(l) || /^\s*\d+[.)]\s+/.test(l)) {
        const ordenada = /^\s*\d+[.)]\s+/.test(l);
        const items = [];
        while (i < lineas.length && (ordenada ? /^\s*\d+[.)]\s+/ : /^\s*([-*•])\s+/).test(lineas[i])) {
          items.push(lineas[i++].replace(ordenada ? /^\s*\d+[.)]\s+/ : /^\s*([-*•])\s+/, ""));
        }
        const tag = ordenada ? "ol" : "ul";
        out.push(`<${tag}>` + items.map((t) => `<li>${enLinea(t)}</li>`).join("") + `</${tag}>`);
        continue;
      }
      if (/^\s*(---|\*\*\*)\s*$/.test(l)) { out.push("<hr>"); i++; continue; }
      if (!l.trim()) { i++; continue; }
      const parrafo = [];
      while (i < lineas.length && lineas[i].trim() && !/^```|^#{1,4}\s|^\s*([-*•])\s+|^\s*\d+[.)]\s+|^\s*\|.*\|\s*$/.test(lineas[i])) {
        parrafo.push(enLinea(lineas[i++]));
      }
      if (parrafo.length) out.push(`<p>${parrafo.join("<br>")}</p>`);
      else out.push(`<p>${enLinea(lineas[i++])}</p>`);
    }
    return out.join("\n");
  }

  const api = { escapar, aHtml };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.Markdown = api;
})(typeof window !== "undefined" ? window : globalThis);
