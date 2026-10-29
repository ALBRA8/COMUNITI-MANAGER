import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Biblioteca de media por marca (P12, destripe Metricool §3): guardar URLs
// reutilizables para no re-pegarlas en cada campaña. Misma validación que los
// adjuntos de fb-campaigns (URL http(s) o ruta local del worker).

function validMedia(m: string): boolean {
  return /^https?:\/\//i.test(m) || m.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(m);
}

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get('brandId');
  const media = await db.fbMedia.findMany({
    where: brandId ? { OR: [{ brandId }, { brandId: null }] } : {},
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return NextResponse.json({ media });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const url = String(body.url ?? '').trim();
  if (!url) return NextResponse.json({ error: 'url requerida' }, { status: 400 });
  if (!validMedia(url)) {
    return NextResponse.json({ error: 'URL inválida: usa http(s):// o una ruta local del worker (/… o C:\\…)' }, { status: 400 });
  }
  const label = String(body.label ?? '').trim().slice(0, 80);
  const brandId = body.brandId ? String(body.brandId) : null;
  const dupe = await db.fbMedia.findFirst({ where: { url, brandId } });
  if (dupe) return NextResponse.json({ error: 'Ese adjunto ya está en la biblioteca' }, { status: 409 });

  const item = await db.fbMedia.create({ data: { url, label, brandId } });
  await db.auditEntry.create({
    data: { actor: 'human', action: 'FB_MEDIA_ADDED', targetType: 'FB_MEDIA', targetId: item.id, allowed: true, reason: `Media "${label || url.slice(0, 60)}" añadido a la biblioteca${brandId ? ' (marca actual)' : ' (global)'}` },
  });
  return NextResponse.json({ media: item });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });
  const item = await db.fbMedia.delete({ where: { id } }).catch(() => null);
  if (!item) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  await db.auditEntry.create({
    data: { actor: 'human', action: 'FB_MEDIA_DELETED', targetType: 'FB_MEDIA', targetId: id, allowed: true, reason: `Media "${item.label || item.url.slice(0, 60)}" eliminado de la biblioteca` },
  });
  return NextResponse.json({ ok: true });
}
