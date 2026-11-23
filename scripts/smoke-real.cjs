#!/usr/bin/env node
/**
 * PRUEBA DE HUMO REAL Y GUIADA (CIERRE punto 5) — smoke-real.cjs
 *
 * Con las credenciales REALES del operador (cargadas en el .env del panel),
 * publica UN mensaje de prueba por canal — Telegram, WhatsApp y un post vía
 * Postiz — y guarda el enlace o message_id de cada uno como evidencia.
 *
 * Reglas del script:
 * · HITL de verdad: el script NUNCA aprueba por sí mismo. Crea el borrador,
 *   deja la solicitud en la cola de aprobaciones del panel y ESPERA a que el
 *   operador la apruebe en la UI (polling). Sin aprobación no hay envío.
 * · Sin credenciales NO falla: cada canal queda en AWAITING_CREDENTIALS (estado
 *   del panel) o AWAITING_TARGET (falta el destino de la prueba) con la variable
 *   exacta que falta, y el script termina exit 0.
 * · La evidencia se escribe en smoke-real-evidence.json (raíz del repo).
 *
 * Uso (con el panel ya desplegado y con credenciales, ver DEPLOY.md §13):
 *   TEST_BASE=http://localhost:3000 PANEL_TOKEN=... \
 *   SMOKE_TELEGRAM_CHAT=@mi_canal SMOKE_WHATSAPP_TO=573001112233 \
 *   SMOKE_POSTIZ_NETWORK=instagram node scripts/smoke-real.cjs
 * Opciones: --strict (exit 1 si algún canal no publica) · --minutes N (espera
 * de aprobación, default 10) · --evidence RUTA (default smoke-real-evidence.json)
 */
const fs = require('node:fs');
const BASE = (process.env.TEST_BASE ?? 'http://localhost:3000').replace(/\/$/, '');
const PANEL_TOKEN = process.env.PANEL_TOKEN ?? '';
const TG_CHAT = (process.env.SMOKE_TELEGRAM_CHAT ?? '').trim();
const WA_TO = (process.env.SMOKE_WHATSAPP_TO ?? '').trim();
const POSTIZ_NETWORK = (process.env.SMOKE_POSTIZ_NETWORK ?? 'instagram').trim();
const MINUTES = Number(process.env.SMOKE_MINUTES ?? 10);
const WA_WAIT_S = Number(process.env.SMOKE_WA_WAIT_SECONDS ?? 90);
const STRICT = process.argv.includes('--strict');
const evIdx = process.argv.indexOf('--evidence');
const EVIDENCE_PATH = evIdx > -1 ? process.argv[evIdx + 1] : 'smoke-real-evidence.json';
const stamp = Date.now();
const ISO = new Date().toISOString();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function j(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(PANEL_TOKEN ? { 'x-panel-token': PANEL_TOKEN } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const CHANNELS = [
  { key: 'telegram', tool: 'telegram.bot', network: 'telegram',
    targetEnv: 'SMOKE_TELEGRAM_CHAT', target: TG_CHAT,
    creds: ['TELEGRAM_BOT_TOKEN'],
    targetHint: 'handle del canal/grupo destino de la prueba (ej. @mi_canal)' },
  { key: 'whatsapp', tool: 'whatsapp.session', network: 'whatsapp',
    targetEnv: 'SMOKE_WHATSAPP_TO', target: WA_TO,
    creds: ['WHATSAPP_DAEMON_URL', 'WHATSAPP_DAEMON_TOKEN'],
    targetHint: 'número destino de la prueba en formato internacional (ej. 573001112233)' },
  { key: 'postiz', tool: 'postiz.publish', network: POSTIZ_NETWORK,
    targetEnv: null, target: 'auto (integración de Postiz)',
    creds: ['POSTIZ_URL', 'POSTIZ_API_KEY'],
    targetHint: null },
];

const results = {}; // canal → resultado final

async function pubOf(draftId, network) {
  const ds = (await j('GET', '/api/drafts')).data;
  const d = Array.isArray(ds) ? ds.find((x) => x.id === draftId) : null;
  return (d?.publications ?? []).find((p) => p.network === network) ?? null;
}

function approvalOf(draftId) {
  return j('GET', '/api/approvals').then((r) =>
    (Array.isArray(r.data) ? r.data : [])
      .filter((a) => a.targetType === 'PUBLICATION' && a.targetId === draftId)[0] ?? null);
}

(async () => {
  console.log('PRUEBA DE HUMO REAL — COMUNITI-MANAGER (agente independiente de redes sociales)');
  console.log(`panel: ${BASE} · ${ISO}\n`);

  // ── 1) Estado honesto del panel por herramienta ──
  const h = await j('GET', '/api/harness');
  if (h.status !== 200) {
    console.log(`✗ panel inalcanzable (HTTP ${h.status}): arranca el panel y reintenta (DEPLOY.md §1).`);
    for (const c of CHANNELS) results[c.key] = { status: 'PANEL_UNREACHABLE', reason: `panel HTTP ${h.status}` };
    fs.writeFileSync(EVIDENCE_PATH, JSON.stringify({ at: ISO, panel: BASE, channels: results }, null, 2));
    console.log(`\nEvidencia: ${EVIDENCE_PATH}`);
    process.exit(STRICT ? 1 : 0);
  }
  const byKey = new Map((h.data.tools ?? []).map((t) => [t.key, t]));
  const waSession = h.data.whatsappSession ?? {};

  // ── 2) Elegibilidad por canal (sin credenciales → AWAITING_CREDENTIALS) ──
  const eligible = [];
  for (const c of CHANNELS) {
    const tool = byKey.get(c.tool);
    const status = tool?.status ?? 'UNKNOWN';
    if (status !== 'CONNECTED') {
      results[c.key] = {
        status: 'AWAITING_CREDENTIALS',
        missing: c.creds,
        reason: `el panel reporta ${c.tool} en ${status} — define ${c.creds.join(' y ')} en el .env del panel y reinícialo (DEPLOY.md)`,
      };
      continue;
    }
    if (c.key === 'whatsapp' && waSession.linked !== true) {
      results[c.key] = {
        status: 'AWAITING_CREDENTIALS',
        missing: ['sesión de WhatsApp no vinculada'],
        reason: 'conector vivo pero sin sesión: escanea el QR en Panel → Canales → WhatsApp',
      };
      continue;
    }
    if (c.targetEnv && !c.target) {
      results[c.key] = {
        status: 'AWAITING_TARGET',
        missing: [c.targetEnv],
        reason: `el canal está conectado, pero falta ${c.targetEnv} (${c.targetHint})`,
      };
      continue;
    }
    eligible.push(c);
  }

  console.log('Canales:');
  for (const c of CHANNELS) {
    const r = results[c.key];
    console.log(`  · ${c.key}: ${r ? r.status : 'APROBADO_Y_EN_COLA'}${r?.reason ? ` — ${r.reason}` : ''}`);
  }

  // ── 3) Marca efímera + borradores + solicitudes HITL (solo canales elegibles) ──
  const pending = []; // {channel, draftId}
  if (eligible.length) {
    const b = await j('POST', '/api/brands', {
      name: `SMOKE-${stamp}`,
      identity: 'Marca efímera de la prueba de humo guiada (se puede borrar después)',
      tone: 'directo', maxPostsPerDay: 9, allowedHours: '00-23',
    });
    if (b.status !== 201) {
      for (const c of eligible) results[c.key] = { status: 'FAILED', reason: `no se pudo crear la marca de prueba: ${JSON.stringify(b.data).slice(0, 140)}` };
    } else {
      const brandId = b.data.id;
      // Cuentas objetivo reales de la prueba (Telegram/WhatsApp vía BD, mismo
      // patrón de las baterías: la API de marcas crea handles automáticos).
      try {
        const { PrismaClient } = require('./lib/app-prisma.cjs');
        const prisma = new PrismaClient();
        for (const c of eligible) {
          if (c.targetEnv && c.target) {
            await prisma.socialAccount.create({ data: { brandId, network: c.network, handle: c.target } });
          }
        }
        await prisma.$disconnect();
      } catch (e) {
        console.log(`  (aviso) no se pudieron crear las cuentas de prueba: ${e?.message ?? String(e)}`);
      }

      for (const c of eligible) {
        const text = `PRUEBA DE HUMO COMUNITI-MANAGER — ${ISO} — mensaje de prueba aprobado manualmente por el operador (se puede borrar).`;
        const d = await j('POST', '/api/drafts', { brandId, objective: 'Prueba de humo guiada', network: c.network, text });
        const draftId = d.data?.draft?.id ?? d.data?.id;
        if (!draftId) {
          results[c.key] = { status: 'FAILED', reason: `no se pudo crear el borrador: ${JSON.stringify(d.data).slice(0, 140)}` };
          continue;
        }
        await j('POST', '/api/orchestrator', { brandId, draftId, resume: true });
        const approval = await approvalOf(draftId);
        if (!approval || approval.status !== 'PENDING') {
          const pub = await pubOf(draftId, c.network);
          results[c.key] = { status: pub?.status ?? 'UNKNOWN', reason: 'sin solicitud de aprobación pendiente (revisa el panel)', publication: pub };
          continue;
        }
        pending.push({ channel: c.key, network: c.network, draftId, approvalId: approval.id, startedAt: Date.now() });
      }
    }
  }

  // ── 4) Espera GUIADA de la aprobación humana (HITL real, nunca auto-aprueba) ──
  if (pending.length) {
    console.log(`\n► ACCIÓN DEL OPERADOR: abre ${BASE} → Aprobaciones y APRUEBA las ${pending.length} solicitud(es) "Prueba de humo" (${pending.map((p) => p.channel).join(', ')}).`);
    console.log(`  El script espera hasta ${MINUTES} minutos…\n`);
    const deadline = Date.now() + MINUTES * 60_000;
    while (pending.some((p) => !results[p.channel]) && Date.now() < deadline) {
      await sleep(5000);
      for (const p of pending.filter((x) => !results[x.channel])) {
        const ap = await approvalOf(p.draftId);
        if (!ap) continue;
        if (ap.status === 'REJECTED') {
          results[p.channel] = { status: 'REJECTED', reason: 'el operador rechazó la solicitud en el panel', approvalId: p.approvalId };
        }
      }
      // resolve brandId por canal (para el resume correcto)
      for (const p of pending.filter((x) => !results[x.channel])) {
        const ap = await approvalOf(p.draftId);
        if (ap?.status !== 'APPROVED') continue;
        const ds = (await j('GET', '/api/drafts')).data;
        const d = Array.isArray(ds) ? ds.find((x) => x.id === p.draftId) : null;
        const brandId = d?.brandId;
        if (!brandId) continue;
        await j('POST', '/api/orchestrator', { brandId, draftId: p.draftId, resume: true });
        // WhatsApp entrega ASÍNCRONO con reporte firmado: espera corta extra
        const waitMs = p.network === 'whatsapp' ? WA_WAIT_S * 1000 : 15000;
        const tEnd = Date.now() + waitMs;
        let pub = await pubOf(p.draftId, p.network);
        while (pub && pub.status === 'PUBLISHING' && Date.now() < tEnd) {
          await sleep(5000);
          pub = await pubOf(p.draftId, p.network);
        }
        results[p.channel] = {
          status: pub?.status ?? 'UNKNOWN',
          approvalId: p.approvalId,
          publicationId: pub?.id,
          externalId: pub?.externalId ?? null,
          evidence: pub?.externalId
            ? (p.network === 'telegram' ? `enlace: ${pub.externalId}` : `id de evidencia: ${pub.externalId}`)
            : (pub?.errorDetail ?? 'sin evidencia'),
        };
      }
    }
    for (const p of pending.filter((x) => !results[x.channel])) {
      results[p.channel] = { status: 'WAITING_APPROVAL_TIMEOUT', approvalId: p.approvalId, reason: `el operador no aprobó en ${MINUTES} min — la solicitud sigue en el panel` };
    }
  }

  // ── 5) Informe + evidencia ──
  console.log('\nRESULTADO DE LA PRUEBA DE HUMO:');
  for (const c of CHANNELS) {
    const r = results[c.key] ?? { status: 'SKIPPED' };
    console.log(`  · ${c.key}: ${r.status}${r.externalId ? ` — ${r.evidence}` : ''}${r.reason ? ` — ${r.reason}` : ''}`);
  }
  fs.writeFileSync(EVIDENCE_PATH, JSON.stringify({ at: ISO, panel: BASE, channels: results }, null, 2));
  console.log(`\nEvidencia guardada en: ${EVIDENCE_PATH}`);
  const published = Object.values(results).filter((r) => r.status === 'PUBLISHED' || r.status === 'PUBLISHING').length;
  if (STRICT && published < CHANNELS.length) process.exit(1);
  process.exit(0);
})().catch((e) => {
  console.error('Error fatal:', e?.message ?? e);
  console.error('(el panel está arriba? TEST_BASE correcto? — la prueba de humo nunca sustituye al panel)');
  process.exit(STRICT ? 1 : 0);
});
