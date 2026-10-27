import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyWorkerRequest, applyWorkerReport } from '@/lib/fb-groups';

export const dynamic = 'force-dynamic';

// El worker EMPUJA reportes firmados aquí: resultado por job (URL viva o motivo
// exacto del fallo), alertas anti-ban y estado de sesión. Sin URL no hay éxito.
export async function POST(req: NextRequest) {
  const verification = await verifyWorkerRequest(req);
  if ('error' in verification) return NextResponse.json({ error: verification.error }, { status: 401 });

  const body = verification.body as {
    results?: Array<{ jobId?: string; status?: string; postUrl?: string; failReason?: string }>;
    alerts?: Array<{ kind?: string; message?: string; pauseHours?: number }>;
    sessionStatus?: string;
  };

  const results = (body.results ?? []).map((r) => ({
    jobId: String(r.jobId ?? ''),
    status: (r.status ?? 'FAILED') as 'POSTED' | 'FAILED' | 'PENDING_REVIEW' | 'SKIPPED',
    postUrl: r.postUrl ? String(r.postUrl) : undefined,
    failReason: r.failReason ? String(r.failReason) : undefined,
  })).filter((r) => r.jobId);

  const alerts = (body.alerts ?? []).map((a) => ({
    kind: (['CHALLENGE', 'WARNING', 'BLOCKED_GROUP', 'INFO'].includes(String(a.kind)) ? a.kind : 'INFO') as 'CHALLENGE' | 'WARNING' | 'BLOCKED_GROUP' | 'INFO',
    message: String(a.message ?? ''),
    pauseHours: Number(a.pauseHours ?? 0),
  }));

  const applied = await applyWorkerReport(verification.worker.id, results, alerts);

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
