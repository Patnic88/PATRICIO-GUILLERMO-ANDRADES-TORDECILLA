"""Parámetros tributarios por año, con fuente y estado de verificación.

Cada valor en contasii/parametros/AAAA.json tiene la forma:

    {"valor": 0.19, "norma": "art. 14 DL 825", "fuente": "https://...", "estado": "VERIFICADO"}

- Si `valor` es null, el sistema se niega a calcular lo que dependa de él
  (ParametroFaltante) en lugar de suponer una cifra.
- Si `estado` no es "VERIFICADO", el valor se usa pero cada reporte que lo
  emplee lo lista bajo [VERIFICAR] para revisión humana.
"""

import json
import os

DIR = os.path.join(os.path.dirname(__file__), "parametros")


class ParametroFaltante(Exception):
    pass


# Estados que no se listan bajo [VERIFICAR]: confirmados por una persona.
ESTADOS_CONFIRMADOS = {"VERIFICADO", "INGRESADO_POR_USUARIO"}


class Parametros:
    """Carga parametros/AAAA.json y, si existe, un archivo local con la UTM y feriados que ingresa el usuario.

    El archivo local (ruta en `local` o en la variable de entorno CONTASII_LOCAL)
    tiene la forma {"utm": {"2026-11": {"valor": 72000, ...}}, "feriados": ["2026-12-25"]}
    y sus valores prevalecen sobre los del archivo del año.
    """

    def __init__(self, anio: int, ruta: str | None = None, local: str | None = None):
        self.anio = int(anio)
        self.ruta = ruta or os.path.join(DIR, f"{self.anio}.json")
        if not os.path.exists(self.ruta):
            raise ParametroFaltante(
                f"No existe {self.ruta}. Copie el archivo de otro año y actualice cada valor con su fuente.")
        with open(self.ruta, encoding="utf-8") as f:
            self.datos = json.load(f)
        self.local = local or os.environ.get("CONTASII_LOCAL")
        if self.local and os.path.exists(self.local):
            with open(self.local, encoding="utf-8") as f:
                extra = json.load(f)
            self.datos.setdefault("utm", {}).update(extra.get("utm", {}))
            fer = self.datos.setdefault("feriados", {}).setdefault("fechas", [])
            fer.extend(x for x in extra.get("feriados", []) if x not in fer)
        self.usados_sin_verificar = set()

    def _entrada(self, clave: str):
        e = self.datos.get("valores", {}).get(clave)
        if e is None:
            raise ParametroFaltante(f"Parámetro {clave!r} no definido en {os.path.basename(self.ruta)}.")
        return e

    def _marcar(self, clave, e):
        if e.get("estado") not in ESTADOS_CONFIRMADOS:
            self.usados_sin_verificar.add(f"{clave} ({e.get('norma', 'sin norma')})")

    def valor(self, clave: str):
        e = self._entrada(clave)
        if e.get("valor") is None:
            raise ParametroFaltante(
                f"El parámetro {clave!r} no tiene valor cargado ({e.get('norma', '')}). "
                f"Ingréselo en {os.path.basename(self.ruta)} con su fuente.")
        self._marcar(clave, e)
        return e["valor"]

    def valor_opcional(self, clave: str):
        try:
            return self.valor(clave)
        except ParametroFaltante:
            return None

    def norma(self, clave: str) -> str:
        return self._entrada(clave).get("norma", "")

    def utm(self, periodo: str) -> int:
        e = self.datos.get("utm", {}).get(periodo)
        if not e or e.get("valor") is None:
            raise ParametroFaltante(
                f"Falta el valor de la UTM de {periodo}. Consúltelo en sii.cl (Valores y fechas) "
                f"y regístrelo en {os.path.basename(self.ruta)} > utm > {periodo}.")
        self._marcar(f"utm {periodo}", e)
        return int(e["valor"])

    def tabla_iusc(self):
        e = self.datos.get("tabla_iusc")
        if not e or not e.get("tramos"):
            raise ParametroFaltante("Falta la tabla del impuesto único de segunda categoría.")
        self._marcar("tabla_iusc", e)
        return e["tramos"]

    def advertencias(self):
        return sorted(self.usados_sin_verificar)


def guardar_utm_local(ruta_local: str, periodo: str, valor: int):
    """Registra en el archivo local la UTM de un mes, ingresada por el usuario desde sii.cl."""
    datos = {}
    if os.path.exists(ruta_local):
        with open(ruta_local, encoding="utf-8") as f:
            datos = json.load(f)
    datos.setdefault("utm", {})[periodo] = {
        "valor": int(valor), "fuente": "ingresado por el usuario desde sii.cl", "estado": "INGRESADO_POR_USUARIO"}
    with open(ruta_local, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
