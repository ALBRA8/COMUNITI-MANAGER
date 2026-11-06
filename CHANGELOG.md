# CHANGELOG — COMUNITI-MANAGER

Formato: entradas por fecha con los commits del entregable. Metodología de la casa: sala limpia, honestidad de estados, auditoría append-only.

## 2026-11-06 — Auditoría integral y preparación para producción (9 ciclos, entregable 8f5d5cd)

### Motor de colas y anti-ban
- Reclamos atómicos de jobs y joins (updateMany condicional + count) con variante IA generada tras ganar el lease.
- Reaper de leases vencidos para jobs y joins con CAS; joins reencolados liberan el pin al worker muerto; fallo honesto al 3er intento.
- Reportes idempotentes solo desde LEASED; reintentos duplicados ignorados con traza y sin re-consumir techos; POSTED sin URL degrada a FAILED (honestidad).
- Techo diario cuenta posts/uniones en vuelo; corte nocturno 22:00-07:00 real con `nightOverride` auditado; lease = 10 min + commentDelaySec + margen.
- Pausa/cancelación que respetan leases en vuelo; DONE con CAS; telemetría de worker que no pisa estados defensivos.

### Seguridad
- `PANEL_TOKEN` opcional (comparación timing-safe) en las 23 mutaciones de panel; ping/claim/report/tick/webhooks mantienen sus mecanismos propios.
- Webhooks y tick fail-closed fuera de loopback sin secreto; whitelist de fuentes; comparaciones timing-safe unificadas.
- XSS: URLs de posts/grupos solo https en render y sinks; cabeceras de seguridad; mass-assignment cerrado en brands; media sin `..`.
- Log de queries de Prisma solo en desarrollo; /api/health sin detalle de errores al cliente.

### Integridad de datos y backend
- `$transaction` en creación de campaña (campaña+jobs+auditoría); CAS en approve/cancel/pause/resume/DONE y decisiones HITL (409 honestos).
- Edición de versiones publicadas bloqueada; auditoría DRAFT_VERSION_EDITED; memoria de marca con whitelist y auditoría.
- Reintentos de tareas del ciclo con backoff real (sweep con tope por tick), gracia de 120 s en recuperación de RUNNING vivas, CAS en research inline, CAS en schedules (tick interno/externo/manual).
- Índices nuevos (FbJob/FbJoinTask/AuditEntry) y unique de versiones de política; auditoría del claim silenciosa (sin ruido por latido).

### UI/UX
- Memoria de marca hidratada desde datos reales (antes borraba al guardar); formularios conservan el texto si la operación falla; res.ok + feedback en todos los controles; estados vacíos; calendario responsive; diálogos con scroll; metadata propia en español; error boundaries y 404 real.

### DevOps
- El build copia schema+DB al standalone (despliegue verificado en vivo); /api/health nuevo (proceso+DB+scheduler); tsc con `ignoreBuildErrors: false` (25 errores latentes corregidos); README de despliegue y .env.example; cola-check con estados reales; runner y scripts de navegador portables; locks del entregable; higiene de tests (nightOverride en baterías 0-24, restauración de autonomy_mode, limpieza E2E).

### Certificación
- Regresión 199/199 · tsc 0 · lint 0 · build producción · cola limpia · smoke standalone en vivo · 2 pasadas limpias consecutivas (ciclos 8-9). Detalle: AUDIT_REPORT.md y PRODUCTION_READINESS.md.

## 2026-11-06 — Antes de la auditoría (resumen)

- `3b830dd` Higiene de tests: default de test-media-fb 3199→3000; verificación relojito 194/194.
- `595975d` Techos propios multi-red en el motor (NETWORK_CAPS, 7 redes, 3 capas), POC Postgale endurecido, llms.txt propio; regresión 194/194.
- `188c41a` Destripe ClonaKit de Blotato: hub API+MCP de 9 redes; candidata secundaria tras Postgale; backlog P13/P14/P15.
- `30564d0` Prueba general post-familia-E: regresión 182/182 + build + cola limpia.
- `b366d85` Reglas oficiales de posteo por red + motor multi-red (familia E).
- `1f5a638` META POLICY INTELLIGENCE: vigilancia de 26 fuentes, motor de 6 estados, apagado de emergencia solo-humano.
