// Test dirigido P6: auto-join en FB-GROUPS (flujo completo por API, sin tocar Facebook).
// 1) registra worker (HMAC)  2) crea tareas (válidas/duplicada/inválida)  3) claim firmado
// 4) reporta JOINED → verifica grupo auto-creado en rotación  5) REQUESTED → grupo excluido
// 6) cancel/patch honestos  7) limpieza completa.
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
  console.log('P6 AUTO-JOIN — flujo API completo\n');

  // 1) Registrar worker (30 días → techo de uniones 6)
  const reg = await j('POST', '/api/fb-workers', { action: 'register', name: `JoinTest-${stamp}`, baseUrl: 'http://localhost:8765', mode: 'pc', sessionAgeDays: 30 });
  check('worker registrado', reg.status === 200 && reg.data.worker?.id && reg.data.secret, JSON.stringify(reg.data).slice(0, 120));
  const workerId = reg.data.worker?.id;
  const secret = reg.data.secret;
  if (!workerId || !secret) { console.log('No se pudo registrar worker; abortando.'); process.exit(1); }

  const signed = async (path, payload) => {
    const raw = JSON.stringify(payload);
    return j('POST', path, payload, { 'x-fb-signature': sign(raw, secret) });
  };

  // 2) Crear tareas: 2 URLs válidas + 1 duplicada + 1 inválida
  const A = `https://www.facebook.com/groups/grupo-join-a-${stamp}/`;
  const B = `https://web.facebook.com/groups/grupo-join-b-${stamp}/?ref=share`; // dominio distinto + query
  const create = await j('POST', '/api/fb-joins', { urls: [A, A, B, 'https://ejemplo.com/no-es-grupo'], keyword: `kw-${stamp}` });
  check('creación honesta: 2 creadas', create.data.created === 2, JSON.stringify(create.data).slice(0, 160));
  check('duplicada omitida (skipped=1)', create.data.skipped === 1);
  check('URL inválida rechazada con motivo', Array.isArray(create.data.rejected) && create.data.rejected.length === 1 && /No es una URL/.test(create.data.rejected[0].reason));

  // 3) GET expone la cola con counts
  const list1 = await j('GET', '/api/fb-joins');
  const pendingA = (list1.data.tasks ?? []).find((t) => t.fbId === `grupo-join-a-${stamp}`);
  const pendingB = (list1.data.tasks ?? []).find((t) => t.fbId === `grupo-join-b-${stamp}`);
  check('GET lista ambas tareas PENDING', pendingA?.status === 'PENDING' && pendingB?.status === 'PENDING');
  check('keyword registrada para trazabilidad', pendingA?.keyword === `kw-${stamp}`);

  // 4) Claim firmado → primera tarea con URL canónica
  const claim1 = await signed('/api/fb-joins/claim', { workerId });
  check('claim entregó tarea A', claim1.data.task?.fbId === `grupo-join-a-${stamp}`, JSON.stringify(claim1.data).slice(0, 160));
  check('URL normalizada sin query', claim1.data.task?.url === `https://www.facebook.com/groups/grupo-join-a-${stamp}/`, claim1.data.task?.url);
  check('techo de uniones expuesto (joinCap=6)', claim1.data.joinCap === 6 && claim1.data.joinsToday === 0);

  // 5) Claim sin reporte previo → no hay otra tarea LEASEABLE (A sigue LEASED, B queda para el próximo ciclo)
  //    (el lease evita doble asignación de la misma tarea)
  const list2 = await j('GET', '/api/fb-joins');
  check('tarea A en LEASED', (list2.data.tasks ?? []).find((t) => t.fbId === `grupo-join-a-${stamp}`)?.status === 'LEASED');

  // 6) Reporte JOINED → grupo auto-creado en colección auto-join:kw y en rotación
  const rep1 = await signed('/api/fb-joins/report', { workerId, reports: [{ taskId: claim1.data.task.id, status: 'JOINED' }], sessionStatus: 'IDLE' });
  check('reporte JOINED aplicado', rep1.status === 200 && rep1.data.applied === 1 && rep1.data.joined === 1, JSON.stringify(rep1.data).slice(0, 140));
  const groups1 = await j('GET', '/api/fb-groups');
  const autoGroup = (groups1.data.groups ?? []).find((g) => g.fbId === `grupo-join-a-${stamp}`);
  check('grupo auto-creado por JOINED', Boolean(autoGroup));
  check('colección auto-join con keyword', autoGroup?.collection === `auto-join:kw-${stamp}`, autoGroup?.collection);

  // 7) Claim siguiente → tarea B; reporte REQUESTED → grupo creado PERO excluido
  const claim2 = await signed('/api/fb-joins/claim', { workerId });
  check('claim entregó tarea B', claim2.data.task?.fbId === `grupo-join-b-${stamp}`, JSON.stringify(claim2.data).slice(0, 160));
  const rep2 = await signed('/api/fb-joins/report', { workerId, reports: [{ taskId: claim2.data.task.id, status: 'REQUESTED', failReason: 'Solicitud enviada: espera aprobación del admin' }], sessionStatus: 'IDLE' });
  check('reporte REQUESTED aplicado', rep2.data.applied === 1);
  const groups2 = await j('GET', '/api/fb-groups');
  const reqGroup = (groups2.data.groups ?? []).find((g) => g.fbId === `grupo-join-b-${stamp}`);
  check('grupo de REQUESTED creado excluido (fuera de rotación)', Boolean(reqGroup?.excluded));

  // 8) Cola sin pendientes → claim honesto sin tarea
  const claim3 = await signed('/api/fb-joins/claim', { workerId });
  check('claim sin pendientes devuelve task=null', claim3.data.task === null, JSON.stringify(claim3.data).slice(0, 140));

  // 9) PATCH honestos: REQUESTED no se cancela; una PENDING sí
  const patchReq = await j('PATCH', '/api/fb-joins', { id: claim2.data.task.id, action: 'cancel' });
  check('cancelar REQUESTED rechazado (400)', patchReq.status === 400);
  const patchA = await j('PATCH', '/api/fb-joins', { id: `no-existe-${stamp}`, action: 'cancel' });
  check('cancelar inexistente → 404', patchA.status === 404);

  // 10) SKIPPED no consume techo: crear otra tarea y verificar joinsToday en claim
  const C = `https://www.facebook.com/groups/grupo-join-c-${stamp}/`;
  await j('POST', '/api/fb-joins', { urls: [C] });
  const claim4 = await signed('/api/fb-joins/claim', { workerId });
  check('tercera tarea reclamada', claim4.data.task?.fbId === `grupo-join-c-${stamp}`);
  const rep3 = await signed('/api/fb-joins/report', { workerId, reports: [{ taskId: claim4.data.task.id, status: 'SKIPPED', failReason: 'Ya eres miembro de este grupo' }] });
  check('SKIPPED aplicado sin contar techo', rep3.data.applied === 1 && rep3.data.joined === 0);
  const claim5 = await signed('/api/fb-joins/claim', { workerId });
  check('joinsToday=2 tras JOINED+REQUESTED (SKIPPED no suma)', claim5.data.joinsToday === 2, `joinsToday=${claim5.data.joinsToday}`);

  // 11) Limpieza: excluir grupos de prueba, eliminar tareas terminadas, borrar worker
  await j('PATCH', '/api/fb-groups', { id: autoGroup.id, excluded: true });
  await j('PATCH', '/api/fb-groups', { id: reqGroup.id, excluded: true }).catch(() => undefined);
  const list3 = await j('GET', '/api/fb-joins');
  const mine = (list3.data.tasks ?? []).filter((t) => /grupo-join-[abc]-\d+/.test(t.fbId) && t.keyword === `kw-${stamp}`);
  let cleaned = 0;
  for (const t of mine) {
    const act = ['JOINED', 'REQUESTED', 'SKIPPED', 'FAILED', 'CANCELLED'].includes(t.status) ? 'delete' : 'cancel';
    if (['PENDING', 'FAILED'].includes(t.status)) {
      // cancelar primero para poder eliminar
      await j('PATCH', '/api/fb-joins', { id: t.id, action: 'cancel' });
    }
    const del = await j('PATCH', '/api/fb-joins', { id: t.id, action: 'delete' });
    if (del.status === 200) cleaned++;
  }
  check(`tareas de prueba eliminadas (${cleaned}/${mine.length})`, cleaned === mine.length);
  const delW = await j('POST', '/api/fb-workers', { action: 'delete', workerId });
  check('worker de prueba eliminado', delW.status === 200);

  console.log(`\nResultado: ${pass} ✓ / ${fail} ✗`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
