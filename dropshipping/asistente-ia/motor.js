// Motor del Asistente IA Dropshipping: perfil de la tienda, armado de prompts
// (XML para Claude, Markdown para otras IA), skills (SKILL.md), loops y ZIP.
// Sin dependencias: funciona en el navegador y en Node (para las pruebas).
(function (global) {
  "use strict";

  // ---- Perfil de la tienda ------------------------------------------------

  const CAMPOS = [
    { id: "tienda", etiqueta: "nombre de la tienda" },
    { id: "nicho", etiqueta: "qué vende la tienda (nicho)" },
    { id: "producto", etiqueta: "producto estrella" },
    { id: "pais", etiqueta: "país donde vende" },
    { id: "moneda", etiqueta: "moneda" },
    { id: "publico", etiqueta: "público objetivo" },
    { id: "plataforma", etiqueta: "plataforma de la tienda" },
    { id: "proveedor", etiqueta: "proveedor" },
    { id: "tono", etiqueta: "tono de la marca" },
    { id: "experiencia", etiqueta: "experiencia del dueño" },
    { id: "canales", etiqueta: "redes donde venderá" },
    { id: "presupuesto", etiqueta: "presupuesto mensual de anuncios" },
    { id: "precioVenta", etiqueta: "precio de venta" },
    { id: "costoProducto", etiqueta: "costo del producto" },
    { id: "costoEnvio", etiqueta: "costo de envío" },
    { id: "ia", etiqueta: "IA que usa" },
  ];

  const MONEDAS = {
    "chile": "CLP", "méxico": "MXN", "mexico": "MXN", "colombia": "COP", "perú": "PEN", "peru": "PEN",
    "argentina": "ARS", "uruguay": "UYU", "ecuador": "USD", "españa": "EUR", "espana": "EUR",
    "estados unidos": "USD", "eeuu": "USD",
  };

  function monedaDe(pais) {
    return MONEDAS[String(pais || "").trim().toLowerCase()] || "";
  }

  const TONOS = {
    Cercano: "cercano y cálido, de tú, frases cortas, sin tecnicismos",
    Premium: "elegante y sobrio, de tú pero cuidado, pocas exclamaciones, foco en calidad y diseño",
    Divertido: "juvenil y con humor, de tú, uso moderado de emojis, frases muy cortas",
    Experto: "experto y confiable, explica el porqué de cada beneficio con datos que se puedan comprobar",
  };

  // Devuelve el valor del campo o un marcador visible para que la IA lo pregunte.
  function valor(perfil, id) {
    const v = perfil && perfil[id];
    const texto = Array.isArray(v) ? v.join(", ") : String(v == null ? "" : v).trim();
    if (texto) return texto;
    const campo = CAMPOS.find((c) => c.id === id);
    return `[COMPLETAR: ${campo ? campo.etiqueta : id}]`;
  }

  function tiene(perfil, id) {
    return !/^\[COMPLETAR/.test(valor(perfil, id));
  }

  function dinero(perfil, id) {
    const n = Number(perfil && perfil[id]);
    if (!perfil || perfil[id] === "" || perfil[id] == null || !Number.isFinite(n)) return valor(perfil, id);
    const moneda = tiene(perfil, "moneda") ? " " + perfil.moneda : "";
    return n.toLocaleString("es-CL") + moneda;
  }

  // ---- Formato según la IA --------------------------------------------------

  // Claude: la guía oficial de Anthropic recomienda separar las partes del
  // prompt con etiquetas XML. Para el resto se usa Markdown, que todas leen bien.
  function formatoPara(ia) {
    return ia === "Claude" ? "xml" : "md";
  }

  function seccion(fmt, tag, titulo, cuerpo) {
    const texto = Array.isArray(cuerpo) ? cuerpo.filter(Boolean).join("\n") : String(cuerpo || "").trim();
    if (!texto) return "";
    return fmt === "xml" ? `<${tag}>\n${texto}\n</${tag}>` : `## ${titulo}\n${texto}`;
  }

  function lista(items) {
    return items.filter(Boolean).map((t) => `- ${t}`).join("\n");
  }

  function numerada(items) {
    return items.filter(Boolean).map((t, i) => `${i + 1}. ${t}`).join("\n");
  }

  // ---- Bloques comunes ----------------------------------------------------

  function perfilTexto(perfil, ids) {
    const usar = ids || ["tienda", "nicho", "producto", "pais", "moneda", "publico", "plataforma", "proveedor", "tono", "canales"];
    return lista(usar.map((id) => {
      const c = CAMPOS.find((x) => x.id === id);
      const nombre = c.etiqueta.charAt(0).toUpperCase() + c.etiqueta.slice(1);
      const v = ["precioVenta", "costoProducto", "costoEnvio", "presupuesto"].includes(id) ? dinero(perfil, id) : valor(perfil, id);
      const extra = id === "tono" && TONOS[perfil && perfil.tono] ? ` (${TONOS[perfil.tono]})` : "";
      return `${nombre}: ${v}${extra}`;
    }));
  }

  function reglasVeracidad() {
    return lista([
      "No inventes cifras, precios de proveedores, volúmenes de búsqueda, tasas de conversión, testimonios ni datos de mercado. Si no tienes el dato, escribe [VERIFICAR: qué falta] o pregúntamelo.",
      "Marca cada afirmación importante como DATO (con fuente: nombre y enlace), ESTIMACIÓN (explica el supuesto) u OPINIÓN.",
      "Si puedes buscar en internet, hazlo y cita la fuente de cada dato. Si no puedes, dilo al comienzo y trabaja solo con lo que yo te entregue.",
      "Normas legales y de publicidad: menciona solo las que puedas identificar con su número y artículo, y márcalas [VERIFICAR vigencia en fuente oficial]. No inventes leyes.",
      "No copies textos, fotos, videos ni música de otras marcas o vendedores: crea material original.",
      "No prometas resultados ni hagas afirmaciones de salud, seguridad o efectividad que no se puedan comprobar.",
    ]);
  }

  function reglasNivel(perfil) {
    const nivel = perfil && perfil.experiencia;
    if (nivel === "Avanzado") return "Ve al grano: puedo con términos técnicos y fórmulas sin explicación.";
    if (nivel === "Intermedio") return "Usa términos técnicos, pero define en una línea los menos comunes.";
    return "Soy principiante: explica cada término técnico (ROAS, CPA, CTR, conversión, etc.) en una línea la primera vez que lo uses, y dame pasos concretos. Si no estás seguro del nombre exacto de un botón o menú, dilo en vez de inventarlo.";
  }

  function preguntasPrevias() {
    return "Antes de empezar, revisa el contexto: si algún dato dice [COMPLETAR], pregúntamelo. Haz todas tus preguntas juntas (máximo 5) y espera mi respuesta.";
  }

  // ---- Prompt ---------------------------------------------------------------

  function contexto(perfil, partes) {
    return perfilTexto(perfil, partes.campos) + (partes.contextoExtra ? "\n\n" + partes.contextoExtra : "");
  }


  // partes: { rol, tarea, pasos[], salida, reglasExtra[], contextoExtra, cierre }
  function armarPrompt(perfil, partes) {
    const fmt = formatoPara(perfil && perfil.ia);
    const bloques = [
      seccion(fmt, "rol", "Rol", partes.rol),
      seccion(fmt, "contexto", "Contexto de mi tienda", contexto(perfil, partes)),
      seccion(fmt, "tarea", "Tarea", partes.tarea),
      seccion(fmt, "pasos", "Cómo hacerlo", numerada(partes.pasos || [])),
      seccion(fmt, "formato_salida", "Formato de la respuesta", partes.salida),
      seccion(fmt, "reglas", "Reglas", [reglasVeracidad(), lista(partes.reglasExtra || []), "- " + reglasNivel(perfil)]),
      partes.cierre === false ? "" : (partes.cierre || preguntasPrevias()),
    ];
    return bloques.filter(Boolean).join("\n\n") + "\n";
  }

  // ---- Loop -------------------------------------------------------------------

  // partes: { rol, objetivo, entradas, pasos[], tabla[], meta, maxCiclos, inicio, campos, reglasExtra[] }
  function armarLoop(perfil, partes) {
    const fmt = formatoPara(perfil && perfil.ia);
    const max = Math.max(1, Math.round(Number(partes.maxCiclos) || 5));
    const columnas = partes.tabla.join(" | ");
    const mecanica = [
      `Trabajaremos en CICLOS. En cada ciclo haz, en orden:`,
      numerada(partes.pasos),
      "",
      "Al terminar cada ciclo:",
      lista([
        `Muestra la TABLA DE ESTADO acumulada (todas las filas de ciclos anteriores + las nuevas) con estas columnas: ${columnas}.`,
        "Escribe en 1 línea qué aprendiste en este ciclo y qué cambiarás en el siguiente.",
        "Revisa la META. Si no se cumplió y no llegamos al máximo de ciclos, termina tu mensaje con: «➡️ Escribe CONTINUAR (o pégame datos nuevos) para el ciclo N». Luego espera.",
        "Si se cumplió la meta o llegamos al máximo, entrega el RESUMEN FINAL.",
      ]),
    ].join("\n");
    const bloques = [
      seccion(fmt, "rol", "Rol", partes.rol),
      seccion(fmt, "contexto", "Contexto de mi tienda", contexto(perfil, partes)),
      seccion(fmt, "objetivo", "Objetivo del loop", partes.objetivo),
      partes.entradas ? seccion(fmt, "entradas", "Lo que yo te entregaré", partes.entradas) : "",
      seccion(fmt, "mecanica_del_loop", "Cómo funciona el loop", mecanica),
      seccion(fmt, "meta", "Meta (condición para terminar)", [
        partes.meta,
        `Límite: máximo ${max} ciclos. Si en 2 ciclos seguidos no hay avance, detente y explícame qué falta en vez de seguir dando vueltas.`,
      ]),
      seccion(fmt, "resumen_final", "Resumen final", lista(partes.resumen || [
        "Tabla de estado completa.",
        "Decisión recomendada y por qué (separando DATO, ESTIMACIÓN y OPINIÓN).",
        "Próximos 3 pasos concretos.",
        "Lista de todo lo marcado [VERIFICAR] que debo revisar antes de actuar.",
      ])),
      seccion(fmt, "reglas", "Reglas", [
        reglasVeracidad(),
        "- Nunca gastes dinero, publiques, compres ni contactes a nadie en mi nombre: tú propones, yo decido y ejecuto.",
        lista(partes.reglasExtra || []),
        "- " + reglasNivel(perfil),
      ]),
      partes.inicio || "Empieza ahora: si falta algún dato [COMPLETAR], pregúntamelo primero; si no, ejecuta el ciclo 1.",
    ];
    return bloques.filter(Boolean).join("\n\n") + "\n";
  }

  // Versión para Claude Code: un solo comando /loop. Según la documentación de
  // Claude Code (code.claude.com/docs/en/scheduled-tasks): unidades s, m, h, d;
  // la tarea vive mientras la sesión está abierta y vence a los 7 días.
  function armarComandoLoop(intervalo, instruccion) {
    const limpio = String(instruccion).replace(/\s+/g, " ").trim();
    return `/loop ${intervalo} ${limpio}\n`;
  }

  // ---- Skill ------------------------------------------------------------------

  const RESERVADAS = ["anthropic", "claude"];
  const MAX_NOMBRE = 64;
  // La ayuda de claude.ai indica 200 caracteres para la descripción; la
  // documentación de la plataforma, 1.024. Se usa el límite más estricto.
  const MAX_DESCRIPCION = 200;

  function slug(texto) {
    return String(texto || "")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  // Nombre válido para un skill: minúsculas, números y guiones; máx. 64; sin
  // las palabras reservadas "anthropic" ni "claude".
  function nombreSkill(base, tienda) {
    const partes = [slug(base), slug(tienda)].filter(Boolean).join("-");
    let nombre = partes.split("-").filter((p) => p && !RESERVADAS.includes(p)).join("-");
    if (nombre.length > MAX_NOMBRE) nombre = nombre.slice(0, MAX_NOMBRE).replace(/-+[^-]*$/, "") || nombre.slice(0, MAX_NOMBRE);
    return nombre.replace(/-+$/, "") || "skill-dropshipping";
  }

  function recortar(texto, max) {
    const t = String(texto).replace(/\s+/g, " ").trim();
    if (t.length <= max) return t;
    const corte = t.slice(0, max - 1);
    return corte.slice(0, corte.lastIndexOf(" ")).replace(/[,;:.]$/, "") + "…";
  }

  function yaml(texto) {
    return '"' + String(texto).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }

  // partes: { base, titulo, descripcion, rol, cuandoUsar[], flujo[], salida, conocimiento, ejemplos[], reglasExtra[], campos }
  function armarSkill(perfil, partes) {
    const nombre = nombreSkill(partes.base, perfil && perfil.tienda);
    const descripcion = recortar(partes.descripcion, MAX_DESCRIPCION);
    const cuerpo = [
      `# ${partes.titulo}`,
      partes.rol,
      `## Contexto de la tienda\n${perfilTexto(perfil, partes.campos)}\nSi un dato dice [COMPLETAR], pídeselo al usuario antes de usarlo.`,
      `## Cuándo usar este skill\n${lista(partes.cuandoUsar)}`,
      `## Flujo de trabajo\n${numerada(partes.flujo)}`,
      partes.conocimiento ? `## Conocimiento de referencia\n${partes.conocimiento}` : "",
      `## Formato de salida\n${partes.salida}`,
      `## Reglas\n${reglasVeracidad()}\n${lista(partes.reglasExtra || [])}\n- ${reglasNivel(perfil)}`.replace(/\n\n/g, "\n"),
      partes.ejemplos && partes.ejemplos.length ? `## Ejemplos de pedidos que activan este skill\n${lista(partes.ejemplos.map((e) => `«${e}»`))}` : "",
    ].filter(Boolean).join("\n\n");
    const skillMd = `---\nname: ${nombre}\ndescription: ${yaml(descripcion)}\n---\n\n${cuerpo}\n`;
    const otrasIA = `# Instrucciones del asistente: ${partes.titulo}\n\n${partes.descripcion}\n\n${cuerpo.replace(/^# .*\n\n/, "")}\n`;
    return { nombre, descripcion, skillMd, otrasIA };
  }

  // ---- ZIP (sin compresión) -------------------------------------------------

  let tablaCRC = null;
  function crc32(bytes) {
    if (!tablaCRC) {
      tablaCRC = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        tablaCRC[n] = c >>> 0;
      }
    }
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) crc = tablaCRC[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function aBytes(contenido) {
    return contenido instanceof Uint8Array ? contenido : new TextEncoder().encode(String(contenido));
  }

  // archivos: [{ ruta: "carpeta/archivo.md", contenido: string | Uint8Array }]
  // Agrega las entradas de carpeta que falten. Nombres en UTF-8 (bit 11).
  function crearZip(archivos, fecha) {
    const d = fecha || new Date();
    const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    const dia = ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();

    const entradas = [];
    const carpetas = new Set();
    for (const a of archivos) {
      const partes = a.ruta.split("/");
      for (let i = 1; i < partes.length; i++) {
        const carpeta = partes.slice(0, i).join("/") + "/";
        if (!carpetas.has(carpeta)) { carpetas.add(carpeta); entradas.push({ ruta: carpeta, datos: new Uint8Array(0), carpeta: true }); }
      }
      entradas.push({ ruta: a.ruta, datos: aBytes(a.contenido), carpeta: false });
    }

    const locales = [];
    const centrales = [];
    let offset = 0;
    for (const e of entradas) {
      const nombre = new TextEncoder().encode(e.ruta);
      const crc = crc32(e.datos);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true);
      local.setUint16(8, 0, true);
      local.setUint16(10, hora, true);
      local.setUint16(12, dia, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, e.datos.length, true);
      local.setUint32(22, e.datos.length, true);
      local.setUint16(26, nombre.length, true);
      local.setUint16(28, 0, true);
      locales.push(new Uint8Array(local.buffer), nombre, e.datos);

      const central = new DataView(new ArrayBuffer(46));
      central.setUint32(0, 0x02014b50, true);
      central.setUint16(4, 20, true);
      central.setUint16(6, 20, true);
      central.setUint16(8, 0x0800, true);
      central.setUint16(10, 0, true);
      central.setUint16(12, hora, true);
      central.setUint16(14, dia, true);
      central.setUint32(16, crc, true);
      central.setUint32(20, e.datos.length, true);
      central.setUint32(24, e.datos.length, true);
      central.setUint16(28, nombre.length, true);
      central.setUint32(38, e.carpeta ? 0x10 : 0, true);
      central.setUint32(42, offset, true);
      centrales.push(new Uint8Array(central.buffer), nombre);

      offset += 30 + nombre.length + e.datos.length;
    }

    const tamCentral = centrales.reduce((s, b) => s + b.length, 0);
    const fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true);
    fin.setUint16(8, entradas.length, true);
    fin.setUint16(10, entradas.length, true);
    fin.setUint32(12, tamCentral, true);
    fin.setUint32(16, offset, true);

    const partes = [...locales, ...centrales, new Uint8Array(fin.buffer)];
    const total = partes.reduce((s, b) => s + b.length, 0);
    const salida = new Uint8Array(total);
    let pos = 0;
    for (const b of partes) { salida.set(b, pos); pos += b.length; }
    return salida;
  }

  const api = {
    CAMPOS, TONOS, MAX_NOMBRE, MAX_DESCRIPCION, monedaDe, valor, tiene, dinero, formatoPara, seccion, lista, numerada,
    perfilTexto, reglasVeracidad, reglasNivel, armarPrompt, armarLoop, armarComandoLoop, slug, nombreSkill, recortar,
    armarSkill, crc32, crearZip,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.Motor = api;
})(typeof window !== "undefined" ? window : globalThis);
