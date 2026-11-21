# AUDIT REPORT — Misión de auditoría integral, corrección autónoma y preparación para producción

Proyecto: COMUNITI-MANAGER (agente independiente de redes sociales: publicación multi-canal + Meta Policy Intelligence)
Entregable canónico: este repositorio (app/ + scripts/ + modulo-fb-groups/). Estado final de la misión de auditoría: commit 8f5d5cd (main = origin/main). Estado actual del repo: ver §"Fase de cierre" al final (revalidación 2026-11-21 con números reales).
Fecha: 2026-11-06 (auditoría) · Revalidación: 2026-11-21 (sesión de cierre). Método: 5 auditores independientes por ciclo, consolidación verificada, corrección de causa raíz, re-auditoría desde cero hasta 2 pasadas limpias consecutivas.

## 1. Estado inicial

- Rama `main`, árbol limpio, HEAD 3b830dd sincronizado con GitHub (fase 1).
- Regresión previa certificada en 194/194; build y lint limpios; sin CI, sin Docker, sin README de despliegue; la DB del standalone era inaccesible (deploy roto no detectado); 115 hallazgos crudos tras la primera ronda de 5 auditores (6 críticos, 18 altos).

## 2. Cambios encontrados en el repositorio

Árbol limpio y sincronizado al inicio; durante la misión el workspace de desarrollo (árbol hermano, no canónico) se mantuvo espejado al clon antes de cada commit. Sin force push, sin descartes, sin reescrituras.

## 3. Auditores y ciclos

| Ciclo | Auditores | Resultado | Acción |
|---|---|---|---|
| 1 | 5 (arquitectura, seguridad, UX, BD/API, DevOps) | 115 hallazgos crudos → consolidados y verificados | 40+ correcciones (cffef28) |
| 2 | 5 (re-auditoría desde cero) | 13/13 fixes verificados; 9 hallazgos nuevos (3 importantes) | corrección completa (6eb9c1b) |
| 3 | 4 | 10 remanentes (9 bajos + 1 medio de higiene) | corrección completa (6dceff5) |
| 4 | 4 | verificación íntegra; 11 residuos finos | micro-ciclos 4b/4b-c (4eaf69d, 8c20f40) |
| 5 | 4 | seguridad y UX limpios; 4 residuos de motor + 2 DevOps | corrección (d9d1faf) |
| 6 | 4 | seguridad y UX limpios; 3 bajos de motor | corrección (8c20f40) |
| 7 | 4 | 1 hallazgo medio real (recoverInterrupted sin gracia) | corrección (8f5d5cd) |
| 8 | 4 | **PASADA LIMPIA #1** (4 dominios) | — |
| 9 | panel conjunto 4 dominios | **PASADA LIMPIA #2 — criterio de salida cumplido** | — |

Total: 9 ciclos (límite 10), 39 ejecuciones de auditor. Commit por corrección, push verificado con ls-remote en cada uno.

## 4-5. Hallazgos por categoría (consolidados, sin duplicados)

- CRÍTICOS (6, todos corregidos con evidencia): deploy standalone sin DB (build no copiaba prisma/); claim de jobs no atómico con ventana de 25 s (doble publicación posible); reportes sin máquina de estados (doble POSTED inflaba el techo anti-ban); formulario de memoria de marca borraba datos reales al guardar; crash del panel al filtrar cambios de política (alsoCovers); leases vencidos nunca reencolados (campañas zombis).
- ALTOS (18): techo sin contar en-vuelo, POSTED sin URL aceptado, write excluded:false invertido, XSS por href de postUrl, sin frontera en mutaciones de panel, sin healthcheck, retry backoff huérfano, ignoreBuildErrors activo (25 errores latentes), etc. Todos corregidos.
- MEDIOS/BAJOS (~60): CAS faltantes en handlers de panel, fail-open de webhooks/tick, log de queries en producción, límites de payload, validaciones de ventana, estados de carga/feedback UX, higiene de tests, locks del entregable, portabilidad de scripts. Todos corregidos.
- INFORMATIVOS (~25, aceptados con decisión documentada): sin anti-replay, sin rate limiting, sin CSP, GETs de lectura sin auth (arnés local + PANEL_TOKEN opcional documentado), dependencias sin uso, health score de grupos (backlog en FICHA), monolitos grandes (sin refactor de riesgo en esta misión), Caddyfile del sandbox.

Registro completo con IDs por ciclo (F-ARC/SEC/UX/DATA/OPS y F2..F9): ver worklog de la misión y mensajes de commit cffef28..8f5d5cd. Ningún hallazgo confirmado quedó sin tratamiento (corregido, o aceptado como decisión documentada en esta sección).

## 6. Correcciones destacadas (causa raíz)

- Motor de colas: reclamos atómicos (updateMany condicional + count), reaper de leases con CAS, reportes idempotentes solo desde LEASED (duplicados auditados como *_REPORT_IGNORED), techo con in-flight, corte nocturno 22-07 real con nightOverride auditado, lease = 10 min + commentDelaySec + margen, DONE con CAS, gracia de 120 s en recuperación de tareas RUNNING.
- Seguridad: PANEL_TOKEN opcional (timing-safe) en 23 handlers mutantes; fail-closed de webhooks/tick fuera de loopback; whitelist de fuentes; hrefs https-only; cabeceras de seguridad; log de queries solo en desarrollo; .env y DBs des-trackeadas del repo local.
- Integridad: $transaction en creación de campaña; CAS en approve/cancel/pause/resume/DONE/decisiones HITL; edición bloqueada de versiones publicadas + auditoría DRAFT_VERSION_EDITED; nextRetryAt y gracia anti-zombi.
- UX: hidratación real de memoria de marca; res.ok + feedback en todos los controles críticos; formularios no se limpian si falla la operación; error boundaries; responsive del calendario; metadata propia.
- DevOps: build copia prisma/ + DB al standalone (despliegue verificado en vivo con /api/health, db ok y 404 real); healthcheck nuevo; README de despliegue; .env.example; cola-check con estados reales; runner portables; locks del entregable.

## 7. Archivos modificados

~60 archivos: 24 rutas API, 8 libs, 10 componentes UI, schema.prisma, next.config/tsconfig/package.json, 6 scripts de test, 3 archivos de app nuevos (health, error boundaries), .env.example, README, FICHA (7 correcciones de honestidad), 4 scripts auxiliares. Diff completo: commits cffef28, 6eb9c1b, 6dceff5, 4eaf69d, 8c20f40, d9d1faf, 8c20f40→8f5d5cd.

## 8. Funcionalidades mejoradas

Healthcheck, corte nocturno real, idempotencia de reportes, telemetría honesta de workers (sin pisar estados defensivos), re-encolado de tareas pausadas al reanudar, respuesta de campañas con condiciones y cap del motor, edición protegida de publicaciones, informe con bitácora anotada.

## 9. Pruebas ejecutadas y resultados (finales, tras el último fix)

- Regresión: **199/199** (P2 26 · E2E 25 · joins 24 · P1 11 · mejoras 25 · P8-P12 24 · besttime 10 · meta-policy 54) — 8 baterías contra dev server, exit-code 1 en fallo verificado en las 8.
- tsc --noEmit: 0 errores (con ignoreBuildErrors:false — el build ya no oculta nada).
- eslint: 0 errores. Build de producción: OK.
- Cola: limpia (0 campañas con jobs vivos) tras cada ronda; higiene de tests con restauración de estado global.
- Smoke de producción: `bun .next/standalone/server.js` → /api/health {ok:true, db:"ok", scheduler activo}, panel 200, /llms.txt 200, informe inexistente 404.
- Nuevos checks añadidos a la regresión: idempotencia de reportes duplicados (E2E), limpieza del arnés E2E, contrato alsoCovers del panel (meta-policy).

## 10. Vulnerabilidades detectadas y resueltas

XSS vía postUrl/URLs importadas (validación en sink + render); escritura sin frontera en 23 handlers (PANEL_TOKEN opcional); fail-open de webhooks/tick; mass-assignment en brands; secreto HMAC exponible vía re-registro (guard + patrón documentado); log de queries con secretos a server.log; inyección de rutas (..) en adjuntos; des-trackeo de .env/DBs del repo local de desarrollo (blobs históricos documentados; sin remote; rotación de secretos de workers en agenda del operador).

## 11. Problemas no solucionados (documentados, no ocultos)

Ninguno que bloquee producción. Residuales aceptados y documentados: sin anti-replay/rate-limiting/CSP (mitigados por despliegue tras proxy + PANEL_TOKEN/HARNESS_WEBHOOK_SECRET); GETs de lectura sin auth (diseño de arnés); dependencias declaradas sin uso (prune pendiente, sin riesgo de bundle); health score numérico de grupos (backlog); monolitos grandes (refactor futuro de riesgo controlado); blobs de DB en la historia del repo scratch de desarrollo (repo sin remote; nunca en el entregable).

## 12. Estado de Git

Rama main; commits de la misión: cffef28 → 6eb9c1b → 6dceff5 → 4eaf69d → 8c20f40 → d9d1faf → 8f5d5cd; cada push verificado con git ls-remote (origin/main == HEAD). Sin force push. HEAD final: 8f5d5cd.

## 13. Riesgos residuales

1. El despliegue público real exige proxy con auth (PANEL_TOKEN/HARNESS_WEBHOOK_SECRET) — documentado en README/PRODUCTION_READINESS.
2. Publicación real sigue dependiendo del despliegue del worker externo (operación del usuario) y del análisis humano del hallazgo CRÍTICO de vigilancia abierto en el panel.
3. Secretos de workers de prueba generados cuando la DB vivía en la historia del repo scratch: rotar si esa máquina exporta el repo.

## 14. Evaluación final

**PRODUCTION READY (software)**: criterio de salida cumplido — 2 pasadas limpias consecutivas (ciclos 8 y 9) sin hallazgos confirmados ni regresiones; 199/199 + tsc 0 + lint 0 + build + cola limpia + despliegue standalone verificado en vivo. La puesta en marcha real (worker + credenciales + proxy con token) es operación del operador, documentada en PRODUCTION_READINESS.md.

---

## Fase de cierre (2026-11-21) — revalidación de línea base con números reales

> Esta sección NO modifica el histórico anterior: lo revalida contra el repo
> entregado con base de datos virgen. Las cifras de 199/199 arriba corresponden
> a la batería de aquella fecha (8 suites); la batería vigente tiene 10 suites.

Ejecutado en esta sesión sobre el repo (commit de partida `dab00f8`, BD virgen):

- Instalación: `npm install` → **930 paquetes**, `package-lock.json` generado (npm único gestor; `npm ci` reproducible).
- Prisma: generate (client v6.19.2) + db push OK sobre `app/prisma/db/harness.db` virgen.
- `npx tsc --noEmit` → **0 errores**. `npm run lint` → de **6 errores reales** (`react-hooks/set-state-in-effect`, react-hooks v6) a **0 problemas**, sin desactivar la regla.
- `npm run build` standalone OK (Next 16.1.3, Turbopack, `ignoreBuildErrors:false`).
- Baterías vigentes (10 suites + cola-check, desde la raíz del repo): P2 **26/26** · E2E FB **25/25** · joins **24/24** · media **11/11** · mejoras **25/25** · P8-P12 **24/24** · meta-policy **54/54** · integraciones **27/27** · whatsapp-session **10/10** · besttime **10/10** → **236/236 checks, 0 fallos** + `cola-check` **COLA LIMPIA** (18 campañas, 0 jobs vivos).
- Fallos iniciales de esta revalidación (no existían en la auditoría original porque la BD histórica los enmascaraba) corregidos de causa raíz: (1) los scripts de la raíz que usan Prisma resolvían por Node el cliente de un directorio PADRE ajeno y escribían en OTRA base de datos → cargador `scripts/lib/app-prisma.cjs`; (2) `run-with-server.sh` ejecutaba los tests desde `app/` donde no existen → ahora server desde `app/` y tests desde la raíz; (3) `test-besttime.ts` importaba la lib por ruta del workspace → import dual-layout (Node ≥ 24 o bun); (4) `test-meta-policy.cjs` asumía fuentes ya verificadas → bootstrap con verificación REAL contra meta.com (6 fuentes HTTP 200, sin fingir frescura).
- Creación de `.env.example` de raíz (citado por README y PRODUCTION_READINESS, no existía).

Veredicto de cierre: **PRODUCTION READY (software) revalidado con BD virgen** — las operaciones reales de publicación (credenciales por canal, worker FB, conector WhatsApp, proxy+tokens, rotación del token de GitHub expuesto) quedan documentadas como operación del operador en `DEPLOY.md`.
