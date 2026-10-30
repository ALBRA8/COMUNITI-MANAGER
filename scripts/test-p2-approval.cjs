// Test dirigido P2-APPROVED (destripe Metricool §7): gate pre-vuelo explícito.
// Las campañas nacen DRAFT con jobs PENDING_APPROVAL; el worker NO las ve hasta
// que un humano aprueba (PATCH action=approve, auditado como FB_CAMPAIGN_APPROVED).
// Uso: TEST_BASE=http://localhost:3000 node scripts/test-p2-approval.cjs
const crypto = require('crypto');
const BASE = process.env.TEST_BASE ?? 'http://localhost:3000';
const stamp = Date.now();

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); }
}

function sign(raw, secret) {
  return crypto.createHmac('sha256', secret).update(raw).digest('hex');
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

async function text(path) {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, body: await res.text() };
}

(async () => {
  console.log('P2-APPROVED — gate pre-vuelo (borrador → aprobación HITL → cola)\n');

  // 0) Autonomía L1: variante spintax determinista, sin espera de IA en el test
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  await prisma.setting.upsert({ where: { key: 'autonomy_mode' }, create: { key: 'autonomy_mode', value: 'L1_ASSISTED' }, update: { value: 'L1_ASSISTED' } });
  await prisma.$disconnect();

  // 0) Higiene: cancelar residuos DRAFT/QUEUED/PAUSED de runs previos de este test (el claim reparte por createdAt asc y no distingue baterías)
  const previos = await j('GET', '/api/fb-campaigns');
  for (const c of previos.data.campaigns ?? []) {
    if (/^(Gate P2 |Directa P2 |Borrador a cancelar P2 )/.test(String(c.name ?? '')) && ['DRAFT', 'QUEUED', 'PAUSED'].includes(c.status)) {
      await j('PATCH', '/api/fb-campaigns', { campaignId: c.id, action: 'cancel' });
    }
  }

  // 1) Worker real (HMAC) para probar que el borrador es invisible al claim
  const reg = await j('POST', '/api/fb-workers', { action: 'register', name: `P2-${stamp}`, baseUrl: `http://localhost:887${stamp % 10}`, mode: 'pc', sessionAgeDays: 30 });
  check('worker registrado con secret', reg.status === 200 && reg.data.worker?.id && reg.data.secret, JSON.stringify(reg.data).slice(0, 120));
  const workerId = reg.data.worker?.id;
  const secret = reg.data.secret;
  if (!workerId || !secret) { console.log('No se pudo registrar worker; abortando.'); process.exit(1); }
  const signed = async (path, payload) => {
    const raw = JSON.stringify(payload);
    return j('POST', path, payload, { 'x-fb-signature': sign(raw, secret) });
  };

  // 2) Grupos de prueba
  await j('POST', '/api/fb-groups', { groups: [
    { fbId: `p2-grupo-a-${stamp}`, name: 'Grupo A P2', url: 'https://www.facebook.com/groups/a', collection: 'test-p2' },
    { fbId: `p2-grupo-b-${stamp}`, name: 'Grupo B P2', url: 'https://www.facebook.com/groups/b', collection: 'test-p2' },
  ] });
  const gList = await j('GET', '/api/fb-groups');
  const ga = (gList.data.groups ?? []).find((g) => g.fbId === `p2-grupo-a-${stamp}`);
  const gb = (gList.data.groups ?? []).find((g) => g.fbId === `p2-grupo-b-${stamp}`);

  // 3) Creación por defecto → DRAFT + jobs PENDING_APPROVAL (ventana 0-24: siempre en ventana, indep. de la hora — [start,end) excluye windowEnd)
  const camp = await j('POST', '/api/fb-campaigns', {
    name: `Gate P2 ${stamp}`, text: 'Texto del borrador P2 {hola|chau}.', mode: 'group',
    windowStart: 0, windowEnd: 24, targets: [ga.id, gb.id],
  });
  check('POST sin approve nace DRAFT', camp.status === 200 && camp.data.campaign?.status === 'DRAFT', JSON.stringify(camp.data.campaign));
  check('DRAFT nace sin approvedAt', camp.data.campaign?.approvedAt === null, JSON.stringify(camp.data.campaign));
  const campaignId = camp.data.campaign?.id;

  const list = await j('GET', '/api/fb-campaigns');
  const cRow = (list.data.campaigns ?? []).find((c) => c.id === campaignId);
  check('GET expone counts.pendingApproval=2', cRow?.counts?.pendingApproval === 2, JSON.stringify(cRow?.counts));
  check('jobs del borrador en PENDING_APPROVAL', (cRow?.jobs ?? []).every((jx) => jx.status === 'PENDING_APPROVAL'), JSON.stringify(cRow?.jobs?.map((x) => x.status)));

  // 4) El worker NO ve el borrador: claim firmado devuelve cola vacía
  const claimDraft = await signed('/api/fb-jobs/claim', { workerId, capacity: 5 });
  check('claim NO entrega jobs de borrador', (claimDraft.data.jobs ?? []).length === 0, JSON.stringify(claimDraft.data.jobs).slice(0, 140));

  // 5) Validaciones honestas de las acciones
  const pauseDraft = await j('PATCH', '/api/fb-campaigns', { campaignId, action: 'pause' });
  check('pausar un borrador → 409', pauseDraft.status === 409, JSON.stringify(pauseDraft.data));
  const resumeBad = await j('PATCH', '/api/fb-campaigns', { campaignId, action: 'resume' });
  check('reanudar una no-pausada → 409', resumeBad.status === 409, JSON.stringify(resumeBad.data));
  const approve404 = await j('PATCH', '/api/fb-campaigns', { campaignId: 'no-existe-xyz', action: 'approve' });
  check('aprobar campaña inexistente → 404', approve404.status === 404, JSON.stringify(approve404.data));

  // 6) Informe de un borrador: declara "BORRADOR sin aprobar"
  const repDraft = await text(`/reports/${campaignId}`);
  check('informe del borrador declara que no está aprobado', repDraft.status === 200 && repDraft.body.includes('BORRADOR sin aprobar'), String(repDraft.status));

  // 7) Aprobación HITL → QUEUED + approvedAt + auditoría FB_CAMPAIGN_APPROVED
  const approve = await j('PATCH', '/api/fb-campaigns', { campaignId, action: 'approve' });
  check('approve sobre borrador → ok con 2 jobs', approve.status === 200 && approve.data.approved === 2, JSON.stringify(approve.data));
  const approveAgain = await j('PATCH', '/api/fb-campaigns', { campaignId, action: 'approve' });
  check('re-aprobar → 409 (solo un borrador se aprueba)', approveAgain.status === 409, JSON.stringify(approveAgain.data));

  const list2 = await j('GET', '/api/fb-campaigns');
  const cRow2 = (list2.data.campaigns ?? []).find((c) => c.id === campaignId);
  check('campaña aprobada queda QUEUED', cRow2?.status === 'QUEUED', cRow2?.status);
  check('approvedAt quedó registrado', typeof cRow2?.approvedAt === 'string' && cRow2.approvedAt.length > 0, JSON.stringify(cRow2?.approvedAt));
  check('jobs aprobados en QUEUED (pendingApproval=0)', cRow2?.counts?.queued === 2 && cRow2?.counts?.pendingApproval === 0, JSON.stringify(cRow2?.counts));

  const claimAfter = await signed('/api/fb-jobs/claim', { workerId, capacity: 1 });
  const leased = (claimAfter.data.jobs ?? [])[0];
  check('claim tras aprobar entrega el job', Boolean(leased), JSON.stringify(claimAfter.data).slice(0, 140));
  check('job entregado con variante spintax', leased?.variantSource === 'spintax' && (leased?.variant ?? '').length > 0, JSON.stringify({ s: leased?.variantSource, v: (leased?.variant ?? '').slice(0, 40) }));

  // 8) Reporte firmado POSTED (limpieza con verdad: el job queda POSTED con URL de prueba)
  if (leased) {
    const rep = await signed('/api/fb-jobs/report', { workerId, results: [{ jobId: leased.id, status: 'POSTED', postUrl: `https://www.facebook.com/groups/a/posts/p2-${stamp}` }], alerts: [], sessionStatus: 'IDLE' });
    check('reporte POSTED firmado aceptado', rep.status === 200, JSON.stringify(rep.data));
  }

  // 9) Informe tras aprobar: declara la aprobación con fecha y la bitácora registra el gate
  const repOk = await text(`/reports/${campaignId}`);
  check('informe declara aprobación humana', repOk.body.includes('aprobada por un humano el'));
  check('bitácora contiene FB_CAMPAIGN_APPROVED', repOk.body.includes('FB_CAMPAIGN_APPROVED'));

  // 10) Flujo directo: approve:true nace QUEUED sin borrador intermedio
  const camp2 = await j('POST', '/api/fb-campaigns', {
    name: `Directa P2 ${stamp}`, text: 'Flujo directo aprobado al crear.', mode: 'profile',
    windowStart: 0, windowEnd: 24, approve: true,
  });
  check('approve:true nace QUEUED', camp2.status === 200 && camp2.data.campaign?.status === 'QUEUED', JSON.stringify(camp2.data.campaign));
  const approveCamp2 = await j('PATCH', '/api/fb-campaigns', { campaignId: camp2.data.campaign?.id, action: 'approve' });
  check('approve sobre no-borrador → 409', approveCamp2.status === 409, JSON.stringify(approveCamp2.data));

  // 11) Cancelar un borrador cancela sus jobs PENDING_APPROVAL
  const camp3 = await j('POST', '/api/fb-campaigns', {
    name: `Borrador a cancelar P2 ${stamp}`, text: 'Este borrador se cancelará sin aprobar.', mode: 'profile',
    windowStart: 0, windowEnd: 24,
  });
  const c3id = camp3.data.campaign?.id;
  const cancelDraft = await j('PATCH', '/api/fb-campaigns', { campaignId: c3id, action: 'cancel' });
  check('cancelar borrador → ok', cancelDraft.status === 200, JSON.stringify(cancelDraft.data));
  const list3 = await j('GET', '/api/fb-campaigns');
  const c3 = (list3.data.campaigns ?? []).find((c) => c.id === c3id);
  check('borrador cancelado: job CANCELLED', c3?.status === 'CANCELLED' && (c3.jobs ?? []).every((jx) => jx.status === 'CANCELLED'), JSON.stringify({ s: c3?.status, j: c3?.jobs?.map((x) => x.status) }));

  // 12) Puente agéntico refleja el gate
  const agent = await j('GET', '/api/fb-agent/fb-groups');
  check('honestidad declara el gate DRAFT→approve', (agent.data.honesty ?? []).some((h) => h.includes('DRAFT') && h.includes('approve')));
  check('capabilities: createCampaign menciona approve', (agent.data.capabilities?.createCampaign ?? '').includes('approve'));

  // limpieza: campañas propias fuera de la cola (higiene para baterías posteriores; 409 en ya consumidas se ignora)
  for (const id of [campaignId, camp2.data.campaign?.id, c3id].filter(Boolean)) {
    await j('PATCH', '/api/fb-campaigns', { campaignId: id, action: 'cancel' });
  }
  // limpieza: worker de prueba fuera de la lista
  await j('POST', '/api/fb-workers', { action: 'delete', workerId });
  await prisma.$disconnect();

  console.log(`\nResultado: ${pass} pasan · ${fail} fallan`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('Fallo del runner:', e); process.exit(1); });
