"""Capa de especialización del Community Manager sobre la semilla ALBRA.

Punto de cableado (contrato de especialización §2, paso 6). No modifica
src/albra_seed/. Funciona en CORE_ONLY (mock) sin credenciales externas.
"""

from __future__ import annotations

import asyncio

from albra_seed import Agent, Runtime, SeedConfig
from albra_specialization.identity.community_identity import build_community_manager_identity
from albra_specialization.tools.domain_tools import (
    BrandMemoryTool,
    CommentTriageTool,
    ContentDraftsTool,
    PublicationQueueTool,
)
from albra_specialization.policies.community_policies import community_policy_rules
from albra_specialization.workflows.community_cycle import build_community_cycle


async def build_community_manager_agent() -> Agent:
    """Construye el agente community manager completo sobre la semilla."""
    config = SeedConfig.from_env()
    runtime = Runtime(config=config)
    await runtime.startup()

    # Registro de herramientas de dominio (ToolContract)
    runtime.register_tool(BrandMemoryTool())
    runtime.register_tool(ContentDraftsTool())
    runtime.register_tool(CommentTriageTool())
    runtime.register_tool(PublicationQueueTool())

    # Registro de políticas de dominio (se fusionan con las de la semilla;
    # las de dominio tienen prioridad para acciones de community management)
    runtime.register_policy_rules(community_policy_rules())

    # Registro del workflow del ciclo autónomo (WorkflowGraph)
    runtime.register_workflow(build_community_cycle())

    identity = build_community_manager_identity()
    return Agent(identity=identity, runtime=runtime)


async def main() -> None:
    agent = await build_community_manager_agent()
    response = await agent.run("Resume el estado del arnés de community management")
    print(response.content)


if __name__ == "__main__":
    asyncio.run(main())
