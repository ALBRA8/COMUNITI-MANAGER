import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Registro de errores con recuperación
export async function GET() {
  const errors = await db.errorLog.findMany({ orderBy: { createdAt: 'desc' }, take: 60 });
  return NextResponse.json(errors);
}

export async function PATCH(req: NextRequest) {
  const { id, resolved } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });
  const err = await db.errorLog.update({ where: { id }, data: { resolved: resolved ?? true } });
  return NextResponse.json(err);
}
