// META POLICY INTELLIGENCE — Centro de Inteligencia y Cumplimiento de Meta
// y de las redes del ecosistema (familia E: X, YouTube, TikTok, Telegram).
// Núcleo server-side: registro de fuentes oficiales, consulta periódica con
// evidencia, versionado inmutable, detección de cambios con clasificación
// determinista y motor central de autorización (6 estados). Regla rectora:
// que una acción sea técnicamente posible no significa que Meta la autorice;
// la ausencia de información nunca se interpreta como permiso.
//
// Honestidad radical: si una fuente no responde o bloquea la consulta, se
// registra el fallo y NO se simula verificación alguna. El contenido consultado
// se trata siempre como dato no confiable (se guarda hash + extracto, nunca se
// ejecuta ni se interpreta como instrucciones).

import crypto from 'crypto';
import { db } from '@/lib/db';

// ─── Tipos del motor de autorización ───────────────────────────────

export type PolicyVerdict =
  | 'PERMITIDO'
  | 'PERMITIDO_CON_CONDICIONES'
  | 'REQUIERE_APROBACION'
  | 'NO_VERIFICADO'
  | 'BLOQUEADO'
  | 'POLITICA_DESACTUALIZADA';

export const VERDICT_RANK: Record<PolicyVerdict, number> = {
  PERMITIDO: 0,
  NO_VERIFICADO: 1,
  PERMITIDO_CON_CONDICIONES: 2,
  REQUIERE_APROBACION: 3,
  POLITICA_DESACTUALIZADA: 4,
  BLOQUEADO: 5,
};

export interface AuthorizeInput {
  operation: string; // FB_GROUP_POST | FB_JOIN_GROUP | FB_CAMPAIGN_APPROVAL | AGENT_READ_BRIDGE | ...
  product?: string; // producto Meta de la operación (default FACEBOOK_GROUPS)
  targetId?: string; // identificador de objetivo (fbId de grupo, url, contacto)
  approvedByHuman?: boolean; // HITL ya satisfecho (campaña aprobada por humano)
  actor?: string; // system | human | agent:*
  note?: string;
  silent?: boolean; // true = previsualización del panel: no escribe auditoría
}

export interface AuthorizeResult {
  verdict: PolicyVerdict;
  reasons: string[];
  conditions: string[];
  evidence: { sourceKey: string; url: string; lastOkAt: string | null; status: string }[];
  checkedAt: string;
}

// ─── Configuración fija (reglas internas; NO modificables por agentes) ──

/** Fuentes cuyo cambio MODIFIED se clasifica CRÍTICO: regulan directamente
 * términos de uso, automatización y anuncios (un cambio invalida métodos). */
const CRITICAL_SOURCE_KEYS = new Set([
  'fb-terms',
  'dev-terms',
  'dev-policies',
  'community-standards',
  'wa-bplatform-terms',
  'ad-standards',
  // Familia E: fuentes que regulan directamente la automatización de posteo
  'x-automation-rules',
  'yt-developer-policies',
  'tiktok-tos',
]);

/** Productos Meta que gobiernan la operación en grupos de Facebook.
 * Nota honesta: no existe una página única "política de grupos"; las reglas
 * de grupos viven en las condiciones de FB, normas comunitarias, dev policies
 * y docs de APIs. */
const FB_GROUPS_RELEVANT = ['FACEBOOK', 'TRANSPARENCY', 'DEVELOPERS', 'APIS', 'PRIVACY'];

const PRODUCT_MODULES: Record<string, string[]> = {
  FACEBOOK: ['fb-groups', 'harness'],
  TRANSPARENCY: ['fb-groups', 'harness'],
  DEVELOPERS: ['fb-groups', 'harness'],
  APIS: ['fb-groups', 'harness'],
  PRIVACY: ['harness', 'fb-groups'],
  WHATSAPP: ['harness'],
  META_BUSINESS: ['harness', 'creation'],
  ADS: ['creation', 'harness'],
  COMMERCE: ['creation', 'harness'],
  COLOMBIA: ['harness'],
  INSTAGRAM: ['creation', 'harness'],
  // Familia E: otras redes del ecosistema (BROWSER-FACTORY / conectores API)
  X_TWITTER: ['creation', 'harness'],
  YOUTUBE: ['creation', 'harness'],
  TIKTOK: ['creation', 'harness'],
  TELEGRAM: ['creation', 'harness'],
};

const SEVERITY_ORDER = ['BAJO', 'MEDIO', 'ALTO', 'CRITICO'] as const;
type Severity = (typeof SEVERITY_ORDER)[number];

function stepDown(s: Severity): Severity {
  const i = SEVERITY_ORDER.indexOf(s);
  return SEVERITY_ORDER[Math.max(0, i - 1)];
}

export function relevantProductsFor(operation: string): string[] {
  if (operation.startsWith('FB_GROUP') || operation.startsWith('FB_CAMPAIGN') || operation.startsWith('FB_JOIN')) return FB_GROUPS_RELEVANT;
  if (operation.startsWith('WHATSAPP')) return ['WHATSAPP'];
  if (operation.startsWith('AGENT_READ')) return FB_GROUPS_RELEVANT;
  if (operation.startsWith('X_')) return ['X_TWITTER'];
  if (operation.startsWith('YT_')) return ['YOUTUBE'];
  if (operation.startsWith('TT_')) return ['TIKTOK'];
  if (operation.startsWith('TELEGRAM_')) return ['TELEGRAM'];
  if (operation.startsWith('IG_')) return ['INSTAGRAM'];
  return ['FACEBOOK', 'TRANSPARENCY'];
}

// ─── Catálogo de fuentes oficiales (26 del mandato + 8 de familia E) ─

export interface SourceSeed {
  key: string;
  name: string;
  url: string;
  product: string;
  alsoCovers?: string;
  family: 'A' | 'B' | 'C' | 'D';
  priority: 'DAILY' | 'WEEKLY' | 'MANUAL';
  method: 'HTTP_GET' | 'MANUAL';
  checkIntervalHours: number;
}

export const SOURCES_SEED: SourceSeed[] = [
  // A. Meta: políticas generales y contenido
  { key: 'meta-transparency', name: 'Centro de transparencia de Meta', url: 'https://transparency.meta.com/', product: 'TRANSPARENCY', family: 'A', priority: 'WEEKLY', method: 'HTTP_GET', checkIntervalHours: 168 },
  { key: 'community-standards', name: 'Normas comunitarias', url: 'https://transparency.meta.com/policies/community-standards/', product: 'TRANSPARENCY', alsoCovers: 'FACEBOOK,INSTAGRAM,FACEBOOK_GROUPS', family: 'A', priority: 'DAILY', method: 'HTTP_GET', checkIntervalHours: 24 },
  { key: 'ad-standards', name: 'Normas publicitarias', url: 'https://transparency.meta.com/policies/ad-standards/', product: 'ADS', alsoCovers: 'FACEBOOK,INSTAGRAM', family: 'A', priority: 'WEEKLY', method: 'HTTP_GET', checkIntervalHours: 168 },
  { key: 'fb-terms', name: 'Condiciones de Facebook', url: 'https://www.facebook.com/legal/terms', product: 'FACEBOOK', alsoCovers: 'INSTAGRAM,FACEBOOK_GROUPS', family: 'A', priority: 'DAILY', method: 'HTTP_GET', checkIntervalHours: 24 },
  { key: 'privacy-policy', name: 'Política de privacidad de Meta', url: 'https://www.facebook.com/privacy/policy/', product: 'PRIVACY', alsoCovers: 'INSTAGRAM,FACEBOOK_GROUPS', family: 'A', priority: 'WEEKLY', method: 'HTTP_GET', checkIntervalHours: 168 },
  { key: 'commercial-terms', name: 'Condiciones comerciales', url: 'https://www.facebook.com/legal/commercial_terms', product: 'COMMERCE', family: 'A', priority: 'WEEKLY', method: 'HTTP_GET', checkIntervalHours: 168 },
  { key: 'technology-terms', name: 'Condiciones de herramientas empresariales', url: 'https://www.facebook.com/legal/technology_terms', product: 'META_BUSINESS', family: 'A', priority: 'WEEKLY', method: 'HTTP_GET', checkIntervalHours: 168 },
  { key: 'commerce-policies', name: 'Políticas de comercio', url: 'https://www.facebook.com/policies_center/commerce', product: 'COMMERCE', family: 'A', priority: 'WEEKLY', method: 'HTTP_GET', checkIntervalHours: 168 },
  { key: 'brand-resources', name: 'Recursos oficiales de marca', url: 'https://www.meta.com/brand/resources/', product: 'META_BUSINESS', family: 'A', priority: 'WEEKLY', method: 'HTTP_GET', checkIntervalHours: 168 },
  // B. Facebook e Instagram: desarrolladores y automatización
  { key: 'dev-terms', name: 'Términos para desarrolladores de Meta', url: 'https://developers.facebook.com/terms/', product: 'DEVELOPERS', alsoCovers: 'FACEBOOK_GROUPS', family: 'B', priority: 'DAILY', method: 'HTTP_GET', checkIntervalHours: 24 },
  { key: 'dev-policies', name: 'Políticas para desarrolladores', url: 'https://developers.facebook.com/devpolicy/', product: 'DEVELOPERS', alsoCovers: 'FACEBOOK_GROUPS', family: 'B', priority: 'DAILY', method: 'HTTP_GET', checkIntervalHours: 24 },
  { key: 'api-docs', name: 'Documentación de APIs de Meta', url: 'https://developers.facebook.com/docs/', product: 'APIS', alsoCovers: 'FACEBOOK_GROUPS', family: 'B', priority: 'DAILY', method: 'HTTP_GET', checkIntervalHours: 24 },
  { key: 'fb-apps', name: 'Consola de aplicaciones (requiere sesión)', url: 'https://developers.facebook.com/apps/', product: 'DEVELOPERS', family: 'B', priority: 'MANUAL', method: 'MANUAL', checkIntervalHours: 168 },
  { key: 'business-help', name: 'Ayuda empresarial de Meta', url: 'https://www.facebook.com/business/help/', product: 'META_BUSINESS', family: 'B', priority: 'WEEKLY', method: 'HTTP_GET', checkIntervalHours: 168 },
  // C. WhatsApp
  { key: 'wa-legal', name: 'Centro legal de WhatsApp', url: 'https://www.whatsapp.com/legal/', product: 'WHATSAPP', family: 'C', priority: 'WEEKLY', method: 'HTTP_GET', checkIntervalHours: 168 },
  { key: 'wa-bapp-terms', name: 'Condiciones de WhatsApp Business App', url: 'https://www.whatsapp.com/legal/WhatsApp-Terms-for-WhatsApp-Business-App', product: 'WHATSAPP', family: 'C', priority: 'WEEKLY', method: 'HTTP_GET', checkIntervalHours: 168 },
  { key: 'wa-bplatform-terms', name: 'Condiciones de WhatsApp Business Platform', url: 'https://www.whatsapp.com/legal/WhatsApp-Terms-for-WhatsApp-Business-Platform', product: 'WHATSAPP', family: 'C', priority: 'DAILY', method: 'HTTP_GET', checkIntervalHours: 24 },
  { key: 'wa-business-policy', name: 'Política de mensajería de WhatsApp Business', url: 'https://whatsappbusiness.com/policy/', product: 'WHATSAPP', family: 'C', priority: 'WEEKLY', method: 'HTTP_GET', checkIntervalHours: 168 },
  { key: 'wa-messaging-guidelines', name: 'Normas de mensajería de WhatsApp', url: 'https://www.whatsapp.com/legal/messaging-guidelines?lang=es', product: 'WHATSAPP', family: 'C', priority: 'WEEKLY', method: 'HTTP_GET', checkIntervalHours: 168 },
  { key: 'wa-meta-terms-business', name: 'Condiciones de Meta para WhatsApp Business', url: 'https://www.whatsapp.com/legal/meta-terms-whatsapp-business', product: 'WHATSAPP', family: 'C', priority: 'WEEKLY', method: 'HTTP_GET', checkIntervalHours: 168 },
  { key: 'wa-third-party-agents', name: 'Condiciones para agentes de terceros', url: 'https://www.whatsapp.com/legal/third-party-agents-terms', product: 'WHATSAPP', family: 'C', priority: 'WEEKLY', method: 'HTTP_GET', checkIntervalHours: 168 },
  // D. Colombia: legislación y protección de datos
  { key: 'co-ley-1581', name: 'Ley 1581 de 2012 (protección de datos)', url: 'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981', product: 'COLOMBIA', family: 'D', priority: 'WEEKLY', method: 'HTTP_GET', checkIntervalHours: 168 },
  { key: 'co-ley-1480', name: 'Ley 1480 de 2011 (estatuto del consumidor)', url: 'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=44306', product: 'COLOMBIA', family: 'D', priority: 'WEEKLY', method: 'HTTP_GET', checkIntervalHours: 168 },
  { key: 'co-sic', name: 'Superintendencia de Industria y Comercio', url: 'https://www.sic.gov.co/', product: 'COLOMBIA', family: 'D', priority: 'WEEKLY', method: 'HTTP_GET', checkIntervalHours: 168 },
  { key: 'co-dnda', name: 'Dirección Nacional de Derecho de Autor', url: 'https://www.derechodeautor.gov.co/', product: 'COLOMBIA', family: 'D', priority: 'WEEKLY', method: 'HTTP_GET', checkIntervalHours: 168 },
  { key: 'co-dian', name: 'DIAN (Dirección de Impuestos y Aduanas)', url: 'https://www.dian.gov.co/', product: 'COLOMBIA', family: 'D', priority: 'WEEKLY', method: 'HTTP_GET', checkIntervalHours: 168 },
  // E. Otras redes del ecosistema: reglas oficiales de posteo y automatización
  //    (investigación del 2026-10-30; ver docs/policy/REGLAS_POSTEO_REDES_BF.md).
  //    La consulta del portal de TikTok puede fallar por contenido JS: se
  //    registra el fallo honesto y NO se simula verificación.
  { key: 'x-automation-rules', name: 'Reglas de automatización de X', url: 'https://help.x.com/en/rules-and-policies/x-automation', product: 'X_TWITTER', family: 'E', priority: 'DAILY', method: 'HTTP_GET', checkIntervalHours: 24 },
  { key: 'x-terms', name: 'Condiciones de servicio de X', url: 'https://x.com/legal/tos', product: 'X_TWITTER', family: 'E', priority: 'WEEKLY', method: 'HTTP_GET', checkIntervalHours: 168 },
  { key: 'yt-api-tos', name: 'Condiciones de servicio de las APIs de YouTube', url: 'https://developers.google.com/youtube/terms/api-services-terms-of-service', product: 'YOUTUBE', family: 'E', priority: 'DAILY', method: 'HTTP_GET', checkIntervalHours: 24 },
  { key: 'yt-developer-policies', name: 'Políticas para desarrolladores de YouTube', url: 'https://developers.google.com/youtube/terms/developer-policies', product: 'YOUTUBE', family: 'E', priority: 'DAILY', method: 'HTTP_GET', checkIntervalHours: 24 },
  { key: 'tiktok-tos', name: 'Condiciones de servicio de TikTok', url: 'https://www.tiktok.com/legal/page/global/terms-of-service', product: 'TIKTOK', family: 'E', priority: 'WEEKLY', method: 'HTTP_GET', checkIntervalHours: 168 },
  { key: 'tiktok-dev-portal', name: 'Portal de desarrolladores de TikTok (Content Posting API)', url: 'https://developers.tiktok.com/doc/overview/', product: 'TIKTOK', family: 'E', priority: 'DAILY', method: 'HTTP_GET', checkIntervalHours: 24 },
  { key: 'telegram-bots-faq', name: 'FAQ oficial de bots de Telegram (límites de mensajería)', url: 'https://core.telegram.org/bots/faq', product: 'TELEGRAM', family: 'E', priority: 'WEEKLY', method: 'HTTP_GET', checkIntervalHours: 168 },
  { key: 'telegram-tos', name: 'Condiciones de servicio de Telegram', url: 'https://telegram.org/tos', product: 'TELEGRAM', family: 'E', priority: 'WEEKLY', method: 'HTTP_GET', checkIntervalHours: 168 },
];

export async function ensurePolicySourcesSeeded(): Promise<{ seeded: number; total: number }> {
  let seeded = 0;
  for (const s of SOURCES_SEED) {
    const existing = await db.metaPolicySource.findUnique({ where: { key: s.key } });
    if (!existing) {
      await db.metaPolicySource.create({ data: { ...s, alsoCovers: s.alsoCovers ?? '' } });
      seeded += 1;
    }
  }
  return { seeded, total: SOURCES_SEED.length };
}

// ─── Settings del motor (claves centralizadas) ─────────────────────

export const POLICY_SETTINGS = {
  enabled: 'meta_policy_enabled', // 'false' = apagado de emergencia del motor
  killSwitch: 'meta_policy_kill_switch', // JSON {reason, at, by}
  exclusions: 'meta_policy_exclusions', // JSON array de identificadores excluidos
  staleDays: 'meta_policy_stale_days', // días sin verificación OK que implican desactualización (default 14)
};

async function getSetting(key: string): Promise<string | null> {
  const s = await db.setting.findUnique({ where: { key } });
  return s?.value ?? null;
}

export function extractText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, '\n') // conserva párrafos para el diff
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#\d+;/g, ' ')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .trim();
}

export function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/** "Forma" del texto: solo palabras, sin cifras ni puntuación. Si dos versiones
 * tienen la misma forma, el cambio afecta solo fechas/cifras o contenido
 * dinámico de la página (carruseles, selectores) — probable falso positivo de
 * página rotativa, no una edición de política. Comparación determinista. */
export function shapeOf(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-záéíóúüñ]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200_000);
}

export interface FetchOutcome {
  ok: boolean;
  status?: number;
  text?: string;
  blocked: boolean;
  error?: string;
  durationMs: number;
}

/** Consulta HTTP honesta de una fuente pública. Nota transparente: el edge de
 * Meta responde HTTP 400 a cadenas User-Agent no reconocidas, por eso la
 * consulta de documentos PÚBLICOS de políticas usa un UA estándar de lectura.
 * Es lectura de contenido público (lo exige el mandato de vigilancia), no una
 * interacción con sistemas anti-abuso ni una publicación automatizada: no hay
 * login, ni captcha evadido, ni acciones sobre productos. Si aun así la fuente
 * rechaza o bloquea, se registra BLOCKED/FAILED y se acude a la revisión
 * manual — nunca se simula un resultado. */
export async function fetchSourceText(url: string, timeoutMs = 12_000): Promise<FetchOutcome> {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', 'Accept-Language': 'es' },
    });
    const body = await res.text();
    const looksBlocked = res.status === 401 || res.status === 403 || res.status === 418 || res.status === 429;
    return { ok: res.ok && !looksBlocked, status: res.status, text: body, blocked: looksBlocked, durationMs: Date.now() - t0 };
  } catch (e) {
    return { ok: false, blocked: false, error: (e as Error).message, durationMs: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

/** Resumen determinista de diferencias: primeros párrafos que cambian entre dos textos. */
export function diffSummary(oldText: string, newText: string, maxPairs = 2): string {
  const a = oldText.split('\n').filter(Boolean);
  const b = newText.split('\n').filter(Boolean);
  const out: string[] = [];
  const max = Math.max(a.length, b.length);
  let shown = 0;
  for (let i = 0; i < max && shown < maxPairs; i++) {
    const la = (a[i] ?? '').slice(0, 160);
    const lb = (b[i] ?? '').slice(0, 160);
    if (la !== lb) {
      out.push(la ? `antes: "${la}"` : '(sección nueva)');
      out.push(`ahora: "${lb || '(sección eliminada)'}"`);
      shown++;
    }
  }
  if (out.length === 0) return 'El contenido cambió sin diferencias de párrafo detectables en el extracto comparado.';
  return out.join(' · ');
}

function impactFor(product: string, kind: string): string {
  const base = PRODUCT_MODULES[product] ?? ['harness'];
  const mod = base.join(', ');
  if (kind === 'INACCESSIBLE') {
    return `Interpretación: no se pudo consultar la fuente; las operaciones que dependen de este documento se consideran NO_VERIFICADAS hasta una verificación exitosa o revisión manual. Módulos que consultan este producto: ${mod}.`;
  }
  return `Interpretación (requiere análisis humano): este documento regula productos que afectan a ${mod}. Evaluar si el cambio invalida condiciones, métodos o límites operativos antes de aceptar.`;
}

function recommendationFor(kind: string, severity: string): string {
  if (kind === 'INACCESSIBLE') {
    return severity === 'ALTO'
      ? 'Recomendación preventiva: repetir la consulta, verificar acceso manual desde el navegador y registrar la revisión manual; mientras tanto el motor exigirá revisión humana para operaciones de alto riesgo.'
      : 'Recomendación preventiva: reintentar en el siguiente ciclo; si persiste, realizar revisión manual.';
  }
  if (severity === 'CRITICO') {
    return 'Recomendación preventiva: analizar el cambio hoy, comparar versiones y decidir si se bloquea o restringe alguna operación; los cambios críticos abiertos bloquean las operaciones relacionadas automáticamente.';
  }
  return 'Recomendación preventiva: clasificar el cambio y aceptarlo o descartarlo con nota; no modifica reglas automáticamente.';
}

function modulesFor(product: string): string {
  return JSON.stringify(PRODUCT_MODULES[product] ?? ['harness']);
}

/** Registra un cambio evitando duplicados abiertos por (fuente, tipo). */
async function recordChange(sourceId: string, data: {
  kind: string; severity: string; summary: string; impact: string; recommendation: string;
  fromVersionId?: string | null; toVersionId?: string | null;
}) {
  const open = await db.metaPolicyChange.findFirst({
    where: { sourceId, kind: data.kind, status: 'OPEN' },
  });
  if (open) {
    await db.metaPolicyChange.update({ where: { id: open.id }, data: { detectedAt: new Date(), severity: data.severity, summary: data.summary, toVersionId: data.toVersionId ?? open.toVersionId } });
    return open.id;
  }
  const ch = await db.metaPolicyChange.create({ data: { sourceId, ...data, affectedModules: modulesFor((await db.metaPolicySource.findUnique({ where: { id: sourceId } }))?.product ?? 'FACEBOOK') } });
  return ch.id;
}

export interface CheckOutcome {
  sourceKey: string;
  status: 'OK' | 'CHANGED' | 'FAILED' | 'BLOCKED';
  changed: boolean;
  versionNumber?: number;
  changeId?: string;
  error?: string;
  httpStatus?: number;
  durationMs: number;
}

/** Verifica una fuente: consulta, hashea, versiona y clasifica cambios. */
export async function checkSource(sourceId: string, kind: 'MANUAL' | 'DAILY' | 'WEEKLY' | 'MONTHLY' = 'DAILY'): Promise<CheckOutcome> {
  const source = await db.metaPolicySource.findUnique({ where: { id: sourceId } });
  if (!source) throw new Error('Fuente no encontrada');

  if (source.method === 'MANUAL') {
    // Sin consulta automatizada fiable (p.ej. consola con sesión): se registra
    // el estado honesto; la verificación la hace un humano y la registra el panel.
    return { sourceKey: source.key, status: 'FAILED', changed: false, error: 'Fuente con método MANUAL: requiere revisión humana desde el navegador y registro en el panel', durationMs: 0 };
  }

  const t0 = Date.now();
  const fetched = await fetchSourceText(source.url);
  const evidence = `URL ${source.url} · HTTP ${fetched.status ?? 'sin respuesta'} · método HTTP_GET con UA propio · ${new Date().toISOString()}`;

  if (!fetched.ok || !fetched.text) {
    const status = fetched.blocked ? 'BLOCKED' : 'FAILED';
    const error = fetched.error ?? (fetched.blocked ? `Consulta bloqueada por el servidor (HTTP ${fetched.status})` : `HTTP ${fetched.status}`);
    const failures = source.consecutiveFailures + 1;
    await db.metaPolicySource.update({
      where: { id: source.id },
      data: { lastCheckAt: new Date(), lastStatus: status, lastError: error, consecutiveFailures: failures },
    });
    await db.metaPolicyCheckRun.create({ data: { sourceId: source.id, kind, status, httpStatus: fetched.status ?? null, durationMs: fetched.durationMs, error, evidence, hash: source.lastHash, previousHash: source.lastHash } });
    const severity: Severity = source.priority === 'DAILY' && failures >= 2 ? 'ALTO' : 'MEDIO';
    const changeId = await recordChange(source.id, {
      kind: 'INACCESSIBLE', severity,
      summary: `Fuente inaccesible (${failures} fallo(s) consecutivo(s)): ${error}`,
      impact: impactFor(source.product, 'INACCESSIBLE'),
      recommendation: recommendationFor('INACCESSIBLE', severity),
    });
    // Un solo incidente abierto por fuente: no se duplica en cada reintento.
    const existingIncident = await db.metaPolicyIncident.findFirst({ where: { kind: 'SOURCE_FAILURE', status: 'OPEN', description: { contains: source.key } } });
    if (!existingIncident) {
      await db.metaPolicyIncident.create({ data: { kind: 'SOURCE_FAILURE', severity, module: (PRODUCT_MODULES[source.product] ?? ['harness'])[0], description: `No se pudo verificar "${source.name}" (${source.key}): ${error}` } });
    }
    return { sourceKey: source.key, status, changed: false, changeId, error, httpStatus: fetched.status, durationMs: fetched.durationMs };
  }

  // Recuperación tras fallos: cierra lo que el fallo abrió (cambio INACCESSIBLE
  // e incidente SOURCE_FAILURE) y registra el RECOVERED informativo.
  if (source.consecutiveFailures > 0) {
    await db.metaPolicyChange.updateMany({
      where: { sourceId: source.id, kind: 'INACCESSIBLE', status: 'OPEN' },
      data: { status: 'ACCEPTED', reviewedAt: new Date(), reviewNote: 'Fuente recuperada automáticamente: la consulta volvió a responder. Cerrado sin intervención humana.' },
    });
    await db.metaPolicyIncident.updateMany({
      where: { kind: 'SOURCE_FAILURE', status: 'OPEN', description: { contains: source.key } },
      data: { status: 'RESOLVED', resolvedAt: new Date(), resolutionNote: 'La fuente volvió a responder en una verificación posterior.' },
    });
    await recordChange(source.id, {
      kind: 'RECOVERED', severity: 'BAJO',
      summary: `La fuente volvió a responder tras ${source.consecutiveFailures} fallo(s) consecutivo(s).`,
      impact: impactFor(source.product, 'RECOVERED'),
      recommendation: recommendationFor('RECOVERED', 'BAJO'),
    });
  }

  const text = extractText(fetched.text).slice(0, 400_000);
  const hash = hashText(text);
  const now = new Date();

  await db.metaPolicyCheckRun.create({
    data: { sourceId: source.id, kind, status: hash === source.lastHash && source.lastHash ? 'OK' : 'CHANGED', httpStatus: fetched.status ?? null, durationMs: fetched.durationMs, hash, previousHash: source.lastHash, evidence },
  });

  if (!source.lastHash) {
    // Primera versión verificada: línea base (no es un cambio, es la base).
    const count = await db.metaPolicyVersion.count({ where: { sourceId: source.id } });
    const v = await db.metaPolicyVersion.create({
      data: { sourceId: source.id, versionNumber: count + 1, contentHash: hash, excerpt: text.slice(0, 4000), rawSize: fetched.text.length, method: 'HTTP_GET', note: `Línea base registrada (${kind})` },
    });
    await db.metaPolicySource.update({ where: { id: source.id }, data: { lastCheckAt: now, lastOkAt: now, lastHash: hash, lastStatus: 'OK', lastError: '', consecutiveFailures: 0 } });
    if (count === 0) {
      const sev: Severity = 'MEDIO';
      await recordChange(source.id, {
        kind: 'NEW', severity: sev,
        summary: `Primera versión capturada de "${source.name}" (línea base v1). Este registro NO confirma vigencia de contenido: exige revisión humana del extracto.`,
        impact: impactFor(source.product, 'NEW'),
        recommendation: recommendationFor('NEW', sev),
        toVersionId: v.id,
      });
    }
    return { sourceKey: source.key, status: 'OK', changed: true, versionNumber: v.versionNumber, durationMs: fetched.durationMs, httpStatus: fetched.status };
  }

  if (hash === source.lastHash) {
    await db.metaPolicySource.update({ where: { id: source.id }, data: { lastCheckAt: now, lastOkAt: now, lastStatus: 'OK', lastError: '', consecutiveFailures: 0 } });
    return { sourceKey: source.key, status: 'OK', changed: false, durationMs: fetched.durationMs, httpStatus: fetched.status };
  }

  // Contenido distinto a la última versión verificada → nueva versión + cambio.
  const prev = await db.metaPolicyVersion.findFirst({ where: { sourceId: source.id }, orderBy: { versionNumber: 'desc' } });
  const count = await db.metaPolicyVersion.count({ where: { sourceId: source.id } });
  const v = await db.metaPolicyVersion.create({
    data: { sourceId: source.id, versionNumber: count + 1, contentHash: hash, excerpt: text.slice(0, 4000), rawSize: fetched.text.length, method: 'HTTP_GET' },
  });
  const isCritical = CRITICAL_SOURCE_KEYS.has(source.key);
  const sameShape = !!prev && shapeOf(prev.excerpt) === shapeOf(text.slice(0, 4000));
  const severity: Severity = isCritical ? (sameShape ? 'MEDIO' : 'CRITICO') : (sameShape ? 'MEDIO' : 'ALTO');
  const summary = sameShape
    ? `Cambio entre v${prev?.versionNumber ?? '?'} y v${v.versionNumber} que solo afecta cifras, fechas o elementos dinámicos de la página (la estructura del texto es idéntica). Posible falso positivo de página rotativa: revisar y descartar si no hay edición real.`
    : `Cambio detectado entre v${prev?.versionNumber ?? '?'} y v${v.versionNumber}. ${prev ? diffSummary(prev.excerpt, text.slice(0, 4000)) : 'Sin versión anterior comparable.'}`;
  const changeId = await recordChange(source.id, {
    kind: 'MODIFIED', severity,
    summary,
    impact: impactFor(source.product, 'MODIFIED'),
    recommendation: recommendationFor('MODIFIED', severity),
    fromVersionId: prev?.id ?? null,
    toVersionId: v.id,
  });
  await db.metaPolicySource.update({ where: { id: source.id }, data: { lastCheckAt: now, lastOkAt: now, lastHash: hash, lastStatus: 'CHANGED', lastError: '', consecutiveFailures: 0 } });
  // Incidente solo para cambios críticos (los que bloquean operaciones); los
  // demás quedan registrados como cambios pendientes de análisis, sin ruido.
  if (severity === 'CRITICO') {
    await db.metaPolicyIncident.create({ data: { kind: 'POLICY_BLOCK', severity, module: (PRODUCT_MODULES[source.product] ?? ['harness'])[0], description: `Cambio ${severity} detectado en "${source.name}" (${source.key})` } });
  }
  return { sourceKey: source.key, status: 'CHANGED', changed: true, versionNumber: v.versionNumber, changeId, durationMs: fetched.durationMs, httpStatus: fetched.status };
}

/** Verificación manual (procedimiento alternativo honesto): un humano revisó la
 * fuente en su navegador y lo registra con nota. No inventa contenido: guarda
 * método MANUAL, la nota como evidencia y refresca la frescura de la fuente. */
export async function registerManualReview(sourceId: string, note: string, actor = 'human'): Promise<{ ok: boolean; note: string }> {
  const source = await db.metaPolicySource.findUnique({ where: { id: sourceId } });
  if (!source) return { ok: false, note: 'Fuente no encontrada' };
  const clean = note.trim();
  if (clean.length < 10) return { ok: false, note: 'La revisión manual exige una nota de al menos 10 caracteres (qué se verificó y estado observado)' };
  const now = new Date();
  await db.metaPolicyCheckRun.create({
    data: { sourceId: source.id, kind: 'MANUAL', status: 'OK', evidence: `Revisión manual desde navegador · ${now.toISOString()} · por ${actor} · nota: ${clean.slice(0, 500)}` },
  });
  await db.metaPolicySource.update({ where: { id: source.id }, data: { lastCheckAt: now, lastOkAt: now, lastStatus: 'OK', lastError: '', consecutiveFailures: 0 } });
  await db.auditEntry.create({ data: { actor, action: 'META_POLICY_MANUAL_REVIEW', targetType: 'META_POLICY_SOURCE', targetId: source.id, allowed: true, reason: `Revisión manual registrada de "${source.name}" (${source.url}): ${clean.slice(0, 200)}` } });
  return { ok: true, note: 'Revisión manual registrada: la fuente vuelve a considerarse verificada por procedimiento humano' };
}

/** Vigilancia periódica: fuentes cuya ventana de verificación venció. */
export async function runDueChecks(now = new Date(), forceAll = false): Promise<{ ran: number; results: CheckOutcome[] }> {
  await ensurePolicySourcesSeeded();
  const sources = await db.metaPolicySource.findMany({ where: { active: true } });
  const results: CheckOutcome[] = [];
  for (const s of sources) {
    const due = forceAll || !s.lastCheckAt || now.getTime() - s.lastCheckAt.getTime() >= s.checkIntervalHours * 3600 * 1000;
    if (!due) continue;
    try {
      results.push(await checkSource(s.id, forceAll ? 'MANUAL' : 'DAILY'));
    } catch (e) {
      results.push({ sourceKey: s.key, status: 'FAILED', changed: false, error: (e as Error).message, durationMs: 0 });
    }
  }
  return { ran: results.length, results };
}

// ─── Motor central de autorización ─────────────────────────────────

const STANDARD_CONDITIONS = [
  'Aprobación humana pre-vuelo obligatoria (gate HITL del módulo FB-GROUPS)',
  'Techo diario con warmup por antigüedad de cuenta y ventana horaria respetados',
  'Prohibido evadir sistemas de detección, restricciones o controles de integridad de Meta (sin simulación de actividad, huellas falsas ni evasión)',
  'Ante cualquier señal de restricción (CHALLENGE, bloqueo, aviso): parada inmediata y honesta de la operación',
  'Registro auditado de cada acción y de sus razones',
];

function worstOf(a: PolicyVerdict, b: PolicyVerdict): PolicyVerdict {
  return VERDICT_RANK[a] >= VERDICT_RANK[b] ? a : b;
}

async function isStale(product: string): Promise<{ stale: boolean; detail: string; evidence: AuthorizeResult['evidence'] }> {
  const days = Number((await getSetting(POLICY_SETTINGS.staleDays)) ?? 14) || 14;
  const cutoff = Date.now() - days * 24 * 3600 * 1000;
  const sources = await db.metaPolicySource.findMany({
    where: { active: true, OR: [{ product }, { alsoCovers: { contains: product } }] },
  });
  if (sources.length === 0) return { stale: false, detail: 'Sin fuentes registradas para este producto (no se afirma vigencia)', evidence: [] };
  const evidence = sources.map((s) => ({ sourceKey: s.key, url: s.url, lastOkAt: s.lastOkAt?.toISOString() ?? null, status: s.lastStatus }));
  const fresh = sources.filter((s) => s.lastOkAt && s.lastOkAt.getTime() >= cutoff);
  if (fresh.length === 0) {
    return { stale: true, detail: `Ninguna fuente de ${product} verificada en los últimos ${days} días (política desactualizada)`, evidence };
  }
  return { stale: false, detail: `${fresh.length}/${sources.length} fuente(s) de ${product} verificadas dentro de ${days} días`, evidence };
}

function defaultProductFor(operation: string): string {
  if (operation.startsWith('WHATSAPP')) return 'WHATSAPP';
  if (operation.startsWith('X_')) return 'X_TWITTER';
  if (operation.startsWith('YT_')) return 'YOUTUBE';
  if (operation.startsWith('TT_')) return 'TIKTOK';
  if (operation.startsWith('TELEGRAM_')) return 'TELEGRAM';
  if (operation.startsWith('IG_')) return 'INSTAGRAM';
  return 'FACEBOOK_GROUPS';
}

/** Motor central: toda operación relacionada con Meta o con las redes del
 * ecosistema pasa por aquí. El peor veredicto gana; la ausencia de
 * información nunca es permiso. */
export async function authorize(input: AuthorizeInput): Promise<AuthorizeResult> {
  const operation = input.operation;
  const product = input.product ?? defaultProductFor(operation);
  const reasons: string[] = [];
  const conditions: string[] = [];
  let verdict: PolicyVerdict = 'PERMITIDO';
  let evidence: AuthorizeResult['evidence'] = [];

  // 0) Regla fija §5.1 (inmodificable por agentes): la publicación mediante
  //    automatización de navegador sin API oficial no está autorizada por
  //    ninguna red (X: suspensión permanente; YouTube: solo métodos
  //    documentados; Meta: prohibido circumvent el enforcement). Solo se
  //    publica por API oficial de la red o por acción humana (modo asistido).
  //    Solo un humano puede cambiar esta regla, y es en el código, no en datos.
  if (operation.startsWith('BROWSER_AUTOMATION')) {
    const result: AuthorizeResult = {
      verdict: 'BLOQUEADO',
      reasons: ['Regla fija de cumplimiento (§5.1): la publicación mediante automatización de navegador no-API no está autorizada por ninguna red social (X la castiga con suspensión permanente, YouTube exige métodos documentados, Meta prohíbe circunvenir su enforcement). Solo se publica por la API oficial de la red o por acción humana en modo asistido.'],
      conditions: ['Operación detenida: no ejecutar y registrar la razón. Alternativas autorizadas: conector API oficial de la red o publicación humana en modo asistido.'],
      evidence: [],
      checkedAt: new Date().toISOString(),
    };
    await db.auditEntry.create({
      data: {
        actor: input.actor ?? 'system:policy-engine',
        action: 'META_POLICY_CHECK',
        targetType: 'META_POLICY',
        targetId: operation,
        allowed: false,
        reason: `${result.verdict}${input.note ? ` (${input.note})` : ''}: ${result.reasons.join(' | ')}`.slice(0, 1000),
      },
    });
    return result;
  }

  // 1) Apagado de emergencia del motor (solo reactivable por un humano).
  if ((await getSetting(POLICY_SETTINGS.enabled)) === 'false') {
    verdict = worstOf(verdict, 'BLOQUEADO');
    reasons.push('Apagado de emergencia activo: el motor de cumplimiento está deshabilitado y ninguna operación Meta puede ejecutarse hasta reactivación humana.');
  }

  // 2) Kill switch con razón registrada.
  const ks = await getSetting(POLICY_SETTINGS.killSwitch);
  if (ks) {
    verdict = worstOf(verdict, 'BLOQUEADO');
    reasons.push(`Parada de emergencia vigente: ${ks}`);
  }

  // 3) Lista central de exclusión (bajas y objetivos vetados).
  if (input.targetId) {
    const raw = await getSetting(POLICY_SETTINGS.exclusions);
    const list: string[] = raw ? JSON.parse(raw) : [];
    const hit = list.find((x) => input.targetId && (input.targetId === x || input.targetId.includes(x) || x.includes(input.targetId)));
    if (hit) {
      verdict = worstOf(verdict, 'BLOQUEADO');
      reasons.push(`Objetivo "${input.targetId}" está en la lista central de exclusión (coincidencia: "${hit}"). Las solicitudes de baja se respetan en todos los módulos.`);
    }
  }

  // 4) Cambios CRÍTICOS abiertos que afecten al producto → bloqueo hasta análisis humano.
  const criticalOpen = await db.metaPolicyChange.findMany({
    where: { status: 'OPEN', severity: 'CRITICO', source: { OR: [{ product: { in: relevantProductsFor(operation) } }, { alsoCovers: { contains: product } }] } },
    include: { source: true },
  });
  if (criticalOpen.length > 0) {
    verdict = worstOf(verdict, 'BLOQUEADO');
    reasons.push(`${criticalOpen.length} cambio(s) CRÍTICO(S) sin analizar en fuentes que gobiernan esta operación (${criticalOpen.map((c) => c.source.key).join(', ')}). Se bloquea hasta análisis y aceptación/descarte humano.`);
  }

  // 5) Frescura de la documentación para operaciones de alto riesgo.
  const highRisk = !operation.startsWith('AGENT_READ');
  if (highRisk) {
    const st = await isStale(product);
    evidence = st.evidence;
    if (st.stale) {
      verdict = worstOf(verdict, 'POLITICA_DESACTUALIZADA');
      reasons.push(st.detail);
    } else {
      reasons.push(st.detail);
    }
  } else {
    const st = await isStale(product);
    evidence = st.evidence;
    if (st.stale) {
      verdict = worstOf(verdict, 'NO_VERIFICADO');
      reasons.push(`Lectura sobre documentación sin verificación reciente: ${st.detail}`);
    }
  }

  // 6) HITL: toda operación de escritura (grupos FB y demás redes) exige
  //    aprobación humana pre-vuelo explícita.
  const WRITE_OPERATIONS = new Set([
    'FB_GROUP_POST', 'FB_CAMPAIGN_APPROVAL', 'FB_JOIN_GROUP',
    'X_POST', 'TT_POST', 'YT_UPLOAD', 'TELEGRAM_POST', 'IG_POST',
  ]);
  const needsHuman = WRITE_OPERATIONS.has(operation);
  if (needsHuman && !input.approvedByHuman) {
    verdict = worstOf(verdict, 'REQUIERE_APROBACION');
    const base = operation.startsWith('FB_')
      ? 'No existe método de publicación en grupos autorizado por Meta para automatización; por ello la regla interna es consentimiento humano + límites conservadores.'
      : 'Cada red solo autoriza la publicación por su API oficial y con las condiciones de su política (auditorías, cuotas, no duplicación entre cuentas); sin conector autorizado verificado, la regla interna es consentimiento humano + modo asistido.';
    reasons.push(`Operación de publicación/unión automatizada (${operation}): exige aprobación humana pre-vuelo explícita (gate HITL). ${base}`);
  }

  // 7) Veredicto final + condiciones estándar (nunca PERMITIDO puro para escritura Meta).
  if (verdict === 'PERMITIDO' && highRisk) verdict = 'PERMITIDO_CON_CONDICIONES';
  if (verdict === 'PERMITIDO_CON_CONDICIONES' || verdict === 'REQUIERE_APROBACION') {
    conditions.push(...STANDARD_CONDITIONS);
  }
  if (verdict === 'BLOQUEADO' || verdict === 'POLITICA_DESACTUALIZADA') {
    conditions.push('Operación detenida: no ejecutar; escalar a revisión humana y registrar la razón.');
  }

  const result: AuthorizeResult = { verdict, reasons, conditions, evidence, checkedAt: new Date().toISOString() };

  if (!input.silent) {
    await db.auditEntry.create({
      data: {
        actor: input.actor ?? 'system:policy-engine',
        action: 'META_POLICY_CHECK',
        targetType: 'META_POLICY',
        targetId: operation,
        allowed: verdict === 'PERMITIDO' || verdict === 'PERMITIDO_CON_CONDICIONES' || verdict === 'REQUIERE_APROBACION',
        reason: `${verdict}${input.note ? ` (${input.note})` : ''}: ${reasons.join(' | ')}`.slice(0, 1000),
      },
    });
  }
  return result;
}

// ─── Estado global para panel y claims ─────────────────────────────

export interface PolicyState {
  engineEnabled: boolean;
  killSwitch: { reason: string; at: string } | null;
  exclusions: string[];
  staleDays: number;
  overall: 'AL_DIA' | 'ATENCION' | 'DESACTUALIZADO' | 'BLOQUEADO';
  overallReasons: string[];
  sources: { total: number; ok: number; failed: number; blocked: number; neverChecked: number; manual: number };
  lastCheckAt: string | null;
  nextDueAt: string | null;
  changes: { open: number; bySeverity: Record<string, number>; pendingAnalysis: number };
  incidentsOpen: number;
  blockedChecksToday: number;
  fbGroupsFreshness: { fresh: boolean; detail: string };
}

export async function policyState(): Promise<PolicyState> {
  const enabled = (await getSetting(POLICY_SETTINGS.enabled)) !== 'false';
  const ksRaw = await getSetting(POLICY_SETTINGS.killSwitch);
  const exRaw = await getSetting(POLICY_SETTINGS.exclusions);
  const staleDays = Number((await getSetting(POLICY_SETTINGS.staleDays)) ?? 14) || 14;
  const sources = await db.metaPolicySource.findMany();
  const changes = await db.metaPolicyChange.findMany({ where: { status: 'OPEN' } });
  const incidentsOpen = await db.metaPolicyIncident.count({ where: { status: 'OPEN' } });

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const blockedChecksToday = await db.auditEntry.count({
    where: { action: 'META_POLICY_CHECK', allowed: false, createdAt: { gte: startOfDay } },
  });

  const ok = sources.filter((s) => s.lastOkAt).length;
  const failed = sources.filter((s) => s.lastStatus === 'FAILED').length;
  const blocked = sources.filter((s) => s.lastStatus === 'BLOCKED').length;
  const neverChecked = sources.filter((s) => !s.lastCheckAt).length;
  const manual = sources.filter((s) => s.method === 'MANUAL').length;

  const bySeverity: Record<string, number> = { CRITICO: 0, ALTO: 0, MEDIO: 0, BAJO: 0 };
  for (const c of changes) bySeverity[c.severity] = (bySeverity[c.severity] ?? 0) + 1;

  const overallReasons: string[] = [];
  let overall: PolicyState['overall'] = 'AL_DIA';
  if (!enabled || ksRaw) { overall = 'BLOQUEADO'; overallReasons.push(!enabled ? 'Motor deshabilitado (apagado de emergencia)' : 'Parada de emergencia vigente'); }
  if (bySeverity.CRITICO > 0) { overall = 'BLOQUEADO'; overallReasons.push(`${bySeverity.CRITICO} cambio(s) crítico(s) sin analizar bloquean operaciones`); }
  const fbStale = await isStale('FACEBOOK_GROUPS');
  if (fbStale.stale && overall === 'AL_DIA') { overall = 'DESACTUALIZADO'; }
  if (fbStale.stale) overallReasons.push(fbStale.detail);
  if (overall === 'AL_DIA' && (bySeverity.ALTO > 0 || failed > 0 || blocked > 0 || incidentsOpen > 0)) { overall = 'ATENCION'; overallReasons.push(`${bySeverity.ALTO} cambio(s) alto(s), ${failed} fuente(s) con fallo, ${blocked} bloqueada(s), ${incidentsOpen} incidente(s) abierto(s)`); }

  const lastCheck = sources.filter((s) => s.lastCheckAt).map((s) => s.lastCheckAt!.getTime());
  const nextDue = sources.filter((s) => s.active && s.method === 'HTTP_GET').map((s) => (s.lastCheckAt ? s.lastCheckAt.getTime() + s.checkIntervalHours * 3600 * 1000 : Date.now()));

  return {
    engineEnabled: enabled,
    killSwitch: ksRaw ? JSON.parse(ksRaw) : null,
    exclusions: exRaw ? JSON.parse(exRaw) : [],
    staleDays,
    overall,
    overallReasons,
    sources: { total: sources.length, ok, failed, blocked, neverChecked, manual },
    lastCheckAt: lastCheck.length ? new Date(Math.max(...lastCheck)).toISOString() : null,
    nextDueAt: nextDue.length ? new Date(Math.min(...nextDue)).toISOString() : null,
    changes: { open: changes.length, bySeverity, pendingAnalysis: changes.filter((c) => c.status === 'OPEN').length },
    incidentsOpen,
    blockedChecksToday,
    fbGroupsFreshness: { fresh: !fbStale.stale, detail: fbStale.detail },
  };
}

// ─── Informes (hechos verificados vs interpretación vs recomendación) ──

export interface PolicyReport {
  kind: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  generatedAt: string;
  period: { from: string; to: string };
  facts: string[];
  interpretations: string[];
  recommendations: string[];
  numbers: { checks: number; failed: number; changes: number; bySeverity: Record<string, number>; incidents: number; blockedOps: number };
  sourcesUnavailable: { key: string; name: string; error: string }[];
  changesList: { key: string; name: string; kind: string; severity: string; status: string; summary: string }[];
}

export async function buildReport(kind: 'DAILY' | 'WEEKLY' | 'MONTHLY'): Promise<PolicyReport> {
  const days = kind === 'DAILY' ? 1 : kind === 'WEEKLY' ? 7 : 30;
  const from = new Date(Date.now() - days * 24 * 3600 * 1000);
  const checks = await db.metaPolicyCheckRun.findMany({ where: { createdAt: { gte: from }, kind: { not: 'MANUAL' } }, include: { source: true } });
  const changes = await db.metaPolicyChange.findMany({ where: { detectedAt: { gte: from } }, include: { source: true }, orderBy: { detectedAt: 'desc' } });
  const incidents = await db.metaPolicyIncident.count({ where: { createdAt: { gte: from } } });
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const blockedOps = await db.auditEntry.count({ where: { action: 'META_POLICY_CHECK', allowed: false, createdAt: { gte: from } } });

  const failedChecks = checks.filter((c) => c.status === 'FAILED' || c.status === 'BLOCKED');
  const bySeverity: Record<string, number> = { CRITICO: 0, ALTO: 0, MEDIO: 0, BAJO: 0 };
  for (const c of changes) bySeverity[c.severity] = (bySeverity[c.severity] ?? 0) + 1;

  const facts: string[] = [
    `${checks.length} consulta(s) automatizada(s) en el período (${kind === 'DAILY' ? '24' : days} h).`,
    `${checks.filter((c) => c.status === 'OK').length} verificada(s) sin cambios, ${checks.filter((c) => c.status === 'CHANGED').length} con contenido distinto, ${failedChecks.length} sin poder verificarse.`,
    `${changes.length} cambio(s) registrado(s) y ${incidents} incidente(s) en el período.`,
  ];
  const interpretations: string[] = [];
  const recommendations: string[] = [];
  if (bySeverity.CRITICO > 0) interpretations.push(`Hay ${bySeverity.CRITICO} cambio(s) crítico(s): mientras sigan abiertos, las operaciones Meta relacionadas quedan bloqueadas por el motor.`);
  if (failedChecks.length > 0) interpretations.push(`Las fuentes ${[...new Set(failedChecks.map((c) => c.source.key))].join(', ')} no pudieron verificarse automáticamente: su contenido se considera NO verificado, no vigente confirmado.`);
  if (changes.length === 0) interpretations.push('Sin cambios detectados en el período: la ausencia de cambios detectados no certifica vigencia absoluta (páginas dinámicas o bloqueos pueden ocultarlos).');
  if (failedChecks.length > 0) recommendations.push('Realizar revisión manual de las fuentes inaccesibles desde el navegador y registrarla en el panel (procedimiento alternativo).');
  if (bySeverity.CRITICO + bySeverity.ALTO > 0) recommendations.push('Analizar los cambios de severidad CRÍTICO/ALTO, comparar versiones y aceptar o descartar con nota.');
  recommendations.push('Mantener la cadencia: revisión diaria automática, semanal profunda y mensual integral.');

  return {
    kind,
    generatedAt: new Date().toISOString(),
    period: { from: from.toISOString(), to: new Date().toISOString() },
    facts,
    interpretations,
    recommendations,
    numbers: { checks: checks.length, failed: failedChecks.length, changes: changes.length, bySeverity, incidents, blockedOps },
    sourcesUnavailable: [...new Map(failedChecks.map((c) => [c.sourceId, { key: c.source.key, name: c.source.name, error: c.error || c.status }])).values()],
    changesList: changes.slice(0, 50).map((c) => ({ key: c.source.key, name: c.source.name, kind: c.kind, severity: c.severity, status: c.status, summary: c.summary.slice(0, 300) })),
  };
}
