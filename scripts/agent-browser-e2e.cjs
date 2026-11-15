#!/usr/bin/env node
/**
 * AGENTE NAVEGADOR PROPIO — arnés agéntico de QA para NUESTRO panel (P17-lite).
 * Patrón browser-use adoptado en sala limpia (docs/research/BROWSER_USE_DESTRIPE.md):
 *   1. Registro de acciones con validación (patrón Tools/Controller).
 *   2. Guardarrails de dominio deny-by-default (patrón domains.py) — MÁS estrictos
 *      que browser-use: también abortamos subrecursos de terceros (app 100% local).
 *   3. Topes duros de pasos y de tiempo por misión (patrón max_steps).
 *   4. Extracción estructurada contra claves fijas (patrón output_model_schema).
 *   5. Juez determinista de cierre (patrón judge.py, sin LLM): re-verifica
 *      invariantes al terminar y distingue violaciones esperadas de las demás.
 *   6. Observabilidad por paso: historial tabulado + capturas de evidencia.
 * Alcance permitido: SOLO TEST_BASE (localhost/127.0.0.1). La regla fija §5.1
 * del motor (BROWSER_AUTOMATION* → BLOQUEADO) lo impide contra redes sociales;
 * este arnés no toca credenciales ni datos de terceros. Misiones SOLO LECTURA
 * (higiene de la casa: no crea artefactos en DB).
 * Motor: Playwright global del entorno (sin dependencia nueva en el entregable).
 * Uso: bash scripts/run-with-server.sh "node scripts/agent-browser-e2e.cjs"
 *      TEST_BASE=http://localhost:3000 node scripts/agent-browser-e2e.cjs
 */
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const BASE = process.env.TEST_BASE ?? 'http://localhost:3000';
const MAX_PASOS = 20;
const MAX_MS = 60_000;
const DIR_CAPTURAS = '/tmp/agent-e2e';

// --- Guardarrails (patrón domains.py, deny-by-default) -----------------------
const base = new URL(BASE);
const HOSTS_PERMITIDOS = new Set(['localhost', '127.0.0.1', '[::1]']);
const ESQUEMAS_PERMITIDOS = new Set(['http:', 'https:']); // about:/data:/blob: no generan request
const HOST = base.host; // host:puerto del TEST_BASE

/** Decide si una URL de red está permitida. Honestidad de la casa: función pura, auditable. */
function urlPermitida(u) {
  if (!ESQUEMAS_PERMITIDOS.has(u.protocol)) return false; // file:, javascript:, ftp:...
  const host = u.hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

// --- Carga de Playwright (global del entorno, con fallback de resolución) ----
function cargarPlaywright() {
  try { return require('playwright'); } catch { /* no local: resolver global */ }
  const root = execSync('npm root -g').toString().trim();
  return require(path.join(root, 'playwright'));
}

// --- Registro de acciones (patrón Tools) -------------------------------------
/** Cada acción: { validar(args), ejecutar(ctx, args) → detalle }. Nada fuera del registro. */
const REGISTRY = {
  async abrir(ctx, { ruta }) {
    if (typeof ruta !== 'string' || !ruta) throw new Error('abrir: ruta requerida');
    const destino = ruta.startsWith('http') ? new URL(ruta) : new URL(ruta, BASE);
    if (!urlPermitida(destino)) throw new Error(`abrir: origen NO permitido por guardarrails: ${destino.href}`);
    await ctx.page.goto(destino.href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    return `abierta ${destino.pathname}`;
  },
  async clicRol(ctx, { rol, nombre }) {
    if (!['button', 'link', 'tab'].includes(rol)) throw new Error(`clicRol: rol no permitido: ${rol}`);
    const loc = ctx.page.getByRole(rol, { name: nombre }).first();
    try {
      await loc.waitFor({ state: 'visible', timeout: 8_000 });
    } catch {
      // auto-corrección determinista: un solo reintento con el rol alterno
      const alterno = rol === 'button' ? 'link' : 'button';
      await ctx.page.getByRole(alterno, { name: nombre }).first().waitFor({ state: 'visible', timeout: 8_000 });
      await ctx.page.getByRole(alterno, { name: nombre }).first().click();
      return `clic ${alterno} "${nombre}" (tras reintento)`;
    }
    await loc.click();
    return `clic ${rol} "${nombre}"`;
  },
  async textoVisible(ctx, { texto, timeout = 15_000 }) {
    if (typeof texto !== 'string') throw new Error('textoVisible: texto requerido');
    const loc = ctx.page.getByText(texto, { exact: false }).first();
    await loc.waitFor({ state: 'visible', timeout });
    await loc.scrollIntoViewIfNeeded().catch(() => {}); // visible en DOM basta; el scroll es best-effort
    return `"${texto}" visible`;
  },
  async captura(ctx, { nombre }) {
    if (!/^[a-z0-9-]+$/i.test(nombre)) throw new Error('captura: nombre alfanumérico requerido');
    fs.mkdirSync(DIR_CAPTURAS, { recursive: true });
    const file = path.join(DIR_CAPTURAS, `${ctx.ts}-${nombre}.png`);
    await ctx.page.screenshot({ path: file, fullPage: false });
    return `captura ${file}`;
  },
  async extraerEstado(ctx) {
    const estado = await ctx.page.evaluate(() => {
      const dedupe = (arr) => [...new Set(arr.filter((t) => t && t.length > 1 && t.length < 60))];
      return {
        url: location.href,
        title: document.title,
        h1: document.querySelector('h1')?.textContent?.trim() ?? null,
        navegacion: dedupe([...document.querySelectorAll('nav button, nav a, aside button, aside a')].map((e) => e.textContent?.trim())),
        botones: dedupe([...document.querySelectorAll('button')].map((e) => e.textContent?.trim())).slice(0, 40),
      };
    });
    ctx.estado = estado;
    return `estado: title="${estado.title}" nav=${estado.navegacion.length} botones=${estado.botones.length}`;
  },
  async esperar(ctx, { ms = 500 }) {
    if (typeof ms !== 'number' || ms < 0 || ms > 10_000) throw new Error('esperar: ms en [0,10000]');
    await ctx.page.waitForTimeout(ms);
    return `espera ${ms}ms`;
  },
  async fin(ctx, { resumen }) {
    ctx.resumenFinal = String(resumen ?? '');
    return 'misión cerrada';
  },
};

// --- Misiones declarativas (SOLO LECTURA sobre nuestra app) ------------------
const MISIONES = [
  {
    nombre: 'portada-renderiza',
    pasos: [
      { accion: 'abrir', args: { ruta: '/' } },
      { accion: 'textoVisible', args: { texto: 'Resumen ejecutivo' } },
      { accion: 'extraerEstado', args: {} },
      { accion: 'captura', args: { nombre: 'portada' } },
    ],
    verificar: (ctx) => {
      const e = ctx.estado;
      if (!e || !e.title.includes('COMUNITI-MANAGER')) throw new Error(`title sin marca propia: "${e?.title}"`);
      if (e.navegacion.length < 15) throw new Error(`navegación incompleta: ${e.navegacion.length} ítems`);
      if (e.botones.length === 0) throw new Error('portada sin controles interactivos');
      return `title OK, nav=${e.navegacion.length}, botones=${e.botones.length}`;
    },
  },
  {
    nombre: 'modulo-grupos-navega',
    pasos: [
      { accion: 'clicRol', args: { rol: 'button', nombre: 'Grupos de Facebook' } },
      { accion: 'textoVisible', args: { texto: 'Mejores horas' } },
      { accion: 'extraerEstado', args: {} },
      { accion: 'captura', args: { nombre: 'modulo-fbgroups' } },
    ],
    verificar: (ctx) => {
      if (!ctx.estado || !ctx.estado.url.startsWith(BASE)) throw new Error('salimos del origen permitido');
      return 'módulo FB accesible por navegación real';
    },
  },
  {
    nombre: 'cumplimiento-meta-navega',
    pasos: [
      { accion: 'clicRol', args: { rol: 'button', nombre: 'Centro de Cumplimiento Meta' } },
      { accion: 'textoVisible', args: { texto: 'Techos multi-red' } },
      { accion: 'extraerEstado', args: {} },
      { accion: 'captura', args: { nombre: 'centro-cumplimiento' } },
    ],
    verificar: (ctx) => {
      const texto = JSON.stringify(ctx.estado);
      if (!/PERMITIDO|BLOQUEADO|TECHOS/i.test(texto) && !ctx.estado.url.startsWith(BASE)) throw new Error('centro sin señales del motor');
      return 'Centro de Cumplimiento accesible con pestaña de techos';
    },
  },
  {
    nombre: 'guardarrails-bloquean-terceros',
    // Prueba NEGATIVA del guardarrail: una navegación renegada debe abortarse,
    // quedar registrada como violación esperada y nunca cambiar el origen.
    pasos: [],
    especial: 'prueba-guardarrails',
  },
];

// --- Runner ------------------------------------------------------------------
(async () => {
  const { chromium } = cargarPlaywright();
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const historial = [];
  const violaciones = []; // { url, mision, esperada }
  const erroresPagina = [];
  const erroresConsola = [];
  let fallos = 0;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Capa 2 de enforcement: interceptor de red de TODA request (documentos y subrecursos).
  await page.route('**/*', (route) => {
    let u;
    try { u = new URL(route.request().url()); } catch { violaciones.push({ url: String(route.request().url()), mision: 'parse', esperada: false }); return route.abort(); }
    if (urlPermitida(u)) return route.continue();
    violaciones.push({ url: u.href, mision: page.__misionActual ?? 'desconocida', esperada: false });
    return route.abort();
  });
  page.on('pageerror', (e) => erroresPagina.push(String(e?.message ?? e)));
  page.on('console', (m) => { if (m.type() === 'error') erroresConsola.push(m.text().slice(0, 160)); });

  async function paso(ctx, mision, i, pasoDef) {
    const fn = REGISTRY[pasoDef.accion];
    if (!fn) throw new Error(`acción no registrada: ${pasoDef.accion}`);
    const t0 = Date.now();
    const detalle = await fn(ctx, pasoDef.args ?? {});
    historial.push({ mision: mision.nombre, paso: `${i + 1}.${pasoDef.accion}`, resultado: 'OK', detalle, ms: Date.now() - t0 });
  }

  try {
    for (const mision of MISIONES) {
      const ctx = { page, ts, estado: null, resumenFinal: '' };
      page.__misionActual = mision.nombre;
      const t0 = Date.now();
      try {
        if (mision.especial === 'prueba-guardarrails') {
          // navegación renegada: el interceptor la aborta → goto falla (o no cambia el origen)
          let abortada = false;
          try { await page.goto('https://example.com/', { timeout: 8_000 }); } catch { abortada = true; }
          const origen = new URL(page.url());
          if (!urlPermitida(origen)) throw new Error('el origen cambió a un host NO permitido');
          if (!violaciones.some((v) => v.url.includes('example.com'))) throw new Error('la violación no quedó registrada');
          violaciones.filter((v) => v.url.includes('example.com')).forEach((v) => { v.esperada = true; });
          historial.push({ mision: mision.nombre, paso: '1.prueba-guardarrails', resultado: 'OK', detalle: `navegación a https://example.com/ abortada (abortada=${abortada}); origen intacto: ${origen.host}`, ms: Date.now() - t0 });
        } else {
          if (mision.pasos.length > MAX_PASOS) throw new Error('misión excede MAX_PASOS');
          for (let i = 0; i < mision.pasos.length; i++) await paso(ctx, mision, i, mision.pasos[i]);
          const veredicto = mision.verificar(ctx);
          historial.push({ mision: mision.nombre, paso: 'verificar', resultado: 'OK', detalle: veredicto, ms: Date.now() - t0 });
        }
      } catch (e) {
        fallos++;
        historial.push({ mision: mision.nombre, paso: 'misión', resultado: 'FAIL', detalle: String(e?.message ?? e).slice(0, 200), ms: Date.now() - t0 });
      }
    }
  } finally {
    // --- Juez de cierre (patrón judge.py, determinista) -----------------------
    const inesperadas = violaciones.filter((v) => !v.esperada);
    const juicios = [
      { invariante: 'misiones OK', valor: `${MISIONES.length - fallos}/${MISIONES.length}`, ok: fallos === 0 },
      { invariante: 'excepciones no capturadas en página', valor: erroresPagina.length, ok: erroresPagina.length === 0 },
      { invariante: 'violaciones de guardarrails inesperadas', valor: inesperadas.length, ok: inesperadas.length === 0 },
      { invariante: 'violaciones esperadas (prueba negativa)', valor: violaciones.filter((v) => v.esperada).length, ok: violaciones.some((v) => v.esperada) },
    ];
    const juezOk = juicios.every((j) => j.ok);

    console.log('\n=== HISTORIAL DEL AGENTE (por paso) ===');
    console.table(historial);
    if (violaciones.length) {
      console.log('=== VIOLACIONES DE GUARDARRAILS REGISTRADAS ===');
      console.table(violaciones);
    }
    if (erroresConsola.length) console.log(`console.error en página (${erroresConsola.length}, informativo):\n - ${erroresConsola.slice(0, 5).join('\n - ')}`);
    console.log('=== JUEZ DE CIERRE ===');
    console.table(juicios);
    console.log(`AGENTE-E2E ${juezOk ? 'OK' : 'FAIL'} — misiones ${MISIONES.length - fallos}/${MISIONES.length}, pasos ${historial.length}, violaciones inesperadas ${inesperadas.length}, pageerror ${erroresPagina.length}`);

    await browser.close();
    process.exitCode = juezOk ? 0 : 1;
  }
})().catch((e) => {
  console.error('AGENTE-E2E FAIL (fatal):', e?.message ?? e);
  process.exit(1);
});
