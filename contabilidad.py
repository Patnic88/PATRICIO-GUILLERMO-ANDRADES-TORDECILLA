#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Contabilidad automática — partida doble, balances y reportes.

Programa de línea de comandos, sin dependencias externas, que permite:

  • Mantener un Plan de Cuentas (chart of accounts).
  • Registrar Asientos contables por partida doble (debe = haber).
  • Generar automáticamente:
      - Libro Diario           (diario)
      - Libro Mayor            (mayor)
      - Balance de Comprobación / Sumas y Saldos   (comprobacion)
      - Balance General / Estado de Situación      (balance)
      - Estado de Resultados                        (resultados)
      - Ingresos vs. Gastos (caja simple)           (caja)

Los montos se manejan con Decimal para no perder precisión.
Los datos se guardan en un archivo JSON (por defecto contabilidad.json).

Uso rápido:
    python3 contabilidad.py init                 # crea el plan de cuentas base
    python3 contabilidad.py                       # abre el menú interactivo
    python3 contabilidad.py comprobacion          # balance de comprobación
    python3 contabilidad.py balance               # balance general

Ejecuta `python3 contabilidad.py --help` para ver todos los comandos.

Autor: generado para Patricio Andrades — Dirección Jurídica, Municipalidad de Los Vilos.
"""

from __future__ import annotations

import argparse
import csv
import datetime as _dt
import json
import os
import sys
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

# --------------------------------------------------------------------------- #
# Configuración general
# --------------------------------------------------------------------------- #

ARCHIVO_POR_DEFECTO = os.environ.get("CONTAB_DATA", "contabilidad.json")
DOS_DECIMALES = Decimal("0.01")

# Tipos de cuenta y su naturaleza (lado del saldo normal).
#   "deudor"  -> el saldo normal aumenta por el DEBE  (Activo, Gasto)
#   "acreedor"-> el saldo normal aumenta por el HABER (Pasivo, Patrimonio, Ingreso)
TIPOS = {
    "ACTIVO": "deudor",
    "PASIVO": "acreedor",
    "PATRIMONIO": "acreedor",
    "INGRESO": "acreedor",
    "GASTO": "deudor",
}

# Plan de cuentas base (estilo chileno) usado por `init`.
PLAN_BASE = [
    # código,    nombre,                              tipo
    ("1.1.01", "Caja", "ACTIVO"),
    ("1.1.02", "Banco", "ACTIVO"),
    ("1.1.03", "Clientes / Cuentas por cobrar", "ACTIVO"),
    ("1.1.04", "IVA Crédito Fiscal", "ACTIVO"),
    ("1.2.01", "Muebles y útiles", "ACTIVO"),
    ("1.2.02", "Equipos computacionales", "ACTIVO"),
    ("2.1.01", "Proveedores", "PASIVO"),
    ("2.1.02", "IVA Débito Fiscal", "PASIVO"),
    ("2.1.03", "Remuneraciones por pagar", "PASIVO"),
    ("2.1.04", "Préstamos bancarios", "PASIVO"),
    ("3.1.01", "Capital", "PATRIMONIO"),
    ("3.1.02", "Resultados acumulados", "PATRIMONIO"),
    ("4.1.01", "Ingresos por servicios", "INGRESO"),
    ("4.1.02", "Ventas", "INGRESO"),
    ("4.1.03", "Otros ingresos", "INGRESO"),
    ("5.1.01", "Sueldos y remuneraciones", "GASTO"),
    ("5.1.02", "Arriendo", "GASTO"),
    ("5.1.03", "Servicios básicos", "GASTO"),
    ("5.1.04", "Gastos generales", "GASTO"),
]


# --------------------------------------------------------------------------- #
# Utilidades de dinero y formato
# --------------------------------------------------------------------------- #

def a_decimal(valor) -> Decimal:
    """Convierte un valor (str/int/float) a Decimal con 2 decimales."""
    try:
        d = Decimal(str(valor).strip().replace(",", "."))
    except (InvalidOperation, AttributeError):
        raise ValueError(f"Monto no válido: {valor!r}")
    return d.quantize(DOS_DECIMALES, rounding=ROUND_HALF_UP)


def fmt(monto: Decimal) -> str:
    """Formatea un Decimal con separador de miles y 2 decimales."""
    monto = monto.quantize(DOS_DECIMALES, rounding=ROUND_HALF_UP)
    entero, _, dec = f"{abs(monto):.2f}".partition(".")
    grupos = []
    while len(entero) > 3:
        grupos.insert(0, entero[-3:])
        entero = entero[:-3]
    grupos.insert(0, entero)
    cuerpo = ".".join(grupos) + "," + dec
    return ("-" if monto < 0 else "") + cuerpo


def col(texto: str, ancho: int, der: bool = False) -> str:
    texto = str(texto)
    if len(texto) > ancho:
        texto = texto[: ancho - 1] + "…"
    return texto.rjust(ancho) if der else texto.ljust(ancho)


def hoy() -> str:
    return _dt.date.today().isoformat()


def valida_fecha(texto: str) -> str:
    try:
        _dt.date.fromisoformat(texto)
    except ValueError:
        raise ValueError(f"Fecha no válida (use AAAA-MM-DD): {texto!r}")
    return texto


# --------------------------------------------------------------------------- #
# Modelo / persistencia
# --------------------------------------------------------------------------- #

class Libro:
    """Estructura de datos: plan de cuentas + asientos, con carga/guardado."""

    def __init__(self, ruta: str):
        self.ruta = ruta
        self.empresa = "Mi contabilidad"
        self.moneda = "CLP"
        self.cuentas: dict[str, dict] = {}   # codigo -> {nombre, tipo}
        self.asientos: list[dict] = []       # [{numero, fecha, glosa, lineas:[{cuenta,debe,haber}]}]

    # ---- carga / guardado ------------------------------------------------- #
    @classmethod
    def cargar(cls, ruta: str) -> "Libro":
        libro = cls(ruta)
        if os.path.exists(ruta):
            with open(ruta, "r", encoding="utf-8") as f:
                datos = json.load(f)
            libro.empresa = datos.get("empresa", libro.empresa)
            libro.moneda = datos.get("moneda", libro.moneda)
            libro.cuentas = datos.get("cuentas", {})
            libro.asientos = datos.get("asientos", [])
        return libro

    def guardar(self) -> None:
        datos = {
            "empresa": self.empresa,
            "moneda": self.moneda,
            "cuentas": self.cuentas,
            "asientos": self.asientos,
        }
        tmp = self.ruta + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=2)
        os.replace(tmp, self.ruta)

    # ---- plan de cuentas -------------------------------------------------- #
    def agregar_cuenta(self, codigo: str, nombre: str, tipo: str) -> None:
        codigo = codigo.strip()
        tipo = tipo.strip().upper()
        if tipo not in TIPOS:
            raise ValueError(
                f"Tipo no válido: {tipo!r}. Use uno de: {', '.join(TIPOS)}"
            )
        if codigo in self.cuentas:
            raise ValueError(f"La cuenta {codigo} ya existe.")
        self.cuentas[codigo] = {"nombre": nombre.strip(), "tipo": tipo}

    def existe(self, codigo: str) -> bool:
        return codigo in self.cuentas

    def nombre(self, codigo: str) -> str:
        return self.cuentas.get(codigo, {}).get("nombre", "(cuenta desconocida)")

    def tipo(self, codigo: str) -> str:
        return self.cuentas.get(codigo, {}).get("tipo", "")

    def siguiente_numero(self) -> int:
        return (max((a["numero"] for a in self.asientos), default=0)) + 1

    # ---- asientos --------------------------------------------------------- #
    def agregar_asiento(self, fecha: str, glosa: str, lineas: list[dict]) -> dict:
        """lineas: lista de {cuenta, debe, haber} con Decimals ya validados."""
        valida_fecha(fecha)
        if len(lineas) < 2:
            raise ValueError("Un asiento necesita al menos 2 líneas (debe y haber).")

        total_debe = Decimal("0")
        total_haber = Decimal("0")
        for ln in lineas:
            if not self.existe(ln["cuenta"]):
                raise ValueError(f"La cuenta {ln['cuenta']} no existe en el plan.")
            debe = a_decimal(ln.get("debe", 0))
            haber = a_decimal(ln.get("haber", 0))
            if debe < 0 or haber < 0:
                raise ValueError("Los montos no pueden ser negativos.")
            if debe > 0 and haber > 0:
                raise ValueError(
                    f"La línea de {ln['cuenta']} no puede tener debe y haber a la vez."
                )
            if debe == 0 and haber == 0:
                raise ValueError(
                    f"La línea de {ln['cuenta']} debe tener un monto en debe o en haber."
                )
            ln["debe"] = str(debe)
            ln["haber"] = str(haber)
            total_debe += debe
            total_haber += haber

        if total_debe != total_haber:
            raise ValueError(
                "El asiento no cuadra: "
                f"debe = {fmt(total_debe)} ≠ haber = {fmt(total_haber)} "
                f"(diferencia {fmt(total_debe - total_haber)})."
            )

        asiento = {
            "numero": self.siguiente_numero(),
            "fecha": fecha,
            "glosa": glosa.strip(),
            "lineas": lineas,
        }
        self.asientos.append(asiento)
        return asiento

    # ---- cálculo de saldos ------------------------------------------------ #
    def movimientos_por_cuenta(self) -> dict[str, dict]:
        """Devuelve por cuenta: {debe, haber} acumulados (solo cuentas con uso o del plan)."""
        acum = {c: {"debe": Decimal("0"), "haber": Decimal("0")} for c in self.cuentas}
        for asiento in self.asientos:
            for ln in asiento["lineas"]:
                c = ln["cuenta"]
                acum.setdefault(c, {"debe": Decimal("0"), "haber": Decimal("0")})
                acum[c]["debe"] += a_decimal(ln.get("debe", 0))
                acum[c]["haber"] += a_decimal(ln.get("haber", 0))
        return acum

    def saldo(self, codigo: str, mov: dict) -> Decimal:
        """Saldo según naturaleza de la cuenta (positivo en su lado normal)."""
        naturaleza = TIPOS.get(self.tipo(codigo), "deudor")
        if naturaleza == "deudor":
            return mov["debe"] - mov["haber"]
        return mov["haber"] - mov["debe"]


# --------------------------------------------------------------------------- #
# Reportes
# --------------------------------------------------------------------------- #

def encabezado(libro: Libro, titulo: str) -> None:
    print()
    print("=" * 78)
    print(f"  {libro.empresa}  —  {titulo}")
    print(f"  Moneda: {libro.moneda}   ·   Generado: {hoy()}")
    print("=" * 78)


def rep_plan(libro: Libro) -> None:
    encabezado(libro, "Plan de Cuentas")
    if not libro.cuentas:
        print("  (sin cuentas; ejecuta `init` o agrega con `cuenta-add`)")
        return
    print(f"  {col('Código', 10)}{col('Cuenta', 42)}{col('Tipo', 14)}")
    print("  " + "-" * 66)
    for codigo in sorted(libro.cuentas):
        c = libro.cuentas[codigo]
        print(f"  {col(codigo, 10)}{col(c['nombre'], 42)}{col(c['tipo'], 14)}")
    print(f"\n  Total: {len(libro.cuentas)} cuentas.")


def rep_diario(libro: Libro) -> None:
    encabezado(libro, "Libro Diario")
    if not libro.asientos:
        print("  (no hay asientos registrados)")
        return
    td = th = Decimal("0")
    for a in libro.asientos:
        print(f"\n  Asiento N° {a['numero']}  ·  {a['fecha']}  ·  {a['glosa']}")
        print(f"    {col('Cuenta', 10)}{col('Detalle', 36)}"
              f"{col('Debe', 15, True)}{col('Haber', 15, True)}")
        for ln in a["lineas"]:
            debe = a_decimal(ln.get("debe", 0))
            haber = a_decimal(ln.get("haber", 0))
            td += debe
            th += haber
            print(f"    {col(ln['cuenta'], 10)}{col(libro.nombre(ln['cuenta']), 36)}"
                  f"{col(fmt(debe) if debe else '', 15, True)}"
                  f"{col(fmt(haber) if haber else '', 15, True)}")
    print("\n  " + "-" * 76)
    print(f"    {col('TOTALES', 46)}{col(fmt(td), 15, True)}{col(fmt(th), 15, True)}")


def rep_mayor(libro: Libro, solo: str | None = None) -> None:
    encabezado(libro, "Libro Mayor")
    movimientos = {}
    for a in libro.asientos:
        for ln in a["lineas"]:
            movimientos.setdefault(ln["cuenta"], []).append((a, ln))

    codigos = [solo] if solo else sorted(movimientos)
    if solo and solo not in libro.cuentas:
        print(f"  La cuenta {solo} no existe en el plan.")
        return
    if not movimientos:
        print("  (no hay movimientos)")
        return

    for codigo in codigos:
        lineas = movimientos.get(codigo, [])
        print(f"\n  Cuenta {codigo} — {libro.nombre(codigo)} ({libro.tipo(codigo)})")
        print(f"    {col('Fecha', 12)}{col('Glosa', 32)}"
              f"{col('Debe', 15, True)}{col('Haber', 15, True)}{col('Saldo', 16, True)}")
        deudor = TIPOS.get(libro.tipo(codigo), "deudor") == "deudor"
        saldo = Decimal("0")
        td = th = Decimal("0")
        for a, ln in lineas:
            debe = a_decimal(ln.get("debe", 0))
            haber = a_decimal(ln.get("haber", 0))
            td += debe
            th += haber
            saldo += (debe - haber) if deudor else (haber - debe)
            print(f"    {col(a['fecha'], 12)}{col(a['glosa'], 32)}"
                  f"{col(fmt(debe) if debe else '', 15, True)}"
                  f"{col(fmt(haber) if haber else '', 15, True)}"
                  f"{col(fmt(saldo), 16, True)}")
        print(f"    {col('', 12)}{col('Sumas y saldo final', 32)}"
              f"{col(fmt(td), 15, True)}{col(fmt(th), 15, True)}{col(fmt(saldo), 16, True)}")


def rep_comprobacion(libro: Libro) -> None:
    encabezado(libro, "Balance de Comprobación (Sumas y Saldos)")
    acum = libro.movimientos_por_cuenta()
    usadas = {c: m for c, m in acum.items() if m["debe"] or m["haber"]}
    if not usadas:
        print("  (no hay movimientos)")
        return

    print(f"  {col('Código', 9)}{col('Cuenta', 30)}"
          f"{col('Debe', 15, True)}{col('Haber', 15, True)}"
          f"{col('S.Deudor', 15, True)}{col('S.Acreedor', 15, True)}")
    print("  " + "-" * 99)

    t_debe = t_haber = t_sd = t_sa = Decimal("0")
    for codigo in sorted(usadas):
        m = usadas[codigo]
        saldo = libro.saldo(codigo, m)
        naturaleza = TIPOS.get(libro.tipo(codigo), "deudor")
        if naturaleza == "deudor":
            sd, sa = (saldo, Decimal("0")) if saldo >= 0 else (Decimal("0"), -saldo)
        else:
            sa, sd = (saldo, Decimal("0")) if saldo >= 0 else (Decimal("0"), -saldo)
        t_debe += m["debe"]
        t_haber += m["haber"]
        t_sd += sd
        t_sa += sa
        print(f"  {col(codigo, 9)}{col(libro.nombre(codigo), 30)}"
              f"{col(fmt(m['debe']), 15, True)}{col(fmt(m['haber']), 15, True)}"
              f"{col(fmt(sd) if sd else '', 15, True)}"
              f"{col(fmt(sa) if sa else '', 15, True)}")

    print("  " + "-" * 99)
    print(f"  {col('TOTALES', 39)}"
          f"{col(fmt(t_debe), 15, True)}{col(fmt(t_haber), 15, True)}"
          f"{col(fmt(t_sd), 15, True)}{col(fmt(t_sa), 15, True)}")
    print()
    ok_sumas = t_debe == t_haber
    ok_saldos = t_sd == t_sa
    print(f"  Sumas:  debe {fmt(t_debe)} {'=' if ok_sumas else '≠'} haber {fmt(t_haber)}"
          f"   →  {'CUADRA ✔' if ok_sumas else 'NO CUADRA ✗'}")
    print(f"  Saldos: deudor {fmt(t_sd)} {'=' if ok_saldos else '≠'} acreedor {fmt(t_sa)}"
          f"   →  {'CUADRA ✔' if ok_saldos else 'NO CUADRA ✗'}")


def _saldos_por_tipo(libro: Libro):
    """Agrupa los saldos por tipo de cuenta. Devuelve dict tipo -> [(codigo, saldo)]."""
    acum = libro.movimientos_por_cuenta()
    grupos = {t: [] for t in TIPOS}
    for codigo, m in acum.items():
        if not (m["debe"] or m["haber"]):
            continue
        saldo = libro.saldo(codigo, m)
        grupos.setdefault(libro.tipo(codigo), []).append((codigo, saldo))
    return grupos


def rep_balance(libro: Libro) -> None:
    encabezado(libro, "Balance General (Estado de Situación)")
    grupos = _saldos_por_tipo(libro)

    total_ingresos = sum((s for _, s in grupos.get("INGRESO", [])), Decimal("0"))
    total_gastos = sum((s for _, s in grupos.get("GASTO", [])), Decimal("0"))
    resultado = total_ingresos - total_gastos  # utilidad (+) o pérdida (-)

    def bloque(titulo, codigos):
        print(f"\n  {titulo}")
        total = Decimal("0")
        for codigo, saldo in sorted(codigos):
            total += saldo
            print(f"    {col(codigo, 9)}{col(libro.nombre(codigo), 40)}"
                  f"{col(fmt(saldo), 16, True)}")
        print(f"    {col('', 9)}{col('Subtotal', 40)}{col(fmt(total), 16, True)}")
        return total

    total_activo = bloque("ACTIVO", grupos.get("ACTIVO", []))
    total_pasivo = bloque("PASIVO", grupos.get("PASIVO", []))

    # Patrimonio incluye el resultado del ejercicio.
    print("\n  PATRIMONIO")
    total_patrimonio = Decimal("0")
    for codigo, saldo in sorted(grupos.get("PATRIMONIO", [])):
        total_patrimonio += saldo
        print(f"    {col(codigo, 9)}{col(libro.nombre(codigo), 40)}"
              f"{col(fmt(saldo), 16, True)}")
    etiqueta = "Resultado del ejercicio (utilidad)" if resultado >= 0 else \
               "Resultado del ejercicio (pérdida)"
    total_patrimonio += resultado
    print(f"    {col('', 9)}{col(etiqueta, 40)}{col(fmt(resultado), 16, True)}")
    print(f"    {col('', 9)}{col('Subtotal Patrimonio', 40)}"
          f"{col(fmt(total_patrimonio), 16, True)}")

    pasivo_mas_patrimonio = total_pasivo + total_patrimonio
    print("\n  " + "-" * 70)
    print(f"  {col('TOTAL ACTIVO', 49)}{col(fmt(total_activo), 16, True)}")
    print(f"  {col('TOTAL PASIVO + PATRIMONIO', 49)}"
          f"{col(fmt(pasivo_mas_patrimonio), 16, True)}")

    diferencia = total_activo - pasivo_mas_patrimonio
    if diferencia == 0:
        print(f"\n  ✔ El balance CUADRA: Activo = Pasivo + Patrimonio = {fmt(total_activo)}")
    else:
        print(f"\n  ✗ El balance NO CUADRA. Diferencia: {fmt(diferencia)}")
        print("    Revisa que todos los asientos estén correctamente registrados.")


def rep_resultados(libro: Libro) -> None:
    encabezado(libro, "Estado de Resultados")
    grupos = _saldos_por_tipo(libro)
    ingresos = sorted(grupos.get("INGRESO", []))
    gastos = sorted(grupos.get("GASTO", []))

    print("\n  INGRESOS")
    total_ing = Decimal("0")
    for codigo, saldo in ingresos:
        total_ing += saldo
        print(f"    {col(codigo, 9)}{col(libro.nombre(codigo), 40)}"
              f"{col(fmt(saldo), 16, True)}")
    print(f"    {col('', 9)}{col('Total ingresos', 40)}{col(fmt(total_ing), 16, True)}")

    print("\n  GASTOS")
    total_gas = Decimal("0")
    for codigo, saldo in gastos:
        total_gas += saldo
        print(f"    {col(codigo, 9)}{col(libro.nombre(codigo), 40)}"
              f"{col(fmt(saldo), 16, True)}")
    print(f"    {col('', 9)}{col('Total gastos', 40)}{col(fmt(total_gas), 16, True)}")

    resultado = total_ing - total_gas
    print("\n  " + "-" * 70)
    etiqueta = "UTILIDAD DEL EJERCICIO" if resultado >= 0 else "PÉRDIDA DEL EJERCICIO"
    print(f"  {col(etiqueta, 49)}{col(fmt(resultado), 16, True)}")


def rep_caja(libro: Libro) -> None:
    """Vista simple: ingresos vs. gastos (flujo), con resumen por categoría."""
    encabezado(libro, "Ingresos vs. Gastos (caja simple)")
    grupos = _saldos_por_tipo(libro)
    ingresos = sorted(grupos.get("INGRESO", []))
    gastos = sorted(grupos.get("GASTO", []))

    total_ing = sum((s for _, s in ingresos), Decimal("0"))
    total_gas = sum((s for _, s in gastos), Decimal("0"))

    print(f"\n  {col('', 9)}{col('Concepto', 40)}{col('Ingresos', 14, True)}"
          f"{col('Gastos', 14, True)}")
    print("  " + "-" * 77)
    for codigo, saldo in ingresos:
        print(f"  {col(codigo, 9)}{col(libro.nombre(codigo), 40)}"
              f"{col(fmt(saldo), 14, True)}{col('', 14, True)}")
    for codigo, saldo in gastos:
        print(f"  {col(codigo, 9)}{col(libro.nombre(codigo), 40)}"
              f"{col('', 14, True)}{col(fmt(saldo), 14, True)}")
    print("  " + "-" * 77)
    print(f"  {col('', 9)}{col('TOTALES', 40)}{col(fmt(total_ing), 14, True)}"
          f"{col(fmt(total_gas), 14, True)}")

    neto = total_ing - total_gas
    signo = "Superávit" if neto >= 0 else "Déficit"
    print(f"\n  {signo} (Ingresos − Gastos): {fmt(neto)} {libro.moneda}")


# --------------------------------------------------------------------------- #
# Exportación a CSV (para abrir en Excel / Google Sheets)
# --------------------------------------------------------------------------- #

def _num(monto: Decimal) -> str:
    """Monto plano con punto decimal, ideal para reimportar en planillas."""
    return f"{monto.quantize(DOS_DECIMALES, rounding=ROUND_HALF_UP):.2f}"


def _escribir_csv(ruta: str, encabezados: list[str], filas: list[list]) -> None:
    with open(ruta, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(encabezados)
        w.writerows(filas)


def csv_comprobacion(libro: Libro, ruta: str) -> None:
    acum = libro.movimientos_por_cuenta()
    filas = []
    t_debe = t_haber = t_sd = t_sa = Decimal("0")
    for codigo in sorted(acum):
        m = acum[codigo]
        if not (m["debe"] or m["haber"]):
            continue
        saldo = libro.saldo(codigo, m)
        if TIPOS.get(libro.tipo(codigo), "deudor") == "deudor":
            sd, sa = (saldo, Decimal("0")) if saldo >= 0 else (Decimal("0"), -saldo)
        else:
            sa, sd = (saldo, Decimal("0")) if saldo >= 0 else (Decimal("0"), -saldo)
        t_debe += m["debe"]; t_haber += m["haber"]; t_sd += sd; t_sa += sa
        filas.append([codigo, libro.nombre(codigo), libro.tipo(codigo),
                      _num(m["debe"]), _num(m["haber"]), _num(sd), _num(sa)])
    filas.append(["", "TOTALES", "", _num(t_debe), _num(t_haber), _num(t_sd), _num(t_sa)])
    _escribir_csv(ruta, ["codigo", "cuenta", "tipo", "debe", "haber",
                         "saldo_deudor", "saldo_acreedor"], filas)


def csv_balance(libro: Libro, ruta: str) -> None:
    grupos = _saldos_por_tipo(libro)
    resultado = (sum((s for _, s in grupos.get("INGRESO", [])), Decimal("0"))
                 - sum((s for _, s in grupos.get("GASTO", [])), Decimal("0")))
    filas = []
    for seccion in ("ACTIVO", "PASIVO", "PATRIMONIO"):
        for codigo, saldo in sorted(grupos.get(seccion, [])):
            filas.append([seccion, codigo, libro.nombre(codigo), _num(saldo)])
        if seccion == "PATRIMONIO":
            filas.append(["PATRIMONIO", "", "Resultado del ejercicio", _num(resultado)])
    _escribir_csv(ruta, ["seccion", "codigo", "cuenta", "saldo"], filas)


def csv_resultados(libro: Libro, ruta: str) -> None:
    grupos = _saldos_por_tipo(libro)
    filas = []
    for seccion in ("INGRESO", "GASTO"):
        for codigo, saldo in sorted(grupos.get(seccion, [])):
            filas.append([seccion, codigo, libro.nombre(codigo), _num(saldo)])
    _escribir_csv(ruta, ["seccion", "codigo", "cuenta", "saldo"], filas)


def csv_caja(libro: Libro, ruta: str) -> None:
    grupos = _saldos_por_tipo(libro)
    filas = []
    for codigo, saldo in sorted(grupos.get("INGRESO", [])):
        filas.append([codigo, libro.nombre(codigo), _num(saldo), "0.00"])
    for codigo, saldo in sorted(grupos.get("GASTO", [])):
        filas.append([codigo, libro.nombre(codigo), "0.00", _num(saldo)])
    _escribir_csv(ruta, ["codigo", "cuenta", "ingresos", "gastos"], filas)


def csv_diario(libro: Libro, ruta: str) -> None:
    filas = []
    for a in libro.asientos:
        for ln in a["lineas"]:
            filas.append([a["numero"], a["fecha"], a["glosa"], ln["cuenta"],
                          libro.nombre(ln["cuenta"]),
                          _num(a_decimal(ln.get("debe", 0))),
                          _num(a_decimal(ln.get("haber", 0)))])
    _escribir_csv(ruta, ["numero", "fecha", "glosa", "cuenta", "nombre",
                         "debe", "haber"], filas)


def csv_mayor(libro: Libro, ruta: str, solo: str | None) -> None:
    filas = []
    saldos = {}
    for a in libro.asientos:
        for ln in a["lineas"]:
            c = ln["cuenta"]
            if solo and c != solo:
                continue
            debe = a_decimal(ln.get("debe", 0))
            haber = a_decimal(ln.get("haber", 0))
            deudor = TIPOS.get(libro.tipo(c), "deudor") == "deudor"
            saldos[c] = saldos.get(c, Decimal("0")) + (
                (debe - haber) if deudor else (haber - debe))
            filas.append([c, libro.nombre(c), a["fecha"], a["glosa"],
                          _num(debe), _num(haber), _num(saldos[c])])
    _escribir_csv(ruta, ["cuenta", "nombre", "fecha", "glosa",
                         "debe", "haber", "saldo"], filas)


# --------------------------------------------------------------------------- #
# Comandos
# --------------------------------------------------------------------------- #

def cmd_init(libro: Libro, args) -> None:
    if libro.cuentas and not args.forzar:
        print(f"Ya existe un plan de cuentas en {libro.ruta} "
              f"({len(libro.cuentas)} cuentas). Usa --forzar para reemplazarlo.")
        return
    libro.cuentas = {}
    for codigo, nombre, tipo in PLAN_BASE:
        libro.agregar_cuenta(codigo, nombre, tipo)
    if args.empresa:
        libro.empresa = args.empresa
    if args.moneda:
        libro.moneda = args.moneda
    libro.guardar()
    print(f"✔ Plan de cuentas base creado en {libro.ruta} "
          f"({len(libro.cuentas)} cuentas, moneda {libro.moneda}).")


def cmd_cuenta_add(libro: Libro, args) -> None:
    libro.agregar_cuenta(args.codigo, args.nombre, args.tipo)
    libro.guardar()
    print(f"✔ Cuenta agregada: {args.codigo} — {args.nombre} ({args.tipo.upper()}).")


def _parsea_lineas(pares: list[str], libro: Libro) -> list[dict]:
    """Convierte argumentos 'CUENTA:debe:haber' en líneas de asiento."""
    lineas = []
    for p in pares:
        partes = p.split(":")
        if len(partes) != 3:
            raise ValueError(
                f"Línea no válida: {p!r}. Usa el formato CUENTA:DEBE:HABER "
                f"(por ejemplo 1.1.01:1000:0)."
            )
        cuenta, debe, haber = partes
        lineas.append({
            "cuenta": cuenta.strip(),
            "debe": debe.strip() or "0",
            "haber": haber.strip() or "0",
        })
    return lineas


def cmd_asiento(libro: Libro, args) -> None:
    if args.linea:
        lineas = _parsea_lineas(args.linea, libro)
        fecha = args.fecha or hoy()
        glosa = args.glosa or ""
        asiento = libro.agregar_asiento(fecha, glosa, lineas)
        libro.guardar()
        print(f"✔ Asiento N° {asiento['numero']} registrado ({fecha}).")
    else:
        asiento_interactivo(libro)


def cmd_eliminar(libro: Libro, args) -> None:
    antes = len(libro.asientos)
    libro.asientos = [a for a in libro.asientos if a["numero"] != args.numero]
    if len(libro.asientos) == antes:
        print(f"No se encontró el asiento N° {args.numero}.")
        return
    libro.guardar()
    print(f"✔ Asiento N° {args.numero} eliminado.")


# --------------------------------------------------------------------------- #
# Modo interactivo
# --------------------------------------------------------------------------- #

def _pide(texto: str, defecto: str = "") -> str:
    sufijo = f" [{defecto}]" if defecto else ""
    try:
        resp = input(f"{texto}{sufijo}: ").strip()
    except EOFError:
        return defecto
    return resp or defecto


def asiento_interactivo(libro: Libro) -> None:
    if not libro.cuentas:
        print("Primero crea el plan de cuentas con `init`.")
        return
    print("\n— Nuevo asiento contable (deja la cuenta vacía para terminar) —")
    fecha = _pide("Fecha (AAAA-MM-DD)", hoy())
    try:
        valida_fecha(fecha)
    except ValueError as e:
        print(f"  {e}")
        return
    glosa = _pide("Glosa / descripción")

    lineas = []
    n = 1
    while True:
        print(f"\n  Línea {n}:")
        cuenta = _pide("    Código de cuenta (Enter para terminar)")
        if not cuenta:
            break
        if not libro.existe(cuenta):
            print(f"    ⚠ La cuenta {cuenta} no existe. Usa 'cuentas' para verlas.")
            continue
        print(f"    → {libro.nombre(cuenta)} ({libro.tipo(cuenta)})")
        lado = _pide("    ¿Debe o Haber? (d/h)", "d").lower()
        monto = _pide("    Monto")
        try:
            m = a_decimal(monto)
        except ValueError as e:
            print(f"    {e}")
            continue
        if lado.startswith("h"):
            lineas.append({"cuenta": cuenta, "debe": "0", "haber": str(m)})
        else:
            lineas.append({"cuenta": cuenta, "debe": str(m), "haber": "0"})
        n += 1

    if len(lineas) < 2:
        print("Asiento cancelado (se necesitan al menos 2 líneas).")
        return
    try:
        asiento = libro.agregar_asiento(fecha, glosa, lineas)
    except ValueError as e:
        print(f"\n✗ No se pudo registrar: {e}")
        return
    libro.guardar()
    print(f"\n✔ Asiento N° {asiento['numero']} registrado y cuadrado.")


def menu(libro: Libro) -> None:
    opciones = {
        "1": ("Ver plan de cuentas", lambda: rep_plan(libro)),
        "2": ("Registrar asiento", lambda: asiento_interactivo(libro)),
        "3": ("Libro Diario", lambda: rep_diario(libro)),
        "4": ("Libro Mayor", lambda: rep_mayor(libro)),
        "5": ("Balance de Comprobación", lambda: rep_comprobacion(libro)),
        "6": ("Balance General", lambda: rep_balance(libro)),
        "7": ("Estado de Resultados", lambda: rep_resultados(libro)),
        "8": ("Ingresos vs. Gastos (caja)", lambda: rep_caja(libro)),
    }
    while True:
        print("\n" + "=" * 50)
        print(f"  CONTABILIDAD — {libro.empresa}")
        print("=" * 50)
        for k in sorted(opciones):
            print(f"  {k}. {opciones[k][0]}")
        print("  0. Salir")
        eleccion = _pide("\nElige una opción")
        if eleccion in ("0", "", "q", "salir"):
            print("Hasta pronto.")
            return
        accion = opciones.get(eleccion)
        if accion:
            accion[1]()
        else:
            print("Opción no válida.")


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def construir_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="contabilidad.py",
        description="Contabilidad automática por partida doble y balances.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--data", default=ARCHIVO_POR_DEFECTO,
                   help=f"Archivo de datos JSON (por defecto: {ARCHIVO_POR_DEFECTO}).")
    sub = p.add_subparsers(dest="comando")

    s = sub.add_parser("init", help="Crea el plan de cuentas base.")
    s.add_argument("--empresa", help="Nombre de la empresa / entidad.")
    s.add_argument("--moneda", help="Moneda (por defecto CLP).")
    s.add_argument("--forzar", action="store_true", help="Reemplaza un plan existente.")

    sub.add_parser("cuentas", help="Muestra el plan de cuentas.")

    s = sub.add_parser("cuenta-add", help="Agrega una cuenta al plan.")
    s.add_argument("codigo")
    s.add_argument("nombre")
    s.add_argument("tipo", help="ACTIVO | PASIVO | PATRIMONIO | INGRESO | GASTO")

    s = sub.add_parser("asiento", help="Registra un asiento (interactivo o por líneas).")
    s.add_argument("--fecha", help="Fecha AAAA-MM-DD (por defecto hoy).")
    s.add_argument("--glosa", help="Descripción del asiento.")
    s.add_argument("--linea", action="append", metavar="CUENTA:DEBE:HABER",
                   help="Línea del asiento; repetir por cada cuenta. Ej: 1.1.01:1000:0")

    s = sub.add_parser("eliminar", help="Elimina un asiento por su número.")
    s.add_argument("numero", type=int)

    def con_csv(parser):
        parser.add_argument("--csv", metavar="RUTA",
                            help="Exporta el reporte a un archivo CSV en vez de imprimirlo.")
        return parser

    con_csv(sub.add_parser("diario", help="Libro Diario."))
    s = con_csv(sub.add_parser("mayor", help="Libro Mayor (opcional: una cuenta)."))
    s.add_argument("cuenta", nargs="?", help="Código de cuenta a mostrar.")
    con_csv(sub.add_parser("comprobacion", help="Balance de Comprobación (sumas y saldos)."))
    con_csv(sub.add_parser("balance", help="Balance General (Estado de Situación)."))
    con_csv(sub.add_parser("resultados", help="Estado de Resultados."))
    con_csv(sub.add_parser("caja", help="Ingresos vs. Gastos (caja simple)."))
    sub.add_parser("menu", help="Menú interactivo (por defecto si no das comando).")
    return p


def main(argv=None) -> int:
    parser = construir_parser()
    args = parser.parse_args(argv)
    libro = Libro.cargar(args.data)

    try:
        comando = args.comando or "menu"
        if comando == "init":
            cmd_init(libro, args)
        elif comando == "cuentas":
            rep_plan(libro)
        elif comando == "cuenta-add":
            cmd_cuenta_add(libro, args)
        elif comando == "asiento":
            cmd_asiento(libro, args)
        elif comando == "eliminar":
            cmd_eliminar(libro, args)
        elif comando == "diario":
            if args.csv:
                csv_diario(libro, args.csv)
                print(f"✔ Libro Diario exportado a {args.csv}")
            else:
                rep_diario(libro)
        elif comando == "mayor":
            if args.csv:
                csv_mayor(libro, args.csv, args.cuenta)
                print(f"✔ Libro Mayor exportado a {args.csv}")
            else:
                rep_mayor(libro, args.cuenta)
        elif comando == "comprobacion":
            if args.csv:
                csv_comprobacion(libro, args.csv)
                print(f"✔ Balance de Comprobación exportado a {args.csv}")
            else:
                rep_comprobacion(libro)
        elif comando == "balance":
            if args.csv:
                csv_balance(libro, args.csv)
                print(f"✔ Balance General exportado a {args.csv}")
            else:
                rep_balance(libro)
        elif comando == "resultados":
            if args.csv:
                csv_resultados(libro, args.csv)
                print(f"✔ Estado de Resultados exportado a {args.csv}")
            else:
                rep_resultados(libro)
        elif comando == "caja":
            if args.csv:
                csv_caja(libro, args.csv)
                print(f"✔ Ingresos vs. Gastos exportado a {args.csv}")
            else:
                rep_caja(libro)
        elif comando == "menu":
            menu(libro)
        else:
            parser.print_help()
    except ValueError as e:
        print(f"✗ Error: {e}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\nCancelado.")
        return 130
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
