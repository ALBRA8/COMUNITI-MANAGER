# DEPLOY.md — Guía única del operador de COMUNITI-MANAGER

Agente independiente de redes sociales: publica contenido y administra múltiples
cuentas sin que las cuentas sean baneadas. Todo lo que requiere decisión o
credenciales humanas está aquí. Sin credenciales, cada canal queda en
`AWAITING_CREDENTIALS` con la variable exacta que falta — nada se simula.

---

## 1. Instalar y arrancar el panel

```bash
cd app
npm ci                      # instala con el lockfile (npm, único gestor)
npx prisma db push          # crea/actualiza prisma/db/harness.db
npm run build               # build standalone (copia schema+DB al standalone)
npm run start               # NODE_ENV=production node .next/standalone/server.js
curl -s localhost:3000/api/health   # {"ok":true, "db":"ok", scheduler activo}
```

Requisitos: Node ≥ 20 (las baterías usan Node ≥ 24 para el test TS). La base de
datos es SQLite en `app/prisma/db/harness.db` (respáldala como cualquier
archivo). Variables opcionales: copia `.env.example` (raíz del repo) a
`app/.env` y completa solo lo que uses.

## 2. Secretos del panel (obligatorio si el panel sale de localhost)

| Variable | Qué protege | Cómo definirla |
|---|---|---|
| `PANEL_TOKEN` | Mutaciones del panel (cabecera `x-panel-token`, comparación en tiempo constante) | `openssl rand -hex 32` |
| `HARNESS_WEBHOOK_SECRET` | Webhooks entrantes, tick externo y TODOS los reportes del conector WhatsApp (fail-closed: sin secreto solo se acepta loopback) | `openssl rand -hex 32` |

Despliegue público recomendado: autenticación en el proxy (Caddy/Nginx) que
inyecte `x-panel-token`, TLS, y las dos variables arriba. Sin proxy + tokens,
el panel asume red local confiable (GETs de lectura abiertos por diseño).

## 3. Canal Telegram (Bot API oficial — vía sin riesgo de baneo)

1. Habla con `@BotFather` → `/newbot` → guarda el token.
2. `app/.env`: `TELEGRAM_BOT_TOKEN=...` y reinicia el panel.
3. Panel → **Canales → Telegram → Probar**: `getMe` real debe responder el
   @usuario del bot.
4. Añade el bot como **administrador** del canal/grupo (sin esto, la Bot API
   responde 403 y el panel lo reporta honesto).
5. Panel → **Marcas y cuentas**: crea la marca y añade su cuenta Telegram con
   el handle del canal (ej. `@mi_canal` o el id numérico del grupo).
6. Publica: el ejecutor real respeta los techos oficiales verificados
   (1 msg/seg por chat, 20 msg/min por grupo), hace backoff honesto ante 429,
   guarda `message_id` + enlace `t.me` como evidencia y no publica nada sin
   aprobación humana (HITL).

## 4. Canal WhatsApp (sesión propia del agente — protocolo Web NO oficial)

**Riesgo declarado**: el protocolo WhatsApp Web no es oficial; WhatsApp puede
restringir el número ante reportes o volumen abusivo. Mitigaciones del sistema:
cola con gap humano (≥ `WHATSAPP_MIN_GAP_SECONDS` con jitter), techo diario
(`WHATSAPP_DAILY_CAP`, default 200 — solo puedes bajarlo), pausa global, HITL y
entrega firmada HMAC con `waMessageId` como evidencia.

1. En la máquina que correrá el conector (PC o VPS con acceso al panel):
   ```bash
   cd app   # o el repo; node_modules de la app
   HARNESS_URL=http://IP-DEL-PANEL:3000 \
   HARNESS_WEBHOOK_SECRET=<el secreto del panel> \
   WHATSAPP_DAEMON_TOKEN=<openssl rand -hex 24> \
   WHATSAPP_DAILY_CAP=200 \
   WHATSAPP_MIN_GAP_SECONDS=6 \
   WHATSAPP_DAEMON_PORT=3010 \
   node scripts/whatsapp-daemon.cjs
   ```
2. Panel → **Ajustes**: define `WHATSAPP_DAEMON_TOKEN` con el mismo valor (el
   panel lo envía al conector en cada encolado).
3. Panel → **Canales → WhatsApp**: aparecerá el **QR en vivo**; escanéalo con
   WhatsApp → Dispositivos vinculados. Al vincular, la tarjeta pasa a
   **Conectado** y la sesión queda guardada (`prisma/db/whatsapp-session`) — no
   se re-escanea al reiniciar.
4. Panel → **Marcas y cuentas**: añade la cuenta WhatsApp de la marca con el
   número destino (`57...`). Para difusión/avisos puedes registrar varios
   destinos por marca.
5. Publica: el panel encola en el conector (`/send`), el conector despacha a
   ritmo humano y reporta `DELIVERED`/`FAILED` firmado; la publicación solo se
   cuenta como éxito con esa evidencia.
6. Desvincular: detén el conector y borra `prisma/db/whatsapp-session`, o
   `POST http://127.0.0.1:3010/logout`.

## 5. Worker FB-GROUPS (grupos de Facebook — riesgo aceptado, ver §8)

1. `modulo-fb-groups/worker/` en la PC/VPS del operador:
   ```bash
   npm install && npm run setup      # canal Chrome de Playwright
   cp .env.example .env              # FB_WORKER_PORT, HARNESS_URL, WORKER_ID, WORKER_SECRET...
   npm start
   ```
2. Panel → **Grupos de Facebook → Workers**: registra el worker con su URL y
   copia el **secreto** (se muestra una sola vez) al `.env` del worker.
3. `curl -X POST http://localhost:8765/api/check-session` → inicia sesión de
   Facebook en el Chrome del worker (solo la primera vez).
4. `curl -X POST http://localhost:8765/api/sync-groups` → importa tus grupos.
5. Declara la **antigüedad real** de la cuenta: define el techo por warmup
   (5/10/20 posts/día según 0-6 / 7-29 / 30+ días).
6. Primera campaña: **2-3 grupos, no 30**, texto con `{spintax|variaciones}`,
   revisa el gauge de riesgo pre-vuelo. Nada sale sin aprobación humana
   (campañas nacen DRAFT con jobs `PENDING_APPROVAL`).

## 6. Vía API multirred IG/FB (Postiz self-host — redes soportadas verificadas)

1. Instala tu propio Postiz (AGPL-3.0) y crea una API key.
2. `app/.env`: `POSTIZ_URL=https://tu-postiz`, `POSTIZ_API_KEY=...`. Si tu
   instalación monta la API pública bajo `/api/public/v1` (self-host), añade
   `POSTIZ_API_PREFIX=/api/public`. Cloud: sin prefix (usa `/public`).
3. Conecta tus cuentas en Postiz (integraciones). El agente empareja por
   proveedor o por `providerAccountId` en la cuenta de la marca.
4. Redes con payload verificado en la documentación oficial de Postiz:
   **instagram, facebook, x, linkedin**. Otras (tiktok, youtube, threads)
   exigen settings/media específicos: quedan `AWAITING_CONNECTOR` con la razón
   explícita — no se asumen.
5. Publica: media sube por `upload-from-url`, verificación por listado de
   posts, métricas por `/analytics/post/{id}`. IG/FB pasan por el motor de
   cumplimiento (`IG_POST`/`FB_PAGE_POST`).

> Postgale y PostLake: sin documentación oficial verificable (2026-11-21) — sus
> rutas se retiraron y todo contrato queda `CAPACITY_UNAVAILABLE` con la razón
> explícita hasta que exista fuente documental.

## 7. Investigación y comentarios públicos (ScrapeCreators)

`SCRAPECREATORS_API_KEY` en `app/.env` (docs.scrapecreators.com). Da evidencia
con URL/fecha/payload (perfiles, posts, ad libraries) y lectura de comentarios
públicos de Instagram (`/v2/instagram/post/comments`, 1 crédito por página, 15
con respuestas). **Solo lectura**: responder comentarios reales no existe aún
como envío externo — el flujo de comunidad clasifica y deja la respuesta
preparada para acción humana o de un conector futuro.

## 8. Riesgo aceptado de baneo (leer antes de operar)

- **Grupos de Facebook**: automatizar publicación con la sesión propia viola
  los Términos de Meta — **el riesgo de restricción es del dueño de la
  cuenta**. La única alternativa oficial (API de grupos) fue eliminada por Meta
  el 22/04/2024. Mitigaciones implementadas: HITL pre-vuelo, warmup por
  antigüedad (5/10/20), corte nocturno, gaps 3-10 min, spintax por grupo,
  primer comentario diferido, pausa defensiva 12 h ante checkpoint/CHALLENGE,
  techos `NETWORK_CAPS` fijos en código y auditoría append-only.
- **WhatsApp (sesión Web no oficial)**: protocolo no oficial; riesgo de
  restricción del número. Mitigaciones: gap ≥ 6 s con jitter, techo 200/día
  (solo bajable), pausa global, HITL, reportes firmados por entrega.
- **Instagram/Facebook por API**: la vía oficial (Postiz → APIs de Meta) es la
  de menor riesgo; el motor además vigila las políticas de Meta (§9) y retiene
  operaciones si la documentación está desactualizada.

## 9. Centro de Cumplimiento Meta (motor de 6 estados) y el cambio CRÍTICO de yt-developer-policies

Panel → **Sistema → Centro de Cumplimiento Meta**. El motor vigila fuentes
oficiales versionadas (26) y gobierna toda operación Meta: 6 estados
(PERMITIDO … `POLITICA_DESACTUALIZADA`); el peor veredicto gana.

- **Cambio CRÍTICO `yt-developer-policies`**: durante la operación se detectó
  un cambio CRÍTICO en las Políticas para desarrolladores de YouTube. Mientras
  exista un cambio CRÍTICO sin analizar en fuentes que gobiernan un producto,
  **las operaciones de ese producto quedan bloqueadas** (regla del motor, no
  modificable por agentes). Procedimiento del operador:
  1. Abre el centro, filtra por producto **YOUTUBE** y revisa el cambio
     (URL + versiones con hash y extracto).
  2. Lee la fuente oficial real (https://developers.google.com/youtube/terms/developer-policies)
     y decide: **Aceptar** (el cambio no afecta la operación) o **Descartar**
     (falso positivo), siempre con nota explicativa — la decisión queda
     auditada con actor humano.
  3. Tras el análisis, el producto vuelve a veredicto no bloqueante.
- **Estado actual (2026-11-21)**: la base entregada contiene la captura línea
  base v1 de la fuente (cambio `NEW`/MEDIO, abierto — márcalo revisado tras
  leer la fuente). Ningún CRÍTICO abierto en esta base; si el vigilante detecta
  uno nuevo, aparecerá aquí y bloqueará el producto hasta tu análisis.
- Regla fija §5.1: publicación por automatización de navegador sin API oficial
  para YouTube/X está **BLOQUEADA** siempre; solo se publica por API oficial o
  acción humana en modo asistido.

## 10. Rotación de secretos (obligatorio tras la sesión de cierre)

1. **Token de GitHub expuesto**: durante la sesión de cierre se usó un token
   personal (`ghp_…`) que quedó expuesto en el historial del chat. Revócalo YA:
   GitHub → Settings → Developer settings → Personal access tokens → elimina/
   regenera ese token. Si creas uno nuevo para pushes/CI, nunca lo pegues en
   código ni en el chat: usa el gestor de credenciales de tu máquina o un
   secret manager.
2. **Secretos de workers de prueba**: si registraste workers de prueba en el
   panel de desarrollo, elimínalos (Grupos de Facebook → Workers) y registra
   los reales; sus secretos se muestran una sola vez.
3. **Rotación periódica**: `HARNESS_WEBHOOK_SECRET` y `WHATSAPP_DAEMON_TOKEN`
   cada 90 días: actualiza ambos lados (panel + conector) y reinicia. La
   rotación del secreto invalida sesiones firmadas antiguas, no la sesión de
   WhatsApp en sí.

## 11. Tick externo opcional (cron del sistema)

El bucle interno corre cada 60 s. Alternativa: `POST /api/scheduler
{"action":"tick"}` cada minuto con firma HMAC del `HARNESS_WEBHOOK_SECRET`
(`x-harness-signature: sha256=<hex>` del cuerpo crudo).

## 12. Checklist de la primera semana

- [ ] Panel arriba tras proxy con `PANEL_TOKEN` + `HARNESS_WEBHOOK_SECRET`.
- [ ] Telegram: bot creado, `getMe` OK, bot admin del canal, cuenta en la marca.
- [ ] WhatsApp: conector arriba, QR vinculado, token del conector en Ajustes.
- [ ] FB-GROUPS: worker registrado, sesión Chrome OK, grupos sincronizados,
      antigüedad declarada con honestidad.
- [ ] Postiz (si se usa IG/FB por API): API key, integraciones conectadas,
      prefijo correcto.
- [ ] ScrapeCreators: key cargada (investigación + comentarios públicos).
- [ ] Centro de Cumplimiento Meta: fuentes verificadas, cambios analizados.
- [ ] Backup de `app/prisma/db/harness.db` programado.
- [ ] Riesgos de baneo leídos y aceptados (§8) y token de GitHub revocado (§10).
