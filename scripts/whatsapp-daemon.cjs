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
 *  - La sesión queda guardada en prisma/db/whatsapp-session: no se re-escanea
 *    el QR al reiniciar. Bórrala para desvincular.
 *
 * Honestidad: protocolo NO oficial. WhatsApp puede restringir el número ante
 * reportes o volumen abusivo; el motor del panel aplica pausa global y techos.
 *
 * Uso (desde app/ o raíz del proyecto, donde esté node_modules):
 *   node scripts/whatsapp-daemon.cjs
 * Env opcionales:
 *   HARNESS_URL (default http://localhost:3000)
 *   HARNESS_WEBHOOK_SECRET (si el panel lo exige, obligatoria la firma)
 *   WHATSAPP_DAEMON_NAME (default wa-local)
 *   WHATSAPP_DAEMON_PORT (default 3010, http local de estado/logout)
 */
const path = require('path');
const http = require('http');
const { createHmac } = require('node:crypto');

const HARNESS_URL = (process.env.HARNESS_URL || 'http://localhost:3000').replace(/\/$/, '');
const SECRET = process.env.HARNESS_WEBHOOK_SECRET || '';
const NAME = process.env.WHATSAPP_DAEMON_NAME || 'wa-local';
const PORT = Number(process.env.WHATSAPP_DAEMON_PORT || 3010);
const AUTH_DIR = path.join(__dirname, '..', 'prisma', 'db', 'whatsapp-session');

let baileys;
try {
  baileys = require('@whiskeysockets/baileys');
} catch (e) {
  console.error('[wa-daemon] Falta @whiskeysockets/baileys. Instálalo con: bun add @whiskeysockets/baileys qrcode');
  process.exit(1);
}
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys;
let QRCode;
try { QRCode = require('qrcode'); } catch { /* la consola imprime el QR crudo si falta */ }
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

// HTTP local mínimo: estado y logout manual (solo loopback).
const server = http.createServer((req, res) => {
  if (req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ name: NAME, state: lastState, user: sock?.user?.name ?? '', phone: String(sock?.user?.id ?? '').split(':')[0] ?? '' }));
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

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[wa-daemon] ${NAME} arriba: estado en http://127.0.0.1:${PORT}/status · reportando a ${HARNESS_URL}`);
  start().catch((e) => {
    console.error('[wa-daemon] arranque falló:', e.message);
    report('DISCONNECTED');
    process.exit(1);
  });
});
