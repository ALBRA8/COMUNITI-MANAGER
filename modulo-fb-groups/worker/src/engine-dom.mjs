// Motor DOM: publica con el compositor visible de facebook.com a ritmo humano.
// Automatización best-effort: los selectores corresponden a la vista de escritorio
// de Facebook (octubre 2026) y pueden cambiar; ante cualquier marcador de
// advertencia el worker se detiene y reporta (nunca se fuerza un envío dudoso).
// P1: adjuntos de imagen (hasta 4) — si no se pueden adjuntar, NO se publica
// un post distinto al aprobado: fallo honesto ADJUNTO_FALLIDO.
// P7: proxy opcional por worker (FB_PROXY) — el Chrome completo sale por ahí;
// si el proxy cae, el fallo es honesto y visible, nunca un retry ciego.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { scanForMarkers } from './anti-ban.mjs';

const PROFILE_DIR = process.env.FB_PROFILE_DIR ?? './chrome-profile';
const HEADFUL = (process.env.FB_HEADFUL ?? '1') !== '0';
const TYPING_MIN_MS = Number(process.env.FB_TYPE_MIN_MS ?? 45);
const TYPING_MAX_MS = Number(process.env.FB_TYPE_MAX_MS ?? 160);
const PROXY_SERVER = process.env.FB_PROXY ?? ''; // p.ej. http://proxy.local:8080 o socks5://host:1080
const PROXY_USERNAME = process.env.FB_PROXY_USERNAME ?? '';
const PROXY_PASSWORD = process.env.FB_PROXY_PASSWORD ?? '';

let context = null;

export async function ensureBrowser() {
  if (context) return context;
  const { chromium } = await import('playwright');
  const proxy = PROXY_SERVER
    ? {
        server: PROXY_SERVER,
        ...(PROXY_USERNAME ? { username: PROXY_USERNAME } : {}),
        ...(PROXY_PASSWORD ? { password: PROXY_PASSWORD } : {}),
      }
    : undefined;
  if (proxy) console.log(`[proxy] Chrome saldrá por ${PROXY_SERVER.replace(/\/\/[^@/]+@/, '//•••@')}`);
  context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chrome', // Chrome real del sistema (no Chromium desnudo)
    headless: !HEADFUL,
    viewport: null,
    ...(proxy ? { proxy } : {}),
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

// ─── Adjuntos (P1): resolver archivos y engancharlos al compositor ──

const MEDIA_EXT_OK = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

/** Resuelve los adjuntos del job: descarga URLs http(s) a un temp local o valida rutas del worker. */
async function resolveMediaFiles(job) {
  const list = Array.isArray(job.mediaUrls) ? job.mediaUrls : [];
  const dir = path.join(os.tmpdir(), `fb-worker-media-${job.id ?? Date.now()}`);
  const files = [];
  for (let i = 0; i < list.length; i++) {
    const m = String(list[i]).trim();
    if (!m) continue;
    if (/^https?:\/\//i.test(m)) {
      const res = await fetch(m, { redirect: 'follow' });
      if (!res.ok) throw new Error(`Descarga fallida (HTTP ${res.status}) para ${m.slice(0, 80)}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1024) throw new Error(`Archivo sospechosamente pequeño (${buf.length} B) en ${m.slice(0, 80)}`);
      let ext = path.extname(new URL(m).pathname).toLowerCase();
      if (!MEDIA_EXT_OK.includes(ext)) ext = '.jpg'; // URL sin extensión: Facebook detecta por contenido
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `media-${i}${ext}`);
      fs.writeFileSync(file, buf);
      files.push(file);
    } else {
      if (!fs.existsSync(m)) throw new Error(`Ruta local no existe en la máquina del worker: ${m}`);
      files.push(m);
    }
  }
  return { files, dir };
}

function cleanupMedia(dir, files) {
  for (const f of files) {
    if (f.startsWith(os.tmpdir())) fs.rmSync(f, { force: true });
  }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ya limpio */ }
}

/** Abre el selector de fotos del compositor y adjunta los archivos. Lanza si el DOM no colabora. */
async function attachMedia(page, dialog, files) {
  const photoBtn = dialog.locator(
    'div[role="button"]:has-text("Foto/vídeo"), div[role="button"]:has-text("Foto/Vídeo"), div[role="button"]:has-text("Foto"), div[role="button"][aria-label*="Foto"], div[role="button"]:has-text("Photo/Video"), div[role="button"][aria-label*="Photo"]'
  ).first();
  await sleep(rnd(600, 1400));
  await photoBtn.click();
  await sleep(rnd(1200, 2500));
  const input = dialog.locator('input[type="file"]').first();
  if (!(await input.count())) {
    throw new Error('Input de archivos no visible en el compositor (¿layout distinto o botón de foto no encontrado?)');
  }
  await input.setInputFiles(files);
  // Espera a que suban las miniaturas: no se fuerza envío con la subida a medias.
  await sleep(rnd(2500, 4500) + files.length * rnd(1500, 3000));
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

    // Adjuntos (P1): si se prometieron fotos y no se pueden enganchar, no se publica nada.
    const mediaList = Array.isArray(job.mediaUrls) ? job.mediaUrls.filter(Boolean) : [];
    let mediaNote = '';
    if (mediaList.length > 0) {
      let resolved;
      try {
        resolved = await resolveMediaFiles(job);
        await attachMedia(page, dialog, resolved.files);
        mediaNote = `${resolved.files.length} adjunto(s)`;
      } catch (e) {
        if (resolved) cleanupMedia(resolved.dir, resolved.files);
        return { status: 'FAILED', failReason: `ADJUNTO_FALLIDO: ${e.message}` };
      }
      cleanupMedia(resolved.dir, resolved.files);
    }

    const result = await submitAndConfirm(page, dialog);

    if (!result.submitted) {
      return { status: 'FAILED', failReason: `Facebook mostró un bloqueo: ${result.marker}` };
    }

    const postUrl = await tryCapturePermalink(page, Date.now());
    return {
      status: 'POSTED',
      postUrl,
      failReason: postUrl ? '' : `Publicado${mediaNote ? ` con ${mediaNote}` : ''}; URL exacta no capturable en este grupo (evidencia: confirmación de envío del compositor)`,
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

// ─── Auto-join (P6): unirse a un grupo desde su URL ──────────────

/** Estados honestos: JOINED | REQUESTED (espera al admin) | SKIPPED (ya miembro) | FAILED.
 *  Los cuestionarios de admisión NUNCA se automatizan: las respuestas son responsabilidad humana. */
export async function joinGroupByUrl(url) {
  const page = await newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await sleep(rnd(2500, 4500));
    const body = (await page.locator('body').innerText().catch(() => '')).slice(0, 5000);
    const marker0 = scanForMarkers(body);
    if (marker0) return { status: 'FAILED', failReason: `DESAFIO_DETECTADO:${marker0}` };
    if (await page.locator('input[name="email"]').count()) {
      return { status: 'FAILED', failReason: 'Sin sesión iniciada en el perfil del worker' };
    }

    const alreadyMember = /has entrado|eres miembro|you're a member|you are a member|joined the group/i.test(body);
    const cancelRequest = /cancelar solicitud|cancel request/i.test(body);
    if (alreadyMember) return { status: 'SKIPPED', failReason: 'Ya eres miembro de este grupo' };
    if (cancelRequest) return { status: 'REQUESTED', failReason: 'Ya había una solicitud pendiente en este grupo' };

    const joinBtn = page.locator(
      'div[role="button"]:has-text("Unirse al grupo"), div[role="button"]:has-text("Unirse"), ' +
      'div[role="button"]:has-text("Join group"), div[role="button"]:has-text("Join"), ' +
      'div[role="button"][aria-label*="Unirse"], div[role="button"][aria-label*="Join"]'
    ).first();
    if (!(await joinBtn.isVisible().catch(() => false))) {
      return { status: 'FAILED', failReason: 'Botón de unión no visible (¿layout distinto, grupo privado o página de error?)' };
    }
    await sleep(rnd(1200, 2600));
    await joinBtn.click();

    // Confirmación honesta: solicitud enviada, membresía, cuestionario o bloqueo.
    for (let i = 0; i < 12; i++) {
      await sleep(1000);
      const body2 = (await page.locator('body').innerText().catch(() => '')).slice(0, 6000);
      const marker = scanForMarkers(body2);
      if (marker) return { status: 'FAILED', failReason: `Facebook mostró un bloqueo: ${marker}` };
      if (/cancelar solicitud|solicitud enviada|solicitaste unirte|request sent|cancel request|requested to join/i.test(body2)) {
        return { status: 'REQUESTED', failReason: 'Solicitud enviada: espera aprobación del admin' };
      }
      if (/has entrado|eres miembro|you're a member|you are a member|joined the group/i.test(body2)) {
        return { status: 'JOINED' };
      }
      const questions = await page.locator('div[role="dialog"] textarea, div[role="dialog"] input[type="radio"], div[role="dialog"] div[role="radiogroup"]').count();
      if (questions > 0) {
        return { status: 'FAILED', failReason: 'El grupo exige responder un cuestionario de admisión: no se automatiza (responde manualmente desde el Chrome del worker)' };
      }
    }
    return { status: 'FAILED', failReason: 'No se confirmó la unión tras el clic (FB no mostró solicitud enviada ni membresía)' };
  } finally {
    await page.close().catch(() => undefined);
  }
}
