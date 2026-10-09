// Catálogo de plantillas del Asistente IA: prompts, skills y loops ordenados
// como una ruta de lanzamiento. Cada plantilla arma su texto con el perfil de
// la tienda; `generar` entrega las variantes listas para copiar o descargar.
(function (global) {
  "use strict";
  const M = typeof module !== "undefined" && module.exports ? require("./motor.js") : global.Motor;

  const ETAPAS = [
    { n: 1, icono: "🧭", titulo: "Elegir nicho y producto" },
    { n: 2, icono: "📦", titulo: "Proveedor y precio" },
    { n: 3, icono: "🏪", titulo: "Armar la tienda" },
    { n: 4, icono: "📣", titulo: "Vender: contenido y anuncios" },
    { n: 5, icono: "📈", titulo: "Operar y crecer" },
  ];

  const TIPOS = {
    prompt: { icono: "💬", nombre: "Prompt", explica: "Una instrucción para una tarea puntual. Copias, pegas y la IA responde." },
    skill: { icono: "🧩", nombre: "Skill", explica: "Un asistente experto que instalas una vez y la IA usa cada vez que lo necesitas." },
    loop: { icono: "🔁", nombre: "Loop", explica: "Un proceso por ciclos: la IA repite pasos, mide y mejora hasta cumplir una meta." },
  };

  // Mismos criterios y umbrales que el Radar Dropshipping (scoring.js), para
  // que el puntaje de la IA y el de la app coincidan. Son heurísticos.
  const CHECKLIST = [
    "Efecto «wow» visible en video",
    "Resuelve un problema concreto",
    "Difícil de encontrar en tiendas locales",
    "Se entiende en los primeros 3 segundos",
    "Precio de compra por impulso para el público",
    "Liviano, no frágil, fácil de enviar",
    "BLOQUEANTE: no usa marca registrada ni imita un producto de marca",
    "BLOQUEANTE: no es producto restringido (medicamentos, suplementos, cosmética regulada, armas, etc.)",
  ];

  const RUBRICA = [
    "| Componente | Puntos | Puntaje completo cuando… |",
    "|---|---|---|",
    "| Demanda | 30 | interacción (me gusta + comentarios + compartidos) ≥ 10 % de las vistas y ≥ 50.000 vistas por día |",
    "| Margen | 25 | margen ≥ 65 %, con margen = (precio − costo − envío) ÷ precio |",
    "| Señales de venta | 15 | anuncio pagado activo ≥ 30 días, o ≥ 5 de 20 comentarios leídos preguntan precio o dónde comprar |",
    "| Checklist | 30 | se cumplen los 8 criterios (proporcional) |",
    "",
    "Veredicto: ≥ 70 = 🟢 Ganador probable · 50–69 = 🟡 Testear con poco presupuesto · < 50 = ⚪ Descartar · cualquier criterio BLOQUEANTE sin cumplir = 🔴 No apto.",
    "Estos umbrales son heurísticos (práctica habitual en dropshipping), no un modelo validado con datos de ventas.",
  ].join("\n");

  const FORMULAS = M.lista([
    "Ganancia por venta (antes de publicidad) = precio − costo del producto − envío − comisión de la pasarela de pago",
    "Margen % = ganancia por venta ÷ precio",
    "ROAS de equilibrio = precio ÷ ganancia por venta (bajo ese ROAS, cada venta pierde dinero)",
    "CPA máximo = ganancia por venta (lo máximo que puedes pagar en publicidad por cada venta sin perder)",
    "CTR = clics ÷ impresiones · CPC = gasto ÷ clics · CPA = gasto ÷ compras · ROAS = ventas ÷ gasto",
    "Conversión = compras ÷ sesiones · Ticket promedio = ventas ÷ pedidos",
  ]);

  const TLD = { chile: "cl", "méxico": "mx", mexico: "mx", colombia: "co", "perú": "pe", peru: "pe", argentina: "ar", uruguay: "uy", "españa": "es", espana: "es" };

  function esChile(p) { return String(p.pais || "").trim().toLowerCase() === "chile"; }

  function numeros(p) {
    return "Mis números:\n" + M.lista([
      `Precio de venta: ${M.dinero(p, "precioVenta")}`,
      `Costo del producto: ${M.dinero(p, "costoProducto")}`,
      `Costo de envío: ${M.dinero(p, "costoEnvio")}`,
      `Presupuesto mensual de anuncios: ${M.dinero(p, "presupuesto")}`,
    ]);
  }

  function pistasLegales(p) {
    if (!esChile(p)) return `Identifica las normas de protección al consumidor, comercio electrónico y datos personales de ${M.valor(p, "pais")}, con número y artículo.`;
    return "Punto de partida para Chile (fuente secundaria; VERIFICAR el texto vigente en bcn.cl/leychile): Ley 19.496 sobre Protección de los Derechos de los Consumidores —incluido el derecho de retracto en compras a distancia del art. 3 bis, modificado por la Ley 21.398— y la normativa de protección de datos personales (Ley 19.628 y sus modificaciones).";
  }

  // Nombre de la tienda para textos del skill (la descripción no debe llevar marcadores).
  function marca(p) { return M.tiene(p, "tienda") ? p.tienda.trim() : "la tienda"; }
  function nichoCorto(p) { return M.tiene(p, "nicho") ? ` (${p.nicho.trim()})` : ""; }

  // ===========================================================================
  const PLANTILLAS = [
    // ---- 1. Nicho y producto ----------------------------------------------
    {
      id: "nicho", tipo: "prompt", etapa: 1, titulo: "Encontrar mi nicho",
      resumen: "8 nichos evaluados, los 3 mejores y un plan para validarlos en 7 días.",
      partes: (p) => ({
        rol: "Eres un consultor de e-commerce y dropshipping con experiencia en Latinoamérica y España. Eres honesto: prefieres decirme que una idea es mala antes que hacerme perder dinero.",
        campos: ["nicho", "pais", "moneda", "publico", "plataforma", "proveedor", "canales", "presupuesto"],
        tarea: `Ayúdame a elegir un nicho rentable para vender por dropshipping en ${M.valor(p, "pais")}. Si el nicho dice [COMPLETAR], parte de cero; si no, inclúyelo entre los candidatos y evalúalo con la misma vara.`,
        pasos: [
          "Propón 8 nichos con productos que se puedan mostrar en video, que resuelvan un problema o generen sorpresa, livianos y no frágiles, sin marcas registradas ni productos restringidos.",
          `Evalúa cada uno de 1 a 5 en: demanda (con la evidencia que tengas), competencia, margen posible (lo que el público de ${M.valor(p, "pais")} pagaría vs. el costo típico en el proveedor; si no tienes precios reales, márcalo ESTIMACIÓN), facilidad de envío, potencial de contenido en ${M.valor(p, "canales")} y riesgo de devoluciones.`,
          "Descarta los que tengan riesgo legal o de rechazo en plataformas de anuncios y explica por qué.",
          `Elige los 3 mejores. Para cada uno: 3 productos de ejemplo, ticket promedio estimado en ${M.valor(p, "moneda")}, ángulo de marketing principal y la duda más importante que habría que validar.`,
          "Dame un plan para validar el nicho en 7 días gastando poco: qué buscar en TikTok e Instagram, en la Biblioteca de Anuncios de Meta y en Google Trends, y qué resultado indicaría seguir o abandonar.",
        ],
        salida: M.numerada(["Tabla de los 8 nichos con puntajes y total.", "Fichas breves de los 3 elegidos.", "Plan de validación de 7 días como checklist.", "Lista de todo lo marcado [VERIFICAR]."]),
        reglasExtra: ["Si el presupuesto es bajo, prioriza nichos que se puedan probar con contenido orgánico antes de pagar anuncios."],
      }),
    },
    {
      id: "loop-productos", tipo: "loop", etapa: 1, titulo: "Cazar productos ganadores",
      resumen: "Ciclos de búsqueda y puntaje hasta tener 3 productos listos para testear.",
      maxCiclos: 6,
      partes: (p) => ({
        rol: "Eres un investigador de productos para dropshipping, metódico y escéptico: cada puntaje debe poder justificarse con datos.",
        campos: ["nicho", "pais", "moneda", "publico", "proveedor", "canales"],
        objetivo: `Encontrar 3 productos para testear en mi tienda de ${M.valor(p, "nicho")} en ${M.valor(p, "pais")}, con evidencia y un puntaje claro.`,
        entradas: "Si no puedes buscar en internet, en cada ciclo te pegaré los datos de 1 a 3 productos que vi en redes: nombre, link, vistas, me gusta, comentarios, compartidos, fecha de publicación, días que lleva el anuncio, cuántos de 20 comentarios preguntan precio o dónde comprar, precio que cobran y costo en el proveedor.",
        contextoExtra: "Rúbrica de puntaje (100 puntos):\n" + RUBRICA + "\n\nChecklist de 8 criterios:\n" + M.lista(CHECKLIST),
        pasos: [
          "Consigue 1 a 3 candidatos nuevos: si puedes buscar en internet, búscalos (tiendas, TikTok, Biblioteca de Anuncios de Meta) y cita dónde los viste; si no, usa los que yo te entregue.",
          "Puntúa cada candidato con la rúbrica, mostrando el cálculo de cada componente. Si falta un dato, pon 0 en ese componente y anótalo en «Qué falta verificar».",
          "Aplica los criterios BLOQUEANTES antes del puntaje: si alguno no se cumple, el producto queda 🔴 No apto.",
          "Asigna el veredicto según la rúbrica.",
          "Mira qué tienen en común los mejores y ajusta la búsqueda del siguiente ciclo.",
        ],
        tabla: ["Ciclo", "Producto", "Fuente / link", "Demanda /30", "Margen /25", "Señales /15", "Checklist /30", "Total", "Veredicto", "Qué falta verificar"],
        meta: "Tener 3 productos 🟢 o 🟡 sin datos críticos pendientes de verificar.",
      }),
    },
    {
      id: "validar-producto", tipo: "prompt", etapa: 1, titulo: "Validar un producto",
      resumen: "Números, riesgos y semáforo para decidir si vender un producto concreto.",
      partes: (p) => ({
        rol: "Eres un analista de productos de dropshipping. Tu trabajo es evitar que pierda dinero en productos malos.",
        campos: ["producto", "nicho", "pais", "moneda", "publico", "proveedor"],
        contextoExtra: numeros(p) + "\nDatos del video o anuncio donde lo vi: [pega aquí link, vistas, me gusta, comentarios, compartidos, fecha y días activo]",
        tarea: `Evalúa si vale la pena vender este producto: ${M.valor(p, "producto")}.`,
        pasos: [
          "Calcula con mis números la ganancia por venta, el margen y el ROAS de equilibrio (muestra las fórmulas).",
          "Puntúa el producto con la rúbrica de 100 puntos de abajo.",
          `Revisa riesgos: marca registrada o imitación, certificaciones o registros que pueda exigir ${M.valor(p, "pais")} para este tipo de producto (eléctrico, cosmético, infantil, alimentos), devoluciones, tiempos de envío y saturación.`,
          "Da el veredicto con las 3 razones principales.",
          "Si es 🟢 o 🟡: el ángulo de venta principal y 3 ganchos para video.",
        ],
        salida: `Rúbrica:\n${RUBRICA}\n\nChecklist:\n${M.lista(CHECKLIST)}\n\nEntrega: 1) tabla de números; 2) puntaje por componente; 3) checklist Sí / No / No sé con el porqué; 4) riesgos; 5) veredicto; 6) ángulo y ganchos; 7) lista [VERIFICAR].`,
      }),
    },
    {
      id: "skill-validador", tipo: "skill", etapa: 1, titulo: "Validador de productos",
      resumen: "Skill que puntúa cualquier producto con la misma rúbrica del Radar.",
      ejemplo: "Analiza este producto que vi en TikTok: [link y datos]",
      partes: (p) => ({
        base: "validador-productos",
        titulo: "Validador de productos de dropshipping",
        descripcion: `Evalúa productos para ${marca(p)}${nichoCorto(p)}: margen, ROAS de equilibrio, puntaje 0-100 y semáforo. Úsalo al analizar un producto de redes o de un proveedor.`,
        rol: "Eres el analista de productos de esta tienda. Tu trabajo es evitar que el dueño pierda dinero en productos malos y detectar a tiempo los que valen la pena.",
        campos: ["tienda", "nicho", "pais", "moneda", "publico", "proveedor"],
        cuandoUsar: ["El usuario comparte un producto, un video o un anuncio y pregunta si sirve.", "Hay que comparar varios productos candidatos.", "El usuario pregunta qué precio poner o si el margen alcanza."],
        flujo: [
          "Pide los datos que falten, todos juntos: nombre, link, vistas, me gusta, comentarios, compartidos, fecha de publicación, días activo del anuncio, comentarios con intención de compra (de 20 leídos), precio, costo y envío.",
          "Calcula ganancia por venta, margen, ROAS de equilibrio y CPA máximo, mostrando las fórmulas.",
          "Revisa primero los criterios BLOQUEANTES; si alguno falla, el veredicto es 🔴 No apto.",
          "Puntúa cada componente de la rúbrica, explicando el cálculo.",
          "Entrega el veredicto y, si es 🟢 o 🟡, el ángulo de venta y 3 ganchos para video.",
          "Si compara varios productos, entrega una tabla ordenada del mejor al peor.",
        ],
        conocimiento: `### Rúbrica\n${RUBRICA}\n\n### Checklist\n${M.lista(CHECKLIST)}\n\n### Fórmulas\n${FORMULAS}`,
        salida: "Ficha con: Producto · Números (tabla) · Puntaje por componente · Checklist Sí/No/No sé · Riesgos · Veredicto con semáforo y 3 razones · Lista [VERIFICAR].",
        ejemplos: ["¿Vale la pena vender este organizador a 14.990?", "Compara estos 3 productos y dime cuál testear", "Analiza este anuncio que lleva 40 días activo"],
      }),
    },
    {
      id: "competencia", tipo: "prompt", etapa: 1, titulo: "Analizar a la competencia",
      resumen: "Qué ofrecen, cuánto cobran y dónde hay espacio para diferenciarte.",
      partes: (p) => ({
        rol: "Eres un estratega de marketing para e-commerce. Analizas a la competencia para diferenciarte, nunca para copiar.",
        campos: ["nicho", "producto", "pais", "moneda", "publico", "canales"],
        contextoExtra: "Tiendas o anuncios de la competencia: [pega aquí 3 a 5 links, o escribe «búscalas tú»]",
        tarea: `Analiza a mis competidores en ${M.valor(p, "nicho")} en ${M.valor(p, "pais")} y encuentra cómo diferenciarme.`,
        pasos: [
          "Para cada competidor: producto principal, precio, oferta (packs, envío gratis, regalos), promesa principal, estructura de la página de producto, elementos de confianza, cantidad y tono de reseñas visibles, y anuncios activos en la Biblioteca de Anuncios de Meta si puedes consultarla.",
          "Identifica qué hacen todos (lo mínimo esperado por el cliente) y qué no hace nadie.",
          "Lee las quejas en reseñas y comentarios: son oportunidades.",
          "Propón 5 formas concretas de diferenciarme (oferta, garantía, contenido, servicio, presentación).",
          "Redacta mi propuesta de valor en una frase de máximo 15 palabras, en 3 versiones.",
        ],
        salida: "1) Tabla comparativa. 2) Lo mínimo esperado vs. espacios vacíos. 3) 5 oportunidades priorizadas. 4) 3 propuestas de valor. 5) Lista [VERIFICAR].",
        reglasExtra: ["Indica la fecha en que revisaste cada tienda o anuncio: los precios y anuncios cambian."],
      }),
    },

    // ---- 2. Proveedor y precio ------------------------------------------------
    {
      id: "proveedor", tipo: "prompt", etapa: 2, titulo: "Evaluar proveedor",
      resumen: "Qué preguntarle al proveedor, mensaje listo, alertas y pedido de muestra.",
      partes: (p) => ({
        rol: "Eres un experto en abastecimiento para dropshipping y comercio con Asia y proveedores locales.",
        campos: ["producto", "proveedor", "pais", "moneda"],
        tarea: `Ayúdame a evaluar al proveedor (${M.valor(p, "proveedor")}) para vender ${M.valor(p, "producto")} con envío a ${M.valor(p, "pais")}.`,
        pasos: [
          "Haz la lista de datos que debo conseguir: precio por unidad y por volumen, tiempo de preparación, métodos y tiempos de envío a mi país, número de seguimiento, política de productos defectuosos, fotos y videos propios utilizables, empaque sin marca o personalizado, stock disponible.",
          "Redacta un mensaje para el proveedor pidiendo esos datos (en inglés simple si es un proveedor extranjero, con traducción al español).",
          "Lista las señales de alerta de un mal proveedor.",
          "Arma una matriz para comparar hasta 3 proveedores: costo total puesto en mi país, tiempo total de entrega, calificación, comunicación y calidad de la muestra.",
          "Dame un checklist para revisar el pedido de muestra cuando llegue.",
          `Indica si en ${M.valor(p, "pais")} hay impuestos, aranceles o límites para envíos pequeños importados y márcalo [VERIFICAR en el servicio oficial de aduanas o impuestos].`,
        ],
        salida: "1) Datos a conseguir. 2) Mensaje al proveedor. 3) Señales de alerta. 4) Matriz comparativa vacía para completar. 5) Checklist de muestra. 6) Costos de importación [VERIFICAR].",
      }),
    },
    {
      id: "precio", tipo: "prompt", etapa: 2, titulo: "Calcular precio y ganancia",
      resumen: "3 escenarios de precio, ROAS de equilibrio y cuántas ventas necesitas.",
      partes: (p) => ({
        rol: "Eres un analista financiero de e-commerce. Trabajas solo con los números que te entrego.",
        campos: ["producto", "pais", "moneda", "publico"],
        contextoExtra: numeros(p) + "\n\nFórmulas de referencia:\n" + FORMULAS,
        tarea: `Ayúdame a fijar el precio de mi producto: ${M.valor(p, "producto")}.`,
        pasos: [
          "Usa SOLO mis números. Pregúntame también la comisión de mi pasarela de pago (%) y si cobraré el envío aparte u ofreceré envío gratis. No supongas comisiones.",
          "Calcula 3 escenarios (económico, recomendado, premium): ganancia por venta, margen %, ROAS de equilibrio y CPA máximo.",
          `Sugiere precios terminados de forma habitual en ${M.valor(p, "moneda")} (márcalo OPINIÓN).`,
          "Calcula el efecto en la ganancia de 3 ofertas: pack de 2 unidades, envío gratis desde cierto monto y regalo de bajo costo.",
          "Calcula cuántas ventas al mes necesito para cubrir mi presupuesto de anuncios con cada precio.",
        ],
        salida: "1) Tabla de escenarios. 2) Precio recomendado y por qué. 3) Tabla de ofertas. 4) Ventas mínimas mensuales. 5) Las fórmulas escritas para una planilla de Excel o Google Sheets (indicando qué celda es cada dato).",
        reglasExtra: ["No recomiendes mostrar un precio «antes» tachado que nunca se cobró: puede infringir las normas de protección al consumidor."],
      }),
    },

    // ---- 3. Tienda --------------------------------------------------------------
    {
      id: "marca", tipo: "prompt", etapa: 3, titulo: "Nombre de marca y dominio",
      resumen: "15 nombres, los 3 mejores con slogan, colores y dónde verificar disponibilidad.",
      partes: (p) => {
        const tld = TLD[String(p.pais || "").trim().toLowerCase()];
        return {
          rol: "Eres un especialista en branding para tiendas online.",
          campos: ["tienda", "nicho", "pais", "publico", "tono"],
          tarea: `Crea el nombre y la identidad básica de mi marca. Si ya tengo nombre (${M.valor(p, "tienda")}), evalúalo primero y propón alternativas solo si tiene problemas.`,
          pasos: [
            `Propón 15 nombres en 3 estilos (descriptivo, inventado, emocional): cortos, fáciles de decir y escribir en ${M.valor(p, "pais")}.`,
            `Para cada uno: significado, dominio sugerido (.com${tld ? " y ." + tld : ""}) y riesgo de confusión con marcas conocidas.`,
            "Elige los 3 mejores y da para cada uno: slogan, paleta de 3 colores (código hex) y descripción del logo para pedírselo a un diseñador o a una IA de imágenes.",
            esChile(p)
              ? "No puedes confirmar disponibilidad: marca todo como [VERIFICAR] y recuérdame revisar el dominio .cl en NIC Chile y la marca en INAPI."
              : "No puedes confirmar disponibilidad: marca todo como [VERIFICAR] y dime dónde revisar el dominio y el registro de marcas en mi país.",
          ],
          salida: "1) Tabla de 15 nombres. 2) Top 3 con slogan, colores y brief de logo. 3) Checklist de verificación de disponibilidad.",
        };
      },
    },
    {
      id: "estructura", tipo: "prompt", etapa: 3, titulo: "Armar la estructura de la tienda",
      resumen: "Páginas, menú, configuración esencial y checklist de lanzamiento.",
      partes: (p) => ({
        rol: `Eres un experto en montar tiendas en ${M.valor(p, "plataforma")} para principiantes.`,
        campos: ["tienda", "nicho", "producto", "pais", "moneda", "plataforma", "tono"],
        tarea: `Diseña la estructura completa de mi tienda en ${M.valor(p, "plataforma")}.`,
        pasos: [
          "Mapa de páginas: inicio (secciones en orden y texto de cada una), producto, colecciones, sobre nosotros, contacto, preguntas frecuentes, seguimiento de pedido y políticas.",
          "Menú principal y pie de página.",
          `Configuración esencial en ${M.valor(p, "plataforma")}: dominio, medios de pago disponibles en ${M.valor(p, "pais")} [VERIFICAR disponibilidad], envíos y zonas, impuestos, correos de notificación, idioma y moneda. Si no estás seguro del nombre exacto de un menú, dilo.`,
          "Máximo 5 apps o plugins por función (reseñas, venta adicional, chat o WhatsApp, seguimiento). Si no estás seguro de que una app exista, describe la función en vez de dar un nombre.",
          "Elementos de confianza: contacto real, tiempos de envío honestos, políticas visibles, medios de pago.",
          "Checklist de lanzamiento de al menos 20 puntos, en orden, incluyendo un pedido de prueba.",
        ],
        salida: "1) Árbol de páginas. 2) Textos del inicio. 3) Configuración paso a paso. 4) Apps por función. 5) Checklist de lanzamiento.",
      }),
    },
    {
      id: "ficha", tipo: "prompt", etapa: 3, titulo: "Ficha de producto que vende",
      resumen: "Título, descripción, FAQ, guía de fotos y versión HTML para pegar.",
      partes: (p) => ({
        rol: "Eres un copywriter de e-commerce especializado en páginas de producto que convierten sin engañar.",
        campos: ["tienda", "producto", "pais", "moneda", "publico", "plataforma", "tono"],
        contextoExtra: numeros(p) + "\nDatos del proveedor (medidas, materiales, contenido de la caja, tiempo de envío): [pégalos aquí]",
        tarea: `Escribe la página de mi producto: ${M.valor(p, "producto")}.`,
        pasos: [
          "Título de máximo 60 caracteres con el beneficio principal (3 opciones).",
          "Subtítulo o gancho (3 opciones).",
          "Descripción con esta estructura: problema → solución → 5 beneficios (no características) → cómo se usa en 3 pasos → qué incluye → especificaciones → envío y garantía.",
          "6 preguntas frecuentes con sus respuestas, pensadas para resolver objeciones de compra.",
          "Guía de 6 imágenes o GIF: qué mostrar en cada una y en qué orden.",
          "Texto del botón de compra y una frase de urgencia honesta (sin contadores ni stock falsos).",
          `Versión en HTML simple, lista para pegar en el editor de ${M.valor(p, "plataforma")}.`,
        ],
        salida: "Secciones con títulos claros, en el orden de los pasos, y al final la lista [VERIFICAR].",
        reglasExtra: ["No inventes reseñas, número de clientes, premios ni certificaciones.", "Especificaciones y tiempos de envío: usa solo los datos del proveedor; si faltan, deja [VERIFICAR con proveedor]."],
      }),
    },
    {
      id: "loop-ficha", tipo: "loop", etapa: 3, titulo: "Pulir la ficha hasta que convierta",
      resumen: "La IA puntúa tu página, mejora lo más débil y repite hasta nota 8 en todo.",
      maxCiclos: 4,
      partes: (p) => ({
        rol: "Eres un especialista en optimización de conversión (CRO) para tiendas online.",
        campos: ["tienda", "producto", "publico", "plataforma", "tono"],
        objetivo: `Mejorar la página de producto de ${M.valor(p, "producto")} hasta que cumpla un estándar alto de claridad, confianza y cumplimiento.`,
        entradas: "En el ciclo 1 te pegaré el texto actual de mi página de producto (o el link). En los siguientes, mis cambios o comentarios.",
        pasos: [
          "Puntúa la ficha de 1 a 10 en: beneficio claro en 5 segundos, título, confianza (envío, garantía, contacto, reseñas reales), manejo de objeciones, guía de imágenes, llamado a la acción, lectura en celular y cumplimiento (sin promesas ni urgencia falsas, información legal visible).",
          "Identifica los 2 criterios con nota más baja.",
          "Reescribe solo lo necesario para subir esos 2 criterios, mostrando ANTES → DESPUÉS.",
          "Vuelve a puntuar los criterios que cambiaste.",
        ],
        tabla: ["Ciclo", "Criterio", "Nota antes", "Nota después", "Cambio aplicado", "Pendiente"],
        meta: "Todos los criterios con nota 8 o más y nada pendiente de [VERIFICAR] en el texto final.",
        resumen: ["Tabla de estado completa.", "Texto final completo de la ficha, listo para pegar.", "Lista de lo que queda por verificar."],
      }),
    },
    {
      id: "politicas", tipo: "prompt", etapa: 3, titulo: "Políticas de envío, cambios y privacidad",
      resumen: "Borradores claros de políticas, con las normas a verificar por un abogado.",
      partes: (p) => ({
        rol: "Eres un asesor de cumplimiento para comercio electrónico. Redactas en lenguaje claro y marcas todo lo que requiere revisión legal.",
        campos: ["tienda", "pais", "plataforma", "proveedor"],
        contextoExtra: [
          "Datos de mi operación: tiempo de preparación [COMPLETAR], tiempo de envío real del proveedor [COMPLETAR], quién recibe las devoluciones (proveedor o dirección local) [COMPLETAR], datos del vendedor (razón social o nombre, identificación tributaria, dirección, correo) [COMPLETAR].",
          pistasLegales(p),
        ].join("\n"),
        tarea: "Redacta los borradores de las políticas de mi tienda.",
        pasos: [
          "Política de envíos: plazos reales (preparación + envío), costos, zonas, seguimiento y qué pasa si hay atraso.",
          `Cambios, devoluciones y garantía: derecho de retracto si aplica en ${M.valor(p, "pais")}, garantía legal por productos defectuosos, quién paga el envío de vuelta y plazos de reembolso. Explica cómo manejarlo en la práctica en dropshipping.`,
          "Privacidad: qué datos se recogen, para qué, con quién se comparten (plataforma, pasarela de pago, proveedor, herramientas de anuncios), derechos del cliente y cómo ejercerlos.",
          "Términos y condiciones básicos con la identificación del vendedor.",
          "Lista de lo que debe mostrarse al cliente antes de pagar.",
        ],
        salida: "Cada política con título, texto listo para pegar y, al final, la tabla «Norma citada | Para qué | Estado: VERIFICAR».",
        reglasExtra: ["No afirmes plazos ni derechos legales sin citar la norma; si no la tienes verificada, marca [VERIFICAR].", `Termina indicando que el borrador debe revisarlo un abogado de ${M.valor(p, "pais")} antes de publicarlo.`],
      }),
    },
    {
      id: "seo", tipo: "prompt", etapa: 3, titulo: "SEO de la tienda",
      resumen: "Palabras clave, títulos, meta descripciones, textos alt e ideas de blog.",
      partes: (p) => ({
        rol: "Eres un especialista en SEO para e-commerce en español.",
        campos: ["tienda", "nicho", "producto", "pais", "publico", "plataforma"],
        tarea: `Prepara el SEO básico de mi tienda para búsquedas en ${M.valor(p, "pais")}.`,
        pasos: [
          "20 palabras clave agrupadas por intención (compra, comparación, problema). Si no tienes una herramienta con volúmenes de búsqueda, ordénalas por relevancia y márcalo ESTIMACIÓN; no inventes volúmenes.",
          "Título SEO (máx. 60 caracteres) y meta descripción (máx. 155) para inicio, colección y producto.",
          "URLs cortas para producto y colección.",
          "Texto alternativo (alt) para 6 imágenes de producto.",
          "5 ideas de artículos de blog que respondan dudas reales del público, con sus subtítulos.",
          `Qué datos completar en ${M.valor(p, "plataforma")} para que Google muestre precio y disponibilidad. Si no estás seguro de cómo lo maneja la plataforma, dilo.`,
        ],
        salida: "Tablas por sección, listas para copiar.",
      }),
    },
    {
      id: "skill-redactor", tipo: "skill", etapa: 3, titulo: "Redactor de mi marca",
      resumen: "Skill que escribe todo con la voz de tu marca: fichas, anuncios, correos.",
      ejemplo: "Escribe 3 versiones del anuncio para el organizador giratorio",
      partes: (p) => ({
        base: "redactor-marca",
        titulo: `Redactor de marca de ${marca(p)}`,
        descripcion: `Escribe textos con la voz de ${marca(p)}: fichas de producto, anuncios, correos, posts y respuestas. Úsalo para cualquier texto de venta de la tienda.`,
        rol: "Eres el redactor oficial de la marca. Todo lo que escribes suena a la misma marca y busca vender sin engañar.",
        campos: ["tienda", "nicho", "producto", "pais", "publico", "tono", "canales"],
        cuandoUsar: ["Hay que escribir o mejorar cualquier texto de la tienda: ficha, anuncio, correo, post, guion, respuesta a cliente.", "El usuario pide variantes de un texto para probar cuál funciona mejor."],
        flujo: [
          "Identifica el tipo de texto, el canal y el objetivo (vender, educar, responder).",
          "Si falta el producto, la oferta o el público, pregúntalo.",
          "Escribe 2 o 3 versiones con fórmulas distintas.",
          "Revisa cada versión con el checklist: voz de marca, beneficio claro, llamado a la acción, largo adecuado al canal, sin promesas falsas.",
          "Entrega las versiones e indica cuál recomiendas y por qué.",
        ],
        conocimiento: [
          `### Voz de la marca\n${M.TONOS[p.tono] ? M.TONOS[p.tono] : "[COMPLETAR: describe el tono de la marca]"}.`,
          "Evitar: «el mejor del mundo», «milagroso», «100 % garantizado» y cualquier afirmación que no se pueda comprobar.",
          "### Fórmulas\n" + M.lista(["PAS: problema → agitación → solución.", "AIDA: atención → interés → deseo → acción.", "Antes → después → puente: cómo es la vida sin el producto, cómo es con él, y el producto como puente."]),
          "### Largo por canal\n" + M.lista(["Anuncio: texto principal de 1 a 3 frases cortas y un título breve.", "Ficha: escaneable, con subtítulos y viñetas.", "Correo: un solo objetivo y un solo botón.", "Mensaje a cliente: máximo 80 palabras."]),
        ].join("\n\n"),
        salida: "Para cada pieza: Versión A / B / C con la fórmula usada, la recomendada y la lista [VERIFICAR].",
        ejemplos: ["Escribe la descripción del producto estrella", "Dame 5 títulos para un anuncio", "Reescribe este correo con la voz de la marca"],
      }),
    },
    {
      id: "skill-lanzador", tipo: "skill", etapa: 3, titulo: "Lanzador de tienda",
      resumen: "Skill jefe de proyecto: lleva tu avance y te dice el siguiente paso.",
      ejemplo: "¿Cuál es mi siguiente paso para lanzar la tienda?",
      partes: (p) => ({
        base: "lanzador-tienda",
        titulo: "Lanzador de tienda de dropshipping",
        descripcion: `Guía el montaje y lanzamiento de ${marca(p)}${M.tiene(p, "plataforma") ? " en " + p.plataforma : ""}: lleva el avance por etapas y propone el siguiente paso. Úsalo al preguntar qué hacer ahora.`,
        rol: "Eres el jefe de proyecto del lanzamiento. Llevas la cuenta de qué está hecho y qué falta, y siempre propones UN siguiente paso concreto.",
        campos: ["tienda", "nicho", "producto", "pais", "plataforma", "proveedor", "presupuesto"],
        cuandoUsar: ["El usuario pregunta qué sigue, cómo va el lanzamiento o se siente perdido.", "El usuario termina una tarea y quiere marcarla como hecha."],
        flujo: [
          "Pregunta (o deduce de la conversación) qué etapas y tareas están terminadas.",
          "Muestra el tablero de avance con ✅ hecho, 🔄 en curso y ⬜ pendiente.",
          "Propón el siguiente paso: qué hacer, cuánto tiempo toma aproximadamente (ESTIMACIÓN) y qué herramienta del kit usar.",
          "Si hay un bloqueo (falta dinero, un dato, una decisión), dilo primero y ofrece cómo destrabarlo.",
          "Cuando el usuario termine algo, actualiza el tablero.",
        ],
        conocimiento: "### Etapas y cuándo están terminadas\n" + M.numerada([
          "Nicho y producto: al menos un producto 🟢 o 🟡 con números revisados.",
          "Proveedor: proveedor elegido y muestra revisada.",
          "Marca: nombre, dominio, logo y colores definidos (disponibilidad verificada).",
          "Tienda: páginas, ficha, políticas, pagos y envíos configurados, y un pedido de prueba hecho.",
          "Contenido: al menos 10 videos o creativos listos.",
          "Lanzamiento: campaña de prueba con presupuesto y reglas de corte definidas.",
          "Operación: atención al cliente, seguimiento de pedidos y revisión semanal funcionando.",
        ]) + "\n\n### Herramientas del kit por etapa\n" + M.lista([
          "1: prompt «Encontrar mi nicho», loop «Cazar productos ganadores», skill «Validador de productos».",
          "2: prompts «Evaluar proveedor» y «Calcular precio y ganancia».",
          "3: prompts de marca, estructura, ficha, políticas y SEO; loop «Pulir la ficha»; skill «Redactor de mi marca».",
          "4: prompts de guiones, anuncios, calendario y correos; skill «Creador de videos»; loop «Testear anuncios».",
          "5: prompt y skill de atención al cliente y de métricas; loop «Revisión diaria».",
        ]),
        salida: "Tablero de avance (tabla) + «Siguiente paso» destacado + bloqueos, si los hay.",
        ejemplos: ["¿Qué me falta para lanzar?", "Ya tengo el dominio, ¿qué sigue?", "Muéstrame cómo voy"],
      }),
    },

    // ---- 4. Contenido y anuncios ---------------------------------------------
    {
      id: "guiones", tipo: "prompt", etapa: 4, titulo: "Guiones para TikTok y Reels",
      resumen: "10 ganchos, 5 guiones escena por escena y 2 guiones estilo UGC.",
      partes: (p) => ({
        rol: "Eres un creador de contenido de video corto especializado en productos de e-commerce.",
        campos: ["tienda", "producto", "publico", "tono", "canales"],
        tarea: `Crea guiones de video corto para vender mi producto: ${M.valor(p, "producto")}.`,
        pasos: [
          "10 ganchos de 1 a 3 segundos de distintos tipos: problema, resultado, curiosidad, objeción, punto de vista («POV»), comparación y demostración.",
          "5 guiones completos de 15 a 30 segundos, escena por escena: tiempo, qué se ve, texto en pantalla, voz y llamado a la acción.",
          "2 guiones estilo UGC (una persona usando el producto en casa) con instrucciones para grabar con el celular: luz, encuadre, sonido y tomas obligatorias.",
          "Texto de la publicación y máximo 5 hashtags relevantes por video.",
          "Qué mirar en las estadísticas para saber si el video funcionó (retención en los primeros segundos, porcentaje que lo ve completo, comentarios con intención de compra).",
        ],
        salida: "Guiones en tablas (Tiempo | Imagen | Texto en pantalla | Voz).",
        reglasExtra: ["Usa audio propio o con licencia para uso comercial.", "Nada de resultados exagerados ni «antes y después» que no sean reales."],
      }),
    },
    {
      id: "anuncios", tipo: "prompt", etapa: 4, titulo: "Anuncios para Facebook e Instagram",
      resumen: "3 ángulos con textos, títulos y una campaña de prueba con reglas de corte.",
      partes: (p) => ({
        rol: "Eres un media buyer con experiencia en anuncios de Meta para tiendas de dropshipping.",
        campos: ["tienda", "producto", "pais", "moneda", "publico", "tono"],
        contextoExtra: numeros(p),
        tarea: `Crea los anuncios y la campaña de prueba para mi producto: ${M.valor(p, "producto")}.`,
        pasos: [
          "3 ángulos de venta distintos (por ejemplo: dolor, deseo, regalo o identidad).",
          "Para cada ángulo: 3 textos principales (corto, medio y largo), 5 títulos breves, 3 descripciones y el botón sugerido.",
          "Públicos a probar como HIPÓTESIS (intereses, edades) o recomendación de público amplio, explicando por qué.",
          "Estructura de la campaña de prueba con mi presupuesto: conjuntos, anuncios por conjunto, presupuesto diario, días mínimos antes de juzgar y reglas para apagar o escalar basadas en mi CPA máximo (calcúlalo con mis números o pídemelos).",
          "Riesgos de rechazo según las políticas de publicidad de Meta (afirmaciones de salud, antes y después, atributos personales), marcados [VERIFICAR en las Políticas de Publicidad de Meta].",
        ],
        salida: "1) Tabla por ángulo con los textos. 2) Estructura de campaña. 3) Reglas de corte. 4) Riesgos [VERIFICAR].",
      }),
    },
    {
      id: "contenido30", tipo: "prompt", etapa: 4, titulo: "Calendario de 30 días de contenido",
      resumen: "Un mes de publicaciones orgánicas con ideas, ganchos y plan de grabación.",
      partes: (p) => ({
        rol: "Eres un estratega de contenido orgánico para marcas pequeñas de e-commerce.",
        campos: ["tienda", "nicho", "producto", "publico", "tono", "canales"],
        tarea: `Arma un calendario de 30 días de contenido para ${M.valor(p, "canales")}.`,
        pasos: [
          "Mezcla aproximada (OPINIÓN, ajustable): 40 % educar o entretener, 30 % mostrar el producto en uso, 20 % prueba social real y 10 % oferta.",
          "Para cada día: red, formato (video, carrusel, historia), idea, gancho y llamado a la acción.",
          "Plan de grabación por lotes: qué grabar en una sola sesión semanal.",
          "5 ideas de contenido que inviten a comentar (para conocer las dudas del público).",
        ],
        salida: "Tabla: Día | Red | Formato | Idea | Gancho | Llamado a la acción. Luego el plan de grabación.",
        reglasExtra: ["La prueba social debe ser real: si aún no hay clientes, reemplázala por demostraciones."],
      }),
    },
    {
      id: "emails", tipo: "prompt", etapa: 4, titulo: "Correos automáticos",
      resumen: "Bienvenida, carrito abandonado, post-compra y recuperación, listos para cargar.",
      partes: (p) => ({
        rol: "Eres un especialista en email marketing para e-commerce.",
        campos: ["tienda", "producto", "pais", "publico", "plataforma", "tono"],
        tarea: "Escribe mis secuencias de correos automáticos.",
        pasos: [
          "Bienvenida (3 correos), carrito abandonado (3), post-compra (3: confirmación y qué esperar del envío, seguimiento y uso del producto, pedir reseña) y recuperación de clientes inactivos (2).",
          "Para cada correo: cuándo se envía, 3 asuntos, texto de vista previa, cuerpo y botón.",
          "En post-compra, explica con honestidad los plazos de envío reales.",
        ],
        salida: "Una tabla por secuencia y luego el texto completo de cada correo.",
        reglasExtra: ["Solo enviar marketing a quien dio su consentimiento, con opción visible para darse de baja.", "Descuentos: deja [COMPLETAR] el monto; no lo decidas tú."],
      }),
    },
    {
      id: "skill-creativos", tipo: "skill", etapa: 4, titulo: "Creador de videos y UGC",
      resumen: "Skill que genera ganchos, guiones y briefs de video cuando los pidas.",
      ejemplo: "Dame 5 ganchos y un guion de 20 segundos para un Reel",
      partes: (p) => ({
        base: "creador-videos",
        titulo: "Creador de videos y UGC",
        descripcion: `Crea ganchos, guiones y briefs de video para TikTok, Reels y anuncios de ${marca(p)}. Úsalo al pedir ideas de contenido, guiones o variantes de un video.`,
        rol: "Eres el director creativo de video de la tienda. Piensas en los primeros 3 segundos y en que el producto se entienda sin sonido.",
        campos: ["tienda", "producto", "publico", "tono", "canales"],
        cuandoUsar: ["Se necesitan ideas, ganchos o guiones de video.", "Hay que preparar un brief para un creador UGC.", "Un video no funcionó y hay que hacer variantes."],
        flujo: [
          "Aclara el objetivo (orgánico o anuncio), el producto, el ángulo y la red.",
          "Genera 5 a 10 ganchos de tipos distintos.",
          "Escribe el guion en tabla con tiempos.",
          "Agrega instrucciones de grabación con celular.",
          "Propón 3 variantes para probar (cambiando solo el gancho, o solo el ángulo).",
        ],
        conocimiento: [
          "### Estructura base (15–30 s)\n" + M.lista(["0–3 s: gancho (problema, resultado o sorpresa).", "3–8 s: el problema o el deseo.", "8–20 s: demostración del producto.", "20–25 s: beneficio o prueba real.", "Final: llamado a la acción."]),
          "### Tipos de gancho\n" + M.lista(["Problema: «¿Te pasa que…?»", "Resultado: mostrar el final primero.", "Curiosidad: «No sabía que esto existía».", "Objeción: «Pensé que era una estafa, pero…» (solo si es una experiencia real).", "Comparación: con la forma antigua de hacerlo.", "POV: escena desde el punto de vista del cliente."]),
          "### Brief para creador UGC\n" + M.lista(["Objetivo y mensaje principal.", "Tomas obligatorias.", "Lo que no se debe decir (promesas, comparaciones con marcas).", "Formato vertical 9:16 y duración.", "Derechos de uso del video acordados por escrito."]),
        ].join("\n\n"),
        salida: "Tabla: Tiempo | Imagen | Texto en pantalla | Voz, más instrucciones de grabación y variantes.",
        reglasExtra: ["Audio propio o con licencia comercial.", "Nada de testimonios inventados."],
        ejemplos: ["Necesito 10 ganchos para el producto estrella", "Haz un brief para una creadora UGC", "Este video tuvo poca retención, dame variantes"],
      }),
    },
    {
      id: "loop-anuncios", tipo: "loop", etapa: 4, titulo: "Testear anuncios y escalar ganadores",
      resumen: "Pegas tus métricas cada día; la IA decide apagar, mantener o escalar.",
      maxCiclos: 10, intervalo: "1d",
      partes: (p) => ({
        rol: "Eres un media buyer prudente: proteges el presupuesto y decides con datos, no con intuición.",
        campos: ["tienda", "producto", "moneda"],
        contextoExtra: numeros(p) + "\n\nFórmulas:\n" + FORMULAS,
        objetivo: "Encontrar anuncios ganadores y repartir el presupuesto según resultados reales, sin perder dinero.",
        entradas: "Antes del ciclo 1, calcula mi ROAS de equilibrio y mi CPA máximo con mis números (o pídemelos). En cada ciclo te pegaré, por anuncio: gasto, impresiones, clics, compras, valor de las compras y días activo.",
        pasos: [
          "Calcula por anuncio: CTR, CPC, CPA y ROAS, solo con mis datos.",
          "Clasifica con estas reglas de partida (heurísticas; cámbialas si te doy otras): APAGAR si gastó 1,5 veces el CPA máximo sin ventas, o si después de 3 días su CPA supera el CPA máximo; MANTENER si está cerca del equilibrio; ESCALAR (subir el presupuesto 20 % cada 2 a 3 días) si su ROAS supera el de equilibrio 3 días seguidos.",
          "Describe qué tienen en común los anuncios que mejor funcionan (gancho, ángulo, formato).",
          "Propón 3 variantes nuevas del ángulo ganador para el siguiente ciclo.",
          "Propón cómo repartir el presupuesto del siguiente período sin superar mi presupuesto mensual.",
        ],
        tabla: ["Ciclo", "Anuncio", "Gasto", "CTR", "CPA", "ROAS", "Decisión", "Motivo"],
        meta: "Al menos 1 anuncio con ROAS sobre el de equilibrio durante 7 días seguidos, o presupuesto de prueba agotado (en ese caso, recomienda cambiar de ángulo o de producto).",
      }),
      comando: (p) => `Analiza los anuncios de la tienda ${marca(p)}. Si tienes un conector de anuncios activo, úsalo para leer los resultados de las últimas 24 horas; si no, lee el archivo metricas-anuncios.csv de esta carpeta (gasto, impresiones, clics, compras y valor por anuncio). Calcula CTR, CPC, CPA y ROAS con esos datos y compáralos con mi ROAS de equilibrio (precio ${M.dinero(p, "precioVenta")}, costo ${M.dinero(p, "costoProducto")}, envío ${M.dinero(p, "costoEnvio")}). Clasifica cada anuncio en APAGAR, MANTENER o ESCALAR con reglas heurísticas prudentes y explica el motivo. Agrega una fila por anuncio a decisiones-anuncios.md. No cambies presupuestos ni apagues anuncios: solo recomienda. No inventes datos: si falta alguno, anótalo como [VERIFICAR].`,
    },

    // ---- 5. Operar y crecer ---------------------------------------------------
    {
      id: "atencion", tipo: "prompt", etapa: 5, titulo: "Respuestas de atención al cliente",
      resumen: "20 respuestas tipo para las situaciones más comunes, con tu tono de marca.",
      partes: (p) => ({
        rol: "Eres el jefe de atención al cliente de una tienda online: empático, claro y honesto.",
        campos: ["tienda", "producto", "pais", "proveedor", "tono"],
        contextoExtra: "Mis políticas (envío, cambios, devoluciones y plazos): [pégalas aquí]",
        tarea: "Crea mis respuestas tipo de atención al cliente.",
        pasos: [
          "20 respuestas para: ¿dónde está mi pedido?, atraso de envío, producto dañado, producto distinto al pedido, quiero devolverlo, quiero cambiarlo, cancelar antes del despacho, pago rechazado, cupón que no funciona, medidas o tallas, dudas antes de comprar, reclamo público en redes, cliente enojado, reseña negativa, pedido incompleto, pedir una reseña, dirección equivocada, cobro de impuestos o aduana (si aplica), reembolso en proceso y consulta por mayor.",
          "Usa variables como {nombre}, {numero_pedido} y {link_seguimiento}.",
          "Versión corta para WhatsApp o Instagram y versión para correo.",
          "Protocolo de escalamiento: qué casos debo atender yo personalmente y tiempos de respuesta recomendados.",
        ],
        salida: "Tabla: Situación | Respuesta corta | Respuesta por correo. Luego el protocolo.",
        reglasExtra: ["Nunca prometas fechas que no controlo: da rangos reales.", "Si el envío viene del extranjero, no lo ocultes.", "Lo que dependa de una decisión mía (reembolsos, regalos) márcalo [CONFIRMAR CON EL DUEÑO]."],
      }),
    },
    {
      id: "skill-soporte", tipo: "skill", etapa: 5, titulo: "Agente de atención al cliente",
      resumen: "Skill que responde a cada cliente con tus políticas y tu tono.",
      ejemplo: "Responde a este cliente: «hace 20 días compré y no me llega nada»",
      partes: (p) => ({
        base: "atencion-cliente",
        titulo: `Atención al cliente de ${marca(p)}`,
        descripcion: `Responde mensajes de clientes de ${marca(p)} (pedidos, envíos, cambios, reclamos) con el tono y las políticas de la tienda. Úsalo al pegar un mensaje de un cliente.`,
        rol: "Eres el agente de atención al cliente de la tienda. Calmas, informas con datos concretos y propones el siguiente paso.",
        campos: ["tienda", "producto", "pais", "proveedor", "tono"],
        cuandoUsar: ["El usuario pega un mensaje, correo o comentario de un cliente.", "Hay que responder una reseña o un reclamo público."],
        flujo: [
          "Clasifica el mensaje (consulta, pedido, problema, reclamo) y la emoción del cliente.",
          "Si es un caso para escalar, dilo primero.",
          "Identifica los datos que faltan (número de pedido, fotos) y pídelos en la respuesta.",
          "Redacta la respuesta en el formato del canal (máximo 80 palabras en chat).",
          "Indica la acción interna que debe hacer el dueño (revisar seguimiento, contactar al proveedor, etc.).",
        ],
        conocimiento: [
          "### Políticas de la tienda\n[COMPLETAR: pega aquí tu política de envíos, cambios y devoluciones, con plazos.]",
          "### Estructura de cada respuesta\n" + M.numerada(["Saludo con el nombre y empatía en una frase.", "El dato concreto (estado, plazo, política).", "El siguiente paso y quién lo hace.", "Plazo de la próxima respuesta."]),
          "### Escalar al dueño cuando\n" + M.lista(["Se pide un reembolso o una excepción a la política.", "Hay amenaza de reclamo legal o ante el organismo de consumidores.", "El reclamo es público en redes.", "Hay insultos o el cliente escribe por tercera vez por lo mismo."]),
        ].join("\n\n"),
        salida: "Tipo y urgencia · Respuesta lista para enviar · Acción interna · [VERIFICAR] o [CONFIRMAR CON EL DUEÑO].",
        reglasExtra: ["Nunca prometas fechas que la tienda no controla.", "No ofrezcas reembolsos ni regalos sin autorización del dueño."],
        ejemplos: ["Responde a este cliente enojado", "¿Qué le digo a alguien que quiere devolver el producto?", "Contesta esta reseña de 2 estrellas"],
      }),
    },
    {
      id: "metricas", tipo: "prompt", etapa: 5, titulo: "Diagnosticar mis métricas",
      resumen: "Embudo, cuello de botella y 3 experimentos priorizados.",
      partes: (p) => ({
        rol: "Eres un analista de crecimiento para e-commerce. Diagnosticas con datos y propones experimentos pequeños.",
        campos: ["tienda", "producto", "moneda", "plataforma"],
        contextoExtra: numeros(p) + "\nMis métricas del período [indica las fechas]: [pega aquí sesiones, agregados al carro, pagos iniciados, compras, ventas totales, gasto en anuncios, impresiones, clics y devoluciones]\n\nFórmulas:\n" + FORMULAS,
        tarea: "Diagnostica el rendimiento de mi tienda y dime qué mejorar primero.",
        pasos: [
          "Calcula el embudo: CTR, % que agrega al carro, % que inicia el pago, conversión, ticket promedio, CPA, ROAS y ganancia neta estimada con mis costos.",
          "Compara contra MIS números de equilibrio. No uses «promedios de la industria» salvo que cites la fuente.",
          "Encuentra el cuello de botella principal (dónde se pierde más gente) y da 3 hipótesis de por qué.",
          "Propón 3 experimentos priorizados por impacto y esfuerzo, cada uno con métrica de éxito y duración.",
          "Dime qué NO tocar todavía, para no cambiar muchas cosas a la vez.",
        ],
        salida: "1) Tabla de KPI con semáforo. 2) Cuello de botella. 3) Experimentos. 4) Qué no tocar. 5) Datos que faltan [VERIFICAR].",
      }),
    },
    {
      id: "skill-analista", tipo: "skill", etapa: 5, titulo: "Analista de métricas",
      resumen: "Skill que lee tus reportes, calcula KPI y propone experimentos.",
      ejemplo: "Analiza estas métricas de la semana: [pega los números]",
      partes: (p) => ({
        base: "analista-metricas",
        titulo: "Analista de métricas de la tienda",
        descripcion: `Analiza ventas, embudo y anuncios de ${marca(p)}: calcula CPA, ROAS y margen, encuentra el cuello de botella y propone experimentos. Úsalo al pegar métricas o reportes.`,
        rol: "Eres el analista de datos de la tienda. Calculas con precisión, distingues datos de suposiciones y recomiendas pocas acciones bien elegidas.",
        campos: ["tienda", "producto", "moneda", "plataforma", "presupuesto", "precioVenta", "costoProducto", "costoEnvio"],
        cuandoUsar: ["El usuario pega métricas, un reporte o una captura de su tienda o de sus anuncios.", "El usuario pregunta si está ganando o perdiendo dinero."],
        flujo: [
          "Revisa que los datos sean coherentes (mismo período, sumas que cuadran). Si algo no cuadra, dilo antes de calcular.",
          "Calcula los KPI con las fórmulas de referencia.",
          "Compara contra el ROAS de equilibrio y el CPA máximo de la tienda.",
          "Identifica el cuello de botella del embudo.",
          "Propón máximo 3 acciones o experimentos, con métrica de éxito.",
          "Indica qué vigilar en el próximo reporte.",
        ],
        conocimiento: `### Fórmulas\n${FORMULAS}\n- Ganancia neta = ventas − costo de productos − envíos − comisiones − publicidad − devoluciones\n\n### Reglas de decisión de anuncios (heurísticas, ajustables)\n- Apagar: gastó 1,5 veces el CPA máximo sin ventas, o CPA sobre el máximo después de 3 días.\n- Escalar: ROAS sobre el de equilibrio 3 días seguidos; subir el presupuesto 20 % cada 2 a 3 días.`,
        salida: "Tabla de KPI (valor, equilibrio, semáforo) · Diagnóstico en 3 líneas · Acciones · Qué vigilar · [VERIFICAR].",
        ejemplos: ["¿Estoy ganando plata con esta campaña?", "Analiza el reporte de ventas del mes", "¿Por qué tengo visitas pero no ventas?"],
      }),
    },
    {
      id: "loop-diario", tipo: "loop", etapa: 5, titulo: "Revisión diaria de la tienda",
      resumen: "Cada día: resumen en 5 números, alertas y las 5 tareas más urgentes.",
      maxCiclos: 30, intervalo: "1d",
      partes: (p) => ({
        rol: "Eres el gerente de operaciones de la tienda. Cada día me dices en 2 minutos qué pasó y qué hacer primero.",
        campos: ["tienda", "producto", "proveedor", "moneda"],
        contextoExtra: numeros(p) + "\nPlazo de entrega que prometo al cliente: [COMPLETAR]",
        objetivo: "Que cada día sepa qué pasó en la tienda, qué está en riesgo y qué hacer primero.",
        entradas: "Cada día te pegaré: pedidos nuevos y su estado, pedidos sin seguimiento, mensajes de clientes sin responder, avisos del proveedor (stock, precios) y gasto y ventas de anuncios del día anterior.",
        pasos: [
          "Resume el día anterior en 5 números: pedidos, ventas, gasto en anuncios, ROAS y mensajes pendientes.",
          "Alertas: pedidos que superan el plazo prometido, productos sin stock o con cambio de precio en el proveedor, reclamos y anuncios sobre el CPA máximo.",
          "Lista de máximo 5 tareas para hoy, ordenadas por urgencia, y redacta las respuestas a clientes pendientes.",
          "Compara con los días anteriores (sube ↑, baja ↓, igual =).",
        ],
        tabla: ["Fecha", "Pedidos", "Ventas", "Gasto anuncios", "ROAS", "Pedidos atrasados", "Mensajes pendientes", "Alerta principal"],
        meta: "Este loop se repite a diario. Al llegar al ciclo 30, entrega un resumen mensual con tendencias y 3 mejoras de proceso.",
        resumen: ["Tabla de los 30 días.", "Tendencias de ventas, gasto y ROAS.", "3 mejoras de proceso para el próximo mes.", "Lista de [VERIFICAR]."],
        inicio: "Empieza ahora: si falta algún dato [COMPLETAR], pregúntamelo; luego pídeme los datos del día para el ciclo 1.",
      }),
      comando: (p) => `Haz la revisión diaria de la tienda ${marca(p)}. Si tienes el conector de Shopify u otro de la tienda activo, lee los pedidos y mensajes de las últimas 24 horas; si no, lee los archivos pedidos.csv y mensajes.csv de esta carpeta. Entrega: 1) el día en 5 números (pedidos, ventas, gasto en anuncios, ROAS, mensajes pendientes); 2) alertas: pedidos atrasados respecto del plazo prometido, productos sin stock, reclamos y anuncios sobre el CPA máximo (precio ${M.dinero(p, "precioVenta")}, costo ${M.dinero(p, "costoProducto")}, envío ${M.dinero(p, "costoEnvio")}); 3) máximo 5 tareas para hoy por urgencia. Agrega el resumen al final de revision-diaria.md. No envíes mensajes, no cambies precios ni publiques nada: solo informa. No inventes datos: lo que falte, márcalo [VERIFICAR].`,
    },
  ];

  // ===========================================================================
  // Generación de variantes listas para copiar o descargar.

  const NOMBRE_IA = { Claude: "Claude", ChatGPT: "ChatGPT", Gemini: "Gemini" };
  const INTERVALOS = ["1h", "6h", "12h", "1d"];
  const INTERVALO_TEXTO = { "1h": "1 hora", "6h": "6 horas", "12h": "12 horas", "1d": "1 día" };

  function nombreIA(p) { return NOMBRE_IA[p.ia] || "tu IA"; }

  function buscar(id) { return PLANTILLAS.find((t) => t.id === id); }

  // opciones: { maxCiclos, intervalo }
  function generar(plantilla, perfil, opciones) {
    const p = perfil || {};
    const o = opciones || {};
    const ia = nombreIA(p);
    const archivoBase = M.slug(plantilla.titulo);

    if (plantilla.tipo === "prompt") {
      return {
        variantes: [{
          id: "chat", etiqueta: "Para el chat", texto: M.armarPrompt(p, plantilla.partes(p)), archivo: `${archivoBase}.md`,
          pasos: ["Pulsa «Copiar».", `Abre ${ia} y pégalo en un chat nuevo.`, "Responde las preguntas que te haga. Antes de publicar o gastar dinero, revisa todo lo marcado [VERIFICAR]."],
        }],
      };
    }

    if (plantilla.tipo === "loop") {
      const max = Math.max(1, Math.round(Number(o.maxCiclos) || plantilla.maxCiclos || 5));
      const variantes = [{
        id: "chat", etiqueta: "Para el chat", texto: M.armarLoop(p, { ...plantilla.partes(p), maxCiclos: max }), archivo: `loop-${archivoBase}.md`,
        pasos: [`Copia el texto y pégalo en un chat nuevo de ${ia}.`, "La IA hará el ciclo 1 y se detendrá. Escribe CONTINUAR (o pega datos nuevos) para el siguiente ciclo.", `Termina sola al cumplir la meta o al llegar a ${max} ciclos, con un resumen final.`],
      }];
      if (plantilla.comando) {
        const intervalo = INTERVALOS.includes(o.intervalo) ? o.intervalo : plantilla.intervalo;
        variantes.push({
          id: "code", etiqueta: "Claude Code (/loop)", texto: M.armarComandoLoop(intervalo, plantilla.comando(p)), archivo: `loop-${archivoBase}-claude-code.txt`,
          pasos: ["Abre Claude Code en la carpeta de tu tienda (donde guardarás los archivos .csv y .md que menciona el comando).", `Pega el comando y presiona Enter: se repetirá cada ${INTERVALO_TEXTO[intervalo]}.`, "Según la documentación de Claude Code, la repetición funciona solo mientras la sesión esté abierta y vence a los 7 días; después, vuelve a pegar el comando."],
        });
      }
      return { variantes, max };
    }

    // skill
    const s = M.armarSkill(p, plantilla.partes(p));
    const zip = () => M.crearZip([{ ruta: `${s.nombre}/SKILL.md`, contenido: s.skillMd }]);
    const claude = {
      id: "claude", etiqueta: "Claude (SKILL.md)", texto: s.skillMd, archivo: `${s.nombre}.zip`, zip,
      pasos: [
        "Pulsa «Descargar ZIP» (no lo descomprimas).",
        "En claude.ai entra a Personalizar → Skills → «+» → Crear skill → Subir un skill, y elige el ZIP. Requiere tener activada la ejecución de código (Configuración → Capacidades). Los nombres de menú son los del centro de ayuda de Claude y pueden cambiar.",
        `En un chat nuevo pide algo como: «${plantilla.ejemplo}». Claude usará el skill cuando corresponda.`,
        `En Claude Code: descomprime el ZIP dentro de ~/.claude/skills/ (queda ~/.claude/skills/${s.nombre}/SKILL.md).`,
      ],
    };
    const otras = {
      id: "otras", etiqueta: "ChatGPT / Gemini / otras", texto: s.otrasIA, archivo: `${s.nombre}-instrucciones.md`,
      pasos: [
        "Pulsa «Copiar».",
        "En ChatGPT, pégalo en las instrucciones de un GPT personalizado o de un Proyecto. En Gemini, en las instrucciones de un Gem. En otras IA, al inicio de la conversación.",
        `Úsalo desde ahí cada vez que lo necesites, por ejemplo: «${plantilla.ejemplo}».`,
      ],
    };
    return { variantes: p.ia === "Claude" || !p.ia ? [claude, otras] : [otras, claude], skill: s };
  }

  // ---- Kit completo -------------------------------------------------------------

  function armarKit(perfil) {
    const p = perfil || {};
    const raiz = `kit-ia-${M.slug(p.tienda) || "mi-tienda"}`;
    const archivos = [];
    const indice = [];
    const contadores = { prompt: 0, skill: 0, loop: 0 };
    const carpetas = { prompt: "1-prompts", skill: "2-skills", loop: "3-loops" };

    for (const etapa of ETAPAS) {
      indice.push(`\n## ${etapa.icono} Etapa ${etapa.n}: ${etapa.titulo}\n`);
      for (const t of PLANTILLAS.filter((x) => x.etapa === etapa.n)) {
        const g = generar(t, p);
        const n = String(++contadores[t.tipo]).padStart(2, "0");
        const carpeta = `${raiz}/${carpetas[t.tipo]}`;
        if (t.tipo === "skill") {
          archivos.push({ ruta: `${carpeta}/${g.skill.nombre}.zip`, contenido: M.crearZip([{ ruta: `${g.skill.nombre}/SKILL.md`, contenido: g.skill.skillMd }]) });
          archivos.push({ ruta: `${carpeta}/${g.skill.nombre}/SKILL.md`, contenido: g.skill.skillMd });
          archivos.push({ ruta: `${carpeta}/otras-ia/${g.skill.nombre}.md`, contenido: g.skill.otrasIA });
          indice.push(`- 🧩 **${t.titulo}** — ${t.resumen} → \`${carpetas.skill}/${g.skill.nombre}.zip\``);
        } else {
          const nombre = `${n}-${M.slug(t.titulo)}.md`;
          let texto = g.variantes[0].texto;
          const code = g.variantes.find((v) => v.id === "code");
          if (code) texto += `\n\n---\n\n## Versión para Claude Code\n\nPega este comando en Claude Code (se repite cada ${INTERVALO_TEXTO[t.intervalo]} mientras la sesión esté abierta; vence a los 7 días):\n\n\`\`\`\n${code.texto.trim()}\n\`\`\`\n`;
          archivos.push({ ruta: `${carpeta}/${nombre}`, contenido: texto });
          indice.push(`- ${TIPOS[t.tipo].icono} **${t.titulo}** — ${t.resumen} → \`${carpetas[t.tipo]}/${nombre}\``);
        }
      }
    }

    const leeme = [
      `# Kit de IA para ${M.tiene(p, "tienda") ? p.tienda : "mi tienda"}`,
      "Generado con el Asistente IA Dropshipping. Úsalo en este orden: es la ruta de lanzamiento de una tienda.",
      "",
      "## Qué hay en cada carpeta",
      M.lista([
        "`1-prompts/`: instrucciones para una tarea puntual. Abre el archivo, copia todo y pégalo en un chat nuevo de tu IA.",
        "`2-skills/`: asistentes expertos. Para claude.ai sube el `.zip` (Personalizar → Skills → «+» → Crear skill → Subir un skill; requiere la ejecución de código activada). Para Claude Code copia la carpeta del skill a `~/.claude/skills/`. Para ChatGPT o Gemini usa `otras-ia/`.",
        "`3-loops/`: procesos por ciclos. Pégalo en un chat y escribe CONTINUAR al final de cada ciclo. Algunos traen al final una versión para Claude Code (`/loop`).",
      ]),
      "",
      "## Antes de usar lo que genere la IA",
      M.lista([
        "Todo lo marcado [COMPLETAR] es un dato tuyo que faltaba al crear el kit: la IA te lo preguntará.",
        "Todo lo marcado [VERIFICAR] debe revisarse en una fuente confiable antes de publicar, gastar dinero o usarlo con clientes.",
        "Políticas y textos legales: son borradores. Revísalos con un abogado de tu país.",
      ]),
      "",
      "# Ruta paso a paso",
      ...indice,
      "",
    ].join("\n");
    archivos.unshift({ ruta: `${raiz}/LEEME.md`, contenido: leeme });
    return { nombre: `${raiz}.zip`, archivos };
  }

  const api = { ETAPAS, TIPOS, PLANTILLAS, INTERVALOS, CHECKLIST, RUBRICA, FORMULAS, buscar, generar, armarKit };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.Plantillas = api;
})(typeof window !== "undefined" ? window : globalThis);
