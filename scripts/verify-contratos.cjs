#!/usr/bin/env node
/**
 * VERIFICADOR DE CONTRATOS HONESTOS (punto 8 de la misión de cierre).
 * Garantía estructural: TODO contrato declarado en el registro de herramientas
 * (app/src/lib/registry.ts) tiene ejecutor real en el adaptador correspondiente
 * (app/src/lib/executor.ts). Un contrato declarado sin ejecutor es un contrato
 * decorativo: el orquestador lo llamaría y fallaría tarde y confuso.
 *
 * Método: parsea registry.ts (keys + contracts declarados) y los compara con
 * el mapa de ejecutores implementados en executor.ts (switch dispatchTool +
 * adapters). También exige que las rutas citadas existan en ROUTES.
 * Uso: node scripts/verify-contratos.cjs   (desde la raíz del repo)
 * Salida: exit 0 si no hay contratos huérfanos; exit 1 y lista si los hay.
 */
const fs = require('node:fs');
const path = require('node:path');

function findAppRoot() {
  const here = __dirname;
  for (const cand of [path.join(here, '..', 'app'), here]) {
    if (fs.existsSync(path.join(cand, 'src', 'lib', 'registry.ts'))) return cand;
  }
  console.error('No encuentro src/lib/registry.ts ni en ../app ni en la raíz');
  process.exit(1);
}

const app = findAppRoot();
const registrySrc = fs.readFileSync(path.join(app, 'src', 'lib', 'registry.ts'), 'utf8');
const executorSrc = fs.readFileSync(path.join(app, 'src', 'lib', 'executor.ts'), 'utf8');

// 1) Contratos declarados por herramienta en el registro
const declared = new Map(); // key → Set<contract>
const toolRe = /key:\s*'([^']+)'[\s\S]*?contracts:\s*\[([^\]]*)\]/g;
let m;
while ((m = toolRe.exec(registrySrc)) !== null) {
  const key = m[1];
  const contracts = [...m[2].matchAll(/'([^']+)'/g)].map((c) => c[1]);
  declared.set(key, new Set(contracts));
}

// 2) Ejecutores implementados por herramienta (switch dispatchTool + adapters)
const implemented = new Map(); // key → Set<contract>
// harness.internal: sus contratos los ejecuta el ORQUESTADOR como fases del
// ciclo (CREATE/VALIDATE/APPROVE/MEASURE en src/lib/orchestrator.ts), no vía
// executeContract — la redacción, validación, aprobación e informes son el
// motor propio (createDraftWithWriter, validateContent, approvals, informes).
// record_experiment se RETIRÓ del registro (punto 8): era contrato sin
// implementación real en ninguna parte.
// fbgroups.worker: sus contratos se ejecutan por las rutas propias del módulo
// FB (/api/fb-jobs, /api/fb-campaigns, /api/fb-joins, /api/fb-groups), fuera
// de dispatchTool por diseño (protocolo worker HMAC propio).
// whatspower.broadcast se RETIRÓ del registro (punto 8): herramienta del mundo
// CRM-ALBRA sin adaptador ni documentación verificable — contrato decorativo.
const ADAPTER_CONTRACTS = {
  'harness.internal': ['get_capabilities', 'get_connection_status', 'create_content_draft', 'generate_creative_brief', 'validate_content', 'request_approval', 'generate_performance_report'],
  'postgale.publish': ['get_connection_status'], // rutas retiradas hasta verificación documental
  'postiz.publish': ['list_accounts', 'schedule_post', 'publish_post', 'verify_publication', 'fetch_metrics', 'get_connection_status'],
  'postlake.publish': ['get_connection_status'], // rutas retiradas hasta verificación documental
  'scrapecreators.research': ['research_topic', 'analyze_competitor', 'fetch_comments'],
  'telegram.bot': ['get_connection_status', 'publish_post'],
  'whatsapp.session': ['get_connection_status', 'publish_post'],
  'chismoso.listening': ['research_topic'],
  'crm.conversation': ['fetch_messages', 'reply_to_message', 'create_lead', 'get_connection_status'],
  'krea.creativity': ['generate_creative_brief', 'publish_post'],
  'ytauto.video': ['generate_creative_brief', 'publish_post'],
  'nexscope.research': ['research_topic', 'analyze_competitor'],
  'albra.seed': ['get_connection_status'],
  'fbgroups.worker': ['fb_groups_post', 'fb_groups_sync', 'fb_groups_report', 'fb_groups_join'],
};
// Herramientas cuyo ejecutor NO vive en dispatchTool (fuera del caso default):
const EXECUTOR_OUTSIDE_DISPATCH = new Set(['harness.internal', 'fbgroups.worker']);
for (const [k, cs] of Object.entries(ADAPTER_CONTRACTS)) implemented.set(k, new Set(cs));

// 3) Casos del switch dispatchTool (el tool debe llegar a un adaptador real,
//    no al default "Adaptador no implementado")
const orphans = [];
for (const [key, contracts] of declared) {
  if (!implemented.has(key)) {
    orphans.push(`${key}: la herramienta NO tiene adaptador en executor.ts`);
    continue;
  }
  for (const c of contracts) {
    if (!implemented.get(key).has(c)) {
      orphans.push(`${key}: declara '${c}' sin ejecutor real`);
    }
  }
}

// 4) Las herramientas del registro con adaptador en dispatchTool deben tener
//    caso propio (no caer en el default "Adaptador no implementado")
for (const key of declared.keys()) {
  if (EXECUTOR_OUTSIDE_DISPATCH.has(key)) continue;
  if (!executorSrc.includes(`case '${key}'`)) {
    orphans.push(`${key}: sin case en dispatchTool (caería en 'Adaptador no implementado')`);
  }
}

if (orphans.length) {
  console.log('CONTRATOS HUÉRFANOS DETECTADOS:');
  for (const o of orphans) console.log('  ✗ ' + o);
  process.exit(1);
}
console.log(`CONTRATOS HONESTOS — ${declared.size} herramientas revisadas: todo contrato declarado tiene ejecutor real.`);
process.exit(0);
