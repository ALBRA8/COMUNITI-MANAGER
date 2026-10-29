import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { PrintButton } from './print-button';

export const dynamic = 'force-dynamic';

// Informe de campaña (P9, destripe Metricool §0.3 — cerrar el ciclo
// publicar→medir→informar): página de servidor imprimible (Ctrl+P → PDF)
// alimentada SOLO por la auditoría append-only y los FbJob. Sin métricas
// infladas: si no hay engagement, no se promete. Es el entregable de agencia.

const JOB_LABEL: Record<string, string> = {
  PENDING_APPROVAL: 'Por aprobar', QUEUED: 'En cola', LEASED: 'Asignado', POSTED: 'Publicado', FAILED: 'Fallido',
  SKIPPED: 'Omitido', PENDING_REVIEW: 'Revisión de admin', CANCELLED: 'Cancelado',
};
const CHIP: Record<string, string> = {
  POSTED: 'bg-emerald-100 text-emerald-800',
  FAILED: 'bg-red-100 text-red-800',
  PENDING_REVIEW: 'bg-amber-100 text-amber-800',
  PENDING_APPROVAL: 'bg-amber-100 text-amber-800',
  LEASED: 'bg-teal-100 text-teal-800',
};
const chipFor = (s: string) => CHIP[s] ?? 'bg-zinc-100 text-zinc-700';

const fmt = (d: Date | string | null) => (d ? new Date(d).toLocaleString('es-CO') : '—');

export default async function CampaignReport({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const campaign = await db.fbCampaign.findUnique({
    where: { id: campaignId },
    include: {
      jobs: {
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
        include: { worker: { select: { name: true } }, group: { select: { collection: true } } },
      },
    },
  });
  if (!campaign) notFound();

  const [brand, audits] = await Promise.all([
    campaign.brandId ? db.brand.findUnique({ where: { id: campaign.brandId } }) : Promise.resolve(null),
    db.auditEntry.findMany({ where: { targetType: 'FB_CAMPAIGN', targetId: campaign.id }, orderBy: { createdAt: 'asc' } }),
  ]);

  let mediaCount = 0;
  try { const arr = JSON.parse(campaign.mediaUrls ?? '[]'); if (Array.isArray(arr)) mediaCount = arr.length; } catch { /* sin adjuntos */ }

  const total = campaign.jobs.length;
  const posted = campaign.jobs.filter((j) => j.status === 'POSTED');
  const failed = campaign.jobs.filter((j) => j.status === 'FAILED');
  const review = campaign.jobs.filter((j) => j.status === 'PENDING_REVIEW');
  const queued = campaign.jobs.filter((j) => j.status === 'QUEUED' || j.status === 'LEASED');
  const cancelled = campaign.jobs.filter((j) => j.status === 'CANCELLED' || j.status === 'SKIPPED');
  const successRate = total > 0 ? Math.round((posted.length / total) * 100) : null;
  const firstPost = posted.map((j) => j.postedAt).filter(Boolean).sort((a, b) => new Date(a as Date).getTime() - new Date(b as Date).getTime())[0];
  const lastPost = posted.map((j) => j.postedAt).filter(Boolean).sort((a, b) => new Date(b as Date).getTime() - new Date(a as Date).getTime())[0];
  const workers = [...new Set(campaign.jobs.map((j) => j.worker?.name).filter(Boolean))] as string[];

  const kpis = [
    { label: 'Objetivos', value: String(total), hint: campaign.mode === 'profile' ? 'muro del perfil' : campaign.mode === 'page_in_group' ? 'como Página en grupos' : 'grupos' },
    { label: 'Publicados', value: String(posted.length), hint: `${queued.length} en cola · ${review.length} en revisión de admin` },
    { label: 'Fallidos', value: String(failed.length), hint: failed.length === 0 ? 'sin fallos declarados' : 'cada fallo con su motivo' },
    { label: 'Tasa de entrega', value: successRate === null ? '—' : `${successRate}%`, hint: 'POSTED / total · estados honestos' },
  ];

  return (
    <div className="min-h-screen bg-zinc-100 px-4 py-6 print:bg-white print:p-0 dark:bg-zinc-950">
      <style>{`@media print { .no-print { display: none !important; } .page { box-shadow: none !important; } body { background: white !important; } }`}</style>
      <div className="page mx-auto max-w-4xl rounded-xl bg-white p-8 shadow-sm print:rounded-none print:shadow-none dark:bg-zinc-900">
        {/* Cabecera */}
        <header className="flex items-start justify-between gap-4 border-b pb-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-400">Informe de campaña · FB-GROUPS</p>
            <h1 className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{campaign.name}</h1>
            <p className="mt-1 text-xs text-zinc-500">
              {brand ? `Marca: ${brand.name} · ` : ''}
              Creada {fmt(campaign.createdAt)} · ventana {campaign.windowStart}:00–{campaign.windowEnd}:00 · riesgo pre-vuelo {campaign.riskScore}/100 ({campaign.riskLevel || 'n/d'})
            </p>
          </div>
          <PrintButton />
        </header>

        {/* KPIs */}
        <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-lg border p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">{k.label}</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{k.value}</p>
              <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">{k.hint}</p>
            </div>
          ))}
        </section>

        {/* Resumen de parámetros */}
        <section className="mt-4 grid gap-2 rounded-lg border bg-zinc-50 p-3 text-xs text-zinc-600 sm:grid-cols-2 print:bg-transparent dark:bg-zinc-900/60">
          <p><b>Motor:</b> DOM con sesión propia del usuario (la API de grupos de Meta fue eliminada el 22/04/2024).</p>
          <p><b>Variante por grupo:</b> {campaign.mode === 'profile' ? 'única (perfil)' : 'spintax determinista / reescritura IA graduada'}.</p>
          <p><b>Adjuntos:</b> {mediaCount === 0 ? 'ninguno' : `${mediaCount} imagen(es)${campaign.mediaMode === 'rotate' ? ' rotadas por grupo' : ''}`}</p>
          <p><b>Primer comentario:</b> {campaign.firstComment ? `sí${campaign.commentDelaySec > 0 ? ` (tras ${campaign.commentDelaySec}s ±15% jitter)` : ' (inmediato)'}` : 'no'}</p>
          {campaign.boldStyle === 'unicode' && <p><b>Énfasis:</b> negrita unicode en *segmentos* marcados.</p>}
          <p><b>Workers:</b> {workers.length ? workers.join(', ') : 'sin asignación aún'}</p>
          <p><b>Aprobación pre-vuelo:</b> {campaign.approvedAt ? `aprobada por un humano el ${fmt(campaign.approvedAt as Date)}` : campaign.status === 'DRAFT' ? 'BORRADOR sin aprobar: el worker no la ve' : 'sin registro de aprobación'}</p>
          <p><b>Primera publicación:</b> {fmt(firstPost as Date | null)}</p>
          <p><b>Última publicación:</b> {fmt(lastPost as Date | null)}</p>
        </section>

        {/* Detalle por objetivo */}
        <h2 className="mt-6 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Entrega por objetivo</h2>
        <div className="mt-2 overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b bg-zinc-50 print:bg-transparent dark:bg-zinc-900/60">
                <th className="px-3 py-2 font-medium">Objetivo</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Variante</th>
                <th className="px-3 py-2 font-medium">Publicado</th>
                <th className="px-3 py-2 font-medium">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {campaign.jobs.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-4 text-center text-zinc-400">La campaña aún no tiene jobs.</td></tr>
              )}
              {campaign.jobs.map((j) => (
                <tr key={j.id} className="border-b last:border-b-0">
                  <td className="max-w-[200px] truncate px-3 py-2" title={j.targetName}>
                    {j.targetName}{j.group?.collection ? <span className="text-zinc-400"> · {j.group.collection}</span> : null}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${chipFor(j.status)}`}>{JOB_LABEL[j.status] ?? j.status}</span>
                  </td>
                  <td className="px-3 py-2 text-zinc-500">{j.variantSource}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-zinc-500">{j.postedAt ? fmt(j.postedAt) : '—'}</td>
                  <td className="max-w-[260px] truncate px-3 py-2 text-zinc-500" title={j.postUrl || j.failReason}>
                    {j.postUrl ? <a href={j.postUrl} target="_blank" rel="noreferrer" className="text-teal-700 underline-offset-2 hover:underline dark:text-teal-400">ver post</a> : (j.failReason || (j.worker?.name ? `worker: ${j.worker.name}` : '—'))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bitácora de auditoría */}
        <h2 className="mt-6 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Bitácora de la campaña (auditoría append-only)</h2>
        <ol className="mt-2 space-y-1 text-xs text-zinc-600">
          {audits.map((a) => (
            <li key={a.id} className="flex gap-2">
              <span className="shrink-0 tabular-nums text-zinc-400">{new Date(a.createdAt).toLocaleString('es-CO')}</span>
              <span><b>{a.action}</b>{a.reason ? ` — ${a.reason}` : ''}</span>
            </li>
          ))}
          {audits.length === 0 && <li className="text-zinc-400">Sin eventos de auditoría registrados.</li>}
        </ol>

        {/* Pie honesto */}
        <footer className="mt-6 border-t pt-3 text-[11px] leading-relaxed text-zinc-500">
          Informe generado el {fmt(new Date())} desde la auditoría append-only del chaleco. Los estados reflejan lo
          que el worker reportó firmado (HMAC): POSTED solo existe con postUrl verificable y FAILED con su motivo real.
          Este informe no incluye métricas de engagement: la API de grupos de Meta no existe y leer métricas de
          terceros está fuera de alcance por seguridad de la cuenta. {cancelled.length > 0 && `${cancelled.length} objetivo(s) cancelado(s)/omitido(s) no se publicaron.`}
        </footer>
      </div>
    </div>
  );
}
