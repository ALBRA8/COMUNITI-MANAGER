# INTEGRACIONES — SOCIAL AUTOPILOT AI con el ecosistema ALBRA y proveedores

> Fase 1 · Cómo se conecta cada pieza · 2026-10-27

## 1. Principios de integración

1. **MCP-first con fallback REST**: si un agente del ecosistema expone MCP, se usa MCP; si no, REST.
2. **Nada se integra dos veces**: cada capacidad tiene UN responsable (ver REFERENTES_20.md §21).
3. **Honestidad**: cada conector reporta su estado real; sin credenciales → `AWAITING_CREDENTIALS` y la función se degrada, no se simula.
4. **Idempotencia en toda acción externa**; resultado incierto → reconciliación, nunca reintento ciego.
5. **Cambiar de proveedor no toca el orquestador**: solo cambia el adaptador.

## 2. AGENTE-GENERAL (la semilla — el agente vestido por el arnés)

- **Rol**: runtime del agente. El arnés no reimplementa su código (contrato de especialización).
- **Estado**: no desplegada por defecto. El arnés funciona con su motor propio y muestra la conexión como estado.
- **Salud**: `GET {ALBRA_SEED_URL}/api/v1/health` y `/api/v1/readiness`.
- **Ejecución delegada**: `POST {ALBRA_SEED_URL}/api/v1/execution` (requiere Bearer + política `execution:run` en la semilla).
- **Especialización incluida**: `especializacion-albra/` (capa Python lista para copiar a `src/albra_specialization/` de una instancia de la semilla: identidad del agente community manager, herramientas de dominio con ToolContract, skills, workflow del ciclo con WorkflowGraph y reglas de política de autonomía). Esa capa no modifica `src/albra_seed/` y mantiene CORE_ONLY.
- **Variables**: `ALBRA_SEED_URL`, `ALBRA_SEED_TOKEN`.

## 3. CRM-ALBRA (mensajería entrante y CRM) — el arnés es su HOST

- **Contrato formal del chaleco**: `POST {CRM_URL}/api/crm/actions` con API key `albra_*` (RBAC); MCP en `{CRM_URL}/api/mcp` (16 tools); memoria `{CRM_URL}/api/memory` (MemoryDV).
- **Uso desde el arnés**: derivar conversaciones humanas al inbox del CRM; leer contactos/oportunidades; registrar leads captados en comentarios; nunca auto-responder por su cuenta (eso ya lo hace el CRM con handoff y kill-switch).
- **Variables**: `CRM_ALBRA_URL`, `CRM_ALBRA_API_KEY`.

## 4. AGENTE-CHISMOSO (escucha social)

- **Consumo**: malla de eventos — `GET {CHISMOSO_URL}/api/mesh/events` y ack; señales de oportunidades con `scoreBreakdown`.
- **Uso**: la fase INVESTIGAR/ANALIZAR del ciclo incluye oportunidades de Chismoso como entradas con evidencia; alertas visibles en Resumen ejecutivo.
- **Variables**: `CHISMOSO_URL` (+ token si se configura).

## 5. AGENTE-LEADS (prospección y outreach 1:1)

- **Entrada al arnés**: webhooks `lead.created / lead.scored / outreach_sent` (secret Bearer) → aparecen en Comunidad/Captación.
- **Salida del arnés**: leads detectados en comentarios públicos → cola de captación (sin mensajes masivos).
- **Variables**: `LEADS_WEBHOOK_SECRET` (validación de entrantes).

## 6. WHATSPOWER-ULTRA (difusión masiva WhatsApp)

- **Cuándo**: campañas de difusión autorizadas por la marca (opt-in verificado).
- **API**: `POST {WHATPOWER_URL}/api/campaigns`, `/pause`, `/resume`, `/cancel`; leads → `/api/audiences/webhook-lead`.
- **Regla**: el arnés nunca envía masivos por su cuenta; crea la campaña y el escudo anti-ban de WhatsPower gobierna el despacho. `ALLOW_REAL_DISPATCH=false` por defecto en WhatsPower.
- **Variables**: `WHATPOWER_URL` (puerto 3004 típico).

## 7. AGENTE-KREA (creatividades)

- **API**: `POST {KREA_URL}/api/generate/text|image|voice|subtitle|ebook` (auth Bearer + créditos); también protocolo ADN/MCP.
- **Uso**: el Director creativo emite briefs; KREA produce assets; la Biblioteca multimedia guarda el asset con referencia de fuente y licencia.
- **Variables**: `KREA_URL`, `KREA_API_KEY`.

## 8. YOUTUBE-AUTOMATION (vídeo) y NEX-SCOPE (investigación YouTube)

- **YT**: MCP (25 tools) o A2A `POST {YT_URL}/api/agent/execute` con `creative_spec`; el arnés pide guion→vídeo→clips y recibe MP4/SRT para el calendario. QA gate antes de publicar.
- **NEX**: MCP (12 tools) o REST `/api/keywords|trends|content-plan|competitor-analysis` para Investigación.
- **Variables**: `YTAUTO_URL`, `NEXSCOPE_URL` (+ MCP endpoints si se configuran).

## 9. Proveedores de publicación

### 9.1 Postgale (primario)
- `POST {POSTGALE_URL}/api/v1/posts` con `Authorization: Bearer` y header `x-request-id` (idempotencia).
- Programación, cuentas, moderación y DMs según su API; webhooks entrantes firmados HMAC-SHA256 (`${timestamp}.${body}`) para verificación de publicaciones y comentarios nuevos.
- Límite documentado: 60 req/min → el registro de herramientas aplica throttle propio.
- **Variables**: `POSTGALE_URL`, `POSTGALE_API_KEY`, `POSTGALE_WEBHOOK_SECRET`.

### 9.2 Postiz (self-host alternativo)
- Operar UNA instancia propia; `POST {POSTIZ_URL}/api/v1/posts` con `x-api-key` (según su API pública vigente).
- **AGPL-3.0**: no se copia ni modifica su código; solo se consume como servicio externo. Revisar obligaciones si se ofrece como parte de un servicio de red.
- **Variables**: `POSTIZ_URL`, `POSTIZ_API_KEY`.

### 9.3 PostLake MCP (alternativa agentic)
- Endpoint MCP: `https://api.postlake.dev/mcp` (configurable); REST `/v1/posts` normalizada.
- **Variables**: `POSTLAKE_URL`, `POSTLAKE_API_KEY`.

## 10. ScrapeCreators (investigación social)

- REST por endpoint (TikTok/IG/YT/X…): perfil, posts, comentarios, transcripciones, ad libraries. API key por header.
- **Regla de evidencia**: cada dato guarda `Evidence(source=scrapecreators, url, payload, capturedAt)`; sin evidencia no hay afirmación.
- **Variables**: `SCRAPECREATORS_API_KEY`.

## 11. Matriz de contratos → proveedores

| Contrato interno | Responsable primario | Fallback |
|---|---|---|
| get_capabilities / get_connection_status | Registro (local) | Salud de cada API |
| list_accounts | Postgale | Postiz / PostLake |
| schedule_post / publish_post / verify_publication | Postgale | Postiz / PostLake |
| fetch_metrics | Postgale/PostLake + snapshots propios | APIs oficiales por red |
| fetch_comments | Postgale (webhooks + pull) | ScrapeCreators (lectura pública) |
| reply_to_comment / reply_to_message | Postgale | CRM-ALBRA (DM) |
| moderate_item | Módulo Comunidad (arnés) | — |
| research_topic | ScrapeCreators | CHISMOSO (web) |
| analyze_competitor | ScrapeCreators + NEX-SCOPE | — |
| create_content_draft / validate_content | Motor propio (memoria de marca) | — |
| generate_creative_brief | Motor propio | KREA (assets) |
| request_approval | Módulo Aprobaciones (arnés) | — |
| create_lead | Módulo Captación → CRM/LEADS | — |
| record_experiment / generate_performance_report | Motor propio (Analítica) | — |

## 12. Webhooks entrantes (hacia el arnés)

| Ruta | Origen | Seguridad |
|---|---|---|
| `/api/webhooks/crm` | CRM-ALBRA | HMAC + secret |
| `/api/webhooks/leads` | AGENTE-LEADS | Bearer secret |
| `/api/webhooks/mesh` | AGENTE-CHISMOSO | Bearer secret |
| `/api/webhooks/postgale` | Postgale | HMAC-SHA256 timestamp+body |
| `/api/webhooks/whatspower` | WHATSPOWER-ULTRA | Bearer secret |

Todas las rutas validan firma/secret, guardan el evento crudo y responden 2xx antes de procesar (patrón outbox).

## 13. Variables de entorno (resumen)

```env
# Semilla ALBRA (opcional)
ALBRA_SEED_URL=
ALBRA_SEED_TOKEN=
# Ecosistema
CRM_ALBRA_URL=        CRM_ALBRA_API_KEY=
CHISMOSO_URL=
LEADS_WEBHOOK_SECRET=
WHATPOWER_URL=
KREA_URL=             KREA_API_KEY=
YTAUTO_URL=
NEXSCOPE_URL=
# Publicación
POSTGALE_URL=         POSTGALE_API_KEY=     POSTGALE_WEBHOOK_SECRET=
POSTIZ_URL=           POSTIZ_API_KEY=
POSTLAKE_URL=         POSTLAKE_API_KEY=
# Investigación
SCRAPECREATORS_API_KEY=
# Seguridad interna
HARNESS_WEBHOOK_SECRET=
```

Sin variables → la herramienta correspondiente queda `AWAITING_CREDENTIALS`. Nada se rompe; nada se finge.
