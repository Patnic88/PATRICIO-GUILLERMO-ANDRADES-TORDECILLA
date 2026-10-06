"""Validación y formato de RUT chileno (módulo 11)."""

import re


def limpiar(rut):
    """Deja solo dígitos y K. Acepta '12.345.678-5', '12345678-5', '123456785'."""
    if rut is None:
        return ""
    return re.sub(r"[^0-9kK]", "", str(rut)).upper()


def digito_verificador(cuerpo):
    """Calcula el dígito verificador de un cuerpo numérico (string de dígitos)."""
    suma = 0
    factor = 2
    for digito in reversed(cuerpo):
        suma += int(digito) * factor
        factor = 2 if factor == 7 else factor + 1
    resto = 11 - (suma % 11)
    if resto == 11:
        return "0"
    if resto == 10:
        return "K"
    return str(resto)


def es_valido(rut):
    """True si el RUT tiene cuerpo numérico de 1 a 8 dígitos y DV correcto."""
    rut = limpiar(rut)
    if len(rut) < 2:
        return False
    cuerpo, dv = rut[:-1], rut[-1]
    if not cuerpo.isdigit() or len(cuerpo) > 8:
        return False
    return digito_verificador(cuerpo) == dv


def formatear(rut):
    """Devuelve el RUT con puntos y guion: 12.345.678-5. Si está vacío, ''."""
    rut = limpiar(rut)
    if len(rut) < 2:
        return rut
    cuerpo, dv = rut[:-1], rut[-1]
    cuerpo_con_puntos = ""
    while len(cuerpo) > 3:
        cuerpo_con_puntos = "." + cuerpo[-3:] + cuerpo_con_puntos
        cuerpo = cuerpo[:-3]
    return cuerpo + cuerpo_con_puntos + "-" + dv


def normalizar(rut):
    """Formato canónico sin puntos, con guion: 12345678-5 (para guardar en BD)."""
    rut = limpiar(rut)
    if len(rut) < 2:
        return rut
    return rut[:-1] + "-" + rut[-1]
