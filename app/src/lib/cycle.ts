// Ciclo autónomo completo (PRD §7): encadena las 12 fases como tareas
// persistentes y las ejecuta en orden, respetando pausa y aprobaciones.

import { db } from '@/lib/db';
import { createTask, runTask, recoverInterrupted, isPaused, getAutonomyMode } from '@/lib/orchestrator';
import { PHASE_AGENT } from '@/lib/orchestrator-cycle-map';
import type { CyclePhase } from '@/lib/contracts';

export interface CycleResult {
  cycleId: string;
  phases: { phase: CyclePhase; taskId: string; status: string; summary: string }[];
  stoppedAt?: string;
}

const PHASE_TYPE: Record<CyclePhase, string> = {
  RESEARCH: 'RESEARCH', ANALYZE: 'ANALYZE', PLAN: 'PLAN', CREATE: 'CREATE',
  VALIDATE: 'VALIDATE', APPROVE: 'APPROVE', PUBLISH: 'PUBLISH', VERIFY: 'VERIFY',
  ENGAGE: 'ENGAGE', MEASURE: 'MEASURE', LEARN: 'LEARN', OPTIMIZE: 'OPTIMIZE',
};

export async function runFullCycle(brandId: string, input: { topic?: string; objective?: string; networks?: string[]; draftId?: string } = {}): Promise<CycleResult> {
  // Recuperación ante fallos: retomar tareas huérfanas primero
  await recoverInterrupted();

  const cycleId = `cycle-${Date.now()}`;
  const phases: CycleResult['phases'] = [];
  let stoppedAt: string | undefined;

  const context: Record<string, unknown> = {
    topic: input.topic ?? 'mercado y audiencia de la marca',
    objective: input.objective ?? 'Crecer con contenido de valor',
    ...input,
  };

  let draftId = input.draftId;

  // Si se retoma con un borrador existente, el ciclo continúa en APPROVE
  // (idempotente: si ya fue aprobado, pasa directo a PUBLISH)
  const startIdx = draftId ? CYCLE_ORDER.indexOf('APPROVE') : 0;

  for (const phase of CYCLE_ORDER.slice(startIdx)) {
    if (await isPaused()) {
      stoppedAt = phase;
      break;
    }
    const task = await createTask(brandId, PHASE_TYPE[phase], phase, PHASE_AGENT[phase], {
      ...context,
      draftId,
    }, `${cycleId}:${phase}`);

    const result = await runTask(task.id);
    const output = (result.output ?? {}) as Record<string, unknown>;
    if (output.draftId) draftId = String(output.draftId);

    phases.push({
      phase,
      taskId: task.id,
      status: result.status,
      summary: summarize(phase, result.status, output, result.error),
    });

    if (result.status === 'WAITING_APPROVAL') {
      // El ciclo se detiene limpiamente hasta que el humano decida
      stoppedAt = `${phase} (esperando aprobación)`;
      break;
    }
  }

  return { cycleId, phases, stoppedAt };
}

const CYCLE_ORDER: CyclePhase[] = [
  'RESEARCH', 'ANALYZE', 'PLAN', 'CREATE', 'VALIDATE', 'APPROVE',
  'PUBLISH', 'VERIFY', 'ENGAGE', 'MEASURE', 'LEARN', 'OPTIMIZE',
];

function summarize(phase: CyclePhase, status: string, output: Record<string, unknown>, error?: string): string {
  if (status === 'FAILED') return error ?? 'Fallida';
  switch (phase) {
    case 'RESEARCH': return output.dataState === 'PENDIENTE_CREDENCIALES' ? 'Sin herramienta de investigación conectada (honesto)' : `Hallazgos: ${JSON.stringify(output.findings ?? 'sin evidencia').slice(0, 120)}`;
    case 'CREATE': return `Borrador ${output.draftId} validación: ${output.status}`;
    case 'VALIDATE': return `Veredicto del supervisor: ${output.verdict}${(output.issues as string[])?.length ? ` (${output.issues.length} incidencias)` : ''}`;
    case 'APPROVE': return output.status === 'WAITING_APPROVAL' ? 'En cola de aprobaciones' : String(output.status ?? '');
    case 'PUBLISH': return `${(output.publications as unknown[])?.length ?? 0} publicación(es) procesadas`;
    case 'VERIFY': return `${output.verified ?? 0} publicaciones verificadas`;
    case 'ENGAGE': return `${output.classified ?? 0} interacciones clasificadas`;
    default: return status === 'COMPLETED' ? 'Completada' : status;
  }
}

/** Retomar un ciclo detenido tras una aprobación. */
export async function resumeCycle(brandId: string, draftId: string): Promise<CycleResult> {
  return runFullCycle(brandId, { draftId });
}

export async function cycleStatus(brandId: string) {
  const tasks = await db.task.findMany({
    where: { brandId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { events: { orderBy: { createdAt: 'asc' } } },
  });
  const mode = await getAutonomyMode();
  const paused = await isPaused();
  return { tasks, mode, paused };
}
