"""Proveedores de IA intercambiables para clasificar y resumir.

| proveedor            | costo                         | clave | dónde corre             |
|----------------------|-------------------------------|-------|-------------------------|
| ollama (por defecto) | gratis                        | no    | en su propio computador |
| compatible_openai    | según el plan del servicio    | sí    | en la nube del servicio |
| anthropic            | pago por uso                  | sí    | en la nube de Anthropic |

"compatible_openai" sirve para cualquier servicio que exponga el formato
/v1/chat/completions (muchos ofrecen un plan gratuito con límites; también
servidores locales como LM Studio). Se configura con variables de entorno:

    JURISBOT_IA          ollama | compatible_openai | anthropic
    JURISBOT_IA_MODELO   nombre del modelo (obligatorio salvo en anthropic)
    JURISBOT_IA_URL      URL base (ollama: http://localhost:11434)
    JURISBOT_IA_CLAVE    clave del servicio (compatible_openai)

En todos los casos se aplican las mismas salvaguardas de clasificar_ia.validar:
materias fuera de la taxonomía y normas que no aparecen en el texto se descartan.
"""
from __future__ import annotations

import json
import logging
import os
import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Callable

from pydantic import ValidationError

from .clasificar_ia import ClasificacionIA, SISTEMA, _taxonomia_texto, validar

log = logging.getLogger(__name__)

PROVEEDORES = ("ollama", "compatible_openai", "anthropic")
# Los modelos locales y los planes gratuitos suelen admitir menos texto. Un documento
# más largo se rechaza en vez de truncarse en silencio.
MAX_CARACTERES_DEFECTO = 100_000

# Función que hace un POST JSON y devuelve el JSON de respuesta. Se inyecta en pruebas.
Http = Callable[[str, dict, dict], dict]


@dataclass
class ConfigIA:
    proveedor: str = "ollama"
    modelo: str = ""
    url: str = ""
    clave: str = ""
    max_caracteres: int = MAX_CARACTERES_DEFECTO

    @classmethod
    def desde_entorno(cls, proveedor: str | None = None) -> "ConfigIA":
        c = cls(
            proveedor=proveedor or os.environ.get("JURISBOT_IA", "ollama"),
            modelo=os.environ.get("JURISBOT_IA_MODELO", ""),
            url=os.environ.get("JURISBOT_IA_URL", ""),
            clave=os.environ.get("JURISBOT_IA_CLAVE", ""),
            max_caracteres=int(os.environ.get("JURISBOT_IA_MAX_CARACTERES", MAX_CARACTERES_DEFECTO)),
        )
        if c.proveedor not in PROVEEDORES:
            raise ValueError(f"Proveedor de IA desconocido: {c.proveedor}. Opciones: {', '.join(PROVEEDORES)}")
        if c.proveedor == "ollama":
            c.url = c.url or "http://localhost:11434"
            if not c.modelo:
                raise ValueError("Indique el modelo local en JURISBOT_IA_MODELO (el nombre que muestra `ollama list`).")
        if c.proveedor == "compatible_openai":
            faltan = [n for n, v in (("JURISBOT_IA_URL", c.url), ("JURISBOT_IA_MODELO", c.modelo),
                                     ("JURISBOT_IA_CLAVE", c.clave)) if not v]
            if faltan:
                raise ValueError(f"Para compatible_openai falta definir: {', '.join(faltan)}")
        return c

    @property
    def etiqueta(self) -> str:
        return f"ia:{self.proveedor}:{self.modelo or 'claude'}"


def post_json(url: str, cuerpo: dict, encabezados: dict, timeout: int = 600) -> dict:
    req = urllib.request.Request(url, data=json.dumps(cuerpo).encode("utf-8"), method="POST",
                                 headers={"Content-Type": "application/json", **encabezados})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def _instrucciones() -> str:
    esquema = json.dumps(ClasificacionIA.model_json_schema(), ensure_ascii=False)
    return (SISTEMA + "\n\nTaxonomía:\n" + _taxonomia_texto()
            + "\n\nResponde únicamente con un objeto JSON que cumpla este esquema:\n" + esquema)


def _mensajes(texto: str, titulo: str) -> list[dict]:
    return [{"role": "system", "content": _instrucciones()},
            {"role": "user", "content": f"Título: {titulo}\n\n<documento>\n{texto}\n</documento>"}]


def _leer_json(contenido: str) -> ClasificacionIA:
    """Acepta JSON puro o envuelto en ```json ... ``` (habitual en modelos pequeños)."""
    m = re.search(r"\{.*\}", contenido, re.S)
    if not m:
        raise RuntimeError("La respuesta del modelo no contiene JSON")
    try:
        return ClasificacionIA.model_validate_json(m.group(0))
    except ValidationError as e:
        raise RuntimeError(f"El JSON del modelo no cumple el esquema: {e.errors()[0]['msg']}") from e


def _ollama(c: ConfigIA, texto: str, titulo: str, http: Http) -> ClasificacionIA:
    r = http(c.url.rstrip("/") + "/api/chat", {
        "model": c.modelo,
        "messages": _mensajes(texto, titulo),
        "stream": False,
        "format": ClasificacionIA.model_json_schema(),
        "options": {"temperature": 0},
    }, {})
    return _leer_json(r["message"]["content"])


def _compatible_openai(c: ConfigIA, texto: str, titulo: str, http: Http) -> ClasificacionIA:
    url = c.url.rstrip("/") + "/chat/completions"
    cuerpo = {"model": c.modelo, "messages": _mensajes(texto, titulo), "temperature": 0,
              "response_format": {"type": "json_object"}}
    encabezados = {"Authorization": f"Bearer {c.clave}"}
    try:
        r = http(url, cuerpo, encabezados)
    except urllib.error.HTTPError as e:
        if e.code != 400:
            raise
        # Algunos servicios no aceptan response_format: se reintenta sin él.
        cuerpo.pop("response_format")
        r = http(url, cuerpo, encabezados)
    return _leer_json(r["choices"][0]["message"]["content"])


def clasificar(texto: str, titulo: str = "", config: ConfigIA | None = None,
               http: Http = post_json, cliente_anthropic=None) -> tuple[ClasificacionIA, list[str]]:
    c = config or ConfigIA.desde_entorno()
    if c.proveedor == "anthropic":
        from .clasificar_ia import clasificar_con_claude
        kw = {"modelo": c.modelo} if c.modelo else {}
        return clasificar_con_claude(texto, titulo, cliente=cliente_anthropic, **kw)
    if len(texto) > c.max_caracteres:
        raise ValueError(f"Documento de {len(texto)} caracteres supera el máximo de {c.max_caracteres} "
                         "para este proveedor (ajuste JURISBOT_IA_MAX_CARACTERES si su modelo admite más).")
    resultado = (_ollama if c.proveedor == "ollama" else _compatible_openai)(c, texto, titulo, http)
    resultado, descartes = validar(resultado, texto)
    for d in descartes:
        log.warning("Descartado: %s", d)
    return resultado, descartes
