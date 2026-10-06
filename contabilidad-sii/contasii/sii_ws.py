"""Conexión con los servicios web del SII: autenticación automática (semilla y token).

Flujo descrito en el «Manual de Desarrollador Autenticación Automática» del SII
(https://www.sii.cl/factura_electronica/factura_mercado/autenticacion.pdf):

1. CrSeed.getSeed()            -> el SII entrega una semilla (no requiere certificado).
2. Se firma <getToken><item><Semilla>…</Semilla></item></getToken> con el certificado
   digital (firma XML envuelta: C14N inclusiva, RSA-SHA1, digest SHA1, KeyInfo con
   KeyValue y X509Data).
3. GetTokenFromSeed.getToken(xml_firmado) -> el SII entrega un token de sesión.

Sirve como prueba de que el certificado digital funciona ante el SII. El archivo
.pfx y su clave se usan solo en memoria: este módulo no los guarda.

Requiere la librería `cryptography` (solo para leer el .pfx y firmar).
"""

import base64
import hashlib
import html
import re
import ssl
import urllib.error
import urllib.request
from datetime import datetime, timezone

AMBIENTES = {
    "certificacion": "https://maullin.sii.cl/DTEWS",   # ambiente de pruebas del SII
    "produccion": "https://palena.sii.cl/DTEWS",
}

DS = "http://www.w3.org/2000/09/xmldsig#"
C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"


class ErrorSII(Exception):
    """Error comprensible para el usuario al conectarse con el SII."""


# Estados de GetTokenFromSeed según el manual de Autenticación Automática del SII
# (tabla «Estados de Salida de GetTokenFromSeed» y ejemplos del capítulo 6), con una
# explicación para el usuario. Los textos entre comillas del SII se muestran tal cual.
EXPLICACION_ESTADOS = {
    "01": "Problema en el formato del mensaje firmado (no es responsabilidad del usuario).",
    "02": "Problema en el formato del mensaje firmado (no es responsabilidad del usuario).",
    "03": "Problema en el formato del mensaje firmado (no es responsabilidad del usuario).",
    "04": "El SII no encontró la firma en el mensaje.",
    "05": "El SII consideró inválida la firma.",
    "06": "El SII no encontró la semilla en el mensaje.",
    "10": "El SII recibió la firma, pero no reconoce el certificado. Use un certificado vigente emitido por "
          "un proveedor acreditado.",
    "11": "El SII recibió la firma, pero no reconoce el certificado. Use un certificado vigente emitido por "
          "un proveedor acreditado.",
    "-07": "El SII no pudo validar el RUT asociado al certificado.",
    "-3": "Error de autenticación informado por el SII.",
}


# ------------------------------------------------------------------ certificado
def cargar_pfx(contenido: bytes, clave: str):
    """Abre un archivo .pfx/.p12. Devuelve (clave_privada, certificado)."""
    try:
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.primitives.serialization import pkcs12
    except ImportError as e:
        raise ErrorSII("Falta el componente «cryptography» para leer certificados. "
                       "Instálelo con: pip install cryptography") from e
    try:
        llave, cert, _ = pkcs12.load_key_and_certificates(contenido, (clave or "").encode("utf-8"))
    except ValueError:
        raise ErrorSII("No se pudo abrir el certificado: la clave es incorrecta o el archivo no es un .pfx válido.")
    if llave is None or cert is None:
        raise ErrorSII("El archivo no contiene la clave privada del certificado. "
                       "Expórtelo nuevamente incluyendo la clave privada.")
    if not isinstance(llave, rsa.RSAPrivateKey):
        raise ErrorSII("El certificado no usa una clave RSA, que es la que exige la firma del SII.")
    return llave, cert


def info_certificado(cert) -> dict:
    """Datos legibles del certificado: titular, emisor, vigencia."""
    from cryptography.x509.oid import NameOID

    def nombre(n, oid):
        v = n.get_attributes_for_oid(oid)
        return v[0].value if v else ""

    try:
        desde, hasta = cert.not_valid_before_utc, cert.not_valid_after_utc
    except AttributeError:  # cryptography < 42
        desde = cert.not_valid_before.replace(tzinfo=timezone.utc)
        hasta = cert.not_valid_after.replace(tzinfo=timezone.utc)
    ahora = datetime.now(timezone.utc)
    return {
        "titular": nombre(cert.subject, NameOID.COMMON_NAME),
        "identificador": nombre(cert.subject, NameOID.SERIAL_NUMBER),
        "correo": nombre(cert.subject, NameOID.EMAIL_ADDRESS),
        "emisor": nombre(cert.issuer, NameOID.COMMON_NAME) or nombre(cert.issuer, NameOID.ORGANIZATION_NAME),
        "valido_desde": desde.date().isoformat(),
        "valido_hasta": hasta.date().isoformat(),
        "vigente": desde <= ahora <= hasta,
        "dias_restantes": (hasta - ahora).days,
    }


# ------------------------------------------------------------------ firma XML
def _b64(datos: bytes) -> str:
    return base64.b64encode(datos).decode("ascii")


def _entero_b64(n: int) -> str:
    return _b64(n.to_bytes((n.bit_length() + 7) // 8, "big"))


def documento_semilla(semilla: str) -> str:
    """Documento a firmar. Ya está en forma canónica C14N (sin espacios ni atributos)."""
    if not re.fullmatch(r"\d{1,20}", semilla or ""):
        raise ErrorSII(f"Semilla inválida recibida del SII: {semilla!r}")
    return f"<getToken><item><Semilla>{semilla}</Semilla></item></getToken>"


def _signed_info(digest_b64: str, con_ns: bool) -> str:
    ns = f' xmlns="{DS}"' if con_ns else ""
    return (f'<SignedInfo{ns}><CanonicalizationMethod Algorithm="{C14N}"></CanonicalizationMethod>'
            f'<SignatureMethod Algorithm="{DS}rsa-sha1"></SignatureMethod>'
            f'<Reference URI=""><Transforms><Transform Algorithm="{DS}enveloped-signature"></Transform></Transforms>'
            f'<DigestMethod Algorithm="{DS}sha1"></DigestMethod><DigestValue>{digest_b64}</DigestValue>'
            f'</Reference></SignedInfo>')


def firmar_semilla(semilla: str, llave, cert) -> str:
    """Devuelve el XML <getToken> con firma XML envuelta, listo para GetTokenFromSeed."""
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding

    doc = documento_semilla(semilla)
    # Con la transformación «enveloped», el digest se calcula sobre el documento sin la firma.
    digest = _b64(hashlib.sha1(doc.encode("utf-8")).digest())
    # La forma canónica de SignedInfo hereda el espacio de nombres declarado en <Signature>.
    firma = llave.sign(_signed_info(digest, True).encode("utf-8"), padding.PKCS1v15(), hashes.SHA1())
    pub = llave.public_key().public_numbers()
    cert_b64 = _b64(cert.public_bytes(serialization.Encoding.DER))
    signature = (f'<Signature xmlns="{DS}">{_signed_info(digest, False)}'
                 f'<SignatureValue>{_b64(firma)}</SignatureValue>'
                 f'<KeyInfo><KeyValue><RSAKeyValue><Modulus>{_entero_b64(pub.n)}</Modulus>'
                 f'<Exponent>{_entero_b64(pub.e)}</Exponent></RSAKeyValue></KeyValue>'
                 f'<X509Data><X509Certificate>{cert_b64}</X509Certificate></X509Data></KeyInfo></Signature>')
    return '<?xml version="1.0"?>' + doc.replace("</getToken>", signature + "</getToken>")


# ------------------------------------------------------------------ SOAP
def _sobre(operacion: str, parametro: str | None = None, valor: str = "") -> bytes:
    cuerpo = f"<{operacion}/>" if parametro is None else (
        f'<{operacion}><{parametro} xsi:type="xsd:string">{html.escape(valor, quote=False)}</{parametro}></{operacion}>')
    return ('<?xml version="1.0" encoding="UTF-8"?>'
            '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" '
            'xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
            f'<soapenv:Body>{cuerpo}</soapenv:Body></soapenv:Envelope>').encode("utf-8")


def _llamar(url: str, cuerpo: bytes, timeout: float) -> str:
    req = urllib.request.Request(url, data=cuerpo, headers={
        "Content-Type": "text/xml; charset=utf-8", "SOAPAction": '""', "User-Agent": "contasii"})
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ssl.create_default_context()) as r:
            return r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        texto = e.read().decode("utf-8", "replace")
        falla = re.search(r"<faultstring>(.*?)</faultstring>", texto, re.S)
        raise ErrorSII(f"El SII respondió con error {e.code}: {html.unescape(falla.group(1)) if falla else texto[:300]}")
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise ErrorSII(f"No se pudo conectar con el SII ({url}). Revise su conexión a internet. Detalle: {e}")


def _respuesta_interna(soap: str, etiqueta_retorno: str) -> str:
    """El SII devuelve un XML escapado dentro del elemento <…Return>."""
    m = re.search(rf"<(?:\w+:)?{etiqueta_retorno}[^>]*>(.*?)</(?:\w+:)?{etiqueta_retorno}>", soap, re.S)
    if not m:
        raise ErrorSII("Respuesta inesperada del SII: " + soap[:300])
    return html.unescape(m.group(1))


def _campo(xml: str, nombre: str) -> str:
    m = re.search(rf"<(?:\w+:)?{nombre}>(.*?)</(?:\w+:)?{nombre}>", xml, re.S)
    return m.group(1).strip() if m else ""


def obtener_semilla(ambiente: str = "certificacion", timeout: float = 20) -> dict:
    if ambiente not in AMBIENTES:
        raise ErrorSII("Ambiente desconocido.")
    soap = _llamar(f"{AMBIENTES[ambiente]}/CrSeed.jws", _sobre("getSeed"), timeout)
    interna = _respuesta_interna(soap, "getSeedReturn")
    estado, semilla = _campo(interna, "ESTADO"), _campo(interna, "SEMILLA")
    if estado != "00" or not semilla:
        raise ErrorSII(f"El SII no entregó semilla (estado {estado or '?'}): {_campo(interna, 'GLOSA') or interna[:200]}")
    return {"semilla": semilla, "estado": estado}


def obtener_token(llave, cert, ambiente: str = "certificacion", timeout: float = 20) -> dict:
    semilla = obtener_semilla(ambiente, timeout)["semilla"]
    xml = firmar_semilla(semilla, llave, cert)
    soap = _llamar(f"{AMBIENTES[ambiente]}/GetTokenFromSeed.jws", _sobre("getToken", "pszXml", xml), timeout)
    interna = _respuesta_interna(soap, "getTokenReturn")
    estado, token, glosa = _campo(interna, "ESTADO"), _campo(interna, "TOKEN"), _campo(interna, "GLOSA")
    if estado != "00" or not token:
        explicacion = EXPLICACION_ESTADOS.get(estado, "")
        raise ErrorSII(f"El SII no entregó el permiso de acceso (estado {estado or '?'}: «{glosa or interna[:200]}»)."
                       + (f" {explicacion}" if explicacion else ""))
    return {"token": token, "estado": estado, "glosa": glosa}


def probar_certificado(contenido_pfx: bytes, clave: str, ambiente: str = "certificacion") -> dict:
    """Prueba completa: abre el .pfx, muestra sus datos y pide un token al SII."""
    llave, cert = cargar_pfx(contenido_pfx, clave)
    datos = info_certificado(cert)
    r = obtener_token(llave, cert, ambiente)
    t = r["token"]
    return {"certificado": datos, "ambiente": ambiente,
            "token_parcial": (t[:4] + "…" + t[-2:]) if len(t) > 8 else "…"}
