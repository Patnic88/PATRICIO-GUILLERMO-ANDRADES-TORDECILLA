"""Representaciones de salida: documento imprimible (HTML), CSV, recordatorios."""

import csv
import html
import io

from . import rut as rut_mod
from .calculos import formato_clp, formato_fecha, TIPOS_DOCUMENTO

ESTILO_IMPRESION = """
@page { size: letter; margin: 18mm; }
* { box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; margin: 0; padding: 24px;
       font-size: 12px; background: #f3f3f3; }
.hoja { background: #fff; max-width: 820px; margin: 0 auto; padding: 36px 40px; }
.cabecera { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #1a1a1a;
            padding-bottom: 14px; }
.emisor h1 { margin: 0 0 4px; font-size: 18px; }
.emisor p, .receptor p { margin: 2px 0; }
.cuadro { border: 2px solid #b3261e; color: #b3261e; padding: 12px 18px; text-align: center;
          min-width: 220px; }
.cuadro .tipo { font-weight: bold; font-size: 13px; text-transform: uppercase; }
.cuadro .folio { font-size: 20px; font-weight: bold; margin-top: 6px; }
.cuadro .aviso { font-size: 10px; margin-top: 6px; color: #444; }
.receptor { margin: 18px 0; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; }
.receptor .et { color: #666; font-size: 10px; text-transform: uppercase; }
table.lineas { width: 100%; border-collapse: collapse; margin-top: 10px; }
table.lineas th { background: #efefef; text-align: left; padding: 7px 8px; border-bottom: 1px solid #999;
                  font-size: 11px; }
table.lineas td { padding: 7px 8px; border-bottom: 1px solid #e3e3e3; vertical-align: top; }
.num { text-align: right; white-space: nowrap; }
.totales { margin-top: 14px; margin-left: auto; width: 320px; }
.totales div { display: flex; justify-content: space-between; padding: 4px 8px; }
.totales .total { border-top: 2px solid #1a1a1a; font-weight: bold; font-size: 14px; margin-top: 4px; }
.obs { margin-top: 22px; padding: 10px 12px; background: #f8f8f8; border-left: 3px solid #999; }
.pie { margin-top: 28px; font-size: 10px; color: #666; border-top: 1px solid #ccc; padding-top: 10px; }
.estado { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 10px; font-weight: bold; }
.estado.PAGADA { background: #d8f3dc; color: #1b4332; }
.estado.ANULADA { background: #ffd6d6; color: #7a0000; }
.estado.BORRADOR { background: #fff3cd; color: #664d03; }
.marca { position: fixed; top: 40%; left: 10%; right: 10%; text-align: center; font-size: 80px;
         color: rgba(180, 0, 0, 0.12); transform: rotate(-20deg); pointer-events: none; }
.barra { max-width: 820px; margin: 0 auto 14px; display: flex; gap: 8px; }
.barra button { padding: 8px 14px; font-size: 13px; cursor: pointer; }
@media print { body { background: #fff; padding: 0; } .hoja { padding: 0; max-width: none; }
               .barra { display: none; } }
"""


def esc(valor):
    return html.escape("" if valor is None else str(valor))


def render_documento(doc, config):
    """HTML completo e imprimible de un documento."""
    tipo_nombre = TIPOS_DOCUMENTO.get(doc["tipo"], doc["tipo"])
    folio = doc["folio"] if doc.get("folio") else "BORRADOR"
    filas_html = []
    for l in doc["lineas"]:
        cantidad = l["cantidad"]
        cantidad_txt = str(int(cantidad)) if float(cantidad).is_integer() else str(cantidad)
        filas_html.append(
            "<tr><td>{d}</td><td class='num'>{c}</td><td class='num'>{p}</td>"
            "<td class='num'>{s}</td></tr>".format(
                d=esc(l["descripcion"]), c=esc(cantidad_txt),
                p=esc(formato_clp(l["precio_unitario"])), s=esc(formato_clp(l["subtotal"]))))

    tot = []
    if doc["tipo"] == "FACTURA":
        tot.append(("Neto", doc["neto"]))
        if doc["exento"]:
            tot.append(("Exento", doc["exento"]))
        tot.append((f"IVA {esc(config.get('tasa_iva', '19'))} %", doc["iva"]))
    elif doc["tipo"] == "BOLETA_HONORARIOS":
        tot.append(("Honorarios brutos", doc["exento"]))
        tot.append((f"Retención {esc(config.get('tasa_retencion', ''))} %", -doc["retencion"]))
    else:
        tot.append(("Monto exento", doc["exento"]))
    etiqueta_total = "Líquido a pagar" if doc["tipo"] == "BOLETA_HONORARIOS" else "Total"
    totales_html = "".join(
        f"<div><span>{esc(e)}</span><span>{esc(formato_clp(m))}</span></div>" for e, m in tot)
    totales_html += (f"<div class='total'><span>{etiqueta_total}</span>"
                     f"<span>{esc(formato_clp(doc['total']))}</span></div>")
    if doc.get("pagado"):
        totales_html += (f"<div><span>Pagado</span><span>{esc(formato_clp(doc['pagado']))}</span></div>"
                         f"<div><span>Saldo</span><span>{esc(formato_clp(doc['saldo']))}</span></div>")

    marca = ""
    if doc["estado"] == "ANULADA":
        marca = "<div class='marca'>ANULADA</div>"
    elif doc["estado"] == "BORRADOR":
        marca = "<div class='marca'>BORRADOR</div>"

    aviso = ""
    if doc["tipo"] != "NOTA_COBRO":
        aviso = ("<div class='aviso'>Folio interno de control. "
                 + (f"Folio SII: {esc(doc['folio_sii'])}" if doc.get("folio_sii")
                    else "Documento tributario oficial pendiente en sii.cl") + "</div>")

    observaciones = ""
    if doc.get("observaciones"):
        observaciones = f"<div class='obs'><strong>Observaciones:</strong> {esc(doc['observaciones'])}</div>"
    transferencia = ""
    if config.get("datos_transferencia"):
        transferencia = ("<div class='obs'><strong>Datos para pago:</strong><br>"
                         + esc(config["datos_transferencia"]).replace("\n", "<br>") + "</div>")

    return f"""<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><link rel="icon" href="data:,">
<title>{esc(tipo_nombre)} N° {esc(folio)} - {esc(doc['cliente'])}</title>
<style>{ESTILO_IMPRESION}</style></head>
<body>
<div class="barra">
  <button onclick="window.print()">🖨 Imprimir / Guardar como PDF</button>
  <button onclick="window.close()">Cerrar</button>
</div>
{marca}
<div class="hoja">
  <div class="cabecera">
    <div class="emisor">
      <h1>{esc(config.get('emisor_razon_social') or 'Emisor sin configurar')}</h1>
      <p>RUT {esc(rut_mod.formatear(config.get('emisor_rut', '')))}</p>
      <p>{esc(config.get('emisor_giro', ''))}</p>
      <p>{esc(config.get('emisor_direccion', ''))} {esc(config.get('emisor_comuna', ''))} {esc(config.get('emisor_ciudad', ''))}</p>
      <p>{esc(config.get('emisor_email', ''))} {esc(config.get('emisor_telefono', ''))}</p>
    </div>
    <div class="cuadro">
      <div class="tipo">{esc(tipo_nombre)}</div>
      <div class="folio">N° {esc(folio)}</div>
      {aviso}
    </div>
  </div>
  <div class="receptor">
    <div><div class="et">Señor(es)</div><p>{esc(doc['cliente'])}</p></div>
    <div><div class="et">RUT</div><p>{esc(rut_mod.formatear(doc['cliente_rut']))}</p></div>
    <div><div class="et">Giro</div><p>{esc(doc.get('cliente_giro', ''))}</p></div>
    <div><div class="et">Dirección</div><p>{esc(doc.get('cliente_direccion', ''))} {esc(doc.get('cliente_comuna', ''))}</p></div>
    <div><div class="et">Fecha de emisión</div><p>{esc(formato_fecha(doc['fecha_emision']))}</p></div>
    <div><div class="et">Vencimiento</div><p>{esc(formato_fecha(doc['fecha_vencimiento']))}
      <span class="estado {esc(doc['estado'])}">{esc(doc['estado'])}</span></p></div>
  </div>
  <table class="lineas">
    <thead><tr><th>Descripción</th><th class="num">Cantidad</th><th class="num">Precio unitario</th><th class="num">Subtotal</th></tr></thead>
    <tbody>{''.join(filas_html)}</tbody>
  </table>
  <div class="totales">{totales_html}</div>
  {observaciones}
  {transferencia}
  <div class="pie">{esc(config.get('pie_documento', ''))}</div>
</div>
</body></html>"""


def csv_documentos(docs):
    """CSV (separador ;, codificación UTF-8 con BOM para Excel) con los documentos."""
    salida = io.StringIO()
    salida.write("﻿")
    w = csv.writer(salida, delimiter=";", lineterminator="\r\n")
    w.writerow(["Tipo", "Folio interno", "Folio SII", "Estado", "Fecha emisión",
                "Vencimiento", "RUT cliente", "Cliente", "Neto", "Exento", "IVA",
                "Retención", "Total", "Pagado", "Saldo", "Período", "Observaciones"])
    for d in docs:
        w.writerow([
            TIPOS_DOCUMENTO.get(d["tipo"], d["tipo"]), d.get("folio") or "",
            d.get("folio_sii", ""), d["estado"], formato_fecha(d["fecha_emision"]),
            formato_fecha(d["fecha_vencimiento"]), rut_mod.formatear(d["cliente_rut"]),
            d["cliente"], d["neto"], d["exento"], d["iva"], d["retencion"], d["total"],
            d.get("pagado", 0), d.get("saldo", 0), d.get("periodo", ""),
            d.get("observaciones", ""),
        ])
    return salida.getvalue()


def csv_clientes(clientes):
    salida = io.StringIO()
    salida.write("﻿")
    w = csv.writer(salida, delimiter=";", lineterminator="\r\n")
    w.writerow(["RUT", "Razón social", "Giro", "Dirección", "Comuna", "Ciudad", "Email",
                "Teléfono", "Contacto", "Notas", "Activo"])
    for c in clientes:
        w.writerow([rut_mod.formatear(c["rut"]), c["razon_social"], c["giro"], c["direccion"],
                    c["comuna"], c["ciudad"], c["email"], c["telefono"], c["contacto"],
                    c["notas"], "SI" if c["activo"] else "NO"])
    return salida.getvalue()


def leer_csv_clientes(texto):
    """Interpreta un CSV de clientes (; o , como separador). Devuelve lista de dicts."""
    texto = texto.lstrip("﻿")
    muestra = texto[:2048]
    try:
        dialecto = csv.Sniffer().sniff(muestra, delimiters=";,\t")
    except csv.Error:
        dialecto = csv.excel
        dialecto.delimiter = ";"
    lector = csv.DictReader(io.StringIO(texto), dialect=dialecto)
    equivalencias = {
        "rut": "rut", "razon social": "razon_social", "razón social": "razon_social",
        "nombre": "razon_social", "giro": "giro", "direccion": "direccion",
        "dirección": "direccion", "comuna": "comuna", "ciudad": "ciudad", "email": "email",
        "correo": "email", "telefono": "telefono", "teléfono": "telefono",
        "contacto": "contacto", "notas": "notas",
    }
    registros = []
    for fila in lector:
        limpio = {}
        for clave, valor in fila.items():
            if clave is None:
                continue
            destino = equivalencias.get(clave.strip().lower())
            if destino:
                limpio[destino] = (valor or "").strip()
        if limpio.get("rut") or limpio.get("razon_social"):
            registros.append(limpio)
    return registros


def texto_recordatorio(doc, config):
    """Texto de cobro para enviar por correo o WhatsApp."""
    emisor = config.get("emisor_razon_social") or "nuestro estudio"
    tipo_nombre = TIPOS_DOCUMENTO.get(doc["tipo"], doc["tipo"])
    folio = doc.get("folio_sii") or doc.get("folio") or "s/n"
    lineas = [
        f"Estimado(a) {doc['cliente']}:",
        "",
        f"Le recordamos que se encuentra pendiente de pago la {tipo_nombre.lower()} N° {folio}, "
        f"emitida el {formato_fecha(doc['fecha_emision'])} con vencimiento el "
        f"{formato_fecha(doc['fecha_vencimiento'])}, por un saldo de {formato_clp(doc['saldo'])}.",
        "",
    ]
    if config.get("datos_transferencia"):
        lineas += ["Datos para transferencia:", config["datos_transferencia"], ""]
    lineas += ["Si el pago ya fue realizado, agradeceremos enviarnos el comprobante.", "",
               "Atentamente,", emisor]
    return "\n".join(lineas)
