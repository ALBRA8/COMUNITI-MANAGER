import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { NETWORKS } from '@/lib/contracts';
import { guardPanel } from '@/lib/panel-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const brands = await db.brand.findMany({
    include: { accounts: true, _count: { select: { publications: true, drafts: true, comments: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(brands);
}

export async function POST(req: NextRequest) {
  const denied = guardPanel(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const { name, identity, products, audience, tone, vocabulary, forbiddenWords, policies, maxPostsPerDay, allowedHours, networks } = body;
  if (!name || !identity) {
    return NextResponse.json({ error: 'Nombre e identidad de marca son obligatorios' }, { status: 400 });
  }
  try {
    const brand = await db.brand.create({
      data: {
        name, identity,
        products: products ?? '', audience: audience ?? '', tone: tone ?? '',
        vocabulary: vocabulary ?? '', forbiddenWords: forbiddenWords ?? '',
        policies: policies ?? '',
        maxPostsPerDay: Number(maxPostsPerDay ?? 3),
        allowedHours: allowedHours ?? '08-20',
      },
    });
    // Crear cuentas sociales seleccionadas (sin credenciales → estado honesto)
    const nets = Array.isArray(networks) && networks.length ? networks : [];
    for (const n of nets) {
      if (!NETWORKS.includes(n)) continue;
      await db.socialAccount.create({
        data: { brandId: brand.id, network: n, handle: name.toLowerCase().replace(/\s+/g, ''), status: 'AWAITING_CREDENTIALS' },
      });
    }
    await db.auditEntry.create({
      data: { actor: 'human', action: 'CREATE_BRAND', targetType: 'Brand', targetId: brand.id, allowed: true, reason: `Marca creada: ${name}` },
    });
    return NextResponse.json(brand, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: `No se pudo crear la marca: ${(e as Error).message}` }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const denied = guardPanel(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const { id, faqs, approvedExamples, supportInfo, budgetDaily } = body;
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });
  // Whitelist explícita (F-DATA-13): el body nunca entra en spread directo a
  // Prisma (mass assignment: id/createdAt/relaciones viajan por aquí si no).
  const data: Record<string, unknown> = {};
  const strFields = ['identity', 'products', 'audience', 'tone', 'vocabulary', 'forbiddenWords', 'policies', 'supportInfo', 'allowedHours'] as const;
  for (const k of strFields) {
    if (body[k] !== undefined) data[k] = String(body[k]);
  }
  if (body.maxPostsPerDay !== undefined) data.maxPostsPerDay = Math.max(1, Math.min(50, Number(body.maxPostsPerDay) || 3));
  if (budgetDaily !== undefined) data.budgetDaily = Math.max(0, Number(budgetDaily) || 0);
  if (faqs !== undefined) data.faqs = JSON.stringify(faqs);
  if (approvedExamples !== undefined) data.approvedExamples = JSON.stringify(approvedExamples);
  if (Object.keys(data).length === 0) return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
  try {
    const brand = await db.brand.update({ where: { id }, data });
    await db.auditEntry.create({
      data: { actor: 'human', action: 'UPDATE_BRAND', targetType: 'Brand', targetId: brand.id, allowed: true, reason: `Memoria de marca actualizada: ${Object.keys(data).join(', ')}` },
    });
    return NextResponse.json(brand);
  } catch {
    return NextResponse.json({ error: 'Marca no encontrada' }, { status: 404 });
  }
}
