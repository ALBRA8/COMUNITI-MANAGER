# Capa OPCIONAL de especialización — Community Manager Agent (semilla ALBRA)

> Capa Python que transfiere la identidad y reglas de COMUNITI-MANAGER a una
> instancia de la semilla ALBRA (ALBRA Seed v1.0, MIT), SI el operador decide
> desplegar esa semilla. Cumple el contrato `docs/SPECIALIZATION.md` de la
> semilla: NO modifica `src/albra_seed/`; solo añade identidad, herramientas,
> skills, workflows, políticas, memoria y prompts de dominio.

## DECISIÓN DOCUMENTADA (2026-11-21): capa OPCIONAL, se conserva

**Decisión**: conservar `especializacion-albra/` como capa opcional, claramente
separada de la operación normal del agente.

**Evidencia que la sustenta** (verificada en la sesión de cierre):

1. **Cero dependencia de código**: ningún archivo de `app/src` importa o hace
   referencia a `especializacion-albra/` (grep en todo `app/src` = 0 resultados;
   solo `docs/architecture/INTEGRATIONS.md` la describe como opcional).
2. **El agente funciona completo sin ella**: las 10 baterías del repo pasan
   236/236 checks con BD virgen y sin semilla desplegada; el registro de
   herramientas marca `albra.seed` como categoría ECOSYSTEM opcional en
   `AWAITING_CREDENTIALS` (falla honesta con la variable exacta que falta:
   `ALBRA_SEED_URL`, `ALBRA_SEED_TOKEN`).
3. **Publicación sin semilla**: los canales propios (Telegram Bot API, sesión
   WhatsApp propia, worker FB-GROUPS, vías IG/FB) no consultan la semilla.
4. **Valor real si se despliega**: transfiere identidad del agente (autonomía
   L1, HITL para publicar), herramientas con ToolContract, skills, el ciclo de
   12 fases como WorkflowGraph y políticas — para operar COMUNITI-MANAGER SOBRE
   el runtime de la semilla si el operador lo quiere.

**Si se elimina**, no se rompe nada del agente; se conserva porque documenta
una vía de despliegue alternativa legítima y porque mantiene la sala limpia
verificada (clean_room_verify.py) sobre el contrato de especialización.

## Instalación en una instancia de la semilla (solo si el operador la usa)

```bash
git clone https://github.com/ALBRA8/AGENTE-GENERAL.git agente-community
cd agente-community
# Copiar la capa (sin tocar albra_seed):
cp -r /ruta/a/especializacion-albra/* src/albra_specialization/
# Verificar que la sala limpia sigue en PASS:
python scripts/clean_room_verify.py
```

## Contenido

| Carpeta | Qué aporta |
|---|---|
| `identity/` | `AgentIdentity` del agente de redes sociales (autonomía L1 por defecto, HITL para publicar) |
| `tools/` | 4 herramientas de dominio con `ToolContract` (brand_memory, content_drafts, comment_triage, publication_queue) |
| `skills/` | 4 skills con `SkillContract` (brand_memory_update, content_pipeline, community_triage, performance_report) |
| `workflows/` | Ciclo autónomo de 12 fases como `WorkflowGraph` |
| `policies/` | Reglas de política: HITL para publicar/responder/moderar; crisis → humano |
| `memory/` | Dominios de memoria aislados: `brand_<marca>` con aislamiento por marca |
| `prompts/` | Plantillas de prompt de cada agente especializado interno |

## Principios respetados (igual que el panel web)

1. Canales propios primero; servicios de OTROS agentes (escucha → CHISMOSO,
   mensajería → CRM-ALBRA, vídeo → YT-Automation…) solo si el operador los
   activa, vía contratos — son mundos aparte, no dependencias.
2. Sin secretos en código — usar `SecretsManager`.
3. Evidencia o no afirmación: toda investigación guarda `Evidence`.
4. Autonomía ≠ permiso: el firewall gobierna siempre.
5. CORE_ONLY funciona: sin proveedores externos el agente degradado opera con
   su motor propio, nunca simulando éxito externo.
