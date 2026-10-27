"""Ciclo autónomo de community management como WorkflowGraph (PRD §7).

12 fases con salida estructurada. APROBAR interrumpe el flujo cuando el
modo de autonomía requiere HITL (la semilla reanuda al recibir la decisión).
"""

from __future__ import annotations

from albra_seed.workflows import WorkflowGraph  # contrato de la semilla

CYCLE = [
    ("RESEARCH", "researcher"),
    ("ANALYZE", "trends"),
    ("PLAN", "planner"),
    ("CREATE", "writer"),
    ("VALIDATE", "supervisor"),
    ("APPROVE", "planner"),
    ("PUBLISH", "publisher"),
    ("VERIFY", "publisher"),
    ("ENGAGE", "community"),
    ("MEASURE", "analyst"),
    ("LEARN", "optimizer"),
    ("OPTIMIZE", "strategy"),
]


def build_community_cycle() -> WorkflowGraph:
    """Construye el grafo del ciclo INVESTIGAR→…→OPTIMIZAR.

    Cada nodo usa la skill del agente correspondiente; las aristas son
    secuenciales y el nodo APPROVE es condicional (HITL o auto según
    PolicyEngine de la semilla).
    """
    graph = WorkflowGraph(name="community_autonomous_cycle", version="1.0.0")
    prev = None
    for phase, agent in CYCLE:
        graph.add_node(
            name=phase,
            skill=f"skill.{phase.lower()}.execute",
            agent=agent,
            interrupt_on_hitl=(phase == "APPROVE"),
        )
        if prev:
            graph.add_edge(prev, phase)
        prev = phase
    # El ciclo aprende: OPTIMIZE alimenta al siguiente PLAN
    graph.add_edge("OPTIMIZE", "PLAN")
    return graph
