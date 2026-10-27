import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyWorkerRequest, claimJobsForWorker } from '@/lib/fb-groups';

export const dynamic = 'force-dynamic';

// El worker TIRA de jobs aquí (funciona detrás del NAT de una PC doméstica).
// Exige HMAC-SHA256 con el secreto del worker (x-fb-signature) y entrega leases de 10 min.
export async function POST(req: NextRequest) {
  const verification = await verifyWorkerRequest(req);
  if ('error' in verification) return NextResponse.json({ error: verification.error }, { status: 401 });

  const capacity = Math.min(5, Math.max(1, Number(verification.body.capacity ?? 1)));
  const result = await claimJobsForWorker(verification.worker, capacity);

  // Estado honesto: la pausa defensiva no se pisa con IDLE y respeta el tipo de alerta.
  const paused = Boolean(result.pausedUntil) || /PAUSED_ANTI_BAN/.test(result.note ?? '');
  const pausedStatus = result.pausedKind === 'CHALLENGE' ? 'CHALLENGE_DETECTED' : 'PAUSED_ANTI_BAN';
  await db.fbWorker.update({
    where: { id: verification.worker.id },
    data: {
      lastSeenAt: new Date(),
      status: paused ? pausedStatus : result.jobs.length > 0 ? 'RUNNING' : 'IDLE',
    },
  }).catch(() => undefined);

  return NextResponse.json(result);
}
