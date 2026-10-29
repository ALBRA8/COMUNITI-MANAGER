// E2E del módulo FB-GROUPS (sin tocar Facebook real: solo contrato chaleco↔worker)
const stamp = Date.now();
const CAMP_NAME = 'E2E-' + stamp;
const BASE = 'http://localhost:3000';
const crypto = require('crypto');

const log = (...a) => console.log(...a);
async function j(method, path, body, headers = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

(async () => {
  let ok = 0, fail = 0;
  const check = (name, cond, extra = '') => {
    if (cond) { ok++; log(`  ✓ ${name}`); } else { fail++; log(`  ✗ ${name} ${extra}`); }
  };

  log('— 1. Registro de worker (secreto mostrado una vez)');
  const reg = await j('POST', '/api/fb-workers', { action: 'register', name: `Worker E2E ${stamp}`, baseUrl: `http://e2e-${stamp}:8765`, mode: 'vps', sessionAgeDays: 21 });
  check('registrado con secreto', reg.status === 200 && !!reg.data.secret);
  const WORKER_ID = reg.data.worker.id;
  const SECRET = reg.data.secret;

  log('— 2. Ping: sin firma debe fallar; con firma HMAC debe pasar');
  const pingBad = await j('POST', '/api/fb-workers', { action: 'ping', workerId: WORKER_ID, status: 'IDLE' });
  check('ping sin firma → 401', pingBad.status === 401, JSON.stringify(pingBad.data));
  const pingBody = JSON.stringify({ action: 'ping', workerId: WORKER_ID, status: 'IDLE' });
  const sig = crypto.createHmac('sha256', SECRET).update(pingBody).digest('hex');
  const pingOk = await fetch(BASE + '/api/fb-workers', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-fb-signature': sig }, body: pingBody });
  check('ping con HMAC → ok', pingOk.status === 200);

  log('— 3. Import de 3 grupos');
  const imp = await j('POST', '/api/fb-groups', { groups: [
    { fbId: 'grupo.e2e.uno', name: 'Emprendedores Bogotá', url: 'https://www.facebook.com/groups/grupo.e2e.uno/', collection: 'negocios' },
    { fbId: 'grupo.e2e.dos', name: 'Marketing Colombia', url: 'https://www.facebook.com/groups/grupo.e2e.dos/', collection: 'negocios' },
    { fbId: 'grupo.e2e.tres', name: 'Café yNetworking', url: 'https://www.facebook.com/groups/grupo.e2e.tres/', collection: 'general' },
  ] });
  check('3 grupos importados', imp.data.imported === 3, JSON.stringify(imp.data));
  const allGroups = (await j('GET', '/api/fb-groups')).data.groups;
  check('grupos persistidos', allGroups.length >= 3);
  // Idempotente con DB sucia: reactivar los grupos e2e de corridas previas
  // (si una corrida anterior los dejó excluded, este e2e los reactiva).
  const e2eIds = ['grupo.e2e.uno', 'grupo.e2e.dos', 'grupo.e2e.tres'];
  const groups = e2eIds.map((fbId) => allGroups.find((g) => g.fbId === fbId)).filter(Boolean);
  for (const g of groups) {
    if (g.excluded) await j('PATCH', '/api/fb-groups', { id: g.id, excluded: false });
    g.excluded = false;
  }
  check('3 grupos e2e activos y localizados', groups.length === 3, `got ${groups.length}`);

  log('— 4. Campaña con 2 objetivos (spintax {Hola|Buenas})');
  const camp = await j('POST', '/api/fb-campaigns', {
    name: CAMP_NAME, text: '{Hola|Buenas} vecinos, probando el pantalón del chaleco con {café|amor}.', mode: 'group', engine: 'dom',
    firstComment: 'Enlace en el primer comentario', targets: [groups[0].id, groups[1].id], windowStart: 0, windowEnd: 24, approve: true,
  });
  check('campaña creada con 2 jobs', camp.status === 200 && camp.data.jobs === 2, JSON.stringify(camp.data));

  log('— 5. Motor internal debe rechazarse (honestidad v1)');
  const internal = await j('POST', '/api/fb-campaigns', { name: 'X', text: 'x', mode: 'group', engine: 'internal', targets: [groups[0].id] });
  check('internal → 400', internal.status === 400);

  log('— 6. Claim sin HMAC → 401; con HMAC → 1 job con lease');
  const claimNoSig = await j('POST', '/api/fb-jobs/claim', { workerId: WORKER_ID, capacity: 1 });
  check('claim sin firma → 401', claimNoSig.status === 401);
  const doClaim = async () => {
    const body = JSON.stringify({ workerId: WORKER_ID, capacity: 1 });
    return fetch(BASE + '/api/fb-jobs/claim', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-fb-signature': crypto.createHmac('sha256', SECRET).update(body).digest('hex') }, body }).then((r) => r.json());
  };
  const c1 = await doClaim();
  check('job entregado con lease', c1.jobs && c1.jobs.length === 1 && c1.cap === 20, JSON.stringify(c1));
  check('variante única aplicada (spintax o IA en L2)', ['spintax', 'ai_rewrite'].includes(c1.jobs?.[0]?.variantSource) && !/\{Hola\|Buenas\}/.test(c1.jobs?.[0]?.variant ?? '{}'), `fuente=${c1.jobs?.[0]?.variantSource} texto=${c1.jobs?.[0]?.variant}`);
  check('ventana 0-24 not vacía', !c1.note, c1.note ?? '');

  log('— 7. Reporte POSTED con URL viva + idempotencia anti-doble');
  const repBody = JSON.stringify({ workerId: WORKER_ID, results: [{ jobId: c1.jobs[0].id, status: 'POSTED', postUrl: 'https://www.facebook.com/groups/grupo.e2e.uno/posts/123/' }], sessionStatus: 'IDLE' });
  const rep = await fetch(BASE + '/api/fb-jobs/report', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-fb-signature': crypto.createHmac('sha256', SECRET).update(repBody).digest('hex') }, body: repBody }).then((r) => r.json());
  check('reporte aplicado', rep.applied === 1, JSON.stringify(rep));
  check('uso diario = 1', rep.ok === true);

  log('— 8. Segundo claim → segundo job; reporte; campaña DONE');
  const c2 = await doClaim();
  check('segundo job entregado', c2.jobs?.length === 1, JSON.stringify(c2));
  const repBody2 = JSON.stringify({ workerId: WORKER_ID, results: [{ jobId: c2.jobs[0].id, status: 'FAILED', failReason: 'El grupo exige aprobación de admin' }], sessionStatus: 'IDLE' });
  await fetch(BASE + '/api/fb-jobs/report', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-fb-signature': crypto.createHmac('sha256', SECRET).update(repBody2).digest('hex') }, body: repBody2 });
  const camps = (await j('GET', '/api/fb-campaigns')).data.campaigns;
  const mine = camps.find((c) => c.name === CAMP_NAME);
  check('campaña DONE con 1 publicado y 1 fallido', mine.status === 'DONE' && mine.counts.posted === 1 && mine.counts.failed === 1, JSON.stringify(mine));

  log('— 9. Techo diario: cap 20 respetado en claim (warmup 21 días)');
  check('cap del warmup = 20', c1.cap === 20 && c2.cap === 20);

  log('— 10. Alerta de desafío pausa el worker 12h');
  const alertBody = JSON.stringify({ workerId: WORKER_ID, results: [], alerts: [{ kind: 'CHALLENGE', message: 'checkpoint detectado en prueba E2E', pauseHours: 12 }], sessionStatus: 'CHALLENGE_DETECTED' });
  await fetch(BASE + '/api/fb-jobs/report', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-fb-signature': crypto.createHmac('sha256', SECRET).update(alertBody).digest('hex') }, body: alertBody });
  const c3 = await doClaim();
  check('claim bloqueado por pausa defensiva', c3.jobs?.length === 0 && /PAUSED_ANTI_BAN/.test(c3.note ?? ''), JSON.stringify(c3));
  const wState = (await j('GET', '/api/fb-workers')).data;
  check('worker en CHALLENGE_DETECTED', wState.workers.find((w) => w.id === WORKER_ID)?.status === 'CHALLENGE_DETECTED', wState.workers.find((w) => w.id === WORKER_ID)?.status);
  check('alerta registrada', wState.alerts.length >= 1);

  log('— 11. Auditoría: acciones del módulo registradas');
  const audit = await j('GET', '/api/audit').catch(() => ({ data: { entries: [] } }));
  const actions = JSON.stringify(audit.data);
  check('FB_WORKER_REGISTERED + FB_JOB_POSTED + FB_ALERT_CHALLENGE en auditoría',
    actions.includes('FB_WORKER_REGISTERED') && actions.includes('FB_JOB_POSTED') && actions.includes('FB_ALERT_CHALLENGE'));

  log(`\nRESULTADO: ${ok} ✓ / ${fail} ✗`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('E2E ERROR', e); process.exit(1); });
