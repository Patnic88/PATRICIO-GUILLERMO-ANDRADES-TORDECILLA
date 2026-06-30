// Base de jurisprudencia de la Corte Suprema (semilla).
//
// ⚠️ VERIFICA ANTES DE CITAR. Estas entradas se basan en fallos REALES de la
// Corte Suprema reseñados por las fuentes enlazadas (campo `link`), pero los
// números de Rol y fechas NO pudieron extraerse automáticamente (los sitios
// bloquean la lectura). Por eso el Rol aparece como "(ver fuente)": abre el
// enlace, confirma el Rol/fecha en el fallo oficial y complétalo. La doctrina
// resumida sí refleja el criterio reportado por la fuente.
//
// Fuente oficial para verificar: buscador de jurisprudencia del Poder Judicial
// (https://juris.pjud.cl) y la Oficina Judicial Virtual.
//
// Salas de la Corte Suprema (referencia):
//   1ª — Civil
//   2ª — Penal
//   3ª — Constitucional y Contencioso Administrativo (protección, ambiental,
//        municipal, tributario, falta de servicio, etc.)
//   4ª — Laboral y Previsional
//
// Forma de cada fallo:
// {
//   id, rol, anio, sala, recurso, tema, resultado ("acoge"|"rechaza"|"acoge_parcial"),
//   resumen, palabras: [...], texto, link
// }
window.SEED_FALLOS = [
  {
    id: "cs-cl-5anios",
    rol: "(ver fuente)",
    anio: 2025,
    sala: "Tercera",
    recurso: "Protección",
    tema: "Funcionarios municipales",
    resultado: "rechaza",
    resumen: "La confianza legítima en la contrata opera recién al completar CINCO años continuos en esa calidad; antes del quinquenio la no renovación no es ilegal ni arbitraria. El tiempo servido a honorarios no se computa para ese plazo.",
    palabras: ["contrata", "confianza legítima", "cinco años", "no renovación", "honorarios"],
    texto: "",
    link: "https://anef.cl/corte-suprema-fija-en-5-anos-criterio-para-que-opere-la-confianza-legitima-de-funcionarios-publicos-a-contrata/"
  },
  {
    id: "cs-cl-largaduracion",
    rol: "(ver fuente)",
    anio: 2025,
    sala: "Tercera",
    recurso: "Protección",
    tema: "Funcionarios municipales",
    resultado: "acoge",
    resumen: "Tratándose de contratas municipales de larga duración (renovaciones sucesivas más allá del quinquenio), opera la confianza legítima: la Administración solo puede poner término al vínculo mediante calificación o sumario, no por simple no renovación carente de motivación.",
    palabras: ["contrata", "confianza legítima", "larga duración", "renovaciones sucesivas", "motivación", "municipal"],
    texto: "",
    link: "https://www.diarioconstitucional.cl/2025/12/29/corte-suprema-refuerza-principio-de-confianza-legitima-en-la-no-renovacion-de-contratas-municipales-de-larga-duracion/"
  },
  {
    id: "cs-cl-terminocontrata",
    rol: "(ver fuente)",
    anio: 2025,
    sala: "Tercera",
    recurso: "Protección",
    tema: "Funcionarios municipales",
    resultado: "rechaza",
    resumen: "Se confirma el término de la contrata y se descarta la confianza legítima cuando no se acreditan los cinco años continuos o se trata de un cargo de confianza, cuya naturaleza admite la no renovación según la evaluación de la autoridad.",
    palabras: ["contrata", "término", "confianza legítima", "cargo de confianza", "discrecionalidad"],
    texto: "",
    link: "https://www.diarioconstitucional.cl/2025/10/11/corte-suprema-confirma-termino-de-contrata-y-descarta-aplicacion-del-principio-de-confianza-legitima-en-el-empleo-publico/"
  },
  {
    id: "cs-cl-investigacionpenal",
    rol: "(ver fuente)",
    anio: 2026,
    sala: "Tercera",
    recurso: "Protección",
    tema: "Funcionarios municipales",
    resultado: "rechaza",
    resumen: "Aunque haya más de cinco años de renovaciones, la confianza legítima no ampara cuando existen antecedentes relevantes —como una investigación penal en curso— que hacen no razonable la expectativa de renovación; cede frente a la afectación de la confianza institucional.",
    palabras: ["contrata", "confianza legítima", "investigación penal", "antecedentes", "expectativa"],
    texto: "",
    link: "https://www.diarioconstitucional.cl/2026/05/31/investigacion-penal-impide-invocar-confianza-legitima-para-renovar-contratas-resuelve-corte-suprema/"
  },
  {
    id: "cs-fs-viapublica",
    rol: "(ver fuente)",
    anio: 2025,
    sala: "Tercera",
    recurso: "Casación en el fondo",
    tema: "Responsabilidad municipal",
    resultado: "acoge",
    resumen: "La Corte rechazó la casación de la Municipalidad y confirmó la indemnización por falta de servicio: la municipalidad responde por daños derivados del mal estado o mantención de la vía pública cuando se acredita el estándar de servicio incumplido y el nexo causal con el daño. (Caso reseñado: caída de transeúnte por restos vegetales en la vía — Municipalidad de Los Vilos.)",
    palabras: ["falta de servicio", "vía pública", "indemnización", "daño moral", "nexo causal", "Los Vilos"],
    texto: "",
    link: "https://aldiachile.microjuris.com/2025/04/05/corte-suprema-rechazo-recurso-de-casacion-de-municipalidad-y-confirmo-indemnizacion-por-accidente-causado-por-falta-de-servicio/"
  },
  {
    id: "cs-fs-saludmunicipal",
    rol: "(ver fuente)",
    anio: 2025,
    sala: "Tercera",
    recurso: "Casación en el fondo",
    tema: "Responsabilidad municipal",
    resultado: "acoge",
    resumen: "Se confirma la condena a la municipalidad por falta de servicio en la atención de salud municipal (DESAM): existe responsabilidad cuando el servicio prestado se aparta del estándar exigible y de ello deriva el daño al paciente.",
    palabras: ["falta de servicio", "salud municipal", "DESAM", "indemnización", "estándar"],
    texto: "",
    link: "https://actualidadjuridica.doe.cl/corte-suprema-confirma-condena-a-municipalidad-de-hualpen-por-falta-de-servicio-en-atencion-medica/"
  }
];
