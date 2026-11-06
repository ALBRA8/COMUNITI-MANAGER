import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createTask } from '@/lib/orchestrator';
import { executeContract } from '@/lib/executor';
import { NETWORKS, type Network } from '@/lib/contracts';
import { guardPanel } from '@/lib/panel-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Investigación de mercado: guarda evidencias reales o declara sin evidencia
export async function POST(req: NextRequest) {
  const denied = guardPanel(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const { brandId, topic, competitorHandle, network } = body;
  if (!brandId || (!topic && !competitorHandle)) {
    return NextResponse.json({ error: 'brandId y (topic | competitorHandle) requeridos' }, { status: 400 });
  }

  const contract = competitorHandle ? 'analyze_competitor' : 'research_topic';
  const payload = competitorHandle
    ? { handle: competitorHandle, network: network ?? 'instagram' }
    : { topic };

  const task = await createTask(brandId, contract.toUpperCase(), 'RESEARCH', competitorHandle ? 'researcher' : 'researcher', payload);
  // F6-DATA-01: la ejecución inline SOLO procede si esta request gana el CAS
  // PENDING→RUNNING. Sin esto, la tarea quedaba PENDING+due mientras se
  // ejecutaba aquí y el sweep del scheduler podía re-ejecutarla (Evidence
  // duplicada). Si el sweep la gana, se le cede la ejecución.
  const claimed = await db.task.updateMany({ where: { id: task.id, status: 'PENDING' }, data: { status: 'RUNNING', attempts: { increment: 1 } } });
  if (claimed.count === 0) {
    return NextResponse.json({ taskId: task.id, outcome: 'ERROR', reason: 'La tarea fue reclamada por el reintento del scheduler; revisa su resultado en el historial' }, { status: 409 });
  }
  // F5-DATA-01: si el proceso muere a mitad del request, la tarea queda
  // RUNNING y recoverInterrupted (al siguiente ciclo) la devuelve a PENDING
  // con nextRetryAt due — el sweep la despacha. Nunca zombie.
  try {
    const res = await executeContract(contract, payload, { agent: 'researcher', brandId, taskId: task.id });

    let evidenceId: string | null = null;
    if (res.outcome === 'OK' && res.evidence) {
      const ev = await db.evidence.create({
        data: {
          brandId,
          source: res.evidence.source,
          url: res.evidence.url ?? '',
          claim: competitorHandle ? `Análisis de competidor ${competitorHandle}` : `Investigación: ${topic}`,
          payloadJson: JSON.stringify(res.evidence.payload).slice(0, 8000),
        },
      });
      evidenceId = ev.id;
    }

    const output = {
      outcome: res.outcome,
      data: res.data ?? null,
      reason: res.reason,
      dataState: res.outcome === 'OK' ? 'VERIFICADO' : res.outcome === 'CAPACITY_UNAVAILABLE' ? 'PENDIENTE_CREDENCIALES' : 'ERROR',
    };
    await db.task.update({ where: { id: task.id }, data: { status: res.outcome === 'OK' ? 'COMPLETED' : 'FAILED', outputJson: JSON.stringify(output), errorDetail: res.reason ?? '' } });
    return NextResponse.json({ taskId: task.id, evidenceId, ...output });
  } catch (e) {
    await db.task.update({ where: { id: task.id }, data: { status: 'FAILED', errorDetail: `Fallo ejecutando/escribiendo la investigación: ${(e as Error).message.slice(0, 180)}` } }).catch(() => undefined);
    throw e;
  }
}

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get('brandId');
  const evidences = await db.evidence.findMany({
    where: brandId ? { brandId } : undefined,
    orderBy: { capturedAt: 'desc' },
    take: 50,
  });
  return NextResponse.json(evidences);
}
