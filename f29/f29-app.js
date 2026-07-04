/**
 * Interfaz del Bot F29: carga masiva de CSV, cálculo con f29-engine.js,
 * revisión, exportación e impresión de borradores.
 */
(function () {
  "use strict";

  var $ = function (selector) { return document.querySelector(selector); };

  // Mismos datos que f29/ejemplo.csv, incrustados para que "Probar con datos
  // de ejemplo" funcione incluso al abrir el archivo directamente (file://).
  var CSV_EJEMPLO = [
    "rut;razon_social;periodo;ventas_netas_afectas;num_facturas_venta;ventas_boletas_brutas;num_boletas;ventas_exentas;compras_netas;num_facturas_compra;iva_compras;remanente_anterior;tasa_ppm;honorarios_brutos;impuesto_unico",
    "77.123.456-9;Comercial Los Vilos SpA;2026-06;12500000;18;3570000;240;0;6800000;35;;0;0,25;1200000;185000",
    "96.874.030-K;Ferretería El Ancla Ltda;2026-06;8200000;42;5950000;510;0;9500000;60;;350000;0,5;0;0",
    "76.543.210-3;Asesorías del Choapa EIRL;2026-06;4500000;6;0;0;0;800000;8;;0;0,25;950000;0",
    "78.901.230-K;Constructora Quilimarí Ltda;2026-06;2000000;3;0;0;0;18000000;25;;0;0,125;0;0",
    "65.432.100-0;Inversiones Pasivas SpA;2026-06;0;0;0;0;0;0;0;;0;0;0;0",
  ].join("\n");

  var resultados = [];

  // ------------------------------------------------------------ utilidades ----

  function escaparHtml(texto) {
    return String(texto == null ? "" : texto)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function descargar(nombre, contenido, tipo) {
    var blob = new Blob(["\uFEFF" + contenido], { type: tipo || "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
    URL.revokeObjectURL(url);
  }

  function copiarAlPortapapeles(texto, boton) {
    function avisar() {
      var original = boton.textContent;
      boton.textContent = "✔ Copiado";
      setTimeout(function () { boton.textContent = original; }, 1600);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(avisar, function () { copiarConTextarea(texto); avisar(); });
    } else {
      copiarConTextarea(texto);
      avisar();
    }
  }

  function copiarConTextarea(texto) {
    var area = document.createElement("textarea");
    area.value = texto;
    document.body.appendChild(area);
    area.select();
    try { document.execCommand("copy"); } catch (e) { /* sin soporte */ }
    document.body.removeChild(area);
  }

  // -------------------------------------------------------------- proceso ----

  function procesarTexto(texto) {
    var analisis = F29.parsearCsv(texto);
    var erroresGlobales = analisis.errores.slice();
    resultados = analisis.entradas.map(function (entrada) {
      return F29.calcularF29(entrada);
    });
    renderizar(erroresGlobales);
  }

  function leerArchivo(archivo) {
    var lector = new FileReader();
    lector.onload = function () { procesarTexto(String(lector.result)); };
    lector.onerror = function () { renderizarErroresGlobales(["No se pudo leer el archivo '" + archivo.name + "'."]); };
    lector.readAsText(archivo, "UTF-8");
  }

  // --------------------------------------------------------------- render ----

  function renderizarErroresGlobales(errores) {
    var caja = $("#errores-globales");
    if (!errores.length) {
      caja.hidden = true;
      caja.innerHTML = "";
      return;
    }
    caja.hidden = false;
    caja.innerHTML = errores.map(function (e) { return "<div>⛔ " + escaparHtml(e) + "</div>"; }).join("");
    $("#seccion-resultados").hidden = false;
  }

  function claseEstado(r) {
    if (!r.ok) return ["estado-error", "Error"];
    if (r.advertencias.length) return ["estado-alerta", "Revisar"];
    return ["estado-ok", "OK"];
  }

  function renderizar(erroresGlobales) {
    renderizarErroresGlobales(erroresGlobales || []);
    var seccion = $("#seccion-resultados");
    seccion.hidden = false;

    var ok = resultados.filter(function (r) { return r.ok; });
    var conError = resultados.length - ok.length;
    var totalAPagar = ok.reduce(function (suma, r) { return suma + r.totalAPagar; }, 0);
    var conRemanente = ok.filter(function (r) { return r.remanenteSiguiente > 0; }).length;
    var sinMovimiento = ok.filter(function (r) { return r.sinMovimiento; }).length;

    $("#tarjetas-resumen").innerHTML =
      tarjeta(resultados.length, "declaraciones", "") +
      tarjeta(F29.formatearPesos(totalAPagar), "total a pagar (091)", "ok") +
      tarjeta(conRemanente, "con remanente (077)", conRemanente ? "alerta" : "") +
      tarjeta(sinMovimiento, "sin movimiento", "") +
      tarjeta(conError, "con errores", conError ? "error" : "");

    var cuerpo = $("#tabla-resultados tbody");
    cuerpo.innerHTML = resultados.map(filaResumen).join("");

    Array.prototype.forEach.call(cuerpo.querySelectorAll(".fila-resumen"), function (fila) {
      fila.addEventListener("click", function () { alternarDetalle(fila); });
    });
    Array.prototype.forEach.call(cuerpo.querySelectorAll("[data-accion]"), function (boton) {
      boton.addEventListener("click", function (evento) {
        evento.stopPropagation();
        var indice = parseInt(boton.getAttribute("data-indice"), 10);
        if (boton.getAttribute("data-accion") === "copiar") {
          copiarAlPortapapeles(F29.textoCodigos(resultados[indice]), boton);
        } else {
          imprimirBorradores([resultados[indice]]);
        }
      });
    });

    seccion.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function tarjeta(valor, etiqueta, clase) {
    return (
      '<div class="tarjeta ' + clase + '">' +
      '<span class="valor">' + escaparHtml(valor) + "</span>" +
      '<span class="etiqueta">' + escaparHtml(etiqueta) + "</span></div>"
    );
  }

  function filaResumen(r, indice) {
    var estado = claseEstado(r);
    var retenciones = r.codigos["151"] + r.codigos["048"];
    return (
      '<tr class="fila-resumen" data-indice="' + indice + '">' +
      "<td>▸</td>" +
      "<td>" + escaparHtml(r.rutFormateado) + "</td>" +
      "<td>" + escaparHtml(r.razonSocial || "—") + "</td>" +
      "<td>" + escaparHtml(r.nombrePeriodo) + "</td>" +
      '<td class="num">' + F29.formatearPesos(r.codigos["538"]) + "</td>" +
      '<td class="num">' + F29.formatearPesos(r.codigos["537"]) + "</td>" +
      '<td class="num">' + F29.formatearPesos(r.codigos["089"]) + "</td>" +
      '<td class="num">' + F29.formatearPesos(r.codigos["062"]) + "</td>" +
      '<td class="num">' + F29.formatearPesos(retenciones) + "</td>" +
      '<td class="num"><strong>' + F29.formatearPesos(r.codigos["091"]) + "</strong></td>" +
      '<td><span class="estado ' + estado[0] + '">' + estado[1] + "</span></td>" +
      "</tr>" +
      '<tr class="fila-detalle" hidden><td colspan="11">' + detalleHtml(r, indice) + "</td></tr>"
    );
  }

  function lineaCodigo(etiqueta, codigo, valor, esTotal, esTasa) {
    var mostrado = esTasa
      ? String(valor).replace(".", ",") + " %"
      : typeof valor === "number" && etiqueta.indexOf("n°") === -1
        ? F29.formatearPesos(valor)
        : String(valor);
    return (
      '<div class="linea' + (esTotal ? " total" : "") + '">' +
      "<dt>" + escaparHtml(etiqueta) + " <code>" + codigo + "</code></dt>" +
      "<dd>" + escaparHtml(mostrado) + "</dd></div>"
    );
  }

  function detalleHtml(r, indice) {
    var c = r.codigos;
    var notas = r.errores
      .map(function (e) { return '<li class="nota-error">⛔ ' + escaparHtml(e) + "</li>"; })
      .concat(
        r.advertencias.map(function (a) { return '<li class="nota-alerta">⚠️ ' + escaparHtml(a) + "</li>"; })
      )
      .join("");

    return (
      (notas ? '<ul class="notas">' + notas + "</ul>" : "") +
      '<div class="detalle-grupos">' +
      '<div class="detalle-grupo"><h4>Débitos (ventas)</h4><dl>' +
      lineaCodigo("n° facturas emitidas", "503", c["503"]) +
      lineaCodigo("Débito facturas", "502", c["502"]) +
      lineaCodigo("n° boletas", "110", c["110"]) +
      lineaCodigo("Débito boletas", "111", c["111"]) +
      lineaCodigo("Ventas exentas", "142", c["142"]) +
      lineaCodigo("Total débitos", "538", c["538"], true) +
      "</dl></div>" +
      '<div class="detalle-grupo"><h4>Créditos (compras)</h4><dl>' +
      lineaCodigo("n° facturas recibidas", "519", c["519"]) +
      lineaCodigo("Crédito IVA facturas", "520", c["520"]) +
      lineaCodigo("Remanente mes anterior", "504", c["504"]) +
      lineaCodigo("Total créditos", "537", c["537"], true) +
      "</dl></div>" +
      '<div class="detalle-grupo"><h4>IVA y PPM</h4><dl>' +
      lineaCodigo("IVA determinado", "089", c["089"]) +
      lineaCodigo("Remanente período sgte.", "077", c["077"]) +
      lineaCodigo("Base imponible PPM", "563", c["563"]) +
      lineaCodigo("Tasa PPM", "115", c["115"], false, true) +
      lineaCodigo("PPM neto determinado", "062", c["062"], true) +
      "</dl></div>" +
      '<div class="detalle-grupo"><h4>Retenciones y total</h4><dl>' +
      lineaCodigo("Retención honorarios (" + (r.tasaHonorarios * 100).toFixed(2).replace(".", ",") + "%)", "151", c["151"]) +
      lineaCodigo("Impuesto único trabajadores", "048", c["048"]) +
      lineaCodigo("Subtotal determinado", "595", c["595"]) +
      lineaCodigo("TOTAL A PAGAR", "091", c["091"], true) +
      "</dl></div>" +
      "</div>" +
      '<p class="sutil">Vencimientos ' + escaparHtml(r.mesVencimiento) +
      ": día 12 (general) · día 20 (facturador electrónico por internet con pago) · día 28 (sin pago).</p>" +
      '<div class="botonera">' +
      '<button class="btn btn-mini" data-accion="copiar" data-indice="' + indice + '">📋 Copiar códigos</button>' +
      '<button class="btn btn-mini btn-secundario" data-accion="imprimir" data-indice="' + indice + '">🖨 Imprimir borrador</button>' +
      "</div>"
    );
  }

  function alternarDetalle(fila) {
    var detalle = fila.nextElementSibling;
    var abierto = !detalle.hidden;
    detalle.hidden = abierto;
    fila.classList.toggle("abierta", !abierto);
    fila.firstElementChild.textContent = abierto ? "▸" : "▾";
  }

  // ------------------------------------------------------------- imprimir ----

  function imprimirBorradores(lista) {
    var ventana = window.open("", "_blank");
    if (!ventana) {
      alert("El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes para este archivo.");
      return;
    }
    var cuerpos = lista
      .map(function (r) {
        return '<pre class="borrador">' + escaparHtml(F29.textoCodigos(r)) + "</pre>";
      })
      .join('<div class="salto"></div>');
    ventana.document.write(
      "<!DOCTYPE html><html lang='es'><head><meta charset='UTF-8'>" +
      "<title>Borradores F29</title><style>" +
      "body{font-family:ui-monospace,Menlo,Consolas,monospace;margin:2rem;}" +
      ".borrador{font-size:12px;line-height:1.5;white-space:pre-wrap;}" +
      ".salto{page-break-after:always;}" +
      "</style></head><body>" + cuerpos + "</body></html>"
    );
    ventana.document.close();
    ventana.focus();
    ventana.print();
  }

  // ------------------------------------------------------------- eventos ----

  $("#btn-plantilla").addEventListener("click", function () {
    descargar("plantilla_f29.csv", F29.plantillaCsv());
  });

  $("#btn-ejemplo").addEventListener("click", function () {
    $("#texto-pegado").value = CSV_EJEMPLO;
    procesarTexto(CSV_EJEMPLO);
  });

  $("#entrada-archivo").addEventListener("change", function (evento) {
    if (evento.target.files && evento.target.files[0]) leerArchivo(evento.target.files[0]);
    evento.target.value = "";
  });

  var zona = $("#zona-soltar");
  ["dragenter", "dragover"].forEach(function (tipo) {
    zona.addEventListener(tipo, function (evento) {
      evento.preventDefault();
      zona.classList.add("activa");
    });
  });
  ["dragleave", "drop"].forEach(function (tipo) {
    zona.addEventListener(tipo, function (evento) {
      evento.preventDefault();
      zona.classList.remove("activa");
    });
  });
  zona.addEventListener("drop", function (evento) {
    var archivo = evento.dataTransfer && evento.dataTransfer.files && evento.dataTransfer.files[0];
    if (archivo) leerArchivo(archivo);
  });

  $("#btn-procesar-texto").addEventListener("click", function () {
    var texto = $("#texto-pegado").value.trim();
    if (!texto) {
      renderizarErroresGlobales(["Pega primero los datos CSV en el cuadro de texto."]);
      return;
    }
    procesarTexto(texto);
  });

  $("#btn-exportar").addEventListener("click", function () {
    if (!resultados.length) return;
    descargar("f29_resultados.csv", F29.generarCsvResultados(resultados));
  });

  $("#btn-imprimir-todos").addEventListener("click", function () {
    var validos = resultados.filter(function (r) { return r.ok; });
    if (validos.length) imprimirBorradores(validos);
  });
})();
