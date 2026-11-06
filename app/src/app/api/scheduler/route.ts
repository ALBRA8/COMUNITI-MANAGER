import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { runDueSchedules, runScheduleNow, schedulerLoopState } from '@/lib/scheduler';
import { computeSignature, isLoopbackRequest } from '@/lib/webhook-security';
import { guardPanel } from '@/lib/panel-auth';

export const dynamic = 'force-dynamic';

// Scheduler del ciclo autónomo: programaciones por marca + tick interno/externo
export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get('brandId');
  const [schedules, loop] = await Promise.all([
    db.schedule.findMany({
      where: brandId ? { brandId } : undefined,
      include: { brand: { select: { id: true, name: true } } },
      orderBy: [{ enabled: 'desc' }, { hour: 'asc' }, { minute: 'asc' }],
    }),
    Promise.resolve(schedulerLoopState()),
  ]);
  return NextResponse.json({ schedules, loop, webhookSecretConfigured: Boolean(process.env.HARNESS_WEBHOOK_SECRET) });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  // Tick para cron externo: exige el mismo secreto del arnés (si está configurado).
  // Comparación en tiempo constante (F-SEC-07) y fail-closed fuera de localhost.
  if (body.action === 'tick') {
    const secret = process.env.HARNESS_WEBHOOK_SECRET;
    if (secret) {
      const expected = computeSignature('', secret);
      const providedSig = req.headers.get('x-harness-signature') ?? '';
      const providedBearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
      const okSig = providedSig.length === expected.length && crypto.timingSafeEqual(Buffer.from(providedSig), Buffer.from(expected));
      const okBearer = providedBearer.length === secret.length && crypto.timingSafeEqual(Buffer.from(providedBearer), Buffer.from(secret));
      if (!okSig && !okBearer) {
        return NextResponse.json({ error: 'Firma inválida' }, { status: 401 });
      }
    } else if (!isLoopbackRequest(req.headers)) {
      return NextResponse.json({ error: 'Tick remoto deshabilitado: configura HARNESS_WEBHOOK_SECRET' }, { status: 503 });
    }
    const result = await runDueSchedules();
    return NextResponse.json(result);
  }

  const deniedTick = guardPanel(req);
  if (deniedTick) return deniedTick;

  if (body.action === 'run_now') {
    if (!body.scheduleId) return NextResponse.json({ error: 'scheduleId requerido' }, { status: 400 });
    const res = await runScheduleNow(String(body.scheduleId));
    return NextResponse.json(res, { status: res.ok ? 200 : 400 });
  }

  if (body.action === 'toggle') {
    if (!body.scheduleId) return NextResponse.json({ error: 'scheduleId requerido' }, { status: 400 });
    const current = await db.schedule.findUnique({ where: { id: String(body.scheduleId) } });
    if (!current) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
    const updated = await db.schedule.update({ where: { id: current.id }, data: { enabled: !current.enabled } });
    await db.auditEntry.create({ data: { actor: 'human', action: updated.enabled ? 'SCHEDULE_ENABLED' : 'SCHEDULE_DISABLED', targetType: 'SCHEDULE', targetId: updated.id, allowed: true, reason: `Programación "${updated.name}" ${updated.enabled ? 'activada' : 'desactivada'}` } });
    return NextResponse.json({ ok: true, enabled: updated.enabled });
  }

  if (body.action === 'delete') {
    if (!body.scheduleId) return NextResponse.json({ error: 'scheduleId requerido' }, { status: 400 });
    const removed = await db.schedule.delete({ where: { id: String(body.scheduleId) } }).catch(() => null);
    if (!removed) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
    await db.auditEntry.create({ data: { actor: 'human', action: 'SCHEDULE_DELETED', targetType: 'SCHEDULE', targetId: removed.id, allowed: true, reason: `Programación "${removed.name}" eliminada` } });
    return NextResponse.json({ ok: true });
  }

  // Crear programación
  const { brandId, name, time, days, timezone, topic, objective } = body as {
    brandId?: string; name?: string; time?: string; days?: string; timezone?: string; topic?: string; objective?: string;
  };
  if (!brandId) return NextResponse.json({ error: 'brandId requerido' }, { status: 400 });
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(time ?? ''));
  if (!m) return NextResponse.json({ error: 'time debe ser HH:MM (24h)' }, { status: 400 });

  const tz = String(timezone || 'America/Bogota');
  let tzValid = true;
  try { new Intl.DateTimeFormat('en-CA', { timeZone: tz }); } catch { tzValid = false; }
  if (!tzValid) return NextResponse.json({ error: 'Zona horaria inválida (usa formato IANA, p.ej. America/Bogota)' }, { status: 400 });

  const daysStr = String(days || '1,2,3,4,5,6,7').split(',').map((d) => parseInt(d.trim(), 10)).filter((n) => n >= 1 && n <= 7).join(',');
  if (!daysStr) return NextResponse.json({ error: 'days inválido (ISO 1=lunes … 7=domingo)' }, { status: 400 });

  const created = await db.schedule.create({
    data: {
      brandId,
      name: String(name || 'Ciclo diario').slice(0, 80),
      hour: parseInt(m[1], 10),
      minute: parseInt(m[2], 10),
      days: daysStr,
      timezone: tz,
      topic: String(topic || '').slice(0, 300),
      objective: String(objective || '').slice(0, 300),
    },
  });
  await db.auditEntry.create({ data: { actor: 'human', action: 'SCHEDULE_CREATED', targetType: 'SCHEDULE', targetId: created.id, allowed: true, reason: `Programación "${created.name}" a las ${time} (${tz})` } });
  return NextResponse.json({ ok: true, schedule: created });
}
