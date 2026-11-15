# Worklog

## [2026-10-27] Task ID 2-b — Mapeo repos ALBRA8 secundarios (agente Explore, solo lectura)

**Objetivo:** Analizar en modo solo lectura 8 repos de ALBRA8 (en `/home/z/my-project/investigacion/albra8/`) para el arnés "Social Autopilot AI" (community management con IA, semilla = AGENTE-GENERAL), identificando funciones ya cubiertas que NO deben duplicarse y puntos de integración.

**Método:** Lectura de READMEs, `package.json`/`pyproject`, docs de arquitectura (ARCHITECTURE.md, HARNESS.md, ESTADO_REAL.md, VERIFICATION-REPORT.md), estructura de carpetas y código fuente clave (pipelines, providers, dispatchers, rutas API). Ningún archivo de los repos fue modificado.

**Repos analizados y hallazgo principal:**

1. **AGENTE-LEADS** — Bot Telegram de prospección B2B: pipeline determinístico 10 etapas (discovery→research→validación→evidencia→dedup→scoring→intelligence LLM→storage→report→hook CRM). Outreach SendGrid + WhatsApp Cloud API (DRY RUN default). Scraping Instagram vía Apify. Webhook saliente CRM-ALBRA. Dashboard Next.js. Stack: Node/TS, grammy, SQLite WAL, NVIDIA NIM (GLM/Kimi).
2. **AGENTE-CHISMOSO** — Agente de escucha social/inteligencia de mercado: señales (web_search, Reddit/Quora vía búsqueda, page_reader, Google Trends placeholder) → tendencias → problemas → oportunidades con scoring transparente. Agent mesh (publica a AGENTE-LEADS, YOUTUBE-AUTOMATION, NEX-SCOPE). Scheduler/cron, alertas, memoria con decaimiento, MCP server, dashboard Next.js.
3. **AGENTE-KREA** — Fábrica de productos digitales: oportunidad → fit/GO-NO-GO → blueprint → factory → QA 6 capas → readiness → launch package. Generación de texto, imágenes (ZAI), voz/TTS, subtítulos, ebooks con PDF real (pdf-lib). Créditos, auth PBKDF2, protocolo ADN (agent-comm/mcp/memory/skills). NO toca redes sociales.
4. **WHATSPOWER-ULTRA** — Suite de difusión masiva WhatsApp con escudo anti-ban de 5 capas (jitter, cooldown lotes, horario comercial, fatiga 7d, pre-dispatch JIT), motor spintax determinista, CSV + ingesta de leads por webhook (Facebook/TikTok Ads, Typeform), acortador con tracking de clics, crash recovery, dispatcher dual (daemon Baileys del CRM :3002 o Meta Cloud API), lock-checker de atención humana (:3003), motor neuromarketing heurístico. Node 22 puro (node:sqlite).
5. **CRM-ALBRA** — CRM SaaS multi-tenant "Chaleco": WhatsApp real (Baileys :3002) con auto-respuesta IA + handoff + kill-switch, Instagram/Telegram por webhook, email SMTP/Gmail, Google Calendar/Sheets, automations durables, cotizaciones, reportes, RBAC, memoria MemoryDV + embeddings. Contratos para hosts externos: `/api/crm/actions` (6 acciones), MCP 16 tools, API keys `albra_`. Diseñado para ser operado por un agente externo (el arnés puede ser ese host).
6. **PANEL-DE-CONTROL (EEC)** — Control plane de orquestación con human-in-the-loop: EEC STATE, pipeline de comandos (validación→autorización→policy→dispatch), bus de eventos con trazabilidad, cola de aprobaciones, contratos de providers (AGENT/ORCHESTRATION/RUNTIME/TOOL) con adapters solo local-sim (simulación honesta, sin conectores reales aún).
7. **YOUTUBE-AUTOMATION** — Fábrica local de videos IA (FastAPI/Python): guion Gemini 2.5 (4 modos), imágenes Gemini/Flow-ImageFX, TTS dual (Gemini+edge-tts), render ffmpeg Ken Burns, subtítulos Hormozi (faster-whisper), modo URL viral (yt-dlp), modo fábrica cron+cola, autopublish YouTube real (OAuth Data API v3, programación), QA de video, MCP 25 tools, A2A `/api/agent/execute`, MemoryDV, Doctor. TikTok/IG/FB solo kit de descarga manual.
8. **NEX-SCOPE** — SaaS de nichos de YouTube con IA (Z.ai): keywords, tendencias, brechas, planes de 30 videos, monetización, competidores, ad-spy, ofertas afiliadas, thumbnail analyzer, chat-agent con tools, MCP 12 tools, scheduler run-cycle (catálogo de ofertas semi-estático), proxy YouTube Data API v3. Sin publicación.

**Entregable:** Informe A-E por repo + tabla resumen (ver respuesta del agente). Conclusiones clave para el arnés:
- NO duplicar: prospección/outreach (AGENTE-LEADS), escucha social (CHISMOSO), difusión masiva WhatsApp + anti-ban (WHATSPOWER-ULTRA), mensajería conversacional + CRM + automations (CRM-ALBRA), generación de assets (KREA), producción/publishing de video YouTube (YOUTUBE-AUTOMATION), investigación de nichos YouTube (NEX-SCOPE), patrón de gobierno HITL (PANEL-DE-CONTROL).
- Mejores puntos de integración: MCP servers (CRM-ALBRA 16 tools, YOUTUBE-AUTOMATION 25, NEX-SCOPE 12, CHISMOSO), REST `/api/crm/actions` de CRM-ALBRA (el arnés como "host"), webhooks (AGENTE-LEADS→CRM, mesh de CHISMOSO, ingesta de leads de WHATSPOWER), A2A `/api/agent/execute` de YOUTUBE-AUTOMATION, API HTTP de WHATSPOWER-ULTRA, rutas `/api/generate/*` de KREA.
- Ruteo recomendado de WhatsApp: conversación entrante → CRM-ALBRA; outreach 1:1 → AGENTE-LEADS; campañas masivas → WHATSPOWER-ULTRA.

---

## [2026-10-27] Task ID principal — Construcción del arnés Social Autopilot AI (agente principal)

**Objetivo:** Usar ClonaKit como entorno de construcción (método sala limpia) para crear el arnés/chaleco de community management sobre AGENTE-GENERAL (semilla ALBRA), sin duplicar funciones de los agentes del ecosistema.

**Work Log:**
- Extracción y estudio de ClonaKit.zip (README, CLAUDE.md, recetas, herramientas .mjs, método sala limpia).
- Clonado solo lectura de 9 repos ALBRA8 en /home/z/my-project/investigacion/albra8 (AGENTE-GENERAL + 8 agentes). Ninguno modificado.
- Investigación web de referentes: Postiz (AGPL-3.0 verificado), Postgale (REST+MCP 132 tools, x-request-id, HMAC-SHA256), PostLake MCP, ScrapeCreators (créditos/precios), Social Media Skills (MIT, 106 skills), Metricool (API 404 = no verificada).
- Fase 1 ClonaKit: FICHA.md (especificación sala limpia) + docs/research/REFERENTES_20.md + docs/architecture/ARCHITECTURE.md + docs/architecture/INTEGRATIONS.md.
- Fase 2-7 en app/ (Next.js 16 + TS + Prisma/SQLite): esquema de 18 modelos, motor del arnés (contracts/registry/agents/executor/brand-memory/orchestrator/cycle), 13 rutas API, panel UI en español con las 18 secciones del PRD.
- especializacion-albra/: capa Python para la semilla (identity, 4 tools con ToolContract, 4 skills, WorkflowGraph del ciclo, políticas HITL, memoria aislada por marca, prompts) — cumple el contrato de especialización, no toca albra_seed.
- Correcciones durante build: ignores de ESLint/tsconfig para repos de investigación; externalId único en comentarios manuales; resume del ciclo arranca en APPROVE; patrón set-state-in-effect corregido en 4 componentes.
- Verificación E2E: lint 0 errores en src/; ciclo completo por API (parada honesta en APPROVE en modo L2); aprobación + resume hasta PUBLISH con estado AWAITING_CONNECTOR honesto; idempotencia anti-duplicado (reintento no duplica); pausa global (UI+API: ciclo detiene 0 fases); clasificación SALES_REQUEST/FRAUD visible en bandeja; Agent Browser: panel renderizado, sin errores de consola; screenshots guardados.

**Stage Summary:**
- Clon entregado en /home/z/my-project/clones/social-autopilot/ (FICHA.md, docs/, especializacion-albra/, app/, README, CONSTRUCCION.md, investigacion/ con capturas).
- Arnés operativo con honestidad de estados (verificado / estimado / pendiente de credenciales) y todos los controles del PRD (autonomía L1-L3, pausa, auditoría, idempotencia, aislamiento por marca).
- Proveedor de publicación primario: Postgale (adaptador listo, requiere credenciales); alternativas Postiz/PostLake documentadas.
- Servidor Next.js corriendo en puerto 3000, lint limpio, DB inicializada con marca de prueba "Café Aurora".

---
Task ID: 3
Agent: agente principal (Z.ai)
Task: Exportar y subir el arnés COMUNITI-MANAGER a https://github.com/ALBRA8/COMUNITI-MANAGER.git

Work Log:
- Detectado que app/ del clon social-autopilot estaba vacío; la app real (Next.js) vivía en el workspace principal.
- Ensamblado repo limpio en /home/z/my-project/clones/COMUNITI-MANAGER/: FICHA.md, docs/ (research+architecture+capturas), especializacion-albra/ (Python), app/ (src completo + prisma/schema.prisma + public + configs).
- Generado app/package.json programáticamente desde el workspace (66 deps exactas, scripts limpios con postinstall prisma generate).
- Configs limpiados: tsconfig sin excludes locales, eslint sin ignores de investigación, .gitignore (root+app), .env.example con 20 variables de integración documentadas.
- README.md raíz reescrito: título COMUNITI-MANAGER, tabla no-duplicación, capturas embebidas, estructura, arranque, arquitectura, seguridad, legal.
- Añadido LICENSE MIT (2026 ALBRA). Excluidos del repo: CONSTRUCCION.md (notas internas con rutas locales), investigacion/ sin procesar (capturas reubicadas a docs/capturas/), clonakit-kit/ (tooling MIT, no es parte del arnés).
- Escaneo de seguridad previo al push: 0 tokens, 0 rutas absolutas /home/z, 0 .env/.db/node_modules.
- Commit 86f92b2 (114 archivos, 11.626 líneas) como ALBRA8 noreply; push one-shot con token (NO persistido en .git/config ni en archivos).
- Metadatos del repo configurados vía API: descripción + 8 topics (community-manager, ai-agent, harness, nextjs, prisma, typescript, social-media, spanish).
- Push verificado por API: 7 entradas raíz en main, MIT detectado por GitHub.

Stage Summary:
- Repo público https://github.com/ALBRA8/COMUNITI-MANAGER publicado y verificado (rama main, commit 86f92b2).
- Estructura profesional: README+LICENSE+FICHA, docs con capturas, especializacion-albra (9 py), app completa (95 archivos).
- Token de usuario usado solo en memoria de comandos; recomendado rotarlo al estar expuesto en el chat.

---
Task ID: 8-recuperacion
Agent: agente principal (Z.ai)
Task: Recuperar el entorno local tras reinicio del contenedor (pregunta del usuario sobre paridad con referentes)

Work Log:
- Detectado que el entorno local se había reiniciado: clon en 86f92b2 (commit inicial) sin modulo-fb-groups/ ni FB_GROUPS_REFERENTES.md; workspace /home/z/my-project sin sección fb-groups.tsx, rutas fb-*, modelos Fb* en schema.
- Verificado remoto via git ls-remote: origin/main = 0077708 (Módulo FB-GROUPS) — todo el trabajo empujado está intacto en GitHub.
- Restaurado clon: git stash (snapshot local) → git fetch origin → git reset --hard origin/main (0077708). modulo-fb-groups/ (FICHA.md + worker completo) y docs/research/FB_GROUPS_REFERENTES.md de vuelta.
- Restaurado workspace: rsync clones/COMUNITI-MANAGER/app/src/ → /home/z/my-project/src/, schema.prisma y public/ incluidos. Verificado: fb_groups_post en contracts.ts, FbWorker en schema, fb-groups.tsx, 4 rutas API fb-*.
- npx prisma db push (tablas Fb* añadidas, aditivo) + npx prisma generate OK.
- Verificado en código remoto: FbCampaign/FbJob solo texto (sin campo media/imagen); worker sin soporte de adjuntos/proxy/unicode/auto-join → confirmados como huecos v1 para la respuesta de paridad.

Stage Summary:
- Entorno 100% recuperado desde GitHub (única fuente de verdad: main=0077708). Ningún trabajo perdido.
- Huecos confirmados para respuesta de paridad: rodaje real, adjuntos de imagen/vídeo, auto-join, unicode/proxies, credenciales Postgale.

---
Task ID: 9-p1-adjuntos
Agent: agente principal (Z.ai)
Task: Cerrar hueco #2 de paridad — adjuntos de imagen (P1) en el módulo FB-GROUPS + checklist de primera campaña real

Work Log:
- Schema: mediaUrls (JSON, máx 4) añadido a FbCampaign y FbJob; db push aditivo + prisma generate en workspace.
- API fb-campaigns: POST acepta mediaUrls con validación (≤4; solo http(s) o ruta local; 400 honesto), copia a cada job, auditoría menciona adjuntos; GET expone mediaCount.
- Lib fb-groups.ts: ClaimableJob.mediaUrls; claim parsea job.mediaUrls y lo entrega al worker; reescritura IA con Promise.race de 25s (el claim no puede bloquearse si la IA se cuelga).
- Worker engine-dom.mjs: resolveMediaFiles (descarga URLs a temp con validación de tamaño/extensión, valida rutas locales), attachMedia (botón Foto/vídeo multi-idioma ES/EN + input[type=file] + espera de miniaturas), cleanupMedia; en postJob: si hay adjuntos y fallan → FAILED ADJUNTO_FALLIDO, nunca publica un post distinto al aprobado; server.mjs loguea adjuntos por job.
- Panel fb-groups.tsx: textarea de adjuntos (una imagen por línea, máx 4), contador en botón crear, mediaCount en fila de campaña.
- FICHA.md §12: P1-P4 marcados hechos + nueva fase P5 (adjuntos) hecha. Worker README: sección Adjuntos + Checklist de 9 pasos para la primera campaña real + honestidad ADJUNTO_FALLIDO.
- Verificación: node --check 4/4 .mjs OK; build producción Compiled successfully; test API dirigido scripts/test-media-fb.cjs 11/11 ✓ (registro HMAC, importación, campañas válidas/inválidas/exceso, mediaCount, claim con mediaUrls intactas, reporte honesto, limpieza).
- Incidentes resueltos: pkill -f auto-matches mató shells propias (usar kill por PID exacto); lint de scripts locales excluido vía ignores de eslint.config.mjs del workspace.
- Commit 182f02a (8 archivos, +165/-20) empujado a main y verificado por ls-remote.

Stage Summary:
- Hueco #2 de paridad (adjuntos de imagen) CERRADO en código y verificado. Quedan: rodaje real (hueco #1), auto-join, unicode/proxies, credenciales Postgale.
- Token ghp_wnxR...QZHP SIGUE activo (el push funcionó) — el usuario NO lo ha revocado pese a 3 avisos; riesgo vigente.

---
Task ID: 10-b-research
Agent: general-purpose (research)
Task: Búsqueda intensiva repos GitHub + JVZoo/WarriorPlus para mejoras FB-GROUPS

Work Log:
- Sin tool WebSearch/WebFetch en el entorno: se investigó vía curl (GitHub API, sitios SaaS directos, HN Algolia, Meta changelog); motores de búsqueda (DDG html/lite, Bing html+RSS, Yahoo, Mojeek, Ecosia, SearX ×4, Jina Reader) todos bloqueados o con muro anti-bot desde esta IP.
- GitHub API: 4 búsquedas (facebook group poster / auto join / puppeteer automation / groups playwright) + lectura de READMEs de 5 repos clave (joiner extension, FBScrapeIdeas, forage, phantakanxm autopost, AutoPoster Pro EXE).
- SaaS directos: descarga y extracción de texto de pilotposter.com, maherpost.com (+5 artículos de blog), safeposter.com (+pricing), groupposting.com (+features/lead-radar y features/account-safety).
- JVZoo/WarriorPlus: intentos en jvzoo.com/products?search, jvzoo sitemap, jvzoo.com/products/search, warriorplus.com (home 403; 3 rutas de marketplace 404), Wayback CDX vacío — marketplaces solo-JS/403: NO verificable desde este sandbox (se reporta honesto).
- Anti-ban/números: extraídos de 3 blogs de MaherPost (warmup, facebook jail, bulk posting) + página completa de Account Safety de GroupPosting + homepage PilotPoster (Safety Autopilot).
- Riesgos/noticias: HN Algolia (deprecación Groups API v19, hilo id 39269642 del 2024-02-06), changelog Graph API de Meta (ancla v19.0 presente), ArsTechnica 2019 (flaw Groups API), advertencia ToS sobre cuentas "aged" (MaherPost).
- Ningún archivo bajo clones/ ni src/ fue modificado; solo este append al worklog.

Stage Summary:
- 12 repos GitHub relevantes catalogados (mejores: MasuRii/FBScrapeIdeas ★73 para scraping+IA de grupos; jwmoss/forage activo 2026-10 con "capability contract"; phantakanxm/facebook-group-autopost = mismo stack Electron+Playwright+SQLite con auto-update; joiner de auto-join con delays human-like).
- JVZoo/WarriorPlus NO verificable (JS-only/403/motores bloqueados); como proxy de precios del nicho: MaherPost $29/mo, SafePoster $47/mo, GroupPosting Pro €24/mo (Lite gratis 5 posts/día, Plus €69/año), PilotPoster trial $0/1 día.
- Features que nos faltan detectadas: score de riesgo pre-vuelo 0-100, Lead Radar (triage con keywords BROAD/STRICT + negativos + relevancia IA), log por grupo (pending admin/rejected), bump-comment con delay, rotación de fotos, RSS→posts, Auto AI diario desde web de marca, reportes agencia, doble motor (Direct API + DOM).
- Números anti-ban concretos: warmup 5→10→20 posts/día (días 1-6); 3-5 posts/día y ≥5 min de gap en warmup; escala 10-15 grupos/día (semana 1) → 20-25 (semana 2); gap mínimo 15→30→45→60 s al pasar 30/60/100 posts en 24 h; pausa nocturna 22:00-07:00; auto-stop 12 h tras bloqueo; añadir grupos en tandas de 10/semana; tras jail: volumen -50% y gaps +.
- Doble vía de des-riesgo confirmada en 2 SaaS: score visible + pre-flight que "advierte antes del límite, no después"; postura honesta "ninguna tool promete riesgo cero".
- Riesgo legal vigente: Groups API retirada 2024-04-22 (v19.0) — no habrá vuelta atrás vía API oficial; cuentas "aged" compradas violan ToS; bans por admins de grupo son la mitad del problema (no solo algoritmo).
- Cautela supply-chain: repo de extensión auto-joiner (TheBrianWilson) con badges que apuntan a un ZIP externo (atomity 2.9) — packaging sospechoso, no ingerir sin revisión.

---
Task ID: 10-c-autojoin + 10-a-checklist + 10-d-roadmap
Agent: agente principal (Z.ai)
Task: Cerrar hueco #3 de paridad (auto-join P2/P6) + checklist de despliegue + integración de la investigación

Work Log:
- Schema: FbJoinTask nuevo (workerId?, keyword, fbId, url, status PENDING|LEASED|JOINED|REQUESTED|SKIPPED|FAILED|CANCELLED, attempts, leaseUntil, @@index([status,leaseUntil])) + joins/joinCap en FbDailyUsage; db push aditivo + generate; contratos +fb_groups_join.
- lib/fb-groups.ts: normalizeGroupUrl (valida facebook.com|fb.com/groups/..., rechaza feed/discover/joins), computeJoinCap (<7d→2, <14d→4, resto→6), claimJoinTaskForWorker (lease 15 min, reencola leases vencidos, FAILED a los 3 intentos, respeta pausa defensiva), applyJoinReport (JOINED crea grupo en colección auto-join[:keyword] y lo pone en rotación; REQUESTED lo crea excluido; SKIPPED no consume techo), helper applyAlerts extraído y compartido con jobs.
- API: /api/fb-joins (GET cola+counts, POST crea con normalización/dedup honesta — duplicados contados como omitted tras fallo del test, PATCH cancel|delete con 404/400 honestos), /api/fb-joins/claim (HMAC, no pisa RUNNING de jobs), /api/fb-joins/report (HMAC + sessionStatus).
- Worker: anti-ban.mjs añade FB_JOIN_GAP_MIN/MAX (20-45), nextJoinGapMs, joinGateAllows (pausa+sesión+noche+hueco propio), lastJoinAt en gate, 3 marcadores de unión; engine-dom.mjs añade joinGroupByUrl (detecta ya-miembro/solicitud-pendiente, clic en botón Unirse multi-idioma, confirmación honesta, cuestionarios de admisión NUNCA automatizados); server.mjs añade joinTick con bucle propio + endpoint local /api/join-tick + lastJoinAt en /health.
- Panel: tarjeta Auto-join (textarea URLs + keyword, tabla con badges de estado, cancelar/quitar según estado, resumen de cola); escudo anti-ban actualizado con los números de uniones.
- Docs: FICHA §11 (auto-join sale de fuera-de-alcance; admin-approval y cuestionarios siguen fuera) + §12 P6 (hecho); worker README sección Auto-join + .env.example con FB_JOIN_GAP_*; captura docs/capturas/fb-groups-autojoin-p6.png.
- Verificación: node --check 3/3 OK; lint 0; test E2E scripts/test-joins-fb.cjs 24/24 (creación honesta, dedup, claim/lease, JOINED→grupo en rotación, REQUESTED→excluido, SKIPPED sin techo, PATCH 400/404, limpieza); regresión P1 test-media-fb.cjs 11/11; UI verificada con Agent Browser (encolado real desde formulario, aviso honesto de rechazo, sin errores de consola).
- Incidentes: dev server quedó con cliente Prisma viejo en memoria tras db push → reinicio (kill + arranque con nohup, HTTP 200); limpieza de residuos de la 1ª corrida.
- Investigación 10-b integrada en docs/research/MEJORAS_REPOS_JVZOO.md (12 repos, proxy de precios JVZoo 403-honesto, 12 features faltantes rankeadas, números anti-ban, top-10 mejoras post-P6, decisiones de no-duplicación).
- Commit 7397f31 (14 archivos) empujado a main y verificado por ls-remote.

Stage Summary:
- Hueco #3 de paridad (auto-join) CERRADO en código, test y navegador. Quedan: rodaje real (hueco #1, depende del usuario), unicode bold/proxies (menores), credenciales Postgale (Frente 3).
- Warmup de uniones más conservador que cualquier referente publicado; techo 2/4/6 + huecos 20-45 min.
- Roadmap de mejoras priorizado para siguientes sesiones: score de riesgo 0-100, log de entrega por grupo, rotación de adjuntos, bump-comment.
- Token ghp_wnxR...QZHP sigue activo (4º aviso): el push funcionó, revocar tras confirmar.

---
Task ID: 11-p7-mejoras-visual
Agent: agente principal (Z.ai)
Task: Cerrar todas las mejoras del roadmap (P7) + rediseño visual del panel FB-GROUPS

Work Log:
- Schema: FbCampaign += mediaMode (all|rotate), commentDelaySec, boldStyle (none|unicode), riskScore, riskLevel; FbWorker += proxyUrl. db push aditivo + generate; reinicio del dev server (cliente Prisma viejo en memoria, incidente ya conocido del P6).
- src/lib/fb-risk.ts nuevo (puro, compartido cliente/servidor): computeRiskScore 0-100 con 7 factores deterministas + mitigaciones (cuenta joven 25/15/8, techo consumido, lote grande, texto sin spintax, texto corto, ventana estrecha, enlace en comentario; adjuntos -5), riskInputFromCampaign, applyUnicodeBold (offsets corregidos: versal U+1D5A0, minúscula U+1D5BA, dígito U+1D7EC), pickRotatedMedia (FNV-1a determinista por jobId), maskProxy/isValidProxyUrl.
- lib/fb-groups.ts: generateVariant aplica boldStyle post-spintax/IA; claimJobsForWorker aplica rotación de adjuntos (mediaMode=rotate → 1 imagen por job vía pickRotatedMedia) y entrega commentDelaySec en ClaimableJob.
- APIs: fb-campaigns POST calcula riesgo autoritativo (peor caso = worker más joven) y lo persiste+devuelve; GET expone jobs completos con workerName (log de entrega); fb-workers GET enmascara proxy (credenciales jamás salen) y expone usage del día (postsToday/cap/joinsToday/joinCap), register valida proxyUrl.
- Worker: engine-dom lanza Chrome con proxy FB_PROXY(+username/password, log enmascarado); server.mjs espera commentDelaySec ±15% jitter antes del primer comentario; .env.example + README con 4 secciones nuevas (P7).
- UI fb-groups.tsx rediseñada (814 líneas): franja de 4 KPIs (workers, grupos en rotación, posts hoy vs techo agregado con barra, alertas), banner de avisos con tono ok/error, workers con punto de estado + MiniMeter de consumo + proxy enmascarado, grupos con filtro de texto, auto-join con chips de conteo, formulario de campañas con rotación/énfasis unicode/espera de comentario + RiskGauge en vivo (barra de color por nivel, factores con puntos, mitigaciones, aviso honesto de peor caso), CampaignRow con barra de progreso tricolor, chips de riesgo persistido y Log de entrega expandible (estado/variante/postUrl/motivo/worker). Chips de color fuera de variantes shadcn (emerald/amber/red/teal + dark mode). Corregido TDZ de constantes y deps exactas de useMemo (react-hooks/preserve-manual-memoization).
- Pulido global: globals.css (scrollbars finos, selección de texto, ambos temas) + page.tsx (animación de entrada por sección con key+animate-in, marca con ring).
- Tests: scripts/test-mejoras-fb.cjs 25/25 (proxy enmascarado, usage, riesgo ALTO 65/BAJO 20, instantánea persistida, rotación 3 claims con ≥2 imágenes distintas, commentDelaySec=90, negrita unicode sin asteriscos, proxy ftp:// 400); regresiones P1 11/11 y P6 24/24. Autonomía restaurada a L2 tras el test (el script fija L1 para determinismo).
- Navegador (agent-browser): KPIs renderizados, gauge en vivo 35/MEDIO con factores, log de entrega expandido con chips de riesgo (65·ALTO / 20·BAJO), 0 errores de consola; 3 capturas en docs/capturas/fb-groups-mejoras-*.png.
- Docs: FICHA §12 P7 (hecho), worker README (rotación/bump/bold/proxy + gauge en checklist), MEJORAS_REPOS_JVZOO §E actualizado (1-4 ✅, 6-7 cubiertos/superados de serie, 5/8/9/10 con dependencia externa o decisión de negocio).
- Commit 4bbdc7b (17 archivos, +909/-213) empujado a main y verificado por ls-remote.

Stage Summary:
- Roadmap post-P6 cerrado por código: score de riesgo, log de entrega, rotación, bump-comment + unicode bold y proxy (los 6 gaps accionables). Quedan en roadmap solo items con dependencia externa: triage Lead Radar (requiere decisión de integración con AGENTE-CHISMOSO), RSS recurrente, reportes agencia, packaging Electron.
- Hueco #1 de paridad (rodaje real) sigue pendiente del usuario: desplegar worker y correr la primera campaña real con el checklist del README.
- Token ghp_wnxR...QZHP sigue activo (5º aviso): revocar tras confirmar.

---
Task ID: 12-metricool-destripe
Agent: agente principal (Z.ai)
Task: Destripe ClonaKit de Metricool — qué sirve para incluir en COMUNITI-MANAGER

Work Log:
- Estado previo verificado: origin/main = 4bbdc7b (P1/P6/P7 pushados, sin commits pendientes; 147 "modificados" eran solo filemode → core.filemode=false local).
- Destripe por lectura directa: metricool.com/es (módulos), metricool.com/pricing (precios exactos Free/Starter/Advanced/Custom EU+US), metricool.com/metricool-mcp/ (MCP oficial, 20+ acciones, todos los planes), help.metricool.com API-limitations, reviews independientes (webtribunal 05/10/2026, planable 25/10/2026, socialbu, turrboo). Sala limpia: solo patrones, cero código/texto.
- Hallazgo #1: el propio help center de Metricool confirma que NO puede publicar en grupos de FB (API muerta 22/04/2024) — fuente de autoridad para nuestro posicionamiento.
- Hallazgo #2: MCP-first (la herramienta se gobierna desde agentes de IA) valida la dirección agéntica ALBRA8.
- docs/research/METRICOOL_DESTRIPE.md creado: 8 secciones (hallazgos, ficha, precios, destripe módulo a módulo con veredicto por módulo, 10 patrones sala limpia, overlap ALBRA8 re-auditado, qué NO hacemos, backlog P8-P12).
- Backlog propuesto y priorizado: P9 informe de campaña (HTML→PDF, ya era roadmap "reportes agencia"), P8 calendario editorial, P10 mejores horas con datos propios (heatmap FbJob), P12 biblioteca media por marca, P11 MCP/skill fb-groups para AGENTE-GENERAL, P2 estado APPROVED pre-vuelo. Orden sugerido P9→P8→P10→P12→P11.

Stage Summary:
- Posicionamiento confirmado con fuente del propio Metricool: ni ellos ni nadie por API entra a grupos; nuestro worker con sesión propia sigue siendo el hueco.
- El destripe no duplica nada en ALBRA8; cicla el roadmap restante: "reportes agencia" = P9 validado, RSS recurrente queda postergado, Lead Radar sigue con decisión AGENTE-CHISMOSO.
- Pendiente de decisión del usuario: aprobar el orden P9→P8→P10→P12→P11 para la siguiente sesión, y el despliegue del worker (hueco #1 rodaje real).
- Token ghp_wnxR...QZHP sigue activo (6º aviso): revocar tras confirmar.
- [31/10/2026] Push completado con token renovado por el usuario: origin/main = 9477164 (destripe Metricool). Token anterior ghp_wnxR... quedó invalidado (bien). ⚠️ El nuevo token ya estuvo expuesto en chat: rota/revoca tras la sesión. Siguiente según backlog aprobado implícitamente por entrega de token: P9 informe de campaña.

---
Task ID: 13-p8-p12-destripe-implementacion
Agent: agente principal (Z.ai)
Task: Implementar el backlog del destripe Metricool (P8-P12) en COMUNITI-MANAGER

Work Log:
- Schema: FbMedia añadido (biblioteca por marca); db push aditivo + generate. Incidente conocido reapareció: el next-server viejo (PID 1137) sobrevivió al kill del wrapper y servía con cliente Prisma sin FbMedia → 500 en /api/fb-media. Reinicio limpio con ./node_modules/.bin/next (el subshell noheredó PATH: 'next: command not found') resolvió. Lección: verificar probe del endpoint NUEVO tras reiniciar, no solo un endpoint viejo.
- P10 lib pura src/lib/fb-besttime.ts: buildBestTime (heatmap 7×16, 6-21h), sugerencias solo con muestra global ≥10 + celda ≥3 + tasa ≥50% (franja con 75% de fallos NO es "mejor hora"), sin sugerencias si !enoughData. Fallos ubicados con updatedAt (aproximación declarada en UI). Test bun scripts/test-besttime.ts 10/10.
- P9 informe: /app/reports/[campaignId]/page.tsx (servidor) + print-button.tsx (isla cliente). KPIs, instantánea de riesgo, parámetros, entrega por objetivo (postUrl/failReason/variante/worker), bitácora AuditEntry, pie honesto sin engagement. notFound() si no existe. Botón "Informe" en CampaignRow.
- P12: API /api/fb-media (GET/POST/DELETE, misma validación que adjuntos, 409 duplicado, auditoría) + tarjeta Biblioteca con chips clicables dentro del formulario de campañas (toggle ±, techo 4 respetado).
- P11: GET /api/fb-agent/fb-groups — resumen honesto del módulo para AGENTE-GENERAL (workers sin secret ni baseUrl, grupos, campañas con counts, joinTasks, alertas, límites anti-ban, capacidades: crear sigue siendo POST + HITL).
- P8: WeekCalendar en fb-groups.tsx (navegación de semanas, agenda viva de campañas QUEUED/RUNNING/PAUSED con cola+ventana, bitácora por día solo de hechos con postedAt). FbJobRow += updatedAt; GET fb-campaigns expone updatedAt.
- Tests: test-p8-p12.cjs 24/24 (media válida/inválida/duplicada/GET/DELETE + informe 200/50%/failReason/auditoría/404 + agente shape/sin secretos/HITL). Regresiones: P7 25/25, P1 11/11 (TEST_BASE obligatorio, default 3199), P6 24/24. Falsos fallos iniciales de P7/P1: contaminación de datos de tests previos (48 grupos en 'test-mejoras') y TEST_BASE sin fijar — NO regresiones del código; limpieza con deleteMany de colecciones test-* antes de re-run.
- Navegador (agent-browser): calendario con semana 26 oct-1 nov, día actual resaltado con 2 POSTED reales; heatmap con celda verde jue 9:00 (2 posts) y rojas jue 20-21 (fallos), aviso "Muestra pequeña: 9 entregas"; biblioteca con empty state; informe completo renderizado (KPIs 50%, bitácora, pie honesto). 6 capturas en docs/capturas/fb-groups-p8/p9/p10/p12-*.png. 0 errores de consola.
- FICHA §12 += P8-P12 (hecho). rsync src/+schema→clone (15 cambios reales; core.filemode=false evitó el ruido de 147 modos).

Stage Summary:
- El ciclo publicar→medir→informar del destripe está cerrado en código: calendario (P8), informe de agencia (P9), mejores horas propias (P10), biblioteca (P12) y puente agéntico de lectura (P11). Queda del destripe solo P11 v2 (MCP completo) si el chaleco lo demanda.
- Lección operativa: los tests de la casa asumen DB limpia por colección; los runs repetidos contaminan (no son idempotentes entre stamps). Considerar limpieza pre-test en una futura pasada.
- Hueco #1 de paridad (rodaje real) sigue esperando el despliegue del worker del usuario.
- Token ghp_Ny86... expuesto en chat (1º aviso): rota al cerrar la sesión.

─────────────────────────────────────────────────────
Task ID: 14-p2-aprobado-prueba-general
Agent: agente principal (Z.ai)
Task: P2 (gate APPROVED pre-vuelo del destripe Metricool) + prueba general de funcionamiento para certificar estado de producción

Work Log:
- Schema: FbCampaign.status default QUEUED→DRAFT + campo approvedAt; FbJob.status añade PENDING_APPROVAL (default). db push aditivo + generate. Incidente repetido de la sesión 13: el next-server viejo con cliente Prisma cacheado daba 500 en POST fb-campaigns (Unknown argument approvedAt) → reinicio limpio resolvió. Lección ya registrada, re-confirmada.
- POST /api/fb-campaigns: nace DRAFT + jobs PENDING_APPROVAL por defecto; body.approve=true conserva flujo directo (QUEUED al crear, aprobada al crear en auditoría). PATCH action=approve (solo desde DRAFT, 409 si no, FB_CAMPAIGN_APPROVED auditado + approvedAt), cancel ahora también cancela PENDING_APPROVAL, pause exige QUEUED/RUNNING (409 en borrador), resume exige PAUSED (409 si no).
- claimJobsForWorker SIN cambios: DRAFT/PENDING_APPROVAL invisibles al worker (contrato HMAC intacto, cero cambios en modulo worker — como prometía el destripe).
- Panel: banda ámbar HITL en CampaignRow ("Borrador pendiente de aprobación: N job(s) · el worker no ve nada hasta que un humano apruebe") + botón "Aprobar y programar" + badge Borrador + chip "aprobada {fecha}" + ocultar Pausar/Reanudar en DRAFT + checkbox "Aprobar al crear (sin borrador intermedio)" en CampaignForm con etiqueta dinámica "como borrador / aprobada al crear".
- Informe P9: JOB_LABEL/CHIP PENDING_APPROVAL + línea "Aprobación pre-vuelo: aprobada por un humano el X / BORRADOR sin aprobar". Puente agéntico: counts.pendingApproval + honesty del gate + capabilities.createCampaign menciona approve.
- Test nuevo scripts/test-p2-approval.cjs (26/26): borrador invisible al claim firmado, 409s de validación, informe de borrador, approve→QUEUED+approvedAt+auditoría, claim tras aprobar entrega variante spintax, reporte POSTED firmado, informe declara aprobación, approve:true flujo directo, cancel de borrador cancela PENDING_APPROVAL, agent refleja el gate.
- Tests idempotentes ante DB sucia: e2e reactiva sus grupos e2e por fbId (excluded residual), test-mejoras filtra por stamp no por colección; check P7 actualizado a PENDING_APPROVAL (estado natural del borrador). test-media requiere TEST_BASE (default 3199 del repo). scripts/run-with-server.sh: levanta next dev, espera ready, corre baterías, apaga (los procesos background mueren al terminar cada comando del tool — solo sobreviven dentro de la misma invocación).
- REGRESIÓN COMPLETA 141/141: P2 26/26 + E2E 21/21 + P7 25/25 + P1 11/11 + P6 24/24 + P8-P12 24/24 + besttime 10/10.
- Build de producción next build sin errores. Recorrido E2E en navegador SOBRE build de producción (next start): demo vía API firmada (claim→report POSTED/FAILED correcto; el reporte sin claim previo NO se aplica — anti-spoofing verificado de paso), gate HITL visual completo (borrador → banda ámbar → Aprobar y programar → En cola + aprobada {fecha}), calendario P8 con agenda viva, heatmap P10 (verde 3×100% jue 9:00, rojo de fallo, sugerencia con muestra), informe P9 con 50% y línea de aprobación. 7 capturas en docs/capturas/. Trucos: snapshot refs formato `texto [ref=eX]`; scroll de cards se pierde por re-render → captura full-page + recorte PIL por coordenadas de elemento.
- FICHA §12 += P2-APPROVED (hecho). rsync src/+schema→clone; commit 7814c0a; push verificado bad8a1c..7814c0a.

Stage Summary:
- Backlog del destripe CERRADO a cero: P8, P9, P10, P11 v1, P12, P2-APPROVED hechos; descartes deliberados documentados en §6 del destripe.
- Estado de producción: el SOFTWARE está probado end-to-end (141 tests API + build de producción + UI verificada en navegador con datos reales de prueba y capturas). La publicación REAL contra Facebook sigue dependiendo del despliegue del worker en la máquina del usuario (hueco #1): eso es operación, no código. Decir "producción 100%" sería mentir: es "software 100% probado, operación pendiente de despliegue".
- Token ghp_Ny86... usado de nuevo en el push (exposición repetida): rotación pendiente al cerrar la sesión.

---

## Task ID: 15-meta-policy-intelligence
Agent: agente principal (Z.ai)
Task: PROMPT MAESTRO — Sistema autónomo de vigilancia, actualización y cumplimiento de políticas de Meta (META POLICY INTELLIGENCE) con 9 fases obligatorias

Work Log:
- FASE 1 Auditoría: mapado completo de módulos/API/lib del arnés; puntos de integración reales identificados sin duplicar (claims, campañas, puente P11, scheduler).
- FASE 2 Diseño: 5 modelos nuevos (MetaPolicySource/Version/CheckRun/Change/Incident) con versionado inmutable v1..n por fuente; db push aditivo.
- FASE 3 Fuentes: 26 fuentes del mandato sembradas (key estable, familia A-D, prioridad DAILY/WEEKLY/MANUAL). Aprendizaje de red verificado con matriz UA×cliente: el edge de Meta responde 400 a UA de Chrome "falsos"/desactualizados y a HTTP/1.1 de undici; con UA Safari vigente Node fetch funciona. Documentado en el código con transparencia: lectura de documentos públicos, sin login ni anti-abuso.
- Verificación real: 26/26 procesadas → 19 OK, 2 capturas con contenido distinto, 5 fallos honestos (4 sedes colombianas inalcanzables desde sandbox + consola apps MANUAL), 21 líneas base v1.
- FASE 4 Inteligencia: hash SHA-256 de texto normalizado + diff determinista por párrafos; severidad por familia (CRITICAL_SOURCE_KEYS → CRITICO en MODIFIED; NEW un escalón abajo; INACCESSIBLE ALTO si DAILY con ≥2 fallos). Defensa anti-ruido: shapeOf (texto sin cifras/puntuación) degrada a MEDIO los cambios solo-cosméticos de páginas rotativas con aviso de falso positivo (detectado con co-dnda y wa-business-policy, descartados con nota humana).
- Higiene de estado: recuperación cierra lo que el fallo abrió (INACCESSIBLE→ACCEPTED, incidente SOURCE_FAILURE→RESOLVED), incidente único por fuente (dedupe), POLICY_BLOCK solo para CRITICO. Scripts one-off de higiene para el residuo era-400.
- FASE 5 Integración real: POST fb-campaigns consulta authorize antes de crear (403 si BLOQUEADO/DESACTUALIZADA; borrador forzado si REQUIERE_APROBACION/NO_VERIFICADO); PATCH approve consulta FB_CAMPAIGN_APPROVAL (HITL no anula bloqueos); claimJobsForWorker/claimJoinTaskForWorker con policyHold (POLICY_HOLD); puente P11 expone policy (solo lectura); policyWatchTick en el bucle del scheduler con throttle 30 min y ErrorLog.
- Motor authorize(): 6 estados, peor gana; exclusión central consultada; cambio CRITICO abierto bloquea producto; frescura 14 días retiene alto riesgo; escritura Meta nunca PERMITIDO puro; cada decisión auditada META_POLICY_CHECK; simulador silencioso en panel.
- FASE 6 Panel: sección Gobierno → "Centro de Cumplimiento Meta": semáforo, 6 KPIs, 12 filtros por producto, Fuentes (verificar/revisión manual con nota ≥10), Cambios (analizar/aceptar/descartar), Informes (diario/semanal/mensual imprimibles), Decisiones+incidentes, Exclusiones y simulador. Apagado de emergencia con doble confirmación y reactivación con nota.
- FASE 7: informes computados que separan hechos verificados / interpretación / recomendación; incidentes con resolución auditada; fallo del vigilante va a ErrorLog.
- FASE 8: scripts/test-meta-policy.cjs — 41/41 cubriendo los 14 casos obligatorios del mandato (incluye: POST al puente agéntico → 405; parada solo por humano auditado). Bug propio detectado y corregido en caliente: policyState usaba fbFresh.fresh (inexistente) en lugar de stale → semáforo mintía DESACTUALIZADO. Regresión completa: P2 26/26, P1 11/11 (TEST_BASE=3000), P6 24/24, P7 25/25 (aserción de rotación probabilística: aleteó 2/3, saneado con sanity estadístico de pickRotatedMedia 1500/1500), P8-P12 24/24, besttime 10/10. Higiene: residuo demo del E2E anterior ("Lanzamiento demo (P2)") cancelado con auditoría. Lint limpio. Navegador (agent-browser): navegación, pestañas, informe mensual en vivo, 0 errores de consola; 3 capturas.
- FASE 9: FICHA raíz §11, FICHA FB-GROUPS nota de gate, docs/research/META_POLICY_INTELLIGENCE.md (diseño+limitaciones), docs/policy/BASE_DOCUMENTAL_INICIAL.md (base estática con fecha de referencia 08/10/2026, no vigencia), worklog; sync+commit+push.

Stage Summary:
- El cumplimiento de políticas de Meta es ahora una capacidad central: el worker no recibe vuelo sin veredicto del motor, y ningún agente puede desactivar las restricciones (verificado por test).
- Estado honesto de la vigilancia: 21/26 fuentes con línea base verificada; 4 colombianas requieren revisión manual desde la máquina del usuario (la red del sandbox no llega); 1 MANUAL por diseño.
- Fallos repetidos de esta sesión (reincidente): reinicio del dev server tras regenerar Prisma para cargar modelos nuevos.
- Token ghp_Ny86... reutilizado en el push (3ª exposición): rotación PENDIENTE al cerrar sesión.

---

## [2026-10-30] Task ID: BF-reglas-posteo — Reglas oficiales de posteo por red social (BROWSER-FACTORY) + motor multi-red familia E

**Objetivo:** El agente va a publicar en redes sociales junto con BROWSER-FACTORY (https://github.com/ALBRA8/BROWSER-FACTORY). Investigar las reglas oficiales de posteo/automatización de cada red para evitar baneos y definir cómo integrar BF con META POLICY INTELLIGENCE.

**Work Log:**
- Inspección de BROWSER-FACTORY (FICHA v1.0, repo público): centro de mando local de canales TikTok/YouTube/Instagram/X/Telegram con sesiones aisladas por perfil, despacho manual de videos e historial. En v1.0 NO publica automáticamente: es mano asistida (HITL por diseño). Su roadmap §7 (rotación de User-Agents, fingerprints avanzados, auto-llenado de formulario de subida) queda VETADO por §5.1 (evasión).
- Investigación con fuentes oficiales (consultadas 2026-10-30): X automation rules (abril 2026: posteo por scripting del sitio → suspensión permanente; auto-posteo vía API permitido con no-duplicación), YouTube Developer Policies (III.D.7 solo métodos documentados; III.E.6 no scraping; cuotas+audit), Meta Platform Terms §7.e.ii.3 (prohibido circumvent enforcement) + Meta ToS 1.5, Instagram Content Publishing (100 posts API/24h rodante, doc 2026-10-20; contradicción 50-carousels registrada), Telegram Bot FAQ (30 msg/s difusión; 1/s chat; 20/min grupo), TikTok Content Posting API con auditoría (docs JS-heavy: NO_VERIFICADO directo). Groups API deprecada v19 (verificado en sesiones previas).
- Doc entregado: docs/policy/REGLAS_POSTEO_REDES_BF.md — matriz por red con veredictos de 6 estados, límites verificados, 10 reglas legítimas anti-baneo (cumplimiento, no camuflaje), clasificación §5.1 de capacidades BF v1.0+roadmap, diseño de integración en 3 fases, vacíos de verificación honestos (§8).
- Motor ampliado (src/lib/meta-policy.ts): +8 fuentes familia E (x-automation-rules, x-terms, yt-api-tos, yt-developer-policies, tiktok-tos, tiktok-dev-portal, telegram-bots-faq, telegram-tos); CRITICAL_SOURCE_KEYS +3; productos X_TWITTER/YOUTUBE/TIKTOK/TELEGRAM en PRODUCT_MODULES; relevantProductsFor con prefijos X_/YT_/TT_/TELEGRAM_/IG_; defaultProductFor; REGLA FIJA BROWSER_AUTOMATION_* → BLOQUEADO (inmodificable por agentes, auditada); HITL extendido a X_POST/TT_POST/YT_UPLOAD/TELEGRAM_POST/IG_POST. UI: filtros por producto en meta-compliance.tsx. Sin migración Prisma (campos String).
- Verificación runtime: GET estado → 34 fuentes (26+8), familia E 8/8 sembrada; línea base v1 capturada con consultas reales: 7 OK + 1 BLOCKED (x-automation-rules; anti-bot de X — fallo honesto, no simulado); X_POST → POLITICA_DESACTUALIZADA (sin fuentes frescas; nada de frescura inventada); BROWSER_AUTOMATION_POST → BLOQUEADO con cita §5.1. Suite 14 casos: 41/41 ✓. ESLint 0 errores en archivos tocados (errores tsc en orchestrator.ts preexistentes, fuera de alcance).
- Corregido git core.filemode=false (limpiaban cambios mode-only de la sesión anterior); árbol limpio antes de este commit.

**Stage Summary:**
- Veredicto central: ninguna red autoriza posteo por automatización de navegador; el camino autorizado es la API oficial de cada red (con app revisada/auditada) o el humano en modo asistido. BF queda integrada como mano asistida; sus capacidades v1.0 son compatibles.
- El motor ya gobierna 5 redes además de Meta/WhatsApp/Colombia, con versionado inmutable y honestidad ante fuentes inaccesibles.
- Pendientes: verificación humana con navegador de los 5 vacíos (doc §8, p. ej. cláusulas puntuales de TikTok); decisión del administrador sobre qué apps oficiales registrar (sugerido Telegram→Meta→YouTube→X→TikTok); P2 + prueba general del módulo FB-GROUPS (aprobada, sin iniciar).

---

## [2026-10-30] Task ID: 16-push-familiaE-prueba-general
Agent: agente principal (Z.ai)
Task: Push del commit familia E con token renovado + prueba general post-familia-E para certificar producción

Work Log:
- Push con token renovado: origin/main 1f5a638 → b366d85 (Reglas oficiales de posteo por red social + motor multi-red familia E), verificado por ls-remote. El token quedó en /tmp/gh-token (0600, fuera de todo árbol git) con helper de credenciales local del clon; scopes repo+workflow, login ALBRA8.
- Prueba general post-familia-E: regresión completa 182/182 (P2 26, E2E 21, P7 25, P1 11, P6 24, P8-P12 24, besttime 10, meta-policy 41) + build de producción sin errores + cola limpia (0 campañas con jobs vivos).
- 2 fallos iniciales, ambos del harness de tests (producción intacta):
  (1) P2 ventana 0-23: el intervalo [start,end) excluye windowEnd → a la hora local 23 (Bogota) el claim se negaba ("Fuera de ventana horaria"). Corregido a 0-24, la convención que e2e/mejoras/media ya usaban.
  (2) Contaminación entre baterías: el claim reparte por createdAt asc y no distingue tests; residuos QUEUED de P2 (Directa P2 sin reclamar + job sobrante de Gate P2) se colaban en el claim de P1 (mediaUrls [] en vez de los adjuntos).
- Higiene nueva: P2 cancela sus residuos al inicio y al final (prefijos Gate P2 / Directa P2 / Borrador a cancelar P2); P1 cancela residuos QUEUED/DRAFT/PAUSED de prefijos de tests antes de crear las suyas. Lección de la sesión 13 aplicada en código.
- Parche propio detectado al vuelo: la primera versión de la higiene de P1 corría DESPUÉS de crear MediaOK y el prefijo 'MediaOK-' la cancelaba a sí misma (claim vacío → crash en job.id). Regla registrada: la higiene corre SIEMPRE antes de crear los artefactos propios del test.
- ESLint 0 errores (scripts/ fuera de scope). FICHA módulo §12 += certificación post-familia-E. Tests sincronizados workspace→clon; commit+push.

Stage Summary:
- La familia E (motor multi-red) no rompió nada: el software sigue "100% probado"; los 2 fallos eran flakes temporales/contaminación del harness, saneados para correr a cualquier hora del día.
- Estado de producción honesto: SOFTWARE certificado end-to-end (182/182 + build + cola limpia); la publicación REAL contra las redes sigue dependiendo del despliegue del worker (hueco #1: operación del usuario, no código).
- Pendientes del usuario: verificación humana de los 5 vacíos de fuentes (docs/policy/REGLAS_POSTEO_REDES_BF.md §8), decisión de qué apps oficiales registrar (sugerido Telegram→Meta→YouTube→X→TikTok), despliegue del worker.
- Token ghp_24YT... ya expuesto en chat (1er aviso): rotar/revocar al cerrar la sesión.

---

## [2026-11-06] Task ID: 17-blotato-destripe
Agent: agente principal (Z.ai)
Task: Destripe ClonaKit de Blotato — hub API+MCP de 9 redes; qué sirve para COMUNITI-MANAGER

Work Log:
- Estado previo verificado a pedido del usuario: cero menciones de Blotato en workspace, clon e historial git; los 20 referentes no lo incluían. Decisiones vigentes respetadas: Postgale INTEGRAR primario (POC existente), Postiz self-host, PostLake backup.
- Investigación con fuentes oficiales (consultadas 06/11/2026): blotato.com (home, /pricing, /social-media-api, /mcp, /reviews), help.blotato.com (índice llms.txt, rate-limits.md, llm/limits.md, platforms/facebook.md, upload-media) y blog de ingeniería propio de Blotato que cita docs oficiales de Meta/X/Bluesky/Pinterest/TikTok. Terceros: Trustpilot 4.8/384 y comparativa de un competidor directo (upload-post.com, usada solo para verificación cruzada). El usuario aportó 4 capturas del web app real → docs/capturas/blotato-ui-*.png.
- Hallazgo #1: Blotato es la tesis de la familia E comercializada — "the platform is a field in the request"; ellos operan las apps de desarrollador aprobadas de cada red; cero automatización de navegador en su modelo.
- Hallazgo #2: publica techos propios MÁS ESTRICTOS que cada plataforma con la razón escrita ("accounts that publish at platform maximum through automation get flagged"): IG 50/24h, FB 25/Página/24h, LinkedIn 50/24h, TikTok 25/24h (máx 3 cuentas en Starter), Pinterest 10-50/día, YouTube 10-25/canal/24h, X/Threads/Bluesky sin techo propio.
- Hallazgo #3: Facebook = solo Páginas (nuestro hueco de grupos sigue intacto), flujo desatendido sin HITL (nuestro gate P2 + motor 6 estados sigue siendo diferenciador), y el trial de 7 días EXCLUYE API/MCP (generar API key termina el trial: gasto mínimo agéntico $29/mes). Contradicción menor registrada: media upload 30 vs 10 req/min según página.
- Doc entregado: docs/research/BLOTATO_DESTRIPE.md — 8 secciones: hallazgos, ficha, precios + plan limits completos, destripe módulo a módulo con veredicto, 10 patrones sala limpia, overlap ALBRA8 re-auditado (Blotato = candidata SECUNDARIA en la horneada de proveedores), qué NO hacemos (5) y backlog propuesto.
- Backlog del destripe: P13 techos propios multi-red parametrizados en el motor familia E (único código nuevo justificado ya); P14 endurecer el POC Postgale con polling/Retry-After/estados por objetivo; P15 horneada de proveedores (Postgale vs Blotato vs PostLake con el mismo harness) cuando el usuario autorice gasto; P11 v2 con llms.txt propio y tool de cuota.

Stage Summary:
- Blotato valida por vía comercial nuestra arquitectura (hub de API oficial + techos anti-ban declarados + MCP-first) pero no cubre grupos ni HITL; NO se integra como dependencia (custodia única de todos los tokens + suscripción mensual).
- El destripe no duplica nada: aporta una tabla de calibración de techos y confirma los criterios del POC Postgale desde el lado comercial.
- Pendientes del usuario: autorizar (o no) gasto para la horneada de proveedores (P15) y aprobar P13 si quiere los techos numéricos en el motor ya.
- Token ghp_24YT... usado de nuevo en el push (2ª exposición en sesiones distintas): rotación pendiente al cerrar.

## [2026-11-06] Task ID: 18-integracion-blotato-p13-p14
Agent: agente principal (Z.ai)
Task: De la pregunta del operador "¿ya integramos todo o falta construcción?" → construir lo aprovechable del destripe Blotato sin dependencia externa ni gasto (P13 + P14 + P11 v2-lite)

Work Log:
- Estado respondido con honestidad: el destripe (Task 17) fue ANÁLISIS; la integración estaba al 0%. Se construyó el paquete completo que no exige decisiones del operador ni dinero.
- P13 (el único código motor nuevo justificado): tabla NETWORK_CAPS con 7 redes (FB_GROUP_POST, FB_PAGE_POST, IG_POST, X_POST, YT_UPLOAD, TT_POST, TELEGRAM_POST) en app/src/lib/meta-policy.ts. Cada entrada separa tres capas: platformLimit (solo con captura documental directa + fecha; si no, null + NO_VERIFICADO), ourCap (techo defensivo propio, fijo en código, NO modificable por agentes — misma naturaleza que la regla fija §5.1) y calibration (Blotato como referencia comercial, marcada NO fuente de verdad). Valores: IG 50/24h bajo el 100 oficial verificado con content_publishing_limit como fuente viva; Telegram 20 msg/s difusión (⅔ del 30 oficial verificado) y 1/s chat + 20/min grupo tal cual; FB Páginas 25/24h sin cifra oficial directa; X 50% del tier (reglas cualitativas); YT 6 subidas condicionadas a confirmar cuota en consola; TikTok sin direct post hasta auditoría; FB grupos = warmup 5/10/20 ya existente.
- Cableado: authorize() añade paso 8 — toda operación de publicación (WRITE_OPERATIONS) lleva su techo como condición textual y como dato estructurado (cap) en el resultado; la API GET /api/meta-policy expone networkCaps; UI: pestaña nueva "Techos multi-red" en el Centro de Cumplimiento (tabla auditable de 3 columnas: techo propio / límite oficial / calibración, con badges honestos y verificación viva) y simulador ampliado de 4 a 11 operaciones (incluye BROWSER_AUTOMATION_POST para ver la regla fija §5.1). Capturas: meta-policy-techos.png, meta-policy-simulador-techo.png.
- P14: POC_POSTGALE_VALIDATION.md += sección "Endurecimiento del POC": polling con intervalos crecientes (5s→15s→60s, tope 10), 429 como telemetría con Retry-After auditado (2 en la misma publicación = parada y escalado humano), campos opcionales por red (sin ceros inventados) y cruce obligatorio con NETWORK_CAPS antes de cualquier envío real.
- P11 v2-lite: ruta /llms.txt del chaleco — superficie agéntica documentada una por una (puente solo lectura, HITL de campañas, motor de 6 estados, techos P13) + reglas permanentes; explícito que describe capacidades y no concede permisos.
- Tests: +11 checks en test-meta-policy.cjs (tabla expuesta, separación de capas, VERIFICADO solo con fuente+fecha, IG/TikTok/Telegram puntuales, cap estructurado en simulador, lectura sin techo, §5.1 intacta, llms.txt). Regresión completa 194/194 (P2 26, E2E 21, P7 25, P1 11, P6 24, P8-P12 24, besttime 10, meta-policy 53) + build de producción + lint 0 errores.
- HALLAZGO REAL de la vigilancia durante la regresión: chequeo DAILY detectó cambio en yt-developer-policies (v1 30/10 en español → v2 con chrome rotativo de Google: "/" → "Página principal"); clasificado CRÍTICO (fuente crítica) → bloquea operaciones globales hasta análisis HUMANO. Es casi seguro un falso positivo de página rotativa y así quedó documentado en el test: la aserción del case 12 ahora distingue kill switch (emergencia) de bloqueo por críticos abiertos (legítimo). El cambio queda OPEN en el panel esperando al operador — la IA no clasifica cambios de reglas por su cuenta.
- Error propio corregido: cp en dirección equivocada (workspace→clon) machacó una edición del test; re-aplicada y regla mental reforzada: el workspace es la copia viva, el clon recibe con rsync/cp ANTES de commit.

Stage Summary:
- La pregunta "¿nos falta construcción?" quedó respondida en código: P13/P14/P11 v2-lite hechos y probados (194/194 + build + lint + capturas de navegador); P15 es la única pieza pendiente y no es de construcción sino de decisión de gasto del operador.
- El motor ahora cubre el ciclo completo del destripe: referencia de contrato (Postgale) + techos propios multi-red + endurecimiento del POC + superficie agéntica documentada.
- Pendientes del operador: (1) analizar en el panel el cambio CRÍTICO de yt-developer-policies (falso positivo probable) para desbloquear operaciones — 2 clics con nota; revisar los otros 35 cambios abiertos acumulados; (2) autorizar o no el gasto de la horneada de proveedores (P15); (3) rotar el token ghp_24YT... (3ª exposición); (4) despliegue del worker (hueco #1 de producción).

## [2026-11-06] Task ID: 19-repush-token-nuevo
Agent: agente principal (Z.ai)
Task: Push de los 2 commits que quedaron en local (destripe Blotato 188c41a + construcción P13/P14/P11v2-lite 595975d) con token GitHub nuevo

Work Log:
- El usuario entregó token nuevo (el ghp_24YT... quedó revocado; el push de la sesión anterior no llegó a GitHub: origin/main seguía en 30564d0 con HEAD local en 595975d, 2 commits por delante).
- Token guardado en /tmp/gh-token (0600, fuera de todo árbol git), credential helper del clon lo lee al vuelo. Verificado login ALBRA8 vía API.
- git push origin main: 30564d0..595975d, verificado con ls-remote (origin/main == HEAD local == 595975d). Árbol limpio, sin cambios sin commitear.

Stage Summary:
- GitHub quedo sincronizado con TODO el trabajo: familia E certificada (30564d0), destripe Blotato completo (188c41a) y construcción P13/P14/P11v2-lite (595975d).
- Aviso permanente: ESTE token (ghp_SWcs...) también quedó expuesto en el chat → rotar/revocar al cerrar la sesión.

## [2026-11-06] Task ID: 20-verificacion-relojito-paridad
Agent: agente principal (Z.ai)
Task: Revisión integral "que todo funcione como relojito" + veredicto honesto de paridad

Work Log:
- Sincronía workspace↔clon verificada por diff (meta-policy.ts, llms.txt, API meta-policy, meta-compliance.tsx, tests): idénticos. GitHub sincronizado (Task 19).
- Lint: 0 errores. Build de producción: sin errores, con las rutas nuevas (/llms.txt, /api/meta-policy) en el manifiesto.
- Regresión completa 194/194: P2 26, E2E 21, joins 24, mejoras 25, P1 11, P8-P12 24, besttime 10, meta-policy 53 (incluye checks P13 de techos multi-red).
- Hallazgo de la revisión: test-media-fb.cjs era la ÚNICA batería con default TEST_BASE=http://localhost:3199 (sin referencia documental alguna); correr la regresión sin la variable explícita chocaba contra ECONNREFUSED. No era bug de software sino mina heredada del harness. Endurecido: default unificado a 3000, P1 re-corrida sin variable (11/11), sincronizado al clon, commit 3b830dd empujado y verificado por ls-remote.
- Higiene post-baterías: COLA LIMPIA (0 campañas con jobs vivos; script nuevo scripts/cola-check.cjs para diagnóstico rápido vía Prisma). DB viva confirmada: prisma/db/harness.db (URL fija en schema.prisma; el DATABASE_URL de .env es decorativo del scaffold).
- Veredicto de paridad entregado al operador: 100% de lo construido/comprometido funciona y está probado; NO existe paridad funcional total con Blotato 9 redes (deliberada: falta P15 horneada de proveedores, que es decisión de gasto, y la publicación real depende del despliegue del worker).

Stage Summary:
- El software está certificado relojito otra vez: 194/194 + build + lint + cola limpia + GitHub en 3b830dd.
- Paridad honesta: paridad total con el backlog autorizado; paridad parcial y deliberada con los destripes (hueco grupos FB + HITL + motor 6 estados siguen siendo ventaja propia; el resto multi-red requiere P15).
- Pendientes del operador intactos: análisis del hallazgo CRÍTICO yt-developer-policies en el panel, autorización P15, despliegue del worker, 5 vacíos §8, apps oficiales, rotar el token expuesto en este chat.

## [2026-11-06] Task ID: 21-auditoria-production-ready
Agent: agente principal (Z.ai)
Task: MISIÓN auditoría integral, corrección autónoma y preparación para producción (5 auditores × 9 ciclos)

Work Log:
- FASE 1: repo consolidado (main limpio, 3b830dd = origin/main, sin secretos trackeados, .gitignore correcto).
- FASE 2-5: 9 ciclos con 39 ejecuciones de auditor; 115 hallazgos crudos → consolidados, verificados en código y corregidos por causa raíz: 6 críticos (deploy standalone sin DB, claim no atómico con ventana IA de 25 s, reportes sin máquina de estados, formulario que borraba memoria de marca, crash del filtro de políticas, leases sin reaper), 18 altos y ~85 medios/bajos/informativos. Commits: cffef28 → 6eb9c1b → 6dceff5 → 4eaf69d → 8c20f40 → d9d1faf → 8c20f40→8f5d5cd, push verificado con ls-remote en cada uno.
- Fixes notables: reclamos atómicos (updateMany+count) en jobs/joins/approvals/campañas/schedules/runTask/research; reaper con CAS y gracia de 120 s; reportes idempotentes solo desde LEASED; techo con in-flight; nightOverride auditado; lease dinámico con commentDelaySec; PANEL_TOKEN opcional en 23 mutaciones; fail-closed webhooks/tick; XSS hrefs; standalone copia prisma+DB (verificado en vivo con /api/health); error boundaries; memoria de marca hidratada; 25 errores de tipos latentes corregidos con ignoreBuildErrors:false; locks y portabilidad del entregable.
- Aprendizajes duros registrados: (1) un fix declarado en commit sin implementación real (nextRetryAt) fue cazado por la re-auditoría — desde entonces, diff verificado por auditor independiente en cada cierre; (2) recoverInterrupted sin gracia re-encolaba tareas RUNNING vivas — corregido con updatedAt lt now-120s; (3) el transporte del chat se come la secuencia [h — verificado por bytes que NINGÚN archivo resultó dañado.
- Certificación final: regresión 199/199 (P2 26, E2E 25, joins 24, P1 11, mejoras 25, P8-P12 24, besttime 10, meta-policy 54) + tsc 0 + lint 0 + build producción + cola limpia + smoke standalone (health db ok, 404 real) + bun install --frozen-lockfile sin cambios. Criterio de salida: 2 pasadas limpias consecutivas (ciclos 8 y 9, SIN HALLAZGOS CONFIRMADOS en los 4 dominios).
- Entregables de documentación: AUDIT_REPORT.md, PRODUCTION_READINESS.md, CHANGELOG.md (raíz del repo), FICHA certificada, README de despliegue.
- Pendientes del operador (sin cambios): despliegue del worker (hueco #1), análisis del hallazgo CRÍTICO yt-developer-policies en el panel, autorizar P15, 5 vacíos §8, apps oficiales, ROTAR el token de este chat (expuesto otra vez).

Stage Summary:
- El software queda certificado production-ready con evidencia: 199/199, build real, deploy standalone verificado, seguridad con frontera opcional documentada, y 2 pasadas de auditoría limpias consecutivas. Lo que falta para publicar de verdad es operación (worker, credenciales, proxy con token), no código.

## [2026-11-15] Task ID: 22-browser-use-p17lite
Agent: agente principal (Z.ai)
Task: Destripe sala limpia de browser-use (solicitud explícita del usuario: "muy conveniente para nuestro comuniti manager") + adopción de patrones + push al repo

Work Log:
- Token nuevo guardado en /tmp/gh-token (0600, fuera de árboles git) y verificado vía API: login ALBRA8. Credential helper del clon leyéndolo al vuelo. Aviso: ESTE token también quedó expuesto en el chat → rotar al cerrar.
- Estado de partida verificado: clon limpio en e09fa00 = origin/main (la misión de auditoría ya estaba certificada de la sesión anterior con 199/199 — el resumen del contexto iba desactualizado).
- Estudio del repo: browser-use v1.0.5 (commit e717df1, 14/11/2026, MIT) clonado shallow a /tmp/bu-study, FUERA de todos los árboles del proyecto. Leídos README, MIGRATING, domains.py, tools.py, agent/{loop,judge,service}.py, browser/browser.py.
- Hallazgo central: browser-use es la categoría exacta que nuestra regla fija §5.1 ya gobierna (agente que opera navegador real; su cloud vende stealth/CAPTCHA/proxies residenciales). Decisión sala limpia: NO se integra como dependencia; se adoptan sus PATRONES re-implementados en TS/Node para operar NUESTRA propia app.
- Entregable 1: docs/research/BROWSER_USE_DESTRIPE.md — 5 hallazgos, ficha, arquitectura 0.x→1.0 (acción-por-paso → REPL+CDP), 10 patrones numerados, matriz de compliance mapeada a los 6 estados, qué adoptamos hoy, qué NO hacemos, backlog P17.
- Entregable 2 (P17-lite): scripts/agent-browser-e2e.cjs — arnés agéntico sobre Playwright global (cero dependencias nuevas): registro de acciones con validación, guardarrails deny-by-default (allowlist TEST_BASE; file:/javascript: denegados; subrecursos de terceros abortados — MÁS estricto que el referente, que solo cubre documento principal), topes de pasos/tiempo, extracción estructurada, juez determinista de cierre, capturas + historial. 4 misiones solo-lectura (higiene: sin artefactos en DB).
- Error propio corregido en el camino: (1) aserción h1 en portada era un invento mío — la portada no usa h1; sustituida por invariantes reales (title propio, nav≥15, botones>0). (2) server zombi de una sesión previa ocupaba :3000 (EADDRINUSE en el log del runner) — matado y re-corrida limpia para que la evidencia sea de nuestro propio arranque. (3) primera invocación usó el runner del clon (resuelve a app/ del clon) en vez del del workspace — corregido según la disposición de la casa.
- Corrida certificada: 4/4 misiones, 16 pasos, violación esperada del guardarrail registrada (example.com abortado con origen intacto), 0 violaciones inesperadas, 0 pageerror. Post-corrida: lint 0, cola limpia.
- README (nota de scripts de navegador ampliada) y CHANGELOG (entrada 2026-11-15 P17-lite) actualizados en el clon. Escaneo de secretos en los 4 archivos cambiados: limpio.

Stage Summary:
- La "conveniencia" de browser-use quedó convertida en algo nuestro y conforme: un arnés agéntico de QA que opera el panel con guardarrails duros y un destripe que documenta por qué la categoría está BLOQUEADA contra redes sociales (§5.1) y PERMITIDA contra nuestra propia app.
- Sin dependencias nuevas en el entregable; sin cambios en src/ (el estado certificado 199/199 de e09fa00 queda intacto; el alcance del commit es 2 archivos nuevos + README + CHANGELOG).
- Pendientes del operador (sin cambios): rotar el token expuesto en este chat, desplegar el worker, analizar el hallazgo CRÍTICO yt-developer-policies en el panel, autorizar P15, 5 vacíos §8, apps oficiales.

## [2026-11-15] Task ID: 23-capturas-panel-operador
Agent: agente principal (Z.ai)
Task: Capturas del panel para revisión del operador ("me gustaría ver el dashboard del agente")

Work Log:
- Build de producción regenerado (limpio). Recorrido de capturas con navegación real: scripts/capturas-panel.cjs (6 secciones, página completa, 1440px).
- Primer hallazgo: la DB estaba en estado semilla (0 marcas) → Resumen ejecutivo solo mostraba esqueletos. Se sembró demo propia (scripts/demo-seed-panel.cjs: 1 marca + 3 grupos + 1 campaña aprobada) + entregas reales del contrato chaleco↔worker vía demo-reports.cjs (1 POSTED + 1 FAILED, worker se autolimpia).
- Segundo hallazgo: la primera tanda quedó capturada a mitad de la animación de entrada (se veía lavada) → esperas de asentamiento añadidas (networkidle + 1.5s) y re-captura.
- Higiene completa: scripts/demo-cleanup-panel.cjs eliminó marca, grupos, campaña y jobs demo respetando FKs + auditoría PANEL_DEMO_CLEANUP. cola-check: limpia (0 campañas). Server detenido.
- Verificación visual: dashboard (KPIs honestos + ciclo autónomo + conectividad del ecosistema), módulo FB-GROUPS completo (grupos 3/3, gauge 25/100 BAJO, campaña TERMINADA con log de entregas), Agentes (14 agentes + ecosistema ALBRA).
- Herramientas commiteadas al repo (convención: scripts de navegador del workspace viven en el repo): capturas-panel.cjs, demo-seed-panel.cjs, demo-cleanup-panel.cjs.

## [2026-11-15] Task ID: 24-panel-fusionado-ajustes
Agent: agente principal (Z.ai)
Task: Responder "¿el agente es mock o la app es real?" + fusionar los dos mundos en una sola plataforma de configuración + consola minimalista

Work Log:
- Auditoría mock/real (Explore thorough, 27 route handlers + 18 libs + schema completo + contenido real de harness.db): la app es REAL — capa de datos 100% Prisma/SQLite, motor Meta-Policy con actividad verificada en BD (34 fuentes, 33 check-runs), LLM real vía SDK embebido, protocolo worker HMAC real; lo pendiente se declara honesto (AWAITING_CREDENTIALS), cero mocks. Único placeholder: api/route.ts "Hello world" heredado. Panel virgen: 0 marcas/campañas. Sin código de OpenAI/Anthropic/graph.facebook/whatsapp/instagram: las vías son Postgale/Postiz/PostLake (publicar), WhatsPower/CRM (WhatsApp), ScrapeCreators (IG).
- Entregable 1 (fusión): vista Ajustes e integraciones (settings.tsx + GET/POST /api/integrations) — centro unificado de IA, APIs, WhatsApp, Instagram/Facebook, worker, webhooks, cuentas sociales y sistema; estado real + variable exacta que falta + botón Probar (solo-lectura; endpoint documentado o alcanzabilidad cruda; nunca simula). Las claves NO se guardan en DB (protección de datos): la vista lo explica.
- Entregable 2 (minimalismo): navegación 6 grupos difusos → 5 claros (Panel/Comunidad/Contenido/Operación/Sistema); tema oscuro por defecto con toggle next-themes (dependencia ya presente); identidad unificada COMUNITI-MANAGER; footer corto; anclas del arnés de QA conservadas.
- Error propio corregido: (1) API nueva contaba FB-GROUPS como conectada por envKeys vacías — replicado el criterio del registro (solo CONNECTED con worker real); (2) await dentro de setState callback (TS1308); (3) select lastPingAt inexistente → lastSeenAt; (4) lint set-state-in-effect → IIFE async con cancelación; (5) caché turbopack corrupta por kills abruptos (server colgado compilando /) → rm -rf .next y re-corrida limpia.
- Corrida certificada: 221/221 (P2 26, E2E 25, joins 24, P1 11, mejoras 25, P8-P12 24, besttime 10, meta-policy 54, integraciones 22 nuevos), tsc 0, lint 0, cola limpia, capturas 8/8 en download/capturas-panel (dashboard, ajustes, marcas, agentes, grupos, cumplimiento, automatizaciones, calendario).

Stage Summary:
- El panel es UNA plataforma: COMUNITI-MANAGER concentra operación y configuración (IA/APIs/WhatsApp/Instagram/worker); el dashboard del agente y el del arnés ya no son dos mundos.
- La respuesta a "¿mock o real?" queda codificada: nada se simula, lo pendiente nombra su variable exacta.
- Pendientes del operador (acumulados): rotar token expuesto en chat, credenciales de las vías (Postgale o Postiz para IG/FB; WHATPOWER_URL + ruta documentada para despacho WhatsApp real; CRM-ALBRA), desplegar worker FB, analizar CRÍTICO yt-developer-policies, autorizar P15, 5 vacíos §8, apps oficiales.

## [2026-11-15] Task ID: 25-indicador-devtools-fuera
Agent: agente principal (Z.ai)
Task: "borra esa N que me estorba o si es importante ocultala pero no la quiero ver"

Work Log:
- Diagnóstico: la N roja ("1 Issue") es el devtools de Next.js en modo desarrollo (next-devtools), NO parte de la app; en producción no existe. La insignia "1 Issue" era un error REAL de hidratación: el aria-label del botón de tema (src/app/page.tsx) dependía de theme sin guard de mounted (el icono sí lo tenía) — servidor y primer render del cliente discrepaban.
- Fix 1: devIndicators: false en next.config.ts (documentado en el archivo; los errores siguen visibles en dev.log y error boundaries).
- Fix 2: aria-label={mounted && theme === 'dark' ? ... : ...} — patrón estándar next-themes.
- Verificación con navegador real: sonda nueva scripts/verify-devtools-off.cjs (Playwright, DOM del portal + consola + captura) — CONSOLA LIMPIA 0 errores/avisos, 0 elementos visibles del portal; captura /tmp/verify-final.png confirma la esquina inferior izquierda limpia (la nav "Registro de errores" / "Costes y límites" ya no queda tapada).
- Descubrimiento de entorno: el sandbox solo sostiene el dev server desde el boot del contenedor (start.sh); procesos lanzados desde sesiones de tool mueren al terminar la llamada (probado con nohup, setsid y sleep de control). El server de plataforma reaparece al reiniciar la sesión y leerá la config nueva.
- BLOQUEO DE PUSH: commit local 10bf619 listo, pero /tmp/gh-token ya no existe (limpieza de /tmp entre sesiones; el helper envió contraseña vacía → 401). Se necesita token nuevo del operador para empujar. Nada de código se perdió: workspace y clon persisten.

Stage Summary:
- Panel sin la N y sin la insignia; el "Issue" era un bug real de hidratación corregido de raíz, no tapado.
- Pendientes del operador (acumulados): token GitHub nuevo para push, credenciales de vías (Postgale/Postiz, WhatsPower, ScrapeCreators), desplegar worker FB, CRÍTICO yt-developer-policies, autorizar P15, 5 vacíos §8, apps oficiales.

## [2026-11-15] Task ID: 26-limpieza-casa-canales-telegram
Agent: agente principal (Z.ai)
Task: "hay mucho ruido visual... canales que no nos sirven para nada y los importantes que va a administrar están perdidos como telegram... a limpiar la casa, lo que no sirve que no estorbe"

Work Log:
- Auditoría: nav de 21 ítems en 5 grupos; el motor YA vigilaba fuentes oficiales de Telegram y aplicaba techos TELEGRAM_POST verificados (20 msg/min por grupo, 1 msg/s por chat, backoff 429) — pero el canal no existía en la UI ni en el registro. El usuario tenía razón: lo importante estaba perdido.
- Nav 21→16 ítems en 5 grupos por misión: Panel / Canales (NUEVO) / Contenido / Operación / Sistema. Secundarias plegadas en su vista madre: biblioteca→creación, memoria→marcas, competidores→investigación, herramientas+seguridad→ajustes, errores→historial. Anclas de QA intactas ('Grupos de Facebook', 'Centro de Cumplimiento Meta').
- Nueva vista Canales (channels.tsx): canal primero, herramienta después. Tarjetas: Grupos de Facebook (worker propio, riesgo declarado), Telegram (Bot API oficial, 4 pasos de activación), Instagram/Facebook (Postgale/Postiz), WhatsApp (WhatsPower). Estado honesto + variable exacta + Probar (solo lectura) + cuentas por marca.
- Telegram de primera clase: tool telegram.bot en el registro (contrato honesto get_connection_status; despacho con el ejecutor del canal después), prueba real getMe en /api/integrations, red 'telegram' en NETWORKS con especificación (texto 4096, pie media 1024), etiqueta en Marcas y cuentas, grupo "Canales de publicación" primero en Ajustes.
- Calidad: tsc 0, eslint 0, batería 223/223 (integraciones 22→24 con 2 checks nuevos de Telegram; e2e 25/25 verificado aparte; besttime corre con bun, no node), sonda navegador consola limpia 0/0, capturas 9/9 (incluye 02-canales.png).
- Commit local fbd9598 (encima de 10bf619). Push BLOQUEADO: sigue sin token en /tmp/gh-token (limpieza de /tmp entre sesiones). Nada se pierde: workspace y clon persisten.

Stage Summary:
- La casa quedó ordenada: 16 ítems por misión, Canales con Telegram visible y probable, cero canales muertos estorbando.
- Pendientes del operador (acumulados): token GitHub nuevo para push (10bf619 + fbd9598 listos), TELEGRAM_BOT_TOKEN vía @BotFather, credenciales de vías (Postgale/Postiz, WhatsPower), desplegar worker FB, CRÍTICO yt-developer-policies, autorizar P15, 5 vacíos §8, apps oficiales, ejecutor Telegram (P21).

## [2026-11-15] Task ID: 26-limpieza-02-recorte-directo

Agent: agente principal (Z.ai)
Task: "¿para qué sirve Agentes? no somos un panel de control; ¿dónde escaneo el QR de WhatsApp?; si no tiene usabilidad clara bórralo; sube los cambios"

Work Log:
- Directiva del operador aplicada con criterio de misión: el panel sirve a UNA cosa (manejar redes y postear evitando baneo); lo que solo documenta y no permite actuar, fuera.
- ELIMINADO 'Agentes' (AgentsSection completo): era documentación de arquitectura (14 agentes + catálogo ALBRA) sin ninguna acción posible. El estado operativo real de herramientas sigue en Ajustes.
- ELIMINADO 'Límites y costes' (CostsSection completo): pasiva; los límites reales los aplica el motor y se ven donde actúan (marca: máx posts/día + horario; Centro de Cumplimiento Meta: techos oficiales).
- Nav 16 → 14 ítems en 5 grupos. Badge de errores vivos ahora sí cuelga de 'Historial y errores' (antes apuntaba a un id inexistente).
- Canales reordenado por misión: 1) Telegram (Bot API oficial, 4 pasos, falta TELEGRAM_BOT_TOKEN), 2) WhatsApp, 3) Grupos de Facebook, 4) IG/FB por vías API.
- WhatsApp card honesta (pregunta del QR respondida en UI): el QR NO se escanea en este panel — la sesión se vincula en la consola del daemon de WhatsApp de CRM-ALBRA (protocolo WhatsApp Web, verificado en investigacion/albra8/CRM-ALBRA/src/whatsapp-daemon/daemon.mjs: Baileys + QR en terminal). Pasos: levantar daemon y escanear QR ahí → apuntar WHATPOWER_URL → Probar. Nada fingido.
- capturas-panel.cjs actualizado (fuera la sección 05-agentes; 8 capturas renumeradas).
- Regresión completa: 223/223 (P2 26, E2E 25, joins 24, media-P1 11, mejoras 25, P8-P12 24, meta-policy 54, integraciones 24 — 2 checks más que en P18, besttime 10), tsc 0, lint 0, sonda devtools: consola limpia 0 visibles, capturas 8/8, aserción SSR de nav OK (14 ítems, sin los eliminados).

Stage Summary:
- El panel quedó con 14 secciones que todas responden "¿qué hago aquí?" para la misión núcleo.
- La respuesta al QR de WhatsApp está en la propia UI y es verdadera: QR = consola del daemon CRM-ALBRA; el chaleco se conecta por WHATPOWER_URL.

## [2026-11-15] Task ID: 27-identidad-independiente-whatsapp-propia

Agent: agente principal (Z.ai)
Task: "no tienes la información clara de qué es este proyecto... es un agente totalmente independiente, su especialidad es postear contenido en redes sociales y administrar múltiples cuentas; el CRM es un mundo aparte como Chismoso o Leads — cada agente tiene su tarea"

Work Log:
- Corrección de identidad aplicada de raíz: el encuadre "el chaleco depende del ecosistema para WhatsApp/CRM" era un error sembrado por información previa mal dada. Ahora el proyecto se presenta por lo que es: agente INDEPENDIENTE de redes sociales.
- Reencuadre en UI: cabecera "Agente independiente de redes sociales" (antes "Panel del agente de comunidad"), pie sin mención a AGENTE-GENERAL, dashboard "Conectividad de herramientas" (antes "del ecosistema"), biblioteca multimedia sin subordinación a KREA/YT-Automation.
- Ajustes reagrupado: "Canales de publicación" (conexiones propias del agente), "Investigación de mercado" (propia) y "Ecosistema (mundo aparte: otros agentes)" — CRM/Chismoso/Leads/KREA/YT/NEX/WhatsPower/semilla marcados como de OTROS agentes, integración opcional vía malla firmada; nada de eso hace falta para publicar.
- CONECTOR DE WHATSAPP PROPIO (P19-WA-PROPIA): el agente ahora tiene su propio canal de WhatsApp con sesión QR (protocolo WhatsApp Web, sin navegador — §5.1 no aplica por no haber automatización de navegador). Patrón worker-FB: scripts/whatsapp-daemon.cjs corre en PC/VPS del operador (Baileys 7.0.0-rc14 + qrcode, instalados limpios), vincula la sesión, guarda credenciales en prisma/db/whatsapp-session (gitignored) y reporta estado firmado HMAC (mismo estándar de la malla) a /api/whatsapp/session (nueva: GET panel + POST conector, fail-closed con HARNESS_WEBHOOK_SECRET). Modelo WhatsappSession (additivo) + estado honesto en registry (whatsapp.session, 15 tools) y /api/integrations (CONNECTED solo con conector vivo ≤120s, criterio igual al worker FB). La vista Canales muestra el QR EN VIVO (poll 5s) con pasos de vinculación, aviso de frescura y riesgo declarado (protocolo no oficial). Prueba real del tool integrada. Smoke real en sandbox: el conector arrancó, generó QR verdadero y el panel lo aceptó firmado.
- BUGS PROPIOS corregidos: (1) doble lectura del body en POST /api/whatsapp/session (req.text() + req.json() sobre stream consumido → todo reporte moría en validación; el log laxo del conector lo disimulaba — endurecido para mostrar RECHAZO); (2) server huérfano en :3000 sirviendo código viejo → pkill + rm -rf .next antes de cada corrida; (3) bloque QR pintaba caja vacía sin sesión → ahora se oculta (lo que no sirve no estorbe).
- test-integrations.cjs actualizado: registro 14→15 + 3 checks nuevos (whatsapp.session sin envKeys, estado honesto, whatsappSession en GET). verify-whatsapp-session.cjs nuevo: 12 checks (fail-closed 401, firma falsificada, QR_WAITING→CONNECTED, QR limpiado al conectar, estado en integraciones, prueba del tool, estado inválido 400, limpieza final).
- REGRESIÓN COMPLETA 238/238 (P2 26, E2E 25, joins 24, media-P1 11, mejoras 25, P8-P12 24, meta-policy 54, integraciones 27, whatsapp-session 12, besttime 10), tsc 0, lint 0, consola limpia 0 visibles, capturas 8/8, SSR asertado (identidad presente, sin "operado por AGENTE-GENERAL").

Stage Summary:
- El agente es independiente en los hechos: publica con conexiones propias (worker FB, Bot API Telegram, sesión QR WhatsApp, vías IG/FB) y el ecosistema queda donde el operador lo puso: mundo aparte, integración opcional.
- Responder al "¿dónde escaneo el QR?": AHORA en la propia vista Canales, arrancando scripts/whatsapp-daemon.cjs — sin CRM ni intermediarios.
