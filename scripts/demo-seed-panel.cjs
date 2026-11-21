#!/usr/bin/env node
/**
 * SIEMBRA DEMO para revisión visual del panel por el operador (se limpia después
 * con demo-cleanup-panel.cjs). Crea: 1 marca demo + 3 grupos demo + 1 campaña
 * demo aprobada con 2 objetivos. Nada toca Facebook real (contrato agente↔worker).
 * Uso: TEST_BASE=http://localhost:3000 node scripts/demo-seed-panel.cjs
 */
const BASE = process.env.TEST_BASE ?? 'http://localhost:3000';
const j = async (m, p, b) => { const r = await fetch(BASE + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, data: await r.json().catch(() => ({})) }; };

(async () => {
  const brand = await j('POST', '/api/brands', {
    name: 'Marca Demo Panel',
    identity: 'Marca de demostración interna para revisión visual del agente (sin datos reales).',
    tone: 'cercano, claro y honesto',
    audience: 'emprendedores y comercios locales',
    maxPostsPerDay: 3,
  });
  if (brand.status !== 201) throw new Error('marca no creada: ' + JSON.stringify(brand.data).slice(0, 200));

  const imp = await j('POST', '/api/fb-groups', { groups: [
    { fbId: 'grupo.demo.uno', name: 'Emprendedores Bogotá (demo)', url: 'https://www.facebook.com/groups/grupo.demo.uno/', collection: 'negocios' },
    { fbId: 'grupo.demo.dos', name: 'Marketing Colombia (demo)', url: 'https://www.facebook.com/groups/grupo.demo.dos/', collection: 'negocios' },
    { fbId: 'grupo.demo.tres', name: 'Café y Networking (demo)', url: 'https://www.facebook.com/groups/grupo.demo.tres/', collection: 'general' },
  ] });

  const all = (await j('GET', '/api/fb-groups')).data.groups ?? [];
  const ids = ['grupo.demo.uno', 'grupo.demo.dos'].map((fbId) => all.find((g) => g.fbId === fbId)?.id).filter(Boolean);
  if (ids.length !== 2) throw new Error('grupos demo no localizados: ' + JSON.stringify(imp.data).slice(0, 200));

  const camp = await j('POST', '/api/fb-campaigns', {
    name: 'Lanzamiento demo (panel)',
    text: '{Hola|Buenas} vecinos, esta es una {demo|prueba} del agente sobre {café|comunidad} local.',
    mode: 'group', engine: 'dom',
    firstComment: 'Enlace en el primer comentario (demo)',
    targets: ids, windowStart: 0, windowEnd: 24, nightOverride: true, approve: true,
  });
  const campId = camp.data.campaign?.id ?? camp.data.id;
  if (!campId) throw new Error('campaña no creada: ' + JSON.stringify(camp.data).slice(0, 200));

  console.log('SIEMBRA OK — brandId=' + brand.data.id + ' campaignId=' + campId + ' grupos=' + ids.length);
})().catch((e) => { console.error('SIEMBRA FAIL:', e.message); process.exit(1); });
