// Lógica del asistente de constitución de empresas: reglas por tipo de
// empresa, RUT chileno, razón social, validación de cada paso, plan de firma,
// presupuesto y texto de la solicitud.
//
// Las reglas legales de TIPOS están respaldadas en README.md (sección
// "Fuentes y verificación"). Si una norma cambia, se corrige solo aquí.
//
// Funciona en el navegador (window.Logica) y en Node (module.exports) para
// poder probarla con `node tests/logica.test.js`.

(function (global) {
  "use strict";

  const TIPOS = {
    SPA: {
      id: "SPA",
      nombre: "Sociedad por Acciones",
      corto: "SpA",
      sufijo: "SpA",
      minSocios: 1,
      maxSocios: null,
      admiteJuridicas: true,
      socio: "accionista",
      socios: "accionistas",
      quien: "Una o más personas, naturales o jurídicas.",
      regla: "El nombre debe terminar en «SpA» (Código de Comercio, art. 425 N° 1).",
    },
    EIRL: {
      id: "EIRL",
      nombre: "Empresa Individual de Responsabilidad Limitada",
      corto: "E.I.R.L.",
      sufijo: "E.I.R.L.",
      minSocios: 1,
      maxSocios: 1,
      admiteJuridicas: false,
      socio: "titular",
      socios: "titular",
      quien: "Una sola persona natural.",
      regla:
        "El nombre debe contener, al menos, el nombre y apellido del titular y terminar en «E.I.R.L.» (Ley N° 19.857, art. 4 letra b).",
    },
    LTDA: {
      id: "LTDA",
      nombre: "Sociedad de Responsabilidad Limitada",
      corto: "Ltda.",
      sufijo: "Limitada",
      minSocios: 2,
      maxSocios: 50,
      admiteJuridicas: true,
      socio: "socio",
      socios: "socios",
      quien: "De 2 a 50 socios (Ley N° 3.918, art. 2).",
      regla: "La razón social debe terminar con la palabra «limitada» (Ley N° 3.918, art. 4).",
    },
  };

  // Orden de los pasos del asistente. Los socios van antes que los datos de
  // la empresa porque el nombre de una EIRL depende del titular.
  const PASOS = [
    { id: "tipo", titulo: "Tipo de empresa" },
    { id: "socios", titulo: "Socios" },
    { id: "empresa", titulo: "Datos de la empresa" },
    { id: "admin", titulo: "Administración" },
    { id: "extras", titulo: "Servicios adicionales" },
    { id: "resumen", titulo: "Revisar y enviar" },
  ];

  // ---------------------------------------------------------------- RUT ---

  function limpiarRut(rut) {
    return String(rut || "").replace(/[^0-9kK]/g, "").toUpperCase();
  }

  // Dígito verificador por módulo 11.
  function dvRut(cuerpo) {
    let suma = 0;
    let factor = 2;
    for (let i = cuerpo.length - 1; i >= 0; i--) {
      suma += Number(cuerpo[i]) * factor;
      factor = factor === 7 ? 2 : factor + 1;
    }
    const resto = 11 - (suma % 11);
    if (resto === 11) return "0";
    if (resto === 10) return "K";
    return String(resto);
  }

  function validarRut(rut) {
    const l = limpiarRut(rut);
    if (l.length < 2) return false;
    const cuerpo = l.slice(0, -1);
    if (!/^\d+$/.test(cuerpo) || Number(cuerpo) === 0) return false;
    return dvRut(cuerpo) === l.slice(-1);
  }

  function formatearRut(rut) {
    const l = limpiarRut(rut);
    if (l.length < 2) return l;
    const cuerpo = l.slice(0, -1).replace(/^0+/, "") || "0";
    return cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "-" + l.slice(-1);
  }

  // ------------------------------------------------------ Razón social ---

  // Minúsculas, sin tildes ni puntos y con espacios simples: para comparar.
  function normalizar(texto) {
    return String(texto || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/\./g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  const TERMINACIONES = {
    SPA: [/\s*\bspa\.?$/i],
    EIRL: [/\s*\be\.?\s?i\.?\s?r\.?\s?l\.?$/i, /\s*\bempresa individual de responsabilidad limitada$/i],
    LTDA: [/\s*\blimitada$/i, /\s*\bltda\.?$/i],
  };

  // Devuelve la razón social con la terminación que exige la ley para el
  // tipo. Si el usuario ya la escribió (con o sin puntos), no la duplica.
  function razonSocialCompleta(nombre, tipoId) {
    const tipo = TIPOS[tipoId];
    let base = String(nombre || "").replace(/\s+/g, " ").trim();
    if (!tipo || !base) return base;
    for (const re of TERMINACIONES[tipoId]) base = base.replace(re, "").trim();
    return base ? base + " " + tipo.sufijo : "";
  }

  function nombreDeSocio(s) {
    if (!s) return "";
    if (s.tipoPersona === "juridica") return String(s.razonSocial || "").trim();
    return [s.nombres, s.apellidoPaterno, s.apellidoMaterno]
      .map((x) => String(x || "").trim())
      .filter(Boolean)
      .join(" ");
  }

  // EIRL: el nombre debe incluir al menos un nombre de pila y un apellido del
  // titular. El Registro, en sus preguntas frecuentes, pide el apellido
  // paterno; si solo aparece el materno se avisa, sin bloquear.
  function revisarNombreEirl(razonSocial, titular) {
    const r = { ok: true, error: null, aviso: null };
    if (!titular) return r;
    const palabras = " " + normalizar(razonSocial) + " ";
    const contiene = (t) => {
      const n = normalizar(t);
      return n && palabras.includes(" " + n + " ");
    };
    const nombres = String(titular.nombres || "").split(/\s+/).filter(Boolean);
    const tieneNombre = nombres.some(contiene);
    const tienePaterno = contiene(titular.apellidoPaterno);
    const tieneMaterno = contiene(titular.apellidoMaterno);
    if (!tieneNombre || (!tienePaterno && !tieneMaterno)) {
      r.ok = false;
      r.error = "En una E.I.R.L. el nombre debe incluir, al menos, el nombre y apellido del titular.";
    } else if (!tienePaterno) {
      r.aviso = "El Registro suele exigir el apellido paterno del titular en el nombre de la E.I.R.L.";
    }
    return r;
  }

  // ------------------------------------------------------------ Montos ---

  function aEntero(valor) {
    const n = Number(String(valor == null ? "" : valor).replace(/[^\d]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function formatearPesos(n) {
    return "$" + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function capitalTotal(socios) {
    return (socios || []).reduce((t, s) => t + aEntero(s.aporte), 0);
  }

  // Porcentaje de cada socio con un decimal; suma exactamente 100 cuando
  // hay capital (el ajuste de redondeo queda en el mayor aporte).
  function participaciones(socios) {
    const total = capitalTotal(socios);
    if (!total) return (socios || []).map(() => 0);
    const pct = socios.map((s) => Math.round((aEntero(s.aporte) * 1000) / total) / 10);
    const diferencia = Math.round((100 - pct.reduce((a, b) => a + b, 0)) * 10) / 10;
    if (diferencia) {
      let mayor = 0;
      socios.forEach((s, i) => {
        if (aEntero(s.aporte) > aEntero(socios[mayor].aporte)) mayor = i;
      });
      pct[mayor] = Math.round((pct[mayor] + diferencia) * 10) / 10;
    }
    return pct;
  }

  // ------------------------------------------------------ Recomendación ---

  // Tipos posibles según cuántas personas y si alguna es persona jurídica.
  // No ordena por conveniencia: eso depende del caso y lo ve la asesoría.
  function tiposPosibles(cantidad, hayJuridicas) {
    const n = Math.max(0, Math.floor(Number(cantidad) || 0));
    if (!n) return [];
    return Object.values(TIPOS)
      .filter((t) => n >= t.minSocios && (t.maxSocios == null || n <= t.maxSocios))
      .filter((t) => !hayJuridicas || t.admiteJuridicas)
      .map((t) => t.id);
  }

  // ------------------------------------------------------- Validación ---

  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function socioVacio(id) {
    return {
      id: id,
      tipoPersona: "natural",
      nombres: "",
      apellidoPaterno: "",
      apellidoMaterno: "",
      razonSocial: "",
      rut: "",
      nacionalidad: "Chilena",
      estadoCivil: "",
      profesion: "",
      domicilio: "",
      correo: "",
      telefono: "",
      aporte: "",
      repNombre: "",
      repRut: "",
      tieneFEA: "",
      tieneClaveUnica: "",
    };
  }

  function estadoInicial() {
    return {
      version: 1,
      paso: 0,
      tipo: null,
      socios: [socioVacio("s1")],
      empresa: {
        razonSocial: "",
        fantasia: "",
        objeto: "",
        region: "",
        comuna: "",
        direccion: "",
        duracion: "indefinida",
        anios: "",
      },
      admin: { ids: [], externoNombre: "", externoRut: "", forma: "indistinta" },
      extras: [],
      contacto: { nombre: "", correo: "", telefono: "", comentario: "", consentimiento: false },
    };
  }

  function validarSocio(s, tipo, rutsVistos, errores, avisos) {
    const k = (campo) => "socio:" + s.id + ":" + campo;
    const quien = nombreDeSocio(s) || "Este " + tipo.socio;
    if (s.tipoPersona === "juridica") {
      if (!tipo.admiteJuridicas) {
        errores.push({ campo: k("tipoPersona"), msg: "Una E.I.R.L. solo puede tener como titular a una persona natural." });
      }
      if (!String(s.razonSocial).trim()) errores.push({ campo: k("razonSocial"), msg: "Indica la razón social." });
      if (!String(s.repNombre).trim()) errores.push({ campo: k("repNombre"), msg: "Indica quién la representa." });
      if (!validarRut(s.repRut)) errores.push({ campo: k("repRut"), msg: "RUT del representante no válido." });
    } else {
      if (!String(s.nombres).trim()) errores.push({ campo: k("nombres"), msg: "Indica el o los nombres." });
      if (!String(s.apellidoPaterno).trim()) errores.push({ campo: k("apellidoPaterno"), msg: "Indica el apellido paterno." });
      if (!s.estadoCivil) avisos.push(quien + ": falta el estado civil (lo pediremos antes de redactar el estatuto).");
      if (!String(s.profesion).trim()) avisos.push(quien + ": falta la profesión u oficio.");
    }
    if (!validarRut(s.rut)) {
      errores.push({ campo: k("rut"), msg: "RUT no válido. Revisa los números y el dígito verificador." });
    } else {
      const l = limpiarRut(s.rut);
      if (rutsVistos.has(l)) errores.push({ campo: k("rut"), msg: "Este RUT ya está en otro " + tipo.socio + "." });
      rutsVistos.add(l);
    }
    if (!EMAIL.test(String(s.correo).trim())) {
      errores.push({ campo: k("correo"), msg: "Correo no válido: lo necesitamos para coordinar la firma." });
    }
    if (aEntero(s.aporte) <= 0) errores.push({ campo: k("aporte"), msg: "Indica el aporte en pesos (mayor que cero)." });
    if (!String(s.domicilio).trim()) avisos.push(quien + ": falta el domicilio.");
    if (!s.tieneFEA) avisos.push(quien + ": no indicó si tiene Firma Electrónica Avanzada.");
  }

  function validarPaso(estado, pasoId) {
    const errores = [];
    const avisos = [];
    const tipo = TIPOS[estado.tipo];

    if (pasoId === "tipo") {
      if (!tipo) errores.push({ campo: "tipo", msg: "Elige un tipo de empresa." });
      return { errores, avisos };
    }
    if (!tipo) {
      errores.push({ campo: "tipo", msg: "Primero elige el tipo de empresa." });
      return { errores, avisos };
    }

    if (pasoId === "socios") {
      const n = estado.socios.length;
      if (n < tipo.minSocios) {
        errores.push({ campo: "socios", msg: "Una " + tipo.corto + " necesita al menos " + tipo.minSocios + " " + tipo.socios + "." });
      }
      if (tipo.maxSocios != null && n > tipo.maxSocios) {
        errores.push({
          campo: "socios",
          msg: tipo.maxSocios === 1 ? "Una E.I.R.L. tiene un solo titular." : "Una " + tipo.corto + " admite hasta " + tipo.maxSocios + " socios.",
        });
      }
      const ruts = new Set();
      estado.socios.forEach((s) => validarSocio(s, tipo, ruts, errores, avisos));
    }

    if (pasoId === "empresa") {
      const e = estado.empresa;
      const nombre = String(e.razonSocial).trim();
      if (nombre.length < 3) {
        errores.push({ campo: "empresa.razonSocial", msg: "Escribe el nombre de la empresa." });
      } else if (estado.tipo === "EIRL") {
        const r = revisarNombreEirl(nombre, estado.socios[0]);
        if (r.error) errores.push({ campo: "empresa.razonSocial", msg: r.error });
        if (r.aviso) avisos.push(r.aviso);
      }
      if (String(e.objeto).trim().length < 10) {
        errores.push({ campo: "empresa.objeto", msg: "Describe a qué se dedicará la empresa (al menos una frase)." });
      }
      if (!e.region) errores.push({ campo: "empresa.region", msg: "Elige la región." });
      if (!String(e.comuna).trim()) errores.push({ campo: "empresa.comuna", msg: "Indica la comuna." });
      if (e.duracion === "plazo" && !(aEntero(e.anios) > 0)) {
        errores.push({ campo: "empresa.anios", msg: "Indica la duración en años." });
      }
    }

    if (pasoId === "admin") {
      const a = estado.admin;
      const ids = a.ids.filter((id) => estado.socios.some((s) => s.id === id));
      const hayExterno = String(a.externoNombre).trim() || String(a.externoRut).trim();
      if (!ids.length && !hayExterno) {
        errores.push({ campo: "admin", msg: "Elige al menos una persona que administre la empresa." });
      }
      if (hayExterno) {
        if (!String(a.externoNombre).trim()) errores.push({ campo: "admin.externoNombre", msg: "Indica el nombre." });
        if (!validarRut(a.externoRut)) errores.push({ campo: "admin.externoRut", msg: "RUT no válido." });
      }
    }

    if (pasoId === "resumen") {
      const c = estado.contacto;
      if (!String(c.nombre).trim()) errores.push({ campo: "contacto.nombre", msg: "Indica tu nombre." });
      if (!EMAIL.test(String(c.correo).trim())) errores.push({ campo: "contacto.correo", msg: "Correo no válido." });
      if (!c.consentimiento) {
        errores.push({ campo: "contacto.consentimiento", msg: "Debes autorizar el uso de los datos para preparar la constitución." });
      }
    }

    return { errores, avisos };
  }

  // Primer paso con errores (para no dejar enviar una solicitud incompleta
  // si alguien salta pasos con el historial del navegador).
  function primerPasoInvalido(estado) {
    for (let i = 0; i < PASOS.length; i++) {
      if (validarPaso(estado, PASOS[i].id).errores.length) return i;
    }
    return -1;
  }

  // ---------------------------------------------------------- Firma ---

  // Cómo firmará cada socio el formulario del Registro. Vías oficiales:
  // FEA (token o en línea, comprada en la plataforma con ClaveÚnica) o firma
  // ante notario con el número de atención. Fuentes en README.md.
  function planDeFirma(s) {
    const quien = s.tipoPersona === "juridica" ? "Firma su representante" : "Firma";
    if (s.tieneFEA === "si") {
      return { via: "fea", texto: quien + " en línea con su Firma Electrónica Avanzada." };
    }
    if (s.tieneClaveUnica === "no") {
      return {
        via: "notario",
        texto:
          quien +
          " ante notario con el número de atención del Registro (sin ClaveÚnica no puede comprar la FEA en línea). El costo de la firma es de cargo de cada socio.",
      };
    }
    return {
      via: "elegir",
      texto:
        quien +
        " comprando una FEA en línea en la misma plataforma (requiere ClaveÚnica) o ante notario con el número de atención. El costo de la firma es de cargo de cada socio.",
    };
  }

  // ----------------------------------------------------- Presupuesto ---

  // Si falta algún precio en config.js, el total queda en null y se lista
  // qué falta: nunca se muestra un total parcial como si fuera completo.
  function presupuesto(estado, config) {
    const lineas = [];
    const faltan = [];
    const tipo = TIPOS[estado.tipo];
    if (tipo) {
      const p = config && config.precios ? config.precios[tipo.id] : null;
      lineas.push({ concepto: "Constitución de " + tipo.nombre, precio: p == null ? null : Number(p) });
      if (p == null) faltan.push("precio de " + tipo.corto);
    }
    const extras = (config && config.extras) || [];
    (estado.extras || []).forEach((id) => {
      const x = extras.find((e) => e.id === id);
      if (!x) return;
      lineas.push({ concepto: x.nombre, precio: x.precio == null ? null : Number(x.precio) });
      if (x.precio == null) faltan.push("precio de «" + x.nombre + "»");
    });
    const total = faltan.length ? null : lineas.reduce((t, l) => t + l.precio, 0);
    return { lineas, total, faltan };
  }

  // ------------------------------------------------- Texto solicitud ---

  const ESTADO_CIVIL = {
    soltero: "Soltero/a",
    casado_sc: "Casado/a en sociedad conyugal",
    casado_sb: "Casado/a con separación de bienes",
    casado_pg: "Casado/a con participación en gananciales",
    conviviente: "Conviviente civil",
    divorciado: "Divorciado/a",
    viudo: "Viudo/a",
  };

  const SI_NO = { si: "Sí", no: "No", nose: "No sabe" };

  function administradores(estado) {
    const lista = estado.admin.ids
      .map((id) => estado.socios.find((s) => s.id === id))
      .filter(Boolean)
      .map(nombreDeSocio);
    if (String(estado.admin.externoNombre).trim()) {
      lista.push(estado.admin.externoNombre.trim() + " (RUT " + formatearRut(estado.admin.externoRut) + ", no socio)");
    }
    return lista;
  }

  function textoSolicitud(estado, config) {
    const tipo = TIPOS[estado.tipo];
    const e = estado.empresa;
    const L = [];
    const pct = participaciones(estado.socios);
    L.push("SOLICITUD DE CONSTITUCIÓN DE EMPRESA");
    L.push("");
    L.push("Tipo: " + (tipo ? tipo.nombre + " (" + tipo.corto + ")" : "—"));
    L.push("Razón social: " + razonSocialCompleta(e.razonSocial, estado.tipo));
    if (String(e.fantasia).trim()) L.push("Nombre de fantasía: " + e.fantasia.trim());
    L.push("Objeto / giro: " + String(e.objeto).trim());
    L.push("Domicilio: " + [e.direccion, e.comuna, e.region].map((x) => String(x || "").trim()).filter(Boolean).join(", "));
    L.push("Duración: " + (e.duracion === "plazo" ? aEntero(e.anios) + " años" : "Indefinida"));
    L.push("Capital total: " + formatearPesos(capitalTotal(estado.socios)));
    L.push("");
    L.push((tipo ? tipo.socios.toUpperCase() : "SOCIOS") + ":");
    estado.socios.forEach((s, i) => {
      L.push(i + 1 + ". " + nombreDeSocio(s) + " — RUT " + formatearRut(s.rut));
      if (s.tipoPersona === "juridica") {
        L.push("   Persona jurídica. Representante: " + s.repNombre + " (RUT " + formatearRut(s.repRut) + ")");
      } else {
        const datos = [s.nacionalidad, ESTADO_CIVIL[s.estadoCivil], s.profesion].filter(Boolean).join(", ");
        if (datos) L.push("   " + datos);
      }
      if (String(s.domicilio).trim()) L.push("   Domicilio: " + s.domicilio.trim());
      L.push("   Aporte: " + formatearPesos(aEntero(s.aporte)) + " (" + String(pct[i]).replace(".", ",") + " %)");
      L.push("   Contacto: " + [s.correo, s.telefono].filter(Boolean).join(" / "));
      L.push("   FEA: " + (SI_NO[s.tieneFEA] || "Sin indicar") + " · ClaveÚnica: " + (SI_NO[s.tieneClaveUnica] || "Sin indicar"));
    });
    L.push("");
    L.push("Administración: " + administradores(estado).join("; "));
    if (administradores(estado).length > 1) {
      L.push("Forma de actuar: " + (estado.admin.forma === "conjunta" ? "conjunta" : "indistinta (cualquiera por separado)"));
    }
    const p = presupuesto(estado, config);
    if (p.lineas.length > 1) {
      L.push("");
      L.push("Servicios adicionales: " + p.lineas.slice(1).map((l) => l.concepto).join("; "));
    }
    L.push("");
    L.push("Contacto: " + estado.contacto.nombre + " · " + estado.contacto.correo + (estado.contacto.telefono ? " · " + estado.contacto.telefono : ""));
    if (String(estado.contacto.comentario).trim()) L.push("Comentario: " + estado.contacto.comentario.trim());
    return L.join("\n");
  }

  const api = {
    TIPOS,
    PASOS,
    ESTADO_CIVIL,
    limpiarRut,
    dvRut,
    validarRut,
    formatearRut,
    normalizar,
    razonSocialCompleta,
    nombreDeSocio,
    revisarNombreEirl,
    aEntero,
    formatearPesos,
    capitalTotal,
    participaciones,
    tiposPosibles,
    socioVacio,
    estadoInicial,
    validarPaso,
    primerPasoInvalido,
    planDeFirma,
    presupuesto,
    administradores,
    textoSolicitud,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.Logica = api;
})(typeof window !== "undefined" ? window : globalThis);
