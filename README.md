# COMUNITI-MANAGER — Agente independiente de redes sociales

Agente autónomo con UNA especialidad: **publicar contenido y administrar
múltiples cuentas sin que las cuentas sean baneadas**. Publica por canales
PROPIOS — Telegram (Bot API oficial), WhatsApp (sesión propia del agente,
conector QR), Grupos de Facebook (worker propio con Chrome real) e
Instagram/Facebook por vías API (Postgale/Postiz/PostLake) — bajo un motor de
cumplimiento de políticas de Meta con 6 estados (Meta Policy Intelligence),
HITL real, techos por red (NETWORK_CAPS) y auditoría append-only.

CRM, Chismoso, Leads, KREA, etc. son agentes aparte (mundos aparte): la
integración con ellos es OPCIONAL vía malla firmada; nada de eso hace falta
para publicar.

## Stack

Next.js 16 (App Router) · TypeScript strict · Prisma 6 + SQLite · Tailwind/shadcn ·
npm (único gestor de paquetes, `package-lock.json`) · Node ≥ 20.

## Desarrollo

```bash
cd app
npm ci                # o npm install la primera vez (genera/usa package-lock.json)
npx prisma db push    # aplica app/prisma/schema.prisma a app/prisma/db/harness.db
npm run dev           # http://localhost:3000
```

## Pruebas (10 baterías + cola-check, corren tal cual desde la raíz del repo)

```bash
bash scripts/run-with-server.sh \
  "node scripts/test-p2-approval.cjs" \
  "node scripts/e2e-fb-groups.cjs" \
  "node scripts/test-joins-fb.cjs" \
  "node scripts/test-media-fb.cjs" \
  "node scripts/test-mejoras-fb.cjs" \
  "node scripts/test-p8-p12.cjs" \
  "node scripts/test-besttime.ts" \
  "node scripts/test-meta-policy.cjs" \
  "node scripts/test-integrations.cjs" \
  "node scripts/verify-whatsapp-session.cjs"
node scripts/cola-check.cjs        # la cola debe quedar limpia (0 jobs QUEUED/LEASED)
npx tsc --noEmit && npm run lint   # en app/
```

- El runner (`scripts/run-with-server.sh`) levanta el dev server desde `app/` y
  ejecuta las baterías desde la raíz; `scripts/lib/app-prisma.cjs` garantiza que
  los scripts que usan Prisma directo escriban en la BD de la app (no en la de
  un directorio padre).
- `test-besttime.ts` corre con Node ≥ 24 (type stripping); su import
  resuelve la lib en ambos layouts (`../src` o `../app/src`).
- `test-meta-policy.cjs` bootstrapa la frescura de las fuentes FACEBOOK_GROUPS
  con verificaciones REALES (nunca finge frescura); en una red sin salida a
  meta.com la suite falla honesta.
- CI: GitHub Actions (`.github/workflows/ci.yml`) corre npm ci + prisma + tsc +
  lint + build + las 10 baterías + cola-check en cada push.

## Producción

```bash
cd app
npm run build   # genera .next/standalone y copia prisma/ (schema + DB) dentro
npm run start   # NODE_ENV=production node .next/standalone/server.js
curl -s localhost:3000/api/health   # {"ok":true, db:"ok", scheduler:{active:true,...}}
```

- **DB**: SQLite en `prisma/db/harness.db` (ruta fija en `prisma/schema.prisma`;
  el build la copia al standalone). Sin migraciones por convención: `db push`.
- **Variables**: ver `.env.example` (raíz del repo; copiar a `app/.env`). Todas
  opcionales; los contratos sin credenciales quedan en `AWAITING_CREDENTIALS`
  con la variable exacta que falta (nada se simula).
- **Seguridad del panel**: las mutaciones aceptan opcionalmente `PANEL_TOKEN`
  (cabecera `x-panel-token`, comparación en tiempo constante). Recomendado en
  despliegue público: autenticar en el proxy (Caddy/Nginx) e inyectar la
  cabecera; también definir `HARNESS_WEBHOOK_SECRET` para webhooks/tick
  externos/reportes del conector WhatsApp (sin secreto solo se acepta loopback).
- **Workers/conectores externos**: protocolo firmado HMAC-SHA256. Desplegar el
  worker FB-GROUPS y el conector WhatsApp es una operación del operador —
  pasos exactos en `DEPLOY.md`.
- **Cron externo (opcional)**: `POST /api/scheduler {"action":"tick"}` con la
  firma del secreto; el bucle interno ya corre cada 60 s.

## Documentación

- `FICHA.md` — fuente de la verdad del producto (método sala limpia).
- `DEPLOY.md` — guía única del operador: credenciales por canal, worker FB,
  conector WhatsApp, secretos del panel, rotación de token y riesgos aceptados.
- `modulo-fb-groups/` — ficha del módulo + worker Chrome entregable.
- `docs/` — arquitectura, investigación (destripes) y base documental de políticas.

## Convenciones de la casa

- Motor de 6 estados (PERMITIDO … POLITICA_DESACTUALIZADA) consultado antes de
  aceptar/aprobar/reclamar cualquier publicación.
- HITL: las campañas nacen borrador; nada se publica sin aprobación humana.
- Auditoría append-only; sin URL viva (o evidencia documentada equivalente) no
  hay éxito; la IA no desactiva restricciones (regla fija §5.1 + techos
  `NETWORK_CAPS` no modificables).
