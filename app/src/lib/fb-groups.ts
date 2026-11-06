// Módulo FB-GROUPS (el "pantalón" del chaleco) — FICHA: modulo-fb-groups/FICHA.md
// Núcleo server-side: verificación HMAC de workers, leases anti-doble-disparo,
// techo diario con warmup, ventana horaria, spintax determinista y variante IA
// graduada por nivel de autonomía. Cero datos inventados: sin URL viva no hay éxito.

import crypto from 'crypto';
import { db } from '@/lib/db';
import { applyUnicodeBold, pickRotatedMedia } from '@/lib/fb-risk';
import { authorize } from '@/lib/meta-policy';

/** Gate de cumplimiento: el worker NO reclama nada si el motor de políticas de
 * Meta lo impide (apagado de emergencia, cambio crítico sin analizar o
 * documentación desactualizada). Última línea de defensa antes del vuelo. */
async function policyHold(operation: 'FB_GROUP_POST' | 'FB_JOIN_GROUP'): Promise<string | null> {
  // silent: el poll del worker no debe escribir una fila de auditoría por
  // latido (F-DATA-16); la auditoría del ciclo la dejan FB_JOB_LEASED y la
  // creación/aprobación de campañas, que sí auditan su veredicto.
  const res = await authorize({ operation, actor: 'system:worker-claim', silent: true });
  if (res.verdict === 'BLOQUEADO' || res.verdict === 'POLITICA_DESACTUALIZADA') {
    return `POLICY_HOLD (${res.verdict}): ${res.reasons[0] ?? 'el motor de cumplimiento impide la operación'}`;
  }
  return null;
}

// ─── HMAC por worker (comparación en tiempo constante) ─────────────

export function signPayload(rawBody: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** Verifica la cabecera x-fb-signature de un worker sobre el cuerpo crudo. Devuelve worker y body parseado (el raw solo se lee una vez). */
export async function verifyWorkerRequest(req: Request): Promise<{ worker: { id: string; name: string; mode: string; sessionAgeDays: number }; body: Record<string, unknown> } | { error: string }> {
  const raw = await req.text();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: 'JSON inválido' };
  }
  if (!parsed.workerId) return { error: 'workerId requerido' };
  const worker = await db.fbWorker.findUnique({ where: { id: String(parsed.workerId) } });
  if (!worker) return { error: 'Worker no registrado' };
  const provided = req.headers.get('x-fb-signature') ?? '';
  if (!provided) return { error: 'Cabecera x-fb-signature requerida' };
  const expected = signPayload(raw, worker.secret);
  if (!safeEqual(provided, expected)) return { error: 'Firma HMAC inválida' };
  return { worker: { id: worker.id, name: worker.name, mode: worker.mode, sessionAgeDays: worker.sessionAgeDays }, body: parsed };
}

// ─── Anti-ban: techo diario con warmup + ventana horaria ───────────

/** Techo diario según antigüedad de la cuenta (FICHA §6.1): <7d→5, <14d→10, resto→20. */
export function computeCap(sessionAgeDays: number, override?: number | null): number {
  if (override && override > 0) return override;
  if (sessionAgeDays < 7) return 5;
  if (sessionAgeDays < 14) return 10;
  return 20;
}

export function todayKey(tz = 'America/Bogota'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()); // YYYY-MM-DD
}

export function hourInTz(tz = 'America/Bogota'): number {
  // hourCycle h23 + guard "24": algunos ICU devuelven "24" a medianoche y eso
  // desalinearía la ventana horaria justo en el corte nocturno.
  const formatted = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false, hourCycle: 'h23' }).format(new Date());
  return Number(formatted === '24' ? '00' : formatted);
}

/** Ventana de publicación: windowStart..windowEnd hora local (FICHA §6.3). */
export function inWindow(c: { windowStart: number; windowEnd: number }, hour: number): boolean {
  if (c.windowStart <= c.windowEnd) return hour >= c.windowStart && hour < c.windowEnd;
  return hour >= c.windowStart || hour < c.windowEnd; // ventana que cruza medianoche
}

// ─── Auto-join (P6): cola de uniones a grupos ────────────────────

/** Extrae el id/slug de un grupo desde una URL de Facebook. Si no es URL de grupo, null (honestidad). */
export function normalizeGroupUrl(raw: string): { fbId: string; url: string } | null {
  const m = String(raw).trim().match(/(?:facebook\.com|fb\.com)\/groups\/([A-Za-z0-9._\-]+)/i);
  if (!m) return null;
  let fbId: string;
  try { fbId = decodeURIComponent(m[1]); } catch { fbId = m[1]; }
  if (!fbId || ['feed', 'discover', 'joins', 'member-requests', 'rejoin'].includes(fbId.toLowerCase())) return null;
  return { fbId, url: `https://www.facebook.com/groups/${fbId}/` };
}

/** Techo diario de uniones (más conservador que el de posts, FICHA §6.2-P6): <7d→2, <14d→4, resto→6. */
export function computeJoinCap(sessionAgeDays: number): number {
  if (sessionAgeDays < 7) return 2;
  if (sessionAgeDays < 14) return 4;
  return 6;
}

// ─── Spintax determinista (autoría propia; semilla job+grupo) ──────

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Expande {a|b|c} (sin anidamiento) eligiendo por semilla. Determinista por (jobId, targetName). */
export function spinDeterministic(text: string, seedKey: string): string {
  const rand = mulberry32(hashSeed(seedKey));
  return text.replace(/\{([^{}]+)\}/g, (_m, group: string) => {
    const options = group.split('|').map((s) => s.trim()).filter(Boolean);
    if (options.length === 0) return '';
    return options[Math.floor(rand() * options.length) % options.length];
  });
}

// ─── Variante IA graduada (FICHA §4): L1 base/spintax, L2/L3 reescritura ──

export async function generateVariant(
  baseText: string,
  seedKey: string,
  autonomy: string,
  brandContext: string | null,
  boldStyle: string | null = 'none',
): Promise<{ text: string; source: 'base' | 'spintax' | 'ai_rewrite' }> {
  const spinned = spinDeterministic(baseText, seedKey);
  if (autonomy === 'L1_ASSISTED') {
    return { text: boldStyle === 'unicode' ? applyUnicodeBold(spinned) : spinned, source: 'spintax' };
  }

  // L2/L3: reescritura IA del borrador YA aprobado, con voz de marca. Fallback honesto a spintax.
  try {
    const mod = await import('z-ai-web-dev-sdk');
    const zai = await (mod.default ?? mod).create();
    const system = [
      'Eres un community manager que adapta un post aprobado para un grupo de Facebook específico.',
      'Reglas duras: mantén el mensaje y los datos exactamente igual (no inventes cifras, fechas ni promesas).',
      'Cambia el gancho, el orden y las conectores para que el texto no parezca duplicado. Máximo 1-2 emojis o ninguno.',
      brandContext ? `Voz de la marca: ${brandContext}` : '',
      'Devuelve SOLO el texto final, sin comillas ni explicaciones.',
    ].filter(Boolean).join(' ');
    const completion = await Promise.race([
      zai.chat.completions.create({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: baseText },
        ],
      }),
      // Si la IA se cuelga, el claim del worker no puede quedar bloqueado: fallback a spintax.
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('IA no respondió en 25 s')), 25_000)),
    ]) as { choices?: Array<{ message?: { content?: string } }> };
    const out = completion?.choices?.[0]?.message?.content?.trim();
    if (out && out.length > 20 && out.length <= 6000) {
      return { text: boldStyle === 'unicode' ? applyUnicodeBold(out) : out, source: 'ai_rewrite' };
    }
    return { text: boldStyle === 'unicode' ? applyUnicodeBold(spinned) : spinned, source: 'spintax' };
  } catch {
    return { text: boldStyle === 'unicode' ? applyUnicodeBold(spinned) : spinned, source: 'spintax' };
  }
}

async function brandContextFor(brandId: string | null | undefined): Promise<string | null> {
  if (!brandId) return null;
  const brand = await db.brand.findUnique({ where: { id: brandId } });
  if (!brand) return null;
  const parts = [brand.identity, brand.tone, brand.vocabulary ? `vocabulario: ${brand.vocabulary}` : '', brand.forbiddenWords ? `prohibido usar: ${brand.forbiddenWords}` : '']
    .filter(Boolean);
  return parts.join(' · ') || null;
}

// ─── Leases: reclamo anti-doble-disparo (FICHA §5) ─────────────────

export interface ClaimableJob {
  id: string;
  targetKind: string;
  targetName: string;
  targetUrl: string;
  variant: string;
  variantSource: string;
  firstComment: string;
  commentDelaySec: number; // espera antes del bump-comment (0 = inmediato)
  mediaUrls: string[];
  engine: string;
  mode: string;
  pageName: string;
  campaignId: string;
  campaignName: string;
}

/**
 * Reclama jobs vencidos para un worker:
 * - campañas activas (QUEUED/RUNNING), ventana horaria ok, sin pausa defensiva vigente
 * - techo diario por worker con warmup (FbDailyUsage)
 * - lease de 10 minutos: si el worker muere, el job vuelve a QUEUED
 */
export async function claimJobsForWorker(
  worker: { id: string; sessionAgeDays: number },
  capacity = 1,
): Promise<{ jobs: ClaimableJob[]; cap: number; usedToday: number; pausedUntil: Date | null; pausedKind?: string; note?: string }> {
  const hold = await policyHold('FB_GROUP_POST');
  if (hold) {
    return { jobs: [], cap: 0, usedToday: 0, pausedUntil: null, note: hold };
  }
  const day = todayKey();
  const cap = computeCap(worker.sessionAgeDays);

  // Reaper de leases vencidos (FICHA §5): "si el worker muere, el job vuelve a
  // QUEUED"; al tercer intento sin reporte, fallo honesto con su motivo.
  const expiredJobs = await db.fbJob.findMany({ where: { status: 'LEASED', leaseUntil: { lt: new Date() } }, select: { id: true, attempts: true, targetName: true } });
  for (const ej of expiredJobs) {
    const fatal = ej.attempts >= 3;
    await db.fbJob.update({
      where: { id: ej.id },
      data: fatal
        ? { status: 'FAILED', failReason: 'Lease vencido 3 veces sin reporte del worker', leaseUntil: null }
        : { status: 'QUEUED', leaseUntil: null },
    });
    await audit('FB_JOB_LEASE_EXPIRED', 'FB_JOB', ej.id, fatal ? `Job de "${ej.targetName}" falló: lease vencido 3 veces sin reporte` : `Lease vencido de "${ej.targetName}" reencolado (el worker no reportó a tiempo)`);
  }

  const usage = await db.fbDailyUsage.upsert({
    where: { workerId_day: { workerId: worker.id, day } },
    create: { workerId: worker.id, day, posts: 0, cap },
    update: { cap },
  });

  const activeAlert = await db.fbAlert.findFirst({
    where: { workerId: worker.id, resolved: false, pausedUntil: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (activeAlert) {
    return { jobs: [], cap, usedToday: usage.posts, pausedUntil: activeAlert.pausedUntil, pausedKind: activeAlert.kind, note: `PAUSED_ANTI_BAN: ${activeAlert.message}` };
  }

  // El techo cuenta también los posts EN VUELO (leases sin reporte): dos
  // claims concurrentes no pueden superar el cap aunque el incremento del
  // contador ocurre al reportar (F-DATA-09).
  const inFlight = await db.fbJob.count({ where: { workerId: worker.id, status: 'LEASED' } });
  const remaining = Math.max(0, cap - usage.posts - inFlight);
  if (remaining === 0) {
    return { jobs: [], cap, usedToday: usage.posts, pausedUntil: null, note: 'Techo diario alcanzado (warmup)' };
  }

  const hour = hourInTz();
  const campaigns = await db.fbCampaign.findMany({
    where: { status: { in: ['QUEUED', 'RUNNING'] } },
    orderBy: { createdAt: 'asc' },
  });
  const inWindowCampaigns = campaigns.filter((c) => inWindow(c, hour));
  if (inWindowCampaigns.length === 0 && campaigns.length > 0) {
    return { jobs: [], cap, usedToday: usage.posts, pausedUntil: null, note: `Fuera de ventana horaria (hora local ${hour})` };
  }
  // Corte nocturno 22:00-07:00 (FICHA §6.3): solo vuela una campaña creada
  // explícitamente con nightOverride (forzado visible y auditado al crear).
  const isNight = hour >= 22 || hour < 7;
  const flyable = isNight ? inWindowCampaigns.filter((c) => c.nightOverride) : inWindowCampaigns;
  if (isNight && inWindowCampaigns.length > 0 && flyable.length === 0) {
    return { jobs: [], cap, usedToday: usage.posts, pausedUntil: null, note: `Corte nocturno 22:00-07:00 (hora local ${hour}): las campañas en ventana no llevan nightOverride` };
  }

  const leases: ClaimableJob[] = [];
  for (const campaign of flyable) {
    if (leases.length >= Math.min(capacity, remaining)) break;
    const brandCtx = await brandContextFor(campaign.brandId);
    const autonomy = await getAutonomy();
    const candidates = await db.fbJob.findMany({
      where: {
        campaignId: campaign.id,
        status: 'QUEUED',
        OR: [{ groupId: null }, { group: { excluded: false } }],
      },
      include: { group: true },
      orderBy: { createdAt: 'asc' },
      take: Math.min(capacity, remaining) - leases.length,
    });
    for (const job of candidates) {
      if (job.targetKind === 'group' && !job.group) continue;
      const until = new Date(Date.now() + 10 * 60 * 1000);
      // Reclamo ATÓMICO (F-DATA-01): la transición QUEUED→LEASED solo ocurre si
      // el job sigue QUEUED (updateMany condicional + count). Entre la lectura
      // y aquí puede pasar la IA de otro claim: quien pierde, no entrega.
      const claimed = await db.fbJob.updateMany({
        where: { id: job.id, status: 'QUEUED' },
        data: { status: 'LEASED', leaseUntil: until, attempts: { increment: 1 }, workerId: worker.id },
      });
      if (claimed.count === 0) continue; // otro worker lo ganó
      // La variante se genera DESPUÉS de ganar el lease (la ventana de carrera
      // ya está cerrada); el job queda LEASED aunque la IA tarde 25 s.
      const variant = await generateVariant(campaign.text, `${job.id}::${job.targetName}`, autonomy, brandCtx, campaign.boldStyle);
      // Adjuntos del job: copia de la campaña; con mediaMode=rotate, una imagen
      // distinta por grupo (rotación determinista por job, roadmap #3).
      let mediaUrls: string[] = [];
      try { const parsed = JSON.parse(job.mediaUrls ?? '[]'); if (Array.isArray(parsed)) mediaUrls = parsed.map(String).filter(Boolean); } catch { /* sin adjuntos */ }
      if (campaign.mediaMode === 'rotate' && mediaUrls.length > 1) {
        const picked = pickRotatedMedia(mediaUrls, job.id);
        mediaUrls = picked ? [picked] : [];
      }
      const updated = await db.fbJob.update({
        where: { id: job.id },
        data: { variant: variant.text, variantSource: variant.source },
      });
      await db.fbCampaign.update({ where: { id: campaign.id }, data: { status: 'RUNNING' } });
      await audit('FB_JOB_LEASED', 'FB_JOB', updated.id, `Worker reclama job para "${updated.targetName}" (variante ${updated.variantSource})`);
      leases.push({
        id: updated.id,
        targetKind: updated.targetKind,
        targetName: updated.targetName,
        targetUrl: updated.targetUrl,
        variant: updated.variant,
        variantSource: updated.variantSource,
        firstComment: campaign.firstComment,
        commentDelaySec: campaign.commentDelaySec,
        mediaUrls,
        engine: campaign.engine,
        mode: campaign.mode,
        pageName: campaign.pageName,
        campaignId: campaign.id,
        campaignName: campaign.name,
      });
    }
  }
  return { jobs: leases, cap, usedToday: usage.posts, pausedUntil: null };
}

async function getAutonomy(): Promise<string> {
  const s = await db.setting.findUnique({ where: { key: 'autonomy_mode' } });
  return s?.value ?? 'L2_SUPERVISED';
}

async function audit(action: string, targetType: string, targetId: string, reason: string) {
  await db.auditEntry.create({ data: { actor: 'system', action, targetType, targetId, allowed: true, reason } });
}

/** Alertas anti-ban compartidas por jobs y joins: crea FbAlert y pausa al worker si corresponde. */
async function applyAlerts(workerId: string, alerts: WorkerAlert[]) {
  for (const a of alerts) {
    const pausedUntil = a.pauseHours && a.pauseHours > 0 ? new Date(Date.now() + a.pauseHours * 3600 * 1000) : null;
    await db.fbAlert.create({ data: { workerId, kind: a.kind, message: a.message, pausedUntil } });
    if (pausedUntil) {
      await db.fbWorker.update({ where: { id: workerId }, data: { status: a.kind === 'CHALLENGE' ? 'CHALLENGE_DETECTED' : 'PAUSED_ANTI_BAN' } }).catch(() => undefined);
    }
    await audit(`FB_ALERT_${a.kind}`, 'FB_WORKER', workerId, a.message);
  }
}

// ─── Leases de unión (P6): mismo protocolo que los jobs ─────────

export interface ClaimableJoinTask {
  id: string;
  url: string;
  fbId: string;
  keyword: string;
}

/**
 * Reclama una tarea de unión para un worker:
 * - sin pausa defensiva vigente, techo diario de uniones con warmup propio
 * - lease de 15 min: si el worker muere, la tarea vuelve a PENDING (o FAILED a los 3 intentos)
 */
export async function claimJoinTaskForWorker(
  worker: { id: string; sessionAgeDays: number },
): Promise<{ task: ClaimableJoinTask | null; joinCap: number; joinsToday: number; pausedUntil: Date | null; pausedKind?: string; note?: string }> {
  const hold = await policyHold('FB_JOIN_GROUP');
  if (hold) {
    return { task: null, joinCap: 0, joinsToday: 0, pausedUntil: null, note: hold };
  }
  const day = todayKey();
  const joinCap = computeJoinCap(worker.sessionAgeDays);
  const usage = await db.fbDailyUsage.upsert({
    where: { workerId_day: { workerId: worker.id, day } },
    create: { workerId: worker.id, day, posts: 0, cap: computeCap(worker.sessionAgeDays), joins: 0, joinCap },
    update: { joinCap },
  });

  const activeAlert = await db.fbAlert.findFirst({
    where: { workerId: worker.id, resolved: false, pausedUntil: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (activeAlert) {
    return { task: null, joinCap, joinsToday: usage.joins, pausedUntil: activeAlert.pausedUntil, pausedKind: activeAlert.kind, note: `PAUSED_ANTI_BAN: ${activeAlert.message}` };
  }

  // Leases vencidos: reencolar; a los 3 intentos sin reporte, fallo honesto.
  const expired = await db.fbJoinTask.findMany({ where: { status: 'LEASED', leaseUntil: { lt: new Date() } } });
  for (const t of expired) {
    await db.fbJoinTask.update({
      where: { id: t.id },
      data: t.attempts >= 3
        ? { status: 'FAILED', failReason: 'Lease vencido 3 veces sin reporte del worker', leaseUntil: null }
        : { status: 'PENDING', leaseUntil: null },
    });
  }

  // El techo cuenta también las uniones EN VUELO (leases sin reporte aún).
  const joinsInFlight = await db.fbJoinTask.count({ where: { workerId: worker.id, status: 'LEASED' } });
  if (usage.joins + joinsInFlight >= joinCap) {
    return { task: null, joinCap, joinsToday: usage.joins, pausedUntil: null, note: 'Techo diario de uniones alcanzado (warmup)' };
  }

  const candidate = await db.fbJoinTask.findFirst({
    where: { status: 'PENDING', OR: [{ workerId: null }, { workerId: worker.id }] },
    orderBy: { createdAt: 'asc' },
  });
  if (!candidate) return { task: null, joinCap, joinsToday: usage.joins, pausedUntil: null };

  const until = new Date(Date.now() + 15 * 60 * 1000);
  // Reclamo ATÓMICO (F-DATA-04): misma protección que los jobs de publicación.
  const claimedJoin = await db.fbJoinTask.updateMany({
    where: { id: candidate.id, status: 'PENDING' },
    data: { status: 'LEASED', leaseUntil: until, attempts: { increment: 1 }, workerId: worker.id },
  });
  if (claimedJoin.count === 0) return { task: null, joinCap, joinsToday: usage.joins, pausedUntil: null };
  const updated = await db.fbJoinTask.findUnique({ where: { id: candidate.id } });
  if (!updated) return { task: null, joinCap, joinsToday: usage.joins, pausedUntil: null };
  await audit('FB_JOIN_LEASED', 'FB_JOIN_TASK', updated.id, `Worker reclama unión a ${updated.url}${updated.keyword ? ` (keyword: ${updated.keyword})` : ''}`);
  return { task: { id: updated.id, url: updated.url, fbId: updated.fbId, keyword: updated.keyword }, joinCap, joinsToday: usage.joins, pausedUntil: null };
}

export interface JoinReportInput {
  taskId: string;
  status: 'JOINED' | 'REQUESTED' | 'SKIPPED' | 'FAILED';
  failReason?: string;
}

/**
 * Aplica el reporte de uniones del worker (FICHA §7 aplicado a joins):
 * - JOINED → el grupo entra (o vuelve) a la colección auto-join y queda en rotación
 * - REQUESTED → visible esperando al admin; no se cuenta como unión consumada
 * - SKIPPED (ya miembro) no consume techo; JOINED/REQUESTED/FAILED sí (hubo acción real)
 */
export async function applyJoinReport(
  workerId: string,
  reports: JoinReportInput[],
  alerts: WorkerAlert[] = [],
): Promise<{ applied: number; joined: number; groupsCreated: number }> {
  let applied = 0;
  let joined = 0;
  let groupsCreated = 0;
  for (const r of reports) {
    const status = ['JOINED', 'REQUESTED', 'SKIPPED', 'FAILED'].includes(r.status) ? r.status : 'FAILED';
    // Guard de transición (F-DATA-02 aplicado a joins): solo una tarea LEASED
    // acepta reporte; los reintentos duplicados del worker no re-consumen el
    // techo ni duplican la auditoría.
    const updatedTask = await db.fbJoinTask.updateMany({
      where: { id: String(r.taskId), workerId, status: 'LEASED' },
      data: {
        status,
        failReason: r.failReason ?? '',
        joinedAt: status === 'JOINED' ? new Date() : undefined,
        leaseUntil: null,
      },
    });
    if (updatedTask.count === 0) {
      const existing = await db.fbJoinTask.findFirst({ where: { id: String(r.taskId), workerId }, select: { id: true, status: true, url: true } });
      if (existing) {
        await audit('FB_JOIN_REPORT_IGNORED', 'FB_JOIN_TASK', existing.id, `Reporte ${r.status} ignorado: tarea en "${existing.status}" (fuera de lease)`);
      }
      continue;
    }
    const updated = await db.fbJoinTask.findUnique({ where: { id: String(r.taskId) } });
    if (!updated) continue;
    applied += 1;
    if (status !== 'SKIPPED') {
      const day = todayKey();
      const usage = await db.fbDailyUsage.upsert({
        where: { workerId_day: { workerId, day } },
        create: { workerId, day, posts: 0, cap: 5, joins: 1, joinCap: 6 },
        update: { joins: { increment: 1 } },
      });
      await audit(`FB_JOIN_${status}`, 'FB_JOIN_TASK', updated.id, `Unión a ${updated.url}: ${r.failReason ?? status} · uniones hoy ${usage.joins}`);
    } else {
      await audit(`FB_JOIN_${status}`, 'FB_JOIN_TASK', updated.id, `Unión a ${updated.url}: ${r.failReason ?? status}`);
    }
    if (status === 'JOINED') {
      joined += 1;
      const existing = await db.fbGroup.findUnique({ where: { fbId: updated.fbId } });
      if (!existing) {
        await db.fbGroup.create({
          data: { fbId: updated.fbId, name: updated.fbId, url: updated.url, collection: updated.keyword ? `auto-join:${updated.keyword}` : 'auto-join' },
        });
        groupsCreated += 1;
      }
      // Si el grupo ya existía se respeta su rotación actual (no se re-activa a la fuerza).
    }
    if (status === 'REQUESTED') {
      const existing = await db.fbGroup.findUnique({ where: { fbId: updated.fbId } });
      if (!existing) {
        await db.fbGroup.create({
          data: { fbId: updated.fbId, name: updated.fbId, url: updated.url, collection: updated.keyword ? `auto-join:${updated.keyword}` : 'auto-join', excluded: true },
        });
        groupsCreated += 1;
      }
    }
  }
  await applyAlerts(workerId, alerts);
  return { applied, joined, groupsCreated };
}

// ─── Reporte del worker (FICHA §7: sin URL no hay éxito) ───────────

export interface WorkerResult {
  jobId: string;
  status: 'POSTED' | 'FAILED' | 'PENDING_REVIEW' | 'SKIPPED';
  postUrl?: string;
  failReason?: string;
}

export interface WorkerAlert {
  kind: 'CHALLENGE' | 'WARNING' | 'BLOCKED_GROUP' | 'INFO';
  message: string;
  pauseHours?: number;
}

export async function applyWorkerReport(
  workerId: string,
  results: WorkerResult[],
  alerts: WorkerAlert[] = [],
): Promise<{ applied: number; done: number }> {
  let applied = 0;
  for (const r of results) {
    let status = ['POSTED', 'FAILED', 'PENDING_REVIEW', 'SKIPPED'].includes(r.status) ? r.status : 'FAILED';
    let postUrl = (r.postUrl ?? '').trim();
    let failReason = r.failReason ?? '';
    // Honestidad FICHA §7: sin URL viva no hay éxito. Un POSTED sin URL se
    // degrada a FAILED con su motivo exacto.
    if (status === 'POSTED' && !postUrl) {
      status = 'FAILED';
      failReason = 'POSTED sin URL: rechazado por honestidad (FICHA §7: sin URL viva no hay éxito)';
      postUrl = '';
    }
    // Guard de transición (F-DATA-02): solo un job LEASED acepta reporte.
    // Un reintento duplicado (timeout de red) ya NO re-consume el techo diario
    // ni sobrescribe el estado terminal de un job publicado.
    const claimedReport = await db.fbJob.updateMany({
      where: { id: String(r.jobId), workerId, status: 'LEASED' },
      data: {
        status,
        postUrl,
        failReason,
        postedAt: status === 'POSTED' ? new Date() : undefined,
        leaseUntil: null,
      },
    });
    if (claimedReport.count === 0) {
      const existing = await db.fbJob.findFirst({ where: { id: String(r.jobId), workerId }, select: { id: true, status: true, targetName: true } });
      if (existing) {
        await audit('FB_JOB_REPORT_IGNORED', 'FB_JOB', existing.id, `Reporte ${r.status} ignorado: job en "${existing.status}" (fuera de lease; reintento o cancelación previa)`);
      }
      continue;
    }
    const updated = await db.fbJob.findUnique({ where: { id: String(r.jobId) } });
    if (!updated) continue;
    applied += 1;
    if (status === 'POSTED') {
      const day = todayKey();
      const usage = await db.fbDailyUsage.upsert({
        where: { workerId_day: { workerId, day } },
        create: { workerId, day, posts: 1, cap: 5 },
        update: { posts: { increment: 1 } },
      });
      if (updated.groupId) {
        await db.fbGroup.update({ where: { id: updated.groupId }, data: { lastPostedAt: new Date() } });
      }
      await audit('FB_JOB_POSTED', 'FB_JOB', updated.id, `Publicado en "${updated.targetName}"${updated.postUrl ? ` · ${updated.postUrl}` : ''} · uso diario ${usage.posts}`);
    } else {
      // NOTA: el reporte FAILED ya no toca `excluded` del grupo (F-DATA-06):
      // la exclusión de rotación es decisión humana auditada; el fallo de un
      // job nunca re-incluye un grupo excluido ni modifica la rotación.
      await audit(`FB_JOB_${status}`, 'FB_JOB', updated.id, `Job para "${updated.targetName}": ${failReason || status}`);
    }
  }

  for (const a of alerts) {
    await applyAlerts(workerId, [a]);
  }

  // Campañas terminadas: cuando todos sus jobs están en estado terminal
  const campaigns = await db.fbCampaign.findMany({ where: { status: 'RUNNING' } });
  let done = 0;
  for (const c of campaigns) {
    const pending = await db.fbJob.count({ where: { campaignId: c.id, status: { in: ['QUEUED', 'LEASED'] } } });
    if (pending === 0) {
      const review = await db.fbJob.count({ where: { campaignId: c.id, status: 'PENDING_REVIEW' } });
      await db.fbCampaign.update({ where: { id: c.id }, data: { status: 'DONE' } });
      await audit('FB_CAMPAIGN_DONE', 'FB_CAMPAIGN', c.id, `Campaña "${c.name}" terminada${review > 0 ? ` (${review} job(s) quedaron PENDING_REVIEW: publicados y a espera de aprobación del admin del grupo)` : ''}`);
      done += 1;
    }
  }
  return { applied, done };
}
