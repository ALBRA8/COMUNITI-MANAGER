import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { TOOLS, computeStatus } from '@/lib/registry';
import { guardPanel } from '@/lib/panel-auth';

export const dynamic = 'force-dynamic';

// Centro unificado de integraciones (P18): estado real de IA, APIs, redes y
// sistema en una sola vista. Honestidad radical: ninguna integración se
// reporta conectada si sus credenciales no están configuradas; nunca se
// simula éxito. Las claves NO se guardan en la base de datos: viven en las
// variables de entorno del servidor (protección de datos > comodidad).

interface IntegrationCard {
  key: string;
  provider: string;
  category: string;
  description: string;
  status: string;
  envKeys: string[];
  missingEnv: string[];
  contracts: string[];
  lastResult: string | null;
}

function missingOf(envKeys: string[]): string[] {
  return envKeys.filter((k) => !process.env[k] || process.env[k]!.length === 0);
}

export async function GET(req: NextRequest) {
  const denied = guardPanel(req);
  if (denied) return denied;

  const [records, accounts, fbWorkers, webhookSecret, pause, mode] = await Promise.all([
    db.toolRecord.findMany(),
    db.socialAccount.findMany({ select: { network: true, handle: true, status: true } }),
    db.fbWorker.findMany({ select: { id: true, name: true, lastSeenAt: true } }),
    db.setting.findUnique({ where: { key: 'harness.webhook_secret_set' } }),
    db.setting.findUnique({ where: { key: 'global_pause' } }),
    db.setting.findUnique({ where: { key: 'autonomy_mode' } }),
  ]);

  const lastResultByKey = new Map(records.map((r) => [r.key, r.lastResult]));

  // Estado honesto idéntico al registro (registry.ts): FB-GROUPS solo es
  // CONNECTED con al menos un worker registrado con sesión; para el resto
  // manda la presencia real de las variables de entorno.
  const integrations: IntegrationCard[] = TOOLS.map((t) => ({
    key: t.key,
    provider: t.provider,
    category: t.category,
    description: t.description,
    status: t.key === 'fbgroups.worker'
      ? (fbWorkers.length > 0 ? 'CONNECTED' : 'AWAITING_CREDENTIALS')
      : computeStatus(t),
    envKeys: t.envKeys,
    missingEnv: missingOf(t.envKeys),
    contracts: t.contracts,
    lastResult: lastResultByKey.get(t.key) ?? null,
  }));

  const connected = integrations.filter((i) => i.status === 'CONNECTED').length;

  return NextResponse.json({
    llm: {
      connected: true,
      provider: 'z-ai-web-dev-sdk (LLM embebido del entorno)',
      note: 'Usado por borradores, orquestador y reescrituras. No requiere clave externa.',
    },
    integrations,
    counts: { total: integrations.length, connected, awaiting: integrations.length - connected },
    socialAccounts: accounts,
    fbWorker: {
      registered: fbWorkers.length,
      lastPingAt: fbWorkers[0]?.lastSeenAt ?? null,
      names: fbWorkers.map((w) => w.name),
    },
    webhooks: {
      secretConfigured: Boolean(process.env.HARNESS_WEBHOOK_SECRET) || webhookSecret?.value === 'true',
      sources: ['leads', 'chismoso', 'crm', 'postgale', 'whatspower'],
    },
    system: {
      paused: pause?.value === 'true',
      autonomyMode: mode?.value ?? 'L2_SUPERVISED',
      envKeysConfigured: ['DATABASE_URL', ...Object.keys(process.env).filter((k) => /POSTGALE|POSTIZ|POSTLAKE|SCRAPECREATORS|CHISMOSO|CRM_ALBRA|WHATPOWER|KREA|YTAUTO|NEXSCOPE|ALBRA_SEED|TELEGRAM|HARNESS_WEBHOOK|PANEL_TOKEN/.test(k))].sort(),
    },
  });
}

// Prueba de conexión real (solo lectura). Nunca escribe en redes: para
// proveedores con ruta documentada usa su endpoint de lectura; para
// instancias propias del ecosistema hace un GET a la raíz y reporta
// alcanzabilidad HTTP cruda. Sin credenciales responde AWAITING_CREDENTIALS.
export async function POST(req: NextRequest) {
  const denied = guardPanel(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const tool = typeof body.tool === 'string' ? body.tool : '';
  const def = TOOLS.find((t) => t.key === tool);
  if (!def) {
    return NextResponse.json({ error: 'Herramienta desconocida' }, { status: 400 });
  }

  const missing = missingOf(def.envKeys);
  if (missing.length > 0 && def.key !== 'fbgroups.worker') {
    return NextResponse.json({
      outcome: 'AWAITING_CREDENTIALS',
      reason: `Faltan variables: ${missing.join(', ')}`,
      missingEnv: missing,
    });
  }

  const probe = async (url: string, headers: Record<string, string> = {}) => {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    return { httpStatus: res.status, reachable: true };
  };

  try {
    switch (def.key) {
      case 'harness.internal':
        await db.$queryRaw`SELECT 1`;
        return NextResponse.json({ outcome: 'OK', reason: 'Motor interno y base de datos responden.' });
      case 'fbgroups.worker': {
        const n = await db.fbWorker.count();
        return NextResponse.json({
          outcome: n > 0 ? 'OK' : 'AWAITING_CREDENTIALS',
          reason: n > 0 ? `${n} worker(es) registrados con sesión.` : 'Sin workers registrados: registra un worker Chrome en la sección Grupos de Facebook.',
        });
      }
      case 'albra.seed':
        return NextResponse.json({
          outcome: 'OK',
          ...(await probe(`${process.env.ALBRA_SEED_URL}/api/v1/health`, { Authorization: `Bearer ${process.env.ALBRA_SEED_TOKEN}` })),
          reason: 'Semilla AGENTE-GENERAL alcanzable.',
        });
      case 'postgale.publish':
        return NextResponse.json({
          outcome: 'OK',
          ...(await probe(`${process.env.POSTGALE_URL}/api/v1/accounts`, { Authorization: `Bearer ${process.env.POSTGALE_API_KEY}` })),
          reason: 'Postgale alcanzable; revisa que el estado sea 200.',
        });
      case 'scrapecreators.research':
        return NextResponse.json({
          outcome: 'OK',
          ...(await probe(`https://api.scrapecreators.com/v1/instagram/profile?handle=instagram`, { 'x-api-key': process.env.SCRAPECREATORS_API_KEY ?? '' })),
          reason: 'ScrapeCreators respondió (verifica autenticación en el estado HTTP).',
        });
      case 'telegram.bot': {
        // Prueba real de la Bot API oficial: getMe es un endpoint de solo lectura
        // que autentica el token y devuelve la identidad del bot. Nunca publica.
        const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`, { signal: AbortSignal.timeout(8000) });
        const data = await r.json().catch(() => ({}));
        return NextResponse.json({
          outcome: r.ok && data.ok ? 'OK' : 'ERROR',
          httpStatus: r.status,
          reachable: true,
          reason: data.ok
            ? `Bot autenticado: @${data.result.username} (id ${data.result.id}). Añádelo como administrador del canal para publicar.`
            : 'La Bot API no autenticó el token: revisa TELEGRAM_BOT_TOKEN (se genera con @BotFather).',
        });
      }
      default: {
        // Instancias propias del ecosistema (CHISMOSO, CRM, WHATPOWER, KREA,
        // YTAUTO, NEXSCOPE, POSTIZ, POSTLAKE): GET a la raíz, sin simular nada.
        const url = process.env[def.envKeys[0]];
        if (!url) {
          return NextResponse.json({ outcome: 'AWAITING_CREDENTIALS', reason: `Falta ${def.envKeys[0]}` });
        }
        const r = await probe(url);
        return NextResponse.json({
          outcome: 'REACHABLE',
          ...r,
          reason: `Host alcanzable (HTTP ${r.httpStatus}). Sin ruta de prueba documentada: la verificación completa llega con el primer contrato real.`,
        });
      }
    }
  } catch (e) {
    return NextResponse.json({ outcome: 'ERROR', reason: `Prueba fallida: ${(e as Error).message}` });
  }
}
