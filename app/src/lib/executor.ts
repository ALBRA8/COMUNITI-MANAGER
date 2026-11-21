// Capa de ejecución: traduce contratos internos a operaciones reales.
// Reglas: default-deny por agente, registro de cada llamada, idempotencia,
// CAPACITY_UNAVAILABLE si nadie soporta el contrato, jamás simular éxito.

import { db } from '@/lib/db';
import { agentCanUse } from '@/lib/agents';
import { toolsForContract, computeStatus, toolByKey, TOOLS } from '@/lib/registry';
import { authorize } from '@/lib/meta-policy';
import { chatPacingWaitMs, groupWindowHasRoom, groupPerMinuteCap, recordSend } from '@/lib/telegram-rate';
import type { AgentKey, Contract, ContractResult, RiskLevel } from '@/lib/contracts';

export interface ExecuteContext {
  agent: AgentKey;
  brandId: string;
  taskId?: string;
  idempotencyKey?: string;
}

// ─── Firewall + auditoría ─────────────────────────────────────────

async function firewallCheck(ctx: ExecuteContext, contract: Contract): Promise<void> {
  if (!agentCanUse(ctx.agent, contract)) {
    await db.auditEntry.create({
      data: {
        actor: `agent:${ctx.agent}`,
        action: contract,
        targetType: 'TOOL_CALL',
        allowed: false,
        reason: `El agente ${ctx.agent} no tiene autorizado el contrato ${contract} (firewall de agentes)`,
      },
    });
    throw new Error(`FIREWALL: ${ctx.agent} no puede ejecutar ${contract}`);
  }
  const paused = await db.setting.findUnique({ where: { key: 'global_pause' } });
  if (paused?.value === 'true') {
    throw new Error('PAUSA_GLOBAL: acciones externas suspendidas');
  }
}

async function audit(ctx: ExecuteContext, contract: Contract, outcome: string, reason = '') {
  await db.auditEntry.create({
    data: {
      actor: `agent:${ctx.agent}`,
      action: contract,
      targetType: 'TOOL_CALL',
      allowed: outcome === 'OK',
      reason,
      dataJson: JSON.stringify({ brandId: ctx.brandId, taskId: ctx.taskId }),
    },
  });
}

async function logToolCall(toolKey: string, contract: Contract, req: unknown, res: ContractResult, durationMs: number) {
  await db.toolCall.create({
    data: {
      toolKey,
      contract,
      reqJson: JSON.stringify(req ?? {}),
      resJson: JSON.stringify(res ?? {}),
      outcome: res.outcome,
      durationMs,
    },
  });
  await db.toolRecord.updateMany({
    where: { key: toolKey },
    data: { lastResult: res.outcome === 'OK' ? 'OK' : 'ERROR' },
  });
}

// ─── Ejecución principal ──────────────────────────────────────────

export async function executeContract<T = unknown>(
  contract: Contract,
  payload: Record<string, unknown>,
  ctx: ExecuteContext
): Promise<ContractResult<T>> {
  const t0 = Date.now();
  try {
    await firewallCheck(ctx, contract);
  } catch (e) {
    return { outcome: 'ERROR', reason: (e as Error).message } as ContractResult<T>;
  }

  const candidates = await toolsForContract(contract);
  if (candidates.length === 0) {
    const res = {
      outcome: 'CAPACITY_UNAVAILABLE',
      reason: `Ninguna herramienta conectada soporta ${contract}. Revisa Herramientas e integraciones.`,
    } as ContractResult<T>;
    await logToolCall('none', contract, payload, res, Date.now() - t0);
    await audit(ctx, contract, 'CAPACITY_UNAVAILABLE', res.reason);
    return res;
  }

  let last: ContractResult<T> | null = null;
  for (const tool of candidates) {
    const res = await dispatchTool<T>(tool.key, contract, payload, ctx);
    await logToolCall(tool.key, contract, payload, res, Date.now() - t0);
    if (res.outcome === 'OK') {
      await audit(ctx, contract, 'OK');
      return res;
    }
    last = res;
  }
  await audit(ctx, contract, last?.outcome ?? 'ERROR', last?.reason);
  return last!;
}

/** Despacha a la implementación real del adaptador de cada herramienta. */
async function dispatchTool<T>(
  toolKey: string,
  contract: Contract,
  payload: Record<string, unknown>,
  ctx: ExecuteContext
): Promise<ContractResult<T>> {
  const tool = toolByKey(toolKey)!;

  switch (toolKey) {
    // ── Motor interno del arnés (siempre disponible) ──
    case 'harness.internal':
      return internalAdapter<T>(contract, payload, ctx);

    // ── Proveedores de publicación (REST real, requiere credenciales) ──
    case 'postgale.publish':
      return restAdapter<T>(tool.envKeys, 'POSTGALE', contract, payload, ctx);
    case 'postiz.publish':
      return restAdapter<T>(tool.envKeys, 'POSTIZ', contract, payload, ctx);
    case 'postlake.publish':
      return restAdapter<T>(tool.envKeys, 'POSTLAKE', contract, payload, ctx);

    // ── Investigación ──
    case 'scrapecreators.research':
      return restAdapter<T>(tool.envKeys, 'SCRAPECREATORS', contract, payload, ctx);

    // ── Canales propios del agente ──
    case 'telegram.bot':
      return telegramAdapter<T>(contract, payload, ctx);
    case 'whatsapp.session':
      return whatsappAdapter<T>(contract, payload, ctx);

    // ── Ecosistema ALBRA (REST real de cada agente) ──
    case 'chismoso.listening':
      return restAdapter<T>(tool.envKeys, 'CHISMOSO', contract, payload, ctx);
    case 'crm.conversation':
      return restAdapter<T>(tool.envKeys, 'CRM', contract, payload, ctx);
    case 'krea.creativity':
      return restAdapter<T>(tool.envKeys, 'KREA', contract, payload, ctx);
    case 'ytauto.video':
      return restAdapter<T>(tool.envKeys, 'YTAUTO', contract, payload, ctx);
    case 'nexscope.research':
      return restAdapter<T>(tool.envKeys, 'NEXSCOPE', contract, payload, ctx);
    case 'albra.seed':
      return seedAdapter<T>(contract, payload);

    default:
      return { outcome: 'CAPACITY_UNAVAILABLE', reason: `Adaptador no implementado para ${toolKey}` } as ContractResult<T>;
  }
}

// ─── Adaptador interno (motor del arnés) ──────────────────────────

async function internalAdapter<T>(
  contract: Contract,
  payload: Record<string, unknown>,
  _ctx: ExecuteContext
): Promise<ContractResult<T>> {
  switch (contract) {
    case 'get_capabilities':
      return {
        outcome: 'OK',
        data: {
          tools: TOOLS.map((t) => ({ key: t.key, contracts: t.contracts, status: computeStatus(t) })),
        },
      } as ContractResult<T>;
    case 'get_connection_status': {
      const records = await db.toolRecord.findMany();
      return { outcome: 'OK', data: records } as unknown as ContractResult<T>;
    }
    default:
      return {
        outcome: 'CAPACITY_UNAVAILABLE',
        reason: `El motor interno no implementa ${contract} (usado por otra herramienta o pendiente de conector)`,
      } as ContractResult<T>;
  }
}

// ─── Adaptador REST genérico para proveedores externos ────────────

const BASE_URLS: Record<string, string | undefined> = {
  POSTGALE: process.env.POSTGALE_URL,
  POSTIZ: process.env.POSTIZ_URL,
  POSTLAKE: process.env.POSTLAKE_URL,
  SCRAPECREATORS: 'https://api.scrapecreators.com',
  CHISMOSO: process.env.CHISMOSO_URL,
  CRM: process.env.CRM_ALBRA_URL,
  KREA: process.env.KREA_URL,
  YTAUTO: process.env.YTAUTO_URL,
  NEXSCOPE: process.env.NEXSCOPE_URL,
};

const API_KEYS: Record<string, string | undefined> = {
  POSTGALE: process.env.POSTGALE_API_KEY,
  POSTIZ: process.env.POSTIZ_API_KEY,
  POSTLAKE: process.env.POSTLAKE_API_KEY,
  SCRAPECREATORS: process.env.SCRAPECREATORS_API_KEY,
  CRM: process.env.CRM_ALBRA_API_KEY,
  KREA: process.env.KREA_API_KEY,
};

// Mapa contrato → método/ruta por proveedor (solo rutas documentadas)
const ROUTES: Record<string, Partial<Record<Contract, { method: string; path: string }>>> = {
  POSTGALE: {
    publish_post: { method: 'POST', path: '/api/v1/posts' },
    schedule_post: { method: 'POST', path: '/api/v1/posts' },
    list_accounts: { method: 'GET', path: '/api/v1/accounts' },
    fetch_metrics: { method: 'GET', path: '/api/v1/analytics' },
  },
  POSTIZ: {
    publish_post: { method: 'POST', path: '/api/v1/posts' },
    schedule_post: { method: 'POST', path: '/api/v1/posts' },
  },
  POSTLAKE: {
    publish_post: { method: 'POST', path: '/v1/posts' },
    schedule_post: { method: 'POST', path: '/v1/posts' },
  },
  SCRAPECREATORS: {
    research_topic: { method: 'GET', path: '/v1/instagram/profile' },
    analyze_competitor: { method: 'GET', path: '/v1/instagram/profile' },
  },
};

async function restAdapter<T>(
  _envKeys: string[],
  provider: string,
  contract: Contract,
  payload: Record<string, unknown>,
  ctx: ExecuteContext
): Promise<ContractResult<T>> {
  const baseUrl = BASE_URLS[provider];
  const apiKey = API_KEYS[provider];
  if (!baseUrl || !apiKey) {
    return {
      outcome: 'CAPACITY_UNAVAILABLE',
      reason: `${provider}: pendiente de credenciales (URL/API key no configuradas)`,
    } as ContractResult<T>;
  }
  const route = ROUTES[provider]?.[contract];
  if (!route) {
    return {
      outcome: 'CAPACITY_UNAVAILABLE',
      reason: `${provider} no documenta una ruta verificada para ${contract}`,
    } as ContractResult<T>;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const url = `${baseUrl}${route.path}${route.method === 'GET' && Object.keys(payload).length ? '?' + new URLSearchParams(cleanParams(payload)).toString() : ''}`;
    const res = await fetch(url, {
      method: route.method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(provider === 'POSTGALE' && route.method === 'POST'
          ? { 'x-request-id': ctx.idempotencyKey ?? crypto.randomUUID() }
          : {}),
      },
      body: route.method === 'POST' ? JSON.stringify(payload) : undefined,
      signal: controller.signal,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        outcome: 'ERROR',
        reason: `${provider} respondió ${res.status}: ${JSON.stringify(body).slice(0, 300)}`,
      } as ContractResult<T>;
    }
    return { outcome: 'OK', data: body as T, evidence: { source: provider.toLowerCase(), payload: body } } as ContractResult<T>;
  } catch (e) {
    return { outcome: 'ERROR', reason: `${provider}: ${(e as Error).message}` } as ContractResult<T>;
  } finally {
    clearTimeout(timeout);
  }
}

function cleanParams(payload: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (typeof v === 'string' || typeof v === 'number') out[k] = String(v);
  }
  return out;
}

// ─── Adaptador de la semilla ALBRA ────────────────────────────────

async function seedAdapter<T>(contract: Contract, payload: Record<string, unknown>): Promise<ContractResult<T>> {
  const url = process.env.ALBRA_SEED_URL;
  const token = process.env.ALBRA_SEED_TOKEN;
  if (!url || !token) {
    return {
      outcome: 'CAPACITY_UNAVAILABLE',
      reason: 'Semilla AGENTE-GENERAL no desplegada: configura ALBRA_SEED_URL y ALBRA_SEED_TOKEN. El agente opera con su motor propio mientras tanto.',
    } as ContractResult<T>;
  }
  try {
    const res = await fetch(`${url}/api/v1/health`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => ({}));
    return { outcome: 'OK', data: data as T, evidence: { source: 'albra-seed', payload: data } } as ContractResult<T>;
  } catch (e) {
    return { outcome: 'ERROR', reason: `Semilla ALBRA: ${(e as Error).message}` } as ContractResult<T>;
  }
}

// ─── Telegram: Bot API oficial (sendMessage/sendPhoto) ────────────
// Reglas: HITL heredado del flujo PUBLISH (aprobación humana verificada),
// techos TELEGRAM_POST fijos en código, idempotencia por clave de contrato y
// verificación del resultado (sin message_id no hay éxito; 429 → backoff
// honesto con retry_after).

type TelegramApiResult = {
  ok?: boolean;
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number };
  result?: { message_id?: number; chat?: { id?: number; username?: string }; date?: number };
};

function telegramApiBase(): string {
  // Override SOLO para pruebas (servidor mock de Bot API); en producción no se
  // define y queda la API real.
  return (process.env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/$/, '');
}

// Idempotencia en memoria del proceso: clave de contrato → resultado OK previo
// (evita reenvíos ante reintentos del mismo draft:network:versión).
const tgSentByKey = new Map<string, { data: unknown; at: number }>();

async function telegramAdapter<T>(
  contract: Contract,
  payload: Record<string, unknown>,
  ctx: ExecuteContext
): Promise<ContractResult<T>> {
  if (contract !== 'publish_post') {
    return { outcome: 'CAPACITY_UNAVAILABLE', reason: `telegram.bot no implementa ${contract} (soporta publish_post y get_connection_status)` } as ContractResult<T>;
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return { outcome: 'CAPACITY_UNAVAILABLE', reason: 'Telegram: pendiente de credenciales (falta TELEGRAM_BOT_TOKEN)' } as ContractResult<T>;
  }
  const network = String(payload.network ?? '');
  if (network !== 'telegram') {
    return { outcome: 'CAPACITY_UNAVAILABLE', reason: `telegram.bot no publica en ${network}` } as ContractResult<T>;
  }

  // Motor de cumplimiento: la operación TELEGRAM_POST pasa por el veredicto
  // (la aprobación humana ya fue verificada por el flujo PUBLISH antes de aquí).
  const policy = await authorize({
    operation: 'TELEGRAM_POST',
    approvedByHuman: true,
    actor: `agent:${ctx.agent}`,
    note: `publicación aprobada ${ctx.idempotencyKey ?? ''}`,
  });
  if (['BLOQUEADO', 'POLITICA_DESACTUALIZADA', 'REQUIERE_APROBACION'].includes(policy.verdict)) {
    return {
      outcome: 'CAPACITY_UNAVAILABLE',
      reason: `Motor de cumplimiento: ${policy.verdict} — ${policy.reasons.join(' | ').slice(0, 300)}`,
    } as ContractResult<T>;
  }

  // Cuenta de la marca en Telegram (canal/grupo): sin objetivo no hay envío
  const account = await db.socialAccount.findFirst({ where: { brandId: ctx.brandId, network: 'telegram' } });
  if (!account?.handle?.trim()) {
    return { outcome: 'CAPACITY_UNAVAILABLE', reason: 'Telegram: la marca no tiene cuenta/canal registrado (agrégalo en Marcas y cuentas)' } as ContractResult<T>;
  }
  const chatId = account.handle.trim();
  const text = String(payload.text ?? '').trim();
  if (!text) {
    return { outcome: 'ERROR', reason: 'Telegram: el contenido aprobado viene vacío' } as ContractResult<T>;
  }

  // Idempotencia: la misma clave dentro de 10 min devuelve la evidencia previa
  const key = ctx.idempotencyKey ?? `${ctx.brandId}:${chatId}`;
  const sent = tgSentByKey.get(key);
  if (sent && Date.now() - sent.at < 10 * 60_000) {
    return sent.data as ContractResult<T>;
  }

  // Techos TELEGRAM_POST (1 msg/seg por chat con espera honesta; ventana por
  // grupo con techo fijo en código — el env solo puede bajarlo)
  const waitMs = chatPacingWaitMs(chatId);
  if (waitMs > 0) await new Promise((r) => setTimeout(r, Math.min(waitMs, 2500)));
  if (!groupWindowHasRoom(chatId)) {
    return {
      outcome: 'ERROR',
      reason: `TELEGRAM_POST: techo de ${groupPerMinuteCap()} msg/min por chat/grupo alcanzado — parada honesta (se reintenta en el siguiente ciclo)`,
    } as ContractResult<T>;
  }

  const callApi = async (method: string, body: Record<string, unknown>): Promise<{ status: number; data: TelegramApiResult }> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(`${telegramApiBase()}/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => ({}))) as TelegramApiResult;
      return { status: res.status, data };
    } finally {
      clearTimeout(timeout);
    }
  };

  const media = Array.isArray(payload.media) ? payload.media : [];
  const firstMedia = media.length
    ? String((media[0] as Record<string, unknown>)?.url ?? media[0] ?? '').trim()
    : '';
  // El caption de media admite 1024 chars: si el texto aprobado no cabe, el
  // texto va como mensaje y la foto aparte (NUNCA se trunca contenido aprobado).
  const captionFits = text.length <= 1024;

  let last: { status: number; data: TelegramApiResult };
  let partialNote = '';
  recordSend(chatId);
  if (firstMedia && captionFits) {
    last = await callApi('sendPhoto', { chat_id: chatId, photo: firstMedia, caption: text });
  } else {
    last = await callApi('sendMessage', { chat_id: chatId, text });
    if (last.data?.ok && firstMedia) {
      const wait2 = chatPacingWaitMs(chatId);
      if (wait2 > 0) await new Promise((r) => setTimeout(r, Math.min(wait2, 2500)));
      recordSend(chatId);
      const photo = await callApi('sendPhoto', { chat_id: chatId, photo: firstMedia });
      if (!photo.data?.ok) {
        partialNote = ` (texto publicado; media falló: ${photo.data?.description ?? 'error'})`;
      } else {
        last = photo;
      }
    }
  }

  if (!last.data?.ok) {
    const errCode = last.data?.error_code ?? last.status;
    const retryAfter = last.data?.parameters?.retry_after;
    return {
      outcome: 'ERROR',
      reason: `Telegram Bot API ${errCode}: ${last.data?.description ?? 'error'}${retryAfter ? ` — 429 backoff honesto: retry_after ${retryAfter}s` : ''}`,
    } as ContractResult<T>;
  }

  const msg = last.data.result ?? {};
  const messageId = msg.message_id;
  if (!messageId) {
    return { outcome: 'ERROR', reason: 'Telegram respondió OK sin message_id: sin evidencia no hay éxito' } as ContractResult<T>;
  }
  const chatRef = msg.chat?.username ? `@${msg.chat.username}` : String(msg.chat?.id ?? chatId);
  const postUrl = msg.chat?.username ? `https://t.me/${msg.chat.username}/${messageId}` : null;
  const okRes = {
    outcome: 'OK',
    data: { id: postUrl ?? `${chatRef}:${messageId}`, network: 'telegram', messageId, chat: chatRef, postUrl },
    evidence: { source: 'telegram-bot-api', payload: { chat: chatRef, messageId, postUrl, date: msg.date ?? null, note: partialNote || undefined } },
  } as unknown as ContractResult<T>;
  tgSentByKey.set(key, { data: okRes, at: Date.now() });
  return okRes;
}

// ─── WhatsApp: conector propio del agente (cola del daemon) ───────
// El envío es ASÍNCRONO: el adaptador encola en el conector (HTTP local del
// daemon) y la publicación queda PUBLISHING hasta el reporte de entrega FIRMADO
// (DELIVERED con waMessageId / FAILED con motivo) que llega a
// /api/whatsapp/delivery. Sin reporte firmado no hay éxito. Techos
// WHATSAPP_SEND fijos en código + pausa global (firewall + daemon).

function waDaemonUrl(): string {
  return (process.env.WHATSAPP_DAEMON_URL || 'http://127.0.0.1:3010').replace(/\/$/, '');
}

function waDailyCap(): number {
  // Techo fijo 200/día; el operador solo puede BAJARLO (WHATSAPP_DAILY_CAP).
  const env = Number(process.env.WHATSAPP_DAILY_CAP ?? '');
  if (!Number.isFinite(env) || env <= 0) return 200;
  return Math.min(200, Math.floor(env));
}

async function whatsappAdapter<T>(
  contract: Contract,
  payload: Record<string, unknown>,
  ctx: ExecuteContext
): Promise<ContractResult<T>> {
  if (contract !== 'publish_post') {
    return { outcome: 'CAPACITY_UNAVAILABLE', reason: `whatsapp.session no implementa ${contract} (soporta publish_post y get_connection_status)` } as ContractResult<T>;
  }
  const network = String(payload.network ?? '');
  if (network !== 'whatsapp') {
    return { outcome: 'CAPACITY_UNAVAILABLE', reason: `whatsapp.session no publica en ${network}` } as ContractResult<T>;
  }

  // Motor de cumplimiento (WhatsApp es producto Meta): veredicto obligatorio.
  const policy = await authorize({
    operation: 'WHATSAPP_SEND',
    approvedByHuman: true,
    actor: `agent:${ctx.agent}`,
    note: `publicación aprobada ${ctx.idempotencyKey ?? ''}`,
  });
  if (['BLOQUEADO', 'POLITICA_DESACTUALIZADA', 'REQUIERE_APROBACION'].includes(policy.verdict)) {
    return {
      outcome: 'CAPACITY_UNAVAILABLE',
      reason: `Motor de cumplimiento: ${policy.verdict} — ${policy.reasons.join(' | ').slice(0, 300)}`,
    } as ContractResult<T>;
  }

  const account = await db.socialAccount.findFirst({ where: { brandId: ctx.brandId, network: 'whatsapp' } });
  if (!account?.handle?.trim()) {
    return { outcome: 'CAPACITY_UNAVAILABLE', reason: 'WhatsApp: la marca no tiene número/chat registrado (agrégalo en Marcas y cuentas)' } as ContractResult<T>;
  }
  const handle = account.handle.trim();
  const to = handle.includes('@') ? handle : `${handle.replace(/[^\d]/g, '')}@c.us`;
  const text = String(payload.text ?? '').trim();
  if (!text) {
    return { outcome: 'ERROR', reason: 'WhatsApp: el contenido aprobado viene vacío' } as ContractResult<T>;
  }

  // Techo WHATSAPP_SEND: envíos del día publicados + en cola para la red.
  // Se excluye la fila EN COLA de ESTE envío (el orquestador la crea con
  // status PUBLISHING antes de despachar): el techo cuenta envíos previos.
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const todayCount = await db.publication.count({
    where: {
      network: 'whatsapp',
      status: { in: ['PUBLISHED', 'PUBLISHING'] },
      createdAt: { gte: startOfDay },
      ...(ctx.idempotencyKey ? { idempotencyKey: { not: ctx.idempotencyKey } } : {}),
    },
  });
  if (todayCount >= waDailyCap()) {
    return {
      outcome: 'CAPACITY_UNAVAILABLE',
      reason: `WHATSAPP_SEND: techo propio de ${waDailyCap()} envíos/día alcanzado — por protección del número no se encola más hoy`,
    } as ContractResult<T>;
  }

  // Conector vivo: no se encola a un daemon caído o sin sesión
  const session = await db.whatsappSession.findFirst({
    where: { state: 'CONNECTED', lastSeenAt: { gte: new Date(Date.now() - 120_000) } },
  });
  if (!session) {
    return {
      outcome: 'CAPACITY_UNAVAILABLE',
      reason: 'WhatsApp: sin conector vivo en CONNECTED (arranca scripts/whatsapp-daemon.cjs y vincula el QR en Canales)',
    } as ContractResult<T>;
  }

  const media = Array.isArray(payload.media) ? payload.media : [];
  const firstMedia = media.length
    ? String((media[0] as Record<string, unknown>)?.url ?? media[0] ?? '').trim()
    : '';
  const jobId = `wa-${ctx.idempotencyKey ?? crypto.randomUUID()}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${waDaemonUrl()}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.WHATSAPP_DAEMON_TOKEN ? { 'x-daemon-token': process.env.WHATSAPP_DAEMON_TOKEN } : {}),
      },
      body: JSON.stringify({ jobId, to, text, mediaUrl: firstMedia || undefined }),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; queued?: boolean; position?: number };
    if (!res.ok || !data?.ok) {
      return { outcome: 'ERROR', reason: `Conector WhatsApp respondió ${res.status}: ${JSON.stringify(data).slice(0, 200)}` } as ContractResult<T>;
    }
    return {
      outcome: 'OK',
      data: { id: jobId, network: 'whatsapp', queued: true, asyncDelivery: true },
      evidence: { source: 'whatsapp-daemon', payload: { jobId, to, position: data.position ?? null } },
    } as unknown as ContractResult<T>;
  } catch (e) {
    return { outcome: 'ERROR', reason: `Conector WhatsApp inalcanzable (${waDaemonUrl()}): ${(e as Error).message}` } as ContractResult<T>;
  } finally {
    clearTimeout(timeout);
  }
}
