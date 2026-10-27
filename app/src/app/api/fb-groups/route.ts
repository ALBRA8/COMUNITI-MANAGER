import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Grupos de Facebook importados (colecciones, exclusión de rotación).
export async function GET() {
  const groups = await db.fbGroup.findMany({
    orderBy: [{ collection: 'asc' }, { name: 'asc' }],
  });
  const campaigns = await db.fbCampaign.findMany({ where: { status: { in: ['QUEUED', 'RUNNING'] } }, select: { id: true, name: true } });
  return NextResponse.json({ groups, activeCampaigns: campaigns });
}

// Importación masiva (desde el sync del worker o pegada manual). Idempotente por fbId.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const groups: Array<{ fbId?: string; name?: string; url?: string; collection?: string }> = Array.isArray(body.groups) ? body.groups : [];
  if (groups.length === 0) return NextResponse.json({ error: 'groups[] requerido' }, { status: 400 });

  let imported = 0;
  for (const g of groups) {
    if (!g.fbId && !g.name) continue;
    const fbId = String(g.fbId ?? g.name).trim();
    await db.fbGroup.upsert({
      where: { fbId },
      create: { fbId, name: String(g.name ?? fbId), url: String(g.url ?? ''), collection: String(g.collection ?? 'general') },
      update: { name: String(g.name ?? fbId), url: g.url ? String(g.url) : undefined, collection: g.collection ? String(g.collection) : undefined },
    });
    imported += 1;
  }
  await db.auditEntry.create({ data: { actor: 'system', action: 'FB_GROUPS_IMPORTED', targetType: 'FB_GROUP', targetId: 'bulk', allowed: true, reason: `${imported} grupos sincronizados` } });
  return NextResponse.json({ imported });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });
  const group = await db.fbGroup.findUnique({ where: { id: String(body.id) } });
  if (!group) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  const updated = await db.fbGroup.update({
    where: { id: group.id },
    data: {
      excluded: typeof body.excluded === 'boolean' ? body.excluded : undefined,
      collection: body.collection ? String(body.collection) : undefined,
    },
  });
  await db.auditEntry.create({
    data: { actor: 'human', action: body.excluded ? 'FB_GROUP_EXCLUDED' : 'FB_GROUP_UPDATED', targetType: 'FB_GROUP', targetId: updated.id, allowed: true, reason: `Grupo "${updated.name}" actualizado` },
  });
  return NextResponse.json({ group: updated });
}
