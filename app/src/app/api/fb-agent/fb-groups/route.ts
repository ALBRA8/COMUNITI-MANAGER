import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { computeCap, todayKey } from '@/lib/fb-groups';
import { policyState } from '@/lib/meta-policy';

export const dynamic = 'force-dynamic';

// Puente agéntico v1 (P11, destripe Metricool §0.2 — patrón MCP): lectura
// honesta del estado del módulo FB-GROUPS para que el chaleco (AGENTE-GENERAL)
// lo goberne con datos. Solo lectura: escribir campañas sigue siendo
// POST /api/fb-campaigns y pasa por el gauge de riesgo + HITL del operador.
// La verdad de cada entrega vive en la auditoría append-only.

export async function GET() {
  const day = todayKey();
  const [workers, groupAgg, campaigns, joinCounts, alerts, usages, policy] = await Promise.all([
    db.fbWorker.findMany({ orderBy: { name: 'asc' } }),
    db.fbGroup.groupBy({ by: ['excluded'], _count: { _all: true } }),
    db.fbCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: { jobs: { select: { status: true } } },
    }),
    db.fbJoinTask.groupBy({ by: ['status'], _count: { _all: true } }),
    db.fbAlert.findMany({ where: { resolved: false }, orderBy: { createdAt: 'desc' }, take: 10 }),
    db.fbDailyUsage.findMany({ where: { day } }),
    policyState(),
  ]);

  return NextResponse.json({
    module: 'fb-groups',
    generatedAt: new Date().toISOString(),
    honesty: [
      'Los workers publican con la sesión propia del usuario vía navegador real; no hay API de Meta para grupos (eliminada el 22/04/2024).',
      'Los estados son honestos: POSTED solo con postUrl verificable; FAILED con failReason real.',
      'Las campañas nacen DRAFT y requieren aprobación humana explícita (HITL, acción approve) antes de entrar en cola; este puente es solo lectura.',
      'Toda operación Meta pasa por el motor de cumplimiento (META POLICY INTELLIGENCE); su estado se expone en meta.policy y NO es modificable por agentes.',
    ],
    policy: {
      overall: policy.overall,
      overallReasons: policy.overallReasons,
      engineEnabled: policy.engineEnabled,
      killSwitch: policy.killSwitch,
      criticalChangesOpen: policy.changes.bySeverity.CRITICO ?? 0,
      fbGroupsFreshness: policy.fbGroupsFreshness,
      note: 'Si overall=BLOQUEADO o DESACTUALIZADO, las operaciones Meta están retenidas; consultar /api/meta-policy y escalar a revisión humana.',
    },
    workers: workers.map((w) => {
      const usage = usages.find((u) => u.workerId === w.id);
      return {
        name: w.name,
        status: w.status,
        sessionAgeDays: w.sessionAgeDays,
        lastSeenAt: w.lastSeenAt,
        usage: { postsToday: usage?.posts ?? 0, cap: usage?.cap ?? computeCap(w.sessionAgeDays), joinsToday: usage?.joins ?? 0, joinCap: usage?.joinCap ?? null },
      };
    }),
    groups: { active: groupAgg.filter((g) => !g.excluded).reduce((a, g) => a + g._count._all, 0), total: groupAgg.reduce((a, g) => a + g._count._all, 0) },
    campaigns: campaigns.map((c) => ({
      id: c.id, name: c.name, status: c.status, riskScore: c.riskScore, riskLevel: c.riskLevel, createdAt: c.createdAt,
      counts: {
        total: c.jobs.length,
        posted: c.jobs.filter((j) => j.status === 'POSTED').length,
        failed: c.jobs.filter((j) => j.status === 'FAILED').length,
        queued: c.jobs.filter((j) => j.status === 'QUEUED' || j.status === 'LEASED').length,
        review: c.jobs.filter((j) => j.status === 'PENDING_REVIEW').length,
        pendingApproval: c.jobs.filter((j) => j.status === 'PENDING_APPROVAL').length,
      },
    })),
    joinTasks: Object.fromEntries(joinCounts.map((r) => [r.status, r._count._all])),
    alerts: alerts.map((a) => ({ kind: a.kind, message: a.message, pausedUntil: a.pausedUntil, createdAt: a.createdAt })),
    limits: { postsPerDay: '5/10/20 según warmup (días de cuenta)', joinsPerDay: '2/4/6 según warmup', nightCut: '22:00-07:00', gapBetweenPosts: '3-10 min', gapBetweenJoins: '20-45 min' },
    capabilities: {
      readSummary: 'GET /api/fb-agent/fb-groups',
      readCampaigns: 'GET /api/fb-campaigns',
      createCampaign: 'POST /api/fb-campaigns (nace DRAFT; el operador aprueba con PATCH action=approve; HITL)',
    },
  });
}
