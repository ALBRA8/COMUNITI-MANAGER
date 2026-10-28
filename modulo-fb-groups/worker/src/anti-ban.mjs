// Motor anti-ban del worker (FICHA §6): ritmo humano, corte nocturno, pausa defensiva.
// El techo diario con warmup lo aplica el chaleco al reclamar jobs; el worker añade
// las capas locales: separación entre posts, ventana nocturna y pausas por detección.

const NIGHT_START = Number(process.env.FB_NIGHT_START ?? 22);
const NIGHT_END = Number(process.env.FB_NIGHT_END ?? 7);
const MIN_GAP_MIN = Number(process.env.FB_MIN_GAP_MIN ?? 3);
const MAX_GAP_MIN = Number(process.env.FB_MAX_GAP_MIN ?? 10);
// P6 auto-join: las uniones llevan ritmo propio, más lento que las publicaciones.
const JOIN_GAP_MIN_MIN = Number(process.env.FB_JOIN_GAP_MIN ?? 20);
const JOIN_GAP_MAX_MIN = Number(process.env.FB_JOIN_GAP_MAX ?? 45);

export function nightBlocked(now = new Date()) {
  const h = now.getHours();
  if (NIGHT_START <= NIGHT_END) return h >= NIGHT_START || h < NIGHT_END;
  return h >= NIGHT_START || h < NIGHT_END;
}

export function nextGapMs(now = new Date()) {
  const min = MIN_GAP_MIN * 60_000;
  const max = MAX_GAP_MIN * 60_000;
  return Math.floor(min + Math.random() * (max - min));
}

/** Hueco aleatorio entre uniones (20-45 min por defecto): unirse también es una acción vigilada. */
export function nextJoinGapMs(now = new Date()) {
  const min = JOIN_GAP_MIN_MIN * 60_000;
  const max = JOIN_GAP_MAX_MIN * 60_000;
  return Math.floor(min + Math.random() * (max - min));
}

export function nextNightResume(now = new Date()) {
  const d = new Date(now);
  d.setHours(NIGHT_END, Math.floor(5 + Math.random() * 50), 0, 0); // se reanuda con minutos aleatorios
  if (d <= now) d.setDate(d.getDate() + 1);
  return d;
}

/** Marcadores de advertencia/desafío de Facebook (inspección de texto visible). */
export const DETECTION_MARKERS = [
  'checkpoint',
  'your account has been locked',
  'your account has been restricted',
  "you can't post right now",
  'action blocked',
  'we suspended your account',
  'confirm your identity',
  'tu cuenta ha sido bloqueada',
  'tu cuenta ha sido restringida',
  'no puedes publicar en este momento',
  'acción bloqueada',
  'confirma tu identidad',
  "you can't join groups right now",
  'no puedes unirte a grupos en este momento',
  'unirse a grupos no está disponible',
];

export function scanForMarkers(text) {
  const t = String(text ?? '').toLowerCase();
  return DETECTION_MARKERS.find((m) => t.includes(m)) ?? null;
}

/** Estado local del worker (en memoria; el estado persistente vive en el chaleco). */
export function createGate() {
  return {
    lastPostAt: null,
    lastJoinAt: null,
    pausedUntil: null,
    pausedReason: '',
    sessionStatus: 'AWAITING_SESSION',
  };
}

/** Decide si el worker puede publicar AHORA. Devuelve { ok, reason } */
export function gateAllows(gate, now = new Date()) {
  if (gate.pausedUntil && gate.pausedUntil > now) {
    return { ok: false, reason: `Pausa defensiva activa hasta ${gate.pausedUntil.toISOString()} (${gate.pausedReason})` };
  }
  if (gate.sessionStatus === 'AWAITING_SESSION') {
    return { ok: false, reason: 'Sin sesión de Facebook iniciada en el perfil del worker' };
  }
  if (nightBlocked(now)) {
    return { ok: false, reason: `Corte nocturno (${NIGHT_START}:00–${NIGHT_END}:00 hora local)` };
  }
  if (gate.lastPostAt) {
    const elapsed = now - gate.lastPostAt;
    if (elapsed < MIN_GAP_MIN * 60_000) {
      return { ok: false, reason: `Ritmo humano: solo han pasado ${Math.round(elapsed / 60_000)} min desde el último post (mínimo ${MIN_GAP_MIN})` };
    }
  }
  return { ok: true, reason: '' };
}

/** Decide si el worker puede UNIRSE a un grupo ahora (P6): puerta propia, más lenta. */
export function joinGateAllows(gate, now = new Date()) {
  if (gate.pausedUntil && gate.pausedUntil > now) {
    return { ok: false, reason: `Pausa defensiva activa hasta ${gate.pausedUntil.toISOString()} (${gate.pausedReason})` };
  }
  if (gate.sessionStatus === 'AWAITING_SESSION') {
    return { ok: false, reason: 'Sin sesión de Facebook iniciada en el perfil del worker' };
  }
  if (nightBlocked(now)) {
    return { ok: false, reason: `Corte nocturno (${NIGHT_START}:00–${NIGHT_END}:00 hora local)` };
  }
  if (gate.lastJoinAt) {
    const elapsed = now - gate.lastJoinAt;
    if (elapsed < JOIN_GAP_MIN_MIN * 60_000) {
      return { ok: false, reason: `Ritmo de uniones: solo han pasado ${Math.round(elapsed / 60_000)} min desde la última (mínimo ${JOIN_GAP_MIN_MIN})` };
    }
  }
  return { ok: true, reason: '' };
}
