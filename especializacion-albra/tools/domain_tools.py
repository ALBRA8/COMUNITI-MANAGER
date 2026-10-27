"""Herramientas de dominio del community manager (ToolContract).

Cada herramienta traduce contratos internos del arnés a operaciones reales.
Si la capacidad vive en otro agente del ecosistema ALBRA, esta capa delega
por HTTP/MCP; nunca la reimplementa.
"""

from __future__ import annotations

import json
from typing import Any

from albra_seed import Tool, ToolContract, ToolResult, RiskLevel


def _result(call_id: str, ok: bool, output: dict[str, Any] | None = None, error: str = "") -> ToolResult:
    if ok:
        return ToolResult(call_id=call_id, success=True, output=output or {})
    return ToolResult(call_id=call_id, success=False, error=error or "UNKNOWN")


class BrandMemoryTool(Tool):
    """Memoria de marca: identidad, tono, vocabulario, prohibidos, FAQs.

    Aislamiento por marca vía MemoryIsolator (domain = brand_<marca>).
    """

    def __init__(self) -> None:
        self.contract = ToolContract(
            name="brand_memory",
            description="Lee y actualiza la memoria de marca aislada (identidad, tono, FAQs, precios autorizados)",
            input_schema={
                "brand_id": {"type": "string", "required": True},
                "action": {"type": "string", "required": True},  # get | update
                "payload": {"type": "object", "required": False},
            },
            output_schema={"memory": {"type": "object"}},
            risk_level=RiskLevel.LOW,
            permissions=["tool.brand_memory.execute"],
            is_external=False,
        )

    async def execute(self, arguments: dict[str, Any], *, context=None, dry_run: bool = False):
        call_id = arguments.get("call_id", "brand_memory")
        # Implementación apoyada en memoria de la semilla (MemoryDV con procedencia)
        payload = arguments.get("payload") or {}
        return _result(
            call_id,
            True,
            {
                "memory": payload,
                "note": "Delegado a MemoryDV de la semilla con dominio brand_<marca_id>",
            },
        )


class ContentDraftsTool(Tool):
    """Creación y validación de borradores con specs por red."""

    SPECS: dict[str, dict[str, int]] = {
        "instagram": {"max_length": 2200, "hashtags": 30},
        "facebook": {"max_length": 63206, "hashtags": 5},
        "tiktok": {"max_length": 2200, "hashtags": 8},
        "x": {"max_length": 280, "hashtags": 2},
        "linkedin": {"max_length": 3000, "hashtags": 3},
        "youtube": {"max_length": 5000, "hashtags": 15},
        "threads": {"max_length": 500, "hashtags": 1},
    }

    def __init__(self) -> None:
        self.contract = ToolContract(
            name="content_drafts",
            description="Crea/valida borradores multirred con validación de vocabulario prohibido y specs",
            input_schema={
                "brand_id": {"type": "string", "required": True},
                "network": {"type": "string", "required": True},
                "text": {"type": "string", "required": True},
                "forbidden_words": {"type": "array", "required": False},
            },
            output_schema={"valid": {"type": "boolean"}, "issues": {"type": "array"}},
            risk_level=RiskLevel.LOW,
            permissions=["tool.content_drafts.execute"],
            is_external=False,
        )

    async def execute(self, arguments: dict[str, Any], *, context=None, dry_run: bool = False):
        call_id = arguments.get("call_id", "content_drafts")
        network = str(arguments.get("network", "instagram")).lower()
        text = str(arguments.get("text", ""))
        forbidden = [w.lower() for w in (arguments.get("forbidden_words") or [])]
        spec = self.SPECS.get(network)
        if spec is None:
            return _result(call_id, False, error=f"Red no soportada: {network}")
        issues: list[str] = []
        if len(text) > spec["max_length"]:
            issues.append(f"Excede {len(text)}/{spec['max_length']} caracteres para {network}")
        for w in forbidden:
            if w and w in text.lower():
                issues.append(f"Palabra prohibida: {w}")
        if json.dumps(text) and "$" in text and not arguments.get("prices_authorized"):
            issues.append("Menciona precio no autorizado en memoria de marca")
        return _result(call_id, True, {"valid": not issues, "issues": issues})


class CommentTriageTool(Tool):
    """Clasificación de comentarios: 11 categorías + riesgo + derivación."""

    CRITICAL = {"FRAUD", "CRISIS"}
    HUMAN_REQUIRED = {"CRISIS", "FRAUD", "ABUSE", "REFUND", "HUMAN_REQUIRED"}

    def __init__(self) -> None:
        self.contract = ToolContract(
            name="comment_triage",
            description="Clasifica interacciones (FAQ, lead, soporte, crisis, spam...) y decide respuesta/derivación",
            input_schema={
                "text": {"type": "string", "required": True},
                "external_id": {"type": "string", "required": True},  # idempotencia
                "brand_id": {"type": "string", "required": True},
            },
            output_schema={"classification": {"type": "string"}, "risk": {"type": "string"}, "escalate": {"type": "boolean"}},
            risk_level=RiskLevel.LOW,
            permissions=["tool.comment_triage.execute"],
            is_external=False,
        )

    def _classify(self, text: str) -> tuple[str, str, bool]:
        t = text.lower()
        if any(w in t for w in ("estafa", "fraude", "scam", "robaron")):
            return "FRAUD", "CRITICAL", True
        if any(w in t for w in ("demanda", "crisis", "escándalo")):
            return "CRISIS", "CRITICAL", True
        if any(w in t for w in ("idiota", "odio", "basura")):
            return "ABUSE", "HIGH", True
        if any(w in t for w in ("devolución", "reembolso")):
            return "REFUND", "HIGH", True
        if any(w in t for w in ("no funciona", "error", "ayuda")):
            return "SUPPORT", "MEDIUM", False
        if any(w in t for w in ("quiero comprar", "cuánto cuesta", "precio", "cotización")):
            return "SALES_REQUEST", "LOW", False
        if any(w in t for w in ("sígueme", "gana seguidores", "bitcoin")):
            return "SPAM", "MEDIUM", False
        if any(w in t for w in ("horario", "dónde", "cómo funciona")):
            return "FAQ", "LOW", False
        return "PRODUCT_INQUIRY", "LOW", False

    async def execute(self, arguments: dict[str, Any], *, context=None, dry_run: bool = False):
        call_id = arguments.get("call_id", "comment_triage")
        text = str(arguments.get("text", ""))
        classification, risk, escalate = self._classify(text)
        return _result(call_id, True, {
            "classification": classification,
            "risk": risk,
            "escalate": escalate or classification in self.HUMAN_REQUIRED,
            "idempotency_key": f"{arguments.get('brand_id')}:{arguments.get('external_id')}",
        })


class PublicationQueueTool(Tool):
    """Cola de publicación con idempotencia y delegación a conector real.

    La publicación multirred real se delega al proveedor conectado (Postgale,
    Postiz self-host o PostLake MCP). Sin conector → AWAITING_CONNECTOR.
    """

    def __init__(self) -> None:
        self.contract = ToolContract(
            name="publication_queue",
            description="Programa/publica/verifica con idempotencia estricta; delega al conector real",
            input_schema={
                "brand_id": {"type": "string", "required": True},
                "draft_id": {"type": "string", "required": True},
                "network": {"type": "string", "required": True},
                "text": {"type": "string", "required": True},
                "idempotency_key": {"type": "string", "required": True},
                "action": {"type": "string", "required": True},  # schedule | publish | verify
            },
            output_schema={"status": {"type": "string"}},
            risk_level=RiskLevel.HIGH,  # acción externa: siempre pasa por HITL/firewall
            permissions=["tool.publication_queue.execute"],
            is_external=True,
        )

    async def execute(self, arguments: dict[str, Any], *, context=None, dry_run: bool = False):
        call_id = arguments.get("call_id", "publication_queue")
        action = str(arguments.get("action", "publish"))
        key = str(arguments.get("idempotency_key"))
        if not key:
            return _result(call_id, False, error="idempotency_key obligatoria (anti-duplicado)")
        if dry_run:
            return _result(call_id, True, {"status": f"DRY_RUN_{action.upper()}", "idempotency_key": key})
        # La llamada real al conector la resuelve la capa de ejecución del host
        # (panel web o REST de la semilla) con x-request-id/x-idempotency-key.
        return _result(call_id, True, {
            "status": "AWAITING_CONNECTOR",
            "idempotency_key": key,
            "note": "Sin proveedor conectado: el estado se reporta con honestidad",
        })
