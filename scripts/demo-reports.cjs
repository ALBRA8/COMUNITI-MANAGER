// Demo correcta: claim asigna workerId → reporte firmado se aplica (POSTED/FAILED reales)
const crypto = require('crypto');
const BASE = 'http://localhost:3000';
const CAMP2 = process.argv[2];
const j = async (m, p, b, h = {}) => { const r = await fetch(BASE + p, { method: m, headers: { 'Content-Type': 'application/json', ...h }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, data: await r.json().catch(() => ({})) }; };
(async () => {
  // worker demo ya registrado: recuperar secret imposible → registrar nuevo y usar ese
  const reg = await j('POST', '/api/fb-workers', { action: 'register', name: `Worker Demo ${Date.now()}`, baseUrl: 'http://demo.local:8765', mode: 'pc', sessionAgeDays: 20 });
  const wid = reg.data.worker?.id, sec = reg.data.secret;
  const sign = (raw) => crypto.createHmac('sha256', sec).update(raw).digest('hex');
  const signed = (p, b) => { const raw = JSON.stringify(b); return j('POST', p, b, { 'x-fb-signature': sign(raw) }); };
  const camps = await j('GET', '/api/fb-campaigns');
  const row = camps.data.campaigns.find((c) => c.id === CAMP2);
  if (!row) { console.error('campaña no encontrada'); process.exit(1); }
  // Aprobar si sigue en borrador
  if (row.status === 'DRAFT') await j('PATCH', '/api/fb-campaigns', { campaignId: row.id, action: 'approve' });
  const claim = await signed('/api/fb-jobs/claim', { workerId: wid, capacity: 5 });
  const jobs = claim.data.jobs ?? [];
  console.log('claim entregó', jobs.length, 'job(s) · variante:', jobs[0]?.variantSource);
  for (const [i, job] of jobs.entries()) {
    const posted = i === 0;
    const rep = await signed('/api/fb-jobs/report', { workerId: wid, results: [posted
      ? { jobId: job.id, status: 'POSTED', postUrl: `https://www.facebook.com/groups/demo.emprendedores/posts/8830${i}` }
      : { jobId: job.id, status: 'FAILED', failReason: 'no apareció el compositor tras 3 reintentos' }], sessionStatus: 'IDLE' });
    console.log('report', job.targetName, '→', posted ? 'POSTED' : 'FAILED', rep.status);
  }
  await j('POST', '/api/fb-workers', { action: 'delete', workerId: wid });
})().catch((e) => { console.error(e); process.exit(1); });
