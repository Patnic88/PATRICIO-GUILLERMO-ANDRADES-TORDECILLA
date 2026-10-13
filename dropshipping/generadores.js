// Generadores: convierten un ganador analizado en material ORIGINAL para tu
// tienda (ficha de producto, guion de anuncio, CSV de Shopify, JSON).
//
// Se replica la ESTRUCTURA que funcionó (tipo de gancho, formato, oferta),
// no el contenido literal del anuncio ajeno: los textos y videos de otros
// vendedores están protegidos por derecho de autor.

(function (global) {
  const S = typeof module !== "undefined" && module.exports ? require("./scoring.js") : global.Scoring;

  const GANCHOS = {
    "Pregunta": "¿Sabías que [problema común] tiene solución en [tiempo corto]?",
    "Problema / dolor": "Si te pasa que [problema], mira esto.",
    "Antes / después": "Así estaba [situación antes]… y así quedó con [producto].",
    "Demostración directa": "Mira lo que hace esto en 3 segundos 👀",
    "Curiosidad / sorpresa": "Nadie me creía que esto [resultado sorprendente]…",
    "Prueba social": "[N] personas ya lo usan para [beneficio]. Te muestro por qué.",
    "Oferta / precio": "Lo encontré a [precio] y [beneficio principal].",
  };

  const FORMATOS = {
    "UGC (persona hablando a cámara)": "Graba con el celular en vertical, luz natural, hablando como si se lo recomendaras a un amigo.",
    "Demostración del producto": "Plano cercano de las manos usando el producto; sin cortes largos.",
    "Antes / después": "Mismo encuadre antes y después; pantalla dividida o corte seco.",
    "Unboxing": "Muestra el empaque, lo que viene incluido y el primer uso.",
    "Comparación": "Producto vs. la forma 'tradicional' de hacerlo, lado a lado.",
    "Tutorial / paso a paso": "3 pasos numerados en pantalla, uno por plano.",
    "Slideshow de imágenes": "5–7 imágenes con texto grande; útil si aún no tienes el producto.",
  };

  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const slug = (t) =>
    String(t || "producto")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
      .slice(0, 60) || "producto";

  function beneficios(g) {
    return [g.beneficio1, g.beneficio2, g.beneficio3].filter((b) => b && b.trim());
  }

  function ficha(g, opciones = {}) {
    const moneda = opciones.moneda || "CLP";
    const mult = opciones.multiplicador || 2.8;
    const m = S.metricas(g);
    const precio = S.precioSugerido(m.costoTotal, mult, moneda);
    const comparar = opciones.precioComparacion ? S.precioSugerido(m.costoTotal, mult * 1.4, moneda) : 0;
    const producto = g.producto || "[Nombre del producto]";
    const titulo = g.beneficioPrincipal ? `${producto} – ${g.beneficioPrincipal}` : producto;
    const bs = beneficios(g);

    const html = [
      `<p><strong>${esc(g.problema || "[¿Qué problema resuelve?]")}</strong></p>`,
      `<p>${esc(producto)} ${esc(g.beneficioPrincipal ? "te ayuda a " + g.beneficioPrincipal.toLowerCase() : "[beneficio principal]")}.</p>`,
      "<ul>",
      ...(bs.length ? bs : ["[Beneficio 1]", "[Beneficio 2]", "[Beneficio 3]"]).map((b) => `<li>✅ ${esc(b)}</li>`),
      "</ul>",
      `<p><strong>Incluye:</strong> ${esc(g.incluye || "[qué recibe el cliente]")}</p>`,
      `<p><strong>Envío:</strong> ${esc(g.tiempoEnvio || "[plazo real de entrega informado por tu proveedor]")}</p>`,
    ].join("");

    return {
      handle: slug(producto),
      titulo,
      descripcionHtml: html,
      precio,
      precioComparacion: comparar,
      moneda,
      tipo: g.nicho || "",
      etiquetas: [g.nicho, g.tipoGancho, g.formato].filter(Boolean),
      seoTitulo: titulo.slice(0, 70),
      seoDescripcion: [g.problema, g.beneficioPrincipal].filter(Boolean).join(". ").slice(0, 160),
    };
  }

  // Guion de 30 s en bloques, para mostrarlo como línea de tiempo.
  function guionPasos(g) {
    const bs = beneficios(g);
    const oferta = g.oferta && g.oferta !== "Ninguna" ? g.oferta : "[tu oferta, si tienes una]";
    return [
      { tiempo: "0–3 s", titulo: "Detén el scroll", texto: GANCHOS[g.tipoGancho] || "[Primera frase que haga que la gente se detenga]" },
      { tiempo: "3–10 s", titulo: "Muestra el problema y el producto", texto: g.problema || "[Muestra el problema y el producto resolviéndolo]" },
      { tiempo: "10–20 s", titulo: "Cuenta los beneficios", texto: (bs.length ? bs : ["[beneficio 1]", "[beneficio 2]"]).join(" · ") },
      { tiempo: "20–25 s", titulo: "Di la oferta", texto: oferta },
      { tiempo: "25–30 s", titulo: "Dile qué hacer", texto: g.cta || "Toca el enlace y pídelo hoy" },
    ];
  }

  function comoGrabar(g) {
    return FORMATOS[g.formato] || "Graba en vertical (como se ve en el celular), entre 15 y 30 segundos.";
  }

  function guion(g) {
    return [
      `TIPO DE VIDEO: ${g.formato || "—"}`,
      `Cómo grabarlo: ${comoGrabar(g)}`,
      "",
      ...guionPasos(g).map((p) => `${p.tiempo}  ${p.titulo.toUpperCase()}: ${p.texto}`),
      "",
      "Escribe el texto con tus propias palabras y graba tu propio video.",
      "No reutilices el video, la música ni el texto del anuncio original.",
    ].join("\n");
  }

  // CSV con columnas de la plantilla de productos de Shopify. Los encabezados
  // distinguen mayúsculas y minúsculas; solo Handle y Title son obligatorios.
  const COLUMNAS_CSV = [
    "Handle", "Title", "Body (HTML)", "Vendor", "Type", "Tags", "Published",
    "Option1 Name", "Option1 Value", "Variant Price", "Variant Compare At Price",
    "Variant Requires Shipping", "Variant Taxable", "SEO Title", "SEO Description", "Status",
  ];

  const celda = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  function csvShopify(fichas, proveedor = "") {
    const filas = fichas.map((f) => [
      f.handle, f.titulo, f.descripcionHtml, proveedor, f.tipo, f.etiquetas.join(", "), "FALSE",
      "Title", "Default Title", f.precio || "", f.precioComparacion || "",
      "TRUE", "TRUE", f.seoTitulo, f.seoDescripcion, "draft",
    ]);
    return [COLUMNAS_CSV, ...filas].map((fila) => fila.map(celda).join(",")).join("\n");
  }

  // JSON para pedirle a Claude que cree el producto con el conector de Shopify.
  function jsonShopify(f) {
    return {
      instruccion: "Crea este producto en mi tienda Shopify como BORRADOR (status DRAFT).",
      producto: {
        title: f.titulo,
        handle: f.handle,
        descriptionHtml: f.descripcionHtml,
        productType: f.tipo,
        tags: f.etiquetas,
        status: "DRAFT",
        price: String(f.precio),
        compareAtPrice: f.precioComparacion ? String(f.precioComparacion) : null,
        seo: { title: f.seoTitulo, description: f.seoDescripcion },
      },
    };
  }

  const api = { GANCHOS, FORMATOS, COLUMNAS_CSV, ficha, guion, guionPasos, comoGrabar, csvShopify, jsonShopify, slug };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.Generadores = api;
})(typeof window !== "undefined" ? window : globalThis);
