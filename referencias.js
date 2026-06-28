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

  // ---- Ámbito municipal (funcionarios y Transparencia) -------------------
  {
    id: "c-mun-vinculos",
    area: "Municipal",
    tema: "Tipos de vínculo",
    pregunta: "¿Qué diferencia hay entre planta, contrata y honorarios en un municipio?",
    respuesta:
      "Los funcionarios de PLANTA tienen un empleo de carácter permanente y carrera funcionaria (Estatuto Administrativo para Funcionarios Municipales, Ley 18.883). Los a CONTRATA son transitorios, duran como máximo hasta el 31 de diciembre de cada año (salvo prórroga) y no pueden exceder, en conjunto, el 40% de los cargos de la planta. Los a HONORARIOS se rigen por su contrato (no son funcionarios), para labores accidentales y no habituales o cometidos específicos; la jurisprudencia ha advertido contra su uso para funciones permanentes.",
    fundamento: "Arts. 1, 2 y 4 Ley 18.883 (Estatuto Administrativo Municipal)",
    etiquetas: ["planta", "contrata", "honorarios", "municipal"],
  },
  {
    id: "c-mun-feriado",
    area: "Municipal",
    tema: "Feriado del funcionario",
    pregunta: "¿Cuántos días de feriado tiene un funcionario municipal?",
    respuesta:
      "El feriado del funcionario municipal es: 15 días hábiles con menos de 15 años de servicio; 20 días hábiles entre 15 y menos de 20 años; y 25 días hábiles con 20 o más años de servicio. Para este cómputo el sábado se considera inhábil. Es distinto del feriado del Código del Trabajo: los funcionarios se rigen por la Ley 18.883, no por el CT.",
    fundamento: "Arts. 96 y siguientes Ley 18.883",
    etiquetas: ["feriado", "vacaciones", "funcionario"],
  },
  {
    id: "c-mun-permiso",
    area: "Municipal",
    tema: "Permisos administrativos",
    pregunta: "¿A cuántos días de permiso administrativo tiene derecho el funcionario?",
    respuesta:
      "El funcionario puede solicitar permisos para ausentarse por motivos particulares hasta por 6 días hábiles al año, con goce de remuneraciones. Estos permisos son fraccionables por días o medios días y su concesión queda sujeta a las necesidades del servicio (jefatura). Son independientes del feriado legal y de las licencias médicas.",
    fundamento: "Arts. 108 y siguientes Ley 18.883",
    etiquetas: ["permiso", "administrativo", "funcionario"],
  },
  {
    id: "c-mun-sumario",
    area: "Municipal",
    tema: "Responsabilidad administrativa",
    pregunta: "¿Cuándo procede una investigación sumaria y cuándo un sumario administrativo?",
    respuesta:
      "Ante hechos que puedan comprometer la responsabilidad administrativa de un funcionario, la autoridad ordena investigar. La INVESTIGACIÓN SUMARIA es un procedimiento breve (plazo aprox. 5 días, prorrogable) para faltas de menor entidad; sus sanciones máximas son acotadas. El SUMARIO ADMINISTRATIVO es un procedimiento formal y escrito, con fiscal, para hechos graves, y permite aplicar hasta la destitución. Ambos deben respetar el debido proceso (formulación de cargos, descargos, prueba) y la sanción es reclamable ante la Contraloría.",
    fundamento: "Arts. 118 y siguientes Ley 18.883 · Ley 10.336 (Contraloría)",
    etiquetas: ["sumario", "investigación", "responsabilidad"],
  },
  {
    id: "c-mun-sanciones",
    area: "Municipal",
    tema: "Medidas disciplinarias",
    pregunta: "¿Cuáles son las medidas disciplinarias aplicables a un funcionario municipal?",
    respuesta:
      "Las medidas disciplinarias son, de menor a mayor gravedad: censura, multa, suspensión del empleo (de 30 días a 3 meses, con goce parcial) y destitución. Deben ser proporcionales a la gravedad de los hechos y aplicarse mediante el procedimiento respectivo (investigación sumaria o sumario). La destitución exige sumario administrativo y procede solo en las causales que la ley señala.",
    fundamento: "Arts. 120 y siguientes Ley 18.883",
    etiquetas: ["sanciones", "destitución", "disciplina"],
  },
  {
    id: "c-mun-probidad",
    area: "Municipal",
    tema: "Probidad",
    pregunta: "¿Qué obligaciones de probidad y declaración pesan sobre las autoridades municipales?",
    respuesta:
      "El principio de probidad obliga a observar una conducta funcionaria intachable y un desempeño honesto y leal, con preeminencia del interés general. Las autoridades y funcionarios señalados por la ley deben presentar Declaración de Intereses y Patrimonio (Ley 20.880), actualizable y pública. Se prohíbe intervenir en asuntos en que exista conflicto de interés y se regulan las inhabilidades e incompatibilidades.",
    fundamento: "Ley 20.880 (probidad) · Art. 8 Constitución · Ley 18.575",
    etiquetas: ["probidad", "conflicto de interés", "declaración"],
  },
  {
    id: "c-transp-pasiva",
    area: "Municipal",
    tema: "Transparencia",
    pregunta: "¿Qué plazo tiene el municipio para responder una solicitud de acceso a la información?",
    respuesta:
      "El órgano debe pronunciarse sobre la solicitud de acceso a información pública en un plazo de 20 días hábiles desde su recepción, prorrogable excepcionalmente por otros 10 días hábiles cuando concurran circunstancias que dificulten reunir la información (debe comunicarse al solicitante). La denegación solo procede por las causales de reserva o secreto del art. 21. La decisión es reclamable ante el Consejo para la Transparencia.",
    fundamento: "Arts. 14, 16 y 21 Ley 20.285 (Transparencia)",
    etiquetas: ["transparencia", "acceso", "plazo"],
  },
  {
    id: "c-transp-activa",
    area: "Municipal",
    tema: "Transparencia activa",
    pregunta: "¿Qué es la transparencia activa que debe mantener el municipio?",
    respuesta:
      "La transparencia activa es la obligación de mantener a disposición permanente del público, en el sitio web institucional, información actualizada al menos una vez al mes: estructura orgánica, facultades, planta y personal (con remuneraciones), contrataciones, transferencias, actos con efectos sobre terceros, trámites, subsidios y mecanismos de participación. Su incumplimiento puede ser fiscalizado y sancionado por el Consejo para la Transparencia.",
    fundamento: "Art. 7 Ley 20.285 (Transparencia)",
    etiquetas: ["transparencia", "activa", "publicación"],
  },

  // ---- Contratación administrativa, obras y patentes ---------------------
  {
    id: "c-mun-compras",
    area: "Municipal",
    tema: "Contratación administrativa",
    pregunta: "¿Cómo debe contratar bienes y servicios un municipio?",
    respuesta:
      "Por regla general mediante LICITACIÓN PÚBLICA a través del sistema de Compras Públicas (www.mercadopublico.cl / ChileCompra), garantizando libre concurrencia, igualdad de los oferentes y estricta sujeción a las bases. Excepcionalmente procede licitación privada o trato directo, solo en los casos calificados que señala la ley y mediante resolución fundada. Los contratos deben formalizarse y publicarse. La adjudicación se hace al oferente que mejor cumpla las bases (no necesariamente el más barato).",
    fundamento: "Ley 19.886 y su Reglamento (DS 250) · Ley 18.695",
    etiquetas: ["licitación", "contratación", "ChileCompra"],
  },
  {
    id: "c-mun-trato-directo",
    area: "Municipal",
    tema: "Trato directo",
    pregunta: "¿Cuándo procede el trato directo en una contratación municipal?",
    respuesta:
      "El trato o contratación directa es excepcional y procede solo en las causales del art. 8 de la Ley 19.886 y art. 10 de su Reglamento: licitaciones públicas o privadas declaradas desiertas, proveedor único, emergencia/urgencia/imprevisto calificado por resolución fundada, montos menores, confianza o seguridad, entre otras. Siempre requiere resolución fundada que acredite la causal y, según el caso, cotizaciones previas. Su uso indebido genera responsabilidad administrativa y observaciones de Contraloría.",
    fundamento: "Art. 8 Ley 19.886 · Art. 10 DS 250",
    etiquetas: ["trato directo", "licitación", "excepción"],
  },
  {
    id: "c-mun-edificacion",
    area: "Municipal",
    tema: "Permiso de edificación",
    pregunta: "¿Quién otorga el permiso de edificación y qué lo regula?",
    respuesta:
      "El permiso de edificación lo otorga la Dirección de Obras Municipales (DOM), previa revisión del cumplimiento de la normativa urbanística y técnica. Se rige por la Ley General de Urbanismo y Construcciones (LGUC, DFL 458) y su Ordenanza General (OGUC, DS 47), además del instrumento de planificación territorial vigente. Toda obra de construcción, ampliación, reparación o demolición requiere permiso, salvo las excepciones que la OGUC señala. El Director de Obras debe pronunciarse dentro de los plazos legales.",
    fundamento: "DFL 458 (LGUC) · DS 47 (OGUC) · Art. 24 Ley 18.695",
    etiquetas: ["edificación", "DOM", "permiso de obra"],
  },
  {
    id: "c-mun-recepcion",
    area: "Municipal",
    tema: "Recepción de obras",
    pregunta: "¿Qué es la recepción definitiva de obras y para qué sirve?",
    respuesta:
      "Concluida la construcción, el interesado solicita a la DOM la recepción definitiva (total o parcial). La DOM verifica que la obra se ejecutó conforme al permiso y la normativa, y emite el certificado de recepción. Sin recepción definitiva no puede habitarse ni destinarse al uso proyectado, ni obtenerse regularizaciones o ciertos servicios. Es requisito, además, para tramitar patentes y otros permisos asociados al inmueble.",
    fundamento: "Arts. 144 y 145 LGUC (DFL 458) · OGUC",
    etiquetas: ["recepción", "obras", "DOM"],
  },
  {
    id: "c-mun-patente",
    area: "Municipal",
    tema: "Patente municipal",
    pregunta: "¿Qué es la patente municipal y cómo se determina?",
    respuesta:
      "La patente municipal es el permiso que habilita el ejercicio de una actividad lucrativa (comercial, industrial o profesional) en la comuna. La patente comercial e industrial se calcula sobre el capital propio del contribuyente, con una tasa que la municipalidad fija entre el 2,5 por mil y el 5 por mil anual, dentro de los límites legales (con un tope máximo en UTM). Se paga normalmente en dos cuotas semestrales. La patente profesional tiene un valor fijo en UTM. Las patentes de alcoholes tienen regulación propia.",
    fundamento: "DL 3.063 (Ley de Rentas Municipales), arts. 23 y siguientes",
    etiquetas: ["patente", "capital propio", "rentas municipales"],
  },
  {
    id: "c-mun-derechos",
    area: "Municipal",
    tema: "Derechos municipales y ordenanzas",
    pregunta: "¿Qué son los derechos municipales y cómo se fijan?",
    respuesta:
      "Los derechos municipales son las prestaciones que pagan quienes obtienen del municipio una concesión, permiso o servicio (p. ej. permisos de obra, ocupación de bien nacional de uso público, ferias, propaganda). Se establecen y actualizan mediante ORDENANZA LOCAL de derechos, dictada por el alcalde con acuerdo del concejo, dentro de los marcos del DL 3.063. Las ordenanzas son normas generales y obligatorias dentro de la comuna y deben publicarse para su entrada en vigencia.",
    fundamento: "DL 3.063, arts. 40 y siguientes · Arts. 12 y 65 Ley 18.695",
    etiquetas: ["derechos", "ordenanza", "concejo"],
  },
  {
    id: "c-mun-concesion",
    area: "Municipal",
    tema: "Bienes municipales",
    pregunta: "¿Cómo se entregan permisos y concesiones sobre bienes municipales o de uso público?",
    respuesta:
      "Sobre los bienes municipales o nacionales de uso público que administra el municipio, la ley distingue PERMISOS (precarios, esencialmente revocables, sin indemnización) y CONCESIONES (otorgan derechos por un plazo, normalmente vía licitación, y dan más estabilidad al concesionario). Las concesiones y la disposición de bienes inmuebles municipales requieren, según el caso, acuerdo del concejo. Todo debe ajustarse a la ley orgánica municipal y a la ordenanza respectiva.",
    fundamento: "Arts. 32, 36 y 65 Ley 18.695 (LOC Municipalidades)",
    etiquetas: ["concesión", "permiso", "bienes", "uso público"],
  },
  {
    id: "c-mun-subvenciones",
    area: "Municipal",
    tema: "Subvenciones",
    pregunta: "¿Puede el municipio otorgar subvenciones y bajo qué condiciones?",
    respuesta:
      "Sí. La municipalidad puede otorgar subvenciones y aportes a personas jurídicas de carácter público o privado, sin fines de lucro, que colaboren directamente en el cumplimiento de sus funciones. El total de subvenciones no puede exceder el 7% del presupuesto municipal. Se otorgan por decreto alcaldicio, con acuerdo del concejo, y el beneficiario debe rendir cuenta documentada del uso de los fondos ante el municipio y la Contraloría; los fondos no rendidos o mal usados deben restituirse.",
    fundamento: "Art. 5 letra g) y 65 Ley 18.695 · Resolución 30/2015 CGR (rendición)",
    etiquetas: ["subvención", "rendición", "organizaciones"],
  },
  {
    id: "c-mun-convenios",
    area: "Municipal",
    tema: "Convenios",
    pregunta: "¿Cómo se celebran convenios de colaboración con otros órganos del Estado?",
    respuesta:
      "Los municipios pueden celebrar convenios de colaboración o de transferencia de recursos con otros servicios públicos (ministerios, gobiernos regionales, SUBDERE, etc.) para ejecutar programas o proyectos. El convenio debe identificar objeto, aportes, obligaciones, plazos y mecanismos de rendición y control. Su suscripción puede requerir acuerdo del concejo según su naturaleza y monto, y los recursos transferidos se rinden conforme a las normas de la Contraloría.",
    fundamento: "Arts. 8, 65 y 8 bis Ley 18.695 · Resolución 30/2015 CGR",
    etiquetas: ["convenio", "transferencia", "colaboración"],
  },
  {
    id: "c-iva-servicios",
    area: "Tributaria",
    tema: "IVA en servicios",
    pregunta: "¿Los servicios quedaron afectos a IVA?",
    respuesta:
      "Sí. Con la modernización tributaria (Ley 21.420), desde el 1 de enero de 2023 los servicios quedaron, por regla general, AFECTOS a IVA (19%), sin importar la actividad económica de origen. Subsisten exenciones relevantes, como los servicios de salud, los educacionales y los prestados por sociedades de profesionales que tributen en Segunda Categoría. Antes de la reforma solo se gravaban los servicios provenientes de ciertas actividades (comercio, industria, etc.).",
    fundamento: "DL 825 (modificado por Ley 21.420)",
    etiquetas: ["IVA", "servicios", "exención"],
  },
  {
    id: "c-ppm",
    area: "Tributaria",
    tema: "PPM",
    pregunta: "¿Qué son los Pagos Provisionales Mensuales (PPM)?",
    respuesta:
      "Los PPM son anticipos mensuales obligatorios que los contribuyentes de Primera Categoría enteran a cuenta de los impuestos anuales a la renta. Se calculan aplicando una tasa variable sobre los ingresos brutos del mes y se declaran en el Formulario 29 junto al IVA. En la declaración anual (Formulario 22) se imputan como crédito contra el impuesto a pagar; si exceden el impuesto, generan una devolución.",
    fundamento: "Art. 84 Ley sobre Impuesto a la Renta (DL 824)",
    etiquetas: ["PPM", "anticipo", "renta"],
  },
  {
    id: "c-f29-f22",
    area: "Tributaria",
    tema: "Declaraciones (F29 y F22)",
    pregunta: "¿Cuál es la diferencia entre el Formulario 29 y el Formulario 22?",
    respuesta:
      "El FORMULARIO 29 es la declaración MENSUAL: en él se declaran y pagan el IVA (débito menos crédito fiscal), los PPM y las retenciones (por ejemplo, de honorarios). Vence, en general, dentro de los primeros días del mes siguiente (con plazo ampliado para facturadores electrónicos). El FORMULARIO 22 es la declaración ANUAL de renta, que se presenta en abril y determina los impuestos del año comercial anterior (Global Complementario, Primera Categoría, etc.), imputando como créditos el Impuesto Único, los PPM y las retenciones ya enteradas.",
    fundamento: "DL 824 y DL 825 · Instrucciones SII",
    etiquetas: ["F29", "F22", "declaración"],
  },
];
