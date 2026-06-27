// Estados diarios "de muestra" para mostrar la página sin haber configurado
// todavía el Web App de Gmail. Cuando window.COURT_SYNC_URL apunte al Apps
// Script real (estado-diario.gs), estas entradas se reemplazan con las
// notificaciones reales de pjud.cl vinculadas a Patricio Andrades y/o a la
// I. Municipalidad de Los Vilos.
window.SEED_ESTADO_DIARIO = [
  {
    id: "ed-sample-1",
    rol: "C-114-2026",
    caratulado: "Núñez con I. Municipalidad de Los Vilos",
    tribunal: "Juzgado de Letras y Garantía de Los Vilos",
    tipoTribunal: "los-vilos",
    fecha: "2026-06-26",
    fechaIso: "2026-06-26T13:14:00.000Z",
    tipoResolucion: "Provee escrito",
    resumen: "Por interpuesta la contestación de demanda. Téngase por evacuado el trámite. Notifíquese por estado diario.",
    remitente: "notifica_jl_losvilos@pjud.cl",
    threadId: "19e7403697130529",
    revisada: false
  },
  {
    id: "ed-sample-2",
    rol: "O-3-2026",
    caratulado: "Inspección del Trabajo con I. Municipalidad de Los Vilos",
    tribunal: "Juzgado de Letras y Garantía de Los Vilos",
    tipoTribunal: "los-vilos",
    fecha: "2026-06-25",
    fechaIso: "2026-06-25T11:30:00.000Z",
    tipoResolucion: "Citación a audiencia",
    resumen: "Cítese a las partes a audiencia preparatoria para el día 14 de julio de 2026 a las 09:00 horas.",
    remitente: "notifica_jl_losvilos@pjud.cl",
    threadId: "19e6fc56f43631d9",
    revisada: false
  },
  {
    id: "ed-sample-3",
    rol: "Protección-1185-2026",
    caratulado: "Pérez con I. Municipalidad de Los Vilos",
    tribunal: "Corte de Apelaciones de La Serena",
    tipoTribunal: "corte-la-serena",
    fecha: "2026-06-24",
    fechaIso: "2026-06-24T15:02:00.000Z",
    tipoResolucion: "Recurso",
    resumen: "Se declara admisible el recurso de protección. Solicítese informe a la recurrida en el plazo legal.",
    remitente: "notifica_corte_laserena@pjud.cl",
    threadId: "",
    revisada: false
  }
];
