// Configuración de la sincronización automática con Gmail.
//
// Pega aquí la URL de tu Web App de Google Apps Script (la que termina en
// /exec). Mientras esté vacía, la lista usa las tareas locales de
// tasks.seed.js. Cuando la completes, la lista se actualizará sola desde
// tus correos etiquetados con "📋 Tarea".
//
// Cómo obtener la URL: ver instrucciones en gmail-sync.gs y README.md.
window.SYNC_URL = "";

// (Opcional) Análisis ampliado con IA en el módulo "Predicción de Juicios".
// Pega aquí la URL de un proxy (Apps Script, función serverless, etc.) que
// reciba el caso + los fallos por POST y reenvíe la consulta al modelo (ej.
// la API de Claude). Usar un proxy evita exponer tu clave de API en el
// navegador. Mientras esté vacío, la predicción funciona igual, solo sin el
// análisis en lenguaje natural.
//
// El proxy debe responder JSON: { "analisis": "texto del análisis…" }
window.IA_URL = "";
