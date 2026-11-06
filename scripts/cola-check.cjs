// Diagnóstico rápido de cola: campañas con jobs vivos (QUEUED/CLAIMED).
// Uso: node scripts/cola-check.cjs
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const camps = await p.fbCampaign.findMany({ include: { jobs: true } });
  const rows = [];
  for (const c of camps) {
    const vivos = c.jobs.filter(j => ['QUEUED', 'LEASED'].includes(j.status));
    if (vivos.length) rows.push({ campana: c.name, estadoCampana: c.status, jobsVivos: vivos.length });
  }
  if (rows.length) { console.log('RESIDUOS DETECTADOS:'); console.table(rows); process.exitCode = 1; }
  else console.log(`COLA LIMPIA — 0 campañas con jobs vivos (${camps.length} campañas totales, todas cerradas o sin jobs pendientes)`);
  await p.$disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
