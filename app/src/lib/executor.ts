// Capa de ejecución: traduce contratos internos a operaciones reales.
// Reglas: default-deny por agente, registro de cada llamada, idempotencia,
// CAPACITY_UNAVAILABLE si nadie soporta el contrato, jamás simular éxito.

import { db } from '@/lib/db';
import { agentCanUse } from '@/lib/agents';
import { toolsForContract, computeStatus, toolByKey, TOOLS } from '@/lib/registry';
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
      reason: 'Semilla AGENTE-GENERAL no desplegada: configura ALBRA_SEED_URL y ALBRA_SEED_TOKEN. El arnés opera con su motor propio mientras tanto.',
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
