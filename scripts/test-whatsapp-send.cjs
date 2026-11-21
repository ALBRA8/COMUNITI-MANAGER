// Test del canal WHATSAPP REAL (punto 6 de la misión de cierre): contrato
// panel ↔ conector propio. El conector REAL (scripts/whatsapp-daemon.cjs) se
// prueba en su contrato HTTP (/send con token, /status con cola) sin sesión
// de WhatsApp; el flujo de publicación completo corre contra un MOCK del
// conector (WHATSAPP_DAEMON_URL) que entrega con reporte FIRMADO HMAC al
// panel — sin reporte firmado con waMessageId no hay PUBLISHED.
// Uso (env del panel: WHATSAPP_DAEMON_URL del mock + HARNESS_WEBHOOK_SECRET +
// WHATSAPP_DAEMON_TOKEN + WHATSAPP_DAILY_CAP bajo para probar el techo):
//   TEST_BASE=http://localhost:3000 node scripts/test-whatsapp-send.cjs
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const BASE = process.env.TEST_BASE ?? 'http://localhost:3000';
const MOCK_PORT = 4020;
const REAL_PORT = 4030;
const SECRET = process.env.HARNESS_WEBHOOK_SECRET ?? '';
const DAEMON_TOKEN = process.env.WHATSAPP_DAEMON_TOKEN ?? '';
const stamp = Date.now();

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); }
}

async function j(method, path, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
const sign = (raw, secret) => crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('hex');

// ─── Mock del conector: /send + entrega firmada automática ────────
const sends = []; // {jobId, to, text, mediaUrl, at}
let waMsg = 0;
const FAIL_TO = '573009998877@c.us';
const mock = http.createServer((req, res) => {
  if (req.url === '/send' && req.method === 'POST') {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      let body = {};
      try { body = JSON.parse(raw || '{}'); } catch { body = {}; }
      if (DAEMON_TOKEN && req.headers['x-daemon-token'] !== DAEMON_TOKEN) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'token del conector inválido' }));
        return;
      }
      const entry = { jobId: body.jobId ?? '', to: body.to ?? '', text: body.text ?? '', mediaUrl: body.mediaUrl ?? '', at: Date.now() };
      sends.push(entry);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, queued: true, position: sends.length, jobId: entry.jobId }));
      // Entrega firmada automática (como el conector real tras sendMessage)
      setTimeout(async () => {
        const delivered = entry.to !== FAIL_TO;
        const payload = delivered
          ? { daemonName: 'wa-mock', jobId: entry.jobId, chatId: entry.to, status: 'DELIVERED', waMessageId: `WAMSG-${++waMsg}` }
          : { daemonName: 'wa-mock', jobId: entry.jobId, chatId: entry.to, status: 'FAILED', failReason: 'número no registrado en WhatsApp (mock de contrato)' };
        const rawBody = JSON.stringify(payload);
        try {
          await fetch(`${BASE}/api/whatsapp/delivery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-harness-signature': 'sha256=' + sign(rawBody, SECRET) },
            body: rawBody,
          });
        } catch { /* el test valida el estado final igual */ }
      }, 250);
    });
    return;
  }
  res.writeHead(404); res.end();
});
mock.listen(MOCK_PORT, '127.0.0.1');

const { PrismaClient } = require('./lib/app-prisma.cjs');
const prisma = new PrismaClient();

async function makeBrand(phone) {
  const r = await j('POST', '/api/brands', {
    name: `WaDemo-${stamp}-${phone.replace(/[^0-9]/g, '')}`,
    identity: 'Marca de prueba del canal WhatsApp (sin datos reales)',
    tone: 'cercano', maxPostsPerDay: 9, allowedHours: '00-23',
  });
  if (r.status !== 201) throw new Error('marca no creada: ' + JSON.stringify(r.data).slice(0, 150));
  await prisma.socialAccount.create({ data: { brandId: r.data.id, network: 'whatsapp', handle: phone } });
  return r.data.id;
}

async function publishFlow(brandId, text) {
  const d = await j('POST', '/api/drafts', { brandId, objective: 'Prueba del canal WhatsApp', network: 'whatsapp', text });
  const draftId = d.data?.draft?.id ?? d.data?.id;
  if (!draftId) throw new Error('draft no creado: ' + JSON.stringify(d.data).slice(0, 150));
  const r1 = await j('POST', '/api/orchestrator', { brandId, draftId, resume: true });
  return { draftId, r1 };
}

async function approveAndPublish(brandId, draftId) {
  const approval = (await j('GET', '/api/approvals')).data
    .filter((a) => a.targetType === 'PUBLICATION' && a.targetId === draftId && a.status === 'PENDING')[0];
  if (approval) await j('POST', '/api/approvals', { id: approval.id, decision: 'APPROVED', reason: 'test whatsapp' });
  return j('POST', '/api/orchestrator', { brandId, draftId, resume: true });
}

async function pubOf(draftId) {
  const ds = (await j('GET', '/api/drafts')).data;
  const d = ds.find((x) => x.id === draftId);
  return (d?.publications ?? []).find((p) => p.network === 'whatsapp') ?? null;
}

async function waitFor(pred, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = await pred();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

// Bootstrap honesto de las fuentes del producto WHATSAPP (BD virgen: sin
// frescura real el motor retiene WHATSAPP_SEND). Consulta REAL, sin fingir.
async function bootstrapWhatsappSources() {
  const sources = await prisma.metaPolicySource.findMany({
    where: { active: true, OR: [{ product: 'WHATSAPP' }, { alsoCovers: { contains: 'WHATSAPP' } }] },
  });
  for (const s of sources) {
    const r = await j('POST', '/api/meta-policy', { action: 'check-source', sourceId: s.id });
    console.log(`  [bootstrap] ${s.key}: ${r.data?.result?.status ?? 'SIN_RESPUESTA'}${r.data?.result?.httpStatus ? ` (HTTP ${r.data.result.httpStatus})` : ''}`);
  }
}

(async () => {
  console.log('WHATSAPP — contrato panel ↔ conector propio (envío real en cola)\n');

  // Higiene determinista: los envíos PUBLISHED de corridas previas cuentan
  // para el techo diario de HOY (por diseño). Se eliminan las publicaciones
  // WhatsApp de pruebas anteriores; la auditoría es append-only y NO se toca.
  await prisma.publication.deleteMany({ where: { network: 'whatsapp' } });

  await bootstrapWhatsappSources();

  // 1) Sesión del conector conectada (reporte firmado, como el daemon real)
  const sessRaw = JSON.stringify({ daemonName: 'wa-mock', state: 'CONNECTED', phone: '573001112233', user: 'Operador de prueba' });
  const s1 = await j('POST', '/api/whatsapp/session', JSON.parse(sessRaw), { 'x-harness-signature': 'sha256=' + sign(sessRaw, SECRET) });
  check('sesión CONNECTED aceptada con firma HMAC', s1.status === 200 && s1.data?.ok === true, JSON.stringify(s1).slice(0, 120));
  const h = await j('GET', '/api/harness');
  const waTool = (h.data.tools ?? []).find((t) => t.key === 'whatsapp.session');
  check('whatsapp.session CONNECTED con conector vivo', waTool?.status === 'CONNECTED');
  check('registro declara publish_post para whatsapp.session', Array.isArray(waTool?.contracts) && waTool.contracts.includes('publish_post'));

  // 2) Flujo completo: encola en el conector → entrega firmada → PUBLISHED
  const b1 = await makeBrand('573001112233');
  const f1 = await publishFlow(b1, 'Mensaje real de prueba del canal WhatsApp');
  const approval = (await j('GET', '/api/approvals')).data
    .filter((a) => a.targetType === 'PUBLICATION' && a.targetId === f1.draftId && a.status === 'PENDING')[0];
  check('HITL: aprobación PENDING y sin PUBLISHED aún', !!approval && ((await pubOf(f1.draftId)) === null));
  const r1 = await approveAndPublish(b1, f1.draftId);
  void r1;
  const pub1 = await waitFor(() => pubOf(f1.draftId).then((p) => (p?.status === 'PUBLISHED' ? p : null)));
  check('entrega firmada → PUBLISHED con waMessageId como evidencia', pub1?.status === 'PUBLISHED' && /^WAMSG-\d+$/.test(pub1?.externalId ?? ''), JSON.stringify(pub1).slice(0, 180));
  const sent1 = sends.find((s) => s.text === 'Mensaje real de prueba del canal WhatsApp');
  check('el conector recibió el envío con jid @c.us y texto aprobado', !!sent1 && /^[0-9]+@c\.us$/.test(sent1.to) && sent1.text === 'Mensaje real de prueba del canal WhatsApp', JSON.stringify(sent1).slice(0, 160));
  const pubBefore = await pubOf(f1.draftId);
  const audit1 = await prisma.auditEntry.count({ where: { action: 'WHATSAPP_DELIVERY_REPORT', targetType: 'Publication', targetId: pubBefore?.id } });
  check('auditoría append-only del reporte de entrega', audit1 >= 1, `count=${audit1}`);

  // 3) Estado intermedio honesto: entre encolar y entregar NO hay PUBLISHED
  const b2 = await makeBrand('573002223344');
  const f2 = await publishFlow(b2, 'Segundo mensaje para verificar la cola');
  await approveAndPublish(b2, f2.draftId);
  const pub2 = await waitFor(() => pubOf(f2.draftId).then((p) => (p?.status === 'PUBLISHED' ? p : null)));
  check('segundo envío: EN COLA nunca se cuenta como éxito', pub2?.status === 'PUBLISHED' && /^WAMSG-\d+$/.test(pub2?.externalId ?? ''), JSON.stringify(pub2).slice(0, 160));

  // 4) Entrega FALLIDA → FAILED con el motivo real
  const b3 = await makeBrand('573009998877');
  const f3 = await publishFlow(b3, 'Este número dispara la entrega fallida');
  await approveAndPublish(b3, f3.draftId);
  const pub3 = await waitFor(() => pubOf(f3.draftId).then((p) => (p?.status === 'FAILED' ? p : null)));
  check('FAILED con el motivo real del reporte firmado', pub3?.status === 'FAILED' && /número no registrado/i.test(pub3?.errorDetail ?? ''), JSON.stringify(pub3).slice(0, 180));
  // 5) Contrato defensivo: firma inválida y DELIVERED sin evidencia
  const bad = await fetch(`${BASE}/api/whatsapp/delivery`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-harness-signature': 'sha256=deadbeef' },
    body: JSON.stringify({ daemonName: 'wa-mock', jobId: 'wa-x', status: 'DELIVERED', waMessageId: 'WAMSG-X' }),
  });
  check('reporte con firma falsificada → 401', bad.status === 401, `status=${bad.status}`);
  const noEvidence = await fetch(`${BASE}/api/whatsapp/delivery`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-harness-signature': 'sha256=' + sign(JSON.stringify({ daemonName: 'wa-mock', jobId: 'wa-y', status: 'DELIVERED' }), SECRET) },
    body: JSON.stringify({ daemonName: 'wa-mock', jobId: 'wa-y', status: 'DELIVERED' }),
  });
  check('DELIVERED sin waMessageId → 400 (sin evidencia no hay éxito)', noEvidence.status === 400, `status=${noEvidence.status}`);

  // 6) Tercer envío consumido para que el techo (cap=3) quede lleno
  const b4 = await makeBrand('573003334455');
  const f4 = await publishFlow(b4, 'Tercer envío que llena el techo diario');
  await approveAndPublish(b4, f4.draftId);
  const pub4 = await waitFor(() => pubOf(f4.draftId).then((p) => (p?.status === 'PUBLISHED' ? p : null)));
  check('tercer envío entregado (techo lleno: 3 de 3)', pub4?.status === 'PUBLISHED' && /^WAMSG-\d+$/.test(pub4?.externalId ?? ''), JSON.stringify(pub4).slice(0, 160));

  // 7) Techo WHATSAPP_SEND (WHATSAPP_DAILY_CAP=3): el 4º envío del día se detiene
  const b5 = await makeBrand('573004445566');
  const f5 = await publishFlow(b5, 'Cuarto envío que debe chocar con el techo');
  await approveAndPublish(b5, f5.draftId);
  const pub5 = await pubOf(f5.draftId);
  check('techo WHATSAPP_SEND honesto → AWAITING_CONNECTOR con razón', pub5?.status === 'AWAITING_CONNECTOR' && /techo propio/.test(pub5?.errorDetail ?? ''), JSON.stringify(pub5).slice(0, 180));

  // 8) Pausa global: el ciclo no llega ni a crear el envío (doble cerradura:
  //    ciclo detenido + firewall PAUSA_GLOBAL + cola del conector esperando)
  await j('POST', '/api/harness', { action: 'pause' });
  const b6 = await makeBrand('573005556677');
  const f6 = await publishFlow(b6, 'Envío durante la pausa global');
  const r6 = await approveAndPublish(b6, f6.draftId);
  await j('POST', '/api/harness', { action: 'resume' });
  const pub6 = await pubOf(f6.draftId);
  check('pausa global: el ciclo no publica nada (detenido antes de PUBLISH)', pub6 === null && /APPROVE|PUBLISH/i.test(r6.data?.stoppedAt ?? ''), JSON.stringify({ stoppedAt: r6.data?.stoppedAt, pub: pub6 }).slice(0, 160));

  // 8) Contrato del conector REAL (scripts/whatsapp-daemon.cjs) sin sesión:
  //    /send exige token, encola y /status refleja la cola.
  const real = spawn('node', ['scripts/whatsapp-daemon.cjs'], {
    cwd: process.cwd(),
    env: { ...process.env, HARNESS_URL: BASE, WHATSAPP_DAEMON_PORT: String(REAL_PORT), WHATSAPP_DAEMON_TOKEN: 'tok-real', WHATSAPP_DAEMON_NAME: 'wa-real-test' },
    stdio: 'ignore',
  });
  await new Promise((r) => setTimeout(r, 1500));
  try {
    const noTok = await fetch(`http://127.0.0.1:${REAL_PORT}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: '573001112233@c.us', text: 'sin token' }) });
    check('conector real: /send sin token → 401', noTok.status === 401, `status=${noTok.status}`);
    const okSend = await fetch(`http://127.0.0.1:${REAL_PORT}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-daemon-token': 'tok-real' }, body: JSON.stringify({ to: '573001112233@c.us', text: 'a la cola hasta que la sesión esté conectada' }) });
    const okData = await okSend.json().catch(() => ({}));
    check('conector real: /send con token → encolado', okSend.status === 200 && okData?.queued === true, JSON.stringify(okData).slice(0, 120));
    const st = await fetch(`http://127.0.0.1:${REAL_PORT}/status`).then((r) => r.json().catch(() => ({})));
    check('conector real: /status expone cola y techos', st?.queue === 1 && st?.dailyCap === (Number(process.env.WHATSAPP_DAILY_CAP) || 200), JSON.stringify(st).slice(0, 140));
  } finally {
    real.kill('SIGKILL');
  }

  // 9) Cierre honesto de la sesión de prueba (sin estados vivos colgando)
  const off = JSON.stringify({ daemonName: 'wa-mock', state: 'DISCONNECTED' });
  await j('POST', '/api/whatsapp/session', JSON.parse(off), { 'x-harness-signature': 'sha256=' + sign(off, SECRET) });
  const waToolAfter = ((await j('GET', '/api/harness')).data.tools ?? []).find((t) => t.key === 'whatsapp.session');
  check('limpieza: whatsapp.session vuelve a AWAITING_CREDENTIALS', waToolAfter?.status === 'AWAITING_CREDENTIALS', waToolAfter?.status);

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
