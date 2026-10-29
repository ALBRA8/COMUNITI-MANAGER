# DESTRIPE CLONAKIT — METRICOOL

> Task 12 · 2026-10-30 · Solicitud del usuario: "vamos a utilizar clonakit para
> destripar Metricool y ver qué nos sirve para incluir en el proyecto".
> Método: solo lectura (web principal metricool.com/es, página de precios
> oficial metricool.com/pricing, help center help.metricool.com, reseña
> hands-on independiente webtribunal.net 10/2026, comparativa planable.io
> 10/2026). **Sala limpia: no se copia código, texto ni assets; se extraen
> patrones de producto.** Regla de la casa: no se declara capacidad sin
> fuente; lo no verificable queda marcado.

## 0. Hallazgos que definen la relación

**0.1 Metricool NO puede publicar en grupos de Facebook — y lo declara su
propio help center.** En "API Limitations per Social Network"
(help.metricool.com/api-limitations-per-social-network-n7zlr), sección
Facebook/Publishing: *"Publish posts directly into Facebook Groups (Meta
deprecated third-party publishing permissions for the Groups API on
April 22, 2024; only sharing a link to a group is supported)"*. Su lista
oficial de 11 redes incluye Facebook solo como **Página**. Coincide con
nuestro §0 de FB_GROUPS_REFERENTES.md (changelog v19.0 verificado en Meta).
Consecuencia estratégica: **no competimos con Metricool en el hueco que
cubrimos — lo complementamos.** El módulo FB-GROUPS hace hoy, con sesión
propia del usuario, exactamente lo que una herramienta con 2M+ usuarios y 10+
años no puede hacer por API.

**0.2 Metricool expone un MCP oficial (Model Context Protocol) en TODOS los
planes, incluido el free.** Un servidor puente entre la cuenta y asistentes
de IA (Claude Code/Desktop, Cursor, ChatGPT, n8n, Make, Gemini CLI): 20+
acciones en lenguaje natural — programar, leer analíticas, mejores momentos,
competidores, campañas de ads. Autenticación OAuth o user token.
Validación de dirección: el ecosistema ALBRA8 es agéntico por diseño
(AGENTE-GENERAL); el patrón "la herramienta se gobierna desde el agente" es
exactamente nuestra arquitectura de skills + HITL. Idea extraíble: **nuestro
panel/módulo podría exponerse como MCP para que AGENTE-GENERAL lo opere.**

**0.3 Metricool se vende como "marketing workspace", no como scheduler**
(reseña hands-on webtribunal.net, 05/10/2026): planner + analíticas + inbox +
informes + ads + links en una sola cuenta. La lección de producto: el valor
no está en publicar, está en **cerrar el ciclo publicar → medir → informar**.
Nuestro módulo hoy cubre publicar con honestidad de estados; no mide ni
informa. Ahí está el destripe aprovechable.

## 1. Ficha rápida del destripado

| Campo | Dato | Fuente |
|---|---|---|
| Qué es | Workspace de marketing: planificador, analíticas, inbox, informes, ads, links | metricool.com/es |
| Modelo comercial | Por **marca** (1 marca = 1 perfil por red), escalar en precio | pricing + socialbu.com/blog/metricool-pricing |
| Redes (11) | IG, TikTok, YouTube, Threads, X, Twitch, Google Business, Bluesky, Facebook (Páginas), Pinterest, LinkedIn | metricool.com/es |
| Grupos de FB | **No soportados** para publicar (API muerta 22/04/2024) | help center oficial |
| MCP | Sí, todos los planes, 20+ acciones | metricool.com/metricool-mcp/ |
| API clásica | Sí, plan Advanced+ (Zapier/Make/MCP) | pricing oficial |
| Approval system | Sí, plan Advanced (roles + aprobación de posts) | pricing oficial; ⚠️ planable.io lo lista "No" — miden aprobaciones multi-nivel con revisores externos, criterio distinto. Registramos ambas fuentes |

## 2. Precios verificados (metricool.com/pricing, consultado 30/10/2026)

| Plan | Precio | Límites clave | Funciones bloqueadas detrás |
|---|---|---|---|
| Free | $0 | 1 marca, 20 posts/mes, 30 días de historial, 5 competidores fijos, IA 5 créditos/marca/mes | Sin LinkedIn/X, sin PDF/PPT, sin Looker, sin equipos |
| Starter | desde €16-20/mes (5 marcas) → €29-37 (10) | Publicación ilimitada, 100 competidores, historial ilimitado, Flows, SmartLinks, PDF/PPT | Sin roles ni aprobaciones, sin plantillas de informe, sin API |
| Advanced | desde €43-54/mes (15 marcas) → €130-172 (50) | Equipos y clientes, roles, **aprobación de posts**, plantillas de informe, Looker Studio, API/Zapier/Make/MCP | White label solo en Custom |
| Custom | a consultar | White label, account manager dedicado, créditos IA a medida | — |

Add-ons de pago aparte: X/Twitter (~€10/conexión) y "Advanced Analytics".
⚠️ El modelo por marca encarece rápido con agencias multi-cliente: la queja
recurrente en reviews independientes (socialbu, turrboo, planable). **Takeaway
de pricing para nuestro proyecto:** nosotros ya usamos `Brand` como unidad de
aislamiento (igual que Metricool) pero sin límites artificiales por marca —
ventaja que hay que conservar y comunicar.

## 3. Destripe módulo por módulo → ¿aplica a COMUNITI-MANAGER?

| Módulo Metricool | Qué hace (fuente) | ¿Nos sirve? | Por qué / cómo |
|---|---|---|---|
| Planner + calendario drag&drop | Vista calendario por marca, previsualización por red, arrastrar para reprogramar | **SÍ (P8)** | Tenemos FbJob con fechas pero el panel es de listas. Un calendario semanal de jobs/campañas es la pieza UX más visible que nos falta |
| Recomendación "mejores horas" | Sugerencias en el calendario + consultables vía MCP (basadas en datos propios de la cuenta) | **SÍ (P10)** | Podemos calcular lo nuestro con datos honestos propios: heatmap hora×día de éxito/fallo desde FbJob+postedAt+failReason. Sin API externa, 100% local |
| Analíticas de rendimiento | Métricas por post/red con historial ilimitado (planes pagos) | Parcial (P3) | Sin API de grupos no hay métricas de engagement oficiales. Posible futura recogida vía worker (scrape de reacciones del propio post), pero es riesgo anti-ban — NO ahora |
| Análisis de competidores | Hasta 100 perfiles en Starter | NO | Requiere scraping agresivo de terceros; fuera de alcance y anti-ético según nuestras reglas |
| Informes PDF/PPT + Studio + plantillas | Informes automáticos de cliente, dashboards de campaña, conector Looker | **SÍ (P9)** | Ya estaba en roadmap como "reportes agencia". Metricool valida el patrón: el informe es el entregable que paga el agencia. Nuestra auditoría append-only es la fuente perfecta de verdad |
| Inbox unificado | Mensajes+comentarios de todas las redes en un lugar | NO (ahora) | Para grupos es scrape de comentarios (riesgo). El mensaje ya lo cubren CRM-ALBRA/WHATSPOWER en WhatsApp |
| Flows (auto-respuesta → venta) | Respuestas automáticas a seguidores, funnels | NO | Ídem inbox; y FB bloquea automatización de DM en grupos |
| Ads (Google/FB/TikTok) | Crear y analizar anuncios unificados | NO | Postgale cubre la parte oficial de Páginas; ads fuera del módulo grupos |
| SmartLinks (link-in-bio) | Link de bio con métricas | NO | Otro dominio; ALBRA8 podría hacerlo someday, no es FB-groups |
| Sistema de aprobación + roles | Roles de equipo, cliente aprueba antes de publicar (Advanced) | **SÍ (ya lo tenemos mejor)** | Nuestro HITL real (aprobación de variantes IA) es más fuerte; documentar la comparación en ventas. Mejora posible P2: estado "APPROVED" explícito previo a la ventana |
| Biblioteca multimedia | Guardar y reorganizar assets por marca | SÍ (P2, menor) | P1 adjuntos acepta URL/ruta local; una biblioteca por marca (tabla FbMedia) daría rotación más rica. Esfuerzo bajo, valor medio |
| Hashtag tracker | Seguimiento de hashtags (add-on pago) | NO | Métrica de alcance no disponible sin API |
| Asistente IA (capciones, ideas, hashtags) | 5 créditos/marca/mes en free; reescrituras rápidas (review: "fast, still needed editing") | SÍ (refinar L2) | Nuestro L2 con Brand (identity/tone/vocabulary/forbiddenWords) ya es más profundo que su asistente genérico. Idea a incorporar: sugerencia de hashtags desde vocabulary de la marca |
| MCP + API + Zapier/Make | Gobernar la herramienta desde agentes | **SÍ (P11)** | El patrón clave del destripe: exponer fb-groups al chaleco vía MCP/skill. Ya tenemos skill 'publicar-en-grupos-fb'; un MCP propio es la generalización |
| Importación Google Drive / editor de vídeo / Canva | Reducción de fricción de medios | NO (ahora) | Nice-to-have; P2 biblioteca ya cubre lo esencial |

## 4. Patrones extraíbles (extracto sala limpia, numerado)

1. **Cerrar el ciclo publicar→medir→informar**: el scheduler es el gancho,
   el informe es el producto que retiene al cliente de agencia.
2. **Calendario como vista primaria**: las campañas se piensan en tiempo, no
   en listas; el drag&drop es la UX esperada en 2026.
3. **"Mejores horas" con datos propios**: ninguna herramienta promete magia
   externa; recomiendan con el histórico de la propia cuenta. Nosotros tenemos
   FbJob/FbDailyUsage honestos para alimentar el nuestro.
4. **Precio por marca, límites por plan**: escalera simple de comunicar
   (aunque odiada al escalar — no copiar sus techos duros).
5. **Aprobación antes de publicar como feature de plan alto**: nuestro HITL
   incluido de serie es argumento de venta directo contra su Advanced.
6. **MCP-first**: la herramienta expone acciones al agente de IA del usuario;
   el dashboard queda para humanos, el protocolo para agentes.
7. **Preview por red antes de publicar**: cada red se compone distinto;
   la previsualización reduce errores y cancellations.
8. **Historial ilimitado como diferenciador de plan**: la data acumulada
   retiene (switching cost). Nuestra auditoría append-only ya es eso.
9. **Fricción de medios = abandono**: importar de Drive/Canva/editor de vídeo
   integrado. No prioritario para grupos (texto+imagen), pero la biblioteca
   por marca sí quita fricción real.
10. **Marca como unidad de todo** (conexiones, calendario, informes, equipo):
    coincide con nuestro Brand; validar que cada nueva feature cuelga de
    Brand, nunca global.

## 5. Overlap con el ecosistema ALBRA8 (re-auditado 30/10/2026)

Sin cambios desde FB_GROUPS_REFERENTES §4: ningún repo ALBRA8 hace
analytics/calendario/informes de redes. Lo más cercano: PANEL-DE-CONTROL
(panel general del chaleco, donde vive nuestra UI de fb-groups) y
AGENTE-CHISMOSO (triage de comentarios en WhatsApp — el "Lead Radar" por
mensajería ya tiene dueño). Conclusión: el backlog del §6 no duplica nada del
ecosistema. Patrones reutilizables como CONCEPTO: Brand del chaleco para
biblioteca/informes, skills del AGENTE-GENERAL para el futuro MCP.

## 6. Qué NO hacemos y por qué (decisión sala limpia)

1. **No integramos Metricool como dependencia** — SaaS cerrado, por-marca se
   dispara con clientes, y su fuerza (Páginas, Ads, Inbox) la cubre Postgale
   en el chaleco. Además: no puede entrar a grupos, que es nuestro hueco.
2. **No competimos contra Metricool en todo** — nuestro alcance sigue siendo
   el pantalón de grupos: publicar honesto, anti-ban, HITL. Las analíticas de
   terceros y ads quedan fuera deliberadamente.
3. **No scrapeamos competidores ni engagement de terceros** — riesgo de
   checkpoint para el worker y anti-ético según nuestras reglas. La única
   lectura de datos que haremos será de posts PROPIOS, con techo y juicio.
4. **No copiamos su modelo de techos duros** (20 posts/mes free, credits IA):
   nuestra escalera de límites ya existe y es anti-ban, no comercial.

## 7. Backlog propuesto a partir del destripe (qué incluir)

| # | Mejora | Valor | Esfuerzo | Dónde tocaría |
|---|---|---|---|---|
| P8 | **Calendario editorial** de jobs/campañas (semana/mes, chips por estado, click→detalle) | Alto | Medio | `fb-groups.tsx` + GET fb-jobs con rango de fechas (API ya expone jobs) |
| P9 | **Informe de campaña** (HTML imprimible→PDF): resumen honesto por grupo (POSTED/fallo/postUrl/variante/worker) + KPIs de la franja | Alto | Medio | Nuevo `app/src/app/reports/[campaignId]` leyendo auditoría + jobs; nada de worker |
| P10 | **"Mejores horas" propias**: heatmap hora×día con éxito/fallo desde FbJob.postedAt + warmup; sugerencia al elegir windowStart | Medio | Medio | `fb-groups.tsx` + lib nueva `fb-besttime.ts` (pura, testeable) |
| P11 | **MCP/skill de fb-groups para AGENTE-GENERAL**: consultar estado de workers/campañas y crear campañas en borrador desde el agente (siempre HITL al aprobar) | Alto (agéntico) | Medio-Alto | skills.ts + nueva ruta API segura + doc de skill |
| P12 | **Biblioteca media por marca** (tabla FbMedia + selector en CampaignForm; alimentaría mediaMode=rotate) | Medio | Bajo-Medio | schema + api + form |
| P2 | Estado explícito APPROVED pre-vuelo (aprobación formal de la variante antes de la ventana) | Medio | Bajo | FbJob.status + UI |
| — | Preview por red | Bajo (solo 1 red) | — | Descartado: solo grupos ⇒ preview simple ya cubierto |

Orden sugerido: **P9 → P8 → P10 → P12 → P11** (el informe es el que cierra
el ciclo de valor del destripe y ya era roadmap pendiente; el MCP P11 es el
más estratégico pero conviene asentarlo sobre P8-P10 para que el agente tenga
datos ricos que gobernar).

Fuentes: metricool.com/es · metricool.com/pricing (30/10/2026) ·
metricool.com/metricool-mcp/ · help.metricool.com
(api-limitations-per-social-network-n7zlr) · webtribunal.net review 05/10/2026 ·
planable.io/blog/schedule-social-media-posts 25/10/2026 ·
socialbu.com/blog/metricool-pricing · turrboo.com/blog/metricool-pricing.
