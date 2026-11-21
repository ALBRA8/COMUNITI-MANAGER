// Limitador de ritmo Telegram (operación TELEGRAM_POST) — puro, sin BD, en la
// memoria del proceso del server. Techos OFICIALES verificados
// (https://core.telegram.org/bots/faq, tabla NETWORK_CAPS):
//   · 1 mensaje/segundo por chat
//   · 20 mensajes/minuto por grupo
//   · ~30 msg/seg en difusión (techo propio: 20 msg/seg, ⅔ del oficial)
// El override por env (TELEGRAM_GROUP_PER_MINUTE) SOLO puede BAJAR el techo de
// grupo (nunca subirlo): techos fijos en código, no modificables por agentes.
const GROUP_PER_MIN_DEFAULT = 20;
const CHAT_PACE_MS = 1000;
const WINDOW_MS = 60_000;

const lastSendByChat = new Map<string, number>();
const groupWindow = new Map<string, number[]>(); // chatId → timestamps dentro de la ventana

export function groupPerMinuteCap(): number {
  const env = Number(process.env.TELEGRAM_GROUP_PER_MINUTE ?? '');
  if (!Number.isFinite(env) || env <= 0) return GROUP_PER_MIN_DEFAULT;
  return Math.min(GROUP_PER_MIN_DEFAULT, Math.floor(env));
}

/** Espera remanente para respetar 1 msg/seg por chat (0 = puede enviar ya). */
export function chatPacingWaitMs(chatId: string, now = Date.now()): number {
  const last = lastSendByChat.get(chatId);
  if (!last) return 0;
  return Math.max(0, CHAT_PACE_MS - (now - last));
}

/** ¿El chat (grupo/canal) aún tiene cupo en su ventana rodante de 60 s? */
export function groupWindowHasRoom(chatId: string, now = Date.now()): boolean {
  const cap = groupPerMinuteCap();
  const stamps = (groupWindow.get(chatId) ?? []).filter((t) => now - t < WINDOW_MS);
  return stamps.length < cap;
}

/** Registra el envío — llamar JUSTO antes de disparar la petición real. */
export function recordSend(chatId: string, now = Date.now()): void {
  lastSendByChat.set(chatId, now);
  const stamps = (groupWindow.get(chatId) ?? []).filter((t) => now - t < WINDOW_MS);
  stamps.push(now);
  groupWindow.set(chatId, stamps);
}
