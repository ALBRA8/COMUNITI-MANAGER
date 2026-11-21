import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyWebhookSignature } from '@/lib/webhook-security';

export const dynamic = 'force-dynamic';

// Reportes de ENTREGA del conector WhatsApp propio (mismo estándar HMAC de la
// malla de webhooks). El envío es asíncrono: la publicación queda PUBLISHING
// (en cola) y pasa a PUBLISHED SOLO con el reporte firmado DELIVERED que traiga
// waMessageId — sin evidencia no hay éxito (invariante de la casa). FAILED
// deja el motivo real en errorDetail.

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const check = verifyWebhookSignature(raw, {
    'x-harness-signature': req.headers.get('x-harness-signature'),
    authorization: req.headers.get('authorization'),
  }, process.env.HARNESS_WEBHOOK_SECRET);
  if (!check.ok) {
    return NextResponse.json({ error: `Reporte rechazado: ${check.reason}` }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try { body = JSON.parse(raw) as Record<string, unknown>; } catch { body = {}; }
  const jobId = typeof body.jobId === 'string' ? body.jobId.slice(0, 160) : '';
  const status = typeof body.status === 'string' ? body.status : '';
  const waMessageId = typeof body.waMessageId === 'string' ? body.waMessageId.slice(0, 120) : '';
  const failReason = typeof body.failReason === 'string' ? body.failReason.slice(0, 300) : '';
  const daemonName = typeof body.daemonName === 'string' && body.daemonName.trim()
    ? body.daemonName.trim().slice(0, 80)
    : 'wa-daemon';
  const chatId = typeof body.chatId === 'string' ? body.chatId.slice(0, 80) : '';

  if (!jobId || !['DELIVERED', 'FAILED'].includes(status)) {
    return NextResponse.json({ error: 'jobId y status (DELIVERED|FAILED) son obligatorios' }, { status: 400 });
  }
  if (status === 'DELIVERED' && !waMessageId) {
    return NextResponse.json({ error: 'DELIVERED exige waMessageId: sin evidencia no hay éxito' }, { status: 400 });
  }

  const pub = await db.publication.findFirst({ where: { externalId: jobId, status: 'PUBLISHING' } });
  if (!pub) {
    // Envío sin publicación en cola (p. ej. reencolado tras reinicio o prueba
    // del conector): se registra con honestidad, sin inventar estado.
    await db.auditEntry.create({
      data: {
        actor: `whatsapp-daemon:${daemonName}`,
        action: 'WHATSAPP_DELIVERY_REPORT',
        targetType: 'Publication',
        targetId: jobId,
        allowed: status === 'DELIVERED',
        reason: `Sin publicación en cola para jobId=${jobId}: reporte ${status}${chatId ? ` → ${chatId}` : ''}${waMessageId ? ` (${waMessageId})` : ''}${failReason ? ` — ${failReason}` : ''}`,
      },
    });
    return NextResponse.json({ ok: true, matched: false });
  }

  // Idempotencia: una entrega ya aplicada no se vuelve a aplicar.
  if (status === 'DELIVERED' && pub.status === 'PUBLISHED') {
    return NextResponse.json({ ok: true, matched: true, note: 'Entrega ya registrada (idempotente)' });
  }

  if (status === 'DELIVERED') {
    await db.publication.update({
      where: { id: pub.id },
      data: { status: 'PUBLISHED', publishedAt: new Date(), externalId: waMessageId },
    });
  } else {
    await db.publication.update({
      where: { id: pub.id },
      data: { status: 'FAILED', errorDetail: failReason || 'Entrega fallida en el conector WhatsApp' },
    });
  }

  await db.auditEntry.create({
    data: {
      actor: `whatsapp-daemon:${daemonName}`,
      action: 'WHATSAPP_DELIVERY_REPORT',
      targetType: 'Publication',
      targetId: pub.id,
      allowed: status === 'DELIVERED',
      reason: `${status}${chatId ? ` → ${chatId}` : ''}${waMessageId ? ` (${waMessageId})` : ''}${failReason ? ` — ${failReason}` : ''}`,
    },
  });

  return NextResponse.json({ ok: true, matched: true });
}
