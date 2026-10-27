// Registro central de herramientas (PRD §4.C).
// El orquestador consulta este registro ANTES de seleccionar una herramienta.
// Estados honestos: CONNECTED solo con credenciales reales configuradas.

import { db } from '@/lib/db';
import type { Contract, ToolStatus } from '@/lib/contracts';

export interface ToolDefinition {
  key: string;
  provider: string;
  category: 'PUBLISH' | 'RESEARCH' | 'CREATIVITY' | 'ECOSYSTEM' | 'ANALYTICS';
  description: string;
  contracts: Contract[];
  envKeys: string[]; // variables requeridas para estar CONNECTED
  capabilities: string[];
  rateLimit?: string;
  costNote?: string;
}

export const TOOLS: ToolDefinition[] = [
  {
    key: 'harness.internal',
    provider: 'Social Autopilot AI',
    category: 'PUBLISH',
    description: 'Motor propio del arnés: memoria de marca, redacción, validación, adaptación multirred, ciclo autónomo.',
    contracts: ['get_capabilities', 'get_connection_status', 'create_content_draft', 'generate_creative_brief', 'validate_content', 'request_approval', 'record_experiment', 'generate_performance_report'],
    envKeys: [],
    capabilities: ['redaccion-con-marca', 'validacion-vocabulario', 'adaptacion-multirred', 'clasificacion-interacciones', 'informes'],
    costNote: 'Sin coste externo',
  },
  {
    key: 'postgale.publish',
    provider: 'Postgale (Logic Minds LLC)',
    category: 'PUBLISH',
    description: 'Publicación y programación multirred (IG, FB, Threads, TikTok, WhatsApp, Telegram, Discord, Bluesky, Mastodon). Idempotencia x-request-id. Webhooks HMAC-SHA256.',
    contracts: ['list_accounts', 'schedule_post', 'publish_post', 'verify_publication', 'fetch_metrics', 'fetch_comments', 'reply_to_comment', 'reply_to_message'],
    envKeys: ['POSTGALE_URL', 'POSTGALE_API_KEY'],
    capabilities: ['publicar', 'programar', 'verificar', 'metricas', 'comentarios', 'mensajes'],
    rateLimit: '60 req/min por clave (documentado)',
    costNote: 'SaaS por plan',
  },
  {
    key: 'postiz.publish',
    provider: 'Postiz (self-host, AGPL-3.0)',
    category: 'PUBLISH',
    description: 'Alternativa self-host de publicación multirred. Solo se opera instancia propia por API; nunca se copia su código.',
    contracts: ['list_accounts', 'schedule_post', 'publish_post', 'verify_publication'],
    envKeys: ['POSTIZ_URL', 'POSTIZ_API_KEY'],
    capabilities: ['publicar', 'programar'],
    costNote: 'Infraestructura propia',
  },
  {
    key: 'postlake.publish',
    provider: 'PostLake MCP',
    category: 'PUBLISH',
    description: 'API social para agentes vía MCP/REST con respuesta normalizada. Pago por publicación.',
    contracts: ['publish_post', 'schedule_post', 'fetch_metrics'],
    envKeys: ['POSTLAKE_URL', 'POSTLAKE_API_KEY'],
    capabilities: ['publicar', 'programar', 'metricas'],
    costNote: 'Free tier + pago por publicación',
  },
  {
    key: 'scrapecreators.research',
    provider: 'ScrapeCreators',
    category: 'RESEARCH',
    description: 'Datos públicos de TikTok/IG/YT/X con evidencia verificable (perfiles, posts, comentarios, ad libraries).',
    contracts: ['research_topic', 'analyze_competitor', 'fetch_comments'],
    envKeys: ['SCRAPECREATORS_API_KEY'],
    capabilities: ['perfiles', 'posts', 'comentarios', 'ads'],
    costNote: 'Créditos (Free 100 + bonus; Freelance $47/25k)',
  },
  {
    key: 'chismoso.listening',
    provider: 'AGENTE-CHISMOSO (ecosistema ALBRA)',
    category: 'ECOSYSTEM',
    description: 'Escucha social: señales, tendencias y oportunidades con scoreBreakdown auditable. Malla de eventos.',
    contracts: ['research_topic'],
    envKeys: ['CHISMOSO_URL'],
    capabilities: ['senales', 'tendencias', 'oportunidades'],
  },
  {
    key: 'crm.conversation',
    provider: 'CRM-ALBRA (ecosistema ALBRA)',
    category: 'ECOSYSTEM',
    description: 'CRM multi-tenant con inbox multi-canal y handoff humano. El arnés actúa como su HOST vía /api/crm/actions y MCP.',
    contracts: ['fetch_messages', 'reply_to_message', 'create_lead'],
    envKeys: ['CRM_ALBRA_URL', 'CRM_ALBRA_API_KEY'],
    capabilities: ['inbox', 'conversacion', 'crm', 'memorydv'],
  },
  {
    key: 'whatspower.broadcast',
    provider: 'WHATSPOWER-ULTRA (ecosistema ALBRA)',
    category: 'ECOSYSTEM',
    description: 'Difusión masiva WhatsApp con escudo anti-ban de 5 capas. El arnés crea campañas; WhatsPower gobierna el despacho.',
    contracts: ['create_lead'],
    envKeys: ['WHATPOWER_URL'],
    capabilities: ['campanas', 'audiencias'],
  },
  {
    key: 'krea.creativity',
    provider: 'AGENTE-KREA (ecosistema ALBRA)',
    category: 'CREATIVITY',
    description: 'Fábrica de assets: imágenes, texto, voz, subtítulos, ebooks con QA de 6 capas.',
    contracts: ['generate_creative_brief'],
    envKeys: ['KREA_URL', 'KREA_API_KEY'],
    capabilities: ['imagen', 'voz', 'subtitulos', 'ebooks'],
  },
  {
    key: 'ytauto.video',
    provider: 'YOUTUBE-AUTOMATION (ecosistema ALBRA)',
    category: 'CREATIVITY',
    description: 'Producción de vídeo: guion, imágenes, TTS, render, subtítulos, autopublish YouTube. MCP 25 tools / A2A.',
    contracts: ['generate_creative_brief', 'publish_post'],
    envKeys: ['YTAUTO_URL'],
    capabilities: ['video', 'clips', 'youtube'],
  },
  {
    key: 'nexscope.research',
    provider: 'NEX-SCOPE (ecosistema ALBRA)',
    category: 'RESEARCH',
    description: 'Investigación de nichos YouTube: keywords, tendencias, brechas, planes 30 días, competidores. MCP 12 tools.',
    contracts: ['research_topic', 'analyze_competitor'],
    envKeys: ['NEXSCOPE_URL'],
    capabilities: ['keywords', 'tendencias-yt', 'planes'],
  },
  {
    key: 'albra.seed',
    provider: 'AGENTE-GENERAL (ALBRA Seed)',
    category: 'ECOSYSTEM',
    description: 'Semilla universal: runtime con firewall, política, aprobaciones HITL, memoria MemoryDV y auditoría. Se opera por REST cuando está desplegada.',
    contracts: ['get_connection_status'],
    envKeys: ['ALBRA_SEED_URL', 'ALBRA_SEED_TOKEN'],
    capabilities: ['health', 'readiness', 'execution'],
  },
  {
    key: 'fbgroups.worker',
    provider: 'FB-GROUPS (módulo propio del chaleco)',
    category: 'PUBLISH',
    description: 'Publicación en grupos de Facebook vía worker propio con Chrome real y sesión del usuario (PC o VPS). Única vía viable: la API de Grupos de Meta fue eliminada el 22/04/2024. Anti-ban balanceado, HITL del chaleco, riesgo de cuenta declarado en la FICHA del módulo.',
    contracts: ['fb_groups_post', 'fb_groups_sync', 'fb_groups_report'],
    envKeys: [], // el estado depende de workers registrados en BD, no de variables de entorno
    capabilities: ['publicar-en-grupos', 'perfil-personal', 'pagina-en-grupo', 'spintax-por-grupo', 'warmup', 'primer-comentario', 'pausa-defensiva'],
    costNote: 'Sin coste externo; riesgo de restricción asumido por el dueño de la cuenta',
  },
];

function envAvailable(envKeys: string[]): boolean {
  return envKeys.every((k) => !!process.env[k] && process.env[k]!.length > 0);
}

export function computeStatus(tool: ToolDefinition): ToolStatus {
  if (envAvailable(tool.envKeys)) return 'CONNECTED';
  return 'AWAITING_CREDENTIALS';
}

/** Sincroniza el registro en BD (idempotente). */
export async function syncRegistry() {
  for (const tool of TOOLS) {
    // Estado honesto del módulo FB-GROUPS: CONNECTED solo con worker registrado y con sesión.
    const status = tool.key === 'fbgroups.worker'
      ? (await db.fbWorker.count()) > 0 ? 'CONNECTED' : 'AWAITING_CREDENTIALS'
      : computeStatus(tool);
    await db.toolRecord.upsert({
      where: { key: tool.key },
      create: {
        key: tool.key,
        provider: tool.provider,
        category: tool.category,
        description: tool.description,
        contracts: JSON.stringify(tool.contracts),
        status,
        capabilities: JSON.stringify(tool.capabilities),
        rateLimit: tool.rateLimit ?? '',
        costNote: tool.costNote ?? '',
        lastCheckedAt: new Date(),
      },
      update: {
        status,
        capabilities: JSON.stringify(tool.capabilities),
        contracts: JSON.stringify(tool.contracts),
        lastCheckedAt: new Date(),
      },
    });
  }
}

/** Herramientas que soportan un contrato y están disponibles. */
export async function toolsForContract(contract: Contract) {
  return TOOLS.filter(
    (t) => t.contracts.includes(contract) && computeStatus(t) === 'CONNECTED'
  );
}

/** ¿Hay alguna herramienta disponible para este contrato? */
export async function hasCapacity(contract: Contract): Promise<boolean> {
  const list = await toolsForContract(contract);
  return list.length > 0;
}

export function toolByKey(key: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.key === key);
}
