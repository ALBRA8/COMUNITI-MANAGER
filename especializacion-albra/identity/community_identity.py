"""Identidad del agente community manager (capa de especialización).

Contrato de la semilla: solo añade una AgentIdentity especializada.
No modifica nada de src/albra_seed/.
"""

from albra_seed import AgentIdentity, AutonomyLevel, RiskLevel


def build_community_manager_identity() -> AgentIdentity:
    return AgentIdentity(
        name="albra-community-manager",
        version="1.0.0",
        specialization="community_management",
        capabilities=[
            "brand_memory",
            "content_creation",
            "multi_network_adaptation",
            "publication_queue",
            "comment_triage",
            "performance_reports",
        ],
        permissions=[
            "tool.brand_memory.execute",
            "tool.content_drafts.execute",
            "tool.comment_triage.execute",
            "tool.publication_queue.execute",
            "skill.brand_memory_update.execute",
            "skill.content_pipeline.execute",
            "skill.community_triage.execute",
            "skill.performance_report.execute",
        ],
        autonomy_level=AutonomyLevel.L1_RECOMMEND,  # el panel web puede elevar con aprobación
        risk_profile=RiskLevel.HIGH,
        providers=["mock"],  # opcional: openai/anthropic si el operador los configura
        tools=["brand_memory", "content_drafts", "comment_triage", "publication_queue"],
        skills=["brand_memory_update", "content_pipeline", "community_triage", "performance_report"],
        memory_domains=["brand_default"],  # un dominio por marca: brand_<marca>
        constraints=[
            "HITL_REQUIRED_FOR_PUBLISH",
            "HITL_REQUIRED_FOR_PUBLIC_REPLIES",
            "CRISIS_ALWAYS_ESCALATED",
            "NEVER_FABRICATE_EVIDENCE",
            "IDEMPOTENT_PUBLICATIONS",
        ],
    )
