import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyWorkerRequest, applyJoinReport } from '@/lib/fb-groups';

export const dynamic = 'force-dynamic';

// El worker EMPUJA reportes firmados de uniones (P6): JOINED | REQUESTED |
// SKIPPED (ya miembro) | FAILED con motivo exacto. Nunca se inventa una unión.
export async function POST(req: NextRequest) {
  const verification = await verifyWorkerRequest(req);
  if ('error' in verification) return NextResponse.json({ error: verification.error }, { status: 401 });

  const body = verification.body as {
    reports?: Array<{ taskId?: string; status?: string; failReason?: string }>;
    alerts?: Array<{ kind?: string; message?: string; pauseHours?: number }>;
    sessionStatus?: string;
  };

  const reports = (body.reports ?? []).map((r) => ({
    taskId: String(r.taskId ?? ''),
    status: (r.status ?? 'FAILED') as 'JOINED' | 'REQUESTED' | 'SKIPPED' | 'FAILED',
    failReason: r.failReason ? String(r.failReason) : undefined,
  })).filter((r) => r.taskId);

  const alerts = (body.alerts ?? []).map((a) => ({
    kind: (['CHALLENGE', 'WARNING', 'BLOCKED_GROUP', 'INFO'].includes(String(a.kind)) ? a.kind : 'INFO') as 'CHALLENGE' | 'WARNING' | 'BLOCKED_GROUP' | 'INFO',
    message: String(a.message ?? ''),
    pauseHours: Number(a.pauseHours ?? 0),
  }));

  const applied = await applyJoinReport(verification.worker.id, reports, alerts);

  if (typeof body.sessionStatus === 'string') {
    const allowed = ['OFFLINE', 'IDLE', 'RUNNING', 'AWAITING_SESSION', 'PAUSED_ANTI_BAN', 'CHALLENGE_DETECTED'];
    const anyPause = await db.fbAlert.findFirst({ where: { workerId: verification.worker.id, resolved: false, pausedUntil: { gt: new Date() } } });
    await db.fbWorker.update({
      where: { id: verification.worker.id },
      data: { lastSeenAt: new Date(), status: anyPause ? anyPause.kind === 'CHALLENGE' ? 'CHALLENGE_DETECTED' : 'PAUSED_ANTI_BAN' : (allowed.includes(body.sessionStatus) ? body.sessionStatus : 'IDLE') },
    }).catch(() => undefined);
  }

  return NextResponse.json({ ok: true, ...applied });
}
