#!/usr/bin/env node
/**
 * LIMPIEZA de la siembra demo (demo-seed-panel.cjs + demo-reports.cjs): elimina
 * marca, grupos, campaña y jobs demo respetando FKs, con auditoría de la casa.
 * Uso: node scripts/demo-cleanup-panel.cjs
 */
const { PrismaClient } = require('./lib/app-prisma.cjs');
const p = new PrismaClient();

(async () => {
  const brand = await p.brand.findFirst({ where: { name: 'Marca Demo Panel' } });
  const camp = await p.fbCampaign.findFirst({ where: { name: 'Lanzamiento demo (panel)' } });

  if (camp) {
    const jobs = await p.fbJob.deleteMany({ where: { campaignId: camp.id } });
    await p.fbCampaign.delete({ where: { id: camp.id } });
    console.log('campaña demo eliminada · jobs borrados:', jobs.count);
  } else {
    console.log('campaña demo: no existía');
  }

  const grupos = await p.fbGroup.deleteMany({ where: { fbId: { in: ['grupo.demo.uno', 'grupo.demo.dos', 'grupo.demo.tres'] } } });
  console.log('grupos demo eliminados:', grupos.count);

  if (brand) {
    await p.brand.delete({ where: { id: brand.id } });
    console.log('marca demo eliminada:', brand.name);
  } else {
    console.log('marca demo: no existía');
  }

  await p.auditEntry.create({ data: { actor: 'human', action: 'PANEL_DEMO_CLEANUP', targetType: 'Brand', targetId: brand?.id ?? 'n/a', allowed: true, reason: 'Limpieza de la siembra demo usada para las capturas del panel (marca, grupos, campaña y jobs). La corrida demo del worker ya se autolimpia en demo-reports.cjs.' } });
  console.log('LIMPIEZA OK');
  await p.$disconnect();
})().catch((e) => { console.error('LIMPIEZA FAIL:', e.message); process.exit(1); });
