// Test del canal TELEGRAM REAL (punto 5 de la misión de cierre): ejecutor con
// Bot API contra un servidor MOCK de la Bot API (TELEGRAM_API_BASE apunta al
// mock — solo válido en este entorno de pruebas), HITL real del flujo PUBLISH,
// idempotencia, evidencia message_id, 429/403 honestos, pacing 1 msg/seg por
// chat y techo de grupo (TELEGRAM_GROUP_PER_MINUTE solo puede bajar el techo).
// Uso (con env del panel: TELEGRAM_BOT_TOKEN + TELEGRAM_API_BASE del mock):
//   TEST_BASE=http://localhost:3000 node scripts/test-telegram.cjs
const http = require('http');
const BASE = process.env.TEST_BASE ?? 'http://localhost:3000';
const MOCK_PORT = 4010;
const stamp = Date.now();

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); }
}

async function j(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// ─── Mock de la Bot API: respuestas con la forma real de Telegram ──
const calls = []; // {method, chat_id, text, photo, at}
let msgId = 100;
const SCRIPT = new Map([
  ['@canal_429', { body: { ok: false, error_code: 429, description: 'Too Many Requests: retry after 3', parameters: { retry_after: 3 } } }],
  ['@canal_403', { body: { ok: false, error_code: 403, description: 'Forbidden: bot is not an administrator of the specified chat' } }],
]);
const mock = http.createServer((req, res) => {
  const m = (req.url ?? '').match(/^\/bot[^/]+\/(sendMessage|sendPhoto)$/);
  if (req.method === 'POST' && m) {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      let body = {};
      try { body = JSON.parse(raw || '{}'); } catch { body = {}; }
      const chatId = String(body.chat_id ?? '');
      calls.push({ method: m[1], chat_id: chatId, text: body.text ?? body.caption ?? '', photo: body.photo ?? '', at: Date.now() });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const script = SCRIPT.get(chatId);
      if (script) res.end(JSON.stringify(script.body));
      else {
        msgId += 1;
        res.end(JSON.stringify({ ok: true, result: { message_id: msgId, chat: { id: -100987654321, username: 'canaldemo' }, date: Math.floor(Date.now() / 1000) } }));
      }
    });
    return;
  }
  res.writeHead(404); res.end();
});
mock.listen(MOCK_PORT, '127.0.0.1');

const { PrismaClient } = require('./lib/app-prisma.cjs');
const prisma = new PrismaClient();

async function makeBrand(handle) {
  const r = await j('POST', '/api/brands', {
    name: `TgDemo-${stamp}-${String(handle || 'sin-cuenta').replace(/[^a-z0-9]/gi, '')}`,
    identity: 'Marca de prueba del canal Telegram (sin datos reales)',
    tone: 'directo', maxPostsPerDay: 9, allowedHours: '00-23',
  });
  if (r.status !== 201) throw new Error('marca no creada: ' + JSON.stringify(r.data).slice(0, 150));
  if (handle) await prisma.socialAccount.create({ data: { brandId: r.data.id, network: 'telegram', handle } });
  return r.data.id;
}

async function publishFlow(brandId, text, mediaUrl) {
  const d = await j('POST', '/api/drafts', { brandId, objective: 'Prueba del canal Telegram', network: 'telegram', text });
  const draftId = d.data?.draft?.id ?? d.data?.id;
  if (!draftId) throw new Error('draft no creado: ' + JSON.stringify(d.data).slice(0, 150));
  if (mediaUrl) {
    await prisma.postVersion.updateMany({ where: { draftId, network: 'telegram' }, data: { mediaJson: JSON.stringify([{ url: mediaUrl }]) } });
  }
  // 1er resume: el ciclo llega a APPROVE y se detiene esperando HITL
  const r1 = await j('POST', '/api/orchestrator', { brandId, draftId, resume: true });
  const approval = (await j('GET', '/api/approvals')).data
    .filter((a) => a.targetType === 'PUBLICATION' && a.targetId === draftId && a.status === 'PENDING')[0];
  return { draftId, r1, approval };
}

async function approveAndPublish(brandId, draftId) {
  const approval = (await j('GET', '/api/approvals')).data
    .filter((a) => a.targetType === 'PUBLICATION' && a.targetId === draftId && a.status === 'PENDING')[0];
  if (approval) await j('POST', '/api/approvals', { id: approval.id, decision: 'APPROVED', reason: 'test telegram' });
  return j('POST', '/api/orchestrator', { brandId, draftId, resume: true });
}

async function pubOf(draftId) {
  const ds = (await j('GET', '/api/drafts')).data;
  const d = ds.find((x) => x.id === draftId);
  return (d?.publications ?? []).find((p) => p.network === 'telegram') ?? null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('TELEGRAM — ejecutor real con Bot API (mock de la red)\n');

  // Bootstrap honesto de las fuentes TELEGRAM (BD virgen): sin frescura real
  // el motor retiene TELEGRAM_POST. Consulta REAL contra core.telegram.org,
  // sin fingir frescura (si la red no responde, el test falla honesto).
  const tgSources = await prisma.metaPolicySource.findMany({
    where: { active: true, OR: [{ product: 'TELEGRAM' }, { alsoCovers: { contains: 'TELEGRAM' } }] },
  });
  for (const s of tgSources) {
    const r = await j('POST', '/api/meta-policy', { action: 'check-source', sourceId: s.id });
    console.log(`  [bootstrap] ${s.key}: ${r.data?.result?.status ?? 'SIN_RESPUESTA'}${r.data?.result?.httpStatus ? ` (HTTP ${r.data.result.httpStatus})` : ''}`);
  }

  const h = await j('GET', '/api/harness');
  check('panel operativo', h.status === 200 && h.data.status === 'OPERATIONAL');
  const tgTool = (h.data.tools ?? []).find((t) => t.key === 'telegram.bot');
  check('telegram.bot CONNECTED con TELEGRAM_BOT_TOKEN', tgTool?.status === 'CONNECTED');
  check('registro declara publish_post para telegram.bot', Array.isArray(tgTool?.contracts) && tgTool.contracts.includes('publish_post'));

  // 1) HITL: el ciclo se detiene en APPROVE sin publicar nada
  const b0 = await makeBrand(null);
  const f0 = await publishFlow(b0, 'Mensaje sin cuenta de destino');
  check('HITL: ciclo detenido en APPROVE esperando humano', !!f0.approval && f0.r1.data?.phases?.some((p) => p.phase === 'APPROVE' && p.status === 'WAITING_APPROVAL'), JSON.stringify(f0.r1.data?.phases ?? []).slice(0, 160));
  check('sin aprobación NO hay publicación', (await pubOf(f0.draftId)) === null);

  // 2) Publicar sin cuenta de telegram en la marca → honesto
  const r0 = await approveAndPublish(b0, f0.draftId);
  void r0;
  const pub0 = await pubOf(f0.draftId);
  check('sin cuenta de la marca → AWAITING_CONNECTOR con razón explícita', pub0?.status === 'AWAITING_CONNECTOR' && /cuenta\/canal/i.test(pub0?.errorDetail ?? ''), JSON.stringify(pub0).slice(0, 160));

  // 3) Flujo completo feliz: sendMessage con evidencia message_id
  const b1 = await makeBrand('@canal_demo');
  const f1 = await publishFlow(b1, 'Post real de prueba del canal Telegram');
  const r1 = await approveAndPublish(b1, f1.draftId);
  check('PUBLISH ejecutado en el ciclo', r1.data?.phases?.some((p) => p.phase === 'PUBLISH'), JSON.stringify(r1.data?.phases ?? []).slice(0, 160));
  const pub1 = await pubOf(f1.draftId);
  check('PUBLISHED con externalId t.me (message_id como evidencia)', pub1?.status === 'PUBLISHED' && /^https:\/\/t\.me\/canaldemo\/\d+$/.test(pub1?.externalId ?? ''), JSON.stringify(pub1).slice(0, 160));
  const sent1 = calls.filter((c) => c.chat_id === '@canal_demo' && c.method === 'sendMessage');
  check('mock recibió sendMessage con chat_id y texto aprobado', sent1.length === 1 && sent1[0].text === 'Post real de prueba del canal Telegram', JSON.stringify(sent1).slice(0, 140));

  // 4) Idempotencia: re-PUBLISH del mismo draft NO reenvía
  const before = calls.length;
  await j('POST', '/api/orchestrator', { brandId: b1, draftId: f1.draftId, resume: true });
  const pub1b = await pubOf(f1.draftId);
  check('re-intento → sin duplicar envío y sigue PUBLISHED', calls.length === before && pub1b?.status === 'PUBLISHED', JSON.stringify({ callsDelta: calls.length - before, s: pub1b?.status }).slice(0, 120));

  // 5) Media: sendPhoto con caption del texto aprobado
  const b2 = await makeBrand('@canal_media');
  const f2 = await publishFlow(b2, 'Post con imagen adjunta', 'http://127.0.0.1:1/foto-demo.jpg');
  await approveAndPublish(b2, f2.draftId);
  const pub2 = await pubOf(f2.draftId);
  check('media: sendPhoto con caption del texto aprobado', pub2?.status === 'PUBLISHED' && calls.some((c) => c.chat_id === '@canal_media' && c.method === 'sendPhoto' && c.photo === 'http://127.0.0.1:1/foto-demo.jpg' && c.text === 'Post con imagen adjunta'), JSON.stringify(pub2).slice(0, 140));

  // 6) 429 → backoff honesto con retry_after
  const b3 = await makeBrand('@canal_429');
  const f3 = await publishFlow(b3, 'Este chat dispara el 429 del mock');
  await approveAndPublish(b3, f3.draftId);
  const pub3 = await pubOf(f3.draftId);
  check('429 → FAILED con retry_after explícito (backoff honesto)', pub3?.status === 'FAILED' && /429/.test(pub3?.errorDetail ?? '') && /retry_after 3/.test(pub3?.errorDetail ?? ''), JSON.stringify(pub3).slice(0, 180));

  // 7) 403 → fallo honesto
  const b4 = await makeBrand('@canal_403');
  const f4 = await publishFlow(b4, 'Este chat dispara el 403 del mock');
  await approveAndPublish(b4, f4.draftId);
  const pub4 = await pubOf(f4.draftId);
  check('403 (bot sin permiso) → FAILED con el motivo real', pub4?.status === 'FAILED' && /403/.test(pub4?.errorDetail ?? ''), JSON.stringify(pub4).slice(0, 160));

  // 8) Pacing 1 msg/seg por chat (dos envíos al mismo chat)
  const b5 = await makeBrand('@canal_ritmo');
  const f5a = await publishFlow(b5, 'Ritmo parte 1');
  await approveAndPublish(b5, f5a.draftId);
  await sleep(50);
  const f5b = await publishFlow(b5, 'Ritmo parte 2');
  await approveAndPublish(b5, f5b.draftId);
  const ritmo = calls.filter((c) => c.chat_id === '@canal_ritmo' && c.text.startsWith('Ritmo parte'));
  const gap = ritmo.length === 2 ? ritmo[1].at - ritmo[0].at : -1;
  check('pacing 1 msg/seg por chat respetado (gap ≥ 900 ms)', ritmo.length === 2 && gap >= 900, `gap=${gap}ms`);

  // 9) Techo de grupo: TELEGRAM_GROUP_PER_MINUTE=2 (el env solo puede bajar el techo)
  const b6 = await makeBrand('@canal_techo');
  const techoPubs = [];
  for (let i = 1; i <= 3; i++) {
    const f = await publishFlow(b6, `Techo parte ${i}`);
    await approveAndPublish(b6, f.draftId);
    techoPubs.push(await pubOf(f.draftId));
    await sleep(1100); // separa también el pacing 1/seg
  }
  check('techo de grupo honesto: el 3er envío en la ventana se detiene', techoPubs[0]?.status === 'PUBLISHED' && techoPubs[1]?.status === 'PUBLISHED' && techoPubs[2]?.status === 'FAILED' && /msg\/min/.test(techoPubs[2]?.errorDetail ?? ''), JSON.stringify(techoPubs.map((p) => ({ s: p?.status, e: (p?.errorDetail ?? '').slice(0, 90) }))).slice(0, 260));

  // 10) El motor dejó traza del veredicto TELEGRAM_POST (auditoría append-only)
  const audit = await prisma.auditEntry.count({ where: { action: 'META_POLICY_CHECK', targetId: 'TELEGRAM_POST' } });
  check('motor de cumplimiento consultó TELEGRAM_POST (auditoría)', audit >= 1, `count=${audit}`);

  console.log(`\nResultado: ${pass} ✓ / ${fail} ✗`);
  mock.close();
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('FATAL', e);
  mock.close();
  try { await prisma.$disconnect(); } catch { /* nada */ }
  process.exit(1);
});
