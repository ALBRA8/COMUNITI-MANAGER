"""Políticas de dominio del community manager (extensión de PolicyRuleSet).

Reglas de negocio del PRD: HITL para publicar/responder/moderar, crisis
siempre escalada, límites por marca y pausa global respetada.
"""

from __future__ import annotations

from albra_seed.policy import PolicyRule, PolicyRuleSet
from albra_seed import RiskLevel, PolicyDecision, AutonomyLevel


def community_policy_rules() -> PolicyRuleSet:
    return PolicyRuleSet(
        rules=[
            PolicyRule(
                name="hitl_publish_post",
                action_pattern="tool.publication_queue.execute",
                actor_pattern="*",
                risk_threshold=RiskLevel.HIGH,
                autonomy_required=AutonomyLevel.L4_EXECUTE_SENSITIVE,
                decision=PolicyDecision.REQUIRE_HITL,
                priority=100,
            ),
            PolicyRule(
                name="hitl_public_reply",
                action_pattern="skill.community_triage.execute:reply",
                actor_pattern="*",
                risk_threshold=RiskLevel.MEDIUM,
                autonomy_required=AutonomyLevel.L3_EXECUTE_SAFE,
                decision=PolicyDecision.REQUIRE_HITL,
                priority=90,
            ),
            PolicyRule(
                name="crisis_always_human",
                action_pattern="skill.community_triage.execute:classify",
                actor_pattern="*",
                risk_threshold=RiskLevel.CRITICAL,
                autonomy_required=AutonomyLevel.L4_EXECUTE_SENSITIVE,
                decision=PolicyDecision.REQUIRE_HITL,
                priority=110,
            ),
            PolicyRule(
                name="read_only_low_risk",
                action_pattern="tool.brand_memory.execute|tool.content_drafts.execute|tool.comment_triage.execute",
                actor_pattern="*",
                risk_threshold=RiskLevel.LOW,
                autonomy_required=AutonomyLevel.L2_PROPOSE,
                decision=PolicyDecision.ALLOW,
                priority=10,
            ),
        ]
    )
