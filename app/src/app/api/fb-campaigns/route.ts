import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { computeCap, todayKey } from '@/lib/fb-groups';
import { computeRiskScore, riskInputFromCampaign } from '@/lib/fb-risk';
import { authorize } from '@/lib/meta-policy';
import { guardPanel } from '@/lib/panel-auth';

export const dynamic = 'force-dynamic';

// Campañas FB-GROUPS: un texto aprobado → un job por objetivo.
export async function GET() {
  const campaigns = await db.fbCampaign.findMany({
    orderBy: { createdAt: 'desc' },
    take: 300, // tope defensivo: el payload del panel no crece sin límite (F-OPS-11)
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
      pendingApproval: c.jobs.filter((j) => j.status === 'PENDING_APPROVAL').length,
    },
    jobs: c.jobs.map((j) => ({ ...j, workerName: j.worker?.name ?? null, worker: undefined })),
    };
  });
  return NextResponse.json({ campaigns: summary });
}

/** Ventana horaria válida: enteros, start 0-23, end 0-24, start ≠ end. */
function parseWindow(rawStart: unknown, rawEnd: unknown): { start: number; end: number } | { error: string } {
  const start = Number.isFinite(rawStart) ? Math.trunc(Number(rawStart)) : 7;
  const end = Number.isFinite(rawEnd) ? Math.trunc(Number(rawEnd)) : 21;
  if (start < 0 || start > 23 || end < 0 || end > 24 || start === end) {
    return { error: 'Ventana inválida: enteros, inicio 0-23, fin 0-24 e inicio ≠ fin (día completo: 0-24 con nightOverride si aplica el corte nocturno)' };
  }
  return { start, end };
}

export async function POST(req: NextRequest) {
  const denied = guardPanel(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  if (!body.name || !body.text) return NextResponse.json({ error: 'name y text requeridos' }, { status: 400 });
  const name = String(body.name);
  const text = String(body.text);
  if (name.length > 200) return NextResponse.json({ error: 'name excede 200 caracteres' }, { status: 400 });
  if (text.length > 5000) return NextResponse.json({ error: 'text excede 5000 caracteres' }, { status: 400 });
  const mode = ['group', 'profile', 'page_in_group'].includes(body.mode) ? body.mode : 'group';
  const engine = body.engine === 'internal' ? 'internal' : 'dom';
  const targets: string[] = Array.isArray(body.targets) ? body.targets.map(String) : [];
  if (targets.length > 200) {
    return NextResponse.json({ error: 'Máximo 200 objetivos por campaña' }, { status: 400 });
  }

  if (mode !== 'profile' && targets.length === 0) {
    return NextResponse.json({ error: 'targets[] requerido (ids de FbGroup) para modo group/page_in_group' }, { status: 400 });
  }
  if (engine === 'internal') {
    return NextResponse.json({ error: 'Motor internal es experimental y está deshabilitado en v1 (honestidad del módulo)' }, { status: 400 });
  }

  // Ventana horaria (F-DATA-25): validación real, no delegada al cliente.
  const win = parseWindow(body.windowStart, body.windowEnd);
  if ('error' in win) return NextResponse.json({ error: win.error }, { status: 400 });
  // Corte nocturno (FICHA §6.3): solo una campaña con nightOverride=true vuela
  // entre 22:00 y 07:00; la decisión queda en la auditoría de creación.
  const nightOverride = body.nightOverride === true;

  // Adjuntos (P1): hasta 4 imágenes por post; URL http(s) accesible por el worker o ruta local de su máquina.
  const mediaList: string[] = Array.isArray(body.mediaUrls)
    ? body.mediaUrls.map((m: unknown) => String(m).trim()).filter(Boolean)
    : [];
  if (mediaList.length > 4) {
    return NextResponse.json({ error: 'Máximo 4 adjuntos por campaña (límite de Facebook)' }, { status: 400 });
  }
  for (const m of mediaList) {
    if (m.includes('..')) {
      return NextResponse.json({ error: `Adjunto inválido "${m.slice(0, 60)}": rutas con salto de directorio (..) no se aceptan` }, { status: 400 });
    }
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
  // P2 (gate pre-vuelo): por defecto la campaña nace DRAFT con jobs PENDING_APPROVAL;
  // el worker NO ve nada hasta que un humano aprueba (HITL formal, auditado).
  // body.approve=true conserva el flujo directo para scripts y pruebas.
  let approveNow = body.approve === true;

  // ── META POLICY INTELLIGENCE: consulta al motor ANTES de aceptar el trabajo.
  // Que sea técnicamente posible no significa que Meta lo autorice: si el motor
  // bloquea, no se crea la campaña; si exige aprobación, nace borrador sí o sí.
  const policy = await authorize({
    operation: 'FB_GROUP_POST',
    approvedByHuman: approveNow,
    actor: approveNow ? 'human' : 'human:campaign-draft',
    note: `creación de campaña "${name.slice(0, 60)}"`,
  });
  if (policy.verdict === 'BLOQUEADO' || policy.verdict === 'POLITICA_DESACTUALIZADA') {
    await db.auditEntry.create({ data: { actor: 'system:policy-engine', action: 'META_POLICY_BLOCK', targetType: 'FB_CAMPAIGN', targetId: 'create', allowed: false, reason: `Campaña "${name.slice(0, 60)}" rechazada por el motor: ${policy.reasons.join(' | ')}` } });
    return NextResponse.json({ error: `Motor de cumplimiento Meta: ${policy.verdict}`, policy }, { status: 403 });
  }
  const forcedDraft = policy.verdict === 'REQUIERE_APROBACION' || policy.verdict === 'NO_VERIFICADO';
  if (forcedDraft && approveNow) {
    // El motor exige aprobación humana en condiciones actuales: la campaña nace
    // borrador aunque el script pidiera aprobación directa (honestidad del gate).
    approveNow = false;
  }

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
    { text, mediaUrls, firstComment: String(body.firstComment ?? ''), windowStart: win.start, windowEnd: win.end, targetCount: mode === 'profile' ? 1 : groups.length },
    youngest ? { sessionAgeDays: youngest.sessionAgeDays, usedToday: usagesForRisk.find((u) => u.workerId === youngest.id)?.posts ?? 0, cap: computeCap(youngest.sessionAgeDays) } : null,
  );
  const risk = computeRiskScore(riskInput);

  // Creación ATÓMICA (F-DATA-10): campaña + jobs + auditoría en una sola
  // transacción; si algo falla, no quedan campañas zombie ni auditoría a medias.
  const jobStatus = approveNow ? 'QUEUED' : 'PENDING_APPROVAL';
  const jobsData = mode === 'profile'
    ? [{ targetKind: 'profile', targetName: 'PERFIL', targetUrl: 'https://www.facebook.com/', groupId: null as string | null, mediaUrls, status: jobStatus }]
    : groups.map((g) => ({ targetKind: mode, targetName: g.name, targetUrl: g.url || `https://www.facebook.com/groups/${g.fbId}`, groupId: g.id, mediaUrls, status: jobStatus }));

  const { campaign, jobCount } = await db.$transaction(async (tx) => {
    const created = await tx.fbCampaign.create({
      data: {
        brandId: body.brandId ? String(body.brandId) : null,
        draftId: body.draftId ? String(body.draftId) : null,
        name,
        text,
        mode,
        engine,
        pageName: body.pageName ? String(body.pageName) : '',
        firstComment: body.firstComment ? String(body.firstComment) : '',
        windowStart: win.start,
        windowEnd: win.end,
        nightOverride,
        mediaUrls,
        mediaMode,
        boldStyle,
        commentDelaySec,
        riskScore: risk.score,
        riskLevel: risk.level,
        status: approveNow ? 'QUEUED' : 'DRAFT',
        approvedAt: approveNow ? new Date() : null,
      },
    });
    await tx.fbJob.createMany({
      data: jobsData.map((j) => ({
        campaignId: created.id,
        targetKind: j.targetKind,
        targetName: j.targetName,
        targetUrl: j.targetUrl,
        groupId: j.groupId,
        mediaUrls: j.mediaUrls,
        status: j.status,
      })),
    });
    await tx.auditEntry.create({
      data: { actor: 'human', action: 'FB_CAMPAIGN_CREATED', targetType: 'FB_CAMPAIGN', targetId: created.id, allowed: true, reason: `Campaña "${created.name}" con ${jobsData.length} objetivo(s), motor ${engine}, ventana ${created.windowStart}-${created.windowEnd}${nightOverride ? ' (NIGHT OVERRIDE: corte nocturno 22-07 levantado explícitamente)' : ''}${mediaList.length ? `, ${mediaList.length} adjunto(s)${mediaMode === 'rotate' ? ' rotados' : ''}` : ''}${commentDelaySec ? `, bump-comment con ${commentDelaySec}s de espera` : ''}${boldStyle === 'unicode' ? ', negrita unicode' : ''} · riesgo pre-vuelo ${risk.score} (${risk.level}) · política Meta: ${policy.verdict}${approveNow ? ' · APROBADA al crear' : ' · BORRADOR pendiente de aprobación (el worker no la ve hasta aprobarla)'}` },
    });
    return { campaign: created, jobCount: jobsData.length };
  });

  return NextResponse.json({ campaign: { id: campaign.id, name: campaign.name, status: campaign.status, approvedAt: campaign.approvedAt }, jobs: jobCount, risk: { score: risk.score, level: risk.level, factors: risk.factors, mitigations: risk.mitigations }, policy: { verdict: policy.verdict, reasons: policy.reasons, forcedDraft, conditions: policy.conditions, cap: policy.cap ?? null } });
}

export async function PATCH(req: NextRequest) {
  const denied = guardPanel(req);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  if (!body.campaignId || !body.action) return NextResponse.json({ error: 'campaignId y action requeridos' }, { status: 400 });
  const campaign = await db.fbCampaign.findUnique({ where: { id: String(body.campaignId) } });
  if (!campaign) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });

  if (body.action === 'approve') {
    // P2: aprobación formal pre-vuelo. Solo un borrador se aprueba; deja rastro
    // auditado (quién y cuándo) y es lo que arma la campaña para el worker.
    if (campaign.status !== 'DRAFT') {
      return NextResponse.json({ error: `Solo un borrador se aprueba (estado actual: ${campaign.status})` }, { status: 409 });
    }
    // ── META POLICY INTELLIGENCE: el motor se consulta también al aprobar.
    // La aprobación humana satisface el HITL, pero NO anula bloqueos activos
    // (apagado de emergencia, cambio crítico sin analizar, documentación vencida).
    const policy = await authorize({ operation: 'FB_CAMPAIGN_APPROVAL', approvedByHuman: true, actor: 'human', note: `aprobación de campaña "${campaign.name}"` });
    if (policy.verdict === 'BLOQUEADO' || policy.verdict === 'POLITICA_DESACTUALIZADA') {
      await db.auditEntry.create({ data: { actor: 'system:policy-engine', action: 'META_POLICY_BLOCK', targetType: 'FB_CAMPAIGN', targetId: campaign.id, allowed: false, reason: `Aprobación de "${campaign.name}" denegada por el motor (${policy.verdict}): ${policy.reasons.join(' | ')}` } });
      return NextResponse.json({ error: `Motor de cumplimiento Meta: ${policy.verdict}`, policy }, { status: 403 });
    }
    const res = await db.fbJob.updateMany({ where: { campaignId: campaign.id, status: 'PENDING_APPROVAL' }, data: { status: 'QUEUED' } });
    await db.fbCampaign.update({ where: { id: campaign.id }, data: { status: 'QUEUED', approvedAt: new Date() } });
    await db.auditEntry.create({ data: { actor: 'human', action: 'FB_CAMPAIGN_APPROVED', targetType: 'FB_CAMPAIGN', targetId: campaign.id, allowed: true, reason: `Campaña "${campaign.name}" APROBADA pre-vuelo por un humano (política Meta: ${policy.verdict}): ${res.count} job(s) entran en cola (dentro de ventana y techo el worker los reclama)` } });
    return NextResponse.json({ ok: true, approved: res.count, policy: { verdict: policy.verdict, conditions: policy.conditions, cap: policy.cap ?? null } });
  } else if (body.action === 'cancel') {
    if (campaign.status === 'CANCELLED') return NextResponse.json({ ok: true });
    await db.fbCampaign.update({ where: { id: campaign.id }, data: { status: 'CANCELLED' } });
    // F2-ARC-05: los leases EN VUELO no se revocan (filosofía igual que la
    // pausa): el post en vuelo terminará y se reportará con honestidad; el
    // guard de reportes ya ignora estados terminales si llegó tarde.
    await db.fbJob.updateMany({ where: { campaignId: campaign.id, status: { in: ['PENDING_APPROVAL', 'QUEUED'] } }, data: { status: 'CANCELLED', leaseUntil: null } });
  } else if (body.action === 'pause') {
    if (campaign.status !== 'QUEUED' && campaign.status !== 'RUNNING') {
      return NextResponse.json({ error: `Solo se pausa una campaña en cola o en marcha (estado actual: ${campaign.status}); un borrador se aprueba o se cancela` }, { status: 409 });
    }
    await db.fbCampaign.update({ where: { id: campaign.id }, data: { status: 'PAUSED' } });
    // F-DATA-08: los leases EN VUELO ya están ejecutándose en el worker; sacarlos
    // de lease y reencolarlos habilitaba el doble disparo que el lease evita.
    // La pausa solo impide NUEVOS claims; el job en vuelo termina su ciclo y se
    // reporta con honestidad (o su lease vence y el reaper lo reencola).
  } else if (body.action === 'resume') {
    if (campaign.status !== 'PAUSED') {
      return NextResponse.json({ error: `Solo se reanuda una campaña pausada (estado actual: ${campaign.status})` }, { status: 409 });
    }
    await db.fbCampaign.update({ where: { id: campaign.id }, data: { status: 'QUEUED' } });
  } else {
    return NextResponse.json({ error: 'Acción no soportada' }, { status: 400 });
  }
  await db.auditEntry.create({ data: { actor: 'human', action: `FB_CAMPAIGN_${String(body.action).toUpperCase()}`, targetType: 'FB_CAMPAIGN', targetId: campaign.id, allowed: true, reason: `Campaña "${campaign.name}": ${body.action}${body.action === 'pause' ? ' (los leases en vuelo terminan su ciclo y se reportan; no se generan nuevos claims)' : ''}` } });
  return NextResponse.json({ ok: true });
}
