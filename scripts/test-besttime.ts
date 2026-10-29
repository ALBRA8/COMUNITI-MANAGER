// Test unitario de la lib pura de mejores horas (P10) — corre con bun:
//   bun scripts/test-besttime.ts
// Cubre: conteo por celda, tasa, sugerencias con muestra mínima, honestidad
// de datos insuficientes y el corte de horas fuera de 6..21.
import { buildBestTime } from '../src/lib/fb-besttime';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); }
}

// Fechas fijas: 2026-10-29 es jueves (getDay=4 → día index 3 en lun..dom)
const at = (dayOffset: number, hour: number, min = 0) => {
  const d = new Date(2026, 9, 29 + dayOffset, hour, min, 0);
  return d.toISOString();
};

const jobs = [
  // 4 éxitos jueves 9:00 → tasa 100% (sugerencia #1)
  { status: 'POSTED', postedAt: at(0, 9), updatedAt: at(0, 9) },
  { status: 'POSTED', postedAt: at(0, 9, 30), updatedAt: at(0, 9, 30) },
  { status: 'POSTED', postedAt: at(0, 9, 45), updatedAt: at(0, 9, 45) },
  { status: 'POSTED', postedAt: at(0, 9, 55), updatedAt: at(0, 9, 55) },
  // 1 éxito + 3 fallos jueves 20:00 → tasa 25% (celda roja)
  { status: 'POSTED', postedAt: at(0, 20), updatedAt: at(0, 20) },
  { status: 'FAILED', postedAt: null, updatedAt: at(0, 20, 20) },
  { status: 'FAILED', postedAt: null, updatedAt: at(0, 20, 40) },
  { status: 'FAILED', postedAt: null, updatedAt: at(0, 20, 50) },
  // 3 éxitos lunes 8:00 → 100%, compite con jueves 9
  { status: 'POSTED', postedAt: at(-3, 8), updatedAt: at(-3, 8) },
  { status: 'POSTED', postedAt: at(-3, 8, 10), updatedAt: at(-3, 8, 10) },
  { status: 'POSTED', postedAt: at(-3, 8, 20), updatedAt: at(-3, 8, 20) },
  // sin veredicto: no cuentan
  { status: 'QUEUED', postedAt: null, updatedAt: at(0, 10) },
  { status: 'PENDING_REVIEW', postedAt: null, updatedAt: at(0, 10) },
  // publicado fuera de 6..21 (no debería ocurrir con el corte nocturno, pero se ignora)
  { status: 'POSTED', postedAt: at(0, 3), updatedAt: at(0, 3) },
];

const bt = buildBestTime(jobs);

check('muestra total = 11 (excluye QUEUED/PENDING_REVIEW y hora nocturna)', bt.sample === 11, `sample=${bt.sample}`);
check('totales honestos', bt.totalPosted === 8 && bt.totalFailed === 3, `${bt.totalPosted}/${bt.totalFailed}`);

const thu9 = bt.cells.find((c) => c.day === 3 && c.hour === 9);
check('celda jueves 9:00 = 4/4', thu9?.posted === 4 && thu9?.total === 4 && thu9?.rate === 1, JSON.stringify(thu9));

const thu20 = bt.cells.find((c) => c.day === 3 && c.hour === 20);
check('celda jueves 20:00 = 1/4 (roja)', thu20?.posted === 1 && thu20?.failed === 3 && Math.abs((thu20?.rate ?? 0) - 0.25) < 1e-9, JSON.stringify(thu20));

const mon8 = bt.cells.find((c) => c.day === 0 && c.hour === 8);
check('celda lunes 8:00 = 3/3', mon8?.posted === 3 && mon8?.rate === 1, JSON.stringify(mon8));

check('sugerencias: 2 franjas (≥3 muestra)', bt.suggestions.length === 2, JSON.stringify(bt.suggestions));
check('mejor franja ordenada primero (jue 9 por posted)', bt.suggestions[0]?.day === 3 && bt.suggestions[0]?.hour === 9, JSON.stringify(bt.suggestions[0]));

check('enoughData=false con 11 entregas (<10 sería falso, 11 ≥ 10 → true)', bt.enoughData === true, String(bt.enoughData));
const btSmall = buildBestTime(jobs.slice(0, 4));
check('muestra pequeña → enoughData=false y sin sugerencias', btSmall.enoughData === false && btSmall.suggestions.length === 0 && btSmall.sample === 4);

check('grid completo 7×16 = 112 celdas', bt.cells.length === 112 && bt.hours[0] === 6 && bt.hours.at(-1) === 21);

console.log(`\nResultado: ${pass} pasan · ${fail} fallan`);
process.exit(fail > 0 ? 1 : 0);
