// Cargador del CLIENTE PRISMA DE LA APP para los scripts de la raíz.
//
// ¿Por qué existe? Node resuelve `require('@prisma/client')` caminando hacia
// arriba desde el script: en el repo entregado (scripts/ en la raíz, app en
// app/) esa cadena puede encontrar el node_modules de UN DIRECTORIO PADRE
// ajeno (p. ej. un workspace de desarrollo) y el script escribiría/leería en
// OTRA base de datos que la del server bajo prueba — fallo real detectado en
// FASE 0 (test-mejoras: L1 se escribía en el workspace y el server leía L2,
// las variantes salían ai_rewrite en vez de spintax).
//
// Orden de resolución: app/node_modules (repo entregado) → node_modules de la
// raíz (workspace, donde package.json convive con scripts/) → lo que Node
// resuelva (último recurso, con aviso).
const fs = require('node:fs');
const path = require('node:path');

function requireAppPrisma() {
  const candidates = [
    path.join(__dirname, '..', '..', 'app', 'node_modules', '@prisma', 'client'),
    path.join(__dirname, '..', '..', 'node_modules', '@prisma', 'client'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return require(dir);
  }
  console.warn('[app-prisma] no encontré @prisma/client en la app ni en la raíz; uso el que resuelva Node (revisar layout)');
  return require('@prisma/client');
}

module.exports = { PrismaClient: requireAppPrisma().PrismaClient };
