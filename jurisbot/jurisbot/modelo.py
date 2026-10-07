"""Modelo de datos común a todas las fuentes."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field, asdict

# Fuentes admitidas. La clave es la que se guarda en la base de datos.
FUENTES = {
    "cs": "Corte Suprema",
    "cgr": "Contraloría General de la República",
    "sii": "Servicio de Impuestos Internos",
    "dt": "Dirección del Trabajo",
    "tc": "Tribunal Constitucional",
}

# Tipos de documento por fuente.
TIPOS = {
    "cs": ["sentencia"],
    "cgr": ["dictamen"],
    "sii": ["circular", "oficio", "resolucion"],
    "dt": ["dictamen", "ordinario", "circular"],
    "tc": ["sentencia"],
}

# Estados de verificación. Ningún documento se publica a suscriptores como
# "verificado" si no se comprobó contra la fuente oficial.
VERIFICACION = ("sin_verificar", "verificado_fuente_oficial", "rechazado")


@dataclass
class Documento:
    fuente: str                 # clave de FUENTES
    tipo: str                   # sentencia, dictamen, circular...
    identificador: str          # rol, número de dictamen, número de circular
    fecha: str = ""             # AAAA-MM-DD; vacío si no se pudo leer
    titulo: str = ""
    url: str = ""               # enlace a la fuente oficial
    texto: str = ""
    origen: str = ""            # "recolector:<fuente>" o "importacion:<archivo>"
    verificacion: str = "sin_verificar"
    materias: list[str] = field(default_factory=list)
    normas_citadas: list[str] = field(default_factory=list)
    resumen: str = ""
    clasificado_por: str = ""   # "reglas" o "ia:<modelo>"

    def __post_init__(self):
        if self.fuente not in FUENTES:
            raise ValueError(f"Fuente desconocida: {self.fuente!r}")
        if self.verificacion not in VERIFICACION:
            raise ValueError(f"Estado de verificación inválido: {self.verificacion!r}")
        self.identificador = self.identificador.strip()
        if not self.identificador:
            raise ValueError("El documento necesita un identificador (rol o número)")

    @property
    def clave(self) -> str:
        """Clave única estable: fuente + tipo + identificador normalizado."""
        ident = " ".join(self.identificador.upper().split())
        return f"{self.fuente}:{self.tipo}:{ident}"

    @property
    def huella(self) -> str:
        """Hash del texto, para detectar cambios en una nueva recolección."""
        return hashlib.sha256(self.texto.encode("utf-8")).hexdigest()

    def como_dict(self) -> dict:
        d = asdict(self)
        d["clave"] = self.clave
        d["fuente_nombre"] = FUENTES[self.fuente]
        return d
