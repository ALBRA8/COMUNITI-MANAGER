# DESTRIPE CLONAKIT — BLOTATO

> Task 17 · 2026-11-06 · Solicitud del usuario: confirmado "¿lo destripo?" → sí.
> Antecedente: el usuario preguntó si ya lo habíamos destripado (no: cero menciones
> en workspace, clon e historial git; los 20 referentes no lo incluían) y aportó
> 4 capturas del web app real (docs/capturas/blotato-ui-*.png).
> Método: solo lectura. Fuentes oficiales: blotato.com (home, /pricing,
> /social-media-api, /mcp), help.blotato.com (índice llms.txt, rate-limits.md,
> llm/limits.md, platforms/facebook.md) y blog propio de ingeniería de Blotato
> (que cita docs oficiales de Meta/X/Bluesky/Pinterest/TikTok). Terceros:
> Trustpilot 4.8/384 (consultado 06/11/2026), comparativa de un competidor
> directo (upload-post.com — parcial, se usa solo donde es verificable).
> **Sala limpia: no se copia código, texto ni assets; se extraen patrones de
> producto.** Regla de la casa: no se declara capacidad sin fuente; lo no
> verificable queda marcado.

## 0. Hallazgos que definen la relación

**0.1 Blotato es la tesis de la familia E comercializada: hub de API oficial +
MCP, y el "no browser automation" está en su propio modelo.** Se define como
"agent infrastructure for social media marketing: one API and MCP server,
9 platforms" (X, LinkedIn, Facebook, Instagram, TikTok, YouTube, Threads,
Bluesky, Pinterest). Su argumento de venta contra hacer las integraciones uno
mismo: "the alternative is a developer app, a review queue, and a token-refresh
job per platform. Here the platform is a field in the request". Es decir: la
empresa opera las apps de desarrollador aprobadas por cada red; el cliente
nunca ve una revisión OAuth. Esto coincide línea por línea con nuestra
conclusión de REGLAS_POSTEO_REDES_BF.md: ninguna red autoriza posteo por
automatización de navegador; el camino autorizado es la API oficial con app
revisada. Blotato, Postgale, PostLake y Upload-Post son cuatro encarnaciones
comerciales del mismo patrón. Validación externa de dirección, no amenaza:
el hueco que cubrimos (grupos de FB con sesión propia del usuario) sigue
fuera de su alcance (§0.3).

**0.2 Publica techos propios MÁS ESTRICTOS que los de cada plataforma, con la
razón escrita: "accounts that publish at platform maximum through automation
get flagged".** Su tabla de caps propios por red (consultada 06/11/2026):
Instagram 50/cuenta/24h · Facebook 25/Página/24h · LinkedIn 50/perfil y
Página/24h · TikTok 25/cuenta/24h (máx. 3 cuentas TikTok en Starter) ·
Pinterest 10-50 pines/día según vistas mensuales · YouTube 10/canal/24h en
Starter y 25 en Creator · X, Threads y Bluesky sin techo propio (rige el de la
plataforma). Nuestro motor familia E llegó a la misma conclusión (techos
anti-ban por debajo del máximo) desde la ingeniería; Blotato demuestra que es
también un argumento comercial declarable. Valor directo para nosotros: sus
valores son una referencia de calibración — NO una fuente de verdad (§6.4).

**0.3 El hueco nuestro sigue intacto y su postureo es el opuesto al nuestro en
HITL.** Facebook en Blotato = solo Páginas ("Publishing to personal Facebook
profiles is not supported"; la cuenta personal conectada es solo de
autorización). Cero mención a grupos en su doc de plataformas — la API de
grupos sigue muerta desde v19 y Metricool ya lo declaraba en su help center.
Y su flujo natural es el agente desatendido (publicar por API/MCP sin humano
delante): no encontramos flujo de aprobación estilo "el cliente aprueba antes
de publicar" en lo consultado. Nuestro HITL obligatorio pre-vuelo (gate P2 +
motor de 6 estados) sigue siendo diferenciador, no deuda técnica.

## 1. Ficha rápida del destripado

| Campo | Dato | Fuente |
|---|---|---|
| Qué es | Hub de publicación multi-red con API REST + MCP hospedado + web app de contenido IA | blotato.com |
| Eslogan propio | "One API and MCP server, 9 platforms" | blotato.com/social-media-api |
| Redes (9) | X, LinkedIn, Facebook (Páginas), Instagram, TikTok, YouTube, Threads, Bluesky, Pinterest | blotato.com |
| Grupos de FB | **No soportados** (solo Páginas; perfil personal = solo autorización) | help.blotato.com/platform-publishing/platforms/facebook.md |
| API REST | backend.blotato.com/v2, header `blotato-api-key`, en TODOS los planes pagos | social-media-api + help center |
| MCP hospedado | https://mcp.blotato.com/mcp, ~35 tools listadas una por una | blotato.com/mcp |
| Analytics | 8 redes; **LinkedIn sin métricas** (declarado) | social-media-api |
| Comentarios/DMs | Solo Instagram y Facebook; DM-automations acotadas a ventanas Meta (7 días comentario / 24h DM), "no cold outreach, by design" | social-media-api |
| Créditos IA | Solo cobran generación de imagen/vídeo; escribir, programar, publicar y llamar a la API no gastan créditos | blotato.com/pricing FAQ |
| Reputación | Trustpilot 4.8/384 · Capterra 4.8/128 · G2 4.6/121 · SourceForge 4.7/73 | blotato.com/reviews + trustpilot.com (06/11/2026) |
| Fundadora | Sabrina Ramonov (creció su propia audiencia: +3M seguidores, +500M views, según su sitio) | blotato.com |

## 2. Precios y límites verificados (blotato.com/pricing + help center llm/limits.md, 06/11/2026)

| Límite | Starter $29/mes | Creator $97/mes | Agency $499/mes |
|---|---|---|---|
| Cuentas sociales conectadas | 20 | 40 | 100 |
| Créditos IA (imagen/vídeo) | 1.250/mes | 5.000/mes | 28.000/mes |
| Contactos activos/mes (DMs+respuestas) | 1.000 | 6.000 | 15.000 |
| Peso máx. de subida | 400 MB | 1 GB | 1 GB |
| Posts en cola programados | 200 | 1.000 | 3.000 |
| Horizonte de programación | 9 meses | 9 meses | 9 meses |
| Campos de analítica | 25 | todos | todos |
| Checkpoints de analítica por post | 4 | 18 | 20 |
| Ventana de recogida analítica | 30 días | 30 días | 90 días |
| Procesado de vídeo | estándar | más rápido | dedicado |

- Sin plan gratuito; trial de 7 días con tarjeta. **El trial NO incluye API ni
  MCP**: "generating an API key ends the trial right away and starts your paid
  subscription". El gasto mínimo para operar agénticamente es $29/mes.
- Anual ≈ -17% (pagas 10 de 12). Reembolso por email dentro de 14 días.
- Contradicción menor registrada (mismo patrón que la de IG 100/50 en Meta):
  la subida legacy de media figura 30 req/min en la página del endpoint y
  10 req/min en la página openapi-reference del help center. No la
  adjudicamos; si algún día operamos contra su API, el techo conservador es
  el que manda (10/min).

## 3. Destripe módulo por módulo → ¿aplica a COMUNITI-MANAGER?

| Módulo Blotato | Qué hace (fuente) | ¿Nos sirve? | Por qué / cómo |
|---|---|---|---|
| Hub de publicación (POST /posts, platform = campo del request) | Un solo envelope con `targetType` por red; campos requeridos por red documentados en tabla | **SÍ (referencia de contrato)** | Es exactamente la forma del contrato `publish_post/schedule_post` que ya diseñamos para Postgale (POC_POSTGALE_VALIDATION.md). Confirma que el contrato interno con `network` como campo es el estándar de la industria |
| Techos propios por red (tabla publicada) | Caps propios más estrictos que la plataforma, con rationale anti-flag | **SÍ (P13)** | Nuestro motor familia E hoy bloquea browser-automation y exige HITL, pero NO tiene techos numéricos por red para el futuro posteo por API. Una tabla de techos propios parametrizada y auditada es el hueco real |
| Verificación de estado (get_post_status; "polling intervals rather than repeated status calls") | El 2xx de creación no demuestra publicación; hay endpoint de estado y guía de 429 con Retry-After | **SÍ (ya lo teníamos)** | El POC Postgale ya exigía `verify_publication` y normalización por objetivo (PUBLISHED/SCHEDULED/PENDING_APPROVAL/FAILED/UNKNOWN). Blotato valida el criterio desde el lado comercial |
| Calendario de slots recurrentes (/schedule/slots, useNextFreeSlot) | Slots semanales por plataforma y cuenta, consultables y ocupables por API (captura blotato-ui-calendario-slots.png) | Parcial | Nuestro P8 es calendario de campañas; el patrón "slot recurrente semanal por red" es complementario, útil cuando exista multi-red. No duplica nada hecho |
| Subida de media opcional (mediaUrls directos, /media legacy, presigned /media/uploads para locales) | Tres caminos: URL pública directa, subida por URL, presigned PUT para archivos locales (120 req/min) | **SÍ (patrón P12+)** | Nuestra biblioteca FbMedia acepta URL/ruta local del worker; el patrón presigned es el que falta para multi-red sin hosting intermedio. Anotado para el futuro proveedor |
| Analítica por post y top posts (8 redes) | Campos opcionales por red; LinkedIn sin métricas; checkpoints por post según plan | NO (ahora) | Para grupos no hay API de métricas (igual que Metricool). Cuando haya posteo multi-red por API, los campos opcionales son el modelo honesto a copiar |
| Comentarios y DMs (IG+FB) + DM-automations | Lectura/respuesta programática; automatizaciones por palabra clave dentro de ventanas Meta; "no cold outreach, by design" | NO | CRM-ALBRA + AGENTE-LEADS ya tienen dueño el inbox/lead; y para grupos es scrape (riesgo). El detalle respetable: la acotación a ventanas oficiales como límite de producto |
| Sources (URL → post) | YouTube/TikTok/X/artículo/PDF/audio/consulta Perplexity → contenido listo | NO | AGENTE-CHISMOSO + semilla ALBRA ya generan contenido; no duplicamos fábrica de contenido |
| Escritura IA ilimitada + templates virales + faceless video + voz | El stack de creación en una suscripción (créditos solo imagen/vídeo) | NO | AGENTE-KREA y YOUTUBE-AUTOMATION cubren creación; es su gancho comercial, no nuestro hueco |
| MCP hospedado (~35 tools, lista exacta, incl. get_credits) | El agente opera cuentas, posts, schedules, analítica, comentarios, DMs, diseños, sources y créditos | **SÍ (P11 v2)** | Confirma el patrón MCP-first de Metricool. Ideas extraíbles: exponer `get_credits`-equivalente (transparencia de consumo) y documentar tools una por una; nuestro puente P11 v1 ya expone lectura + createCampaign con HITL |
| Docs para LLM (llms.txt + páginas .md) | Todo el help center tiene espejo Markdown indexado en llms.txt | **SÍ (higiene barata)** | Nuestro puente agéntico puede exponer su propio llms.txt/.md con los contratos — esfuerzo bajo, valor agéntico alto |
| Web app (drafts → schedule N cuentas; Connect Account OAuth por red) | Capturas reales del usuario: drafts generados por IA que un humano agenda a varias cuentas a la vez; OAuth guiado por plataforma | Parcial | Su web app es asistida (humano agenda); su API es desatendida. Nuestro panel ya es asistido con HITL más estricto. Nada que copiar hoy |

## 4. Patrones extraíbles (extracto sala limpia, numerado)

1. **Platform-as-a-field**: un solo envelope REST/MCP con la red como parámetro;
   la app de desarrollador, la revisión y el refresh de tokens viven en el
   proveedor, no en el cliente.
2. **Techos propios publicados por debajo del máximo de cada red, con la razón
   escrita**: el anti-ban se vende como feature ("publicar al máximo por
   automatización marca la cuenta"), no se esconde.
3. **La subida de media es opcional y desacoplada**: URL directa, subida por
   URL o presigned PUT; publicar no exige haber subido antes.
4. **El calendario como primitiva de API**: slots recurrentes semanales por
   red/cuenta con "siguiente hueco libre" ocupable por el agente.
5. **El 2xx no es publicación**: endpoint de estado por post, polling con
   intervalos, Retry-After respetado; los 429 son "tu única telemetría real".
6. **Límites por ruta publicados abiertamente** (30/min crear, 60/min leer,
   120/min presigned) y separados explícitamente de los límites de suscripción,
   de créditos y de cada plataforma.
7. **Capacidad honesta por red**: matriz de qué red soporta qué (analytics sí/no,
   comentarios sí/no, LinkedIn sin métricas); los campos de respuesta son
   opcionales en lugar de mentir con ceros.
8. **Compliance como frontera de producto**: DM-automations solo dentro de
   ventanas oficiales Meta (7d/24h) y "no cold outreach" por diseño.
9. **Créditos solo en generación**: publicar y llamar a la API es gratis; el
   coste sigue al coste real (GPU), lo que hace el pricing explicable.
10. **Superficie agéntica documentada para agentes**: lista exacta de tools del
    MCP (~35), llms.txt y espejos .md de toda la documentación.

## 5. Overlap con el ecosistema ALBRA8 (re-auditado 06/11/2026)

- **Postgale sigue siendo el primario** (REFERENTES_20 §6, decisión vigente):
  contrato ya diseñado en POC_POSTGALE_VALIDATION.md con énfasis en
  idempotencia (clave derivada, no aleatoria) que en lo consultado Blotato no
  documenta de forma equivalente (sin verificación en contrario: no lo
  declaramos ausente, queda NO_VERIFICADO). Blotato entra como **candidata
  secundaria** del mismo tipo (SaaS cerrado API-first con MCP) para la
  horneada de proveedores cuando el usuario autorice gasto.
- Postiz (self-host AGPL) y PostLake MCP (pago por post) mantienen sus roles
  de alternativa y backup. Upload-Post (competidor directo de Blotato,
  $24/mes, 22 redes) solo se usó aquí para verificar límites de Blotato; su
  propia comparativa es parcial por interés.
- Ningún repo ALBRA8 hace lo del hub (sin cambios desde REFERENTES_20 §4).
  Lo que sí tiene dueño: fábrica de contenido (AGENTE-KREA/YOUTUBE-AUTOMATION),
  inbox/leads (CRM-ALBRA/AGENTE-LEADS/CHISMOSO), scheduling núcleo (semilla).
- Nuestro módulo FB-GROUPS sigue siendo el único del ecosistema (y de los 4
  hubs estudiados + Metricool) capaz de entrar a grupos de Facebook, porque no
  depende de API muerta sino de la sesión propia del usuario con HITL.

## 6. Qué NO hacemos y por qué (decisión sala limpia)

1. **No integramos Blotato como dependencia** — por $29-499/mes pondríamos los
   tokens de TODAS las redes de todas las marcas en custodia de una sola
   empresa (riesgo de concentración), con trial que excluye justo la API.
   Postgale mantiene la prioridad; Blotato queda en la horneada de proveedores.
2. **No adoptamos su postureo desatendido** — su modelo natural es el agente
   sin humano delante; el nuestro exige HITL pre-vuelo y motor de 6 estados.
   Es diferenciación deliberada, no retraso.
3. **No copiamos su fábrica de contenido IA** (templates virales, faceless
   video, voz, sources) — está cubierta por KREA/YOUTUBE-AUTOMATION/CHISMOSO
   y duplicaría lo que el principio rector prohíbe.
4. **No tomamos sus techos como fuente de verdad de políticas** — son su
   criterio comercial sobre docs ajenas. Nuestra familia E solo verifica
   contra fuentes oficiales (Meta/X/TikTok/YouTube/Telegram, ya sembradas);
   la tabla de Blotato sirve como referencia de calibración razonable y como
   mapa secundario de dónde están los docs oficiales.
5. **No reproducimos su base de posts virales ni sus templates** — scraping de
   terceros queda vetado por nuestras reglas.

## 7. Backlog propuesto a partir del destripe (qué incluir)

| # | Mejora | Valor | Esfuerzo | Dónde tocaría |
|---|---|---|---|---|
| P13 | **Techos propios multi-red parametrizados** en el motor familia E: tabla auditable de caps defensivos por red (≤ plataforma, valores verificados en fuentes oficiales; la tabla de Blotato como referencia de calibración), consultada por el motor en PERMITIDO_CON_CONDICIONES y visible en el simulador del panel | Alto (prepara el posteo API futuro) | Medio | `src/lib/meta-policy.ts` (tabla + checks) + semilla de datos + UI simulador |
| P14 | **Endurecer el POC Postgale** con los patrones del destripe: polling con intervalos y Retry-After, normalización de estados por objetivo (ya estaba), campos opcionales por red, y criterio explícito de techos propios antes de cualquier envío real | Medio | Bajo | `docs/research/POC_POSTGALE_VALIDATION.md` (criterios) |
| P15 | **Decisión de horneada de proveedores**: cuando el usuario autorice gasto, probar Postgale vs Blotato vs PostLake con el MISMO harness del POC (solo lectura de cuentas primero, publicar a cuenta propia de prueba después, con aprobación humana) | Alto (desbloquea multi-red) | Bajo-Medio | Ejecución del POC existente; sin código nuevo |
| P11 v2 | **MCP/skill agéntico completo**: exponer llms.txt/.md propio, tool de consumo/cuota (equivalente get_credits) y tools una-por-una documentadas | Medio-Alto (agéntico) | Medio | skills + rutas API de lectura |
| — | Slots recurrentes semanales por red | Bajo (sin multi-red activa) | — | Descartado hasta que exista posteo API multi-red |
| — | Fábrica de contenido IA / templates / faceless video | — | — | Descartado: cubierto por KREA/YOUTUBE-AUTOMATION |

Orden sugerido: **P13 → P14 → (esperar decisión de gasto) P15 → P11 v2**. P13 es
el único que amplía el motor con algo que la familia E dejó sembrado pero sin
números; P14 y P15 reutilizan lo que ya existe y solo esperan autorización del
operador; P11 v2 madura cuando el chaleco lo demande.

Fuentes: blotato.com · blotato.com/pricing · blotato.com/social-media-api ·
blotato.com/mcp · blotato.com/reviews · help.blotato.com (llms.txt,
api-and-mcp-concepts/rate-limits, start-with-an-ai-agent/llm/limits,
platform-publishing/platforms/facebook, rest-api-reference/upload-media) ·
blog de ingeniería de Blotato (social-media-api-rate-limits, que cita docs
oficiales de Meta/X/Bluesky/Pinterest/TikTok) · trustpilot.com/review/blotato.com
(06/11/2026) · upload-post.com/blotato-alternative (competidor, solo
verificación cruzada de límites) · 4 capturas del web app aportadas por el
usuario (docs/capturas/blotato-ui-*.png). Consultado 2026-11-06.
