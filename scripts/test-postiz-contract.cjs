// Test del contrato POSTIZ (punto 7 de la misión de cierre): adaptador contra
// un MOCK de la API pública de Postiz con las rutas OFICIALES verificadas en
// docs.postiz.com (GET /public/v1/integrations, POST /public/v1/posts,
// POST /public/v1/upload-from-url, GET /public/v1/posts). Valida: auth SIN
// Bearer, ruta oficial, payload por red (settings.__type), media con
// upload-from-url, verificación por listado, red no soportada honesta y la
// consulta al motor para redes Meta.
// Uso (env del panel: POSTIZ_URL + POSTIZ_API_KEY apuntando al mock):
//   TEST_BASE=http://localhost:3000 node scripts/test-postiz-contract.cjs
const http = require('http');
const BASE = process.env.TEST_BASE ?? 'http://localhost:3000';
const MOCK_PORT = 4030;
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

// ─── Mock de la API pública de Postiz (rutas oficiales) ───────────
const calls = []; // {method, path, auth, body, at}
let pzId = 0;
let mediaId = 0;
const mock = http.createServer((req, res) => {
  const url = req.url ?? '';
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    let body = {};
    try { body = JSON.parse(raw || '{}'); } catch { body = {}; }
    const entry = { method: req.method, path: url, auth: req.headers.authorization ?? '', body, at: Date.now() };
    calls.push(entry);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (url === '/public/v1/integrations') {
      res.end(JSON.stringify([
        { id: 'int-ig-1', provider: 'instagram', name: 'IG principal' },
        { id: 'int-fb-1', provider: 'facebook', name: 'FB página' },
      ]));
    } else if (url === '/public/v1/upload-from-url') {
      mediaId += 1;
      res.end(JSON.stringify({ id: `media-${mediaId}`, path: 'https://uploads.test/x.png', status: 'ready' }));
    } else if (url === '/public/v1/posts' && req.method === 'POST') {
      pzId += 1;
      res.end(JSON.stringify([{ postId: `pz-${pzId}`, integration: body?.posts?.[0]?.integration?.id ?? 'int-x' }]));
    } else if (url === '/public/v1/posts' && req.method === 'GET') {
      res.end(JSON.stringify(Array.from({ length: pzId }, (_, i) => ({ postId: `pz-${i + 1}`, integration: 'int-ig-1' }))));
    } else if (/^\/public\/v1\/analytics\/post\//.test(url)) {
      res.end(JSON.stringify({ impressions: 1234, likes: 45 }));
    } else {
      res.writeHead(404); res.end();
    }
  });
});
mock.listen(MOCK_PORT, '127.0.0.1');

const { PrismaClient } = require('./lib/app-prisma.cjs');
const prisma = new PrismaClient();

async function makeBrand(network, handle) {
  const r = await j('POST', '/api/brands', {
    name: `PzDemo-${stamp}-${network}-${handle.replace(/[^a-z0-9]/gi, '')}`,
    identity: 'Marca de prueba de la vía Postiz (sin datos reales)',
    tone: 'claro', maxPostsPerDay: 9, allowedHours: '00-23',
  });
  if (r.status !== 201) throw new Error('marca no creada: ' + JSON.stringify(r.data).slice(0, 150));
  await prisma.socialAccount.create({ data: { brandId: r.data.id, network, handle } });
  return r.data.id;
}

async function publishFlow(brandId, network, text, mediaUrl) {
  const d = await j('POST', '/api/drafts', { brandId, objective: 'Prueba vía Postiz', network, text });
  const draftId = d.data?.draft?.id ?? d.data?.id;
  if (!draftId) throw new Error('draft no creado: ' + JSON.stringify(d.data).slice(0, 150));
  if (mediaUrl) {
    await prisma.postVersion.updateMany({ where: { draftId, network }, data: { mediaJson: JSON.stringify([{ url: mediaUrl }]) } });
  }
  const r1 = await j('POST', '/api/orchestrator', { brandId, draftId, resume: true });
  return { draftId, r1 };
}

async function approveAndPublish(brandId, draftId) {
  const approval = (await j('GET', '/api/approvals')).data
    .filter((a) => a.targetType === 'PUBLICATION' && a.targetId === draftId && a.status === 'PENDING')[0];
  if (approval) await j('POST', '/api/approvals', { id: approval.id, decision: 'APPROVED', reason: 'test postiz' });
  return j('POST', '/api/orchestrator', { brandId, draftId, resume: true });
}

async function pubOf(draftId, network) {
  const ds = (await j('GET', '/api/drafts')).data;
  const d = ds.find((x) => x.id === draftId);
  return (d?.publications ?? []).find((p) => p.network === network) ?? null;
}

(async () => {
  console.log('POSTIZ — contrato contra la API pública oficial (mock)\n');

  // Bootstrap honesto de las fuentes que cubren IG/FB (BD virgen)
  const srcs = await prisma.metaPolicySource.findMany({
    where: { active: true, OR: [{ product: { in: ['INSTAGRAM', 'FACEBOOK_GROUPS'] } }, { alsoCovers: { contains: 'INSTAGRAM' } }] },
  });
  for (const s of srcs) {
    await j('POST', '/api/meta-policy', { action: 'check-source', sourceId: s.id });
  }

  const h = await j('GET', '/api/harness');
  const pzTool = (h.data.tools ?? []).find((t) => t.key === 'postiz.publish');
  check('postiz.publish CONNECTED con POSTIZ_URL/POSTIZ_API_KEY', pzTool?.status === 'CONNECTED');

  // 1) Publicación instagram: auth sin Bearer, ruta oficial, settings por red
  const b1 = await makeBrand('instagram', 'igtest');
  const f1 = await publishFlow(b1, 'instagram', 'Post real vía Postiz para Instagram');
  await approveAndPublish(b1, f1.draftId);
  const pub1 = await pubOf(f1.draftId, 'instagram');
  const post1 = calls.find((c) => c.path === '/public/v1/posts' && c.method === 'POST');
  check('PUBLISHED con postId de la vía como externalId', pub1?.status === 'PUBLISHED' && /^pz-\d+$/.test(pub1?.externalId ?? ''), JSON.stringify(pub1).slice(0, 160));
  check('auth SIN Bearer: Authorization = api-key (docs oficiales)', !!post1 && post1.auth === 'test-pz-key', post1?.auth);
  check('ruta oficial /public/v1/posts', !!post1);
  check('settings.__type instagram + content aprobado', !!post1 && post1.body?.posts?.[0]?.settings?.__type === 'instagram' && post1.body?.posts?.[0]?.value?.[0]?.content === 'Post real vía Postiz para Instagram' && post1.body?.type === 'now', JSON.stringify(post1?.body).slice(0, 220));

  // 2) Verificación por listado (VERIFY phase del ciclo)
  check('verify_publication vía GET /public/v1/posts → VERIFIED', pub1?.verifyStatus === 'VERIFIED', JSON.stringify(pub1?.verifyStatus ?? null));
  check('motor consultó IG_POST (auditoría append-only)', (await prisma.auditEntry.count({ where: { action: 'META_POLICY_CHECK', targetId: 'IG_POST' } })) >= 1);

  // 3) Media: upload-from-url real y adjunto en el payload
  const b2 = await makeBrand('instagram', 'igtest2');
  const f2 = await publishFlow(b2, 'instagram', 'Post con imagen vía Postiz', 'https://uploads.origen.test/foto.jpg');
  await approveAndPublish(b2, f2.draftId);
  const pub2 = await pubOf(f2.draftId, 'instagram');
  const upload = calls.find((c) => c.path === '/public/v1/upload-from-url');
  const post2 = calls.filter((c) => c.path === '/public/v1/posts' && c.method === 'POST').at(-1);
  check('media: upload-from-url y adjunto en value.image', pub2?.status === 'PUBLISHED' && !!upload && upload.body?.url === 'https://uploads.origen.test/foto.jpg' && Array.isArray(post2?.body?.posts?.[0]?.value?.[0]?.image) && post2.body.posts[0].value[0].image.length === 1, JSON.stringify({ pub: pub2?.status, upload: upload?.body, img: post2?.body?.posts?.[0]?.value?.[0]?.image }).slice(0, 220));

  // 4) Red sin settings verificados → CAPACITY_UNAVAILABLE honesta
  const b3 = await makeBrand('threads', 'threadstest');
  const f3 = await publishFlow(b3, 'threads', 'Post de threads que no debe salir por suposición');
  await approveAndPublish(b3, f3.draftId);
  const pub3 = await pubOf(f3.draftId, 'threads');
  check('threads → AWAITING_CONNECTOR (settings no verificados, no se asumen)', pub3?.status === 'AWAITING_CONNECTOR' && /no están verificados/.test(pub3?.errorDetail ?? ''), JSON.stringify(pub3).slice(0, 180));

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
