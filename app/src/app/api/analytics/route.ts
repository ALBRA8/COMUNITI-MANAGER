import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { executeContract } from '@/lib/executor';
import { getAutonomyMode } from '@/lib/orchestrator';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Analítica: snapshots propios + métricas del proveedor si está conectado
export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get('brandId');
  const snapshots = await db.metricSnapshot.findMany({
    where: brandId ? { brandId } : undefined,
    orderBy: { date: 'desc' },
    take: 50,
  });
  const pubs = await db.publication.groupBy({
    by: ['status'],
    where: brandId ? { brandId } : undefined,
    _count: true,
  });
  const classified = await db.comment.groupBy({
    by: ['classification'],
    where: brandId ? { brandId } : undefined,
    _count: true,
  });
  return NextResponse.json({ snapshots, publicationStatus: pubs, commentClasses: classified });
}

// Informe de rendimiento con recomendaciones justificadas
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { brandId } = body;
  if (!brandId) return NextResponse.json({ error: 'brandId requerido' }, { status: 400 });

  const res = await executeContract('fetch_metrics', { brandId }, { agent: 'analyst', brandId });
  const [pubs, comments, experiments] = await Promise.all([
    db.publication.findMany({ where: { brandId }, include: { draft: true } }),
    db.comment.groupBy({ by: ['classification'], where: { brandId }, _count: true }),
    db.experiment.findMany({ where: { brandId } }),
  ]);

  const report = {
    generatedAt: new Date().toISOString(),
    dataState: res.outcome === 'OK' ? 'VERIFICADO' : 'PENDIENTE_CREDENCIALES',
    providerReason: res.reason,
    publications: {
      total: pubs.length,
      published: pubs.filter((p) => p.status === 'PUBLISHED').length,
      awaitingConnector: pubs.filter((p) => p.status === 'AWAITING_CONNECTOR').length,
      failed: pubs.filter((p) => p.status === 'FAILED').length,
    },
    community: comments,
    experiments: experiments.length,
    recommendations: buildRecommendations(pubs.length, comments, res.outcome),
  };

  const task = await db.task.create({
    data: {
      brandId, type: 'REPORT', phase: 'MEASURE', agent: 'analyst',
      status: 'COMPLETED', outputJson: JSON.stringify(report),
    },
  });
  return NextResponse.json({ taskId: task.id, report });
}

function buildRecommendations(pubCount: number, comments: { classification: string; _count: { _all: number } }[], outcome: string): string[] {
  const recs: string[] = [];
  if (outcome !== 'OK') {
    recs.push('Conecta un proveedor de publicación/analítica (Postgale, Postiz o PostLake) para métricas verificadas por red.');
  }
  if (pubCount === 0) {
    recs.push('Ejecuta el primer ciclo completo para generar, aprobar y registrar publicaciones medibles.');
  } else {
    recs.push('Registra experimentos A/B (hook vs. tutorial) para acumular patrones comparables entre ciclos.');
  }
  const spam = comments.find((c) => c.classification === 'SPAM')?._count._all ?? 0;
  if (spam > 0) {
    recs.push(`Se detectaron ${spam} interacciones tipo SPAM: revisa la política de moderación en Configuración de seguridad.`);
  }
  recs.push('Mantén la memoria de marca actualizada (FAQs y precios autorizados) para responder consultas sin riesgo.');
  return recs;
}
