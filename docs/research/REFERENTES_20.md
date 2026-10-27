# INFORME COMPARATIVO — LOS 20 REFERENTES + ECOSISTEMA ALBRA8

> Fase 1 · Auditoría y diseño · Social Autopilot AI
> Fecha de consulta: 2026-10-27 · Método: solo lectura (web + repos clonados)
> Regla del informe: no se declara una API pública sin pruebas; no se declara
> open source sin verificar licencia; no se declara una integración que no se
> haya probado. Todo lo no verificable aparece marcado.

## 0. Resumen ejecutivo de decisiones

| # | Referente | Decisión | Motivo en una línea |
|---|---|---|---|
| 1 | Nimply | Estudiar como referencia | SaaS cerrado; patrón de bandeja unificada ya cubierto por CRM-ALBRA |
| 2 | SocialScheduler | Referencia | SaaS cerrado; calendario lo construye el arnés (hueco real) |
| 3 | Moose | Referencia | Patrón de niveles de autonomía; ya existe en la semilla ALBRA |
| 4 | HeyMark | Referencia | Patrón de voz de marca; memoria de marca es hueco real del arnés |
| 5 | Postiz | ADAPTAR (opción self-host) | AGPL-3.0, API+MCP; nunca copiar código, solo operar instancia propia |
| 6 | Postgale | **INTEGRAR (primario)** | REST + idempotencia + webhooks HMAC; cubre IG/FB/TikTok/Threads… |
| 7 | PostLake MCP | Alternativa de publicación | MCP normalizado, pago por post; segundo en la lista |
| 8 | n8n | Descartar del núcleo | La semilla ALBRA ya trae jobs/scheduler/workflows |
| 9 | ScrapeCreators | **INTEGRAR (investigación)** | API única TikTok/IG/YT/X con evidencia verificable |
| 10 | Metricool | Estudiar (API no verificada) | No se encontró API pública documentada accesible; analítica propia + Postgale/PostLake |
| 11 | Brandwatch | Descartar | Coste empresarial; AGENTE-CHISMOSO ya hace escucha social |
| 12 | Notion | Opcional externo | Memoria interna en BD propia (MemoryDV de la semilla); Notion solo como fuente |
| 13 | Canva | Estudiar | Connect API existe pero requiere app aprobada; AGENTE-KREA cubre generación |
| 14 | CapCut | Descartar | Sin API pública para edición automatizada; YOUTUBE-AUTOMATION cubre vídeo |
| 15 | OpusClip | Descartar | SaaS de clips; YOUTUBE-AUTOMATION ya produce clips verticales |
| 16 | Predis.ai | Referencia | Patrón carruseles multiformato; hueco cubierto con creación propia + Krea |
| 17 | RYPL | Referencia | Gestión de comentarios es hueco real; se construye módulo propio |
| 18 | Manychat | Descartar | Conversión ya cubierta por AGENTE-LEADS + CRM-ALBRA + WHATSPOWER |
| 19 | LangGraph | Descartar como runtime | La semilla ALBRA ya es runtime con firewall/policy/memoria/audit |
| 20 | Social Media Skills | **ADAPTAR patrón (MIT)** | Licencia MIT; adoptamos formato SKILL.md y principios, sin copiar textos |

---

## 1. NIMPLY — https://nimply.io/

- **URL consultada**: https://nimply.io/ (web comercial; sin docs técnicas públicas)
- **Capacidades verificadas** (según su web): equipos de agentes especializados, generación de publicaciones, asistencia en comentarios y mensajes, diseño de contenido, automatización social, bandeja unificada, historial de ejecución.
- **Documentación técnica**: no pública. **Integración**: no hay API documentada abierta.
- **Costes**: planes SaaS (no auditables sin registro). **Licencia**: propietario.
- **Ventajas**: el concepto de "equipo de agentes bajo un orquestador" valida nuestra arquitectura.
- **Limitaciones**: cerrado; no auditable; no integrable sin contrato.
- **Función a reproducir con implementación original**: orquestación de agentes especializados con historial de ejecución visible.
- **Decisión: ESTUDIAR COMO REFERENCIA.** La bandeja unificada ya la aporta CRM-ALBRA; no duplicamos.

## 2. SOCIALSCHEDULER — https://socialscheduler.ai/about

- **Capacidades verificadas** (web): planificación editorial, calendarios, automatización de publicación, contenido recurrente, flujos de revisión.
- **Docs técnicas**: no públicas. **Licencia**: propietario. **Costes**: SaaS.
- **Función a reproducir**: calendario editorial con dependencias y aprobaciones — hueco real del ecosistema.
- **Decisión: ESTUDIAR COMO REFERENCIA.** El calendario lo construye el arnés.

## 3. MOOSE — https://trymoose.ai/

- **Capacidades verificadas** (web): automatización social asistida por IA, respuestas/publicaciones, analítica, controles de autonomía.
- **Docs**: no públicas. **Licencia**: propietario.
- **Función a reproducir**: niveles de autonomía explícitos con límites por acción. La semilla ALBRA ya implementa autonomy levels + firewall + HITL; adoptamos el patrón de UX (mostrar límites al operador).
- **Decisión: ESTUDIAR COMO REFERENCIA.**

## 4. HEYMARK — https://heymark.ai/es/

- **Capacidades verificadas** (web): consistencia de voz de marca, generación de contenido, aprobaciones, automatización editorial.
- **Docs**: no públicas. **Licencia**: propietario.
- **Función a reproducir**: memoria de marca persistente (identidad, tono, vocabulario, prohibidos, FAQs) aplicada a toda generación. Hueco real → lo construye el arnés.
- **Decisión: ESTUDIAR COMO REFERENCIA.**

## 5. POSTIZ — https://github.com/gitroomhq/postiz-app · https://postiz.com/

- **URL consultadas**: repositorio GitHub + web. **Licencia verificada: AGPL-3.0** (archivo LICENSE del repo).
- **Capacidades verificadas**: publicación multirred (X, Discord, Meta/FB/IG, YouTube, TikTok), programación, analítica, colaboración en equipo, **API pública y webhooks, MCP/CLI/conectores agentic**.
- **Integración**: REST API con API key; webhooks; MCP. Requiere instancia propia (self-host) o su nube.
- **Costes**: open source self-host (coste infraestructura) / nube por suscripción.
- **Ventajas**: cobertura amplia y superficie agentic; comunidad grande.
- **Limitaciones**: **AGPL-3.0** — usarlo como servicio integrado obliga a cumplir la licencia (publicar modificaciones si se ofrece como servicio de red). **No copiamos su código**; solo se contempla operar una instancia externa propia vía API.
- **Decisión: ADAPTAR (ALTERNATIVA SELF-HOST de publicación).** Segundo en prioridad tras Postgale.

## 6. POSTGALE — https://postgale.com/ · /docs · /docs/api · /docs/mcp

- **URL consultadas**: https://postgale.com/docs (REST API + MCP).
- **Capacidades verificadas**: REST API `/api/v1` + **servidor MCP con 132 herramientas anotadas**; publicación, programación, moderación, respuesta a DMs, gestión de cuentas, Meta Ads.
- **Redes soportadas (documentadas)**: Instagram, Facebook Pages, Threads, TikTok, WhatsApp, Telegram, Discord, Bluesky, Mastodon (X y LinkedIn "próximamente").
- **Integración**: Bearer token; **límite 60 req/min por clave**; **idempotencia con `x-request-id` en POST /posts**; webhooks firmados **HMAC-SHA256 sobre `${timestamp}.${body}`**.
- **Costes**: SaaS por planes (verificar en registro). **Licencia**: propietario (servicio).
- **Ventajas**: cobertura multirred inmediata sin infraestructura propia; idempotencia nativa encaja con nuestra regla anti-duplicado; MCP-first encaja con el patrón del ecosistema ALBRA.
- **Limitaciones**: SaaS de terceros (dependencia externa); sin aprobaciones HITL documentadas → las aprobaciones las aporta el arnés.
- **Función a reproducir**: nada — se consume; el contrato interno `publish_post` traduce a su API.
- **Decisión: INTEGRAR como proveedor de publicación PRIMARIO.**

## 7. POSTLAKE MCP — https://github.com/PostLake/postlake-mcp · https://docs.postlake.dev/ · endpoint https://api.postlake.dev/mcp

- **URL consultadas**: https://docs.postlake.dev/
- **Capacidades verificadas**: API social para agentes vía REST o **MCP alojado** (`https://api.postlake.dev/mcp`); publicación, programación, analítica/benchmarking, DMs, lectura de contenido; respuesta normalizada con `post id` y array de objetivos por cada POST `/v1/posts`.
- **Costes**: free tier + pago por publicación publicada.
- **Ventajas**: una sola integración normalizada para todas las redes; MCP nativo.
- **Limitaciones**: detalle de redes y aprobaciones no documentado en la página pública consultada; no se declaran capacidades no verificadas.
- **Decisión: ALTERNATIVA DE PUBLICACIÓN (tercera opción) y candidata para analítica agentic.**

## 8. N8N — https://n8n.io/ · https://docs.n8n.io/ · https://github.com/n8n-io/n8n

- **Licencia verificada**: fair-code (Sustainable Use License) — **no es open source clásico**.
- **Capacidades verificadas**: automatización visual, triggers, schedules, integraciones, reintentos, flujos entre servicios.
- **Decisión: DESCARTAR DEL NÚCLEO.** La semilla ALBRA ya trae `jobs`, `scheduler`, `workflows` y `resilience` (reintentos/backoff). n8n queda como herramienta externa opcional para automatizaciones del cliente, nunca como cerebro. Mantener separada planificación inteligente (arnés) de automatización determinista (semilla).

## 9. SCRAPECREATORS — https://scrapecreators.com/ · skills repo

- **Capacidades verificadas**: API única de datos públicos de TikTok (22 endpoints), Instagram (20), YouTube (18), X (7), Facebook, LinkedIn, Reddit, Pinterest, Threads; perfiles, publicaciones, comentarios, transcripciones, ad libraries.
- **Precios verificados**: Free 100 créditos (+bonus hasta 7.000); Freelance $47/25.000 créditos; Business $497/500.000; créditos sin caducidad; caché gratuito; sin rate limits duros (recomendado <500 concurrentes).
- **Integración**: REST con API key; **skill oficial para Claude Code y MCP**; el repo `social-media-research-skills` fue anunciado por el PRD — la web actual documenta skills/MCP pero no ese repo concreto (marcado: **pendiente de verificación directa del repo**).
- **Ventajas**: evidencia social verificable (URL + payload) para investigación y competidores; encaja con el agente investigador del arnés.
- **Decisión: INTEGRAR como fuente de investigación social.** Sin API key → estado "pendiente de credenciales", nunca datos inventados.

## 10. METRICOOL — https://metricool.com/

- **Verificación**: la URL `/api-developers/` consultada **no existe** (404). No se encontró documentación de API pública abierta accesible sin registro. Existen integraciones vía sus planes y su app, pero **no se declara API hasta verificación adicional**.
- **Función a reproducir**: analítica unificada cross-red → hueco real. Se construye con: métricas devueltas por el proveedor de publicación (Postgale/PostLake) + APIs oficiales de cada red cuando el usuario las conecte + datos capturados por el propio ciclo.
- **Decisión: ESTUDIAR. Conector propio de analítica; Metricool queda como candidato externo si aparece API verificable.**

## 11. BRANDWATCH — https://www.brandwatch.com/

- **Capacidades** (web): escucha social, menciones, investigación de conversaciones, percepción de marca, inteligencia de consumidor.
- **Costes**: enterprise (no accesible para este proyecto). **Licencia**: propietario.
- **Decisión: DESCARTAR.** AGENTE-CHISMOSO ya implementa escucha social (señales→tendencias→oportunidades con scoring auditable, webhooks de malla). Integrar Brandwatch sería duplicar.

## 12. NOTION — https://www.notion.so/ · https://developers.notion.com/

- **Capacidades verificadas**: API oficial estable (bases de datos, páginas, búsqueda) con OAuth e integraciones internas.
- **Función a reproducir**: nada crítico. La **memoria de marca vive en la BD interna del arnés** (aislada por marca, con procedencia y fecha). Notion queda como **fuente externa opcional** de documentación de marca (sincronización de lectura).
- **Decisión: OPCIONAL (fuente externa). No dependencia.**

## 13. CANVA — https://www.canva.com/ · https://www.canva.dev/

- **Capacidades verificadas** (portal dev): Connect API con autogestión de brand templates, autofill, exports — requiere app aprobada por Canva.
- **Limitación**: aprobación de app no garantizada; el ecosistema ya tiene AGENTE-KREA para generación de assets (imágenes/voz/ebooks) vía z-ai SDK.
- **Decisión: ESTUDIAR. Prioridad baja; el hueco creativo está cubierto por Krea + creación propia. Canva Connect se evaluará si el cliente necesita plantillas de marca estrictas.**

## 14. CAPCUT — https://www.capcut.com/

- **Verificación**: sin API pública de edición automatizada documentada.
- **Decisión: DESCARTAR.** YOUTUBE-AUTOMATION ya cubre edición de vídeo (guion→imágenes→TTS→render ffmpeg→subtítulos ASS/SRT). Los flujos CapCut quedan como proceso asistido manual.

## 15. OPUSCLIP — https://www.opus.pro/

- **Capacidades** (web): clips largos→cortos, verticales, subtítulos.
- **Decisión: DESCARTAR.** YOUTUBE-AUTOMATION produce ya clips verticales con subtítulos a coste cero local. Integrar OpusClip duplicaría esa capacidad.

## 16. PREDIS.AI — https://predis.ai/

- **Capacidades** (web): generación de posts sociales, carruseles, creativos, adaptación multiformato.
- **Función a reproducir**: adaptación multirred nativa (hueco real del arnés) y carruseles (composición propia con assets de Krea).
- **Decisión: ESTUDIAR COMO REFERENCIA. No integrar de momento (coste SaaS + capacidad cubrible).**

## 17. RYPL — https://www.rypl.is/

- **Capacidades** (web): gestión de comentarios, respuestas asistidas, moderación, organización de conversaciones.
- **Función a reproducir**: módulo de comunidad del arnés — clasificación de comentarios (11 categorías del PRD), respuesta autorizada, moderación y derivación humana. Es **hueco real**: CRM-ALBRA cubre mensajería conversacional (WhatsApp/IG/Telegram DM), pero la gestión de **comentarios públicos** con colas de moderación no está cubierta en el ecosistema.
- **Decisión: ESTUDIAR COMO REFERENCIA. Construcción propia (módulo Comunidad).**

## 18. MANYCHAT — https://manychat.com/

- **Capacidades** (web): automatización de mensajes, flujos conversacionales, captación de leads, respuestas por eventos.
- **Decisión: DESCARTAR.** La conversión ya está triple-cubierta: AGENTE-LEADS (outreach 1:1 con evidencia), CRM-ALBRA (inbox + auto-respuesta con handoff y kill-switch), WHATSPOWER-ULTRA (difusión masiva anti-ban). Añadir Manychat añadiría coste y conflicto de canal.

## 19. LANGGRAPH — https://github.com/langchain-ai/langgraph · docs

- **Licencia verificada**: MIT.
- **Capacidades verificadas**: orquestación con estado, persistencia, ejecución por etapas, interrupciones/HITL, recuperación.
- **Decisión: DESCARTAR COMO RUNTIME — con justificación**: la semilla AGENTE-GENERAL ya implementa exactamente ese conjunto (runtime con estado, ApprovalEngine HITL, workflows con WorkflowGraph, scheduler, resilience, auditoría a prueba de manipulación) y es la base declarada del ecosistema del usuario. Introducir LangGraph fragmentaría la arquitectura y duplicaría el runtime. Referencia técnica para patrones de checkpoint.

## 20. SOCIAL MEDIA SKILLS — https://github.com/social-media-skills/skills

- **Licencia verificada: MIT** (203 estrellas; 106 skills; mantenimiento activo 2026).
- **Capacidades verificadas**: 106 skills en Markdown (SKILL.md + references/ + evals/) con cadena foundation→plan→create→media→publish→grow→measure; principios declarados: (1) un skill = un trabajo, (2) brand-profile primero, (3) el agente redacta y el humano aprueba antes de publicar, (4) no fabricación de datos, (5) confirmación antes de efectos secundarios, (6) hechos volátiles marcados para revisión trimestral.
- **Decisión: ADAPTAR EL PATRÓN (MIT permite reutilización)** — la biblioteca de habilidades del arnés usará el formato SKILL.md con frontmatter, los principios 3/4/5 son ya nuestros requisitos del PRD, y los 14 agentes del arnés cargan skills como procedimientos versionados. **No copiamos sus textos**; se referencia el repo y se pueden instalar skills específicas si el usuario lo desea.

---

## 21. ECOSISTEMA ALBRA8 (auditoría en solo lectura, 2026-10-27)

Repos clonados y verificados en `investigacion/albra8/` (ninguno modificado):

| Repo | Licencia | Qué hace (verificado en código) | Funciones ya cubiertas (el arnés NO las repite) | Punto de integración |
|---|---|---|---|---|
| **AGENTE-GENERAL** (Seed) | MIT | Runtime universal: firewall (default-deny), policy engine, autonomy levels, ApprovalEngine HITL (SQLite durable opcional), MemoryDV con procedencia/evidencia, jobs/scheduler/workflows, auditoría tamper-evident, doctor con estados honestos IMPLEMENTED/MOCK/PLACEHOLDER, A2A, MCP, REST `/api/v1/*` | Runtime, seguridad, memoria, ejecución — el arnés NO reimplementa runtime | REST `/api/v1/health`, `/api/v1/readiness`, `/api/v1/execution`; especialización vía `src/albra_specialization/` |
| AGENTE-LEADS | (privado) | Prospección B2B (pipeline 10 etapas, scoring 0-100, dedup multi-señal, verificación email), outreach SendGrid/WhatsApp Cloud en DRY RUN por defecto, webhooks `crm_albra_hooks` | Prospección, verificación, outreach 1:1 | Webhooks `lead.*`; REST `/api/prospects` |
| AGENTE-CHISMOSO | (privado) | Escucha social: 12 tipos de señales, clustering, tendencias, oportunidades con scoreBreakdown auditable; **Google Trends registrado pero UNAVAILABLE (no simula)**; mesh con outbox a LEADS/YT/NEX-SCOPE; MCP | Escucha social, tendencias, alertas | Mesh `/api/mesh/events`; exportes MD/JSON |
| AGENTE-KREA | (privado) | Fábrica de productos digitales: generación texto/imagen/voz/subtítulos/ebooks-PDF, QA 6 capas, créditos, auth PBKDF2, protocolo ADN | Generación de assets creativos | REST `/api/generate/*` |
| WHATSPOWER-ULTRA | (privado) | Difusión masiva WhatsApp: spintax determinista, 5 capas anti-ban (throttle jitter 15-35s, cooldown, horario, fatiga, locks), supresión, link-tracking, ingesta webhooks FB/TikTok/Typeform | Campañas masivas, anti-ban | REST :3004 `/api/campaigns` |
| CRM-ALBRA | (privado) | CRM multi-tenant "CHALECO": inbox WhatsApp (Baileys :3002)/Instagram/Telegram, auto-respuesta IA con handoff y kill-switch, Kanban ventas, automations durables, MemoryDV + embeddings; **agente propietario eliminado a propósito: diseñado para host externo** con `/api/crm/actions` (zod+RBAC), MCP 16 tools, API keys `albra_` | Mensajería entrante, conversación, CRM, ciclo de vida | **El arnés es el host**: `/api/crm/actions`, `/api/mcp`, `/api/memory` |
| PANEL-DE-CONTROL | (privado) | Control plane HITL: EEC STATE, pipeline VALIDATION→AUTHORIZATION→POLICY→DISPATCH, bus de eventos con correlation_id, cola de aprobaciones; solo adapter local-sim (sin conectores reales) | Contratos de gobernanza (reutilizables como patrón) | Patrón de contratos y aprobaciones |
| YOUTUBE-AUTOMATION | (privado) | Fábrica de vídeo local: guion Gemini (4 modos incl. URL viral), imágenes, TTS dual, render ffmpeg, subtítulos ASS/SRT, avatares, modo fábrica cron, autopublish YouTube OAuth real idempotente, QA forense, **MCP 25 tools + A2A `/api/agent/execute`**; HANDS documentado NOT CONNECTED | Producción vídeo, publicación YouTube | MCP; A2A con `creative_spec` |
| NEX-SCOPE | (privado) | Niche finder YouTube: keywords, tendencias, brechas, plan 30 vídeos, monetización RPM/CPM, competidores, ad-spy, thumbnail analyzer, MCP 12 tools; scheduler lee de catálogo estático (debilidad documentada) | Investigación nichos YouTube | MCP; REST `/api/content-plan` |

**Huecos del ecosistema confirmados (los cubre este arnés):**
1. Publicación nativa en Instagram/Facebook/TikTok/LinkedIn/X (solo YT está automatizado).
2. Gestión de comentarios públicos con moderación y derivación.
3. Analítica unificada cross-red con recomendaciones.
4. Calendario editorial multi-marca y multi-red.
5. Memoria de marca por cliente con aislamiento.
6. Orquestador del ciclo completo + gobierno (autonomía, pausa, auditoría) orientado a community management.

---

## 22. Matriz final: función → proveedor elegido

| Función (contrato) | Proveedor elegido | Alternativa | Descartados |
|---|---|---|---|
| Runtime de agentes | AGENTE-GENERAL (Seed) | — | LangGraph, n8n |
| Escucha social | AGENTE-CHISMOSO | ScrapeCreators (evidencia puntual) | Brandwatch |
| Investigación social | ScrapeCreators | CHISMOSO | — |
| Investigación nichos YouTube | NEX-SCOPE | — | — |
| Generación creativa | AGENTE-KREA | creación propia del arnés | Predis.ai, Canva (baja prioridad) |
| Producción vídeo | YOUTUBE-AUTOMATION | — | CapCut, OpusClip |
| Publicación multirred | **Postgale** | Postiz (self-host AGPL), PostLake MCP | — |
| Comentarios públicos | Módulo propio del arnés | — | RYPL (referencia) |
| Mensajería/CRM | CRM-ALBRA | — | Manychat, Nimply |
| Difusión masiva | WHATSPOWER-ULTRA | — | — |
| Leads | AGENTE-LEADS | — | Manychat |
| Memoria de marca | BD interna del arnés | Notion (fuente externa) | — |
| Habilidades | Biblioteca propia formato SKILL.md | social-media-skills (MIT) | — |
| Analítica | Conector propio + Postgale/PostLake | Metricool (si API verificable) | — |

**Verificaciones pendientes antes de conectar en producción** (honestidad del informe):
- Credenciales y condiciones reales de Postgale/PostLake/ScrapeCreators (registro y precios vigentes).
- Licencia AGPL-3.0 de Postiz: si se usa, operar instancia propia y revisar obligaciones de red.
- Repo `ScrapeCreators/social-media-research-skills` (el PRD lo lista; la web oficial documenta skills/MCP — verificación directa del repo pendiente).
- Metricool API (no encontrada; reintentar con cuenta de registro si el usuario la posee).
- Ninguna integración se declara "funcionando" hasta ejecutarse con credenciales reales.
