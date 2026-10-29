// Test dirigido MEJORAS post-P6 (flujo completo por API, sin tocar Facebook):
// score de riesgo pre-vuelo, rotación de adjuntos, bump-comment con delay,
// negrita unicode, proxy por cuenta (enmascarado) y log de entrega por grupo.
// Uso: TEST_BASE=http://localhost:3000 node scripts/test-mejoras-fb.cjs
const BASE = process.env.TEST_BASE ?? 'http://localhost:3000';
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
  console.log('MEJORAS post-P6 — flujo API completo\n');

  // 0) Autonomía L1 para que la variante sea spintax determinista (sin IA en el test)
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  await prisma.setting.upsert({ where: { key: 'autonomy_mode' }, create: { key: 'autonomy_mode', value: 'L1_ASSISTED' }, update: { value: 'L1_ASSISTED' } });
  await prisma.$disconnect();

  // 1) Worker JOVEN con proxy declarado → el riesgo se evalúa en peor caso real
  const reg = await j('POST', '/api/fb-workers', { action: 'register', name: `Mejoras-${stamp}`, baseUrl: `http://localhost:889${stamp % 10}`, mode: 'pc', sessionAgeDays: 2, proxyUrl: 'http://juan:secreto123@proxy-test.local:8080' });
  check('worker joven registrado con proxy', reg.status === 200 && reg.data.worker?.id && reg.data.secret, JSON.stringify(reg.data).slice(0, 120));
  const workerId = reg.data.worker?.id;
  const secret = reg.data.secret;
  if (!workerId || !secret) { console.log('No se pudo registrar worker; abortando.'); process.exit(1); }

  const signed = async (path, payload) => {
    const raw = JSON.stringify(payload);
    return j('POST', path, payload, { 'x-fb-signature': sign(raw, secret) });
  };

  // 1b) GET no expone credenciales del proxy
  const wlist = await j('GET', '/api/fb-workers');
  const wfound = (wlist.data.workers ?? []).find((w) => w.id === workerId);
  check('proxy enmascarado (sin usuario:pass)', wfound?.proxyConfigured === true && wfound?.proxyMasked?.includes('•••') && !wfound?.proxyMasked?.includes('secreto123'), JSON.stringify(wfound?.proxyMasked));
  check('proxyUrl crudo jamás sale por GET', wfound?.proxyUrl === undefined, JSON.stringify(wfound?.proxyUrl));
  check('GET expone usage del día', wfound?.usage && typeof wfound.usage.postsToday === 'number' && wfound.usage.cap === 5, JSON.stringify(wfound?.usage));

  // 2) Importar 16 grupos de prueba (lote grande para disparar el factor de volumen)
  const groupsPayload = Array.from({ length: 16 }, (_, i) => ({ fbId: `grupo-m-${stamp}-${i}`, name: `Grupo Mejoras ${i}`, url: 'https://www.facebook.com/groups/test/', collection: 'test-mejoras' }));
  await j('POST', '/api/fb-groups', { groups: groupsPayload });
  const groupsRes = await j('GET', '/api/fb-groups');
  // Idempotente con DB sucia: solo los grupos de ESTA corrida (fbId lleva el stamp)
  const testGroups = (groupsRes.data.groups ?? []).filter((g) => g.fbId.includes(String(stamp)));
  check('16 grupos de prueba importados', testGroups.length === 16, `got ${testGroups.length}`);

  // 3) Campaña de riesgo ALTO: cuenta 2 días + 12 objetivos + texto corto sin spintax + ventana estrecha + comentario
  const alto = await j('POST', '/api/fb-campaigns', {
    name: `RiesgoAlto-${stamp}`, text: 'promo', mode: 'group', engine: 'dom',
    firstComment: 'enlace', targets: testGroups.map((g) => g.id), windowStart: 10, windowEnd: 11,
  });
  check('campaña de riesgo creada', alto.status === 200 && alto.data.campaign?.id, JSON.stringify(alto.data).slice(0, 160));
  check('riesgo ALTO con factores explicados', alto.data.risk?.level === 'ALTO' && alto.data.risk.score >= 65 && alto.data.risk.factors.length >= 3, JSON.stringify({ score: alto.data.risk?.score, level: alto.data.risk?.level, n: alto.data.risk?.factors?.length }));

  // 4) Campaña de riesgo BAJO: spintax, 1 objetivo, adjunto, ventana amplia, sin comentario
  const bajo = await j('POST', '/api/fb-campaigns', {
    name: `RiesgoBajo-${stamp}`, text: 'Texto largo y variado {con|sin} spintax para un solo grupo, con suficiente contexto natural para no parecer spam', mode: 'group', engine: 'dom',
    mediaUrls: ['https://example.com/foto.jpg'], targets: [testGroups[0].id], windowStart: 0, windowEnd: 24,
  });
  check('riesgo BAJO con mitigante de adjunto', bajo.data.risk?.level === 'BAJO' && bajo.data.risk.factors.some((f) => f.points < 0), JSON.stringify({ score: bajo.data.risk?.score, level: bajo.data.risk?.level }));

  // 5) GET persiste la instantánea de riesgo
  const camps = await j('GET', '/api/fb-campaigns');
  const altoRow = (camps.data.campaigns ?? []).find((c) => c.name === `RiesgoAlto-${stamp}`);
  check('riskScore/riskLevel persistidos', altoRow?.riskScore >= 65 && altoRow?.riskLevel === 'ALTO', `score=${altoRow?.riskScore} level=${altoRow?.riskLevel}`);
  check('jobs del log de entrega incluyen workerName (borrador sin aprobar, gate P2)', Array.isArray(altoRow?.jobs) && altoRow.jobs.length === 16 && ('workerName' in altoRow.jobs[0]) && altoRow.jobs[0].status === 'PENDING_APPROVAL');

  // 5b) Las campañas de riesgo ya cumplieron su papel: se cancelan para que no
  // absorban los claims de las pruebas de rotación (el claim va por createdAt asc).
  await j('PATCH', '/api/fb-campaigns', { campaignId: alto.data.campaign.id, action: 'cancel' });
  await j('PATCH', '/api/fb-campaigns', { campaignId: bajo.data.campaign.id, action: 'cancel' });

  // 6) Rotación de adjuntos: 3 imágenes, 3 objetivos → cada claim 1 imagen, ≥2 distintas
  const rotMedia = [`https://example.com/a-${stamp}.jpg`, `https://example.com/b-${stamp}.jpg`, `https://example.com/c-${stamp}.jpg`];
  const rot = await j('POST', '/api/fb-campaigns', {
    name: `Rotacion-${stamp}`, text: `Texto rotación {uno|dos} con bastante cuerpo para pasar el filtro de longitud del ${stamp}`, mode: 'group', engine: 'dom',
    mediaUrls: rotMedia, mediaMode: 'rotate', targets: testGroups.slice(0, 3).map((g) => g.id), windowStart: 0, windowEnd: 24, approve: true,
  });
  check('campaña con rotación creada', rot.status === 200 && rot.data.campaign?.id, JSON.stringify(rot.data).slice(0, 120));
  const picked = [];
  for (let i = 0; i < 3; i++) {
    const claim = await signed('/api/fb-jobs/claim', { workerId, capacity: 1 });
    const job = claim.data.jobs?.[0];
    if (!job) { check(`claim ${i + 1} entregó job`, false, JSON.stringify(claim.data).slice(0, 120)); break; }
    check(`claim ${i + 1}: 1 sola imagen (rotada)`, Array.isArray(job.mediaUrls) && job.mediaUrls.length === 1, JSON.stringify(job.mediaUrls));
    picked.push(job.mediaUrls?.[0]);
    check(`claim ${i + 1}: commentDelaySec llega al worker`, typeof job.commentDelaySec === 'number');
    await signed('/api/fb-jobs/report', { workerId, results: [{ jobId: job.id, status: 'FAILED', failReason: 'test-rotacion-cleanup' }], sessionStatus: 'IDLE' });
  }
  check('rotación entregó ≥2 imágenes distintas', new Set(picked).size >= 2, JSON.stringify(picked));

  // 7) Bump-comment con delay + negrita unicode (L1 → spintax determinista)
  const bold = await j('POST', '/api/fb-campaigns', {
    name: `Bold-${stamp}`, text: 'Nueva {oferta|promo} especial para *compradores* inteligentes este fin de semana con envío gratis', mode: 'group', engine: 'dom',
    firstComment: 'link en comentario', commentDelaySec: 90, boldStyle: 'unicode', targets: [testGroups[0].id], windowStart: 0, windowEnd: 24, approve: true,
  });
  check('campaña bold+delay creada', bold.status === 200 && bold.data.campaign?.id, JSON.stringify(bold.data).slice(0, 120));
  const claimBold = await signed('/api/fb-jobs/claim', { workerId, capacity: 1 });
  const boldJob = claimBold.data.jobs?.[0];
  check('claim trae commentDelaySec=90', boldJob?.commentDelaySec === 90, `got ${boldJob?.commentDelaySec}`);
  check('variante con negrita unicode (𝗰…)', typeof boldJob?.variant === 'string' && /[\u{1D5A0}-\u{1D5D3}\u{1D5BA}-\u{1D5E3}]/u.test(boldJob.variant), JSON.stringify(boldJob?.variant).slice(0, 160));
  check('la variante ya no contiene asteriscos', typeof boldJob?.variant === 'string' && !boldJob.variant.includes('*compradores*'));
  check('variante spintax determinista (L1)', boldJob?.variantSource === 'spintax', boldJob?.variantSource);
  await signed('/api/fb-jobs/report', { workerId, results: [{ jobId: boldJob.id, status: 'FAILED', failReason: 'test-bold-cleanup' }], sessionStatus: 'IDLE' });

  // 8) Validación honesta de proxy inválido
  const badProxy = await j('POST', '/api/fb-workers', { action: 'register', name: `BadProxy-${stamp}`, baseUrl: 'http://localhost:9123', proxyUrl: 'ftp://raro:1@host' });
  check('proxy ftp:// rechazado (400)', badProxy.status === 400, `status=${badProxy.status}`);

  // 9) Limpieza: cancelar campañas, excluir grupos, borrar worker
  for (const c of [alto, bajo, rot, bold]) {
    if (c.data?.campaign?.id) await j('PATCH', '/api/fb-campaigns', { campaignId: c.data.campaign.id, action: 'cancel' });
  }
  for (const g of testGroups) {
    await j('PATCH', '/api/fb-groups', { id: g.id, excluded: true });
  }
  const del = await j('POST', '/api/fb-workers', { action: 'delete', workerId });
  check('worker de prueba eliminado', del.status === 200);

  console.log(`\nResultado: ${pass} ✓ / ${fail} ✗`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
