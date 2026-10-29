// Mejores horas (P10, destripe Metricool): heatmap hora×día con datos PROPIOS
// y honestos del módulo FB-GROUPS. Sin magia externa: se derivan de FbJob
// (POSTED → postedAt como éxito; FAILED → updatedAt como proxy del intento,
// aproximación declarada). Lib pura y testeable, compartida por el panel.

export interface BestTimeJob {
  status: string;
  postedAt: string | Date | null;
  updatedAt: string | Date | null;
}

export interface HeatCell {
  /** 0=lunes … 6=domingo (orden de columna en la UI, ISO-like) */
  day: number;
  /** 0-23, hora local del navegador que renderiza */
  hour: number;
  posted: number;
  failed: number;
  total: number;
  /** tasa de éxito 0-1; null si sin muestra */
  rate: number | null;
}

export interface BestTimeSuggestion {
  day: number;
  hour: number;
  posted: number;
  rate: number;
}

export interface BestTimeResult {
  cells: HeatCell[];
  totalPosted: number;
  totalFailed: number;
  /** muestra total evaluable (POSTED + FAILED) */
  sample: number;
  suggestions: BestTimeSuggestion[];
  /** false ⇒ mostrar aviso de datos insuficientes (honestidad) */
  enoughData: boolean;
  /** horas cubiertas por el heatmap (el corte nocturno 22-07 no aporta) */
  hours: number[];
  days: number[];
}

const DAY_INDEX: Record<number, number> = { 0: 6, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5 }; // getDay() → lun..dom

function toDate(v: string | Date | null): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function buildBestTime(
  jobs: BestTimeJob[],
  opts?: { minSamplePerCell?: number; minTotal?: number; maxSuggestions?: number },
): BestTimeResult {
  const minSamplePerCell = opts?.minSamplePerCell ?? 3;
  const minTotal = opts?.minTotal ?? 10;
  const maxSuggestions = opts?.maxSuggestions ?? 3;
  const hours = Array.from({ length: 16 }, (_, i) => i + 6); // 6..21 (corte nocturno 22-07)
  const days = [0, 1, 2, 3, 4, 5, 6]; // lunes..domingo

  const grid = new Map<string, { posted: number; failed: number }>();
  let totalPosted = 0;
  let totalFailed = 0;

  for (const j of jobs) {
    const success = j.status === 'POSTED';
    const failed = j.status === 'FAILED';
    if (!success && !failed) continue; // QUEUED/LEASED/PENDING_REVIEW/SKIPPED/CANCELLED: sin veredicto
    const when = success ? toDate(j.postedAt) ?? toDate(j.updatedAt) : toDate(j.updatedAt);
    if (!when) continue;
    const d = when.getDay();
    const h = when.getHours();
    if (!(d in DAY_INDEX)) continue;
    const day = DAY_INDEX[d];
    const cellHour = hours.includes(h) ? h : null;
    if (cellHour === null) continue; // fuera de 6..21 (no debería pasar con el corte nocturno)
    const key = `${day}-${cellHour}`;
    const cell = grid.get(key) ?? { posted: 0, failed: 0 };
    if (success) { cell.posted++; totalPosted++; } else { cell.failed++; totalFailed++; }
    grid.set(key, cell);
  }

  const cells: HeatCell[] = [];
  for (const day of days) {
    for (const hour of hours) {
      const c = grid.get(`${day}-${hour}`) ?? { posted: 0, failed: 0 };
      const total = c.posted + c.failed;
      cells.push({ day, hour, posted: c.posted, failed: c.failed, total, rate: total > 0 ? c.posted / total : null });
    }
  }

  const sample = totalPosted + totalFailed;
  const enoughData = sample >= minTotal;
  // Sugerencias solo con muestra global suficiente y celdas decentes:
  // una franja donde fallas el 75% no es una "mejor hora" (honestidad).
  const suggestions: BestTimeSuggestion[] = !enoughData
    ? []
    : cells
      .filter((c) => c.total >= minSamplePerCell && (c.rate ?? 0) >= 0.5)
      .sort((a, b) => ((b.rate ?? 0) - (a.rate ?? 0)) || (b.posted - a.posted) || (a.day - b.day) || (a.hour - b.hour))
      .slice(0, maxSuggestions)
      .map((c) => ({ day: c.day, hour: c.hour, posted: c.posted, rate: c.rate as number }));

  return { cells, totalPosted, totalFailed, sample, suggestions, enoughData, hours, days };
}

export const DAY_LABELS_ES = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
