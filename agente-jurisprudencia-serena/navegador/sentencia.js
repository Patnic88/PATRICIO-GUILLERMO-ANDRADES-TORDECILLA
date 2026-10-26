// Modo navegador — paso 3: texto de UNA sentencia para incorporar su rol.
//
// Se ejecuta en la pestaña de la persona con la sentencia abierta (Portal
// Unificado de Sentencias, juris.pjud.cl, u Oficina Judicial Virtual).
// Devuelve la dirección de la pestaña en la primera línea y, debajo, el texto
// visible de la página tal cual: es lo que reporte.mjs --incorporar-sentencia
// (o la carpeta de --entrada, como sentencia-<nota>.txt) verifica contra las
// citas de la nota antes de tomar el rol y la fecha.
//
// Si el texto devuelto no contiene la sentencia (por ejemplo, porque el portal
// la muestra dentro de un visor de PDF), descarga el PDF a la carpeta de
// entrada: el agente lo lee con pdftotext.
(() => {
  const texto = document.body ? document.body.innerText : "";
  if (/What code is in the image|testing whether you are a human|ha sido rechazada/i.test(texto)) return "VERIFICACION";
  return `URL: ${location.href}\n${texto}`;
})()
