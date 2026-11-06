import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { schedulerLoopState } from '@/lib/scheduler';
import { panelAuthEnabled } from '@/lib/panel-auth';

export const dynamic = 'force-dynamic';

// Healthcheck para supervisor (systemd/uptime/cron de monitorización):
// verifica proceso vivo, DB abierta y bucle del scheduler activo.
// Sin datos de negocio, sin auth. 200 = sano; 503 = degradado.
export async function GET() {
  const startedAt = Date.now();
  let dbOk = false;
  let dbError: string | null = null;
  try {
    await db.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (e) {
    dbError = (e as Error).message.slice(0, 200);
  }
  const scheduler = schedulerLoopState();
  const ok = dbOk;
  return NextResponse.json({
    ok,
    db: dbOk ? 'ok' : `error: ${dbError}`,
    scheduler: { active: scheduler.active, lastTick: scheduler.lastTick },
    panelAuth: panelAuthEnabled() ? 'token' : 'local',
    uptimeSec: Math.round(process.uptime()),
    checkMs: Date.now() - startedAt,
    timestamp: new Date().toISOString(),
  }, { status: ok ? 200 : 503 });
}
