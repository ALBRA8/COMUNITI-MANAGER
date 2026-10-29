// Higiene one-off: cierra el residuo de la era-400 (UA antiguo) que quedó en
// la DB mientras se depuraba el fetcher. Para cada fuente que hoy responde
// (lastStatus OK/CHANGED), cierra sus cambios INACCESSIBLE abiertos y resuelve
// sus incidentes SOURCE_FAILURE. Deja abiertos solo los fallos reales vigentes.
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const alive = await p.metaPolicySource.findMany({ where: { lastStatus: { in: ['OK', 'CHANGED'] } }, select: { id: true, key: true } });
  let chg = 0, inc = 0;
  for (const s of alive) {
    const c = await p.metaPolicyChange.updateMany({
      where: { sourceId: s.id, kind: 'INACCESSIBLE', status: 'OPEN' },
      data: { status: 'ACCEPTED', reviewedAt: new Date(), reviewNote: 'Fuente recuperada: la consulta actual responde (higiene post-depuración del fetcher).' },
    });
    chg += c.count;
    const i = await p.metaPolicyIncident.updateMany({
      where: { kind: 'SOURCE_FAILURE', status: 'OPEN', description: { contains: s.key } },
      data: { status: 'RESOLVED', resolvedAt: new Date(), resolutionNote: 'La fuente responde en la última verificación (higiene post-depuración).' },
    });
    inc += i.count;
  }
  const recovered = await p.metaPolicyChange.updateMany({ where: { kind: 'RECOVERED', status: 'OPEN' }, data: { status: 'ACCEPTED', reviewedAt: new Date(), reviewNote: 'Evento informativo cerrado (higiene post-depuración).' } });
  const openChg = await p.metaPolicyChange.count({ where: { status: 'OPEN' } });
  const openInc = await p.metaPolicyIncident.count({ where: { status: 'OPEN' } });
  console.log(`cerrados: ${chg} cambios INACCESSIBLE, ${recovered.count} RECOVERED, ${inc} incidentes · quedan abiertos: ${openChg} cambios, ${openInc} incidentes`);
  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
