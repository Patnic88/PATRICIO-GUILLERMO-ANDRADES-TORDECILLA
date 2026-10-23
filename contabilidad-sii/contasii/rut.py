"""Validación y formato de RUT chileno (dígito verificador módulo 11)."""

import re


class RutInvalido(ValueError):
    pass


def limpiar(rut: str) -> str:
    """Quita puntos, guion y espacios; deja el DV en mayúscula."""
    return re.sub(r"[^0-9kK]", "", str(rut or "")).upper()


def calcular_dv(cuerpo: str) -> str:
    suma, factor = 0, 2
    for d in reversed(cuerpo):
        suma += int(d) * factor
        factor = 2 if factor == 7 else factor + 1
    resto = 11 - (suma % 11)
    return {11: "0", 10: "K"}.get(resto, str(resto))


def es_valido(rut: str) -> bool:
    r = limpiar(rut)
    if len(r) < 2 or not r[:-1].isdigit():
        return False
    return calcular_dv(r[:-1]) == r[-1]


def normalizar(rut: str) -> str:
    """Devuelve el RUT como '12345678-9'. Lanza RutInvalido si el DV no cuadra."""
    r = limpiar(rut)
    if not es_valido(r):
        raise RutInvalido(f"RUT inválido: {rut!r}")
    return f"{int(r[:-1])}-{r[-1]}"


def formatear(rut: str) -> str:
    """Devuelve el RUT con puntos: '12.345.678-9'."""
    cuerpo, dv = normalizar(rut).split("-")
    return f"{int(cuerpo):,}".replace(",", ".") + f"-{dv}"
