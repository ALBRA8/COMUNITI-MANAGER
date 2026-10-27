import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Cola de aprobaciones
export async function GET() {
  const approvals = await db.approval.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  return NextResponse.json(approvals);
}

// Decidir una aprobación (HITL)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { id, decision, reason } = body;
  if (!id || !['APPROVED', 'REJECTED'].includes(decision)) {
    return NextResponse.json({ error: 'id y decision (APPROVED|REJECTED) requeridos' }, { status: 400 });
  }
  const approval = await db.approval.update({
    where: { id },
    data: { status: decision, decidedBy: 'human', reason: reason ?? '', decidedAt: new Date() },
  });
  await db.auditEntry.create({
    data: {
      actor: 'human',
      action: `APPROVAL_${decision}`,
      targetType: approval.targetType,
      targetId: approval.targetId,
      allowed: decision === 'APPROVED',
      reason: reason || 'Decisión del operador',
    },
  });
  // Si es un draft aprobado → marcarlo para publicación
  if (decision === 'APPROVED' && approval.targetType === 'PUBLICATION') {
    await db.contentDraft.update({ where: { id: approval.targetId }, data: { status: 'APPROVED' } }).catch(() => {});
  }
  if (decision === 'REJECTED' && approval.targetType === 'PUBLICATION') {
    await db.contentDraft.update({ where: { id: approval.targetId }, data: { status: 'REJECTED' } }).catch(() => {});
  }
  return NextResponse.json(approval);
}
