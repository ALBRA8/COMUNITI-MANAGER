"""Dominios de memoria aislados por marca (contrato de especialización §4).

Aislamiento compuesto (agent_id, domain, user_id, context_id): los datos de
una marca jamás son accesibles desde otra.
"""

from __future__ import annotations

from albra_seed.memory import MemoryRecord, MemoryType

AGENT_ID = "albra-community-manager"


def brand_domain(brand_id: str) -> str:
    """Cada marca tiene su dominio aislado: brand_<marca_id>."""
    return f"brand_{brand_id}"


def make_brand_record(brand_id: str, user_id: str, context_id: str, content: dict, confidence: float, source: str, evidence_ids: list[str]) -> MemoryRecord:
    """Registro de memoria de marca con procedencia + evidencia obligatorias.

    UNKNOWN nunca se promueve a FACT: la semilla lo valida con
    MemoryProvenance.validate_fact().
    """
    return MemoryRecord(
        agent_id=AGENT_ID,
        domain=brand_domain(brand_id),
        user_id=user_id,
        context_id=context_id,
        memory_type=MemoryType.FACTUAL,
        content=content,
        confidence=confidence,
        source=source,
        evidence_ids=evidence_ids,
    )
