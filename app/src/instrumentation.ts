// Punto de arranque del servidor (Next.js instrumentation): inicia el bucle
// interno del scheduler una sola vez, solo en el runtime Node.js.

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    const { startSchedulerLoop } = await import('@/lib/scheduler');
    const res = startSchedulerLoop(60_000);
    console.log(`[scheduler] ${res.note}`);
  } catch (e) {
    console.error(`[scheduler] No se pudo iniciar: ${(e as Error).message}`);
  }
}
