// Higiene one-off: de los incidentes SOURCE_FAILURE abiertos, deja solo el más
// reciente por fuente (residuo de corridas anteriores a la deduplicación).
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const open = await p.metaPolicyIncident.findMany({ where: { kind: 'SOURCE_FAILURE', status: 'OPEN' }, orderBy: { createdAt: 'desc' } });
  const seen = new Set();
  let closed = 0;
  for (const i of open) {
    // La descripción tiene la forma: No se pudo verificar "Nombre" (key): error
    const m = i.description.match(/\(([a-z0-9-]+)\)/);
    const key = m ? m[1] : i.description;
    if (seen.has(key)) {
      await p.metaPolicyIncident.update({ where: { id: i.id }, data: { status: 'RESOLVED', resolvedAt: new Date(), resolutionNote: 'Duplicado consolidado: ya existe un incidente abierto más reciente para la misma fuente.' } });
      closed++;
    } else {
      seen.add(key);
    }
  }
  const left = await p.metaPolicyIncident.count({ where: { status: 'OPEN' } });
  console.log(`duplicados cerrados: ${closed} · incidentes abiertos restantes: ${left}`);
  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
