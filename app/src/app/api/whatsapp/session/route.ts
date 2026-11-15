import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { guardPanel } from '@/lib/panel-auth';
import { verifyWebhookSignature } from '@/lib/webhook-security';

export const dynamic = 'force-dynamic';

// Sesión de WhatsApp PROPIA del agente (P19-WA-PROPIA). Este agente es
// independiente: su canal de WhatsApp se vincula aquí mismo por QR (protocolo
// WhatsApp Web, sin navegador — la política §5.1 de automatización de navegador
// no aplica). El conector (scripts/whatsapp-daemon.cjs) corre en el PC/VPS del
// operador y reporta estado con firma HMAC (mismo estándar que la malla de
// webhooks). Nada se simula: si no hay conector vivo, la tarjeta lo dice.

const FRESH_MS = 120_000; // un reporte más viejo que esto = conector probablemente muerto

function isFresh(date: Date | null): boolean {
  return Boolean(date && Date.now() - date.getTime() < FRESH_MS);
}

/** El panel consulta el estado vigente de la sesión (y el QR si lo hay). */
export async function GET(req: NextRequest) {
  const denied = guardPanel(req);
  if (denied) return denied;

  const sessions = await db.whatsappSession.findMany({ orderBy: { updatedAt: 'desc' } });
  const current = sessions[0] ?? null;

  return NextResponse.json({
    hasSession: Boolean(current),
    state: current?.state ?? 'DISCONNECTED',
    qrDataUrl: current?.state === 'QR_WAITING' && isFresh(current?.lastSeenAt ?? null)
      ? current.qrDataUrl
      : '',
    user: current?.user ?? '',
    phone: current?.phone ?? '',
    lastSeenAt: current?.lastSeenAt ?? null,
    stale: current ? !isFresh(current.lastSeenAt) : true,
    connectors: sessions.map((s) => ({ name: s.daemonName, state: s.state, lastSeenAt: s.lastSeenAt })),
    note: 'Protocolo WhatsApp Web no oficial: WhatsApp puede restringir el número ante reportes o volumen abusivo. El motor aplica pausa global y techos a todo envío.',
  });
}

/** El conector reporta estado (QR / conexión) firmado con HARNESS_WEBHOOK_SECRET. */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const secret = process.env.HARNESS_WEBHOOK_SECRET;

  // Fail-closed como la malla de webhooks (F-SEC-03): si hay secreto configurado,
  // se exige firma válida; en local (sin secreto) se permite ingestar para que
  // el operador pruebe el conector sin configuración extra.
  const check = verifyWebhookSignature(raw, {
    'x-harness-signature': req.headers.get('x-harness-signature'),
    authorization: req.headers.get('authorization'),
  }, secret);
  if (!check.ok) {
    return NextResponse.json({ error: `Reporte rechazado: ${check.reason}` }, { status: 401 });
  }

  // El cuerpo ya se leyó crudo para la firma: se parsea desde ese mismo
  // texto (req.json() sobre el stream consumido fallaría siempre).
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(raw) as Record<string, unknown>; } catch { body = {}; }
  const daemonName = typeof body.daemonName === 'string' && body.daemonName.trim()
    ? body.daemonName.trim().slice(0, 80)
    : '';
  const state = typeof body.state === 'string' ? body.state : '';
  const VALID = ['DISCONNECTED', 'CONNECTING', 'QR_WAITING', 'CONNECTED'];
  if (!daemonName || !VALID.includes(state)) {
    return NextResponse.json({ error: 'daemonName y state (DISCONNECTED|CONNECTING|QR_WAITING|CONNECTED) son obligatorios' }, { status: 400 });
  }

  const qrDataUrl = typeof body.qrDataUrl === 'string' ? body.qrDataUrl.slice(0, 100_000) : '';
  const user = typeof body.user === 'string' ? body.user.slice(0, 120) : '';
  const phone = typeof body.phone === 'string' ? body.phone.slice(0, 40) : '';

  const row = await db.whatsappSession.upsert({
    where: { daemonName },
    create: { daemonName, state, qrDataUrl, user, phone, lastSeenAt: new Date() },
    update: {
      state,
      qrDataUrl: state === 'QR_WAITING' ? qrDataUrl : '',
      user: state === 'CONNECTED' ? (user || undefined) : undefined,
      phone: state === 'CONNECTED' ? (phone || undefined) : undefined,
      lastSeenAt: new Date(),
    },
  });

  await db.auditEntry.create({
    data: {
      actor: `whatsapp-daemon:${daemonName}`,
      action: 'WHATSAPP_SESSION_REPORT',
      targetType: 'WhatsappSession',
      targetId: row.id,
      allowed: true,
      reason: `estado ${state}${state === 'CONNECTED' && phone ? ` (${phone})` : ''}`,
    },
  });

  return NextResponse.json({ ok: true, state: row.state });
}
