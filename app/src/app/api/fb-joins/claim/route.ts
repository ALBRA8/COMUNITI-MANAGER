import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyWorkerRequest, claimJoinTaskForWorker } from '@/lib/fb-groups';

export const dynamic = 'force-dynamic';

// El worker TIRA de tareas de unión aquí (P6, funciona detrás del NAT de una PC).
// Mismo protocolo que los jobs: HMAC-SHA256 (x-fb-signature) + lease de 15 min.
export async function POST(req: NextRequest) {
  const verification = await verifyWorkerRequest(req);
  if ('error' in verification) return NextResponse.json({ error: verification.error }, { status: 401 });

  const result = await claimJoinTaskForWorker(verification.worker);

  // Estado honesto: la pausa defensiva no se pisa; si ya está RUNNING por un job, no se baja.
  const paused = Boolean(result.pausedUntil) || /PAUSED_ANTI_BAN/.test(result.note ?? '');
  const pausedStatus = result.pausedKind === 'CHALLENGE' ? 'CHALLENGE_DETECTED' : 'PAUSED_ANTI_BAN';
  const current = await db.fbWorker.findUnique({ where: { id: verification.worker.id }, select: { status: true } });
  const nextStatus = paused ? pausedStatus : result.task ? 'RUNNING' : (current?.status === 'RUNNING' ? 'RUNNING' : 'IDLE');
  await db.fbWorker.update({
    where: { id: verification.worker.id },
    data: { lastSeenAt: new Date(), status: nextStatus },
  }).catch(() => undefined);

  return NextResponse.json(result);
}
