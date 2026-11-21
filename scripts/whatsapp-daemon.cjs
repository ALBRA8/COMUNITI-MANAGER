#!/usr/bin/env node
/**
 * CONECTOR DE WHATSAPP PROPIO del agente COMUNITI-MANAGER (P19-WA-PROPIA).
 *
 * Qué hace:
 *  - Vincula la sesión de WhatsApp del operador por QR (protocolo WhatsApp
 *    Web, sin navegador). El QR se muestra en el PANEL (vista Canales) y
 *    también en esta consola.
 *  - Reporta el estado al panel (DISCONNECTED | CONNECTING | QR_WAITING |
 *    CONNECTED) firmado con HARNESS_WEBHOOK_SECRET — el mismo estándar HMAC
 *    de la malla de webhooks. Sin navegador: la política §5.1 no aplica.
 *  - ENVÍA con cola: el panel encola (POST /send) y este conector despacha a
 *    ritmo humano (gap ≥ WHATSAPP_MIN_GAP_SECONDS con jitter, techo diario
 *    WHATSAPP_DAILY_CAP), respetando la PAUSA GLOBAL del panel y confirmando
 *    cada entrega con un reporte FIRMADO a /api/whatsapp/delivery
 *    (DELIVERED con waMessageId / FAILED con motivo). Sin reporte firmado no
 *    hay éxito: la evidencia de cada envío vive en la auditoría del panel.
 *  - La sesión queda guardada en prisma/db/whatsapp-session: no se re-escanea
 *    el QR al reiniciar. Bórrala para desvincular.
 *
 * Honestidad: protocolo NO oficial. WhatsApp puede restringir el número ante
 * reportes o volumen abusivo; el motor del panel aplica pausa global y techos
 * (WHATSAPP_SEND), y este conector añade su propia cola y ritmo humano.
 *
 * Uso (desde app/ o raíz del proyecto, donde esté node_modules):
 *   node scripts/whatsapp-daemon.cjs
 * Env opcionales:
 *   HARNESS_URL (default http://localhost:3000)
 *   HARNESS_WEBHOOK_SECRET (si el panel lo exige, obligatoria la firma)
 *   WHATSAPP_DAEMON_NAME (default wa-local)
 *   WHATSAPP_DAEMON_PORT (default 3010, http local de estado/envío/logout)
 *   WHATSAPP_DAEMON_TOKEN (si se define, POST /send exige x-daemon-token)
 *   WHATSAPP_DAILY_CAP (default 200 envíos/día; solo puede bajarse)
 *   WHATSAPP_MIN_GAP_SECONDS (default 6 s entre envíos, con jitter)
 */
const path = require('path');
const http = require('http');
const { createHmac, timingSafeEqual } = require('node:crypto');

const HARNESS_URL = (process.env.HARNESS_URL || 'http://localhost:3000').replace(/\/$/, '');
const SECRET = process.env.HARNESS_WEBHOOK_SECRET || '';
const NAME = process.env.WHATSAPP_DAEMON_NAME || 'wa-local';
const PORT = Number(process.env.WHATSAPP_DAEMON_PORT || 3010);
const DAEMON_TOKEN = process.env.WHATSAPP_DAEMON_TOKEN || '';
const DAILY_CAP = (() => {
  // Techo fijo 200/día; el operador solo puede BAJARLO (misma regla que el motor).
  const env = Number(process.env.WHATSAPP_DAILY_CAP ?? '');
  if (!Number.isFinite(env) || env <= 0) return 200;
  return Math.min(200, Math.floor(env));
})();
const MIN_GAP_MS = (() => {
  const env = Number(process.env.WHATSAPP_MIN_GAP_SECONDS ?? '');
  if (!Number.isFinite(env) || env <= 0) return 6000;
  return Math.max(1000, Math.min(600, Math.floor(env) * 1000));
})();
const AUTH_DIR = path.join(__dirname, '..', 'prisma', 'db', 'whatsapp-session');

// ─── Cola de envío con ritmo humano ──────────────────────────────
const sendQueue = [];
let lastSendAt = 0;
let dailyCount = 0;
let dayKey = new Date().toDateString();
let panelPaused = false;
let lastPauseCheckAt = 0;

function dailyCapReached() {
  const today = new Date().toDateString();
  if (today !== dayKey) { dayKey = today; dailyCount = 0; }
  return dailyCount >= DAILY_CAP;
}

async function refreshPanelPaused() {
  // Consulta la pausa global del panel (máx cada 10 s): mientras esté en
  // pausa, la cola NO despacha nada (doble cerradura con el firewall).
  if (Date.now() - lastPauseCheckAt < 10_000) return;
  lastPauseCheckAt = Date.now();
  try {
    const r = await fetch(`${HARNESS_URL}/api/harness`, { signal: AbortSignal.timeout(4000) });
    const d = await r.json().catch(() => ({}));
    panelPaused = d?.paused === true;
  } catch { /* panel caído: se mantiene el último valor conocido */ }
}

function signedPost(panelPath, bodyObj) {
  const raw = JSON.stringify(bodyObj);
  const headers = { 'Content-Type': 'application/json' };
  if (SECRET) headers['x-harness-signature'] = 'sha256=' + createHmac('sha256', SECRET).update(raw, 'utf8').digest('hex');
  return fetch(`${HARNESS_URL}${panelPath}`, { method: 'POST', headers, body: raw })
    .then((r) => r.json().catch(() => ({})))
    .catch((e) => ({ error: e.message }));
}

async function reportDelivery(entry, status, extra = {}) {
  const resp = await signedPost('/api/whatsapp/delivery', {
    daemonName: NAME,
    jobId: entry.jobId,
    chatId: entry.to,
    status,
    ...extra,
  });
  console.log(`[wa-daemon] entrega ${status} de ${entry.to} (jobId=${entry.jobId ?? 'sin-id'})${resp?.ok ? '' : ` — RECHAZO del panel: ${resp?.error ?? 'respuesta ' + JSON.stringify(resp).slice(0, 120)}`}`);
}

// Resolución de dependencias desde el layout del repo (scripts/ en la raíz,
// node_modules en app/): mismo criterio que scripts/lib/app-prisma.cjs.
const fsMod = require('node:fs');
function requireFromApp(modName) {
  const candidates = [
    path.join(__dirname, '..', 'app', 'node_modules', modName),
    path.join(__dirname, '..', 'node_modules', modName),
  ];
  for (const c of candidates) if (fsMod.existsSync(c)) return require(c);
  return require(modName);
}

let baileys;
try {
  baileys = requireFromApp('@whiskeysockets/baileys');
} catch (e) {
  console.error('[wa-daemon] Falta @whiskeysockets/baileys. Instálalo con: npm install @whiskeysockets/baileys qrcode');
  process.exit(1);
}
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys;
let QRCode;
try { QRCode = requireFromApp('qrcode'); } catch { /* la consola imprime el QR crudo si falta */ }
let pino;
try { pino = require('pino'); } catch { /* baileys usa su logger por defecto */ }

const logger = pino ? pino({ level: 'silent' }) : undefined;
let sock = null;
let lastState = 'DISCONNECTED';
let backoffIdx = 0;
const BACKOFFS = [5000, 10000, 20000, 40000, 60000];

function report(state, extra = {}) {
  lastState = state;
  const raw = JSON.stringify({ daemonName: NAME, state, ...extra });
  const headers = { 'Content-Type': 'application/json' };
  if (SECRET) headers['x-harness-signature'] = 'sha256=' + createHmac('sha256', SECRET).update(raw, 'utf8').digest('hex');
  fetch(`${HARNESS_URL}/api/whatsapp/session`, { method: 'POST', headers, body: raw })
    .then((r) => r.json().catch(() => ({})))
    .then((d) => console.log(`[wa-daemon] estado reportado: ${state}${d.ok ? '' : ` (RECHAZO del panel: ${d.error ?? 'respuesta ' + JSON.stringify(d).slice(0, 120)})`}`))
    .catch((e) => console.error(`[wa-daemon] no pude reportar a ${HARNESS_URL}: ${e.message} (¿está el panel arriba?)`));
}

function clearAuthDir() {
  try { require('node:fs').rmSync(AUTH_DIR, { recursive: true, force: true }); } catch { /* nada que borrar */ }
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
  sock = makeWASocket({
    auth: state,
    logger,
    version,
    printQRInTerminal: false,
    browser: ['COMUNITI-MANAGER (agente independiente)', 'Chrome', '1.0.0'],
    markOnlineOnConnect: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr) {
      console.log('[wa-daemon] QR nuevo: escanéalo en el panel (Canales) o con: WhatsApp → Dispositivos vinculados');
      if (QRCode) {
        try {
          const qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 256 });
          report('QR_WAITING', { qrDataUrl });
        } catch (e) {
          console.error('[wa-daemon] no pude generar el QR como imagen:', e.message);
          report('QR_WAITING');
        }
      } else {
        report('QR_WAITING');
        console.log(qr);
      }
    }
    if (connection === 'connecting') report('CONNECTING');
    if (connection === 'open') {
      backoffIdx = 0;
      const phone = String(sock?.user?.id ?? '').split(':')[0] ?? '';
      const user = String(sock?.user?.name ?? sock?.user?.verifiedName ?? '');
      console.log(`[wa-daemon] CONECTADO: ${user || phone}`);
      report('CONNECTED', { user, phone });
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.log('[wa-daemon] sesión cerrada desde el móvil: borro credenciales locales (habrá QR nuevo al reiniciar).');
        clearAuthDir();
        report('DISCONNECTED');
        return; // sin reconexión automática: el operador vuelve a escanear cuando quiera
      }
      const delay = BACKOFFS[Math.min(backoffIdx, BACKOFFS.length - 1)];
      backoffIdx += 1;
      console.log(`[wa-daemon] conexión caída (código ${code ?? '?'}). Reconexión en ${delay / 1000}s.`);
      report('DISCONNECTED');
      setTimeout(() => start().catch((e) => console.error('[wa-daemon] reconexión falló:', e.message)), delay);
    }
  });
}

// HTTP local mínimo: estado, envío en cola y logout manual (solo loopback).
function tokenOk(provided) {
  if (!DAEMON_TOKEN) return true; // sin token definido, solo loopback protege
  const a = Buffer.from(String(provided || ''));
  const b = Buffer.from(DAEMON_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ name: NAME, state: lastState, user: sock?.user?.name ?? '', phone: String(sock?.user?.id ?? '').split(':')[0] ?? '', queue: sendQueue.length, dailyCount, dailyCap: DAILY_CAP, paused: panelPaused }));
    return;
  }
  if (req.url === '/send' && req.method === 'POST') {
    const body = await readJsonBody(req);
    if (!tokenOk(req.headers['x-daemon-token'])) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'token del conector inválido (x-daemon-token)' }));
      return;
    }
    const to = typeof body.to === 'string' ? body.to.trim() : '';
    const text = typeof body.text === 'string' ? body.text.slice(0, 4096) : '';
    const mediaUrl = typeof body.mediaUrl === 'string' && body.mediaUrl.trim() ? body.mediaUrl.trim() : '';
    if (!to || (!text && !mediaUrl)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'to y (text | mediaUrl) son obligatorios' }));
      return;
    }
    if (dailyCapReached()) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: `techo diario WHATSAPP (${DAILY_CAP} envíos) alcanzado — no se encola más hoy` }));
      return;
    }
    const entry = { jobId: typeof body.jobId === 'string' ? body.jobId.slice(0, 160) : `wa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, to, text, mediaUrl, enqueuedAt: Date.now() };
    sendQueue.push(entry);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, queued: true, position: sendQueue.length, jobId: entry.jobId }));
    return;
  }
  if (req.url === '/logout' && req.method === 'POST') {
    (async () => {
      try { await sock?.logout(); } catch { /* ya caído */ }
      clearAuthDir();
      report('DISCONNECTED');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, note: 'sesión desvinculada; reinicia el conector para un QR nuevo' }));
      process.exit(0);
    })();
    return;
  }
  res.writeHead(404); res.end();
});

// ─── Despachador de la cola: ritmo humano + pausa global + entrega firmada ──
setInterval(() => {
  (async () => {
    if (!sendQueue.length || lastState !== 'CONNECTED' || !sock) return;
    await refreshPanelPaused();
    if (panelPaused) return; // pausa global: la cola espera
    if (dailyCapReached()) return; // techo diario propio
    const gap = Math.floor(MIN_GAP_MS * (1 + Math.random() * 0.5)); // jitter humano ±50%
    if (Date.now() - lastSendAt < gap) return;
    const entry = sendQueue.shift();
    lastSendAt = Date.now();
    try {
      const payload = entry.mediaUrl
        ? { image: { url: entry.mediaUrl }, caption: entry.text || undefined }
        : { text: entry.text };
      const out = await sock.sendMessage(entry.to, payload);
      dailyCount += 1;
      const waMessageId = out?.key?.id ?? '';
      if (!waMessageId) {
        await reportDelivery(entry, 'FAILED', { failReason: 'WhatsApp respondió sin message_id: sin evidencia no hay éxito' });
        return;
      }
      await reportDelivery(entry, 'DELIVERED', { waMessageId });
    } catch (e) {
      await reportDelivery(entry, 'FAILED', { failReason: String(e?.message ?? e).slice(0, 300) });
    }
  })().catch((e) => console.error('[wa-daemon] error en el despachador:', e?.message ?? e));
}, 1000);

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[wa-daemon] ${NAME} arriba: estado en http://127.0.0.1:${PORT}/status · reportando a ${HARNESS_URL}`);
  start().catch((e) => {
    console.error('[wa-daemon] arranque falló:', e.message);
    report('DISCONNECTED');
    process.exit(1);
  });
});
