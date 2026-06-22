// Configuración de la sincronización automática con Gmail.
//
// Pega aquí la URL de tu Web App de Google Apps Script (la que termina en
// /exec). Mientras esté vacía, la lista usa las tareas locales de
// tasks.seed.js. Cuando la completes, la lista se actualizará sola desde
// tus correos etiquetados con "📋 Tarea".
//
// Cómo obtener la URL: ver instrucciones en gmail-sync.gs y README.md.
window.SYNC_URL = "";

// --- WhatsApp ---------------------------------------------------------------
// Número de WhatsApp por defecto al que se enviarán las tareas (formato
// internacional, solo dígitos, con código de país y SIN el "+" ni espacios).
// Ej. Chile: "56912345678".
//
// Si lo dejas vacío, al compartir WhatsApp te dejará elegir el contacto.
window.WHATSAPP_NUMERO = "";
