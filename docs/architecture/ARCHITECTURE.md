# ARQUITECTURA — SOCIAL AUTOPILOT AI (Arnés para el ecosistema ALBRA)

> Fase 1 · Documento de arquitectura · v1.0 · 2026-10-27

## 1. Idea central

**El agente no se reconstruye: se viste.** AGENTE-GENERAL (ALBRA Seed, MIT) es
el runtime universal sin conocimiento de dominio. Social Autopilot AI es el
**arnés** que le añade el dominio de community management y añade un panel de
control en español, al tiempo que coordina a los agentes especializados que ya
existen en el ecosistema ALBRA8.

```
┌────────────────────────────────────────────────────────────────────┐
│                    PANEL WEB (Next.js 16, español)                 │
│   18 secciones del PRD · estados honestos · pausa global           │
├────────────────────────────────────────────────────────────────────┤
│                    MOTOR DEL ARNÉS (TypeScript)                    │
│                                                                    │
│  Orquestador ── Plan → Tareas → Subtareas (estado persistente)     │
│      │                                                             │
│      ├── 14 Agentes especializados (skills reales, no cáscaras)    │
│      ├── Registro de Herramientas (contratos normalizados)         │
│      ├── Memoria de Marca (aislada por marca, con procedencia)     │
│      └── Gobierno: Autonomía L1/L2/L3 · Firewall · Auditoría       │
│           · Idempotencia · Pausa global · Reintentos con backoff   │
├──────────────┬───────────────────────┬─────────────────────────────┤
│ CONECTORES   │      CONECTORES       │      CONECTORES             │
│ PUBLICACIÓN  │      INVESTIGACIÓN    │      ECOSISTEMA ALBRA       │
│              │                       │                             │
│ Postgale     │  ScrapeCreators       │  AGENTE-CHISMOSO (mesh)     │
│ (primario)   │  (evidencias + URL)   │  CRM-ALBRA (host/MCP)       │
│ Postiz       │  NEX-SCOPE (YT)       │  AGENTE-LEADS (webhooks)    │
│ (self-host)  │                       │  WHATSPOWER-ULTRA (:3004)   │
│ PostLake     │                       │  AGENTE-KREA (/generate)    │
│ (MCP)        │                       │  YOUTUBE-AUTOMATION (MCP)   │
└──────────────┴───────────────────────┴─────────────────────────────┘
          │
          ▼  (cuando la semilla está desplegada)
   AGENTE-GENERAL API: /api/v1/health · /api/v1/readiness · /api/v1/execution
   Capa de especialización Python: especializacion-albra/ (contrato Seed)
```

## 2. Capas (según PRD §4)

### A. Orquestador central (`src/lib/orchestrator/`)
- Interpreta objetivos → plan con tareas/subtareas persistidas.
- Selecciona agente por responsabilidad y herramienta por **capacidades reales** del registro (nunca por nombre).
- Estados de tarea: `PENDING | RUNNING | WAITING_APPROVAL | COMPLETED | FAILED | CANCELLED | PAUSED`.
- Reintentos con backoff exponencial y **límite**; verificación de resultados; **bloqueo de duplicados** por clave de idempotencia.
- Reanudación: al arrancar, las tareas `RUNNING` huérfanas se marcan para revisión y se retoman según su naturaleza (idempotente → reintentar; no idempotente → WAITING_APPROVAL).
- Cada decisión queda en el **historial de ejecución** (quién, qué, cuándo, con qué herramienta, con qué resultado).

### B. Los 14 agentes especializados (`src/lib/agents/`)
Cada agente es una unidad con: responsabilidad, instrucciones (prompt de sistema), herramientas autorizadas (lista cerrada), límites, criterio de finalización y manejo de errores. Implementación real y diferenciada:

| Agente | Responsabilidad | Herramientas autorizadas | Límite clave |
|---|---|---|---|
| 1. Director de estrategia | Convierte objetivo de negocio en estrategia de contenido con KPIs | research_topic, generate_performance_report | No ejecuta acciones externas |
| 2. Investigador de mercado | Evidencias con fuente verificable | research_topic, analyze_competitor | Solo fuentes autorizadas; nunca inventa |
| 3. Analista de tendencias | Señales → tendencias aplicables a la marca | research_topic (+ mesh CHISMOSO si conectado) | Toda tendencia lleva evidencia o se marca estimada |
| 4. Planificador editorial | Calendario con dependencias y recurrentes | create_content_draft, request_approval | No programa fuera de horarios permitidos |
| 5. Redactor | Textos nativos por red con memoria de marca | create_content_draft, validate_content | Vocabulario prohibido bloqueado |
| 6. Director creativo | Briefs creativos y coherencia visual | generate_creative_brief | Delega assets a KREA (no genera imágenes) |
| 7. Adaptador multirred | Un contenido → N formatos nativos | create_content_draft, validate_content | Respeta specs por red |
| 8. Publicador | schedule_post / publish_post / verify_publication | Solo conector de publicación | Nunca publica sin aprobación según modo |
| 9. Community manager | Clasifica y responde interacciones | fetch_comments, reply_to_comment, reply_to_message | Solo respuestas autorizadas por política |
| 10. Moderador | Moderación y derivación humana | moderate_item, fetch_comments | Crisis → siempre derivación |
| 11. Agente de captación | Detecta leads en interacciones | create_lead | Sin mensajes masivos |
| 12. Analista de rendimiento | Métricas → informes | fetch_metrics, generate_performance_report | Distingue verificado vs estimado |
| 13. Optimizador | Experimentos y patrones → mejoras | record_experiment, generate_performance_report | Cambios solo en borradores/planes |
| 14. Supervisor de calidad y seguridad | Valida contenido y acciones contra políticas | validate_content, get_connection_status | Puede bloquear cualquier acción |

### C. Registro de herramientas (`src/lib/registry/`)
Cada herramienta registra: nombre, proveedor, descripción, esquema de entrada/salida (Zod), permisos necesarios, coste estimado, estado de conexión (`CONNECTED | AWAITING_CREDENTIALS | UNAVAILABLE | DISABLED`), capacidades disponibles, límites de uso y resultado de la última ejecución. El orquestador consulta el registro **antes** de cada selección. Si una capacidad falta → `CAPACITY_UNAVAILABLE` y la tarea falla con estado claro (nunca se simula éxito).

### D. Capa de ejecución (`src/lib/execution/`)
- Adaptadores REST (fetch con timeout y reintentos), MCP (JSON-RPC), webhooks entrantes firmados, tareas asíncronas y programadas (cron interno).
- Idempotencia: `x-request-id`/`Idempotency-Key` por operación externa; registro de llamadas con resultado y estado incierto → reconciliación, no reintento ciego.
- Verificación post-publicación: el contrato `verify_publication` consulta el proveedor y guarda la evidencia.

### E. Memoria persistente (Prisma/SQLite)
Modelos: Brand, SocialAccount, ContentDraft, PostVersion, Publication, Comment, Message, Approval, Task, TaskEvent, ToolRecord, ToolCall, Evidence, MetricSnapshot, Experiment, ErrorLog, AuditEntry, Setting. Todo sobrevive a reinicios; aislamiento por `brandId` en todas las consultas (memoria de una marca jamás accesible desde otra).

### F. Seguridad (espejo de los principios de la semilla)
- **Default deny**: toda acción externa necesita regla de firewall que la permita.
- **Autonomía ≠ permiso**: modo autónomo no salta el firewall ni las aprobaciones de riesgo alto.
- Auditoría inmutable (append-only) de acciones externas y aprobaciones.
- Secretos solo por variables de entorno; nunca en código, logs ni prompts.
- Pausa global con gestión segura de tareas pendientes; ningún agente puede auto-elevar sus permisos.

## 3. Ciclo autónomo (PRD §7)

```
INVESTIGAR → ANALIZAR → PLANIFICAR → CREAR → VALIDAR → APROBAR? →
PUBLICAR → VERIFICAR → INTERACTUAR → MEDIR → APRENDER → OPTIMIZAR ↺
```
Cada fase es una tarea del orquestador con salida estructurada en BD. Cada publicación registra: id único, marca, canal, texto, multimedia, estado, versión, fechas, aprobaciones, id externo (si existe), resultado y evidencia de verificación. Si falla → registro del error + decisión de reintento seguro (idempotencia primero). **Nunca** se repite una publicación sin comprobar si ya se ejecutó.

## 4. Niveles de autonomía (PRD §10)

| Modo | Qué puede hacer | Aprobaciones |
|---|---|---|
| L1 ASISTIDO | Investigar, recomendar, preparar borradores | Todo lo externo |
| L2 SUPERVISADO (defecto) | Ejecutar acciones expresamente autorizadas | Publicar/responder/moderar |
| L3 AUTÓNOMO CON LÍMITES | Acciones de bajo riesgo dentro de límites configurados (nº posts/día, horarios, presupuesto, riesgo) | Solo riesgo alto |

Límites configurables por: marca, cuenta, canal, tipo de acción, volumen, presupuesto, frecuencia, horarios y riesgo. Botón global de pausa. El supervisor (agente 14) no puede relajarse sus propias reglas.

## 5. Decisiones arquitectónicas (ADR resumidos)

| # | Decisión | Alternativas | Justificación |
|---|---|---|---|
| ADR-1 | Arnés en Next.js 16 + TS + Prisma/SQLite | Extender dashboard Python de la Seed; Flask | Patrón del ecosistema ALBRA (todos los paneles son Next.js); el usuario opera en web; despliegue simple. La Seed se consume por REST cuando esté desplegada. |
| ADR-2 | No copiar la semilla: hablar con ella | Fork del código Python | Contrato de especialización de la Seed lo prohíbe; sala limpia de ClonaKit; el arnés funciona degradado sin ella. |
| ADR-3 | Publicación vía Postgale (adaptador intercambiable) | Postiz, PostLake, construir desde cero | Cobertura multirred inmediata + idempotencia nativa; construir adaptadores de 8 redes duplicaría a los referentes. |
| ADR-4 | Contratos internos normalizados (21 contratos) | Usar APIs de proveedores directamente | Permite cambiar de proveedor sin reescribir el orquestador (PRD §5). |
| ADR-5 | Sin n8n/LangGraph en el núcleo | n8n como cerebro; LangGraph runtime | La Seed ya trae jobs/scheduler/workflows/resilience; duplicar runtime fragmenta el ecosistema. |
| ADR-6 | Skills formato SKILL.md propias | Instalar los 106 skills externos | MIT lo permite, pero el arnés necesita skills integradas con los contratos y la memoria de marca; el patrón sí se adopta. |
| ADR-7 | Honestidad de estado en UI | Simular integraciones | PRD §11 y §14: distinguir implementado/probado/pendiente de credenciales; nunca fingir. |

## 6. Esquema de datos (núcleo)

- `Brand(id, name, tone, vocabulary, forbiddenWords, policies, faqs, approvedExamples, budgetDaily…)`
- `SocialAccount(id, brandId, network, handle, status, providerAccountId…)`
- `ContentDraft(id, brandId, objective, briefId, status, version…)` → `PostVersion(draftId, network, text, mediaJson, specCheck)`
- `Publication(id, brandId, draftId, network, scheduledAt, publishedAt, externalId, verifyStatus, evidenceId, idempotencyKey UNIQUE)`
- `Comment(id, brandId, accountNetwork, externalId, classification, sentiment, risk, status, suggestedReply, humanTakeover)`
- `Approval(id, targetType, targetId, requestedBy, decidedBy, decision, reason, decidedAt)`
- `Task(id, type, brandId, agent, status, inputJson, outputJson, attempts, nextRetryAt, idempotencyKey)` + `TaskEvent(taskId, phase, message, dataJson)`
- `ToolRecord(key, provider, contracts[], status, lastResult)` + `ToolCall(id, toolKey, contract, reqJson, resJson, durationMs, outcome)`
- `Evidence(id, source, url, capturedAt, payloadJson, checksum)` · `MetricSnapshot(brandId, network, postId, date, metricsJson, verified)`
- `Experiment(brandId, hypothesis, variantA, variantB, result, conclusion)` · `AuditEntry(ts, actor, action, targetType, targetId, allowed, reason)` · `Setting(key, value)`

## 7. Fases de implementación mapeadas

| Fase PRD | Contenido | Estado en esta entrega |
|---|---|---|
| 1 Auditoría y diseño | Informe 20 referentes + arquitectura + integraciones | Completada (docs/) |
| 2 Núcleo funcional | Marcas, memoria, registro de herramientas, orquestador, tareas, permisos, auditoría | Implementada en app/ |
| 3 Primer ciclo de publicación | Borradores → aprobación → publicar → verificar (conector real configurable) | Implementada con estado honesto (sin credenciales: pendiente de conector) |
| 4 Comunidad | Clasificación, respuestas autorizadas, moderación, derivación | Implementada en módulo Comunidad |
| 5 Investigación y analítica | Evidencias, métricas, informes, recomendaciones | Implementada (ScrapeCreators/CHISMOSO requieren credenciales/estado) |
| 6 Producción creativa | Briefs + adaptación multirred + biblioteca | Implementada (assets vía KREA cuando esté conectado) |
| 7 Optimización | Experimentos, patrones, recomendaciones | Implementada |
| 8 Despliegue | Seguridad, e2e, docs de variables, reproducible | Guía incluida (app/README) |

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Dependencia de Postgale (SaaS tercero) | Adaptador intercambiable + alternativa Postiz/PostLake |
| AGPL de Postiz si se adopta | Solo instancia propia operada por API; revisión legal previa |
| Cuotas de APIs sociales | Límites en registro de herramientas + cola con backoff |
| Duplicación de publicaciones | Idempotency keys + verificación pre-reintento |
| Fugas de secretos | Solo env vars; auditoría; nunca en logs |
| Datos entre marcas mezclados | Filtro brandId obligatorio en consultas + tests de aislamiento |
| Expectativa de "todo conectado" | UI distingue verificado/estimado/pendiente; doctor por herramienta |
