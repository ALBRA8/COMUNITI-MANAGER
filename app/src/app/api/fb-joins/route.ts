import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { normalizeGroupUrl } from '@/lib/fb-groups';

export const dynamic = 'force-dynamic';

// P6 auto-join: cola de tareas de unión. El panel crea/cancela; el worker
// reclama por /api/fb-joins/claim con HMAC y reporta por /api/fb-joins/report.

const ACTIVE_STATUSES = ['PENDING', 'LEASED', 'JOINED', 'REQUESTED'];

export async function GET() {
  const [tasks, grouped] = await Promise.all([
    db.fbJoinTask.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { worker: { select: { name: true } } },
    }),
    db.fbJoinTask.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  const counts: Record<string, number> = {};
  for (const g of grouped) counts[g.status] = g._count._all;
  return NextResponse.json({
    tasks: tasks.map((t) => ({
      id: t.id,
      url: t.url,
      fbId: t.fbId,
      keyword: t.keyword,
      status: t.status,
      attempts: t.attempts,
      failReason: t.failReason,
      joinedAt: t.joinedAt,
      createdAt: t.createdAt,
      workerName: t.worker?.name ?? null,
    })),
    counts,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const rawList: string[] = Array.isArray(body.urls) ? body.urls.map(String) : String(body.urls ?? '').split('\n');
  const keyword = String(body.keyword ?? '').trim().slice(0, 60);
  const workerId = body.workerId ? String(body.workerId) : null;

  // Normaliza y deduplica con honestidad: las URLs inválidas se rechazan con motivo
  // y los duplicados se cuentan como omitidos (nada se fusiona en silencio).
  const seen = new Set<string>();
  const rejected: Array<{ raw: string; reason: string }> = [];
  const normalized: Array<{ fbId: string; url: string }> = [];
  let duplicates = 0;
  for (const raw of rawList.map((s) => s.trim()).filter(Boolean)) {
    const n = normalizeGroupUrl(raw);
    if (!n) {
      rejected.push({ raw: raw.slice(0, 120), reason: 'No es una URL de grupo de Facebook (facebook.com/groups/...)' });
      continue;
    }
    if (seen.has(n.fbId)) { duplicates += 1; continue; }
    seen.add(n.fbId);
    normalized.push(n);
  }

  const existing = await db.fbJoinTask.findMany({
    where: { fbId: { in: normalized.map((n) => n.fbId) }, status: { in: ACTIVE_STATUSES } },
    select: { fbId: true },
  });
  const already = new Set(existing.map((e) => e.fbId));

  const toCreate = normalized.filter((n) => !already.has(n.fbId));
  const createdIds: string[] = [];
  for (const n of toCreate) {
    const t = await db.fbJoinTask.create({ data: { fbId: n.fbId, url: n.url, keyword, workerId } });
    createdIds.push(t.id);
  }
  if (createdIds.length > 0) {
    await db.auditEntry.create({
      data: {
        actor: 'human',
        action: 'FB_JOIN_TASKS_CREATED',
        targetType: 'FB_JOIN_TASK',
        targetId: createdIds.join(','),
        allowed: true,
        reason: `${createdIds.length} tarea(s) de unión creadas${keyword ? ` (keyword: ${keyword})` : ''}`,
      },
    });
  }
  return NextResponse.json({ created: createdIds.length, skipped: already.size + duplicates, rejected });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? '');
  const action = String(body.action ?? 'cancel');
  const task = id ? await db.fbJoinTask.findUnique({ where: { id } }) : null;
  if (!task) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 });

  if (action === 'cancel') {
    if (!['PENDING', 'FAILED'].includes(task.status)) {
      return NextResponse.json({ error: `Solo se pueden cancelar tareas PENDING o FAILED (estado actual: ${task.status})` }, { status: 400 });
    }
    await db.fbJoinTask.update({ where: { id }, data: { status: 'CANCELLED', leaseUntil: null } });
    await db.auditEntry.create({
      data: { actor: 'human', action: 'FB_JOIN_TASK_CANCELLED', targetType: 'FB_JOIN_TASK', targetId: id, allowed: true, reason: `Cancelada por el operador (${task.url})` },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === 'delete') {
    if (!['JOINED', 'REQUESTED', 'SKIPPED', 'FAILED', 'CANCELLED'].includes(task.status)) {
      return NextResponse.json({ error: `Solo se pueden eliminar tareas terminadas (estado actual: ${task.status})` }, { status: 400 });
    }
    await db.fbJoinTask.delete({ where: { id } });
    await db.auditEntry.create({
      data: { actor: 'human', action: 'FB_JOIN_TASK_DELETED', targetType: 'FB_JOIN_TASK', targetId: id, allowed: true, reason: `Tarea terminada eliminada del panel (${task.url}; la auditoría append-only se conserva)` },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: `Acción no soportada: ${action}` }, { status: 400 });
}
