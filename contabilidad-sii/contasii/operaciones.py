"""Operaciones frecuentes descritas en lenguaje simple, traducidas a asientos de partida doble.

Permiten registrar movimientos sin conocer cargos y abonos: el usuario elige
"Me pagó un cliente", indica monto, fecha y si fue por banco o caja, y el
sistema arma el asiento con las cuentas del plan.
"""

from .libro import Asiento, ErrorContable, Libro, Linea

MEDIOS = {"banco": "Cuenta bancaria", "caja": "Efectivo (caja)"}

# clave -> (título, explicación, [(clave de cuenta automática o 'medio', 'debe'|'haber')], pide_rut)
OPERACIONES = {
    "cobro_cliente": ("Me pagó un cliente", "Un cliente pagó una factura que le emití.",
                      [("medio", "debe"), ("clientes", "haber")], True),
    "pago_proveedor": ("Pagué a un proveedor", "Pagué una factura de compra.",
                       [("proveedores", "debe"), ("medio", "haber")], True),
    "pago_honorarios": ("Pagué una boleta de honorarios", "Pagué el líquido de una boleta de honorarios recibida.",
                        [("honorarios_por_pagar", "debe"), ("medio", "haber")], True),
    "gasto_sin_factura": ("Pagué un gasto sin factura", "Por ejemplo, una boleta de compra menor o un pasaje.",
                          [("gastos_generales", "debe"), ("medio", "haber")], False),
    "otro_ingreso": ("Recibí otro ingreso", "Un ingreso que no viene de una factura ni boleta emitida.",
                     [("medio", "debe"), ("otros_ingresos", "haber")], False),
    "aporte_capital": ("Aporte de capital", "El dueño o los socios pusieron dinero en la empresa.",
                       [("medio", "debe"), ("capital", "haber")], False),
    "retiro": ("Retiro del dueño", "El dueño o los socios sacaron dinero de la empresa.",
               [("retiros", "debe"), ("medio", "haber")], False),
    "deposito": ("Deposité efectivo en el banco", "Paso de dinero de la caja a la cuenta bancaria.",
                 [("banco", "debe"), ("caja", "haber")], False),
}

# Pago del F29: cada componente salda su cuenta de pasivo.
COMPONENTES_F29 = [
    ("iva_por_pagar", "IVA"),
    ("ppm_por_pagar", "PPM"),
    ("retencion_honorarios", "Retención de honorarios"),
    ("impuesto_unico_pagar", "Impuesto único (trabajadores)"),
    ("iva_retenido_pagar", "IVA retenido a terceros"),
]


def saldo_acreedor(lib: Libro, cuenta: str, hasta: str = "9999-12-31") -> int:
    r = lib.con.execute(
        "SELECT COALESCE(SUM(l.haber - l.debe),0) FROM linea l JOIN asiento a ON a.numero=l.asiento "
        "WHERE l.cuenta=? AND a.fecha<=?", (cuenta, hasta)).fetchone()
    return r[0]


def sugerencia_pago_f29(lib: Libro, hasta: str = "9999-12-31"):
    """Montos pendientes de pago en las cuentas de impuestos (para prellenar el formulario)."""
    return [(k, nombre, max(saldo_acreedor(lib, lib.cuenta_auto(k), hasta), 0)) for k, nombre in COMPONENTES_F29]


def registrar(lib: Libro, operacion: str, fecha: str, monto: int, medio: str = "banco",
              detalle: str = "", rut: str = "") -> int:
    if operacion not in OPERACIONES:
        raise ErrorContable(f"Operación desconocida: {operacion}")
    if medio not in MEDIOS:
        raise ErrorContable("Indique si el dinero salió o entró por banco o caja.")
    monto = int(monto)
    if monto <= 0:
        raise ErrorContable("El monto debe ser mayor que cero.")
    titulo, _, lineas, pide_rut = OPERACIONES[operacion]
    glosa = titulo + (f": {detalle}" if detalle else "")
    tipo = "ingreso" if lineas[0][0] == "medio" else "egreso" if lineas[1][0] == "medio" else "traspaso"
    a = Asiento(fecha, glosa, tipo=tipo, origen="operacion")
    for clave, lado in lineas:
        cuenta = lib.cuenta_auto(medio if clave == "medio" else clave)
        aux = rut if (pide_rut and rut and clave != "medio") else ""
        a.lineas.append(Linea(cuenta, debe=monto if lado == "debe" else 0,
                              haber=monto if lado == "haber" else 0, rut_aux=aux))
    return lib.registrar(a)


def registrar_pago_f29(lib: Libro, fecha: str, periodo: str, montos: dict, medio: str = "banco") -> int:
    """montos: {clave de COMPONENTES_F29: monto}. Registra el pago del formulario 29 de un período."""
    if medio not in MEDIOS:
        raise ErrorContable("Indique si pagó por banco o caja.")
    a = Asiento(fecha, f"Pago F29 período {periodo}", tipo="egreso", origen="operacion")
    total = 0
    for clave, _ in COMPONENTES_F29:
        m = int(montos.get(clave) or 0)
        if m < 0:
            raise ErrorContable("Los montos no pueden ser negativos.")
        if m:
            a.lineas.append(Linea(lib.cuenta_auto(clave), debe=m))
            total += m
    if not total:
        raise ErrorContable("No hay montos a pagar.")
    a.lineas.append(Linea(lib.cuenta_auto(medio), haber=total))
    return lib.registrar(a)
