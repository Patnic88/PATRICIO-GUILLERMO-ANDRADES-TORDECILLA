"""Consulta del estado de documentos tributarios electrónicos (facturas, notas) en el SII.

Usa el servicio QueryEstDte.jws, operación getEstDte, según el «Manual de Desarrollador
Externo Consulta de Estado DTE» del SII
(https://www.sii.cl/factura_electronica/factura_mercado/estado_dte.pdf). Parámetros, en
este orden: RutConsultante, DvConsultante, RutCompania (emisor), DvCompania, RutReceptor,
DvReceptor, TipoDte, FolioDte, FechaEmisionDte, MontoDte (monto total) y Token.

Requiere un token de la autenticación automática (sii_ws.obtener_token), que se obtiene
con el certificado digital. La consulta solo lee información: no modifica nada en el SII.
"""

import re
from datetime import date

from . import rut as rutmod
from . import sii_ws
from .libro import Libro

# Formato de FechaEmisionDte según el manual de QueryEstDte (22/12/2010): «formato DDMMAAAA».
# Ojo: QueryEstDteAv (consulta avanzada) exige DD-MM-AAAA; aquí no se usa.
FORMATO_FECHA = "DDMMAAAA"

# Documentos que se consultan con este servicio (las boletas tienen servicios propios).
TIPOS_CONSULTABLES = {33, 34, 43, 46, 56, 61, 110, 111, 112}

# Estados de RESP_HDR/ESTADO según la tabla «Estado Tipo Largo Glosa» del manual,
# con una explicación para el usuario y un nivel: ok, revisar, problema.
ESTADOS = {
    "DOK": ("ok", "Recibido por el SII y los datos coinciden."),
    "DNK": ("revisar", "Recibido por el SII, pero los datos (fecha, monto o RUT) NO coinciden con lo registrado."),
    "FAU": ("problema", "El SII no tiene registrado este documento."),
    "FNA": ("problema", "Documento no autorizado."),
    "FAN": ("problema", "Documento anulado."),
    "EMP": ("problema", "La empresa emisora no está autorizada para emitir documentos electrónicos."),
    "TMD": ("revisar", "Existe una nota de débito que modifica textos del documento."),
    "TMC": ("revisar", "Existe una nota de crédito que modifica textos del documento."),
    "MMD": ("revisar", "Existe una nota de débito que modifica montos del documento."),
    "MMC": ("revisar", "Existe una nota de crédito que modifica montos del documento."),
    "AND": ("problema", "Existe una nota de débito que anula el documento."),
    "ANC": ("problema", "Existe una nota de crédito que anula el documento."),
}
# Estados de error del encabezado relativos al token. El manual indica 002 «Token Inactivo»
# y 003 «Token No Existe»; en la prueba real (12-10-2026) el SII respondió 001 «TOKEN NO EXISTE».
ESTADOS_TOKEN = {"001", "002", "003"}


class ErrorConsulta(sii_ws.ErrorSII):
    pass


def _fecha(iso: str) -> str:
    d = date.fromisoformat(iso)
    if FORMATO_FECHA == "DDMMAAAA":
        return d.strftime("%d%m%Y")
    if FORMATO_FECHA == "DD-MM-AAAA":
        return d.strftime("%d-%m-%Y")
    if FORMATO_FECHA == "AAAA-MM-DD":
        return d.isoformat()
    raise ValueError(f"Formato de fecha no soportado: {FORMATO_FECHA}")


def _partes(rut: str):
    cuerpo, dv = rutmod.normalizar(rut).split("-")
    return cuerpo, dv


def consultar(token: str, rut_consultante: str, rut_emisor: str, rut_receptor: str, tipo: int, folio,
              fecha_iso: str, monto: int, ambiente: str = "certificacion", timeout: float = 20) -> dict:
    """Consulta un documento. Devuelve estado, glosa, nivel, explicación y número de atención."""
    if ambiente not in sii_ws.AMBIENTES:
        raise ErrorConsulta("Ambiente del SII no válido.")
    if not re.fullmatch(r"\d{1,10}", str(folio)):
        raise ErrorConsulta(f"Folio inválido: {folio!r}")
    rc, dc = _partes(rut_consultante)
    re_, de = _partes(rut_emisor)
    rr, dr = _partes(rut_receptor)
    params = [("RutConsultante", rc), ("DvConsultante", dc), ("RutCompania", re_), ("DvCompania", de),
              ("RutReceptor", rr), ("DvReceptor", dr), ("TipoDte", str(int(tipo))), ("FolioDte", str(folio)),
              ("FechaEmisionDte", _fecha(fecha_iso)), ("MontoDte", str(abs(int(monto)))), ("Token", token)]
    soap = sii_ws._llamar(f"{sii_ws.AMBIENTES[ambiente]}/QueryEstDte.jws",
                          sii_ws._sobre_params("getEstDte", params), timeout)
    interna = sii_ws._respuesta_interna(soap, "getEstDteReturn")
    estado = sii_ws._campo(interna, "ESTADO")
    glosa = sii_ws._campo(interna, "GLOSA") or sii_ws._campo(interna, "GLOSA_ESTADO")
    if estado in ESTADOS_TOKEN:
        raise ErrorConsulta(f"El SII no aceptó el permiso de acceso (estado {estado}: «{glosa}»). "
                            "Vuelva a intentar; si persiste, pruebe su certificado en «Conexión SII».")
    nivel, explicacion = ESTADOS.get(estado, ("revisar", f"Respuesta no reconocida del SII: {glosa or interna[:200]}"))
    return {"estado": estado, "glosa": glosa, "nivel": nivel, "explicacion": explicacion,
            "err_code": sii_ws._campo(interna, "ERR_CODE"), "glosa_err": sii_ws._campo(interna, "GLOSA_ERR"),
            "num_atencion": re.sub(r"\s+", " ", sii_ws._campo(interna, "NUM_ATENCION"))}


def documentos_consultables(lib: Libro, periodo: str, libro_doc: str | None = None):
    """Documentos del período que se pueden consultar, con emisor y receptor según el libro."""
    rut_empresa = lib.contribuyente()["rut"]
    tipos = ",".join(str(t) for t in sorted(TIPOS_CONSULTABLES))
    sql = (f"SELECT * FROM documento WHERE eliminado IS NULL AND periodo=? AND libro IN ('compra','venta') AND tipo_dte IN ({tipos})"
           + (" AND libro=?" if libro_doc else "") + " ORDER BY libro, fecha, folio")
    args = (periodo, libro_doc) if libro_doc else (periodo,)
    out = []
    for d in lib.con.execute(sql, args):
        if not rutmod.es_valido(d["rut_contraparte"]):
            continue
        # En ventas (y en facturas de compra que emite la empresa) el emisor es la empresa.
        if d["libro"] == "venta":
            emisor, receptor = rut_empresa, d["rut_contraparte"]
        else:
            emisor, receptor = d["rut_contraparte"], rut_empresa
        out.append({"id": d["id"], "libro": d["libro"], "tipo": d["tipo_dte"], "folio": d["folio"],
                    "fecha": d["fecha"], "monto": d["total"], "emisor": emisor, "receptor": receptor,
                    "razon_social": d["razon_social"]})
    return out


def consultar_periodo(lib: Libro, periodo: str, contenido_pfx: bytes, clave: str, rut_consultante: str,
                      ambiente: str = "certificacion", libro_doc: str | None = None, consultar_fn=None) -> dict:
    """Consulta todos los documentos del período y guarda el resultado en la tabla estado_sii."""
    if not rutmod.es_valido(rut_consultante):
        raise ErrorConsulta("Indique un RUT válido de la persona titular del certificado (quien consulta).")
    docs = documentos_consultables(lib, periodo, libro_doc)
    if not docs:
        return {"resultados": [], "resumen": {}, "omitidos": 0}
    llave, cert = sii_ws.cargar_pfx(contenido_pfx, clave)
    token = sii_ws.obtener_token(llave, cert, ambiente)["token"]
    consultar_fn = consultar_fn or consultar
    resultados, resumen = [], {"ok": 0, "revisar": 0, "problema": 0, "error": 0}
    for d in docs:
        try:
            r = consultar_fn(token, rut_consultante, d["emisor"], d["receptor"], d["tipo"], d["folio"],
                             d["fecha"], d["monto"], ambiente)
        except ErrorConsulta:
            raise  # problema de token: se detiene toda la consulta
        except sii_ws.ErrorSII as e:
            r = {"estado": "", "glosa": str(e), "nivel": "error", "explicacion": str(e),
                 "err_code": "", "glosa_err": "", "num_atencion": ""}
        lib.con.execute("INSERT INTO estado_sii (documento, ambiente, estado, glosa, err_code, glosa_err, num_atencion)"
                        " VALUES (?,?,?,?,?,?,?)", (d["id"], ambiente, r["estado"], r["glosa"], r["err_code"],
                                                     r["glosa_err"], r["num_atencion"]))
        lib.con.commit()
        resumen[r["nivel"]] = resumen.get(r["nivel"], 0) + 1
        resultados.append({**d, **r})
    return {"resultados": resultados, "resumen": resumen, "ambiente": ambiente}


def ultimos_estados(lib: Libro, periodo: str) -> dict:
    """Último estado consultado de cada documento del período: {documento_id: {...}}."""
    out = {}
    for r in lib.con.execute(
            "SELECT e.* FROM estado_sii e JOIN documento d ON d.id=e.documento WHERE d.periodo=? ORDER BY e.id",
            (periodo,)):
        nivel, explicacion = ESTADOS.get(r["estado"] or "", ("error", r["glosa"] or ""))
        out[r["documento"]] = {"estado": r["estado"], "glosa": r["glosa"], "nivel": nivel, "explicacion": explicacion,
                               "consultado": r["consultado"], "ambiente": r["ambiente"]}
    return out
