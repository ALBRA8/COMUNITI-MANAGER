// Memoria de marca (PRD §9): aislamiento por marca, procedencia y validación.
// También: clasificación de interacciones y redacción asistida (backend only).

import { db } from '@/lib/db';
import { NETWORK_SPECS, type Network } from '@/lib/contracts';

export interface BrandMemory {
  id: string;
  name: string;
  identity: string;
  products: string;
  audience: string;
  tone: string;
  vocabulary: string[];
  forbiddenWords: string[];
  policies: string;
  faqs: { q: string; a: string }[];
  approvedExamples: { network: string; text: string }[];
  maxPostsPerDay: number;
  allowedHours: string;
}

export async function loadBrandMemory(brandId: string): Promise<BrandMemory | null> {
  const b = await db.brand.findUnique({ where: { id: brandId } });
  if (!b) return null;
  return {
    id: b.id,
    name: b.name,
    identity: b.identity,
    products: b.products,
    audience: b.audience,
    tone: b.tone,
    vocabulary: b.vocabulary.split(',').map((s) => s.trim()).filter(Boolean),
    forbiddenWords: b.forbiddenWords.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    policies: b.policies,
    faqs: safeJson(b.faqs, []),
    approvedExamples: safeJson(b.approvedExamples, []),
    maxPostsPerDay: b.maxPostsPerDay,
    allowedHours: b.allowedHours,
  };
}

function safeJson<T>(s: string, fallback: T): T {
  try {
    const v = JSON.parse(s);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

export interface SpecCheckResult {
  ok: boolean;
  issues: string[];
}

/** Valida un texto contra las especificaciones de la red Y la memoria de marca. */
export function validateContent(
  memory: BrandMemory,
  network: Network,
  text: string
): SpecCheckResult {
  const issues: string[] = [];
  const spec = NETWORK_SPECS[network];

  if (text.trim().length === 0) issues.push('Texto vacío');
  if (text.length > spec.maxLength) {
    issues.push(`Excede el límite de ${network}: ${text.length}/${spec.maxLength} caracteres`);
  }
  const hashtags = (text.match(/#\w+/g) ?? []).length;
  if (hashtags > spec.hashtags) {
    issues.push(`Demasiados hashtags para ${network}: ${hashtags}/${spec.hashtags}`);
  }
  for (const w of memory.forbiddenWords) {
    if (w && text.toLowerCase().includes(w)) {
      issues.push(`Contiene palabra prohibida de la marca: "${w}"`);
    }
  }
  // No inventar precios: si menciona $ o precio y no está en memoria autorizada
  if (/\$\s?\d/.test(text)) {
    const authorized = memory.faqs.some((f) => f.a.includes('$')) || memory.policies.includes('$');
    if (!authorized) {
      issues.push('Menciona un precio no autorizado en la memoria de marca (PRD §8: no inventar precios)');
    }
  }
  // Promesas prohibidas
  if (/garantizad\w+\s+(vir|éxito|resultado)/i.test(text)) {
    issues.push('Promete resultados garantizados (no fabricación)');
  }
  return { ok: issues.length === 0, issues };
}

/** ¿Estamos dentro del horario permitido de la marca? */
export function withinAllowedHours(allowedHours: string, date = new Date()): boolean {
  const m = allowedHours.match(/^(\d{1,2})-(\d{1,2})$/);
  if (!m) return true;
  const [, a, b] = m;
  const h = date.getHours();
  return h >= Number(a) && h < Number(b);
}

/** Clasificación basada en reglas (rápida, sin LLM). */
export function classifyByRules(text: string): {
  classification: string;
  sentiment: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
} {
  const t = text.toLowerCase();
  const has = (...ws: string[]) => ws.some((w) => t.includes(w));

  if (has('estafa', 'fraude', 'scam', 'phishing', 'robaron')) return { classification: 'FRAUD', sentiment: 'NEGATIVE', risk: 'CRITICAL' };
  if (has('demanda', 'abogado', 'perjudicial', 'crisis', 'escándalo')) return { classification: 'CRISIS', sentiment: 'NEGATIVE', risk: 'CRITICAL' };
  if (has('idiota', 'imbécil', 'odio', 'basura', 'tonto')) return { classification: 'ABUSE', sentiment: 'NEGATIVE', risk: 'HIGH' };
  if (has('devolución', 'reembolso', 'cancelar pedido')) return { classification: 'REFUND', sentiment: 'NEGATIVE', risk: 'HIGH' };
  if (has('no funciona', 'error', 'problema', 'ayuda', 'roto')) return { classification: 'SUPPORT', sentiment: 'NEGATIVE', risk: 'MEDIUM' };
  if (has('reclamo', 'queja', 'pésimo', 'decepción')) return { classification: 'COMPLAINT', sentiment: 'NEGATIVE', risk: 'MEDIUM' };
  if (has('quiero comprar', 'cuánto cuesta', 'precio', 'cotización', 'presupuesto', 'contratar')) return { classification: 'SALES_REQUEST', sentiment: 'POSITIVE', risk: 'LOW' };
  if (has('sigueme', 'sígueme', 'gana seguidores', 'cripta', 'bitcoin', 'enlace gratis', 'dm para')) return { classification: 'SPAM', sentiment: 'NEUTRAL', risk: 'MEDIUM' };
  if (has('colaboración', 'influencer', 'patrocinio')) return { classification: 'LEAD', sentiment: 'POSITIVE', risk: 'LOW' };
  if (has('horario', 'dónde', 'cómo funciona', 'envío')) return { classification: 'FAQ', sentiment: 'NEUTRAL', risk: 'LOW' };
  return { classification: 'PRODUCT_INQUIRY', sentiment: 'NEUTRAL', risk: 'LOW' };
}

/** ¿Puede responderse automáticamente esta interacción? (PRD §8) */
export function canAutoReply(
  classification: string,
  risk: string,
  memory: BrandMemory,
  mode: string
): { allowed: boolean; reason: string } {
  if (mode === 'L1_ASSISTED') return { allowed: false, reason: 'Modo asistido: toda respuesta externa requiere aprobación' };
  if (['CRISIS', 'FRAUD', 'ABUSE', 'REFUND', 'HUMAN_REQUIRED'].includes(classification)) {
    return { allowed: false, reason: `Derivación humana obligatoria (${classification})` };
  }
  if (risk === 'HIGH' || risk === 'CRITICAL') {
    return { allowed: false, reason: 'Riesgo alto: requiere aprobación' };
  }
  if (classification === 'SALES_REQUEST' || classification === 'PRODUCT_INQUIRY') {
    if (!memory.policies && memory.faqs.length === 0) {
      return { allowed: false, reason: 'Sin información autorizada en memoria de marca para responder' };
    }
  }
  if (mode === 'L2_SUPERVISED') {
    return { allowed: false, reason: 'Modo supervisado: respuestas requieren aprobación previa' };
  }
  return { allowed: true, reason: 'Acción de bajo riesgo autorizada en modo autónomo con límites' };
}

/** Respuesta FAQ autorizada desde la memoria de marca. */
export function findFaqAnswer(memory: BrandMemory, text: string): string | null {
  const t = text.toLowerCase();
  for (const faq of memory.faqs) {
    const keys = faq.q.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    if (keys.some((k) => t.includes(k))) return faq.a;
  }
  return null;
}
