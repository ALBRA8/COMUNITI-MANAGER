# PRODUCTION READINESS — COMUNITI-MANAGER (agente independiente de redes sociales)

Veredicto: **LISTO PARA PRODUCCIÓN (software)** — revalidado el **2026-11-21**
en la sesión de cierre (Fase 0, línea base real ejecutada en esta sesión sobre
el repo entregado, BD virgen). Estado del repo: main = origin/main (push
verificado con `git ls-remote` en cada commit). Histórico de auditorías
previas: ver `AUDIT_REPORT.md` (9 ciclos, 2026-11-06) — las cifras de abajo son
las de HOY, no heredadas.

## Checklist final (revalidación 2026-11-21)

| Ítem | Estado | Evidencia / justificación |
|---|---|---|
| Instalación limpia de dependencias | ✅ | `npm install` con generación de `package-lock.json` (único gestor: npm) → **930 paquetes**; a partir de ahora `npm ci` reproduce exacto |
| Prisma | ✅ | `npx prisma generate` (client v6.19.2) + `npx prisma db push` → schema aplicado a `app/prisma/db/harness.db` (BD virgen, 0 marcas) |
| Tipos | ✅ | `npx tsc --noEmit` → **0 errores** |
| Lint | ✅ | `npm run lint` (eslint .) → **0 problemas** (los 6 errores `set-state-in-effect` de react-hooks v6 corregidos sin desactivar la regla: `useSyncExternalStore`, IIFE asíncrona y rAF) |
| Compilación de producción | ✅ | `npm run build` (standalone, Next 16.1.3, `ignoreBuildErrors: false`) sin errores; build copia schema+DB al standalone |
| Aplicación inicia correctamente | ✅ | Dev server + smoke: `/api/harness` → `{"status":"OPERATIONAL","autonomyMode":"L2_SUPERVISED",...}` con registro de 15 tools sincronizado; panel 200; capturas 8/8 (verificación visual) |
| Base de datos funcional | ✅ | SQLite `app/prisma/db/harness.db`; cola limpia tras baterías: `node scripts/cola-check.cjs` → **COLA LIMPIA — 0 campañas con jobs vivos (18 campañas totales)** |
| APIs verificadas | ✅ | Regresión HTTP completa de esta sesión (tabla abajo); estados honestos `AWAITING_CREDENTIALS` con la variable exacta que falta |
| Autenticación y autorización | ✅ | Workers: HMAC-SHA256 por worker, timing-safe, secreto mostrado una vez; panel: mutaciones tras `guardPanel` (PANEL_TOKEN opcional); webhooks/tick/reportes WhatsApp: firma o fail-closed; HITL: campañas nacen borrador |
| Funcionalidades principales verificadas | ✅ | Campañas con gate HITL, claim/lease/reporte honesto (sin URL viva no hay éxito), techos anti-ban con warmup + corte nocturno, motor de 6 estados en crear/aprobar/reclamar, joins, media, informes, vigilancia de políticas |
| Pruebas unitarias | ✅ | besttime **10/10** (Node ≥ 24 desde la raíz del repo); meta-policy **54/54** (14 casos obligatorios + techos P13) |
| Pruebas de integración | ✅ | P2 **26/26** · joins **24/24** · media P1 **11/11** · mejoras **25/25** · P8-P12 **24/24** · integraciones **27/27** |
| Pruebas end-to-end | ✅ | E2E del módulo **25/25**; conector WhatsApp **10/10** (fail-closed 401, firma falsificada rechazada, QR→CONNECTED, prueba de tool real) |
| **TOTAL baterías** | ✅ | **236/236 checks, 0 fallos** en BD virgen del repo + cola limpia |
| Seguridad revisada | ✅ | 9 ciclos de auditoría previos (AUDIT_REPORT); fail-closed verificado de nuevo esta sesión por la suite de WhatsApp; hallazgos cerrados |
| Dependencias revisadas | ✅ | npm con lockfile único; sin CVEs conocidos aplicables; dependencias sin uso documentadas (sin import → sin bundle) |
| Rendimiento evaluado | ✅ (estático) | Índices (FbJob/FbJoinTask/AuditEntry), `take` en listados, tope de payloads; paginación cursor en backlog |
| Diseño responsive verificado | ✅ (estático) | Breakpoints en KPIs, calendario con overflow-x; verificación táctil fina pendiente en dispositivo real (no bloqueante) |
| Logs y manejo de errores | ✅ | ErrorLog + auditoría append-only; error boundaries; log de Prisma solo en desarrollo |
| Variables de entorno documentadas | ✅ | **`.env.example` (raíz) creado en esta sesión**: credenciales por canal + PANEL_TOKEN + HARNESS_WEBHOOK_SECRET + ecosistema opcional; sin contratos no documentados |
| Configuración de producción revisada | ✅ | `npm run build && npm run start` (runtime Node); pasos operativos completos en `DEPLOY.md` |
| Ausencia de secretos expuestos | ✅ | `git ls-files` sin .env/.db/.log; `.env.example` sin valores; secretos de worker mostrados una vez |
| Repositorio actualizado y sincronizado | ✅ | Cada commit empujado y verificado con `git ls-remote` (origin/main == HEAD) |
| CI | ✅ | `.github/workflows/ci.yml`: npm ci → prisma → tsc → lint → build → 10 baterías + cola-check en cada push |

## Regresión ejecutada en esta sesión (BD virgen del repo, dev server :3000)

| Suite | Checks | Resultado |
|---|---|---|
| P2 aprobación (gate HITL pre-vuelo) | 26 | ✅ 26/26 |
| E2E FB-GROUPS (contrato agente↔worker) | 25 | ✅ 25/25 |
| Joins (auto-join P6) | 24 | ✅ 24/24 |
| Media (adjuntos/rotación P1/P7) | 11 | ✅ 11/11 |
| Mejoras post-P6 (riesgo, bump, unicode, proxy) | 25 | ✅ 25/25 |
| P8-P12 (informes, techos, llms.txt) | 24 | ✅ 24/24 |
| Meta Policy Intelligence (14 casos + P13) | 54 | ✅ 54/54 |
| Integraciones (registro honesto 15 tools) | 27 | ✅ 27/27 |
| Sesión WhatsApp (fail-closed + QR real) | 10 | ✅ 10/10 |
| Besttime (lib pura, Node ≥ 24) | 10 | ✅ 10/10 |
| **Total** | **236** | **✅ 236/236 + COLA LIMPIA** |

Fixes estructurales descubiertos y corregidos por esta revalidación (detalle en
el commit del punto 10): runner portable real (`run-with-server.sh` ejecuta los
tests desde la raíz y el server desde `app/`), cargador `scripts/lib/app-prisma.cjs`
(los scripts de la raíz usaban por resolución de Node el cliente Prisma de un
directorio padre y escribían en OTRA base de datos), import de `test-besttime.ts`
dual-layout (Node/bun) y bootstrap honesto de fuentes en `test-meta-policy.cjs`
(verificación REAL contra meta.com, sin fingir frescura).

## Requisitos de despliegue (operación del operador)

1. `cd app && npm ci && npx prisma db push && npm run build && npm run start`
   (o proceso supervisor apuntando al standalone).
2. **Proxy con autenticación** en despliegue público + `PANEL_TOKEN` (el proxy
   inyecta `x-panel-token`) y `HARNESS_WEBHOOK_SECRET` para webhooks/tick
   remotos/reportes del conector. Sin ello, el panel asume red local confiable.
3. **Canales reales**: credenciales por canal y workers/conectores — pasos
   exactos en `DEPLOY.md` (única guía operativa).
4. Rotación de secretos: procedimiento en `DEPLOY.md` (incluye el token de
   GitHub expuesto por el operador durante la sesión de cierre).

## Riesgos residuales (aceptados y documentados)

- Sin anti-replay ni rate limiting ni CSP: mitigado por proxy + tokens; añadir
  si el panel se abre a terceros.
- GETs de lectura sin auth (diseño de panel personal; PANEL_TOKEN opcional).
- **Riesgo de baneo aceptado por el operador**: publicación en grupos de
  Facebook por automatización de sesión propia (violación de Términos de Meta
  declarada y mitigada con warmup/techos/HITL) y WhatsApp por protocolo Web no
  oficial (mitigado con cola, gap humano, techos y pausa global). Detalle y
  mitigaciones en `DEPLOY.md`.
- Health score numérico de grupos y paginación cursor: backlog (FICHA).
