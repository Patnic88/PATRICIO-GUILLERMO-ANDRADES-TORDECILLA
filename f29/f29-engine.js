/**
 * Motor de cálculo del Formulario 29 (SII Chile) — IVA mensual, PPM y retenciones.
 *
 * Funciona en el navegador (window.F29) y en Node.js (module.exports) para
 * poder probarlo con `node f29/test.js`.
 *
 * IMPORTANTE: esto genera BORRADORES para revisión de un contador. No
 * reemplaza la declaración oficial en www.sii.cl.
 */
(function (raiz) {
  "use strict";

  var TASA_IVA = 0.19;

  // Tasa de retención de boletas de honorarios según año (Ley 21.133).
  var RETENCION_HONORARIOS = {
    2020: 0.1075,
    2021: 0.115,
    2022: 0.1225,
    2023: 0.13,
    2024: 0.1375,
    2025: 0.145,
    2026: 0.1525,
    2027: 0.16,
  };
  var RETENCION_DESDE_2028 = 0.17;

  function tasaRetencionHonorarios(anio) {
    if (anio >= 2028) return RETENCION_DESDE_2028;
    return RETENCION_HONORARIOS[anio] || RETENCION_DESDE_2028;
  }

  // ---------------------------------------------------------------- RUT ----

  function limpiarRut(rut) {
    return String(rut || "").replace(/[.\s]/g, "").replace(/-/g, "").toUpperCase();
  }

  function formatearRut(rut) {
    var limpio = limpiarRut(rut);
    if (limpio.length < 2) return String(rut || "");
    var cuerpo = limpio.slice(0, -1);
    var dv = limpio.slice(-1);
    var conPuntos = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return conPuntos + "-" + dv;
  }

  function validarRut(rut) {
    var limpio = limpiarRut(rut);
    if (!/^\d{7,8}[0-9K]$/.test(limpio)) return false;
    var cuerpo = limpio.slice(0, -1);
    var dv = limpio.slice(-1);
    var suma = 0;
    var factor = 2;
    for (var i = cuerpo.length - 1; i >= 0; i--) {
      suma += parseInt(cuerpo[i], 10) * factor;
      factor = factor === 7 ? 2 : factor + 1;
    }
    var resto = 11 - (suma % 11);
    var esperado = resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
    return dv === esperado;
  }

  // ------------------------------------------------------------- montos ----

  /**
   * Convierte montos en formato chileno a número: "1.234.567", "$ 1.234.567",
   * "1234567", "0,25" (decimal con coma). Vacío => 0.
   */
  function parsearMonto(valor) {
    if (typeof valor === "number") return isFinite(valor) ? valor : 0;
    var texto = String(valor == null ? "" : valor).trim();
    if (texto === "") return 0;
    texto = texto.replace(/\$/g, "").replace(/\s/g, "").replace(/%/g, "");
    var tienePunto = texto.indexOf(".") !== -1;
    var tieneComa = texto.indexOf(",") !== -1;
    if (tienePunto && tieneComa) {
      // "1.234,56" => punto miles, coma decimal
      texto = texto.replace(/\./g, "").replace(",", ".");
    } else if (tieneComa) {
      texto = texto.replace(",", ".");
    } else if (tienePunto && /^\-?\d{1,3}(\.\d{3})+$/.test(texto)) {
      // "1.234.567" => puntos de miles
      texto = texto.replace(/\./g, "");
    }
    var numero = parseFloat(texto);
    return isFinite(numero) ? numero : NaN;
  }

  function formatearPesos(monto) {
    var entero = Math.round(monto || 0);
    var signo = entero < 0 ? "-" : "";
    var digitos = String(Math.abs(entero));
    return signo + "$" + digitos.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  // ------------------------------------------------------------ período ----

  function parsearPeriodo(texto) {
    var limpio = String(texto || "").trim();
    var m = limpio.match(/^(\d{4})[-\/](\d{1,2})$/) || limpio.match(/^(\d{1,2})[-\/](\d{4})$/);
    if (!m) return null;
    var anio, mes;
    if (m[1].length === 4) {
      anio = parseInt(m[1], 10);
      mes = parseInt(m[2], 10);
    } else {
      mes = parseInt(m[1], 10);
      anio = parseInt(m[2], 10);
    }
    if (mes < 1 || mes > 12 || anio < 2000 || anio > 2100) return null;
    return { anio: anio, mes: mes };
  }

  var NOMBRES_MES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];

  function nombrePeriodo(periodo) {
    if (!periodo) return "—";
    return NOMBRES_MES[periodo.mes - 1] + " " + periodo.anio;
  }

  /** Mes siguiente al período, para informar vencimientos (día 12 / 20). */
  function mesVencimiento(periodo) {
    var mes = periodo.mes + 1;
    var anio = periodo.anio;
    if (mes > 12) {
      mes = 1;
      anio += 1;
    }
    return NOMBRES_MES[mes - 1] + " " + anio;
  }

  // ------------------------------------------------------------- cálculo ----

  /**
   * Calcula un F29 a partir de una entrada. Campos de la entrada (todos los
   * montos en pesos chilenos; los no informados se asumen 0):
   *
   *  rut, razon_social, periodo ("AAAA-MM")
   *  ventas_netas_afectas   ventas con factura, monto neto
   *  num_facturas_venta     cantidad de facturas emitidas
   *  ventas_boletas_brutas  ventas con boleta, IVA INCLUIDO
   *  num_boletas            cantidad de boletas emitidas
   *  ventas_exentas         ventas exentas o no gravadas
   *  compras_netas          compras del giro con derecho a crédito, neto
   *  num_facturas_compra    cantidad de facturas recibidas
   *  iva_compras            crédito IVA de compras (si se omite: 19% de compras_netas)
   *  remanente_anterior     remanente de crédito fiscal del mes anterior, en pesos
   *  tasa_ppm               tasa PPM primera categoría, en % (ej: 0,25)
   *  honorarios_brutos      boletas de honorarios recibidas de terceros, monto bruto
   *  impuesto_unico         impuesto único a los trabajadores retenido (monto)
   */
  function calcularF29(entrada) {
    var advertencias = [];
    var errores = [];

    var rut = String(entrada.rut || "").trim();
    var razonSocial = String(entrada.razon_social || "").trim();
    var periodo = parsearPeriodo(entrada.periodo);

    if (!rut) errores.push("Falta el RUT.");
    else if (!validarRut(rut)) errores.push("RUT inválido (dígito verificador no coincide): " + rut);
    if (!razonSocial) advertencias.push("Falta la razón social.");
    if (!periodo) errores.push("Período inválido: use formato AAAA-MM (ej: 2026-06).");

    function monto(campo) {
      var valor = parsearMonto(entrada[campo]);
      if (isNaN(valor)) {
        errores.push("Monto ilegible en columna '" + campo + "': " + entrada[campo]);
        return 0;
      }
      if (valor < 0) {
        errores.push("Monto negativo no permitido en '" + campo + "'.");
        return 0;
      }
      return valor;
    }

    var ventasNetas = Math.round(monto("ventas_netas_afectas"));
    var numFacturasVenta = Math.round(monto("num_facturas_venta"));
    var boletasBrutas = Math.round(monto("ventas_boletas_brutas"));
    var numBoletas = Math.round(monto("num_boletas"));
    var ventasExentas = Math.round(monto("ventas_exentas"));
    var comprasNetas = Math.round(monto("compras_netas"));
    var numFacturasCompra = Math.round(monto("num_facturas_compra"));
    var ivaComprasEntrada = parsearMonto(entrada.iva_compras);
    var remanenteAnterior = Math.round(monto("remanente_anterior"));
    var tasaPpm = monto("tasa_ppm"); // en porcentaje
    var honorariosBrutos = Math.round(monto("honorarios_brutos"));
    var impuestoUnico = Math.round(monto("impuesto_unico"));

    // --- Débitos ---
    var debitoFacturas = Math.round(ventasNetas * TASA_IVA); // cód 502
    var netoBoletas = Math.round(boletasBrutas / (1 + TASA_IVA));
    var debitoBoletas = boletasBrutas - netoBoletas; // cód 111
    var totalDebitos = debitoFacturas + debitoBoletas; // cód 538

    // --- Créditos ---
    var creditoFacturas; // cód 520
    if (String(entrada.iva_compras == null ? "" : entrada.iva_compras).trim() === "") {
      creditoFacturas = Math.round(comprasNetas * TASA_IVA);
    } else if (isNaN(ivaComprasEntrada) || ivaComprasEntrada < 0) {
      errores.push("Monto ilegible en columna 'iva_compras': " + entrada.iva_compras);
      creditoFacturas = 0;
    } else {
      creditoFacturas = Math.round(ivaComprasEntrada);
      var esperado = Math.round(comprasNetas * TASA_IVA);
      if (comprasNetas > 0 && Math.abs(creditoFacturas - esperado) > Math.max(10, esperado * 0.02)) {
        advertencias.push(
          "El IVA de compras informado (" + formatearPesos(creditoFacturas) +
          ") difiere del 19% de las compras netas (" + formatearPesos(esperado) + "). Verifique."
        );
      }
    }
    var totalCreditos = creditoFacturas + remanenteAnterior; // cód 537

    // --- IVA determinado / remanente ---
    var ivaDeterminado = Math.max(0, totalDebitos - totalCreditos); // cód 89
    var remanenteSiguiente = Math.max(0, totalCreditos - totalDebitos); // cód 77

    // --- PPM ---
    var basePpm = ventasNetas + netoBoletas + ventasExentas; // cód 563
    var ppm = Math.round(basePpm * (tasaPpm / 100)); // cód 62
    if (basePpm > 0 && tasaPpm === 0) {
      advertencias.push("Hay ingresos pero la tasa de PPM es 0: se declara sin PPM. Verifique la tasa vigente del contribuyente.");
    }
    if (tasaPpm > 3) {
      advertencias.push("Tasa PPM de " + tasaPpm + "% parece alta; se ingresa en porcentaje (ej: 0,25).");
    }

    // --- Retenciones ---
    var anioPeriodo = periodo ? periodo.anio : new Date().getFullYear();
    var tasaHonorarios = tasaRetencionHonorarios(anioPeriodo);
    var retencionHonorarios = Math.round(honorariosBrutos * tasaHonorarios); // cód 151

    // --- Total ---
    var subtotal = ivaDeterminado + ppm + retencionHonorarios + impuestoUnico; // cód 595
    var totalAPagar = subtotal; // cód 91 (sin recargos: dentro del plazo)

    var sinMovimiento =
      totalDebitos === 0 && totalCreditos === 0 && basePpm === 0 &&
      retencionHonorarios === 0 && impuestoUnico === 0;
    if (sinMovimiento) {
      advertencias.push("Declaración sin movimiento: se presenta igualmente en sii.cl (sin pago, plazo hasta el día 28).");
    }
    if (remanenteSiguiente > 0) {
      advertencias.push(
        "Queda remanente de crédito fiscal de " + formatearPesos(remanenteSiguiente) +
        " (cód. 77): arrástrelo como 'remanente_anterior' en el F29 del mes siguiente."
      );
    }

    var codigos = {
      "502": debitoFacturas,
      "503": numFacturasVenta,
      "110": numBoletas,
      "111": debitoBoletas,
      "142": ventasExentas,
      "538": totalDebitos,
      "519": numFacturasCompra,
      "520": creditoFacturas,
      "504": remanenteAnterior,
      "537": totalCreditos,
      "089": ivaDeterminado,
      "077": remanenteSiguiente,
      "563": basePpm,
      "115": tasaPpm,
      "062": ppm,
      "151": retencionHonorarios,
      "048": impuestoUnico,
      "595": subtotal,
      "091": totalAPagar,
    };

    return {
      ok: errores.length === 0,
      rut: rut,
      rutFormateado: formatearRut(rut),
      razonSocial: razonSocial,
      periodo: periodo,
      periodoTexto: entrada.periodo || "",
      nombrePeriodo: periodo ? nombrePeriodo(periodo) : String(entrada.periodo || "—"),
      mesVencimiento: periodo ? mesVencimiento(periodo) : "—",
      tasaHonorarios: tasaHonorarios,
      sinMovimiento: sinMovimiento,
      codigos: codigos,
      totalAPagar: totalAPagar,
      remanenteSiguiente: remanenteSiguiente,
      advertencias: advertencias,
      errores: errores,
      entrada: entrada,
    };
  }

  // ----------------------------------------------------------------- CSV ----

  var COLUMNAS = [
    "rut", "razon_social", "periodo",
    "ventas_netas_afectas", "num_facturas_venta",
    "ventas_boletas_brutas", "num_boletas", "ventas_exentas",
    "compras_netas", "num_facturas_compra", "iva_compras",
    "remanente_anterior", "tasa_ppm", "honorarios_brutos", "impuesto_unico",
  ];

  function detectarSeparador(linea) {
    var puntoYComa = (linea.match(/;/g) || []).length;
    var coma = (linea.match(/,/g) || []).length;
    var tabulacion = (linea.match(/\t/g) || []).length;
    if (tabulacion >= puntoYComa && tabulacion >= coma) return tabulacion > 0 ? "\t" : ";";
    return puntoYComa >= coma ? ";" : ",";
  }

  function dividirLineaCsv(linea, separador) {
    var celdas = [];
    var actual = "";
    var enComillas = false;
    for (var i = 0; i < linea.length; i++) {
      var c = linea[i];
      if (enComillas) {
        if (c === '"') {
          if (linea[i + 1] === '"') { actual += '"'; i++; }
          else enComillas = false;
        } else actual += c;
      } else if (c === '"') {
        enComillas = true;
      } else if (c === separador) {
        celdas.push(actual);
        actual = "";
      } else {
        actual += c;
      }
    }
    celdas.push(actual);
    return celdas;
  }

  function normalizarEncabezado(texto) {
    return String(texto || "")
      .trim().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  /** Parsea el CSV completo y devuelve { entradas, errores }. */
  function parsearCsv(texto) {
    var lineas = String(texto || "").replace(/^\uFEFF/, "").split(/\r\n|\r|\n/)
      .filter(function (l) { return l.trim() !== ""; });
    if (lineas.length === 0) return { entradas: [], errores: ["El archivo está vacío."] };

    var separador = detectarSeparador(lineas[0]);
    var encabezados = dividirLineaCsv(lineas[0], separador).map(normalizarEncabezado);
    if (encabezados.indexOf("rut") === -1 || encabezados.indexOf("periodo") === -1) {
      return {
        entradas: [],
        errores: ["No se encontraron las columnas 'rut' y 'periodo' en la primera fila. Use la plantilla CSV."],
      };
    }

    var entradas = [];
    for (var i = 1; i < lineas.length; i++) {
      var celdas = dividirLineaCsv(lineas[i], separador);
      var fila = { _fila: i + 1 };
      for (var j = 0; j < encabezados.length; j++) {
        if (encabezados[j]) fila[encabezados[j]] = (celdas[j] || "").trim();
      }
      entradas.push(fila);
    }
    return { entradas: entradas, errores: [] };
  }

  function plantillaCsv() {
    var ejemplo = [
      "77.123.456-9", "Comercial Ejemplo SpA", "2026-06",
      "12500000", "18", "3570000", "240", "0",
      "6800000", "35", "", "0", "0,25", "1200000", "185000",
    ];
    return COLUMNAS.join(";") + "\n" + ejemplo.join(";") + "\n";
  }

  /** CSV de resultados: una fila por declaración con todos los códigos. */
  function generarCsvResultados(resultados) {
    var codigosOrden = ["503", "502", "110", "111", "142", "538", "519", "520", "504", "537", "089", "077", "563", "115", "062", "151", "048", "595", "091"];
    var encabezado = ["rut", "razon_social", "periodo", "estado"].concat(
      codigosOrden.map(function (c) { return "cod_" + c; })
    ).concat(["advertencias"]);
    var filas = [encabezado.join(";")];
    resultados.forEach(function (r) {
      var celdas = [
        r.rutFormateado,
        '"' + String(r.razonSocial || "").replace(/"/g, '""') + '"',
        r.periodo ? r.periodo.anio + "-" + String(r.periodo.mes).padStart(2, "0") : r.periodoTexto,
        r.ok ? "ok" : "error",
      ];
      codigosOrden.forEach(function (c) {
        var v = r.codigos[c];
        celdas.push(c === "115" ? String(v).replace(".", ",") : String(v));
      });
      var notas = r.errores.concat(r.advertencias).join(" | ");
      celdas.push('"' + notas.replace(/"/g, '""') + '"');
      filas.push(celdas.join(";"));
    });
    return filas.join("\n") + "\n";
  }

  /** Texto plano con los códigos, para copiar/pegar al digitar en sii.cl. */
  function textoCodigos(r) {
    var lineas = [
      "BORRADOR F29 — " + r.razonSocial + " (" + r.rutFormateado + ")",
      "Período: " + r.nombrePeriodo,
      "",
      "DÉBITOS",
      "  cód 503 (n° facturas emitidas): " + r.codigos["503"],
      "  cód 502 (débito facturas): " + r.codigos["502"],
      "  cód 110 (n° boletas): " + r.codigos["110"],
      "  cód 111 (débito boletas): " + r.codigos["111"],
      "  cód 142 (ventas exentas/no gravadas): " + r.codigos["142"],
      "  cód 538 (TOTAL DÉBITOS): " + r.codigos["538"],
      "",
      "CRÉDITOS",
      "  cód 519 (n° facturas recibidas): " + r.codigos["519"],
      "  cód 520 (crédito IVA facturas): " + r.codigos["520"],
      "  cód 504 (remanente mes anterior): " + r.codigos["504"],
      "  cód 537 (TOTAL CRÉDITOS): " + r.codigos["537"],
      "",
      "IVA",
      "  cód 089 (IVA determinado): " + r.codigos["089"],
      "  cód 077 (remanente período siguiente): " + r.codigos["077"],
      "",
      "PPM",
      "  cód 563 (base imponible): " + r.codigos["563"],
      "  cód 115 (tasa PPM %): " + String(r.codigos["115"]).replace(".", ","),
      "  cód 062 (PPM neto determinado): " + r.codigos["062"],
      "",
      "RETENCIONES",
      "  cód 151 (retención honorarios " + (r.tasaHonorarios * 100).toFixed(2).replace(".", ",") + "%): " + r.codigos["151"],
      "  cód 048 (impuesto único trabajadores): " + r.codigos["048"],
      "",
      "TOTAL",
      "  cód 595 (subtotal determinado): " + r.codigos["595"],
      "  cód 091 (TOTAL A PAGAR dentro del plazo): " + r.codigos["091"],
      "",
      "Vencimiento general: 12 de " + r.mesVencimiento +
        " · por internet facturador electrónico: 20 de " + r.mesVencimiento +
        " · sin pago: 28 de " + r.mesVencimiento,
    ];
    return lineas.join("\n");
  }

  var F29 = {
    TASA_IVA: TASA_IVA,
    COLUMNAS: COLUMNAS,
    tasaRetencionHonorarios: tasaRetencionHonorarios,
    validarRut: validarRut,
    formatearRut: formatearRut,
    parsearMonto: parsearMonto,
    formatearPesos: formatearPesos,
    parsearPeriodo: parsearPeriodo,
    calcularF29: calcularF29,
    parsearCsv: parsearCsv,
    plantillaCsv: plantillaCsv,
    generarCsvResultados: generarCsvResultados,
    textoCodigos: textoCodigos,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = F29;
  else raiz.F29 = F29;
})(typeof window !== "undefined" ? window : globalThis);
