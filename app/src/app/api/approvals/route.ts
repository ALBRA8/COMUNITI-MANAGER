import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { guardPanel } from '@/lib/panel-auth';

export const dynamic = 'force-dynamic';

// Cola de aprobaciones
export async function GET() {
  const approvals = await db.approval.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  return NextResponse.json(approvals);
}

// Decidir una aprobación (HITL)
export async function POST(req: NextRequest) {
  const denied = guardPanel(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const { id, decision, reason } = body;
  if (!id || !['APPROVED', 'REJECTED'].includes(decision)) {
    return NextResponse.json({ error: 'id y decision (APPROVED|REJECTED) requeridos' }, { status: 400 });
  }
  // CAS (F5-API-03): solo una decisión PENDING→terminal gana; re-decidir una
  // cerrada devuelve 409 y ya no re-aplica efectos laterales (p.ej. un REJECTED
  // tardío no puede pisar un draft ya PUBLISHED por la aprobación original).
  const decided = await db.approval.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: decision, decidedBy: 'human', reason: reason ?? '', decidedAt: new Date() },
  });
  if (decided.count === 0) {
    const exists = await db.approval.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!exists) return NextResponse.json({ error: 'Aprobación no encontrada' }, { status: 404 });
    return NextResponse.json({ error: `La aprobación ya fue decidida (estado: ${exists.status})` }, { status: 409 });
  }
  const approval = await db.approval.findUnique({ where: { id } });
  if (!approval) return NextResponse.json({ error: 'Aprobación no encontrada' }, { status: 404 });
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
  // F-ARC-04: cerrar el bucle HITL de RESPUESTAS a comentarios. Antes la
  // decisión se guardaba y nadie la consumía: la respuesta quedaba en limbo.
  if (approval.targetType === 'REPLY') {
    if (decision === 'APPROVED') {
      const comment = await db.comment.findUnique({ where: { id: approval.targetId } });
      if (comment && comment.status !== 'REPLIED') {
        await db.comment.update({
          where: { id: comment.id },
          data: { status: 'REPLIED', replyText: comment.replyText ?? comment.suggestedReply, repliedAt: new Date() },
        });
        await db.auditEntry.create({ data: { actor: 'human', action: 'REPLY_COMMENT', targetType: 'Comment', targetId: comment.id, allowed: true, reason: `Respuesta aplicada tras aprobar la solicitud ${approval.id} (envío externo requiere conector de red)` } });
      }
    }
    // REJECTED: la respuesta no se aplica; la interacción queda como esté y el
    // rechazo ya quedó auditado arriba (APPROVAL_REJECTED).
  }
  return NextResponse.json(approval);
}
