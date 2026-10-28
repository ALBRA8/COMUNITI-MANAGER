// FB-GROUPS Worker — el Chrome que publica (FICHA: ../FICHA.md §5)
// Portable: corre en PC local (headful) o VPS 24/7 (headless con perfil persistente).
// Habla SOLO HMAC con el chaleco: tira de jobs (claim) y empuja reportes (report).

import http from 'node:http';
import { sign } from './hmac.mjs';
import { createGate, gateAllows, nextGapMs, nextNightResume, joinGateAllows, nextJoinGapMs } from './anti-ban.mjs';
import * as engine from './engine-dom.mjs';

const PORT = Number(process.env.FB_WORKER_PORT ?? 8765);
const HARNESS_URL = (process.env.HARNESS_URL ?? '').replace(/\/$/, '');
const WORKER_ID = process.env.WORKER_ID ?? '';
const WORKER_SECRET = process.env.WORKER_SECRET ?? '';
const TICK_SECONDS = Number(process.env.FB_TICK_SECONDS ?? 60);

const gate = createGate();

function cfgMissing() {
  const missing = [];
  if (!HARNESS_URL) missing.push('HARNESS_URL');
  if (!WORKER_ID) missing.push('WORKER_ID');
  if (!WORKER_SECRET) missing.push('WORKER_SECRET');
  return missing;
}

async function harnessPost(path, payload) {
  const body = JSON.stringify(payload);
  const res = await fetch(`${HARNESS_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-fb-signature': sign(body, WORKER_SECRET) },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

async function ping(status) {
  if (cfgMissing().length) return;
  try {
    await harnessPost('/api/fb-workers', { action: 'ping', workerId: WORKER_ID, status });
  } catch (e) {
    console.error('[ping]', e.message);
  }
}

async function tick({ manual = false } = {}) {
  const missing = cfgMissing();
  if (missing.length) return { skipped: true, reason: `Config incompleta: ${missing.join(', ')} (define las vars en .env o el entorno)` };

  // 1) Puerta local anti-ban
  const verdict = gateAllows(gate);
  if (!verdict.ok) {
    return { skipped: true, reason: verdict.reason };
  }

  // 2) Reclamar un job al chaleco
  let claim;
  try {
    claim = await harnessPost('/api/fb-jobs/claim', { workerId: WORKER_ID, capacity: 1 });
  } catch (e) {
    return { skipped: true, reason: `Claim falló: ${e.message}` };
  }
  if (claim.note && /PAUSED_ANTI_BAN/.test(claim.note)) {
    gate.pausedUntil = claim.pausedUntil ? new Date(claim.pausedUntil) : new Date(Date.now() + 12 * 3600_000);
    gate.pausedReason = claim.note;
    await ping('PAUSED_ANTI_BAN');
    return { skipped: true, reason: claim.note };
  }
  if (!claim.jobs || claim.jobs.length === 0) {
    await ping(gate.sessionStatus === 'OK' ? 'IDLE' : gate.sessionStatus);
    return { skipped: true, reason: claim.note ?? 'Sin jobs vencidos (techo, ventana o cola vacía)' };
  }

  const job = claim.jobs[0];

  // 3) Verificar sesión antes del primer envío del ciclo
  if (gate.sessionStatus !== 'OK') {
    const s = await engine.checkSession();
    if (s.startsWith('CHALLENGE')) {
      gate.pausedUntil = new Date(Date.now() + 12 * 3600_000);
      gate.pausedReason = s;
      await harnessPost('/api/fb-jobs/report', {
        workerId: WORKER_ID,
        results: [{ jobId: job.id, status: 'FAILED', failReason: s }],
        alerts: [{ kind: 'CHALLENGE', message: `Detección al verificar sesión: ${s}`, pauseHours: 12 }],
        sessionStatus: 'CHALLENGE_DETECTED',
      });
      return { posted: false, reason: s };
    }
    gate.sessionStatus = s === 'OK' ? 'OK' : 'AWAITING_SESSION';
    if (gate.sessionStatus !== 'OK') {
      await harnessPost('/api/fb-jobs/report', {
        workerId: WORKER_ID,
        results: [{ jobId: job.id, status: 'FAILED', failReason: 'AWAITING_SESSION: abre el Chrome del worker e inicia sesión; el job vuelve a la cola' }],
        sessionStatus: 'AWAITING_SESSION',
      });
      return { skipped: true, reason: 'AWAITING_SESSION: inicia sesión en el Chrome del worker' };
    }
  }

  // 4) Publicar con el motor DOM
  const nMedia = Array.isArray(job.mediaUrls) ? job.mediaUrls.filter(Boolean).length : 0;
  console.log(`[job] ${job.campaignName} → "${job.targetName}" (variante ${job.variantSource})${nMedia ? ` · ${nMedia} adjunto(s)` : ''}`);
  let result;
  try {
    result = await engine.postJob(job);
  } catch (e) {
    result = { status: 'FAILED', failReason: `Error del motor: ${e.message}` };
  }

  // 5) Primer comentario (mejor esfuerzo)
  let commentDone = false;
  if (result.status === 'POSTED' && job.firstComment && result.postUrl) {
    commentDone = await engine.firstComment(job, result.postUrl).catch(() => false);
  }

  // 6) Reporte firmado al chaleco
  await harnessPost('/api/fb-jobs/report', {
    workerId: WORKER_ID,
    results: [{
      jobId: job.id,
      status: result.status,
      postUrl: result.postUrl ?? '',
      failReason: result.failReason ?? '',
    }],
    alerts: result.status === 'FAILED' && /DESAFIO|CHALLENGE/i.test(result.failReason ?? '')
      ? [{ kind: 'CHALLENGE', message: result.failReason, pauseHours: 12 }]
      : [],
    sessionStatus: 'IDLE',
  });

  if (result.status === 'POSTED') {
    gate.lastPostAt = new Date();
    console.log(`[ok] publicado en "${job.targetName}"${result.postUrl ? ` · ${result.postUrl}` : ''}${commentDone ? ' · primer comentario puesto' : ''}`);
    const gap = nextGapMs();
    console.log(`[ritmo] siguiente publicación en ${Math.round(gap / 60000)} min (jitter humano)`);
    return { posted: true, job: job.targetName, postUrl: result.postUrl, nextGapMin: Math.round(gap / 60000) };
  }
  console.warn(`[fallo] "${job.targetName}": ${result.failReason}`);
  return { posted: false, job: job.targetName, reason: result.failReason };
}

// ─── P6 auto-join: bucle propio, más lento y con topes del chaleco ──

async function joinTick() {
  const missing = cfgMissing();
  if (missing.length) return { skipped: true, reason: `Config incompleta: ${missing.join(', ')}` };

  // 1) Puerta local de uniones (pausa defensiva, sesión, noche, hueco 20-45 min)
  const verdict = joinGateAllows(gate);
  if (!verdict.ok) return { skipped: true, reason: verdict.reason };

  // 2) Reclamar una tarea de unión al chaleco (techo propio con warmup)
  let claim;
  try {
    claim = await harnessPost('/api/fb-joins/claim', { workerId: WORKER_ID });
  } catch (e) {
    return { skipped: true, reason: `Claim de unión falló: ${e.message}` };
  }
  if (claim.note && /PAUSED_ANTI_BAN/.test(claim.note)) {
    gate.pausedUntil = claim.pausedUntil ? new Date(claim.pausedUntil) : new Date(Date.now() + 12 * 3600_000);
    gate.pausedReason = claim.note;
    await ping('PAUSED_ANTI_BAN');
    return { skipped: true, reason: claim.note };
  }
  if (!claim.task) return { skipped: true, reason: claim.note ?? 'Sin tareas de unión pendientes' };

  // 3) Verificar sesión antes de actuar
  if (gate.sessionStatus !== 'OK') {
    const s = await engine.checkSession();
    if (s.startsWith('CHALLENGE')) {
      gate.pausedUntil = new Date(Date.now() + 12 * 3600_000);
      gate.pausedReason = s;
      await harnessPost('/api/fb-joins/report', {
        workerId: WORKER_ID,
        reports: [{ taskId: claim.task.id, status: 'FAILED', failReason: s }],
        alerts: [{ kind: 'CHALLENGE', message: `Detección al verificar sesión (join): ${s}`, pauseHours: 12 }],
        sessionStatus: 'CHALLENGE_DETECTED',
      });
      return { skipped: true, reason: s };
    }
    gate.sessionStatus = s === 'OK' ? 'OK' : 'AWAITING_SESSION';
    if (gate.sessionStatus !== 'OK') {
      return { skipped: true, reason: 'AWAITING_SESSION: la tarea de unión vuelve a la cola al vencer el lease' };
    }
  }

  // 4) Unirse con el motor DOM
  console.log(`[join] uniéndose a ${claim.task.url}${claim.task.keyword ? ` (keyword: ${claim.task.keyword})` : ''}`);
  let result;
  try {
    result = await engine.joinGroupByUrl(claim.task.url);
  } catch (e) {
    result = { status: 'FAILED', failReason: `Error del motor: ${e.message}` };
  }

  // 5) Reporte firmado al chaleco
  await harnessPost('/api/fb-joins/report', {
    workerId: WORKER_ID,
    reports: [{ taskId: claim.task.id, status: result.status, failReason: result.failReason ?? '' }],
    alerts: result.status === 'FAILED' && /DESAFIO|CHALLENGE/i.test(result.failReason ?? '')
      ? [{ kind: 'CHALLENGE', message: result.failReason, pauseHours: 12 }]
      : [],
    sessionStatus: 'IDLE',
  });

  if (result.status === 'JOINED' || result.status === 'REQUESTED') {
    gate.lastJoinAt = new Date();
    const gap = nextJoinGapMs();
    console.log(`[join-ok] ${claim.task.url}: ${result.status} · siguiente unión en ${Math.round(gap / 60000)} min`);
    return { joined: result.status, url: claim.task.url, nextGapMin: Math.round(gap / 60000) };
  }
  console.warn(`[join-fallo] ${claim.task.url}: ${result.failReason}`);
  return { joined: false, url: claim.task.url, reason: result.failReason };
}

// ─── API local del worker (para el operador y para el botón "Ejecutar ahora") ──

const server = http.createServer(async (req, res) => {
  const url = req.url ?? '/';
  if (url === '/health' || url === '/api/status') {
    const body = JSON.stringify({
      ok: true,
      status: gate.pausedUntil && gate.pausedUntil > new Date() ? 'PAUSED_ANTI_BAN' : gate.sessionStatus === 'OK' ? 'IDLE' : gate.sessionStatus,
      session: gate.sessionStatus,
      pausedUntil: gate.pausedUntil,
      pausedReason: gate.pausedReason,
      lastPostAt: gate.lastPostAt,
      lastJoinAt: gate.lastJoinAt,
      harness: HARNESS_URL || '(sin configurar)',
      nightResume: null,
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(body);
  }
  if (url === '/api/sync-groups' && req.method === 'POST') {
    try {
      const groups = await engine.syncGroups();
      gate.sessionStatus = 'OK';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ groups }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }
  if (url === '/api/check-session' && req.method === 'POST') {
    const s = await engine.checkSession();
    gate.sessionStatus = s === 'OK' ? 'OK' : s.startsWith('CHALLENGE') ? 'CHALLENGE_DETECTED' : 'AWAITING_SESSION';
    await ping(gate.sessionStatus === 'OK' ? 'IDLE' : gate.sessionStatus);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ session: s }));
  }
  if (url === '/api/tick' && req.method === 'POST') {
    const result = await tick({ manual: true });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(result));
  }
  if (url === '/api/join-tick' && req.method === 'POST') {
    const result = await joinTick();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(result));
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Ruta no encontrada' }));
});

server.listen(PORT, () => {
  console.log('FB-GROUPS Worker (módulo del chaleco COMUNITI-MANAGER)');
  console.log(`· API local:    http://localhost:${PORT}/health`);
  console.log(`· Chaleco:      ${HARNESS_URL || '(definir HARNESS_URL)'}`);
  console.log(`· Worker ID:    ${WORKER_ID || '(definir WORKER_ID)'}`);
  console.log(`· Chrome real:  perfil "${process.env.FB_PROFILE_DIR ?? './chrome-profile'}", ${process.env.FB_HEADFUL === '0' ? 'headless (VPS)' : 'headful (PC)'}`);
  const missing = cfgMissing();
  if (missing.length) {
    console.warn(`· ATENCIÓN: faltan variables ${missing.join(', ')}; el bucle de publicación queda inactivo hasta configurarlas.`);
  }
  if (!missing.length) {
    setInterval(() => tick().catch((e) => console.error('[tick]', e.message)), TICK_SECONDS * 1000);
    setInterval(() => joinTick().catch((e) => console.error('[join-tick]', e.message)), TICK_SECONDS * 1000);
    console.log(`· Bucle interno activo cada ${TICK_SECONDS}s: ping, claim, publicación y reporte.`);
    console.log(`· Auto-join activo (P6): tareas de unión con ritmo propio de ${process.env.FB_JOIN_GAP_MIN ?? 20}-${process.env.FB_JOIN_GAP_MAX ?? 45} min y techo del chaleco.`);
  }
});
