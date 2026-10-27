// Orquestador central (PRD §4.A + §7): ciclo autónomo con estado persistente,
// reintentos con backoff, idempotencia, pausa global y trazabilidad completa.

import { db } from '@/lib/db';
import { executeContract } from '@/lib/executor';
import { agentByKey } from '@/lib/agents';
import { loadBrandMemory, validateContent, classifyByRules, withinAllowedHours } from '@/lib/brand-memory';
import { requiresApproval, riskOfAction, CYCLE_PHASES, type AgentKey, type CyclePhase, type TaskStatus } from '@/lib/contracts';
import { z } from 'zod';

const PHASE_AGENT: Record<CyclePhase, AgentKey> = {
  RESEARCH: 'researcher',
  ANALYZE: 'trends',
  PLAN: 'planner',
  CREATE: 'writer',
  VALIDATE: 'supervisor',
  APPROVE: 'planner',
  PUBLISH: 'publisher',
  VERIFY: 'publisher',
  ENGAGE: 'community',
  MEASURE: 'analyst',
  LEARN: 'optimizer',
  OPTIMIZE: 'strategy',
};

// ─── Utilidades de tareas ─────────────────────────────────────────

export async function createTask(brandId: string, type: string, phase: CyclePhase, agent: AgentKey, input: Record<string, unknown>, idempotencyKey?: string) {
  return db.task.create({
    data: {
      brandId, type, phase, agent,
      status: 'PENDING',
      inputJson: JSON.stringify(input),
      idempotencyKey,
    },
  });
}

export async function logEvent(taskId: string, phase: string, message: string, data?: unknown) {
  await db.taskEvent.create({
    data: { taskId, phase, message, dataJson: data ? JSON.stringify(data) : '{}' },
  });
}

async function setTask(taskId: string, status: TaskStatus, extra?: { output?: unknown; error?: string; nextRetryAt?: Date }) {
  await db.task.update({
    where: { id: taskId },
    data: {
      status,
      ...(extra?.output ? { outputJson: JSON.stringify(extra.output) } : {}),
      ...(extra?.error !== undefined ? { errorDetail: extra.error } : {}),
      ...(extra?.nextRetryAt ? { nextRetryAt: extra.nextRetryAt } : {}),
      updatedAt: new Date(),
    },
  });
}

/** ¿Pausa global activa? */
export async function isPaused(): Promise<boolean> {
  const s = await db.setting.findUnique({ where: { key: 'global_pause' } });
  return s?.value === 'true';
}

export async function setPaused(paused: boolean) {
  await db.setting.upsert({
    where: { key: 'global_pause' },
    create: { key: 'global_pause', value: paused ? 'true' : 'false' },
    update: { value: paused ? 'true' : 'false' },
  });
  await db.auditEntry.create({
    data: { actor: 'human', action: paused ? 'PAUSE_GLOBAL' : 'RESUME_GLOBAL', targetType: 'SYSTEM', allowed: true, reason: paused ? 'Pausa global activada por el operador' : 'Reanudación global' },
  });
}

export async function getAutonomyMode(): Promise<string> {
  const s = await db.setting.findUnique({ where: { key: 'autonomy_mode' } });
  return s?.value ?? 'L2_SUPERVISED';
}

// ─── Reanudación tras reinicio (recuperación ante fallos) ─────────

export async function recoverInterrupted() {
  const orphaned = await db.task.findMany({ where: { status: 'RUNNING' } });
  for (const t of orphaned) {
    // Tarea interrumpida por reinicio: reintentos idempotentes → PENDING; resto → revisión
    const canRetry = t.attempts < t.maxAttempts;
    await setTask(t.id, canRetry ? 'PENDING' : 'FAILED', {
      error: canRetry ? 'Interrumpida por reinicio; programada para reintento' : 'Interrumpida por reinicio; agotó reintentos',
    });
    await logEvent(t.id, t.phase, canRetry ? 'Tarea interrumpida → reintento' : 'Tarea interrumpida → fallida para revisión');
  }
}

// ─── Ejecución de una tarea del ciclo ─────────────────────────────

export async function runTask(taskId: string): Promise<{ status: TaskStatus; output?: unknown; error?: string }> {
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) return { status: 'FAILED', error: 'Tarea no encontrada' };
  if (await isPaused()) {
    await setTask(taskId, 'PAUSED', { error: 'Pausa global activa' });
    return { status: 'PAUSED', error: 'Pausa global activa' };
  }

  const agent = agentByKey(task.agent);
  if (!agent) return { status: 'FAILED', error: `Agente ${task.agent} no definido` };

  await setTask(taskId, 'RUNNING', { error: '' });
  await db.task.update({ where: { id: taskId }, data: { attempts: { increment: 1 } } });
  await logEvent(taskId, task.phase, `Ejecutando ${task.type} con agente ${agent.name}`);

  const input = JSON.parse(task.inputJson || '{}');
  const brandId = task.brandId;
  const memory = await loadBrandMemory(brandId);
  if (!memory) {
    await setTask(taskId, 'FAILED', { error: 'Marca no encontrada' });
    return { status: 'FAILED', error: 'Marca no encontrada' };
  }

  try {
    const output = await runPhase(taskId, task.type, task.phase as CyclePhase, memory, input, task.agent as AgentKey);
    // Fases que pueden requerir aprobación antes de completar
    if (output?.status === 'WAITING_APPROVAL') {
      await setTask(taskId, 'WAITING_APPROVAL', { output });
      await logEvent(taskId, task.phase, 'Esperando aprobación humana');
      return { status: 'WAITING_APPROVAL', output };
    }
    await setTask(taskId, 'COMPLETED', { output });
    await logEvent(taskId, task.phase, 'Completada', output);
    return { status: 'COMPLETED', output };
  } catch (e) {
    const err = (e as Error).message;
    const attempts = task.attempts + 1;
    if (attempts < task.maxAttempts && !err.startsWith('CAPACITY') && !err.startsWith('FIREWALL')) {
      const backoffMs = Math.min(2 ** attempts * 1000, 60000);
      await setTask(taskId, 'PENDING', { error: err, nextRetryAt: new Date(Date.now() + backoffMs) });
      await logEvent(taskId, task.phase, `Error con reintento en ${backoffMs / 1000}s: ${err}`);
      return { status: 'PENDING', error: err };
    }
    await setTask(taskId, 'FAILED', { error: err });
    await db.errorLog.create({
      data: {
        brandId,
        source: `task:${task.type}`,
        severity: 'ERROR',
        message: err,
        detailJson: JSON.stringify(input),
        recovery: 'Revisar el registro de herramientas; reintentar tras corregir la causa',
      },
    });
    await logEvent(taskId, task.phase, `Fallida: ${err}`);
    return { status: 'FAILED', error: err };
  }
}

// ─── Fases del ciclo: lógica real por fase ────────────────────────

async function runPhase(
  taskId: string,
  type: string,
  phase: CyclePhase,
  memory: NonNullable<Awaited<ReturnType<typeof loadBrandMemory>>>,
  input: Record<string, unknown>,
  agentKey: AgentKey
): Promise<{ status?: string; [k: string]: unknown }> {
  const mode = (await getAutonomyMode()) as 'L1_ASSISTED' | 'L2_SUPERVISED' | 'L3_AUTONOMOUS_LIMITED';

  switch (phase) {
    case 'RESEARCH': {
      const topic = String(input.topic ?? memory.name);
      const res = await executeContract('research_topic', { topic, brand: memory.name }, { agent: agentKey, brandId: memory.id, taskId });
      const findings = res.outcome === 'OK' ? res.data : null;
      if (findings) {
        await db.evidence.create({
          data: {
            brandId: memory.id,
            source: 'research',
            url: String((findings as { url?: string })?.url ?? ''),
            claim: `Investigación sobre ${topic}`,
            payloadJson: JSON.stringify(findings).slice(0, 5000),
          },
        });
      }
      return {
        topic,
        findings: res.outcome === 'OK' ? findings : null,
        dataState: res.outcome === 'OK' ? 'VERIFICADO' : res.outcome === 'CAPACITY_UNAVAILABLE' ? 'PENDIENTE_CREDENCIALES' : 'ERROR',
        reason: res.reason,
      };
    }

    case 'ANALYZE': {
      const evidences = await db.evidence.findMany({ where: { brandId: memory.id }, orderBy: { capturedAt: 'desc' }, take: 10 });
      return {
        analyzed: evidences.length,
        conclusions: evidences.map((e) => ({ claim: e.claim, source: e.source, date: e.capturedAt })),
        note: evidences.length === 0 ? 'Sin evidencias: concluye "sin datos verificados" (no se inventa)' : 'Análisis basado en evidencias registradas',
      };
    }

    case 'PLAN': {
      // Planificador: genera slots del calendario respetando límites
      const days = Number(input.days ?? 7);
      const perDay = Math.min(memory.maxPostsPerDay, 3);
      const accounts = await db.socialAccount.findMany({ where: { brandId: memory.id, status: { not: 'DISABLED' } } });
      const networks = accounts.length > 0 ? accounts.map((a) => a.network) : ['instagram'];
      const slots: { date: string; network: string; hour: number }[] = [];
      const [hStart, hEnd] = memory.allowedHours.split('-').map(Number);
      for (let d = 1; d <= days; d++) {
        for (let p = 0; p < perDay; p++) {
          const date = new Date();
          date.setDate(date.getDate() + d);
          date.setHours(hStart + p, 0, 0, 0);
          slots.push({ date: date.toISOString(), network: networks[p % networks.length], hour: date.getHours() });
        }
      }
      return { slots, networks, note: `Plan de ${days} días con ${slots.length} slots (límite ${memory.maxPostsPerDay}/día, horario ${memory.allowedHours})` };
    }

    case 'CREATE': {
      // Redacción con memoria de marca: LLM si disponible, plantilla si no
      const network = String(input.network ?? 'instagram');
      const objective = String(input.objective ?? 'Post de valor para la audiencia');
      const theme = String(input.theme ?? '');
      const text = await draftWithBrand(memory, network, objective, theme);
      const check = validateContent(memory, network as never, text);
      const draft = await db.contentDraft.create({
        data: {
          brandId: memory.id,
          objective,
          brief: `Redactado por ${agentByKey(agentKey)?.name} para ${network}`,
          status: check.ok ? 'IN_REVIEW' : 'DRAFT',
          theme,
          sourceTask: taskId,
          versions: {
            create: { network, text, specCheck: JSON.stringify(check) },
          },
        },
      });
      return {
        draftId: draft.id,
        network,
        text,
        validation: check,
        status: check.ok ? 'VALIDADO' : 'BLOQUEADO_POR_VALIDACION',
      };
    }

    case 'VALIDATE': {
      const draftId = String(input.draftId ?? '');
      const draft = await db.contentDraft.findUnique({ where: { id: draftId }, include: { versions: true } });
      if (!draft) throw new Error('Borrador no encontrado');
      const issues: string[] = [];
      for (const v of draft.versions) {
        const c = validateContent(memory, v.network as never, v.text);
        if (!c.ok) issues.push(...c.issues.map((i) => `${v.network}: ${i}`));
      }
      const verdict = issues.length === 0 ? 'PASSED' : 'BLOCKED';
      await db.auditEntry.create({
        data: { actor: 'agent:supervisor', action: 'validate_content', targetType: 'ContentDraft', targetId: draftId, allowed: verdict === 'PASSED', reason: issues.join('; ') || 'Sin incidencias' },
      });
      return { verdict, issues, draftId };
    }

    case 'APPROVE': {
      const draftId = String(input.draftId ?? '');
      // Idempotencia: ¿ya existe aprobación para este draft?
      const existing = await db.approval.findFirst({ where: { targetType: 'PUBLICATION', targetId: draftId, status: { in: ['PENDING', 'APPROVED'] } } });
      if (existing) return { approvalId: existing.id, status: existing.status, note: 'Aprobación ya existente (idempotente)' };
      const risk = riskOfAction('publish_post');
      const needs = requiresApproval(mode, risk);
      if (!needs) {
        return { status: 'AUTO_APPROVED', note: `Modo ${mode} con riesgo ${risk}: no requiere aprobación humana` };
      }
      const approval = await db.approval.create({
        data: {
          brandId: memory.id,
          targetType: 'PUBLICATION',
          targetId: draftId,
          summary: `Publicación de borrador ${draftId} en redes`,
          risk,
          status: 'PENDING',
          requestedBy: `agent:${agentKey}`,
        },
      });
      return { status: 'WAITING_APPROVAL', approvalId: approval.id };
    }

    case 'PUBLISH': {
      const draftId = String(input.draftId ?? '');
      const draft = await db.contentDraft.findUnique({ where: { id: draftId }, include: { versions: true, brand: true } });
      if (!draft) throw new Error('Borrador no encontrado');

      // Idempotencia: ¿ya hay publicación para este draft+network?
      const results = [];
      for (const v of draft.versions) {
        const idemKey = `${draft.id}:${v.network}:${v.id}`;
        const existing = await db.publication.findUnique({ where: { idempotencyKey: idemKey } });
        if (existing && ['PUBLISHED', 'SCHEDULED'].includes(existing.status)) {
          results.push({ network: v.network, status: existing.status, note: 'Ya publicado/programado — no se duplica' });
          continue;
        }
        // ¿Aprobado? (según modo)
        const risk = riskOfAction('publish_post');
        if (requiresApproval(mode, risk)) {
          const approval = await db.approval.findFirst({ where: { targetType: 'PUBLICATION', targetId: draftId, status: 'APPROVED' } });
          if (!approval) {
            results.push({ network: v.network, status: 'WAITING_APPROVAL', note: 'Requiere aprobación humana' });
            continue;
          }
        }
        // Horario permitido
        if (!withinAllowedHours(memory.allowedHours)) {
          results.push({ network: v.network, status: 'OUT_OF_HOURS', note: `Fuera del horario permitido (${memory.allowedHours})` });
          continue;
        }
        const pub = await db.publication.upsert({
          where: { idempotencyKey: idemKey },
          create: {
            brandId: memory.id, draftId: draft.id, network: v.network,
            status: 'PUBLISHING', idempotencyKey: idemKey,
          },
          update: { status: 'PUBLISHING' },
        });
        const res = await executeContract('publish_post', {
          network: v.network,
          text: v.text,
          media: JSON.parse(v.mediaJson || '[]'),
        }, { agent: 'publisher', brandId: memory.id, taskId, idempotencyKey: idemKey });

        if (res.outcome === 'OK') {
          const externalId = (res.data as { id?: string })?.id ?? null;
          await db.publication.update({ where: { id: pub.id }, data: { status: 'PUBLISHED', publishedAt: new Date(), externalId } });
          await db.contentDraft.update({ where: { id: draft.id }, data: { status: 'PUBLISHED' } });
          results.push({ network: v.network, status: 'PUBLISHED', externalId });
        } else if (res.outcome === 'CAPACITY_UNAVAILABLE') {
          await db.publication.update({ where: { id: pub.id }, data: { status: 'AWAITING_CONNECTOR', errorDetail: res.reason ?? '' } });
          results.push({ network: v.network, status: 'AWAITING_CONNECTOR', note: res.reason });
        } else {
          await db.publication.update({ where: { id: pub.id }, data: { status: 'FAILED', errorDetail: res.reason ?? '' } });
          results.push({ network: v.network, status: 'FAILED', note: res.reason });
        }
      }
      return { publications: results };
    }

    case 'VERIFY': {
      const pubs = await db.publication.findMany({ where: { brandId: memory.id, status: 'PUBLISHED', verifyStatus: 'UNVERIFIED' }, take: 20 });
      const out = [];
      for (const p of pubs) {
        const res = await executeContract('verify_publication', { network: p.network, externalId: p.externalId }, { agent: 'publisher', brandId: memory.id, taskId, idempotencyKey: `verify:${p.id}` });
        const status = res.outcome === 'OK' ? 'VERIFIED' : res.outcome === 'CAPACITY_UNAVAILABLE' ? 'UNVERIFIED' : 'UNVERIFIED';
        await db.publication.update({ where: { id: p.id }, data: { verifyStatus: status } });
        out.push({ publicationId: p.id, verifyStatus: status, note: res.reason ?? 'Verificado con conector' });
      }
      return { verified: out.length, details: out };
    }

    case 'ENGAGE': {
      const comments = await db.comment.findMany({ where: { brandId: memory.id, status: 'PENDING' }, take: 10 });
      const out = [];
      for (const c of comments) {
        const cls = classifyByRules(c.text);
        const updated = await db.comment.update({
          where: { id: c.id },
          data: { classification: cls.classification, sentiment: cls.sentiment, risk: cls.risk, status: 'CLASSIFIED' },
        });
        out.push({ id: c.id, classification: cls.classification, risk: cls.risk });
      }
      return { classified: out.length, details: out };
    }

    case 'MEASURE': {
      const res = await executeContract('fetch_metrics', { brand: memory.name }, { agent: 'analyst', brandId: memory.id, taskId });
      const pubs = await db.publication.findMany({ where: { brandId: memory.id, status: 'PUBLISHED' } });
      return {
        publicationsTracked: pubs.length,
        providerMetrics: res.outcome === 'OK' ? res.data : null,
        dataState: res.outcome === 'OK' ? 'VERIFICADO' : 'PENDIENTE_CREDENCIALES',
        reason: res.reason,
      };
    }

    case 'LEARN': {
      const concl = await db.experiment.findMany({ where: { brandId: memory.id, status: 'CONCLUDED' }, take: 5 });
      return {
        patterns: concl.map((c) => ({ hypothesis: c.hypothesis, conclusion: c.conclusion })),
        note: concl.length === 0 ? 'Sin experimentos concluidos aún: se recomienda iniciar uno' : 'Patrones aprendidos aplicables al siguiente ciclo',
      };
    }

    case 'OPTIMIZE': {
      const best = await db.metricSnapshot.findMany({ where: { brandId: memory.id }, orderBy: { date: 'desc' }, take: 5 });
      return {
        recommendation: best.length > 0
          ? 'Priorizar formatos con mayor engagement registrado; mantener frecuencia validada'
          : 'Iniciar con 1 publicación/día por red y registrar experimentos A/B desde el segundo ciclo',
        basedOn: best.length,
      };
    }

    default:
      throw new Error(`Fase ${phase} sin implementación`);
  }
}

// ─── Redacción con memoria de marca (LLM backend con fallback honesto) ──

async function draftWithBrand(memory: NonNullable<Awaited<ReturnType<typeof loadBrandMemory>>>, network: string, objective: string, theme: string): Promise<string> {
  try {
    const { default: ZAI } = await import('z-ai-web-dev-sdk');
    const zai = await ZAI.create();
    const agent = agentByKey('writer')!;
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: agent.systemPrompt },
        {
          role: 'user',
          content: JSON.stringify({
            marca: memory.name,
            identidad: memory.identity,
            tono: memory.tone,
            vocabulario_preferido: memory.vocabulary,
            palabras_prohibidas: memory.forbiddenWords,
            publico: memory.audience,
            objetivo: objective,
            tema: theme,
            red: network,
            ejemplos_aprobados: memory.approvedExamples.slice(0, 2),
            instrucciones: 'Devuelve SOLO el texto de la publicación para esa red, sin comillas ni explicaciones.',
          }),
        },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim();
    if (text) return text;
  } catch {
    // LLM no disponible → plantilla estructurada honesta (no se finge IA)
  }
  return `[Borrador plantilla — LLM no disponible] ${memory.name}: ${objective}${theme ? ` — ${theme}` : ''}. Texto alineado al tono "${memory.tone || 'por definir'}" para ${network}. Edita este borrador o configura el proveedor de IA para redacción automática.`;
}
