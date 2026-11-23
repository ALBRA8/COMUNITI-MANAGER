# COMUNITI-MANAGER — FICHA DE ESPECIFICACIÓN (método sala limpia)

> ClonaKit · Proyecto: `COMUNITI-MANAGER` · Fecha de vigencia: 2026-11-21
> Esta ficha es la única fuente usada para construir `app/`. La investigación
> (referentes externos + repos ALBRA8) vive en `docs/` y
> NO se consulta durante la construcción.

## 1. Qué construimos

Un **agente independiente de redes sociales**, en español, con UNA especialidad:
**publicar contenido y administrar múltiples cuentas sin que las cuentas sean
baneadas**. No es un módulo ni un "agente" de otro agente: es un agente completo
y autónomo que decide, planifica, crea, valida, aprueba, publica, verifica,
interactúa, mide y aprende con sus propios canales y su propio motor.

**Ecosistema**: COMUNITI-MANAGER convive con otros agentes independientes
(CRM-ALBRA, AGENTE-CHISMOSO, AGENTE-LEADS, AGENTE-KREA, YOUTUBE-AUTOMATION,
NEX-SCOPE, WHATSPOWER-ULTRA). Cada agente tiene SU tarea; son mundos aparte. La
integración con ellos es OPCIONAL, vía malla de webhooks firmados, y solo se
consume si el operador la activa. **Nada del ecosistema es requisito para
publicar.**

## 2. Principio rector: canales propios + integración opcional

Canales de publicación PROPIOS del agente (funcionan sin depender de nadie):

| Canal | Vía | Estado real |
|---|---|---|
| Telegram (canales y grupos) | Bot API oficial: `sendMessage`/`sendPhoto`, límites oficiales verificados (TELEGRAM_POST), HITL e idempotencia | Ejecutor real |
| WhatsApp (sesión propia) | Conector propio del agente (`scripts/whatsapp-daemon.cjs`): sesión QR por protocolo WhatsApp Web, sin navegador; cola, pausa global, techos y entrega firmada HMAC | Ejecutor real |
| Grupos de Facebook | Worker propio con Chrome real y sesión del usuario (la API de grupos de Meta fue eliminada el 22/04/2024); HITL, warmup y techos | Ejecutor real |
| Instagram / Facebook (Páginas) y demás redes | Vía API multirred: Postgale (SaaS), Postiz self-host (AGPL-3.0) o PostLake MCP | Requiere credenciales del proveedor |
| Escucha social pública | ScrapeCreators (evidencia con URL, fecha y payload) | Requiere credenciales |

Integraciones OPCIONALES con OTROS agentes (mundo aparte; consumo firmado y
manual, sin duplicación de capacidades cuando el operador las conecta):

| Función | Agente externo | Cómo se conecta |
|---|---|---|
| Escucha social, tendencias, oportunidades | AGENTE-CHISMOSO | Mesh de eventos `/api/mesh/events` |
| Prospección B2B, verificación, outreach 1:1 | AGENTE-LEADS | Webhooks `lead.*` + REST |
| Conversación entrante, inbox, handoff humano | CRM-ALBRA | `/api/crm/actions` + MCP |
| Difusión masiva WhatsApp | WHATSPOWER-ULTRA | REST (mundo CRM-ALBRA) |
| Generación de imágenes/texto/voz/ebooks | AGENTE-KREA | REST `/api/generate/*` |
| Vídeo largo→clips, TTS, YouTube | YOUTUBE-AUTOMATION | MCP + A2A |
| Investigación de nichos YouTube | NEX-SCOPE | MCP |
| Semilla universal (opcional) | ALBRA Seed (la semilla) | REST `/api/v1/health` |

Lo que el agente SÍ construye de su propio capitale (nadie más lo cubre para su
misión):

1. **Canales propios** (tabla anterior) con ejecución, techos y evidencia reales.
2. **Calendario editorial multi-marca** con recurrentes y programaciones.
3. **Redacción con memoria de marca** (identidad, tono, vocabulario, prohibidos,
   FAQs, precios autorizados) por marca aislada.
4. **Adaptación multirred** de un mismo contenido a formatos nativos.
5. **Gestión de comentarios y mensajes** con clasificación y derivación humana.
6. **Analítica unificada** con evidencia y recomendaciones.
7. **Registro central de herramientas** con contratos normalizados y estado
   honesto (CONNECTED / AWAITING_CREDENTIALS / no disponible — nunca se simula).
8. **Orquestador del ciclo autónomo**: INVESTIGAR→ANALIZAR→PLANIFICAR→CREAR→
   VALIDAR→APROBAR→PUBLICAR→VERIFICAR→INTERACTUAR→MEDIR→APRENDER→OPTIMIZAR.
9. **Gobierno**: 3 modos de autonomía, pausa global, auditoría append-only,
   idempotencia.
10. **Meta Policy Intelligence** (Centro de Cumplimiento Meta, §11).
11. **Panel web en español** con 14 secciones por misión.

## 3. Usuarios y pantalla

- Un operador (dueño de marca o community manager) que habla español.
- Panel responsive, oscuro-profesional, tipografía limpia, sin emojis en la UI.
- Estados de tarea visibles: Pendiente / En ejecución / Esperando aprobación / Completada / Fallida / Cancelada.
- Diferenciación SIEMPRE entre: verificado / estimado / pendiente de credenciales.

## 4. Módulos del panel (nav vigente, 14 secciones en 5 grupos)

**Panel**: 1. Resumen ejecutivo (KPIs, ciclo, alertas) · 2. Marcas y cuentas ·
3. Calendario editorial.
**Canales**: 4. Canales (Telegram, WhatsApp, FB-GROUPS, IG/FB — estado real por
canal y pasos de conexión) · 5. Grupos de Facebook (módulo dedicado).
**Contenido**: 6. Centro de creación (borradores, adaptación, multimedia) ·
7. Cola de aprobaciones · 8. Comentarios y mensajes · 9. Investigación.
**Operación**: 10. Automatizaciones (programaciones y reglas) · 11. Analítica.
**Sistema**: 12. Centro de Cumplimiento Meta · 13. Ajustes e integraciones ·
14. Historial y errores.

## 5. Motor del agente (reglas duras)

- **Orquestador central** con plan→tareas→subtareas; cada tarea tiene estado persistente y trazabilidad.
- **Agentes internos especializados** (estrategia, investigación, tendencias, planificación editorial, redacción, dirección creativa, adaptación, publicación, community manager, moderación, captación, analista, optimizador, supervisor) — cada uno con responsabilidad, herramientas autorizadas, límites y criterio de finalización.
- **Registro de herramientas** consultado antes de usar cualquier herramienta; si una capacidad no está disponible, la tarea falla con estado claro, nunca se simula éxito.
- **Idempotencia**: clave de idempotencia por publicación; nunca duplicar una publicación — comprobar antes de reintentar.
- **Aprobaciones HITL**: publicar/responder/moderar requiere aprobación según modo de autonomía; se registra quién, cuándo y qué versión.
- **Techos por red (NETWORK_CAPS)**: fijos en código, con límite oficial verificado distinguido del techo propio defensivo; aplicados a todo envío.
- **Pausa global**: detiene acciones externas nuevas; tareas pendientes quedan EN PAUSA de forma segura.
- **Memoria persistente** en base de datos: sobrevive a reinicios, trabajos interrumpidos se retoman.
- **Aislamiento por marca**: los datos de una marca nunca se mezclan con otra.
- **Sin secretos en código**: todo por variables de entorno; sin credenciales → estado "pendiente de credenciales" con la variable exacta que falta, y funciones degradadas honestamente.

## 6. Contratos internos de herramientas (normalizados)

`get_capabilities, get_connection_status, list_accounts, fetch_metrics, fetch_comments, fetch_messages, research_topic, analyze_competitor, create_content_draft, generate_creative_brief, validate_content, request_approval, schedule_post, publish_post, verify_publication, reply_to_comment, reply_to_message, moderate_item, create_lead, record_experiment, generate_performance_report`

Cada adaptador traduce estos contratos a la API real del proveedor. Si el
proveedor no soporta un contrato → `CAPACITY_UNAVAILABLE`. **Todo contrato
declarado en el registro tiene ejecutor real o se retira del registro y de la
UI** (sin contratos decorativos).

## 7. Proveedores de publicación (vías API multirred)

- **Postgale** (REST `/api/v1` + idempotencia `x-request-id`) y **Postiz**
  (self-host, AGPL-3.0; solo instancia propia por API, nunca se copia su código)
  y **PostLake MCP** (pago por publicación): rutas verificadas contra la
  documentación oficial de cada proveedor en `src/lib/executor.ts` (ROUTES); lo
  que no esté verificado queda `CAPACITY_UNAVAILABLE` con la razón explícita.
- El adaptador es intercambiable: cambiar de proveedor no reescribe el orquestador.
- Sin credenciales: el ciclo llega hasta APROBADO con estado "publicación
  pendiente de conector".

## 8. Investigación

- **ScrapeCreators** (créditos, MCP/skill oficial) como fuente de evidencia social pública; se guardan URL, fecha y payload de cada evidencia.
- Prohibido inventar datos: si no hay fuente, la investigación queda "sin evidencia".

## 9. Stack técnico

- Next.js 16 + TypeScript strict + Tailwind 4 + Prisma 6/SQLite.
- Un solo gestor de paquetes (npm, con `package-lock.json`); runtime Node ≥ 20.
- Sin backend Python en el panel: la semilla ALBRA (OPCIONAL, mundo aparte) se
  opera por REST cuando esté desplegada; sin ella el agente funciona completo
  con su motor propio.
- Zod para validación de contratos. Sin dependencias de pago en el núcleo.

## 10. Fuera de alcance (explícito)

- No reimplementar escucha social interna, CRM, prospección, difusión masiva ni
  generación de imagen/vídeo (mundo aparte: otros agentes; integración opcional).
- No copiar código, textos ni marcas de los referentes (sala limpia).
- No publicar nada real sin conector configurado + aprobación según modo.
- No enviar mensajes masivos no solicitados ni inventar precios/políticas.

## 11. META POLICY INTELLIGENCE — Centro de Cumplimiento Meta

- **Capacidad central, no opcional**: toda operación relacionada con Meta consulta el motor de autorización antes de ejecutarse. Que una acción sea técnicamente posible no significa que Meta la autorice; la ausencia de información nunca es permiso.
- **Fuentes oficiales vigiladas (26)**: políticas generales y contenido de Meta, desarrolladores/APIs, WhatsApp Business y legislación colombiana (Ley 1581/2012, Ley 1480/2011, SIC, DNDA, DIAN). Registro con URL oficial, producto, familia y frecuencia (24 h / semanal / revisión manual).
- **Consulta honesta con evidencia**: cada consulta registra URL, instante, método y hash SHA-256 del texto normalizado. Si una fuente no responde o bloquea, se registra el fallo (nunca se simula una verificación) y existe el procedimiento alternativo: revisión humana desde el navegador, registrada con nota obligatoria y auditada.
- **Versionado inmutable**: cada captura es una versión nueva (v1, v2, …) con hash y extracto; nunca se sobrescribe la anterior. Los cambios (nuevo, modificado, inaccesible, recuperado) se clasifican de forma determinista (CRÍTICO / ALTO / MEDIO / BAJO). Un cambio que solo afecta cifras/fechas o contenido dinámico se degrada a MEDIO como probable falso positivo de página rotativa.
- **Motor de autorización (6 estados)**: PERMITIDO, PERMITIDO_CON_CONDICIONES, REQUIERE_APROBACION, NO_VERIFICADO, BLOQUEADO, POLITICA_DESACTUALIZADA. El peor veredicto gana. Cambios CRÍTICOS sin analizar bloquean las operaciones del producto afectado; documentación sin verificación reciente (14 días por defecto) retiene operaciones de alto riesgo; la lista central de exclusión veta objetivos (bajas respetadas en todos los módulos).
- **Anti-evasión explícito**: prohibido diseñar funciones para simular actividad humana, ocultar automatización o eludir controles de Meta. Las reglas del motor viven en código, no son modificables por agentes y no existe endpoint agéntico de desactivación (el puente agéntico es de solo lectura).
- **HITL reforzado**: la publicación/unión automatizada exige siempre aprobación humana pre-vuelo (gate P2 de FB-GROUPS); el motor además puede forzar borrador si las condiciones lo exigen.
- **Apagado de emergencia**: la parada (con razón obligatoria) bloquea toda operación Meta y queda como incidente CRÍTICO; solo un humano la levanta, con nota auditada.
- **Panel (Sistema → Centro de Cumplimiento Meta)**: semáforo general, KPIs, filtros por producto, fuentes con evidencia y revisión manual, análisis humano de cambios, informes diario/semanal/mensual que distinguen hechos verificados / interpretación técnica / recomendación preventiva, historial de decisiones e incidentes, simulador del motor.
- **Vigilancia programada**: bucle interno con throttle de 30 min consulta las fuentes vencidas; fallo del vigilante se registra en ErrorLog, nunca en silencio.
- **Base documental inicial**: el informe del administrador (fecha de referencia 08/10/2026) se incorpora como base de investigación en `docs/policy/BASE_DOCUMENTAL_INICIAL.md`, no como vigencia confirmada; cada afirmación relevante se verifica contra la fuente oficial correspondiente.
