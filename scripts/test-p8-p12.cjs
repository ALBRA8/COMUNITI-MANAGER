// Test dirigido P8-P12 (destripe Metricool): informe de campaña imprimible,
// biblioteca de media por marca, puente agéntico de lectura, y datos para el
// calendario/heatmap (esos dos se verifican en navegador aparte).
// Uso: TEST_BASE=http://localhost:3000 node scripts/test-p8-p12.cjs
const BASE = process.env.TEST_BASE ?? 'http://localhost:3000';
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

async function text(method, path) {
  const res = await fetch(`${BASE}${path}`);
  const body = await res.text();
  return { status: res.status, body };
}

(async () => {
  console.log('P8-P12 (destripe Metricool) — flujo API completo\n');

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  // ── P12: biblioteca de media ────────────────────────────────────
  console.log('P12 · Biblioteca de media');
  const urlA = `https://cdn.test/p8p12-${stamp}.png`;
  const mAdd = await j('POST', '/api/fb-media', { url: urlA, label: 'promo-test' });
  check('POST añade media válido', mAdd.status === 200 && mAdd.data.media?.id, JSON.stringify(mAdd.data).slice(0, 120));
  const mediaId = mAdd.data.media?.id;
  const mBad = await j('POST', '/api/fb-media', { url: `ftp://no-valido-${stamp}` });
  check('POST rechaza esquema no http(s)/ruta local', mBad.status === 400, JSON.stringify(mBad.data));
  const mDupe = await j('POST', '/api/fb-media', { url: urlA, label: 'promo-test' });
  check('POST rechaza duplicado exacto (409)', mDupe.status === 409, JSON.stringify(mDupe.data));
  const mList = await j('GET', '/api/fb-media');
  check('GET lista contiene el media añadido', (mList.data.media ?? []).some((m) => m.id === mediaId));
  const mDel = await j('DELETE', `/api/fb-media?id=${mediaId}`);
  check('DELETE elimina', mDel.status === 200 && mDel.data.ok === true);
  const mList2 = await j('GET', '/api/fb-media');
  check('GET ya no lo lista tras eliminar', !(mList2.data.media ?? []).some((m) => m.id === mediaId));

  // ── P9: informe de campaña ──────────────────────────────────────
  console.log('\nP9 · Informe de campaña');
  const gImport = await j('POST', '/api/fb-groups', { groups: [
    { fbId: `p9-grupo-a-${stamp}`, name: 'Grupo A P9', url: 'https://www.facebook.com/groups/a', collection: 'test' },
    { fbId: `p9-grupo-b-${stamp}`, name: 'Grupo B P9', url: 'https://www.facebook.com/groups/b', collection: 'test' },
  ] });
  check('grupos de prueba importados', gImport.status === 200 && gImport.data.imported === 2, JSON.stringify(gImport.data));
  const gList = await j('GET', '/api/fb-groups');
  const ga = (gList.data.groups ?? []).find((g) => g.fbId === `p9-grupo-a-${stamp}`);
  const gb = (gList.data.groups ?? []).find((g) => g.fbId === `p9-grupo-b-${stamp}`);
  const camp = await j('POST', '/api/fb-campaigns', {
    name: `Informe P9 ${stamp}`, text: 'Texto base para el informe de campaña P9.', mode: 'group',
    windowStart: 7, windowEnd: 21, targets: [ga.id, gb.id],
  });
  check('campaña de prueba creada', camp.status === 200 && camp.data.campaign?.id, JSON.stringify(camp.data).slice(0, 140));
  const campaignId = camp.data.campaign?.id;

  // Un grupo publicado (hora 9 con postUrl) y otro fallido con motivo honesto
  const jobs = await prisma.fbJob.findMany({ where: { campaignId }, orderBy: { createdAt: 'asc' } });
  const now = new Date();
  const at9 = new Date(now); at9.setHours(9, 15, 0, 0);
  const at20 = new Date(now); at20.setHours(20, 40, 0, 0);
  await prisma.fbJob.update({ where: { id: jobs[0].id }, data: { status: 'POSTED', postedAt: at9, postUrl: 'https://www.facebook.com/groups/a/posts/123', variantSource: 'spintax' } });
  await prisma.fbJob.update({ where: { id: jobs[1].id }, data: { status: 'FAILED', failReason: 'no apareció el compositor', updatedAt: at20, attempts: 1 } });

  const rep = await text('GET', `/reports/${campaignId}`);
  check('informe responde 200', rep.status === 200, String(rep.status));
  check('informe contiene el nombre de la campaña', rep.body.includes(`Informe P9 ${stamp}`));
  check('informe contiene KPI tasa de entrega', rep.body.includes('Tasa de entrega') && rep.body.includes('50%'));
  check('informe lista el POSTED con enlace ver post', rep.body.includes('ver post'));
  check('informe muestra el failReason honesto', rep.body.includes('no apareció el compositor'));
  check('informe incluye bitácora de auditoría', rep.body.includes('Bitácora de la campaña') && rep.body.includes('FB_CAMPAIGN_CREATED'));
  check('informe declara que no promete engagement', rep.body.includes('no incluye métricas de engagement'));
  const rep404 = await text('GET', '/reports/no-existe-xyz');
  check('informe inexistente → 404', rep404.status === 404, String(rep404.status));

  // ── P11: puente agéntico (lectura) ──────────────────────────────
  console.log('\nP11 · Puente agéntico fb-groups');
  const agent = await j('GET', '/api/fb-agent/fb-groups');
  check('endpoint responde 200 con module', agent.status === 200 && agent.data.module === 'fb-groups');
  check('declara honestidad del módulo', Array.isArray(agent.data.honesty) && agent.data.honesty.length >= 3);
  check('workers sin exponer secreto ni baseUrl', Array.isArray(agent.data.workers) && agent.data.workers.every((w) => !('secret' in w) && !('baseUrl' in w)));
  check('grupos con active/total numéricos', Number.isFinite(agent.data.groups?.active) && Number.isFinite(agent.data.groups?.total));
  check('campañas con counts completos', Array.isArray(agent.data.campaigns) && agent.data.campaigns.some((c) => c.counts?.total >= 2));
  check('límites anti-ban declarados', agent.data.limits?.nightCut === '22:00-07:00');
  check('capacidades: crear pasa por HITL', (agent.data.capabilities?.createCampaign ?? '').includes('HITL'));
  const agentAlerts = agent.data.alerts;
  check('alertas sin resolver incluidas', Array.isArray(agentAlerts));

  // limpieza de la campaña de prueba (deja la auditoría, que es append-only)
  await j('PATCH', '/api/fb-campaigns', { campaignId, action: 'cancel' });
  await prisma.$disconnect();

  console.log(`\nResultado: ${pass} pasan · ${fail} fallan`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('Fallo del runner:', e); process.exit(1); });
