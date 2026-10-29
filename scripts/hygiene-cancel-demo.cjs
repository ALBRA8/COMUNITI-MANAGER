// Higiene de pruebas: cancela el residuo demo del E2E de la sesión anterior
// para que no ensucie las colas de los tests de regresión.
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const c = await p.fbCampaign.findFirst({ where: { name: 'Lanzamiento demo (P2)' } });
  if (!c) { console.log('no existe'); await p.$disconnect(); return; }
  await p.fbCampaign.update({ where: { id: c.id }, data: { status: 'CANCELLED' } });
  const r = await p.fbJob.updateMany({ where: { campaignId: c.id, status: { in: ['PENDING_APPROVAL', 'QUEUED', 'LEASED'] } }, data: { status: 'CANCELLED', leaseUntil: null } });
  await p.auditEntry.create({ data: { actor: 'human', action: 'FB_CAMPAIGN_CANCELLED', targetType: 'FB_CAMPAIGN', targetId: c.id, allowed: true, reason: 'Higiene de pruebas: residuo demo del E2E anterior cancelado para no ensuciar colas de regresión' } });
  console.log('cancelada:', c.name, '· jobs afectados:', r.count);
  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
