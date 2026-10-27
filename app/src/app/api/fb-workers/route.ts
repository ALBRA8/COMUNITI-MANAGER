import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { syncRegistry } from '@/lib/registry';

export const dynamic = 'force-dynamic';

// Registro y ciclo de vida de workers FB-GROUPS (el Chrome que publica).
export async function GET() {
  const [workers, alerts] = await Promise.all([
    db.fbWorker.findMany({
      select: { id: true, name: true, baseUrl: true, mode: true, status: true, lastSeenAt: true, sessionAgeDays: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    db.fbAlert.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
  ]);
  return NextResponse.json({ workers, alerts });
}

export async function POST(req: NextRequest) {
  // El raw se lee UNA sola vez (el ping necesita el cuerpo exacto para verificar HMAC).
  const raw = await req.text();
  const body = JSON.parse(raw || '{}');

  if (body.action === 'register') {
    if (!body.name || !body.baseUrl) return NextResponse.json({ error: 'name y baseUrl requeridos' }, { status: 400 });
    const secret = crypto.randomBytes(32).toString('hex');
    const worker = await db.fbWorker.upsert({
      where: { baseUrl: String(body.baseUrl) },
      create: { name: String(body.name), baseUrl: String(body.baseUrl), mode: body.mode === 'vps' ? 'vps' : 'pc', secret, sessionAgeDays: Number(body.sessionAgeDays ?? 30) },
      update: { name: String(body.name), mode: body.mode === 'vps' ? 'vps' : 'pc', secret, sessionAgeDays: Number(body.sessionAgeDays ?? 30) },
    });
    await db.auditEntry.create({ data: { actor: 'human', action: 'FB_WORKER_REGISTERED', targetType: 'FB_WORKER', targetId: worker.id, allowed: true, reason: `Worker "${worker.name}" registrado (${worker.mode}). Secreto mostrado una sola vez.` } });
    await syncRegistry();
    return NextResponse.json({ worker: { id: worker.id, name: worker.name, baseUrl: worker.baseUrl, mode: worker.mode }, secret });
  }

  if (body.action === 'delete') {
    if (!body.workerId) return NextResponse.json({ error: 'workerId requerido' }, { status: 400 });
    const worker = await db.fbWorker.findUnique({ where: { id: String(body.workerId) } });
    if (!worker) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    await db.fbWorker.delete({ where: { id: worker.id } });
    await db.auditEntry.create({ data: { actor: 'human', action: 'FB_WORKER_DELETED', targetType: 'FB_WORKER', targetId: worker.id, allowed: true, reason: `Worker "${worker.name}" eliminado` } });
    await syncRegistry();
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'set_session_age') {
    if (!body.workerId) return NextResponse.json({ error: 'workerId requerido' }, { status: 400 });
    const worker = await db.fbWorker.update({ where: { id: String(body.workerId) }, data: { sessionAgeDays: Math.max(0, Number(body.sessionAgeDays ?? 30)) } });
    await db.auditEntry.create({ data: { actor: 'human', action: 'FB_WORKER_UPDATED', targetType: 'FB_WORKER', targetId: worker.id, allowed: true, reason: `Antigüedad de cuenta actualizada a ${worker.sessionAgeDays} días (warmup recalculado)` } });
    return NextResponse.json({ ok: true, sessionAgeDays: worker.sessionAgeDays });
  }

  // ping del worker: exige HMAC con su secreto (fail-closed)
  if (body.action === 'ping') {
    if (!body.workerId) return NextResponse.json({ error: 'workerId requerido' }, { status: 400 });
    const worker = await db.fbWorker.findUnique({ where: { id: String(body.workerId) } });
    if (!worker) return NextResponse.json({ error: 'Worker no registrado' }, { status: 401 });
    const provided = req.headers.get('x-fb-signature') ?? '';
    const expected = crypto.createHmac('sha256', worker.secret).update(raw).digest('hex');
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return NextResponse.json({ error: 'Firma HMAC inválida' }, { status: 401 });
    }
    const status = typeof body.status === 'string' ? body.status : 'IDLE';
    const allowed = ['OFFLINE', 'IDLE', 'RUNNING', 'AWAITING_SESSION', 'PAUSED_ANTI_BAN', 'CHALLENGE_DETECTED'];
    await db.fbWorker.update({ where: { id: worker.id }, data: { status: allowed.includes(status) ? status : 'IDLE', lastSeenAt: new Date() } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Acción no soportada' }, { status: 400 });
}
