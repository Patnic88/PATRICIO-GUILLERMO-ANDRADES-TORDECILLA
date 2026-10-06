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


class Parametros:
    def __init__(self, anio: int, ruta: str | None = None):
        self.anio = int(anio)
        self.ruta = ruta or os.path.join(DIR, f"{self.anio}.json")
        if not os.path.exists(self.ruta):
            raise ParametroFaltante(
                f"No existe {self.ruta}. Copie el archivo de otro año y actualice cada valor con su fuente.")
        with open(self.ruta, encoding="utf-8") as f:
            self.datos = json.load(f)
        self.usados_sin_verificar = set()

    def _entrada(self, clave: str):
        e = self.datos.get("valores", {}).get(clave)
        if e is None:
            raise ParametroFaltante(f"Parámetro {clave!r} no definido en {os.path.basename(self.ruta)}.")
        return e

    def _marcar(self, clave, e):
        if e.get("estado") != "VERIFICADO":
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
