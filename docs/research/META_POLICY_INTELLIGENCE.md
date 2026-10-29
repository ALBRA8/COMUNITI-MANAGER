# META POLICY INTELLIGENCE — Diseño e implementación (mandato del 30/10/2026)

Centro de Inteligencia y Cumplimiento de Meta para COMUNITI-MANAGER: vigilancia
permanente de políticas, versionado inmutable, motor de autorización central y
apagado de emergencia. Regla rectora del mandato: **que una acción sea
técnicamente posible no significa que Meta la autorice**; la ausencia de
información nunca se interpreta como permiso.

## 1. Auditoría previa (dónde encaja sin duplicar)

- El arnés ya tenía: auditoría append-only (`AuditEntry`), registro de errores
  (`ErrorLog`), pausa global, settings (`Setting`), gate HITL de P2 en
  FB-GROUPS y bucle del scheduler singleton (`scheduler.ts` + `instrumentation.ts`).
- El motor se integra en los puntos de decisión reales, no como pantalla
  informativa: creación/aprobación de campañas, claims de jobs y unions del
  worker, puente agéntico de lectura y bucle de vigilancia.

## 2. Modelos (`prisma/schema.prisma`)

| Modelo | Rol |
|---|---|
| `MetaPolicySource` | 26 fuentes oficiales: key estable, URL, producto, familia (A Meta general / B desarrolladores / C WhatsApp / D Colombia), prioridad DAILY/WEEKLY/MANUAL, intervalo, estado de última verificación, fallos consecutivos |
| `MetaPolicyVersion` | Historial inmutable v1..n por fuente: hash SHA-256 del texto normalizado + extracto (4000 chars) |
| `MetaPolicyCheckRun` | Cada consulta con evidencia: URL, instante, método, HTTP, duración, hash previo/nuevo, error |
| `MetaPolicyChange` | Cambios: NEW / MODIFIED / INACCESSIBLE / RECOVERED con severidad, resumen determinista, impacto (marcado como interpretación), módulos afectados, recomendación, revisión humana |
| `MetaPolicyIncident` | SOURCE_FAILURE, POLICY_BLOCK (solo CRÍTICO), EMERGENCY_STOP, MANUAL |

## 3. Motor de autorización (`src/lib/meta-policy.ts` → `authorize()`)

Estados (el peor gana): `PERMITIDO` · `PERMITIDO_CON_CONDICIONES` ·
`REQUIERE_APROBACION` · `NO_VERIFICADO` · `BLOQUEADO` · `POLITICA_DESACTUALIZADA`.

Orden de evaluación:
1. Motor deshabilitado (apagado de emergencia) → BLOQUEADO.
2. Kill switch con razón → BLOQUEADO.
3. Lista central de exclusión (`meta_policy_exclusions`) → BLOQUEADO si el objetivo coincide.
4. Cambios CRÍTICOS abiertos en fuentes del producto → BLOQUEADO hasta análisis humano.
5. Frescura: fuentes del producto sin verificación OK en `meta_policy_stale_days` (14 por defecto) → POLITICA_DESACTUALIZADA en operaciones de alto riesgo; NO_VERIFICADO en lecturas.
6. HITL: publicar/unir en grupos exige aprobación humana explícita → REQUIERE_APROBACION sin ella.
7. Escritura Meta nunca devuelve PERMITIDO puro: siempre con condiciones estándar (warmup, techos, sin evasión, parada ante señales, auditoría).

Cada decisión se audita (`META_POLICY_CHECK`); el panel tiene simulador
(`test-authorize`, silencioso, sin auditoría).

## 4. Anti-evasión (§5.1 del mandato)

- Prohibido por diseño: simular actividad humana, ocultar automatización,
  evadir sistemas de detección, cuentas alternativas, manipular interacciones.
- Las reglas viven en **código del motor**; no hay endpoint agéntico que las
  modifique (el puente P11 es GET-only; el test 14 lo verifica).
- La consulta de fuentes públicas usa UA estándar de lectura (documentado en
  el código): es lectura de documentos públicos, no interacción con sistemas
  anti-abuso. Si una fuente rechaza, se registra BLOCKED/FAILED y se acude a la
  **revisión manual registrada** (nota ≥10 caracteres, auditada).
- Páginas rotativas (fechas/contadores/selectores que cambian en cada fetch):
  la comparación por «forma del texto» (sin cifras ni puntuación) degrada esos
  casos a MEDIO con aviso de probable falso positivo; una edición real de
  política mantiene su severidad.

## 5. Integración (FASE 5)

| Punto | Comportamiento |
|---|---|
| `POST /api/fb-campaigns` | authorize FB_GROUP_POST antes de crear: BLOQUEADO/DESACTUALIZADA → 403; REQUIERE_APROBACION/NO_VERIFICADO → nace borrador aunque el script pida aprobar |
| `PATCH /api/fb-campaigns` (approve) | authorize FB_CAMPAIGN_APPROVAL: la aprobación humana satisface el HITL pero no anula bloqueos activos → 403 si BLOQUEADO/DESACTUALIZADA |
| `claimJobsForWorker` / `claimJoinTaskForWorker` | policyHold al inicio: POLICY_HOLD sin entregas (última línea de defensa pre-vuelo) |
| `GET /api/fb-agent/fb-groups` | expone `policy` (overall, razones, killswitch, frescura) para que el AGENTE-GENERAL la consulte; solo lectura |
| `startSchedulerLoop` | policyWatchTick con throttle de 30 min: consulta fuentes vencidas; el fallo del vigilante va a ErrorLog |

## 6. Panel (Gobierno → Centro de Cumplimiento Meta)

Semáforo general + KPIs (verificadas / no verificables / nunca verificadas /
cambios abiertos por severidad / incidentes / operaciones bloqueadas hoy) +
filtros por producto (12) + pestañas: Fuentes (verificar ahora / revisión
manual), Cambios (analizar / aceptar / descartar con nota), Informes
(diario/semanal/mensual con hechos verificados / interpretación / recomendación
e imprimibles), Decisiones e incidentes, Exclusiones y simulador.

## 7. Pruebas (FASE 8) — `scripts/test-meta-policy.cjs`

41 asertos cubren los 14 casos obligatorios: política nueva, modificada (real y
solo-cosmética), fuente inaccesible (con dedupe de cambio e incidente),
desactualización, comparación de versiones, clasificación determinista,
bloqueo de operaciones, HITL, consulta por las Manos (traza META_POLICY_CHECK),
consulta por FB-GROUPS (claims retenidos), conservación del historial,
apagado de emergencia (con reactivación exigida y auditada), errores y
duplicados, e imposibilidad de desactivar restricciones desde un agente.

Resultados de la corrida completa: motor **41/41** · regresiones: P2 26/26 ·
P1 media 11/11 · P6 joins 24/24 · P7 mejoras 25/25 · P8-P12 24/24 · besttime
10/10. Lint limpio. Panel verificado en navegador (navegación, pestañas,
informes, sin errores de consola).

## 8. Limitaciones honestas

- La consulta automatizada verifica cambios de contenido (hash); **no**
  interpreta el sentido jurídico de un cambio: eso es análisis humano
  obligatorio (la IA no aplica cambios de reglas por su cuenta).
- 4 fuentes colombianas eran inalcanzables desde el sandbox en la primera
  ronda; quedan como fallo real y requieren revisión manual del administrador
  desde su navegador.
- La consola de apps de desarrolladores exige sesión: método MANUAL.
- La vigilancia automática corre en el bucle del panel (throttle 30 min); en
  despliegue permanente conviene dispararla con cron externo además del bucle
  interno.
- El contenido consultado se trata como dato no confiable: se guardan hash y
  extracto, nunca se ejecuta ni se interpreta como instrucciones.
