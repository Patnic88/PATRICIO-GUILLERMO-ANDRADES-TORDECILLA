// Modo navegador — paso 2: contenido de UNA nota de pjud.cl.
//
// Se ejecuta en la pestaña de la persona con la nota abierta
// (https://www.pjud.cl/prensa-y-comunicaciones/noticias-del-poder-judicial/<número>).
// Devuelve solo la noticia (título, fecha, bajada y cuerpo), sin scripts ni
// imágenes, con la URL en un comentario: es lo que reporte.mjs --entrada lee.
//
// Devuelve "VERIFICACION" si la pestaña muestra el CAPTCHA o el rechazo del
// sitio, y "FORMATO_DESCONOCIDO" si no encuentra la noticia.
(() => {
  const texto = document.body ? document.body.innerText : "";
  if (/What code is in the image|testing whether you are a human|ha sido rechazada/i.test(texto)) return "VERIFICACION";
  const titulo = document.querySelector("h3.blog-title");
  const cuerpo = document.querySelector("div.blog-content");
  if (!titulo || !cuerpo) return "FORMATO_DESCONOCIDO";
  const despues = (el) => titulo.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING;
  const fecha = [...document.querySelectorAll("span.text-muted")].find(despues);
  const bajada = document.querySelector("blockquote.wp-block-quote");
  return [
    `<!-- ${location.href} -->`,
    titulo.outerHTML,
    fecha ? fecha.outerHTML : "",
    bajada ? bajada.outerHTML : "",
    cuerpo.outerHTML
  ].join("\n");
})()
