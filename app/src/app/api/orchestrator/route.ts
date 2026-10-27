import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { runFullCycle, resumeCycle } from '@/lib/cycle';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Ejecutar ciclo completo o retomarlo tras una aprobación
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { brandId, topic, objective, networks, draftId, resume } = body;
  if (!brandId) return NextResponse.json({ error: 'brandId requerido' }, { status: 400 });

  try {
    const result = resume && draftId
      ? await resumeCycle(brandId, draftId)
      : await runFullCycle(brandId, { topic, objective, networks, draftId });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Estado de tareas del orquestador
export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get('brandId');
  const tasks = await db.task.findMany({
    where: brandId ? { brandId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 40,
    include: { events: { orderBy: { createdAt: 'asc' } } },
  });
  return NextResponse.json(tasks);
}
