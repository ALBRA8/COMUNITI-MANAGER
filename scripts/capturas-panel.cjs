#!/usr/bin/env node
/**
 * CAPTURAS DEL PANEL para revisión del operador — lo que ve el agente (P17-lite).
 * Recorrido solo-lectura con el mismo espíritu del arnés agent-browser-e2e.cjs:
 * navegación real por los botones del panel, espera de render, captura de página
 * completa de cada sección. Sin artefactos en DB.
 * Salida: OUT_DIR (default /home/z/my-project/download/capturas-panel).
 * Uso (con server ya arriba en :3000):
 *   TEST_BASE=http://localhost:3000 node scripts/capturas-panel.cjs
 */
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const BASE = process.env.TEST_BASE ?? 'http://localhost:3000';
const OUT = process.env.OUT_DIR ?? '/home/z/my-project/download/capturas-panel';

function cargarPlaywright() {
  try { return require('playwright'); } catch { /* resolver global */ }
  const root = execSync('npm root -g').toString().trim();
  return require(path.join(root, 'playwright'));
}

// [nombreArchivo, botón de navegación, texto que confirma la sección]
const SECCIONES = [
  ['01-dashboard-resumen-ejecutivo.png', null, 'Resumen ejecutivo'],
  ['02-ajustes-integraciones.png', 'Ajustes e integraciones', 'Publicación multirred'],
  ['03-marcas-y-cuentas.png', 'Marcas y cuentas', null],
  ['04-agentes.png', 'Agentes', null],
  ['05-grupos-de-facebook.png', 'Grupos de Facebook', null],
  ['06-centro-cumplimiento-meta.png', 'Centro de Cumplimiento Meta', null],
  ['07-automatizaciones.png', 'Automatizaciones', null],
  ['08-calendario-editorial.png', 'Calendario editorial', null],
];

(async () => {
  const { chromium } = cargarPlaywright();
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const resultados = [];

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.getByText('Resumen ejecutivo', { exact: false }).first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1500); // asentar animaciones de entrada

  for (const [archivo, nav, textoConfirm] of SECCIONES) {
    const t0 = Date.now();
    try {
      if (nav) {
        const btn = page.getByRole('button', { name: nav }).first();
        await btn.waitFor({ state: 'visible', timeout: 10_000 });
        await btn.click();
        await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(1200); // asentar render y animaciones
      }
      if (textoConfirm) {
        await page.getByText(textoConfirm, { exact: false }).first().waitFor({ state: 'visible', timeout: 15_000 });
      }
      const destino = path.join(OUT, archivo);
      await page.screenshot({ path: destino, fullPage: true });
      resultados.push({ seccion: nav ?? 'portada', archivo, ok: true, ms: Date.now() - t0 });
    } catch (e) {
      resultados.push({ seccion: nav ?? 'portada', archivo, ok: false, error: String(e?.message ?? e).slice(0, 120), ms: Date.now() - t0 });
    }
  }

  console.table(resultados);
  const fallos = resultados.filter((r) => !r.ok);
  await browser.close();
  if (fallos.length) {
    console.error(`CAPTURAS FAIL: ${fallos.length}/${resultados.length} fallidas`);
    process.exit(1);
  }
  console.log(`CAPTURAS OK: ${resultados.length}/${resultados.length} en ${OUT}`);
})().catch((e) => {
  console.error('CAPTURAS FAIL (fatal):', e?.message ?? e);
  process.exit(1);
});
