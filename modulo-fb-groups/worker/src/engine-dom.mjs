// Motor DOM: publica con el compositor visible de facebook.com a ritmo humano.
// Automatización best-effort: los selectores corresponden a la vista de escritorio
// de Facebook (octubre 2026) y pueden cambiar; ante cualquier marcador de
// advertencia el worker se detiene y reporta (nunca se fuerza un envío dudoso).

import { scanForMarkers } from './anti-ban.mjs';

const PROFILE_DIR = process.env.FB_PROFILE_DIR ?? './chrome-profile';
const HEADFUL = (process.env.FB_HEADFUL ?? '1') !== '0';
const TYPING_MIN_MS = Number(process.env.FB_TYPE_MIN_MS ?? 45);
const TYPING_MAX_MS = Number(process.env.FB_TYPE_MAX_MS ?? 160);

let context = null;

export async function ensureBrowser() {
  if (context) return context;
  const { chromium } = await import('playwright');
  context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chrome', // Chrome real del sistema (no Chromium desnudo)
    headless: !HEADFUL,
    viewport: null,
    args: ['--disable-blink-features=AutomationControlled', '--start-maximized'],
  });
  return context;
}

export async function closeBrowser() {
  if (context) {
    await context.close().catch(() => undefined);
    context = null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function rnd(min, max) {
  return Math.floor(min + Math.random() * (max - min));
}

/** Abre una página del contexto con user-agent normal. */
async function newPage() {
  const ctx = await ensureBrowser();
  const page = await ctx.newPage();
  await page.setDefaultTimeout(30_000);
  return page;
}

/** Verifica sesión: OK | AWAITING_SESSION | CHALLENGE:<marcador> */
export async function checkSession() {
  const page = await newPage();
  try {
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' });
    await sleep(rnd(1200, 2500));
    const body = (await page.locator('body').innerText().catch(() => '')).slice(0, 4000);
    const marker = scanForMarkers(body);
    if (marker) return `CHALLENGE:${marker}`;
    const loginForm = await page.locator('input[name="email"], form[action*="login"]').count();
    if (loginForm > 0) return 'AWAITING_SESSION';
    const composer = await page.locator('div[role="button"]:has-text("¿Qué estás pensando?"), div[role="button"]:has-text("What\'s on your mind")').count();
    if (composer > 0) return 'OK';
    // Sesión probablemente activa sin compositor visible (layout distinto); no se inventa.
    const loggedIn = await page.locator('[aria-label="Tu perfil"], [aria-label="Your profile"]').count();
    return loggedIn > 0 ? 'OK' : 'UNKNOWN';
  } finally {
    await page.close().catch(() => undefined);
  }
}

/** Importa la lista de grupos del usuario (mejor esfuerzo, sin datos inventados). */
export async function syncGroups() {
  const page = await newPage();
  try {
    await page.goto('https://www.facebook.com/groups/joins/', { waitUntil: 'domcontentloaded' });
    await sleep(rnd(2500, 4000));
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 1200);
      await sleep(rnd(700, 1400));
    }
    const body = (await page.locator('body').innerText().catch(() => ''));
    const marker = scanForMarkers(body.slice(0, 4000));
    if (marker) throw new Error(`DESAFIO_DETECTADO:${marker}`);

    const links = await page.$$eval('a[href*="/groups/"]', (as) =>
      as.map((a) => ({ href: a.getAttribute('href') ?? '', text: (a.textContent ?? '').trim() }))
    );
    const seen = new Map();
    for (const l of links) {
      const m = l.href.match(/groups\/([^/?]+)/);
      if (!m || !l.text || l.text.length < 2) continue;
      const fbId = decodeURIComponent(m[1]);
      if (!seen.has(fbId) && !['feed', 'discover', 'joins', 'member-requests'].includes(fbId)) {
        seen.set(fbId, { fbId, name: l.text, url: `https://www.facebook.com/groups/${fbId}/` });
      }
    }
    return [...seen.values()];
  } finally {
    await page.close().catch(() => undefined);
  }
}

/** Tecleo humano: carácter a carácter con jitter. */
async function typeHuman(page, text) {
  for (const ch of text) {
    await page.keyboard.type(ch, { delay: rnd(TYPING_MIN_MS, TYPING_MAX_MS) });
    if (Math.random() < 0.03) await sleep(rnd(400, 1100)); // micro-pausas de pensamiento
  }
}

async function openComposerAndType(page, text) {
  const composer = page.locator('div[role="button"]:has-text("Escribe algo"), div[role="button"]:has-text("¿Qué estás pensando?"), div[role="button"]:has-text("Write something"), div[role="button"]:has-text("What\'s on your mind")').first();
  await composer.waitFor({ state: 'visible', timeout: 25_000 });
  await sleep(rnd(800, 1800));
  await composer.click();
  await sleep(rnd(1200, 2600));
  const dialog = page.locator('div[role="dialog"]').first();
  const editable = dialog.locator('div[contenteditable="true"]').first();
  await editable.waitFor({ state: 'visible', timeout: 20_000 });
  await editable.click();
  await sleep(rnd(500, 1200));
  await typeHuman(page, text);
  return dialog;
}

async function submitAndConfirm(page, dialog) {
  const publish = dialog.locator('div[role="button"]:has-text("Publicar"), div[role="button"]:has-text("Post"), div[aria-label="Publicar"], div[aria-label="Post"]').first();
  await sleep(rnd(900, 2000));
  await publish.click();
  // Espera a que el diálogo cierre o aparezca un marcador de advertencia.
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    const body = (await page.locator('body').innerText().catch(() => '')).slice(0, 6000);
    const marker = scanForMarkers(body);
    if (marker) return { submitted: false, marker };
    const dialogOpen = await dialog.isVisible().catch(() => false);
    if (!dialogOpen) break;
  }
  return { submitted: true, marker: null };
}

async function tryCapturePermalink(page, beforeMs) {
  // Mejor esfuerzo: busca un enlace a post reciente en el feed del grupo.
  for (let i = 0; i < 12; i++) {
    await sleep(1500);
    const href = await page.$$eval('a[href*="/posts/"], a[href*="/permalink/"]', (as) => as.map((a) => a.getAttribute('href'))).catch(() => []);
    const fresh = (href ?? []).find((h) => h);
    if (fresh) return fresh.startsWith('http') ? fresh : `https://www.facebook.com${fresh}`;
  }
  return '';
}

/** Publica en un grupo. targetKind: group | page_in_group | profile */
export async function postJob(job) {
  const page = await newPage();
  try {
    const url = job.targetKind === 'profile' ? 'https://www.facebook.com/' : job.targetUrl;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await sleep(rnd(2000, 3500));

    const body = (await page.locator('body').innerText().catch(() => '')).slice(0, 4000);
    const marker0 = scanForMarkers(body);
    if (marker0) return { status: 'FAILED', failReason: `DESAFIO_DETECTADO:${marker0}` };
    if (await page.locator('input[name="email"]').count()) return { status: 'FAILED', failReason: 'Sin sesión iniciada en el perfil del worker' };

    if (job.targetKind === 'page_in_group') {
      // Intento honesto de cambiar identidad a Página; si el selector no aparece, no se fuerza.
      const identity = page.locator(`div[role="button"]:has-text("${job.pageName}")`).first();
      if (await identity.isVisible().catch(() => false)) {
        await identity.click();
        await sleep(rnd(1500, 3000));
      } else {
        return { status: 'FAILED', failReason: 'Selector de identidad de Página no visible en este grupo (publica como perfil o hazlo manualmente)' };
      }
    }

    const dialog = await openComposerAndType(page, job.variant);
    const result = await submitAndConfirm(page, dialog);

    if (!result.submitted) {
      return { status: 'FAILED', failReason: `Facebook mostró un bloqueo: ${result.marker}` };
    }

    const postUrl = await tryCapturePermalink(page, Date.now());
    return {
      status: 'POSTED',
      postUrl,
      failReason: postUrl ? '' : 'Publicado; URL exacta no capturable en este grupo (evidencia: confirmación de envío del compositor)',
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

/** Primer comentario sobre el post recién publicado (mejor esfuerzo). */
export async function firstComment(job, postUrl) {
  if (!job.firstComment || !postUrl) return false;
  const page = await newPage();
  try {
    await page.goto(postUrl, { waitUntil: 'domcontentloaded' });
    await sleep(rnd(2500, 4000));
    const commentBox = page.locator('div[contenteditable="true"][aria-label*="Comenta"], div[contenteditable="true"][aria-label*="Comment"]').first();
    if (!(await commentBox.isVisible().catch(() => false))) return false;
    await commentBox.click();
    await typeHuman(page, job.firstComment);
    await page.keyboard.press('Enter');
    await sleep(rnd(1500, 2500));
    return true;
  } finally {
    await page.close().catch(() => undefined);
  }
}
