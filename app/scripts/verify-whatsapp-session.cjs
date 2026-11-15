#!/usr/bin/env node
/**
 * VERIFICACIÓN E2E de la sesión de WhatsApp propia (P19-WA-PROPIA).
 * Corre contra un server vivo (run-with-server.sh) con HARNESS_WEBHOOK_SECRET
 * configurado. Cubre: fail-closed de la firma, upsert de estados (QR_WAITING /
 * CONNECTED), estado honesto en /api/integrations (whatsapp.session +
 * whatsappSession), prueba real del tool y limpieza final de la fila de prueba.
 * Uso: TEST_BASE=http://localhost:3000 node scripts/verify-whatsapp-session.cjs
 */
const BASE = process.env.TEST_BASE ?? 'http://localhost:3000';
const SECRET = process.env.HARNESS_WEBHOOK_SECRET || '';

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); }
}

async function j(method, path, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = null; }
  return { status: res.status, data, text: text.slice(0, 200) };
}

function sign(raw) {
  return 'x-harness-signature: sha256=' + require('node:crypto').createHmac('sha256', SECRET).update(raw, 'utf8').digest('hex');
}

async function report(payload) {
  const raw = JSON.stringify(payload);
  return j('POST', '/api/whatsapp/session', payload, { 'x-harness-signature': sign(raw).replace(/^x-harness-signature: /, '') });
}

async function dbCleanup() {
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();
  await db.whatsappSession.deleteMany({});
  await db.$disconnect();
}

(async () => {
  console.log('WHATSAPP PROPIA — sesión QR del agente\n');
  if (!SECRET) console.log('AVISO: sin HARNESS_WEBHOOK_SECRET la prueba de fail-closed se salta.');

  await dbCleanup();

  // 1. Estado inicial limpio
  let g = await j('GET', '/api/whatsapp/session');
  check('GET inicial 200 sin sesión', g.status === 200 && g.data?.hasSession === false && g.data?.state === 'DISCONNECTED', `status=${g.status} body=${g.text}`);

  // 2. Fail-closed: reporte remoto sin firma válida se rechaza
  if (SECRET) {
    const bad = await j('POST', '/api/whatsapp/session', { daemonName: 'intruso', state: 'CONNECTED' });
    check('reporte sin firma rechazado (401, fail-closed)', bad.status === 401, JSON.stringify(bad.data));
    const forged = await j('POST', '/api/whatsapp/session', { daemonName: 'intruso', state: 'CONNECTED' }, { 'x-harness-signature': 'sha256=deadbeef' });
    check('firma falsificada rechazada (401)', forged.status === 401, JSON.stringify(forged.data));
  }

  // 3. Reporte firmado: QR_WAITING con QR
  const FAKE_QR = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  let r = await report({ daemonName: 'wa-verify', state: 'QR_WAITING', qrDataUrl: FAKE_QR });
  check('reporte firmado QR_WAITING aceptado', r.status === 200 && r.data.ok === true, JSON.stringify(r.data));
  g = await j('GET', '/api/whatsapp/session');
  check('estado QR_WAITING visible para el panel con QR vigente',
    g.data.state === 'QR_WAITING' && g.data.qrDataUrl === FAKE_QR && g.data.stale === false, JSON.stringify(g.data).slice(0, 200));

  // 4. Reporte firmado: CONNECTED borra el QR y registra identidad
  r = await report({ daemonName: 'wa-verify', state: 'CONNECTED', user: 'Operador Prueba', phone: '573001112222' });
  check('reporte CONNECTED aceptado', r.status === 200 && r.data.ok === true);
  g = await j('GET', '/api/whatsapp/session');
  check('CONNECTED: QR limpiado y vinculación registrada',
    g.data.state === 'CONNECTED' && g.data.qrDataUrl === '' && g.data.phone === '573001112222', JSON.stringify(g.data).slice(0, 200));

  // 5. Estado honesto en integraciones
  g = await j('GET', '/api/integrations');
  const byKey = new Map((g.data.integrations ?? []).map((i) => [i.key, i]));
  check('whatsapp.session CONECTADO con conector vivo (criterio igual al worker FB)',
    byKey.get('whatsapp.session')?.status === 'CONNECTED', JSON.stringify(byKey.get('whatsapp.session')));
  check('whatsappSession.linked true en integraciones', g.data.whatsappSession?.linked === true);
  const t = await j('POST', '/api/integrations', { action: 'test', tool: 'whatsapp.session' });
  check('prueba del tool whatsapp.session → OK', t.data.outcome === 'OK', JSON.stringify(t.data));

  // 6. Validación de entrada
  const inv = await report({ daemonName: 'wa-verify', state: 'HACKED' });
  check('estado inválido rechazado (400)', inv.status === 400, JSON.stringify(inv.data));

  // 7. Limpieza (la fila de prueba no debe quedar en la DB del operador)
  await dbCleanup();
  g = await j('GET', '/api/whatsapp/session');
  check('limpieza: sin sesión tras la verificación', g.data.hasSession === false && g.data.state === 'DISCONNECTED');

  console.log(`\nResultado: ${pass} ✓ / ${fail} ✗`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
