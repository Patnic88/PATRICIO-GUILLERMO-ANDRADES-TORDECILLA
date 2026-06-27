// Configuración de la sincronización automática con Gmail.
//
// Pega aquí la URL de tu Web App de Google Apps Script (la que termina en
// /exec). Mientras esté vacía, la lista usa las tareas locales de
// tasks.seed.js. Cuando la completes, la lista se actualizará sola desde
// tus correos etiquetados con "📋 Tarea".
//
// Cómo obtener la URL: ver instrucciones en gmail-sync.gs y README.md.
window.SYNC_URL = "";

// Agente del Estado Diario del Tribunal.
//
// Pega aquí la URL de tu Web App de `estado-diario.gs` (también termina en
// /exec). Mientras esté vacía, la página estado-diario.html muestra los
// datos de muestra de `estado-diario.seed.js`. Cuando la completes, el
// agente revisará tu Gmail y traerá los movimientos del Juzgado de Letras y
// Garantía de Los Vilos y de la Corte de Apelaciones de La Serena
// vinculados a Patricio Andrades y/o a la I. Municipalidad de Los Vilos.
//
// Instalación e instrucciones: ver `estado-diario.gs` y README.md.
window.COURT_SYNC_URL = "";
