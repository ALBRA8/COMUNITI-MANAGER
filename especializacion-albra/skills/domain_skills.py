"""Skills de dominio del community manager (SkillContract)."""

from __future__ import annotations

from albra_seed import Skill, RiskLevel


class BrandMemoryUpdateSkill(Skill):
    skill_id = "skill.brand_memory_update"
    name = "brand_memory_update"
    objective = "Actualizar la memoria de marca mediante procedimientos controlados (con procedencia y evidencia)"
    inputs = {"brand_id": "string", "payload": "object", "source": "string", "evidence_ids": "list[str]"}
    outputs = {"updated": "boolean"}
    dependencies: list[str] = ["tool.brand_memory"]
    permissions: list[str] = ["skill.brand_memory_update.execute"]
    risk_level = RiskLevel.LOW
    evidence_required = True


class ContentPipelineSkill(Skill):
    skill_id = "skill.content_pipeline"
    name = "content_pipeline"
    objective = "Ejecutar el pipeline crear→validar→aprobar para un objetivo de contenido"
    inputs = {"brand_id": "string", "objective": "string", "networks": "list[str]"}
    outputs = {"draft_id": "string", "validation": "object"}
    dependencies: list[str] = ["tool.content_drafts"]
    permissions: list[str] = ["skill.content_pipeline.execute"]
    risk_level = RiskLevel.MEDIUM
    evidence_required = False


class CommunityTriageSkill(Skill):
    skill_id = "skill.community_triage"
    name = "community_triage"
    objective = "Clasificar una interacción y decidir: responder (autorizado), moderar o derivar a humano"
    inputs = {"brand_id": "string", "external_id": "string", "text": "string"}
    outputs = {"classification": "string", "risk": "string", "escalate": "boolean"}
    dependencies: list[str] = ["tool.comment_triage"]
    permissions: list[str] = ["skill.community_triage.execute"]
    risk_level = RiskLevel.MEDIUM
    evidence_required = False


class PerformanceReportSkill(Skill):
    skill_id = "skill.performance_report"
    name = "performance_report"
    objective = "Generar informe de rendimiento distinguiendo datos verificados de estimaciones"
    inputs = {"brand_id": "string", "window_days": "int"}
    outputs = {"report": "object"}
    dependencies: list[str] = []
    permissions: list[str] = ["skill.performance_report.execute"]
    risk_level = RiskLevel.LOW
    evidence_required = True
