# Reglas oficiales de posteo en redes sociales para BROWSER-FACTORY — mapa de cumplimiento e integración con META POLICY INTELLIGENCE

**Fecha de investigación:** 30 de octubre de 2026
**Método:** ClonaKit sala limpia. Solo patrones y hechos con fuente oficial citada. Ninguna política de terceros fue copiada como regla interna: cada afirmación de este documento distingue **hecho verificado** (con URL y fecha de consulta) de **interpretación** y de **NO_VERIFICADO**.
**Regla rectora que gobierna todo el documento:** que una acción sea técnicamente posible no significa que la red social la autorice. La ausencia de una prohibición explícita NO es una autorización. Prohibido evadir sistemas de detección o enforcement de cualquier plataforma (§5.1 del mandato META POLICY INTELLIGENCE).

---

## 1. Objetivo y pregunta del administrador

El administrador planteó que el agente va a publicar en redes sociales en conjunto con la herramienta BROWSER-FACTORY (https://github.com/ALBRA8/BROWSER-FACTORY), y pidió investigar toda la información pertinente sobre las reglas de posteo de cada red social para que las cuentas no sean baneadas, y definir cómo hacerlo.

Este documento responde en tres capas: (a) qué dice **cada red** sobre posteo automatizado, con citas textuales de fuentes oficiales consultadas hoy; (b) qué puede y qué **no debe** hacer BROWSER-FACTORY para no poner en riesgo las cuentas (incluida la clasificación de su hoja de ruta ante la regla anti-evasión §5.1); y (c) cómo se integra BROWSER-FACTORY con el motor META POLICY INTELLIGENCE ya operativo en COMUNITI-MANAGER, que pasa de vigilar solo Meta a vigilar las redes del ecosistema.

**Convergencia con el mandato vigente:** esta investigación es el insumo directo de la FASE 2 del PROMPT MAESTRO (catálogo de fuentes y versionado): amplía las 26 fuentes Meta/Colombia con una nueva **familia E** (otras redes). Nada de lo aquí propuesto reconstruye funcionalidades existentes: el motor ya tiene el historial de versiones inmutable, la clasificación de cambios y el autorizador de 6 estados; solo se le agregan las fuentes y productos nuevos.

---

## 2. Qué es BROWSER-FACTORY hoy (inventario honesto desde su FICHA)

Según su FICHA.md v1.0 (consultada el 2026-10-30), BROWSER-FACTORY es un centro de mando **local** para gestionar múltiples canales (TikTok, YouTube, Instagram, X y Telegram) con:

1. Gestión ilimitada de canales en `data/perfiles.json` (nombre, nicho, proxy opcional).
2. Lanzador de navegador aislado en 1 clic por canal (`--user-data-dir` propio por sesión persistente).
3. **Modo Celular**: abre el canal emulando un Pixel 8 (user-agent móvil + ventana 412x915 + eventos táctiles).
4. Selector de videos con miniaturas por canal (galería que escanea una carpeta local) y asignación de video por canal.
5. Historial de publicación: el botón "✓ Publicado" archiva video + fecha en el JSON del canal.
6. Seguridad local (CSP, bloqueo de path traversal, rechazo de orígenes externos).

**El dato central para el cumplimiento:** en su versión 1.0, BROWSER-FACTORY **no publica nada automáticamente**. El flujo oficial de su FICHA es: el humano pulsa el botón de la red, "sube el video asignado y vuelve al panel", y marca "✓ Publicado". Es decir, hoy es una **mano en modo asistido (HITL por diseño)**: prepara, aísla y registra, pero la acción de publicar la ejecuta una persona. Ese es exactamente el modo que el motor puede autorizar sin conflicto.

**Zona de riesgo de su hoja de ruta (§7 "Para más adelante"):** la FICHA anuncia tres mejoras futuras que caen directamente en la línea roja §5.1 y que **no deben construirse** tal como están formuladas: "rotación automática de User-Agents y fingerprints avanzados", "extensión puente para auto-llenar el formulario de subida en TikTok/YouTube" y "calendario de publicación programada" (si implica que el navegador actúa solo). La justificación completa está en §7 de este documento.

---

## 3. La regla transversal que sale de las fuentes

Tras revisar las fuentes oficiales de las cinco redes de BROWSER-FACTORY más Meta, la conclusión transversal es única y condiciona toda la arquitectura:

> **Ninguna red social relevante autoriza la publicación mediante automatización de navegador no oficial. El único método autorizado universal es la API oficial de cada plataforma (con sus permisos, auditorías y cuotas), o el posteo humano directo.**

Evidencia textual por red (todas consultadas el 2026-10-30):

| Red | Cita / regla oficial | Fuente |
|---|---|---|
| **X (Twitter)** | "Use non-API-based forms of automation, such as scripting the X website. The use of these techniques may result in the **permanent suspension** of your account." (reglas de automatización, actualizadas abril 2026). Además: prohibido "Abuse the X API or attempt to circumvent rate limits". | help.x.com/en/rules-and-policies/x-automation |
| **YouTube** | "You must not use undocumented APIs without express permission. You must access data from YouTube API services **only according to the means stipulated in the authorized documentation**" (III.D.7). "You and your API Clients must not... directly or indirectly, **scrape** YouTube Applications" (III.E.6). Acceso con cuentas proxy tras suspensión → prohibido (III.D.6). | developers.google.com/youtube/terms/developer-policies |
| **Meta (Facebook/IG)** | Platform Terms §7.e.ii.3: "You have created or maintained App(s) to **circumvent, or attempt to circumvent, our enforcement actions**" → deshabilitación. Las Condiciones de Meta (vigentes 1 ene 2025; nueva versión 20 ene 2027) reservan acciones contra el uso que comprometa "the security (including the availability, authenticity, integrity...)" de los productos (§1.5). | developers.facebook.com/terms · facebook.com/terms |
| **TikTok** | El camino oficial de publicación es la **Content Posting API** con **aprobación por auditoría de la app** para direct post. Las docs del portal son JS-heavy y no se pudieron capturar hoy vía HTTP (ver §8); la exigencia de auditoría está corroborada por evidencia de comunidad (apps reales rechazadas en el audit de Content Posting API) y por el índice de búsqueda de developers.tiktok.com. **Clasificado: NO_VERIFICADO (documental directa), con alta confianza en la regla.** | developers.tiktok.com (portal) |
| **Telegram** | **Telegram es la excepción estructural**: el Bot API es un método oficial *diseñado a propósito* para que un software publique. Límites oficiales: ~30 mensajes/segundo en difusión (1.000/s con paid broadcasts), 1 msg/segundo por chat, 20 msg/minuto por grupo. | core.telegram.org/bots/faq |
| **Facebook Groups** | Sin API: la Groups API fue deprecada con Graph API v19 (abril 2024) — verificado en sesión anterior vía changelog de Meta e hilo HN 39269642. No existe método de publicación automatizada autorizado para grupos. | developers.facebook.com (changelog v19) |

**Interpretación marcada como tal:** esto no es una casualidad sino el modelo de cumplimiento de todas las plataformas: la automatización legítima existe, pero pasa por registrar una app, declarar el caso de uso, someterse a revisión/auditoría (Meta App Review, YouTube API Compliance Audit, TikTok audit) y aceptar cuotas. Las herramientas comerciales del sector (Postgale, Outstand, SocialAPI, etc.) funcionan exactamente así: OAuth de app oficial por red. El "atajo" de automatizar el navegador es lo que todas las ToS prohíben explícita o implícitamente, y es la causa canónica de baneo masivo de cuentas.

---

## 4. Matriz por red con veredictos del motor (6 estados)

Veredictos propuestos según el motor de autorización existente (PERMITIDO, PERMITIDO_CON_CONDICIONES, REQUIERE_APROBACION, NO_VERIFICADO, BLOQUEADO, POLITICA_DESACTUALIZADA). El peor veredicto gana y la ausencia de información nunca es permiso.

| Red / operación | Método autorizado | Veredicto del motor | Condiciones / notas | Límite oficial verificado |
|---|---|---|---|---|
| **FB Pages** — publicar | Graph API `POST /{page-id}/feed` con `pages_manage_posts` (+ App Review para acceso avanzado) | `PERMITIDO_CON_CONDICIONES` | HITL pre-vuelo, techo conservador, auditoría de cada acción | Doc oficial de Pages API actualizada 2026-05-07; publicación y programación explícitamente soportadas |
| **Instagram** — publicar | Content Publishing API (`/<IG_ID>/media` + `media_publish`), permisos `instagram_content_publish` | `PERMITIDO_CON_CONDICIONES` | Media en servidor público; verificar límite real vía endpoint `content_publishing_limit` en vez de hardcodear | **100 posts API / 24h rodante** por cuenta profesional (doc oficial actualizada 2026-10-20); carousel cuenta como 1; hay además una mención de 50 para carousels en el mismo doc (contradicción de Meta — ver §8) |
| **FB Groups** — publicar | Ninguno automatizado (API deprecada) | `REQUIERE_APROBACION` | Lo que ya hace FB-GROUPS: aprobación humana pre-vuelo + worker DOM con techo/warmup + parada ante señales | — |
| **X (Twitter)** — postear | X API v2 oficial (app registrada, tier con write) | `PERMITIDO_CON_CONDICIONES` | Prohibido: contenido duplicado o sustancialmente similar en una cuenta o entre cuentas operadas; cuentas duplicadas para casos de uso similares; evadir rate limits | Reglas de automatización (abr 2026): el auto-posteo de difusión útil está **permitido** vía API |
| **X (Twitter)** — postear por navegador/script del sitio | — | `BLOQUEADO` | Riesgo de suspensión **permanente** declarado por X | help.x.com (cita en §3) |
| **YouTube** — subir video | YouTube Data API v3 (`videos.insert`, OAuth por canal) | `PERMITIDO_CON_CONDICIONES` | Cuota por proyecto + posible Compliance Audit para extensión; acciones claramente iniciadas por el usuario (III.C.2) | Cuota por defecto (10.000 unidades/día; subida ≈1.600) **NO_VERIFICADO hoy en fuente directa** — confirmar en consola antes de operar |
| **YouTube** — subir por navegador no-API | — | `BLOQUEADO` | Solo métodos documentados (III.D.7); scraping prohibido (III.E.6) | — |
| **TikTok** — publicar | Content Posting API **con app auditada** | `REQUIERE_APROBACION` → sin app auditada pasa a `NO_VERIFICADO`/`BLOQUEADO` según evidencia | Sin app auditada no existe direct post: el agente no publica; se usa modo asistido | Auditoría exigida (evidencia de comunidad; doc oficial por capturar) |
| **TikTok** — publicar por navegador no-API | — | `BLOQUEADO` (prudencial) | Sin verificación documental directa hoy; la prudencia del mandato impone bloqueo mientras no haya fuente directa | — |
| **Telegram** — publicar | **Bot API** (bot como admin del canal/grupo) | `PERMITIDO` (con techo interno) | Respetar 30 msg/s difusión, 1 msg/s por chat, 20 msg/min grupo; 429 → backoff | core.telegram.org/bots/faq (verificado 2026-10-30) |
| **Cualquier red** — posteo por automatización de navegador sin API oficial | — | `BLOQUEADO` (regla fija, no modificable por agentes) | Implementada en el motor en esta sesión (ver §9) | Regla §5.1 del mandato |

**Nota sobre proveedores de terceros no oficiales** (twitterapi.io, ScrapeCreators y similares): son APIs *de terceros* que acceden a las redes por vías no oficiales. Usarlos no cambia la naturaleza de la acción: el agente estaría igualmente automatizando el acceso por un medio no autorizado por la red, y además entregaría credenciales/cookies a un tercero. Clasificación: `BLOQUEADO` para publicación; `NO_VERIFICADO` para lectura, decidido caso por caso.

---

## 5. Límites oficiales verificados (tabla de referencia del motor)

| Límite | Valor | Fuente oficial | Fecha de verificación |
|---|---|---|---|
| Instagram publishing cap | 100 posts API / 24h rodante por cuenta profesional; carousel = 1 post | developers.facebook.com/documentation/instagram-platform/content-publishing | 2026-10-30 |
| Telegram difusión (bots) | ~30 msg/s (1.000/s con paid broadcasts) | core.telegram.org/bots/faq | 2026-10-30 |
| Telegram por chat / por grupo | 1 msg/s por chat; 20 msg/min por grupo (429 con ráfagas) | core.telegram.org/bots/faq | 2026-10-30 |
| X duplicación | Prohibido postear duplicado/similar en una o varias cuentas propias | help.x.com/en/rules-and-policies/x-automation (abril 2026) | 2026-10-30 |
| YouTube acceso | Solo por APIs documentadas; scraping prohibido; cuotas con extensión vía auditoría | developers.google.com/youtube/terms/developer-policies (III.D.3, III.D.7, III.E.6) | 2026-10-30 |
| Meta evasión | Apps creadas para circunvenir enforcement → deshabilitación (§7.e.ii.3) | developers.facebook.com/terms | 2026-10-30 |
| Cuota YouTube por defecto (10.000 u/día; upload 1.600 u) | Reportado por terceros; pendiente fuente directa | (consola de desarrolladores / doc de costos de cuota) | NO_VERIFICADO 2026-10-30 |

Los límites **no oficiales** que circulan en el sector (X posts/mes por tier de precio, TikTok uploads/hora, FB 1-post-every-N-minutos, etc.) NO se incorporan como reglas del motor hasta verificarlos en fuente directa de cada plataforma. El motor registra cuotas por operación y aplica techos internos conservadores; nunca depende de números de blogs.

---

## 6. Cómo se evita el baneo de cuentas (sin evasión): reglas legítimas respaldadas por fuentes

Las únicas prácticas anti-baneo que las fuentes oficiales respaldan son de **cumplimiento**, no de camuflaje. Estas son las reglas que el motor aplicará y que BROWSER-FACTORY debe respetar:

1. **Método oficial siempre.** Postear solo por la API oficial de cada red (con app registrada y revisada) o por acción humana directa. Ningún posteo del agente por navegador no-API (cita por red en §3).
2. **HITL (human-in-the-loop) como norma de escritura.** Toda operación de publicación nace con aprobación humana pre-vuelo (patrón ya vigente en FB-GROUPS y hoy extendible a las demás redes). X lo dice explícitamente desde el lado del usuario: "You are ultimately responsible for the actions taken with your account".
3. **No duplicar contenido entre cuentas.** Regla explícita de X ("may not post duplicative or substantially similar posts... over multiple accounts you operate"). Para el ecosistema: el mismo video/texto no debe publicarse idéntico en varias cuentas propias de la misma red; el spintax/variación determinista existente sirve a la personalización por canal, no a ocultar automatización.
4. **No crear/operar cuentas duplicadas para el mismo caso de uso** (X). La separación de canales de BROWSER-FACTORY debe corresponder a casos de uso reales y distintos (p. ej. nichos distintos), no a multiplicar la misma cuenta de uso. Y las reglas de cuentas múltiples de cada red (p. ej. YouTube permite canales múltiples bajo la misma identidad vía Brand Accounts) se verifican por red antes de operar varias.
5. **Nunca evadir rate limits ni enforcement.** X: "attempt to circumvent rate limits" = falta grave. Meta §7.e.ii.3: apps para circunvenir enforcement → deshabilitación. YouTube III.D.6: recrear credenciales vía proxies tras suspensión → prohibido. Esto prohíbe, en el ecosistema, cualquier función cuyo propósito sea evadir detección o recuperar acceso eludiendo una decisión de la plataforma.
6. **Rate-limiting interno conservador ≠ evasión.** Los techos diarios, ventanas horarias y calentamiento de FB-GROUPS son legítimos porque su propósito es *respetar* límites y no perturbar la plataforma — no simular conducta humana para engañarla. La distinción operativa §5.1 queda fijada: pausas/delays con fin de cumplimiento = permitido; pausas/jitter/huellas cuyo fin sea parecer humano ante los sistemas de la red = prohibido.
7. **Responder a las señales de la plataforma con parada honesta.** CHALLENGE_DETECTED, 429, suspensiones o avisos → parar la operación y escalar a humano. Prohibido reintentar en bucle o rotar identidades para "pasar" (coherente con los estados PAUSED_ANTI_BAN/CHALLENGE_DETECTED ya existentes).
8. **Registrar apps y pasar auditorías donde toque** (YouTube Compliance Audit, TikTok audit, Meta App Review). Es el costo real del camino autorizado y no se puede atajar.
9. **Cuotas respetadas y trazadas.** Conteo por operación en la base (ya existe FbDailyUsage para FB; replicable por red), con techos internos por debajo de los oficiales.
10. **Proxies y aislamiento solo con fines legítimos declarados.** Un proxy declarado en la ficha del worker (como ya se hace en FbWorker.proxyUrl) para operación de la propia cuenta es administración de infraestructura; el mismo mecanismo usado para ocultar actividad automatizada o multiplicar identidades para eludir límites es evasión. La frontera es el propósito, y el propósito queda registrado en auditoría.

---

## 7. Clasificación §5.1 de las capacidades de BROWSER-FACTORY (v1.0 y hoja de ruta)

| Capacidad (FICHA BF) | Estado hoy | Clasificación ante §5.1 | Decisión |
|---|---|---|---|
| Sesiones aisladas por canal (`--user-data-dir`) | En producción v1.0 | **Permitida**: gestión de las propias sesiones del usuario; no oculta automatización (quien opera es el humano) | Mantener |
| Historial y despacho de videos por canal | En producción v1.0 | **Permitida**: registro local, cero interacción con la red | Mantener |
| "✓ Publicado" con fecha | En producción v1.0 | **Permitida**: evidencia de acción humana | Mantener; es la evidencia que el motor podrá leer |
| Modo Celular (UA Pixel 8 + ventana táctil) | En producción v1.0 | **Zona de riesgo**: un UA móvil con el *humano* operando es uso normal de desarrollo; el mismo mecanismo usado *por el agente* para no parecer automatización es ocultación | Permitido solo para operación humana. Nunca disponible para jobs del agente |
| Proxy por canal | En producción v1.0 | **Permitida con propósito declarado** (infraestructura de la propia cuenta) | Debe quedar declarado y auditado; prohibido usarlo para elusión |
| Roadmap: rotación de User-Agents + fingerprints avanzados | Propuesto (no construido) | **PROHIBIDO**: su único fin plausible es evadir detección (§5.1 lo veta; X lo llama scripting del sitio → suspensión permanente) | No construir. Anotar en la FICHA de BF como decisión de cumplimiento |
| Roadmap: extensión puente que auto-llena el formulario de subida (TikTok/YouTube) | Propuesto (no construido) | **PROHIBIDO tal como está**: es posteo por navegador no-API (bloqueado por YouTube III.D.7 y por la regla transversal) | No construir; el equivalente autorizado es el conector API oficial |
| Roadmap: calendario de publicación programada | Propuesto (no construido) | **Condicionado**: programar está bien por API oficial; si implica navegador actuando solo, bloqueado | Diseñar sobre conectores API, nunca sobre el navegador |

---

## 8. Vacíos de verificación (honestidad radical del 2026-10-30)

Conforme al mandato, lo que no se pudo verificar **no se simula ni se declara verificado**. Estos vacíos quedan registrados y el motor los tratará como `NO_VERIFICADO`/`FAILED` hasta nueva consulta:

1. **Documentación de TikTok para developers**: el portal (developers.tiktok.com) sirve la documentación vía JavaScript; la consulta HTTP directa del motor devolverá fallo o contenido no analizable, y así se registrará. La existencia de la Content Posting API y la exigencia de auditoría están corroboradas por índice de búsqueda y evidencia de comunidad (apps rechazadas en audit), pero **no por captura documental directa**. Pendiente: captura con procedimiento alternativo (humano con navegador) para versionar v1.
2. **Cuota por defecto de YouTube Data API** (10.000 unidades/día; upload ≈1.600): reportada por terceros; falta confirmación en la página oficial de costos de cuota / consola. No se hardcodea como regla.
3. **Contradicción interna de Meta en Instagram**: el mismo documento oficial dice 100 posts/24h en la sección Rate Limit y 50 en la nota de carousels (y el valor 25 de 2021 circula aún en blogs). Decisión del motor: **no hardcodear ninguno**; consultar siempre `GET /<IG_ID>/content_publishing_limit` como fuente de verdad por cuenta (así lo recomienda la propia documentación).
4. **Reglas de cuentas múltiples de TikTok** (límite de cuentas por dispositivo/identidad): sin fuente directa capturada hoy → cualquier operación multi-cuenta en TikTok queda en NO_VERIFICADO hasta verificación humana.
5. **ToS de X completa** (x.com/legal/tos) y **Telegram ToS** (telegram.org/tos): registradas como fuentes familia E para consulta periódica del motor; no se citan cláusulas puntuales hasta tener captura versionada.

---

## 9. Diseño de integración BROWSER-FACTORY ↔ META POLICY INTELLIGENCE

Arquitectura general (coherente con el mandato: Arnés orquesta → motor consulta/versiona/clasifica/alerta → Manos consultan antes de actuar):

```
ADMINISTRADOR (HITL)
      │ aprueba / decide
      ▼
COMUNITI-MANAGER (arnés)  ──►  META POLICY INTELLIGENCE (motor: authorize + versionado + alertas)
      │                                ▲  familias A-D (Meta/WhatsApp/Colombia) + E (X/YouTube/TikTok/Telegram)
      ▼                                │
  ┌────────────────────┬───────────────┴────────────────┐
  │ FB-GROUPS (worker) │ BROWSER-FACTORY (mano asistida) │ Conectores API oficiales (futuro)
  │ DOM + HITL + techo │ sesión humana + registro       │ X API v2 / YT Data API / TT Content API / TG Bot API
  └────────────────────┴────────────────────────────────┘
```

**Fase I — implementada en esta sesión (motor multi-red):**
- Familia **E** de fuentes oficiales agregada al catálogo (X: reglas de automatización + ToS; YouTube: API ToS + Developer Policies; TikTok: ToS + portal de developers; Telegram: Bot FAQ + ToS). Mismo versionado inmutable, misma clasificación de cambios, misma honestidad ante fallos de consulta.
- Productos nuevos en el motor: `X_TWITTER`, `YOUTUBE`, `TIKTOK`, `TELEGRAM` (+ `INSTAGRAM` ya existente), con mapeo de módulos afectados y de prefijos de operación (`X_*`, `YT_*`, `TT_*`, `TELEGRAM_*`, `IG_*`).
- **Regla fija no modificable por agentes**: toda operación cuyo prefijo sea `BROWSER_AUTOMATION` recibe `BLOQUEADO` con la cita transversal (posteo por navegador no-API no está autorizado por ninguna red; solo API oficial o humano).
- Operaciones de escritura por red (`X_POST`, `TT_POST`, `YT_UPLOAD`, `TELEGRAM_POST`, `IG_POST`) exigen aprobación humana pre-vuelo, igual que `FB_GROUP_POST`.

**Fase II — conectores API oficiales (propuesta, requiere credenciales y auditorías del administrador):**
1. Registrar una app por red y someterla a su proceso (Meta App Review; proyecto YouTube + audit si se supera cuota; TikTok audit para direct post; cuenta de developer X con tier de write; Telegram solo requiere crear el bot con BotFather).
2. Secretos y tokens SOLO en `.env` del arnés (regla vigente: nunca en fichas ni documentos de políticas).
3. Cada operación cruza `authorize({ operation: 'X_POST' | 'YT_UPLOAD' | ..., product, approvedByHuman })` antes de ejecutar; el veredicto queda auditado (patrón idéntico al de fb-campaigns).
4. Techos internos por red por debajo de los oficiales, medidos con una tabla de uso diario por red+canal (réplica del patrón FbDailyUsage).
5. `PERMITIDO` solo para Telegram Bot API (método diseñado oficialmente para software); el resto `PERMITIDO_CON_CONDICIONES` con HITL.

**Fase III — BROWSER-FACTORY como mano asistida integrada (sin cambiar su naturaleza v1.0):**
- El arnés genera/asigna el video y el texto por canal; el humano publica desde la ventana aislada de BROWSER-FACTORY; al marcar "✓ Publicado", un webhook/miniformulario registra en el arnés: canal, red, video, fecha, URL del post. El arnés gana así métricas reales (hoy en NetworkMetric) y evidencia de publicación humana, sin que un navegador del agente toque la red.
- Regla contractual para BROWSER-FACTORY: **nunca** incorporará las capacidades vetadas de su §7 (fingerprints/UA-rotation/auto-fill). La FICHA de BF debe anotar esta decisión de cumplimiento para que su roadmap no la incluya por accidente.

---

## 10. Qué cambia en las operaciones del ecosistema (resumen ejecutivo)

| Pregunta del administrador | Respuesta corta |
|---|---|
| ¿El agente puede postear por navegador (BROWSER-FACTORY/Playwright)? | **No.** Ninguna red lo autoriza; X lo castiga con suspensión permanente y YouTube/Meta lo prohíben como acceso no documentado/circumvent. Regla fija `BROWSER_AUTOMATION_* → BLOQUEADO` en el motor. |
| ¿Cómo se evita el baneo entonces? | Método oficial por red (API con app revisada), HITL pre-vuelo, techos internos conservadores, no duplicar contenido entre cuentas, no evadir límites/enforcement, parada honesta ante señales. Detalle en §6. |
| ¿Qué hace BROWSER-FACTORY en este diseño? | Mano asistida: sesiones aisladas para el humano + despacho de videos + registro "✓ Publicado" que alimenta las métricas del arnés. Sus capacidades v1.0 son compatibles; su roadmap de fingerprints/auto-fill queda vetado. |
| ¿Qué se puede automatizar ya, hoy, legalmente? | Telegram vía Bot API (método oficial), y vía API oficial con app revisada: FB Pages, Instagram (100/24h), X (con reglas anti-duplicación), YouTube (cuota). FB Groups y TikTok sin app auditada → asistido/HITL. |
| ¿Qué cambió hoy en el código? | Motor ampliado a 5 redes (familia E, 8 fuentes nuevas, 4 productos nuevos, regla fija anti-navegador, HITL por red). Documento y decisiones versionados en este archivo y en worklog. |

**Próximos pasos recomendados (en orden):** (1) verificación humana con navegador de los 5 vacíos de §8 para sembrar versiones v1 de las fuentes E que fallen la consulta HTTP; (2) decisión del administrador sobre qué app por red registrar primero (sugerido: Telegram → Meta Pages/IG → YouTube → X → TikTok, por costo de auditoría ascendente); (3) retomar P2 + prueba general del módulo FB-GROUPS (tarea aprobada y pendiente), que ahora también valida el flujo HITL del motor multi-red.
