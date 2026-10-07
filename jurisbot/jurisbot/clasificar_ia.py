"""Clasificación y resumen con la API de Claude (opcional).

Requiere `pip install anthropic` y credenciales (ANTHROPIC_API_KEY o `ant auth login`).

Salvaguardas contra invención:
- El modelo solo recibe el texto del documento y la taxonomía cerrada.
- Las materias fuera de la taxonomía se descartan.
- Cada norma citada que devuelva el modelo se comprueba contra el texto; las
  que no aparezcan literalmente se descartan y quedan registradas en el log.
- El resumen se guarda marcado como generado por IA y el documento sigue
  "sin_verificar" hasta que una persona lo revise.
"""
from __future__ import annotations

import logging
import re
from typing import Literal

from pydantic import BaseModel, Field

from .clasificar import TAXONOMIA, normalizar

log = logging.getLogger(__name__)

MODELO = "claude-opus-5-5"
# Límite de caracteres que se envían; documentos más largos se rechazan en vez
# de truncarse en silencio (un fallo parcial cambiaría la clasificación).
MAX_CARACTERES = 400_000

SISTEMA = """Eres un analista jurídico chileno que clasifica documentos oficiales \
(sentencias de la Corte Suprema y del Tribunal Constitucional, dictámenes de la \
Contraloría General de la República y de la Dirección del Trabajo, circulares del SII).

Reglas:
1. Trabaja solo con el texto entregado. No agregues hechos, normas, roles ni fechas \
que no estén en él.
2. "materias": elige solo claves de la taxonomía entregada (máximo 4), de la más a la \
menos relevante. Si ninguna aplica, devuelve una lista vacía.
3. "normas_citadas": copia las normas tal como aparecen escritas en el texto. Si no \
hay, lista vacía.
4. "resumen": 3 a 5 oraciones en español: qué se pidió o consultó, qué se resolvió o \
dictaminó y el criterio central. Si el texto está incompleto o ilegible, dilo.
5. "decision": la parte resolutiva en una frase (por ejemplo "acoge el recurso", \
"rechaza", "se abstiene"), o "no consta" si el texto no la contiene."""


class ClasificacionIA(BaseModel):
    materias: list[str] = Field(description="Claves de la taxonomía")
    normas_citadas: list[str]
    resumen: str
    decision: str
    calidad_texto: Literal["completo", "incompleto", "ilegible"]


def _taxonomia_texto() -> str:
    return "\n".join(f"- {k}: {v['nombre']}" for k, v in TAXONOMIA.items())


def _aparece(norma: str, texto_norm: str) -> bool:
    """La norma aparece en el texto (comparando sin tildes ni 'N°')."""
    n = normalizar(norma)
    if n in texto_norm:
        return True
    # Tolera diferencias de puntuación en el número: "ley 18695" vs "ley 18.695".
    numeros = re.findall(r"\d[\d\.]*", n)
    return bool(numeros) and all(num.replace(".", "") in texto_norm.replace(".", "") for num in numeros) \
        and n.split()[0] in texto_norm


def validar(resultado: ClasificacionIA, texto: str) -> tuple[ClasificacionIA, list[str]]:
    """Descarta materias fuera de taxonomía y normas que no están en el texto."""
    descartes = []
    materias = [m for m in resultado.materias if m in TAXONOMIA]
    descartes += [f"materia fuera de taxonomía: {m}" for m in resultado.materias if m not in TAXONOMIA]
    tn = normalizar(texto)
    normas = []
    for n in resultado.normas_citadas:
        if _aparece(n, tn):
            normas.append(n)
        else:
            descartes.append(f"norma no encontrada en el texto: {n}")
    return resultado.model_copy(update={"materias": materias[:4], "normas_citadas": normas}), descartes


def clasificar_con_claude(texto: str, titulo: str = "", cliente=None,
                          modelo: str = MODELO) -> tuple[ClasificacionIA, list[str]]:
    if len(texto) > MAX_CARACTERES:
        raise ValueError(f"Documento de {len(texto)} caracteres supera el máximo de "
                         f"{MAX_CARACTERES}; divídalo antes de clasificarlo.")
    if cliente is None:
        import anthropic  # dependencia opcional
        cliente = anthropic.Anthropic()

    respuesta = cliente.messages.parse(
        model=modelo,
        max_tokens=4000,
        output_config={"effort": "low"},
        # La taxonomía y las reglas son estables: se cachean entre documentos.
        system=[{"type": "text", "text": SISTEMA + "\n\nTaxonomía:\n" + _taxonomia_texto(),
                 "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": f"Título: {titulo}\n\n<documento>\n{texto}\n</documento>"}],
        output_format=ClasificacionIA,
    )
    if respuesta.stop_reason == "refusal":
        raise RuntimeError("El modelo rechazó clasificar este documento")
    if respuesta.parsed_output is None:
        raise RuntimeError(f"Respuesta sin salida estructurada (stop_reason={respuesta.stop_reason})")
    resultado, descartes = validar(respuesta.parsed_output, texto)
    for d in descartes:
        log.warning("Descartado: %s", d)
    return resultado, descartes
