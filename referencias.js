// ============================================================================
//  Datos de referencia — Consultor Laboral y Tributario · Chile
// ----------------------------------------------------------------------------
//  Este archivo concentra TODOS los valores que cambian con el tiempo
//  (indicadores, topes, tablas de impuesto) y el banco de consultas frecuentes.
//
//  ⚠️  IMPORTANTE: los montos son REFERENCIALES. Antes de usarlos en un caso
//  real, verifica el valor vigente en la fuente oficial:
//    · UF / UTM / IPC ........ https://www.sii.cl  · https://www.bcentral.cl
//    · Ingreso mínimo ........ https://www.dt.gob.cl
//    · Tope imponible ........ https://www.spensiones.cl
//    · Tabla impuesto único .. https://www.sii.cl (Impuesto Único 2ª Categoría)
//
//  Para actualizar: edita los números de VALORES y, si cambió la tabla,
//  los tramos de TABLA_IUSC. Todo lo demás se recalcula solo.
// ============================================================================

// Fecha de la "fotografía" de estos valores. Actualízala al editar.
window.REF_VIGENCIA = "Junio 2026 (valores referenciales — verificar en fuente oficial)";

// ---- Indicadores y topes -------------------------------------------------
window.VALORES = {
  // Indicadores diarios (referenciales). Actualízalos con el valor del día.
  uf: 39000,            // Unidad de Fomento ($)
  utm: 68000,           // Unidad Tributaria Mensual ($)
  uta: 68000 * 12,      // Unidad Tributaria Anual = UTM * 12

  // Remuneraciones
  ingresoMinimo: 529000,        // Ingreso Mínimo Mensual, trabajador dependiente ($)
  ingresoMinimoNoRemun: 350000, // IMM para fines no remuneracionales ($)

  // Topes imponibles (en UF) — Previsión y AFC
  topeImponibleUF: 87.8,        // Tope imponible AFP/salud (UF)
  topeImponibleAFCUF: 131.9,    // Tope imponible seguro de cesantía (UF)

  // Cotizaciones del trabajador (dependiente)
  tasaAFPObligatoria: 0.10,     // 10% cotización obligatoria de pensiones
  tasaComisionAFP: 0.0114,      // Comisión AFP (promedio referencial; varía por AFP)
  tasaSalud: 0.07,              // 7% salud (Fonasa o mínimo legal Isapre)
  tasaSIS: 0.0153,             // Seguro de Invalidez y Sobrevivencia (lo paga el empleador)

  // Seguro de cesantía (AFC) — contrato indefinido
  afcTrabajadorIndefinido: 0.006,  // 0,6% trabajador
  afcEmpleadorIndefinido: 0.024,   // 2,4% empleador
  // Contrato a plazo fijo / obra: 3% empleador, 0% trabajador
  afcEmpleadorPlazoFijo: 0.03,

  // Indemnizaciones
  topeIndemnizacionUF: 90,      // Tope remuneración para indemnización (UF)
  topeAniosIndemnizacion: 11,   // Tope de años de servicio (contratos desde 14-08-1981)

  // Gratificación legal (art. 50 Código del Trabajo)
  gratificacionTopeIMM: 4.75,   // Tope anual = 4,75 ingresos mínimos mensuales
};

// ---- Tabla Impuesto Único de Segunda Categoría (mensual, en UTM) ---------
//  Factor y rebaja según tramo. Impuesto = base*factor - rebaja*UTM.
//  Tramos expresados en UTM; "rebaja" también en UTM.
window.TABLA_IUSC = [
  { desdeUTM: 0,    hastaUTM: 13.5,  factor: 0,     rebajaUTM: 0      },
  { desdeUTM: 13.5, hastaUTM: 30,    factor: 0.04,  rebajaUTM: 0.54   },
  { desdeUTM: 30,   hastaUTM: 50,    factor: 0.08,  rebajaUTM: 1.74   },
  { desdeUTM: 50,   hastaUTM: 70,    factor: 0.135, rebajaUTM: 4.49   },
  { desdeUTM: 70,   hastaUTM: 90,    factor: 0.23,  rebajaUTM: 11.14  },
  { desdeUTM: 90,   hastaUTM: 120,   factor: 0.304, rebajaUTM: 17.80  },
  { desdeUTM: 120,  hastaUTM: 310,   factor: 0.35,  rebajaUTM: 23.32  },
  { desdeUTM: 310,  hastaUTM: Infinity, factor: 0.40, rebajaUTM: 38.82 },
];

// ---- Banco de consultas laborales y tributarias frecuentes ---------------
//  Cada consulta enlaza, cuando aplica, al artículo del Código del Trabajo
//  (CT) o norma tributaria pertinente. Editable y ampliable.
window.CONSULTAS_SEED = [
  {
    id: "c-jornada",
    area: "Laboral",
    tema: "Jornada de trabajo",
    pregunta: "¿Cuál es la jornada ordinaria máxima de trabajo?",
    respuesta:
      "La jornada ordinaria no puede exceder de 44 horas semanales (Ley 21.561, reducción gradual desde las 45 hrs: 44 desde 2024, 42 desde 2026 y 40 desde 2028). Se distribuye en no menos de 5 ni más de 6 días. El máximo diario es de 10 horas ordinarias.",
    fundamento: "Arts. 22 y 28 Código del Trabajo · Ley 21.561",
    etiquetas: ["jornada", "horas"],
  },
  {
    id: "c-horas-extra",
    area: "Laboral",
    tema: "Horas extraordinarias",
    pregunta: "¿Cómo se pagan las horas extraordinarias?",
    respuesta:
      "Las horas extraordinarias se pagan con un recargo mínimo del 50% sobre el sueldo convenido para la jornada ordinaria. Solo proceden hasta un máximo de 2 horas por día y deben pactarse por escrito (vigencia máxima del pacto: 3 meses, renovable). Se calculan sobre el sueldo base, no sobre el total de haberes.",
    fundamento: "Arts. 30, 31 y 32 Código del Trabajo",
    etiquetas: ["horas extra", "recargo"],
  },
  {
    id: "c-feriado",
    area: "Laboral",
    tema: "Feriado anual",
    pregunta: "¿A cuántos días de feriado tiene derecho el trabajador?",
    respuesta:
      "15 días hábiles de feriado anual con remuneración íntegra, tras un año de servicio. El sábado se considera inhábil para este cálculo. Trabajadores con más de 10 años (continuos o no, hasta para distintos empleadores) suman 1 día por cada 3 nuevos años trabajados sobre los 10. El feriado puede acumularse hasta por 2 períodos consecutivos.",
    fundamento: "Arts. 67, 68 y 70 Código del Trabajo",
    etiquetas: ["vacaciones", "feriado"],
  },
  {
    id: "c-finiquito",
    area: "Laboral",
    tema: "Finiquito",
    pregunta: "¿Qué debe contener y cómo se ratifica un finiquito?",
    respuesta:
      "El finiquito debe constar por escrito y ser firmado por el trabajador y el empleador, ratificándose ante un ministro de fe (notario, inspector del trabajo, presidente del sindicato o secretario municipal). Debe detallar las causales de término y los pagos (remuneraciones pendientes, feriado proporcional, indemnizaciones cuando correspondan). Si no se ratifica, no puede invocarse por el empleador. El empleador debe acreditar el pago de cotizaciones (Ley Bustos) para que el despido produzca efecto.",
    fundamento: "Arts. 9, 162 y 177 Código del Trabajo",
    etiquetas: ["finiquito", "término"],
  },
  {
    id: "c-indemnizacion",
    area: "Laboral",
    tema: "Indemnización por años de servicio",
    pregunta: "¿Cuándo y cómo se paga la indemnización por años de servicio?",
    respuesta:
      "Procede cuando el empleador pone término al contrato por necesidades de la empresa (art. 161) o cuando un despido es declarado injustificado. Equivale a 30 días de la última remuneración mensual por cada año de servicio y fracción superior a 6 meses, con tope de 11 años (contratos posteriores al 14-08-1981) y una remuneración tope de 90 UF. Se suma la indemnización sustitutiva del aviso previo (1 mes) si no se dio aviso con 30 días de anticipación.",
    fundamento: "Arts. 161, 162 y 163 Código del Trabajo",
    etiquetas: ["indemnización", "despido"],
  },
  {
    id: "c-causales",
    area: "Laboral",
    tema: "Término de contrato",
    pregunta: "¿Cuáles son las principales causales de término del contrato?",
    respuesta:
      "Art. 159: mutuo acuerdo, renuncia (aviso 30 días), muerte del trabajador, vencimiento del plazo, conclusión del trabajo, caso fortuito. Art. 160 (sin derecho a indemnización, por conducta del trabajador): falta de probidad, conductas de acoso, vías de hecho, injurias, incumplimiento grave de obligaciones, etc. Art. 161: necesidades de la empresa y desahucio (cargos de exclusiva confianza). Solo las del art. 161 y los despidos injustificados generan indemnización por años de servicio.",
    fundamento: "Arts. 159, 160 y 161 Código del Trabajo",
    etiquetas: ["despido", "causales"],
  },
  {
    id: "c-gratificacion",
    area: "Laboral",
    tema: "Gratificación legal",
    pregunta: "¿Cómo se calcula la gratificación legal?",
    respuesta:
      "Las empresas con fines de lucro que obtienen utilidades deben gratificar. La modalidad más usada (art. 50) es pagar el 25% de lo devengado por remuneraciones mensuales, con tope de 4,75 ingresos mínimos mensuales al año (≈ tope mensual de 4,75 IMM ÷ 12). La alternativa (art. 47) reparte el 30% de las utilidades líquidas a prorrata. El empleador puede elegir la fórmula que le resulte menos onerosa.",
    fundamento: "Arts. 47 y 50 Código del Trabajo",
    etiquetas: ["gratificación", "remuneración"],
  },
  {
    id: "c-fuero-maternal",
    area: "Laboral",
    tema: "Protección a la maternidad",
    pregunta: "¿Cuánto dura el fuero maternal y el postnatal?",
    respuesta:
      "Descanso de maternidad: 6 semanas antes del parto (prenatal) y 12 semanas después (postnatal), más el permiso postnatal parental de 12 semanas adicionales (o 18 a media jornada). El fuero maternal protege a la trabajadora desde el embarazo y hasta 1 año después de terminado el postnatal: no puede ser despedida sin autorización judicial previa (desafuero).",
    fundamento: "Arts. 195, 197 bis y 201 Código del Trabajo",
    etiquetas: ["fuero", "maternidad", "postnatal"],
  },
  {
    id: "c-cotizaciones",
    area: "Previsional",
    tema: "Cotizaciones obligatorias",
    pregunta: "¿Qué descuentos previsionales se aplican a la remuneración?",
    respuesta:
      "Del trabajador dependiente se descuenta: 10% para la AFP (cuenta de capitalización) + la comisión de la AFP, 7% de salud (Fonasa o Isapre) y 0,6% del seguro de cesantía (contrato indefinido). El empleador aporta 2,4% al seguro de cesantía y el Seguro de Invalidez y Sobrevivencia (SIS). Todo se calcula sobre la remuneración imponible, con tope de 87,8 UF (AFP/salud) y 131,9 UF (cesantía).",
    fundamento: "DL 3.500 · Ley 19.728 · Ley 21.735 (reforma previsional)",
    etiquetas: ["AFP", "salud", "cotizaciones"],
  },
  {
    id: "c-iva",
    area: "Tributaria",
    tema: "IVA",
    pregunta: "¿Cuál es la tasa de IVA y quiénes lo declaran?",
    respuesta:
      "El Impuesto al Valor Agregado tiene una tasa del 19% sobre las ventas y servicios afectos. Lo soportan los consumidores, pero lo declaran y enteran mensualmente (Formulario 29) los vendedores y prestadores de servicios. El contribuyente determina el IVA a pagar restando del débito fiscal (IVA de sus ventas) el crédito fiscal (IVA de sus compras).",
    fundamento: "DL 825, Ley sobre Impuesto a las Ventas y Servicios",
    etiquetas: ["IVA", "F29"],
  },
  {
    id: "c-iusc",
    area: "Tributaria",
    tema: "Impuesto Único de 2ª Categoría",
    pregunta: "¿Cómo tributan los sueldos de los trabajadores dependientes?",
    respuesta:
      "Los trabajadores dependientes pagan el Impuesto Único de Segunda Categoría, retenido mensualmente por el empleador sobre la remuneración imponible menos las cotizaciones previsionales. Es progresivo por tramos expresados en UTM: el primer tramo (hasta 13,5 UTM) está exento y la tasa marginal máxima es 40%. Se calcula con la tabla del SII (factor menos rebaja).",
    fundamento: "Art. 42 N°1 y 43 Ley sobre Impuesto a la Renta (DL 824)",
    etiquetas: ["impuesto", "sueldo", "renta"],
  },
  {
    id: "c-global",
    area: "Tributaria",
    tema: "Impuesto Global Complementario",
    pregunta: "¿Qué es el Impuesto Global Complementario?",
    respuesta:
      "Es un impuesto anual y progresivo que afecta a las personas naturales con domicilio o residencia en Chile, sobre el conjunto de sus rentas (sueldos, honorarios, retiros, dividendos, arriendos, etc.). Usa los mismos tramos que el Impuesto Único de 2ª Categoría pero en base anual (UTA). Se declara en abril (Formulario 22) e imputa como crédito el Impuesto Único ya retenido y los PPM.",
    fundamento: "Arts. 52 y siguientes Ley sobre Impuesto a la Renta",
    etiquetas: ["renta", "F22", "global complementario"],
  },
  {
    id: "c-honorarios",
    area: "Tributaria",
    tema: "Boletas de honorarios",
    pregunta: "¿Qué retención aplica a las boletas de honorarios?",
    respuesta:
      "Las rentas de Segunda Categoría por servicios personales (boletas de honorarios) están sujetas a una retención/PPM que aumenta gradualmente (Ley 21.133): la tasa subió año a año hasta llegar al 17% en 2028. Esta retención es un pago provisional que financia las cotizaciones previsionales obligatorias del trabajador independiente y se reliquida en la declaración anual de renta.",
    fundamento: "Art. 84 LIR · Ley 21.133 (cotización independientes)",
    etiquetas: ["honorarios", "retención", "independiente"],
  },
];
