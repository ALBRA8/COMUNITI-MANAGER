import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyWebhookSignature } from '@/lib/webhook-security';

export const dynamic = 'force-dynamic';

// Webhooks entrantes: CRM, Leads, Chismoso, Postgale, WhatsPower.
// Seguridad: si HARNESS_WEBHOOK_SECRET está configurado se exige firma
// HMAC-SHA256 (x-harness-signature: sha256=<hex> del cuerpo crudo) o Bearer.
export async function POST(req: NextRequest, { params }: { params: Promise<{ source: string }> }) {
  const { source } = await params;
  const raw = await req.text();
  const secret = process.env.HARNESS_WEBHOOK_SECRET;

  const check = verifyWebhookSignature(raw, {
    'x-harness-signature': req.headers.get('x-harness-signature'),
    authorization: req.headers.get('authorization'),
  }, secret);

  if (!check.ok) {
    await db.errorLog.create({
      data: { source: `webhook:${source}`, severity: 'WARNING', message: `Webhook rechazado: ${check.reason}`, detailJson: raw.slice(0, 500) },
    });
    return NextResponse.json({ error: 'Firma inválida' }, { status: 401 });
  }

  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(raw); } catch { /* evento no-JSON */ }

  if (source === 'leads' || source === 'chismoso' || source === 'crm') {
    const text = String(payload.text ?? payload.message ?? payload.summary ?? 'Evento del ecosistema');
    const brandId = String(payload.brandId ?? (await firstBrandId()) ?? '');
    if (brandId) {
      await db.comment.create({
        data: {
          brandId,
          network: String(payload.network ?? 'webhook'),
          externalId: String(payload.eventId ?? `wh-${Date.now()}`),
          author: String(payload.author ?? source),
          text: text.slice(0, 2000),
          kind: 'MESSAGE',
          classification: 'PENDING',
          evidence: `webhook:${source}`,
        },
      });
    }
  }

  await db.auditEntry.create({
    data: { actor: `webhook:${source}`, action: 'WEBHOOK_RECEIVED', targetType: 'EVENT', allowed: true, reason: `Evento entrante registrado (${check.method}: ${check.reason})`, dataJson: raw.slice(0, 1000) },
  });
  return NextResponse.json({ ok: true, received: true, verifiedBy: check.method });
}

async function firstBrandId(): Promise<string | null> {
  const b = await db.brand.findFirst();
  return b?.id ?? null;
}
