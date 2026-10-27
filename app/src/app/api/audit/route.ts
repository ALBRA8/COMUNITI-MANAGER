import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Auditoría (solo lectura desde el panel)
export async function GET() {
  const entries = await db.auditEntry.findMany({ orderBy: { createdAt: 'desc' }, take: 80 });
  return NextResponse.json(entries);
}
