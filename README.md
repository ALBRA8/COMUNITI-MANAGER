# COMUNITI-MANAGER — Arnés de community management (FB-GROUPS + Meta Policy Intelligence)

Panel de operaciones + API para el módulo FB-GROUPS (el "pantalón" del chaleco
AGENTE-GENERAL): campañas a grupos de Facebook con HITL real, leases anti-doble-
disparo, techos anti-ban por warmup y un motor de cumplimiento de políticas de
Meta con 6 estados. Fuente de verdad del producto: `modulo-fb-groups/FICHA.md (raíz del repo)`.

## Stack

Next.js 16 (App Router) · TypeScript strict · Prisma 6 + SQLite · Tailwind/shadcn · Bun.

## Desarrollo

```bash
cd app
bun install
bun run dev            # http://localhost:3000
npx prisma db push     # aplica app/prisma/schema.prisma a app/prisma/db/harness.db
```

## Pruebas (8 baterías, se corren contra un dev server en :3000)

> Nota: en este repo la app vive en `app/` y `scripts/` en la raíz; el runner
> resuelve la raíz del server automáticamente, pero los comandos de batería
> asumen la disposición del workspace de desarrollo (scripts/ junto a src/).
> En el repo entregado, corre las baterías desde `app/` con `TEST_BASE` apuntando
> al server y ajusta el import relativo de `test-besttime.ts`, o usa el workspace.

```bash
bash scripts/run-with-server.sh \
  "node scripts/test-p2-approval.cjs" \
  "node scripts/e2e-fb-groups.cjs" \
  "node scripts/test-joins-fb.cjs" \
  "node scripts/test-media-fb.cjs" \
  "node scripts/test-mejoras-fb.cjs" \
  "node scripts/test-p8-p12.cjs" \
  "bun scripts/test-besttime.ts" \
  "node scripts/test-meta-policy.cjs"
node scripts/cola-check.cjs   # la cola debe quedar limpia (0 jobs QUEUED/LEASED)
npx tsc --noEmit && npm run lint
```

## Producción

```bash
cd app
bun run build   # genera .next/standalone y copia prisma/ (schema + DB) dentro
bun run start   # NODE_ENV=production bun .next/standalone/server.js
curl -s localhost:3000/api/health   # {"ok":true, db:"ok", scheduler:{active:true,...}}
```

- **DB**: SQLite en `prisma/db/harness.db` (ruta fija en `prisma/schema.prisma`;
  el build la copia al standalone). Sin migraciones por convención: `db push`.
- **Variables**: ver `.env.example`. Todas opcionales; los contratos sin
  credenciales quedan en `AWAITING_CREDENTIALS` (nada se simula).
- **Seguridad del panel**: las mutaciones aceptan opcionalmente `PANEL_TOKEN`
  (cabecera `x-panel-token`, comparación en tiempo constante). Recomendado en
  despliegue público: autenticar en el proxy (Caddy/Nginx) e inyectar la
  cabecera; también definir `HARNESS_WEBHOOK_SECRET` para webhooks/tick externos
  (sin secreto solo se acepta loopback).
- **Worker externo**: protocolo firmado HMAC-SHA256 (`/api/fb-jobs/claim`,
  `/api/fb-jobs/report`, joins, ping). El despliegue del worker (PC del
  operador, sesión propia de Chrome) es una operación del usuario, no código.
- **Cron externo (opcional)**: `POST /api/scheduler {"action":"tick"}` con la
  firma del secreto; el bucle interno ya corre cada 60 s.

## Convenciones de la casa

- Motor de 6 estados (PERMITIDO … POLITICA_DESACTUALIZADA) consultado antes de
  aceptar/aprobar/reclamar cualquier publicación.
- HITL: las campañas nacen borrador; el worker no ve nada sin aprobación humana.
- Auditoría append-only; sin URL viva no hay éxito; la IA no desactiva
  restricciones (regla fija §5.1 + techos `NETWORK_CAPS` no modificables).
