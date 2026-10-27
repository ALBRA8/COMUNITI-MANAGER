import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Calendario editorial: publicaciones y borradores con fechas
export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get('brandId');
  const publications = await db.publication.findMany({
    where: brandId ? { brandId } : undefined,
    include: { draft: { include: { versions: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const drafts = await db.contentDraft.findMany({
    where: brandId ? { brandId } : undefined,
    include: { versions: true },
    orderBy: { updatedAt: 'desc' },
    take: 30,
  });
  return NextResponse.json({ publications, drafts });
}
