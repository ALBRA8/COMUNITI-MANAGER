#!/usr/bin/env node
/**
 * Verificación P19-AJUSTES-01: con devIndicators:false el indicador flotante
 * de devtools de Next.js (la "N") NO debe renderizar ningún elemento visible.
 * Sonda DOM sobre el <nextjs-portal> + captura de evidencia.
 * Uso: TEST_BASE=http://localhost:3000 node scripts/verify-devtools-off.cjs
 */
const { chromium } = require('playwright');
const BASE = process.env.TEST_BASE ?? 'http://localhost:3000';
const CAPTURA = process.argv[2] ?? '/tmp/verify-indicator-after.png';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const problemas = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      problemas.push(`[${msg.type()}] ${msg.text()} (${msg.location()?.url ?? ''}${msg.location()?.lineNumber ? ':' + msg.location().lineNumber : ''})`);
    }
  });
  page.on('pageerror', (err) => problemas.push(`[pageerror] ${err.message}`));
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => {
    const portals = Array.from(document.querySelectorAll('nextjs-portal'));
    let botones = 0;
    let visibles = 0;
    for (const p of portals) {
      const root = p.shadowRoot;
      if (!root) continue;
      botones += root.querySelectorAll('button').length;
      for (const el of root.querySelectorAll('*')) {
        const cs = getComputedStyle(el);
        if (cs.display !== 'none' && cs.visibility !== 'hidden' && el.offsetWidth > 0 && el.offsetHeight > 0) visibles++;
      }
    }
    return { portales: portals.length, botonesEnShadow: botones, elementosVisibles: visibles };
  });
  await page.screenshot({ path: CAPTURA });
  console.log('SONDA:', JSON.stringify(info));
  console.log('CAPTURA:', CAPTURA);
  if (problemas.length) {
    console.log('PROBLEMAS DE CONSOLA (' + problemas.length + '):');
    for (const p of problemas.slice(0, 10)) console.log('  -', p.slice(0, 4000));
  } else {
    console.log('CONSOLA LIMPIA: 0 errores/avisos');
  }
  await browser.close();
  if (info.elementosVisibles > 0) {
    console.error('FALLO: el indicador sigue renderizando elementos visibles');
    process.exit(1);
  }
  console.log('OK: sin indicador visible (los nodos ocultos del portal no se renderizan en pantalla)');
})().catch((e) => { console.error(e); process.exit(1); });
