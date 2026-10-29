#!/usr/bin/env node
// Genera app/package.json del repo COMUNITI-MANAGER a partir del package.json
// del workspace, con scripts limpios y metadatos propios. Evita errores de
// transcripción manual de versiones.
const fs = require('fs');

const ws = JSON.parse(fs.readFileSync('/home/z/my-project/package.json', 'utf8'));

const pkg = {
  name: 'comuniti-manager',
  version: '1.0.0',
  private: true,
  description:
    'COMUNITI-MANAGER — Arnés de community management con IA para AGENTE-GENERAL (Social Autopilot AI)',
  scripts: {
    dev: 'next dev -p 3000',
    build: 'next build',
    start: 'next start -p 3000',
    lint: 'eslint .',
    postinstall: 'prisma generate',
    'db:push': 'prisma db push --accept-data-loss',
    'db:generate': 'prisma generate',
  },
  dependencies: ws.dependencies,
  devDependencies: ws.devDependencies,
};

const out = '/home/z/my-project/clones/COMUNITI-MANAGER/app/package.json';
fs.writeFileSync(out, JSON.stringify(pkg, null, 2) + '\n');
console.log('OK →', out);
console.log('deps:', Object.keys(pkg.dependencies).length, '| devDeps:', Object.keys(pkg.devDependencies).length);
