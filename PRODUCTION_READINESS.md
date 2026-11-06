# PRODUCTION READINESS — COMUNITI-MANAGER

Veredicto: **LISTO PARA PRODUCCIÓN (software)** — validado el 2026-11-06 tras 9 ciclos de auditoría con 2 pasadas limpias consecutivas. Entregable: este repo @ 8f5d5cd.

## Checklist final (FASE 6 de la misión)

| Ítem | Estado | Evidencia / justificación |
|---|---|---|
| Instalación limpia de dependencias | ✅ | `bun install --frozen-lockfile` → 915 paquetes sin cambios (lock en sincronía con package.json; lock idéntico workspace/entregable) |
| Compilación de producción | ✅ | `bun run build` sin errores, con chequeo de tipos real (`ignoreBuildErrors: false`) |
| Aplicación inicia correctamente | ✅ | Smoke en vivo del standalone: `/api/health` → `{ok:true, db:"ok", scheduler:{active:true}}`, panel 200, /llms.txt 200, informe inexistente 404 |
| Base de datos funcional | ✅ | SQLite `app/prisma/db/harness.db` copiada al standalone por el build; `prisma validate` OK; cola limpia (0 jobs QUEUED/LEASED) |
| Migraciones verificadas | ✅ (N/A por diseño) | Convención de la casa: `prisma db push` sin historial de migraciones; schema aplicado y validado; único constraint nuevo aplicado sin duplicados previos |
| APIs verificadas | ✅ | 24 rutas auditadas (métodos, códigos HTTP, 409/404 honestos, límites); regresión 199/199 cubre los flujos |
| Autenticación y autorización | ✅ | Workers: HMAC-SHA256 por worker, timing-safe, secreto mostrado una vez; panel: 23 mutaciones tras `guardPanel` (PANEL_TOKEN opcional); webhooks/tick: firma o fail-closed 503; HITL: campañas nacen borrador |
| Funcionalidades principales verificadas | ✅ | Campañas con gate HITL, claim/lease/reporte con honestidad (sin URL no hay éxito), techos anti-ban con warmup + corte nocturno + nightOverride, motor de 6 estados consultado en crear/aprobar/reclamar, joins, media, informes, vigilancia de políticas |
| Pruebas unitarias | ✅ | besttime 10/10; meta-policy 54/54 (incl. los 14 casos obligatorios + techos P13) |
| Pruebas de integración | ✅ | P2 26/26 · joins 24/24 · P1 11/11 · mejoras 25/25 · P8-P12 24/24 |
| Pruebas end-to-end | ✅ | E2E del módulo 25/25 (worker HMAC, claim/lease, techo, alerta CHALLENGE, idempotencia de reportes, auditoría, limpieza) |
| Seguridad revisada | ✅ | 8 ciclos del auditor de seguridad; XSS/SSRF/inyección/secretos/mass-assignment/fail-closed verificados; hallazgos cerrados |
| Dependencias revisadas | ✅ | `bun install --frozen-lockfile` sin cambios; heurística de versiones mayores sin CVEs conocidos aplicables; dependencias sin uso documentadas (sin import → sin bundle) |
| Rendimiento evaluado | ✅ (estático) | Índices añadidos (FbJob/FbJoinTask/AuditEntry), `take` en listados, tope de payloads; sin paginación cursor (documentado como backlog) |
| Diseño responsive verificado | ✅ (estático + patrón) | Breakpoints en KPIs, calendario con overflow-x, diálogos con max-h y scroll; verificación táctil fina pendiente en dispositivo real (no bloqueante) |
| Logs y manejo de errores | ✅ | ErrorLog + auditoría append-only; error boundaries (error/global-error/not-found); log de Prisma solo en desarrollo; start con pipefail |
| Variables de entorno documentadas | ✅ | `.env.example` (raíz y app/) con las 16 variables de contratos + PANEL_TOKEN + HARNESS_WEBHOOK_SECRET; sin contratos no documentados |
| Configuración de producción revisada | ✅ | README de despliegue (cd app, build standalone, health, cron tick opcional); build copia schema+DB al standalone |
| Ausencia de secretos expuestos | ✅ | `git ls-files` sin .env/.db/.log; .env.example sin valores; secretos de worker mostrados una vez y nunca en GETs; escaneo de patrones limpio |
| Ausencia de regresiones | ✅ | 2 pasadas limpias consecutivas (ciclos 8 y 9) tras la última corrección |
| Repositorio actualizado y sincronizado | ✅ | main = origin/main = 8f5d5cd, push verificado por ls-remote en cada commit |

## Requisitos de despliegue (operación del operador)

1. `cd app && bun install && bun run build && bun run start` (o proceso supervisor apuntando al standalone).
2. **Proxy con autenticación** en despliegue público + `PANEL_TOKEN` (el proxy inyecta `x-panel-token`) y `HARNESS_WEBHOOK_SECRET` para webhooks/tick remotos. Sin ello, el arnés asume red local confiable.
3. `HARNESS_WEBHOOK_SECRET` definido en producción: sin él, webhooks y tick remotos responden 503 (fail-closed); solo loopback queda abierto.
4. **Worker externo**: mismo paquete en PC del operador (Chrome con sesión propia); su despliegue es operación humana pendiente — hueco #1 de producción, no código.
5. Rotar los secretos de workers de prueba si la máquina de desarrollo exporta el repo scratch (los blobs históricos de DB viven solo ahí, sin remote).

## Riesgos residuales (aceptados y documentados)

- Sin anti-replay ni rate limiting ni CSP: mitigado por proxy + tokens; añadir si el panel se abre a terceros.
- GETs de lectura sin auth (diseño de arnés personal; el entregable P9 se comparte por decisión del operador).
- Health score numérico de grupos y paginación cursor: backlog (FICHA).
- Historia del repo scratch de desarrollo contiene DBs antiguas: repo sin remote; no purgado (sin impacto en el entregable).
