import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { loadBrandMemory, classifyByRules, canAutoReply, findFaqAnswer } from '@/lib/brand-memory';
import { getAutonomyMode } from '@/lib/orchestrator';

export const dynamic = 'force-dynamic';

// Bandeja de comentarios y mensajes
export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get('brandId');
  const comments = await db.comment.findMany({
    where: brandId ? { brandId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 60,
  });
  return NextResponse.json(comments);
}

// Añadir interacción (manual o webhook previo) y clasificarla
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { brandId, network, author, text, kind } = body;
  if (!brandId || !text) return NextResponse.json({ error: 'brandId y text requeridos' }, { status: 400 });

  const memory = await loadBrandMemory(brandId);
  if (!memory) return NextResponse.json({ error: 'Marca no encontrada' }, { status: 404 });

  const cls = classifyByRules(text);
  const mode = await getAutonomyMode();

  // FAQ con respuesta autorizada desde memoria de marca
  let suggestedReply = '';
  if (cls.classification === 'FAQ' || cls.classification === 'PRODUCT_INQUIRY') {
    suggestedReply = findFaqAnswer(memory, text) ?? '';
  }

  const auto = canAutoReply(cls.classification, cls.risk, memory, mode);

  const comment = await db.comment.create({
    data: {
      brandId,
      network: network ?? 'instagram',
      externalId: body.externalId ?? crypto.randomUUID(), // idempotencia por evento externo; manual → id único
      author: author ?? 'usuario',
      text,
      kind: kind ?? 'COMMENT',
      classification: cls.classification,
      sentiment: cls.sentiment,
      risk: cls.risk,
      status: 'CLASSIFIED',
      suggestedReply,
    },
  });
  return NextResponse.json({ ...comment, autoReplyAllowed: auto.allowed, autoReplyReason: auto.reason });
}

// Responder o derivar
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { id, action, replyText } = body;
  const comment = await db.comment.findUnique({ where: { id } });
  if (!comment) return NextResponse.json({ error: 'Interacción no encontrada' }, { status: 404 });

  const memory = await loadBrandMemory(comment.brandId)!;
  const mode = await getAutonomyMode();
  const auto = canAutoReply(comment.classification, comment.risk, memory!, mode);

  if (action === 'reply') {
    // Firewall: en L1/L2 la respuesta externa requiere aprobación previa
    if (!auto.allowed && comment.risk !== 'LOW') {
      // Crear aprobación para la respuesta
      const approval = await db.approval.create({
        data: {
          brandId: comment.brandId,
          targetType: 'REPLY',
          targetId: comment.id,
          summary: `Responder ${comment.classification} en ${comment.network}: "${replyText?.slice(0, 80) ?? ''}"`,
          risk: 'MEDIUM',
          requestedBy: 'agent:community',
        },
      });
      return NextResponse.json({ ok: false, requiresApproval: true, approvalId: approval.id, reason: auto.reason });
    }
    // Idempotencia: no responder dos veces
    if (comment.status === 'REPLIED') {
      return NextResponse.json({ ok: false, reason: 'Ya respondida (idempotencia anti-duplicado)' }, { status: 409 });
    }
    const updated = await db.comment.update({
      where: { id },
      data: { status: 'REPLIED', replyText: replyText ?? comment.suggestedReply, repliedAt: new Date() },
    });
    await db.auditEntry.create({
      data: { actor: 'human', action: 'REPLY_COMMENT', targetType: 'Comment', targetId: id, allowed: true, reason: 'Respuesta enviada (simulada local: conector de red no configurado)' },
    });
    return NextResponse.json({ ok: true, comment: updated, note: 'Respuesta registrada. Envío externo requiere conector de publicación conectado.' });
  }

  if (action === 'escalate') {
    const updated = await db.comment.update({
      where: { id },
      data: { status: 'ESCALATED' },
    });
    await db.auditEntry.create({
      data: { actor: 'human', action: 'ESCALATE_COMMENT', targetType: 'Comment', targetId: id, allowed: true, reason: 'Derivación a humano' },
    });
    return NextResponse.json({ ok: true, comment: updated });
  }

  if (action === 'moderate') {
    const updated = await db.comment.update({
      where: { id },
      data: { status: 'MODERATED' },
    });
    await db.auditEntry.create({
      data: { actor: 'human', action: 'MODERATE_ITEM', targetType: 'Comment', targetId: id, allowed: true, reason: 'Moderación aplicada' },
    });
    return NextResponse.json({ ok: true, comment: updated });
  }

  return NextResponse.json({ error: 'Acción no reconocida (reply|escalate|moderate)' }, { status: 400 });
}
