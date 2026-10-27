import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureSkillSeeds } from '@/lib/skills';

export const dynamic = 'force-dynamic';

// Biblioteca de habilidades (SKILL.md versionadas en BD)
export async function GET(req: NextRequest) {
  await ensureSkillSeeds();
  const brandId = req.nextUrl.searchParams.get('brandId');
  const skills = await db.skill.findMany({
    where: {
      status: { not: 'ARCHIVED' },
      OR: [{ brandId: null }, ...(brandId ? [{ brandId }] : [])],
    },
    include: { brand: { select: { id: true, name: true } } },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
  return NextResponse.json(skills);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  if (body.action === 'update') {
    if (!body.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });
    const current = await db.skill.findUnique({ where: { id: String(body.id) } });
    if (!current) return NextResponse.json({ error: 'Skill no encontrada' }, { status: 404 });
    const updated = await db.skill.update({
      where: { id: current.id },
      data: {
        name: body.name !== undefined ? String(body.name).slice(0, 120) : current.name,
        category: body.category !== undefined ? String(body.category) : current.category,
        body: body.body !== undefined ? String(body.body) : current.body,
        status: body.status !== undefined ? String(body.status) : current.status,
        version: { increment: 1 },
      },
    });
    await db.auditEntry.create({ data: { actor: 'human', action: 'SKILL_UPDATED', targetType: 'SKILL', targetId: updated.id, allowed: true, reason: `"${updated.name}" actualizada a versión ${updated.version}` } });
    return NextResponse.json({ ok: true, skill: updated });
  }

  if (body.action === 'archive') {
    if (!body.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });
    const updated = await db.skill.update({ where: { id: String(body.id) }, data: { status: 'ARCHIVED' } }).catch(() => null);
    if (!updated) return NextResponse.json({ error: 'Skill no encontrada' }, { status: 404 });
    await db.auditEntry.create({ data: { actor: 'human', action: 'SKILL_ARCHIVED', targetType: 'SKILL', targetId: updated.id, allowed: true, reason: `"${updated.name}" archivada (no se borra: trazabilidad)` } });
    return NextResponse.json({ ok: true });
  }

  // Crear (key opcional: se deriva del nombre normalizado a slug, sin acentos)
  const base = String(body.key || body.name || '');
  const key = base.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!key) return NextResponse.json({ error: 'Se necesita key o name para generar el identificador' }, { status: 400 });
  if (!body.name || !body.body) return NextResponse.json({ error: 'name y body requeridos' }, { status: 400 });

  const exists = await db.skill.findUnique({ where: { key } });
  if (exists) return NextResponse.json({ error: `Ya existe una skill con key "${key}"` }, { status: 409 });

  const created = await db.skill.create({
    data: {
      key,
      brandId: body.brandId ? String(body.brandId) : null,
      name: String(body.name).slice(0, 120),
      category: ['CONTENT', 'ENGAGEMENT', 'ANALYTICS', 'CRISIS', 'GROWTH'].includes(String(body.category)) ? String(body.category) : 'CONTENT',
      body: String(body.body),
      source: 'manual',
    },
  });
  await db.auditEntry.create({ data: { actor: 'human', action: 'SKILL_CREATED', targetType: 'SKILL', targetId: created.id, allowed: true, reason: `Habilidad "${created.name}" creada (${created.category})` } });
  return NextResponse.json({ ok: true, skill: created });
}
