# Capa de especialización — Community Manager Agent (ALBRA)

> Chaleco Python para la semilla AGENTE-GENERAL (ALBRA Seed v1.0, MIT).
> Cumple el contrato `docs/SPECIALIZATION.md` de la semilla: NO modifica
> `src/albra_seed/`; solo añade identidad, herramientas, skills, workflows,
> políticas, memoria y prompts de dominio.

## Instalación en una instancia de la semilla

```bash
git clone https://github.com/ALBRA8/AGENTE-GENERAL.git agente-community
cd agente-community
# Copiar la capa (sin tocar albra_seed):
cp -r /ruta/a/este-directorio/* src/albra_specialization/
# Verificar que la sala limpia sigue en PASS:
python scripts/clean_room_verify.py
```

## Contenido

| Carpeta | Qué aporta |
|---|---|
| `identity/` | `AgentIdentity` del community manager (autonomía L1 por defecto, HITL para publicar) |
| `tools/` | 4 herramientas de dominio con `ToolContract` (brand_memory, content_drafts, comment_triage, publication_queue) |
| `skills/` | 4 skills con `SkillContract` (brand_memory_update, content_pipeline, community_triage, performance_report) |
| `workflows/` | Ciclo autónomo de 12 fases como `WorkflowGraph` |
| `policies/` | Reglas de política: HITL para publicar/responder/moderar; crisis → humano |
| `memory/` | Dominios de memoria aislados: `brand_<marca>` con aislamiento por marca |
| `prompts/` | Plantillas de prompt de cada agente especializado |

## Principios respetados (igual que el panel web)

1. NO duplicar capacidades del ecosistema (escucha → CHISMOSO, mensajería → CRM-ALBRA, vídeo → YT-Automation…): las herramientas de dominio llaman a esas APIs vía contratos cuando están desplegadas.
2. Sin secretos en código — usar `SecretsManager`.
3. Evidencia o no afirmación: toda investigación guarda `Evidence`.
4. Autonomía ≠ permiso: el firewall de la semilla gobierna siempre.
5. CORE_ONLY funciona: sin proveedores externos el agente degradado opera con mock, nunca simulando éxito externo.
