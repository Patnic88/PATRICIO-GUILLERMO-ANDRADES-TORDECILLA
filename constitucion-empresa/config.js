// Configuración del sitio. Completa lo marcado [FALTA] antes de publicar.
// Mientras un dato falte, el sitio lo muestra tal cual como marcador
// visible y avisa en una franja superior qué queda pendiente.

window.CONFIG = {
  marca: "[FALTA: nombre de la marca]",
  // Quién presta el servicio (aparece en el pie de página).
  prestador: "[FALTA: razón social y RUT del prestador]",
  // WhatsApp en formato internacional, solo dígitos. Ej.: "56912345678".
  whatsapp: "",
  correo: "",
  horario: "[FALTA: horario de atención]",

  // Precio de la asesoría y gestión por tipo de empresa, en pesos y sin
  // puntos (ej.: 45000). null = todavía no definido.
  precios: { SPA: null, EIRL: null, LTDA: null },

  // Qué incluye el servicio base. Edita libremente.
  incluye: [
    "Revisión del nombre, el objeto y los datos de los socios",
    "Redacción del estatuto y llenado del formulario en el Registro de Empresas y Sociedades",
    "Coordinación de la firma de cada socio",
    "Envío de los documentos de constitución y del RUT de la empresa",
  ],

  // Servicios adicionales que el cliente puede marcar en el paso 5.
  extras: [
    {
      id: "inicio",
      nombre: "Inicio de actividades en el SII",
      detalle: "Es un trámite aparte: constituir la empresa no da inicio de actividades.",
      precio: null,
    },
    {
      id: "factura",
      nombre: "Habilitación de facturación electrónica",
      detalle: "Para emitir facturas desde el primer día.",
      precio: null,
    },
    {
      id: "fea",
      nombre: "Apoyo para obtener la Firma Electrónica Avanzada",
      detalle: "Te guiamos en la compra. El valor de la firma lo paga cada socio a quien la emite.",
      precio: null,
    },
  ],

  // Plazo que tienen todos los socios para firmar desde la primera firma.
  plazoFirma: "[VERIFICAR: 60 días desde la primera firma]",
};
