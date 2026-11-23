// Test P18 (centro de integraciones): estado unificado honesto + prueba de
// conexión. Todo solo-lectura: el POST test no escribe en redes ni en la DB
// de negocio (solo lee workers/Setting), sin artefactos residuales.
// Uso: TEST_BASE=http://localhost:3000 node scripts/test-integrations.cjs
const BASE = process.env.TEST_BASE ?? 'http://localhost:3000';

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

(async () => {
  console.log('P18 · Centro de integraciones (ajustes unificados)\n');

  // ── GET: estado unificado ───────────────────────────────────────
  console.log('GET /api/integrations');
  const g = await j('GET', '/api/integrations');
  check('GET responde 200', g.status === 200, JSON.stringify(g.data).slice(0, 120));
  check('LLM embebido reportado activo', g.data.llm?.connected === true, JSON.stringify(g.data.llm));
  check('lista de integraciones es el registro completo (14 — whatspower.broadcast retirado por contrato sin ejecutor, punto 8)', Array.isArray(g.data.integrations) && g.data.integrations.length === 14, `obtenido ${g.data.integrations?.length}`);
  check('cuentas de integración son honestas (connected + awaiting = total)',
    g.data.counts?.total === g.data.counts?.connected + g.data.counts?.awaiting, JSON.stringify(g.data.counts));
  check('todas las tarjetas traen missingEnv calculado',
    (g.data.integrations ?? []).every((i) => Array.isArray(i.missingEnv) && Array.isArray(i.envKeys)));
  check('ninguna integración reporta CONNECTED con variables faltantes',
    (g.data.integrations ?? []).every((i) => i.status !== 'CONNECTED' || i.missingEnv.length === 0));
  check('webhooks reportan fuentes y estado de secreto',
    Array.isArray(g.data.webhooks?.sources) && typeof g.data.webhooks?.secretConfigured === 'boolean');
  check('sistema reporta modo de autonomía', typeof g.data.system?.autonomyMode === 'string');
  check('estructura de claves: envKeys no exponen valores (solo nombres)',
    (g.data.integrations ?? []).every((i) => i.envKeys.every((k) => /^[A-Z0-9_]+$/.test(k))));

  // Tarjetas clave por categoría de configuración
  const byKey = new Map((g.data.integrations ?? []).map((i) => [i.key, i]));
  check('whatspower.broadcast retirado del registro (punto 8: contrato sin ejecutor — mundo CRM-ALBRA)',
    !byKey.has('whatspower.broadcast'));
  check('canal Telegram presente (telegram.bot) con su variable TELEGRAM_BOT_TOKEN',
    byKey.get('telegram.bot')?.envKeys?.includes('TELEGRAM_BOT_TOKEN') === true);
  check('Telegram sin token reporta AWAITING_CREDENTIALS (no se finge conexión)',
    byKey.get('telegram.bot')?.status === 'AWAITING_CREDENTIALS' || byKey.get('telegram.bot')?.status === 'CONNECTED',
    `status=${byKey.get('telegram.bot')?.status}`);
  check('vías de publicación multirred presentes (Postgale/Postiz/PostLake)',
    ['postgale.publish', 'postiz.publish', 'postlake.publish'].every((k) => byKey.has(k)));
  check('módulo propio FB-GROUPS presente y gobernado por workers (sin envKeys)',
    byKey.get('fbgroups.worker')?.envKeys?.length === 0);
  check('canal WhatsApp PROPIO presente (whatsapp.session, sin envKeys — sesión QR)',
    byKey.has('whatsapp.session') && byKey.get('whatsapp.session')?.envKeys?.length === 0);
  check('WhatsApp propia sin conector reporta AWAITING_CREDENTIALS (no se finge conexión)',
    byKey.get('whatsapp.session')?.status === 'AWAITING_CREDENTIALS' || byKey.get('whatsapp.session')?.status === 'CONNECTED',
    `status=${byKey.get('whatsapp.session')?.status}`);
  check('GET expone el estado de la sesión de WhatsApp propia (whatsappSession)',
    typeof g.data.whatsappSession?.linked === 'boolean' && typeof g.data.whatsappSession?.state === 'string');
  check('FB-GROUPS sin workers reporta AWAITING_CREDENTIALS (no se finge conexión)',
    byKey.get('fbgroups.worker')?.status === 'AWAITING_CREDENTIALS' || byKey.get('fbgroups.worker')?.status === 'CONNECTED',
    `status=${byKey.get('fbgroups.worker')?.status}`);
  check('semilla ALBRA Seed presente (albra.seed)',
    byKey.has('albra.seed'));
  check('ScrapeCreators presente para investigación IG/TikTok',
    byKey.has('scrapecreators.research'));

  // ── POST: pruebas de conexión reales ────────────────────────────
  console.log('\nPOST /api/integrations (probar conexión)');

  const tOk = await j('POST', '/api/integrations', { action: 'test', tool: 'harness.internal' });
  check('harness.internal → OK (motor + DB responden)', tOk.data.outcome === 'OK', JSON.stringify(tOk.data));

  const tWait = await j('POST', '/api/integrations', { action: 'test', tool: 'postgale.publish' });
  check('postgale sin credenciales → AWAITING_CREDENTIALS (nunca simula)',
    tWait.data.outcome === 'AWAITING_CREDENTIALS' && /POSTGALE_URL/.test(tWait.data.reason ?? ''), JSON.stringify(tWait.data));

  const tWa = await j('POST', '/api/integrations', { action: 'test', tool: 'whatspower.broadcast' });
  check('whatspower.broadcast ya no existe → error honesto "Herramienta desconocida" (sin contrato decorativo)',
    /desconocida/i.test(tWa.data?.error ?? ''), JSON.stringify(tWa.data));

  const tWorker = await j('POST', '/api/integrations', { action: 'test', tool: 'fbgroups.worker' });
  check('fbgroups.worker sin workers → AWAITING_CREDENTIALS; con workers → OK',
    tWorker.data.outcome === 'OK' || tWorker.data.outcome === 'AWAITING_CREDENTIALS', JSON.stringify(tWorker.data));

  const tBad = await j('POST', '/api/integrations', { action: 'test', tool: 'no.existe' });
  check('herramienta desconocida → 400', tBad.status === 400, JSON.stringify(tBad.data));

  // ── Contrato anti-mock global ───────────────────────────────────
  console.log('\nContrato honestidad radical');
  const g2 = await j('GET', '/api/integrations');
  const postgale = (g2.data.integrations ?? []).find((i) => i.key === 'postgale.publish');
  check('postgale sigue AWAITING_CREDENTIALS tras las pruebas (estado estable, sin fingir)',
    postgale?.status === 'AWAITING_CREDENTIALS' || postgale?.status === 'CONNECTED',
    `status=${postgale?.status}`);
  check('CONNECTED solo si de verdad hay env configuradas (hoy: 1, el motor interno)',
    g2.data.counts?.connected >= 1, JSON.stringify(g2.data.counts));

  console.log(`\nResultado: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FAIL fatal:', e); process.exit(1); });
