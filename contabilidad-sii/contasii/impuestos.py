"""Cálculos tributarios: propuesta de F29, impuesto único de segunda categoría y plazos.

La propuesta de F29 es un BORRADOR de trabajo para cotejar con la propuesta
del SII en sii.cl; no reemplaza la declaración ni la revisión profesional.
"""

from dataclasses import dataclass, field
from datetime import date, timedelta

from .libro import Asiento, ErrorContable, Libro, Linea, periodo_de
from .parametros import ParametroFaltante, Parametros
from .rcv import FACTURAS_COMPRA, NOTAS_CREDITO


def periodo_anterior(periodo: str) -> str:
    y, m = map(int, periodo.split("-"))
    return f"{y - 1}-12" if m == 1 else f"{y}-{m - 1:02d}"


def periodo_siguiente(periodo: str) -> str:
    y, m = map(int, periodo.split("-"))
    return f"{y + 1}-01" if m == 12 else f"{y}-{m + 1:02d}"


# ---------------------------------------------------------------- impuesto único
def impuesto_unico(renta_tributable: int, utm: int, tramos) -> int:
    """Impuesto único de segunda categoría mensual, por tramos progresivos expresados en UTM.

    tramos: lista de [desde_utm, hasta_utm o null, tasa].
    """
    if renta_tributable <= 0:
        return 0
    imp = 0.0
    for desde, hasta, tasa in tramos:
        lim_inf = desde * utm
        lim_sup = renta_tributable if hasta is None else min(hasta * utm, renta_tributable)
        if renta_tributable > lim_inf and lim_sup > lim_inf:
            imp += (lim_sup - lim_inf) * tasa
    return int(round(imp))


# ---------------------------------------------------------------- F29
@dataclass
class PropuestaF29:
    periodo: str
    lineas: list = field(default_factory=list)   # (clave, descripción, monto)
    alertas: list = field(default_factory=list)
    verificar: list = field(default_factory=list)
    remanente_siguiente: int = 0
    total_a_pagar: int = 0

    def monto(self, clave):
        return next((m for c, _, m in self.lineas if c == clave), 0)


def _suma(lib, sql, args):
    return lib.con.execute(sql, args).fetchone()[0] or 0


def _signo_sql():
    nc = ",".join(str(x) for x in sorted(NOTAS_CREDITO))
    return f"CASE WHEN tipo_dte IN ({nc}) THEN -1 ELSE 1 END"


def propuesta_f29(lib: Libro, params: Parametros, periodo: str, *, impuesto_unico_mes: int = 0,
                  tasa_ppm: float | None = None, factor_uso_comun: float | None = None,
                  remanente_anterior: int | None = None) -> PropuestaF29:
    c = lib.contribuyente()
    if not c:
        raise ErrorContable("Base no inicializada.")
    p = PropuestaF29(periodo)
    s = _signo_sql()
    fc = ",".join(str(x) for x in sorted(FACTURAS_COMPRA))

    # Débito fiscal
    debito = _suma(lib, f"SELECT SUM(iva*{s}) FROM documento WHERE libro='venta' AND periodo=? "
                        f"AND (tipo_dte IS NULL OR tipo_dte NOT IN ({fc}))", (periodo,))
    iva_ret_fc = _suma(lib, f"SELECT SUM(CASE WHEN iva_retenido>0 THEN iva_retenido ELSE iva END*{s}) "
                            f"FROM documento WHERE libro='venta' AND periodo=? AND tipo_dte IN ({fc})", (periodo,))
    n_ret_ventas = _suma(lib, f"SELECT COUNT(*) FROM documento WHERE libro='venta' AND periodo=? AND iva_retenido>0 "
                              f"AND tipo_dte NOT IN ({fc})", (periodo,))
    if n_ret_ventas:
        p.alertas.append(f"{n_ret_ventas} venta(s) con IVA retenido por el comprador: ajustar el débito declarado.")

    # Crédito fiscal
    credito = _suma(lib, f"SELECT SUM(iva*{s}) FROM documento WHERE libro='compra' AND periodo=?", (periodo,))
    credito_fc = _suma(lib, f"SELECT SUM(iva*{s}) FROM documento WHERE libro='venta' AND periodo=? "
                            f"AND tipo_dte IN ({fc})", (periodo,))
    uso_comun = _suma(lib, f"SELECT SUM(iva_uso_comun*{s}) FROM documento WHERE libro='compra' AND periodo=?",
                      (periodo,))
    credito_uc = 0
    if uso_comun:
        if factor_uso_comun is None:
            p.alertas.append(f"IVA de uso común {uso_comun} NO incluido: indique el factor de proporcionalidad.")
        else:
            credito_uc = int(round(uso_comun * factor_uso_comun))
    if iva_ret_fc:
        p.alertas.append("Facturas de compra emitidas: el crédito por IVA retenido se incluyó; "
                         "verificar su tratamiento en la propuesta del SII.")

    # Remanente del período anterior, reajustado según variación de la UTM si está disponible
    ant = periodo_anterior(periodo)
    if remanente_anterior is None:
        r = lib.con.execute("SELECT monto FROM remanente_iva WHERE periodo=?", (ant,)).fetchone()
        remanente_anterior = r["monto"] if r else 0
        if not r:
            p.alertas.append(f"No hay remanente registrado para {ant}; se usó 0. Confirme contra el F29 anterior.")
    rem_reaj = remanente_anterior
    if remanente_anterior:
        try:
            rem_reaj = int(round(remanente_anterior * params.utm(periodo) / params.utm(ant)))
        except ParametroFaltante as e:
            p.alertas.append(f"Remanente sin reajustar: {e}")

    credito_total = credito + credito_fc + credito_uc + rem_reaj
    debito_total = debito + iva_ret_fc
    iva_determinado = debito_total - credito_total
    iva_pagar = max(iva_determinado, 0)
    p.remanente_siguiente = max(-iva_determinado, 0)

    # PPM
    ingresos = _suma(lib, f"SELECT SUM((neto+exento)*{s}) FROM documento WHERE libro='venta' AND periodo=? "
                          f"AND (tipo_dte IS NULL OR tipo_dte NOT IN ({fc}))", (periodo,))
    ingresos += _suma(lib, "SELECT SUM(bruto) FROM documento WHERE libro='honorario_emitido' AND periodo=?",
                      (periodo,))
    ppm = 0
    reg = c["regimen"]
    if reg == "PN_HONORARIOS":
        base_ppm = _suma(lib, "SELECT SUM(bruto) FROM documento WHERE libro='honorario_emitido' AND periodo=? "
                              "AND retencion=0", (periodo,))
        if base_ppm:
            tasa = tasa_ppm if tasa_ppm is not None else params.valor_opcional("ppm_honorarios_sin_retencion")
            if tasa is None:
                p.alertas.append(f"Boletas emitidas sin retención por {base_ppm}: PPM no calculado por falta de "
                                 "tasa verificada (use --tasa-ppm).")
            else:
                ppm = int(round(base_ppm * tasa))
    else:
        base_ppm = ingresos
        if tasa_ppm is None:
            clave = {"14A": "ppm_14A", "14D3": "ppm_14D3", "14D8": "ppm_14D8"}[reg]
            try:
                tasa_ppm = params.valor(clave)
            except ParametroFaltante as e:
                p.alertas.append(f"PPM no calculado: {e} (o use --tasa-ppm).")
                tasa_ppm = None
        if tasa_ppm is not None and base_ppm > 0:
            ppm = int(round(base_ppm * tasa_ppm))

    ret_hon = _suma(lib, "SELECT SUM(retencion) FROM documento WHERE libro='honorario_recibido' AND periodo=?",
                    (periodo,))

    p.lineas = [
        ("debito_fiscal", "IVA débito fiscal (ventas, neto de notas de crédito)", debito),
        ("iva_retenido_fc", "IVA retenido en facturas de compra emitidas", iva_ret_fc),
        ("credito_fiscal", "IVA crédito fiscal (compras, neto de notas de crédito)", credito + credito_fc),
        ("credito_uso_comun", "IVA crédito uso común proporcional", credito_uc),
        ("remanente_anterior", "Remanente de crédito del período anterior (reajustado)", rem_reaj),
        ("iva_determinado", "IVA determinado (débitos − créditos)", iva_determinado),
        ("remanente_siguiente", "Remanente de crédito para el período siguiente", p.remanente_siguiente),
        ("base_ppm", "Base imponible PPM (ingresos brutos del mes)", base_ppm),
        ("ppm", "PPM", ppm),
        ("retencion_honorarios", "Retención impuesto sobre honorarios", ret_hon),
        ("impuesto_unico", "Impuesto único de segunda categoría (remuneraciones)", int(impuesto_unico_mes)),
    ]
    p.total_a_pagar = iva_pagar + ppm + ret_hon + int(impuesto_unico_mes)
    p.lineas.append(("total_a_pagar", "TOTAL A PAGAR", p.total_a_pagar))
    if not impuesto_unico_mes:
        p.alertas.append("Impuesto único: 0. Si hay trabajadores, ingréselo desde el libro de remuneraciones.")
    p.verificar = params.advertencias()
    return p


def codigos_f29(params: Parametros):
    """Mapa clave->código del formulario, solo si figura en parámetros (con su estado)."""
    return params.datos.get("codigos_f29", {})


def guardar_remanente(lib: Libro, periodo: str, monto: int):
    with lib.con:
        lib.con.execute("INSERT INTO remanente_iva (periodo, monto) VALUES (?,?) "
                        "ON CONFLICT(periodo) DO UPDATE SET monto=excluded.monto", (periodo, int(monto)))


def contabilizar_f29(lib: Libro, p: PropuestaF29) -> int:
    """Asiento de centralización de IVA, PPM y retenciones del período (al último día del mes)."""
    from calendar import monthrange
    A = lib.cuenta_auto
    y, m = map(int, p.periodo.split("-"))
    fecha = f"{p.periodo}-{monthrange(y, m)[1]:02d}"
    deb = p.monto("debito_fiscal")
    ret_fc = p.monto("iva_retenido_fc")
    cred_usado = min(deb + ret_fc, p.monto("credito_fiscal") + p.monto("credito_uso_comun")
                     + p.monto("remanente_anterior"))
    iva_pagar = max(p.monto("iva_determinado"), 0)
    a = Asiento(fecha, f"Centralización F29 {p.periodo}", tipo="traspaso", origen="f29")
    if deb > 0:
        a.cargar(A("iva_df"), deb)
    elif deb < 0:
        a.abonar(A("iva_df"), -deb)
    if ret_fc:
        a.cargar(A("iva_retenido_pagar"), ret_fc)
        a.abonar(A("iva_por_pagar"), ret_fc)
        iva_pagar -= ret_fc
    if cred_usado:
        a.abonar(A("iva_cf"), cred_usado)
    if iva_pagar > 0:
        a.abonar(A("iva_por_pagar"), iva_pagar)
    elif iva_pagar < 0:
        a.cargar(A("iva_por_pagar"), -iva_pagar)
    if p.monto("ppm"):
        a.cargar(A("ppm_por_recuperar"), p.monto("ppm"))
        a.abonar(A("ppm_por_pagar"), p.monto("ppm"))
    # El asiento de IVA puede quedar con una sola línea útil si no hubo movimiento
    if len(a.lineas) < 2:
        raise ErrorContable("No hay movimientos de IVA/PPM que centralizar en el período.")
    return lib.registrar(a)


# ---------------------------------------------------------------- plazos
def vencimiento_f29(params: Parametros, periodo: str, electronico: bool = True) -> tuple[date, list]:
    """Fecha de vencimiento del F29 del período (se declara el mes siguiente).

    Si el día cae en sábado, domingo o feriado registrado en parámetros, se
    corre al día hábil siguiente según la regla cargada en parámetros.
    """
    notas = []
    clave = "plazo_f29_dia_electronico" if electronico else "plazo_f29_dia"
    dia = int(params.valor(clave))
    sig = periodo_siguiente(periodo)
    y, m = map(int, sig.split("-"))
    f = date(y, m, dia)
    feriados = set(params.datos.get("feriados", {}).get("fechas", []))
    if not feriados:
        notas.append("No hay feriados cargados en parámetros: verifique el calendario del SII.")
    if params.valor_opcional("prorroga_dia_habil"):
        while f.weekday() >= 5 or f.isoformat() in feriados:
            f += timedelta(days=1)
    elif f.weekday() >= 5 or f.isoformat() in feriados:
        notas.append(f"El {f.isoformat()} es día inhábil y la regla de prórroga no está verificada en "
                     "parámetros: confirme el vencimiento en el calendario del SII.")
    return f, notas
