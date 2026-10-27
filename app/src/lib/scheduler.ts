// Scheduler del ciclo autónomo (frente 2): ejecuta el ciclo diario por marca
// según programaciones persistentes, con zona horaria real, anti-duplicado por
// día y respeto absoluto a la pausa global. Disparo por: intervalo interno
// (instrumentation.ts), cron externo vía API, o "Ejecutar ahora" del panel.

import { db } from '@/lib/db';
import { runFullCycle } from '@/lib/cycle';
import { isPaused } from '@/lib/orchestrator';

export interface SchedulerTickResult {
  tickedAt: string;
  paused: boolean;
  evaluated: number;
  triggered: { scheduleId: string; brandId: string; name: string; note: string }[];
  skipped: { scheduleId: string; name: string; reason: string }[];
}

const DAY_NAMES: Record<number, string> = { 1: 'lunes', 2: 'martes', 3: 'miércoles', 4: 'jueves', 5: 'viernes', 6: 'sábado', 7: 'domingo' };

/** Fecha y hora "de pared" (wall clock) en una zona horaria IANA. */
export function wallClockIn(timezone: string, now = new Date()): { weekday: number; minutes: number; hhmm: string; dayKey: string } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const weekday = weekdayMap[parts.weekday] ?? 1;
  const hour = parseInt(parts.hour === '24' ? '0' : parts.hour, 10);
  const minute = parseInt(parts.minute, 10);
  return {
    weekday,
    minutes: hour * 60 + minute,
    hhmm: `${String(hour).padStart(2, '0')}:${parts.minute}`,
    dayKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

/** ¿Corresponde disparar esta programación ahora? Con puesta al día: si el
 *  servidor estuvo caído a la hora exacta, dispara en cuanto vuelve ese día. */
export function isDue(schedule: { hour: number; minute: number; days: string; timezone: string; lastRunAt: Date | null }, now = new Date()): { due: boolean; reason: string; wall: ReturnType<typeof wallClockIn> } {
  const wall = wallClockIn(schedule.timezone, now);
  const allowedDays = schedule.days.split(',').map((d) => parseInt(d.trim(), 10)).filter((n) => !Number.isNaN(n));
  if (!allowedDays.includes(wall.weekday)) {
    return { due: false, reason: `Hoy es ${DAY_NAMES[wall.weekday]} (días activos: ${schedule.days})`, wall };
  }
  const scheduledMinutes = schedule.hour * 60 + schedule.minute;
  if (wall.minutes < scheduledMinutes) {
    return { due: false, reason: `Aún no llega la hora (${wall.hhmm} < ${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')})`, wall };
  }
  // Anti-duplicado: comparar el día calendario (en su zona horaria) de lastRunAt con hoy
  if (schedule.lastRunAt) {
    const lastWall = wallClockIn(schedule.timezone, schedule.lastRunAt);
    if (lastWall.dayKey === wall.dayKey) {
      return { due: false, reason: 'Ya se ejecutó hoy (anti-duplicado)', wall };
    }
  }
  return { due: true, reason: `Hora local ${wall.hhmm} ≥ programada`, wall };
}

/** Tick del scheduler: evalúa todas las programaciones activas y dispara las debidas. */
export async function runDueSchedules(now = new Date()): Promise<SchedulerTickResult> {
  const paused = await isPaused();
  const schedules = await db.schedule.findMany({ where: { enabled: true }, include: { brand: true } });

  const result: SchedulerTickResult = { tickedAt: now.toISOString(), paused, evaluated: schedules.length, triggered: [], skipped: [] };
  if (paused) {
    for (const s of schedules) result.skipped.push({ scheduleId: s.id, name: s.name, reason: 'Pausa global activa' });
    return result;
  }

  for (const s of schedules) {
    const check = isDue(s, now);
    if (!check.due) {
      result.skipped.push({ scheduleId: s.id, name: s.name, reason: check.reason });
      continue;
    }

    // Marcar ANTES de ejecutar (anti-doble-disparo si el tick se solapa)
    await db.schedule.update({ where: { id: s.id }, data: { lastRunAt: now } });

    // El ciclo corre en segundo plano: puede tardar minutos (LLM + fases)
    runFullCycle(s.brandId, { topic: s.topic || undefined, objective: s.objective || undefined })
      .then((res) => {
        const stopped = res.stoppedAt ? ` · detenido en ${res.stoppedAt}` : '';
        return db.schedule.update({
          where: { id: s.id },
          data: { lastResult: `Ciclo ${res.cycleId}: ${res.phases.length} fases${stopped}` },
        });
      })
      .catch(async (e) => {
        await db.schedule.update({ where: { id: s.id }, data: { lastResult: `Error: ${(e as Error).message}` } }).catch(() => undefined);
        await db.errorLog.create({
          data: { brandId: s.brandId, source: 'scheduler', severity: 'ERROR', message: `Ciclo programado falló (${s.name})`, detailJson: JSON.stringify({ scheduleId: s.id, error: (e as Error).message }), recovery: 'Revisar registro de errores y reintentar desde el panel' },
        }).catch(() => undefined);
      });

    await db.auditEntry.create({
      data: { actor: 'system:scheduler', action: 'SCHEDULE_TRIGGERED', targetType: 'SCHEDULE', targetId: s.id, allowed: true, reason: `Programación "${s.name}" para marca ${s.brand.name} (${check.wall.hhmm} ${s.timezone}, ${DAY_NAMES[check.wall.weekday]})` },
    });
    result.triggered.push({ scheduleId: s.id, brandId: s.brandId, name: s.name, note: `Ciclo lanzado en segundo plano para ${s.brand.name}` });
  }

  return result;
}

/** Disparo manual inmediato (panel): ejecuta el ciclo ya, sin mirar la hora. */
export async function runScheduleNow(scheduleId: string): Promise<{ ok: boolean; note: string }> {
  const s = await db.schedule.findUnique({ where: { id: scheduleId }, include: { brand: true } });
  if (!s) return { ok: false, note: 'Programación no encontrada' };
  if (await isPaused()) return { ok: false, note: 'Pausa global activa: no se disparan ciclos' };

  await db.schedule.update({ where: { id: s.id }, data: { lastRunAt: new Date() } });
  runFullCycle(s.brandId, { topic: s.topic || undefined, objective: s.objective || undefined })
    .then((res) => {
      const stopped = res.stoppedAt ? ` · detenido en ${res.stoppedAt}` : '';
      return db.schedule.update({ where: { id: s.id }, data: { lastResult: `Manual: ciclo ${res.cycleId}: ${res.phases.length} fases${stopped}` } });
    })
    .catch(async (e) => {
      await db.schedule.update({ where: { id: s.id }, data: { lastResult: `Error: ${(e as Error).message}` } }).catch(() => undefined);
    });

  await db.auditEntry.create({
    data: { actor: 'human', action: 'SCHEDULE_RUN_NOW', targetType: 'SCHEDULE', targetId: s.id, allowed: true, reason: `Ejecución manual de "${s.name}" para marca ${s.brand.name}` },
  });
  return { ok: true, note: `Ciclo lanzado en segundo plano para ${s.brand.name}` };
}

// ─── Bucle interno (singleton) ─────────────────────────────────────

interface SchedulerGlobal {
  __comunitiScheduler?: { timer: ReturnType<typeof setInterval>; lastTick: string };
}

const g = globalThis as typeof globalThis & SchedulerGlobal;

export function startSchedulerLoop(intervalMs = 60_000): { started: boolean; note: string } {
  if (g.__comunitiScheduler) return { started: false, note: 'El bucle del scheduler ya estaba activo' };
  const timer = setInterval(() => {
    runDueSchedules().catch(async (e) => {
      await db.errorLog.create({ data: { source: 'scheduler', severity: 'ERROR', message: `Tick falló: ${(e as Error).message}`, detailJson: '{}' } }).catch(() => undefined);
    });
  }, intervalMs);
  // No retener el proceso si todo lo demás termina
  if (typeof timer.unref === 'function') timer.unref();
  g.__comunitiScheduler = { timer, lastTick: new Date().toISOString() };
  return { started: true, note: `Bucle del scheduler iniciado (intervalo ${Math.round(intervalMs / 1000)}s)` };
}

export function schedulerLoopState() {
  return g.__comunitiScheduler ? { active: true, lastTick: g.__comunitiScheduler.lastTick } : { active: false, lastTick: null };
}
