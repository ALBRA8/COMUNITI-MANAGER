# Social Autopilot AI — FICHA DE ESPECIFICACIÓN (método sala limpia)

> ClonaKit · Proyecto: `COMUNITI-MANAGER` (Social Autopilot AI) · Fecha: 2026-10-27
> Esta ficha es la única fuente usada para construir `app/`. La investigación
> (referentes externos + repos ALBRA8) vive en `docs/` y
> NO se consulta durante la construcción.

## 1. Qué construimos

Un **arnés (harness) de community management con IA**, en español, que VISTE al
agente base **AGENTE-GENERAL (ALBRA Seed)** y coordina a los agentes ya
existentes del ecosistema ALBRA8. El arnés NO reemplaza a ningún agente: es el
chaleco que decide, planifica, crea, valida, aprueba, publica, mide y aprende —
delegando la ejecución especializada a quien ya sabe hacerla.

**Metáfora del producto**: el agente es el músculo; el arnés es el chaleco con
los controles. Sin chaleco, el músculo no sabe qué hacer hoy, ni cuándo, ni con
qué límites, ni cómo se midió.

## 2. Principio rector: no duplicar

Funciones que OTROS agentes del ecosistema ya hacen y que este arnés NO
reimplementa (solo orquesta y muestra estado):

| Función | La hace | Cómo se conecta |
|---|---|---|
| Escucha social, tendencias, oportunidades | AGENTE-CHISMOSO | Mesh de eventos `/api/mesh/events` |
| Prospección B2B, verificación, outreach 1:1 | AGENTE-LEADS | Webhooks `lead.*` + REST |
| Conversación entrante, inbox, auto-respuesta con handoff | CRM-ALBRA | `/api/crm/actions` + MCP 16 tools |
| Difusión masiva WhatsApp anti-ban | WHATSPOWER-ULTRA | REST :3004 |
| Generación de imágenes/texto/voz/ebooks | AGENTE-KREA | REST `/api/generate/*` |
| Vídeo largo→clips, TTS, subtítulos, YouTube | YOUTUBE-AUTOMATION | MCP 25 tools + A2A |
| Investigación de nichos y planes YouTube | NEX-SCOPE | MCP 12 tools |

Huecos REALES que el arnés SÍ construye (nada del ecosistema los cubre):

1. **Calendario editorial multi-marca** con dependencias y recurrentes.
2. **Redacción con memoria de marca** (identidad, tono, vocabulario, prohibidos, FAQs, precios autorizados) por marca aislada.
3. **Adaptación multirred** de un mismo contenido a formatos nativos (IG, FB, TikTok, X, LinkedIn, YouTube).
4. **Gestión de comentarios públicos**: clasificación (FAQ, lead, soporte, crisis, spam…), respuesta autorizada, moderación, derivación humana.
5. **Analítica unificada cross-red** con evidencia y recomendaciones.
6. **Registro central de herramientas** con contratos normalizados y estado honesto (conectado / pendiente de credenciales / no disponible).
7. **Orquestador del ciclo autónomo**: INVESTIGAR→ANALIZAR→PLANIFICAR→CREAR→VALIDAR→APROBAR→PUBLICAR→VERIFICAR→INTERACTUAR→MEDIR→APRENDER→OPTIMIZAR.
8. **Gobierno**: 3 modos de autonomía (asistido/supervisado/autónomo con límites), pausa global, auditoría, idempotencia.
9. **Panel web en español** (18 secciones del PRD).

## 3. Usuarios y pantalla

- Un operador (dueño de marca o community manager) que habla español.
- Panel responsive, oscuro-profesional, tipografía limpia, sin emojis en la UI.
- Estados de tarea visibles: Pendiente / En ejecución / Esperando aprobación / Completada / Fallida / Cancelada.
- Diferenciación SIEMPRE entre: verificado / estimado / pendiente de credenciales.

## 4. Módulos funcionales del panel

1. Resumen ejecutivo (KPIs, próxima publicación, alertas, estado del ciclo).
2. Marcas y cuentas conectadas (por marca: nombre, redes, estado).
3. Calendario editorial (vista mes/semana, crear/drag states).
4. Bandeja de comentarios y mensajes (clasificación automática, responder/derivar).
5. Cola de aprobaciones (aprobar/rechazar con motivo, registro).
6. Centro de creación (borradores, adaptación multirred, previsualización por red).
7. Biblioteca multimedia (assets con fuente y licencia).
8. Investigación de mercado (peticiones al investigador; evidencias con fuente).
9. Análisis de competidores (informes comparativos con fuentes).
10. Analítica (métricas por red/post, tendencias, recomendaciones).
11. Agentes (estado de cada agente del ecosistema: semilla ALBRA + 6 agentes + conectores).
12. Herramientas e integraciones (registro de herramientas, contratos, estado, permisos).
13. Automatizaciones (reglas trigger→acción, programaciones).
14. Memoria de marca (identidad, tono, FAQs, precios autorizados, prohibidos, ejemplos aprobados).
15. Historial de ejecución (trazas del orquestador paso a paso).
16. Registro de errores (errores con recuperación sugerida).
17. Costes y límites (presupuesto por marca, límites de frecuencia).
18. Configuración de seguridad (modo de autonomía, pausa global, reglas de firewall).

## 5. Motor del arnés (reglas duras)

- **Orquestador central** con plan→tareas→subtareas; cada tarea tiene estado persistente y trazabilidad.
- **14 agentes especializados internos** (estrategia, investigación, tendencias, planificación editorial, redacción, dirección creativa, adaptación, publicación, community manager, moderación, captación, analista, optimizador, supervisor) — cada uno con responsabilidad, herramientas autorizadas, límites y criterio de finalización. NO son cáscaras: cada uno ejecuta lógica real y distinta.
- **Registro de herramientas** consultado antes de usar cualquier herramienta; si una capacidad no está disponible, la tarea falla con estado claro, nunca se simula éxito.
- **Idempotencia**: clave de idempotencia por publicación; nunca duplicar una publicación — comprobar antes de reintentar.
- **Aprobaciones HITL**: publicar/responder/moderar requiere aprobación según modo de autonomía; se registra quién, cuándo y qué versión.
- **Pausa global**: detiene acciones externas nuevas; tareas pendientes quedan EN PAUSA de forma segura.
- **Memoria persistente** en base de datos: sobrevive a reinicios, trabajos interrumpidos se retoman.
- **Aislamiento por marca**: los datos de una marca nunca se mezclan con otra.
- **Sin secretos en código**: todo por variables de entorno; sin credenciales → estado "pendiente de credenciales" y funciones degradadas honestamente.

## 6. Contratos internos de herramientas (normalizados)

`get_capabilities, get_connection_status, list_accounts, fetch_metrics, fetch_comments, fetch_messages, research_topic, analyze_competitor, create_content_draft, generate_creative_brief, validate_content, request_approval, schedule_post, publish_post, verify_publication, reply_to_comment, reply_to_message, moderate_item, create_lead, record_experiment, generate_performance_report`

Cada adaptador traduce estos contratos a la API real del proveedor. Si el
proveedor no soporta un contrato → `CAPACITY_UNAVAILABLE`.

## 7. Proveedores de publicación (elección)

- **Primario**: Postgale (REST `/api/v1` + idempotencia `x-request-id`, cubre IG/FB/Threads/TikTok/WhatsApp/Telegram/Discord/Bluesky/Mastodon).
- **Alternativa self-host**: Postiz (AGPL-3.0; API pública + MCP). Se usa SOLO como instancia externa propia; nunca se copia su código.
- **Alternativa agentic**: PostLake MCP (pago por publicación).
- El adaptador es intercambiable: cambiar de proveedor no reescribe el orquestador.
- Sin credenciales: el ciclo llega hasta APROBADO con estado "publicación pendiente de conector".

## 8. Investigación

- **ScrapeCreators** (créditos, MCP/skill oficial) como fuente de evidencia social pública; se guardan URL, fecha y payload de cada evidencia.
- **AGENTE-CHISMOSO** como radar interno de oportunidades (si está conectado).
- Prohibido inventar datos: si no hay fuente, la investigación queda "sin evidencia".

## 9. Stack técnico

- Next.js 16 + TypeScript + Tailwind 4 + Prisma/SQLite (patrón del ecosistema ALBRA).
- Sin backend Python en el panel: la semilla AGENTE-GENERAL se opera por REST (`/api/v1/health`, `/api/v1/readiness`, ejecuciones) cuando esté desplegada; si no, el arnés funciona degradado con su motor propio.
- Zod para validación de contratos. Sin dependencias de pago en el núcleo.

## 10. Fuera de alcance (explícito)

- No reimplementar escucha social, CRM, mensajería entrante, difusión masiva, generación de imagen/vídeo, ni prospección.
- No copiar código, textos ni marcas de los 20 referentes (sala limpia).
- No publicar nada real sin conector configurado + aprobación según modo.
- No enviar mensajes masivos no solicitados ni inventar precios/políticas.

## 11. META POLICY INTELLIGENCE — Centro de Cumplimiento Meta

- **Capacidad central, no opcional**: toda operación relacionada con Meta consulta el motor de autorización antes de ejecutarse. Que una acción sea técnicamente posible no significa que Meta la autorice; la ausencia de información nunca es permiso.
- **Fuentes oficiales vigiladas (26)**: políticas generales y contenido de Meta, desarrolladores/APIs, WhatsApp Business y legislación colombiana (Ley 1581/2012, Ley 1480/2011, SIC, DNDA, DIAN). Registro con URL oficial, producto, familia y frecuencia (24 h / semanal / revisión manual).
- **Consulta honesta con evidencia**: cada consulta registra URL, instante, método y hash SHA-256 del texto normalizado. Si una fuente no responde o bloquea, se registra el fallo (nunca se simula una verificación) y existe el procedimiento alternativo: revisión humana desde el navegador, registrada con nota obligatoria y auditada.
- **Versionado inmutable**: cada captura es una versión nueva (v1, v2, …) con hash y extracto; nunca se sobrescribe la anterior. Los cambios (nuevo, modificado, inaccesible, recuperado) se clasifican de forma determinista (CRÍTICO / ALTO / MEDIO / BAJO). Un cambio que solo afecta cifras/fechas o contenido dinámico se degrada a MEDIO como probable falso positivo de página rotativa.
- **Motor de autorización (6 estados)**: PERMITIDO, PERMITIDO_CON_CONDICIONES, REQUIERE_APROBACION, NO_VERIFICADO, BLOQUEADO, POLITICA_DESACTUALIZADA. El peor veredicto gana. Cambios CRÍTICOS sin analizar bloquean las operaciones del producto afectado; documentación sin verificación reciente (14 días por defecto) retiene operaciones de alto riesgo; la lista central de exclusión veta objetivos (bajas respetadas en todos los módulos).
- **Anti-evasión explícito**: prohibido diseñar funciones para simular actividad humana, ocultar automatización o eludir controles de Meta. Las reglas del motor viven en código, no son modificables por agentes y no existe endpoint agéntico de desactivación (el puente P11 es de solo lectura).
- **HITL reforzado**: la publicación/unión automatizada exige siempre aprobación humana pre-vuelo (gate P2 de FB-GROUPS); el motor además puede forzar borrador si las condiciones lo exigen.
- **Apagado de emergencia**: la parada (con razón obligatoria) bloquea toda operación Meta y queda como incidente CRÍTICO; solo un humano la levanta, con nota auditada.
- **Panel (Gobierno → Centro de Cumplimiento Meta)**: semáforo general, KPIs, filtros por producto, fuentes con evidencia y revisión manual, análisis humano de cambios, informes diario/semanal/mensual que distinguen hechos verificados / interpretación técnica / recomendación preventiva, historial de decisiones e incidentes, simulador del motor.
- **Vigilancia programada**: bucle interno con throttle de 30 min consulta las fuentes vencidas; fallo del vigilante se registra en ErrorLog, nunca en silencio.
- **Base documental inicial**: el informe del administrador (fecha de referencia 08/10/2026) se incorpora como base de investigación en `docs/policy/BASE_DOCUMENTAL_INICIAL.md`, no como vigencia confirmada; cada afirmación relevante se verifica contra la fuente oficial correspondiente.
