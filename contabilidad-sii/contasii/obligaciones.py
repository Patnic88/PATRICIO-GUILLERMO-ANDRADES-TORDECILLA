"""Obligaciones de registro por régimen, con su norma y estado de verificación.

Estado FUENTE_OFICIAL_INDIRECTA: obtenido de buscadores acotados a sii.cl /
bcn.cl / dt.gob.cl el 06-10-2026, sin lectura directa del documento.
Antes de usar esta lista en un informe a un cliente o ante el SII, lea la norma.
"""

IND = "FUENTE_OFICIAL_INDIRECTA"
PEND = "PENDIENTE"

COMUNES = [
    ("Registro de Compras y Ventas (RCV) en sii.cl: reemplaza al Libro de Compras y Ventas",
     "Res. Ex. SII N°61, de 12-07-2017", IND),
    ("Declaración y pago mensual F29 (IVA, PPM, retenciones): día 12 del mes siguiente; día 20 si declara por "
     "internet y emite documentos electrónicos", "art. 64 DL 825; D.S. Hacienda N°1.001 de 2006", IND),
    ("Conservar libros y documentos mientras corra el plazo de prescripción (documentación: 6 años)",
     "art. 17 inciso final y art. 200 Código Tributario", IND),
    ("Libro de Remuneraciones Electrónico (LRE) en Mi DT, si tiene trabajadores",
     "Ley 21.327; art. 62 Código del Trabajo", IND),
]

POR_REGIMEN = {
    "14A": [
        ("Contabilidad completa: Libro Diario, Mayor e Inventarios y Balances",
         "art. 17 Código Tributario; art. 68 LIR; Código de Comercio", IND),
        ("Libros contables electrónicos (si lleva contabilidad electrónica)",
         "Res. Ex. SII N°150 de 2005 [VERIFICAR vigencia]; Res. Ex. SII N°13 de 09-02-2021", IND),
        ("Balance tributario (8 columnas) y determinación de la RLI para el F22", "art. 14 letra A y art. 29 ss. LIR", PEND),
    ],
    "14D3": [
        ("Determinar si corresponde contabilidad completa o simplificada (no confirmado en esta versión)",
         "art. 14 letra D N°3 LIR [VERIFICAR]", PEND),
        ("Libro de Caja y Libro de Ingresos y Egresos según corresponda",
         "Res. Ex. SII N°14 de 2021 (complementada por Res. Ex. N°31 de 2021)", IND),
    ],
    "14D8": [
        ("Liberado de contabilidad completa, inventarios, balance, depreciación y corrección monetaria; "
         "registra en RCV (o libro de ingresos y egresos) y Libro de Caja. Puede optar por contabilidad completa",
         "art. 14 letra D N°8 LIR; Res. Ex. SII N°14 de 2021", IND),
    ],
    "PN_HONORARIOS": [
        ("Emisión de boletas de honorarios electrónicas y retención o PPM según corresponda",
         "art. 42 N°2, art. 74 N°2 y art. 84 letra b) LIR", PEND),
        ("Opción de gastos efectivos (con respaldo) o presuntos para el F22", "art. 50 LIR [VERIFICAR]", PEND),
    ],
}


def listar(regimen: str):
    return POR_REGIMEN.get(regimen, []) + COMUNES
