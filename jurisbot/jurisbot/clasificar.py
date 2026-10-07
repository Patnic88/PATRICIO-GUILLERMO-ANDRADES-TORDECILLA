"""Clasificador por reglas (sin costo, sin conexión) y extractor de normas citadas.

El clasificador asigna materias según palabras clave que aparecen en el texto.
Las normas citadas se extraen literalmente del texto: nunca se agregan normas
que el documento no menciona.
"""
from __future__ import annotations

import re
import unicodedata

# Taxonomía de materias. Cada materia tiene términos (frases) y un umbral de
# coincidencias. Los términos se comparan sin tildes y en minúsculas.
# Es un punto de partida: ajústela a su práctica y al público suscriptor.
TAXONOMIA: dict[str, dict] = {
    "laboral": {
        "nombre": "Derecho laboral",
        "terminos": ["codigo del trabajo", "despido", "finiquito", "indemnizacion por anos de servicio",
                     "tutela laboral", "tutela de derechos fundamentales", "remuneracion",
                     "horas extraordinarias", "sindicato", "negociacion colectiva", "relacion laboral",
                     "subordinacion y dependencia", "acoso laboral", "ley karin", "nulidad del despido",
                     "juzgado de letras del trabajo", "empleador", "trabajador"],
        "umbral": 2,
    },
    "municipal": {
        "nombre": "Derecho municipal",
        "terminos": ["municipalidad", "municipio", "alcalde", "concejo municipal", "concejal",
                     "ley 18.695", "organica constitucional de municipalidades", "decreto alcaldicio",
                     "direccion de obras municipales", "patente municipal"],
        "umbral": 2,
    },
    "empleo_publico": {
        "nombre": "Empleo público y función pública",
        "terminos": ["estatuto administrativo", "ley 18.834", "ley 18.883", "sumario administrativo",
                     "investigacion sumaria", "funcionario publico", "funcionaria publica", "a contrata",
                     "planta", "confianza legitima", "honorarios", "carrera funcionaria",
                     "responsabilidad administrativa"],
        "umbral": 2,
    },
    "contratacion_publica": {
        "nombre": "Contratación pública",
        "terminos": ["licitacion publica", "licitacion privada", "trato directo", "ley 19.886",
                     "compras publicas", "mercado publico", "bases de licitacion", "adjudicacion",
                     "contrato de suministro", "garantia de fiel cumplimiento"],
        "umbral": 2,
    },
    "tributario": {
        "nombre": "Derecho tributario",
        "terminos": ["impuesto", "iva", "impuesto a la renta", "ley sobre impuesto a la renta",
                     "codigo tributario", "contribuyente", "credito fiscal", "debito fiscal",
                     "liquidacion", "giro", "servicio de impuestos internos", "renta liquida imponible",
                     "decreto ley 825", "termino de giro", "factura electronica"],
        "umbral": 3,
    },
    "constitucional": {
        "nombre": "Derecho constitucional",
        "terminos": ["inaplicabilidad por inconstitucionalidad", "requerimiento de inaplicabilidad",
                     "inconstitucionalidad", "constitucion politica", "recurso de proteccion",
                     "accion de proteccion", "garantia constitucional", "debido proceso",
                     "igualdad ante la ley", "derecho de propiedad", "tribunal constitucional",
                     "recurso de amparo"],
        "umbral": 2,
    },
    "seguridad_social": {
        "nombre": "Seguridad social y previsión",
        "terminos": ["cotizaciones previsionales", "cotizacion previsional", "afp", "pension",
                     "isapre", "licencia medica", "seguro de cesantia", "accidente del trabajo",
                     "enfermedad profesional", "ley 16.744", "fonasa"],
        "umbral": 2,
    },
    "responsabilidad_estado": {
        "nombre": "Responsabilidad del Estado y civil",
        "terminos": ["falta de servicio", "indemnizacion de perjuicios", "responsabilidad extracontractual",
                     "dano moral", "lucro cesante", "dano emergente", "responsabilidad del estado"],
        "umbral": 2,
    },
    "probidad_transparencia": {
        "nombre": "Probidad y transparencia",
        "terminos": ["probidad", "transparencia", "ley 20.285", "acceso a la informacion publica",
                     "consejo para la transparencia", "conflicto de intereses", "lobby",
                     "declaracion de intereses y patrimonio"],
        "umbral": 2,
    },
    "urbanismo_ambiental": {
        "nombre": "Urbanismo y medio ambiente",
        "terminos": ["ley general de urbanismo y construcciones", "plan regulador", "permiso de edificacion",
                     "recepcion final", "evaluacion de impacto ambiental", "declaracion de impacto ambiental",
                     "estudio de impacto ambiental", "servicio de evaluacion ambiental", "bien nacional de uso publico"],
        "umbral": 2,
    },
    "penal": {
        "nombre": "Derecho penal",
        "terminos": ["imputado", "querella", "ministerio publico", "delito", "codigo penal",
                     "juicio oral", "tribunal de juicio oral en lo penal", "formalizacion"],
        "umbral": 3,
    },
    "familia": {
        "nombre": "Derecho de familia",
        "terminos": ["pension de alimentos", "cuidado personal", "relacion directa y regular",
                     "divorcio", "violencia intrafamiliar", "tribunal de familia"],
        "umbral": 2,
    },
    "consumidor": {
        "nombre": "Protección al consumidor",
        "terminos": ["ley 19.496", "proteccion de los derechos de los consumidores", "sernac",
                     "proveedor", "consumidor"],
        "umbral": 2,
    },
}


def normalizar(texto: str) -> str:
    """Minúsculas, sin tildes, espacios simples; 'N°'/'Nº' eliminados para comparar leyes."""
    t = unicodedata.normalize("NFKD", texto.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = re.sub(r"\bn\s*[°ºo]\.?\s*", " ", t)   # "ley n° 18.695" -> "ley 18.695"
    return " ".join(t.split())


def _contar(termino: str, texto_norm: str) -> int:
    return len(re.findall(r"(?<![a-z0-9])" + re.escape(termino) + r"(?![a-z0-9])", texto_norm))


def puntuar(texto: str, taxonomia: dict | None = None) -> dict[str, dict]:
    """Devuelve, por materia, cuántas veces aparece cada término y el total."""
    taxonomia = taxonomia or TAXONOMIA
    tn = normalizar(texto)
    resultado = {}
    for clave, m in taxonomia.items():
        hallados = {t: n for t in m["terminos"] if (n := _contar(t, tn))}
        if hallados:
            # 'distintos' pesa más que la repetición: un término repetido 20 veces
            # no debe bastar para clasificar.
            resultado[clave] = {"distintos": len(hallados), "total": sum(hallados.values()),
                                "terminos": hallados}
    return resultado


def clasificar(texto: str, taxonomia: dict | None = None, maximo: int = 4) -> list[str]:
    """Materias que superan su umbral de términos distintos, ordenadas por relevancia."""
    taxonomia = taxonomia or TAXONOMIA
    p = puntuar(texto, taxonomia)
    aptas = [(k, v) for k, v in p.items() if v["distintos"] >= taxonomia[k]["umbral"]]
    aptas.sort(key=lambda kv: (kv[1]["distintos"], kv[1]["total"]), reverse=True)
    return [k for k, _ in aptas[:maximo]]


# --- Extracción de normas citadas -------------------------------------------------

_LEY = re.compile(r"\b[Ll]ey\s+(?:N[°ºo]\.?\s*|n[úu]mero\s+)?(\d{1,2}\.\d{3}|\d{4,5})(?!\d)")
_DL = re.compile(r"\b(D\.?\s?L\.?|[Dd]ecreto\s+[Ll]ey)\s+(?:N[°ºo]\.?\s*)?(\d{1,4}(?:\.\d{3})?)(?!\d)")
_DFL = re.compile(r"\b(D\.?\s?F\.?\s?L\.?|[Dd]ecreto\s+con\s+[Ff]uerza\s+de\s+[Ll]ey)\s+"
                  r"(?:N[°ºo]\.?\s*)?(\d{1,4})(?:\s*,?\s*de\s+(\d{4}))?")
_NUM_ART = r"\d+(?:\s*(?:bis|ter|qu[áa]ter))?"
_ART_CODIGO = re.compile(
    r"\b[Aa]rt[íi]culos?\s+(" + _NUM_ART + r"(?:\s*(?:,|\by\b|\be\b)\s*" + _NUM_ART + r")*)"
    r"(?:,?\s+inciso\s+\w+)?"
    r"\s+del\s+(C[óo]digo\s+(?:del\s+Trabajo|Tributario|Civil|Penal|Procesal\s+Penal|"
    r"de\s+Procedimiento\s+Civil|Sanitario|de\s+Aguas|de\s+Comercio))")
_ART_CPR = re.compile(r"\b[Aa]rt[íi]culo\s+(\d+)(?:\s+N[°º]\s*(\d+))?\s+de\s+la\s+Constituci[óo]n")


def _num_ley(n: str) -> str:
    n = n.replace(".", "")
    return f"{int(n):,}".replace(",", ".") if len(n) > 3 else n


def extraer_normas(texto: str) -> list[str]:
    """Normas mencionadas literalmente en el texto, normalizadas y sin duplicados."""
    vistas: dict[str, None] = {}
    for m in _LEY.finditer(texto):
        vistas[f"Ley N° {_num_ley(m.group(1))}"] = None
    for m in _DL.finditer(texto):
        vistas[f"D.L. N° {_num_ley(m.group(2))}"] = None
    for m in _DFL.finditer(texto):
        anio = f", de {m.group(3)}" if m.group(3) else ""
        vistas[f"D.F.L. N° {m.group(2)}{anio}"] = None
    for m in _ART_CODIGO.finditer(texto):
        codigo = " ".join(m.group(2).split())
        codigo = codigo[0].upper() + codigo[1:]
        codigo = codigo.replace("Codigo", "Código")
        for num in re.split(r"\s*(?:,|\by\b|\be\b)\s*", m.group(1)):
            vistas[f"Art. {' '.join(num.split())} {codigo}"] = None
    for m in _ART_CPR.finditer(texto):
        num = f" N° {m.group(2)}" if m.group(2) else ""
        vistas[f"Art. {m.group(1)}{num} Constitución Política"] = None
    return list(vistas)


# --- Identificadores ---------------------------------------------------------------

_ROL = re.compile(r"\bRol\s+(?:N[°ºo]\.?\s*)?([\d\.]+-\d{4})", re.I)


def extraer_rol(texto: str) -> str:
    """Primer 'Rol N° xxxx-AAAA' que aparezca, o cadena vacía."""
    m = _ROL.search(texto)
    return m.group(1) if m else ""
