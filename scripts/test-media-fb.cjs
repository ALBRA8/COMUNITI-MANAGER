// Test dirigido P1: adjuntos de imagen en FB-GROUPS (flujo completo por API, sin tocar Facebook).
// 1) registra worker (HMAC)  2) importa grupo  3) crea campañas con adjuntos (válido/inválido/exceso)
// 4) claim firmado → verifica mediaUrls en el payload del job  5) reporta FAILED y limpia.
const BASE = process.env.TEST_BASE ?? 'http://localhost:3199';
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

const sign = (raw, secret) => require('node:crypto').createHmac('sha256', secret).update(raw).digest('hex');

(async () => {
  console.log('P1 ADJUNTOS — flujo API completo\n');

  // 1) Registrar worker
  const reg = await j('POST', '/api/fb-workers', { action: 'register', name: `MediaTest-${stamp}`, baseUrl: 'http://localhost:8765', mode: 'pc', sessionAgeDays: 30 });
  check('worker registrado', reg.status === 200 && reg.data.worker?.id && reg.data.secret, JSON.stringify(reg.data).slice(0, 120));
  const workerId = reg.data.worker?.id;
  const secret = reg.data.secret;
  if (!workerId || !secret) { console.log('No se pudo registrar worker; abortando.'); process.exit(1); }

  const signed = async (path, payload) => {
    const raw = JSON.stringify(payload);
    return j('POST', path, payload, { 'x-fb-signature': sign(raw, secret) });
  };

  // 2) Importar grupo de prueba (y excluirlo al final para no ensuciar rotación)
  const imp = await j('POST', '/api/fb-groups', { groups: [{ fbId: `grupo-media-${stamp}`, name: `Grupo Media ${stamp}`, url: 'https://www.facebook.com/groups/test/', collection: 'test-p1' }] });
  const groupsRes = await j('GET', '/api/fb-groups');
  const group = (groupsRes.data.groups ?? []).find((g) => g.fbId === `grupo-media-${stamp}`);
  check('grupo importado', Boolean(group));

  // 2b) Higiene pre-claim: cancelar residuos en cola de otras baterías de tests (el claim reparte por createdAt asc y no distingue baterías; se ejecuta ANTES de crear las campañas propias)
  const todas = await j('GET', '/api/fb-campaigns');
  const PREFIJOS_TEST = ['Gate P2 ', 'Directa P2 ', 'Borrador a cancelar P2 ', 'Lanzamiento demo', 'Mejoras-', 'RiesgoAlto-', 'RiesgoBajo-', 'Rotacion-', 'Bold-', 'BadProxy-', 'MediaOK-', 'MediaX-', 'MediaI-'];
  for (const c of todas.data.campaigns ?? []) {
    if (PREFIJOS_TEST.some((p) => String(c.name ?? '').startsWith(p)) && ['DRAFT', 'QUEUED', 'PAUSED'].includes(c.status)) {
      await j('PATCH', '/api/fb-campaigns', { campaignId: c.id, action: 'cancel' });
    }
  }

  // 3a) Campaña con adjuntos válidos (URL + ruta local)
  const mediaOk = ['https://example.com/foto-promo.jpg', '/tmp/local-imagen.png'];
  const ok = await j('POST', '/api/fb-campaigns', { name: `MediaOK-${stamp}`, text: 'Texto de prueba {con|sin} spintax', mode: 'group', engine: 'dom', mediaUrls: mediaOk, targets: [group.id], windowStart: 0, windowEnd: 24, approve: true });
  check('campaña con 2 adjuntos creada', ok.status === 200 && ok.data.campaign?.id, JSON.stringify(ok.data).slice(0, 120));

  // 3b) Exceso: 5 adjuntos → 400
  const exceso = await j('POST', '/api/fb-campaigns', { name: `MediaX-${stamp}`, text: 'x', mode: 'group', engine: 'dom', mediaUrls: ['https://a.com/1.jpg', 'https://a.com/2.jpg', 'https://a.com/3.jpg', 'https://a.com/4.jpg', 'https://a.com/5.jpg'], targets: [group.id] });
  check('5 adjuntos rechazados (400)', exceso.status === 400, `status=${exceso.status}`);

  // 3c) Adjunto inválido → 400
  const invalido = await j('POST', '/api/fb-campaigns', { name: `MediaI-${stamp}`, text: 'x', mode: 'group', engine: 'dom', mediaUrls: ['ftp://raro.com/foto.jpg'], targets: [group.id] });
  check('adjunto ftp:// rechazado (400)', invalido.status === 400, `status=${invalido.status}`);

  // 4) GET incluye mediaCount
  const camps = await j('GET', '/api/fb-campaigns');
  const found = (camps.data.campaigns ?? []).find((c) => c.name === `MediaOK-${stamp}`);
  check('GET campaigns expone mediaCount=2', found?.mediaCount === 2, `mediaCount=${found?.mediaCount}`);

  // 5) Claim firmado → el job lleva mediaUrls intactas
  const claim = await signed('/api/fb-jobs/claim', { workerId, capacity: 1 });
  const job = claim.data.jobs?.[0];
  check('claim entregó 1 job', Array.isArray(claim.data.jobs) && claim.data.jobs.length === 1, JSON.stringify(claim.data).slice(0, 160));
  check('job.mediaUrls == adjuntos originales', JSON.stringify(job?.mediaUrls) === JSON.stringify(mediaOk), JSON.stringify(job?.mediaUrls));
  check('job conserva variant/firstComment', typeof job?.variant === 'string' && job.variant.length > 0);

  // 6) Reporte honesto FAILED (libera el lease; no se publica nada)
  const rep = await signed('/api/fb-jobs/report', { workerId, results: [{ jobId: job.id, status: 'FAILED', failReason: 'test-P1-cleanup' }], sessionStatus: 'IDLE' });
  check('reporte aplicado', rep.status === 200 && rep.data.applied === 1, JSON.stringify(rep.data).slice(0, 120));

  // 7) Limpieza: cancelar campaña, excluir grupo, borrar worker
  await j('PATCH', '/api/fb-campaigns', { campaignId: ok.data.campaign.id, action: 'cancel' });
  await j('PATCH', '/api/fb-groups', { id: group.id, excluded: true });
  const del = await j('POST', '/api/fb-workers', { action: 'delete', workerId });
  check('worker de prueba eliminado', del.status === 200);

  console.log(`\nResultado: ${pass} ✓ / ${fail} ✗`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
