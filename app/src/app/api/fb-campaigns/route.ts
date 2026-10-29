import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { computeCap, todayKey } from '@/lib/fb-groups';
import { computeRiskScore, riskInputFromCampaign } from '@/lib/fb-risk';

export const dynamic = 'force-dynamic';

// Campañas FB-GROUPS: un texto aprobado → un job por objetivo.
export async function GET() {
  const campaigns = await db.fbCampaign.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      jobs: {
        select: { id: true, status: true, targetName: true, targetKind: true, variantSource: true, postUrl: true, failReason: true, postedAt: true, updatedAt: true, attempts: true, worker: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  const summary = campaigns.map((c) => {
    let mediaCount = 0;
    try { const arr = JSON.parse(c.mediaUrls ?? '[]'); if (Array.isArray(arr)) mediaCount = arr.length; } catch { /* sin adjuntos */ }
    return {
    ...c,
    mediaCount,
    counts: {
      total: c.jobs.length,
      queued: c.jobs.filter((j) => j.status === 'QUEUED' || j.status === 'LEASED').length,
      posted: c.jobs.filter((j) => j.status === 'POSTED').length,
      failed: c.jobs.filter((j) => j.status === 'FAILED').length,
      review: c.jobs.filter((j) => j.status === 'PENDING_REVIEW').length,
    },
    jobs: c.jobs.map((j) => ({ ...j, workerName: j.worker?.name ?? null, worker: undefined })),
    };
  });
  return NextResponse.json({ campaigns: summary });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body.name || !body.text) return NextResponse.json({ error: 'name y text requeridos' }, { status: 400 });
  const mode = ['group', 'profile', 'page_in_group'].includes(body.mode) ? body.mode : 'group';
  const engine = body.engine === 'internal' ? 'internal' : 'dom';
  const targets: string[] = Array.isArray(body.targets) ? body.targets.map(String) : [];

  if (mode !== 'profile' && targets.length === 0) {
    return NextResponse.json({ error: 'targets[] requerido (ids de FbGroup) para modo group/page_in_group' }, { status: 400 });
  }
  if (engine === 'internal') {
    return NextResponse.json({ error: 'Motor internal es experimental y está deshabilitado en v1 (honestidad del módulo)' }, { status: 400 });
  }

  // Adjuntos (P1): hasta 4 imágenes por post; URL http(s) accesible por el worker o ruta local de su máquina.
  const mediaList: string[] = Array.isArray(body.mediaUrls)
    ? body.mediaUrls.map((m: unknown) => String(m).trim()).filter(Boolean)
    : [];
  if (mediaList.length > 4) {
    return NextResponse.json({ error: 'Máximo 4 adjuntos por campaña (límite de Facebook)' }, { status: 400 });
  }
  for (const m of mediaList) {
    const isUrl = /^https?:\/\//i.test(m);
    const isLocalPath = m.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(m);
    if (!isUrl && !isLocalPath) {
      return NextResponse.json({ error: `Adjunto inválido "${m.slice(0, 60)}": usa URL http(s) o ruta local del worker` }, { status: 400 });
    }
  }
  const mediaUrls = JSON.stringify(mediaList);
  const mediaMode = body.mediaMode === 'rotate' ? 'rotate' : 'all';
  const boldStyle = body.boldStyle === 'unicode' ? 'unicode' : 'none';
  const commentDelaySec = Math.max(0, Math.min(3600, Number.isFinite(body.commentDelaySec) ? Number(body.commentDelaySec) : 0));

  const groups = targets.length > 0
    ? await db.fbGroup.findMany({ where: { id: { in: targets }, excluded: false } })
    : [];

  if (mode !== 'profile' && groups.length === 0) {
    return NextResponse.json({ error: 'Ningún objetivo válido (¿excluidos?)' }, { status: 400 });
  }

  // Score de riesgo pre-vuelo (roadmap #1): peor caso entre workers registrados
  // (la cuenta más joven manda). Instantánea honesta, no una promesa.
  const day = todayKey();
  const workersForRisk = await db.fbWorker.findMany({ orderBy: { sessionAgeDays: 'asc' } });
  const usagesForRisk = await db.fbDailyUsage.findMany({ where: { day } });
  const youngest = workersForRisk[0] ?? null;
  const riskInput = riskInputFromCampaign(
    { text: String(body.text), mediaUrls, firstComment: String(body.firstComment ?? ''), windowStart: Number.isFinite(body.windowStart) ? Number(body.windowStart) : 7, windowEnd: Number.isFinite(body.windowEnd) ? Number(body.windowEnd) : 21, targetCount: mode === 'profile' ? 1 : groups.length },
    youngest ? { sessionAgeDays: youngest.sessionAgeDays, usedToday: usagesForRisk.find((u) => u.workerId === youngest.id)?.posts ?? 0, cap: computeCap(youngest.sessionAgeDays) } : null,
  );
  const risk = computeRiskScore(riskInput);

  const campaign = await db.fbCampaign.create({
    data: {
      brandId: body.brandId ? String(body.brandId) : null,
      draftId: body.draftId ? String(body.draftId) : null,
      name: String(body.name),
      text: String(body.text),
      mode,
      engine,
      pageName: body.pageName ? String(body.pageName) : '',
      firstComment: body.firstComment ? String(body.firstComment) : '',
      windowStart: Number.isFinite(body.windowStart) ? Number(body.windowStart) : 7,
      windowEnd: Number.isFinite(body.windowEnd) ? Number(body.windowEnd) : 21,
      mediaUrls,
      mediaMode,
      boldStyle,
      commentDelaySec,
      riskScore: risk.score,
      riskLevel: risk.level,
    },
  });

  if (mode === 'profile') {
    await db.fbJob.create({ data: { campaignId: campaign.id, targetKind: 'profile', targetName: 'PERFIL', targetUrl: 'https://www.facebook.com/', mediaUrls } });
  } else {
    for (const g of groups) {
      await db.fbJob.create({ data: { campaignId: campaign.id, targetKind: mode, targetName: g.name, targetUrl: g.url || `https://www.facebook.com/groups/${g.fbId}`, groupId: g.id, mediaUrls } });
    }
  }

  await db.auditEntry.create({
    data: { actor: 'human', action: 'FB_CAMPAIGN_CREATED', targetType: 'FB_CAMPAIGN', targetId: campaign.id, allowed: true, reason: `Campaña "${campaign.name}" con ${mode === 'profile' ? 1 : groups.length} objetivo(s), motor ${engine}, ventana ${campaign.windowStart}-${campaign.windowEnd}${mediaList.length ? `, ${mediaList.length} adjunto(s)${mediaMode === 'rotate' ? ' rotados' : ''}` : ''}${commentDelaySec ? `, bump-comment con ${commentDelaySec}s de espera` : ''}${boldStyle === 'unicode' ? ', negrita unicode' : ''} · riesgo pre-vuelo ${risk.score} (${risk.level})` },
  });

  return NextResponse.json({ campaign: { id: campaign.id, name: campaign.name }, jobs: mode === 'profile' ? 1 : groups.length, risk: { score: risk.score, level: risk.level, factors: risk.factors, mitigations: risk.mitigations } });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body.campaignId || !body.action) return NextResponse.json({ error: 'campaignId y action requeridos' }, { status: 400 });
  const campaign = await db.fbCampaign.findUnique({ where: { id: String(body.campaignId) } });
  if (!campaign) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });

  if (body.action === 'cancel') {
    await db.fbCampaign.update({ where: { id: campaign.id }, data: { status: 'CANCELLED' } });
    await db.fbJob.updateMany({ where: { campaignId: campaign.id, status: { in: ['QUEUED', 'LEASED'] } }, data: { status: 'CANCELLED', leaseUntil: null } });
  } else if (body.action === 'pause') {
    await db.fbCampaign.update({ where: { id: campaign.id }, data: { status: 'PAUSED' } });
    await db.fbJob.updateMany({ where: { campaignId: campaign.id, status: 'LEASED' }, data: { status: 'QUEUED', leaseUntil: null } });
  } else if (body.action === 'resume') {
    await db.fbCampaign.update({ where: { id: campaign.id }, data: { status: 'QUEUED' } });
  } else {
    return NextResponse.json({ error: 'Acción no soportada' }, { status: 400 });
  }
  await db.auditEntry.create({ data: { actor: 'human', action: `FB_CAMPAIGN_${String(body.action).toUpperCase()}`, targetType: 'FB_CAMPAIGN', targetId: campaign.id, allowed: true, reason: `Campaña "${campaign.name}": ${body.action}` } });
  return NextResponse.json({ ok: true });
}
