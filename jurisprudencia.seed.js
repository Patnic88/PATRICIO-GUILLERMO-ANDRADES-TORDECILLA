// Base de jurisprudencia de la Corte Suprema (semilla).
//
// ⚠️ IMPORTANTE: las entradas de abajo son EJEMPLOS ILUSTRATIVOS para que
// veas el formato y puedas probar el módulo. NO son citas verificadas: los
// roles llevan "(ejemplo)" a propósito. Reemplázalas por sentencias reales
// que tú revises (puedes pegarlas desde el módulo "Predicción de Juicios" o
// editar este archivo directamente).
//
// Salas de la Corte Suprema (referencia):
//   1ª — Civil
//   2ª — Penal
//   3ª — Constitucional y Contencioso Administrativo (protección, ambiental,
//        municipal, tributario, etc.)
//   4ª — Laboral y Previsional
//
// Forma de cada fallo:
// {
//   id: "cs-...",            // identificador único
//   rol: "12345-2024",       // Rol de la causa en la Corte Suprema
//   anio: 2024,              // año del fallo
//   sala: "Tercera",          // Primera | Segunda | Tercera | Cuarta | Pleno
//   recurso: "Protección",   // tipo de recurso/acción (ver lista en el módulo)
//   tema: "Funcionarios municipales",
//   resultado: "rechaza",    // acoge | rechaza | acoge_parcial
//   resumen: "Doctrina o criterio central del fallo.",
//   palabras: ["...", "..."],// palabras clave que ayudan a la búsqueda
//   texto: "",               // (opcional) considerandos / texto pegado
//   link: ""                 // (opcional) enlace al fallo
// }
window.SEED_FALLOS = [
  {
    id: "cs-ej-1",
    rol: "XXXX-2024 (ejemplo)",
    anio: 2024,
    sala: "Tercera",
    recurso: "Protección",
    tema: "Funcionarios municipales",
    resultado: "rechaza",
    resumen: "La remoción/término de servicios de un funcionario a contrata, dentro del periodo de su designación, no vulnera garantías cuando se ajusta a la facultad legal y existe acto administrativo fundado. La acción de protección no es la vía para discutir la legalidad de fondo del acto.",
    palabras: ["contrata", "funcionario", "remoción", "acto administrativo", "confianza legítima"],
    texto: "",
    link: ""
  },
  {
    id: "cs-ej-2",
    rol: "XXXX-2023 (ejemplo)",
    anio: 2023,
    sala: "Tercera",
    recurso: "Protección",
    tema: "Funcionarios municipales",
    resultado: "acoge",
    resumen: "Se acoge la protección cuando la no renovación de la contrata vulnera la confianza legítima generada por renovaciones sucesivas y el acto carece de motivación suficiente. Procede ordenar la reincorporación o el pago correspondiente.",
    palabras: ["contrata", "confianza legítima", "renovaciones sucesivas", "motivación", "no renovación"],
    texto: "",
    link: ""
  },
  {
    id: "cs-ej-3",
    rol: "XXXX-2024 (ejemplo)",
    anio: 2024,
    sala: "Tercera",
    recurso: "Reclamación ambiental",
    tema: "Medio ambiente",
    resultado: "rechaza",
    resumen: "Se rechaza la reclamación contra la RCA cuando la autoridad ambiental ponderó adecuadamente los antecedentes técnicos y el reclamante no acredita un vicio que afecte la legalidad o motivación de la decisión.",
    palabras: ["RCA", "evaluación ambiental", "SEIA", "discrecionalidad técnica", "motivación"],
    texto: "",
    link: ""
  },
  {
    id: "cs-ej-4",
    rol: "XXXX-2022 (ejemplo)",
    anio: 2022,
    sala: "Tercera",
    recurso: "Nulidad de derecho público",
    tema: "Contratación municipal",
    resultado: "acoge_parcial",
    resumen: "Se declara la nulidad del acto que adjudicó sin respetar las bases de licitación, pero se limitan los efectos restitutorios atendido el principio de protección de la confianza y los servicios ya prestados.",
    palabras: ["licitación", "bases", "adjudicación", "nulidad", "contrato administrativo"],
    texto: "",
    link: ""
  },
  {
    id: "cs-ej-5",
    rol: "XXXX-2023 (ejemplo)",
    anio: 2023,
    sala: "Cuarta",
    recurso: "Unificación de jurisprudencia",
    tema: "Tutela laboral funcionarios",
    resultado: "acoge",
    resumen: "La tutela de derechos fundamentales del Código del Trabajo es aplicable a funcionarios públicos (incluidos municipales) respecto de actos que afecten garantías durante la relación estatutaria.",
    palabras: ["tutela laboral", "funcionario público", "derechos fundamentales", "estatuto administrativo"],
    texto: "",
    link: ""
  },
  {
    id: "cs-ej-6",
    rol: "XXXX-2024 (ejemplo)",
    anio: 2024,
    sala: "Primera",
    recurso: "Casación en el fondo",
    tema: "Responsabilidad municipal",
    resultado: "rechaza",
    resumen: "La falta de servicio municipal por mantención de vías exige acreditar el estándar de servicio exigible y el nexo causal; no basta la sola ocurrencia del daño. Se rechaza la casación por falta de infracción de ley con influencia en lo dispositivo.",
    palabras: ["falta de servicio", "responsabilidad", "vías públicas", "nexo causal", "indemnización"],
    texto: "",
    link: ""
  }
];
