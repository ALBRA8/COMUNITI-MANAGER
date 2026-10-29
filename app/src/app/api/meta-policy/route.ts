import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  ensurePolicySourcesSeeded, runDueChecks, checkSource, registerManualReview,
  authorize, policyState, buildReport, POLICY_SETTINGS,
} from '@/lib/meta-policy';

export const dynamic = 'force-dynamic';

// META POLICY INTELLIGENCE — API del Centro de Cumplimiento Meta.
// GET: estado completo del motor + fuentes + cambios + incidentes + auditoría
//      (+ ?report=daily|weekly|monthly para informes computados).
// POST: acciones humanas auditadas (verificación, revisión manual, clasificación
//       de cambios, apagado de emergencia, exclusión de objetivos). Ninguna de
//       estas acciones está expuesta a agentes: el puente agéntico (fb-agent)
//       es de solo lectura y no puede desactivar restricciones.

export async function GET(req: NextRequest) {
  await ensurePolicySourcesSeeded();
  const url = new URL(req.url);
  const reportKind = url.searchParams.get('report');

  if (reportKind === 'daily' || reportKind === 'weekly' || reportKind === 'monthly') {
    const report = await buildReport(reportKind.toUpperCase() as 'DAILY' | 'WEEKLY' | 'MONTHLY');
    return NextResponse.json({ report });
  }

  const [state, sources, changes, incidents, recentChecks] = await Promise.all([
    policyState(),
    db.metaPolicySource.findMany({ orderBy: [{ priority: 'asc' }, { key: 'asc' }] }),
    db.metaPolicyChange.findMany({ include: { source: { select: { key: true, name: true, url: true, product: true } } }, orderBy: { detectedAt: 'desc' }, take: 100 }),
    db.metaPolicyIncident.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
    db.metaPolicyCheckRun.findMany({ include: { source: { select: { key: true, name: true } } }, orderBy: { createdAt: 'desc' }, take: 60 }),
  ]);

  const decisions = await db.auditEntry.findMany({
    where: { action: { in: ['META_POLICY_CHECK', 'META_POLICY_MANUAL_REVIEW', 'META_POLICY_EMERGENCY_STOP', 'META_POLICY_EMERGENCY_LIFT'] } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json({
    state,
    sources,
    changes,
    incidents,
    recentChecks,
    decisions,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? '');

  if (action === 'run-checks') {
    // Verificación ahora: forceAll revisa todas; si no, solo las vencidas.
    const res = await runDueChecks(new Date(), body.forceAll === true);
    return NextResponse.json({ ok: true, ran: res.ran, results: res.results });
  }

  if (action === 'check-source') {
    if (!body.sourceId) return NextResponse.json({ error: 'sourceId requerido' }, { status: 400 });
    try {
      const result = await checkSource(String(body.sourceId), 'MANUAL');
      return NextResponse.json({ ok: true, result });
    } catch (e) {
      return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
    }
  }

  if (action === 'manual-review') {
    // Procedimiento alternativo honesto para fuentes no consultables automáticamente.
    if (!body.sourceId) return NextResponse.json({ error: 'sourceId requerido' }, { status: 400 });
    const res = await registerManualReview(String(body.sourceId), String(body.note ?? ''));
    return NextResponse.json(res, { status: res.ok ? 200 : 400 });
  }

  if (action === 'review-change') {
    if (!body.changeId) return NextResponse.json({ error: 'changeId requerido' }, { status: 400 });
    const change = await db.metaPolicyChange.findUnique({ where: { id: String(body.changeId) }, include: { source: true } });
    if (!change) return NextResponse.json({ error: 'Cambio no encontrado' }, { status: 404 });
    const status = ['ANALYZED', 'ACCEPTED', 'DISMISSED'].includes(String(body.status)) ? String(body.status) : 'ANALYZED';
    const severity = ['CRITICO', 'ALTO', 'MEDIO', 'BAJO'].includes(String(body.severity)) ? String(body.severity) : change.severity;
    await db.metaPolicyChange.update({
      where: { id: change.id },
      data: {
        status,
        severity,
        summary: body.summary !== undefined ? String(body.summary).slice(0, 4000) : change.summary,
        impact: body.impact !== undefined ? String(body.impact).slice(0, 4000) : change.impact,
        recommendation: body.recommendation !== undefined ? String(body.recommendation).slice(0, 2000) : change.recommendation,
        reviewNote: String(body.note ?? '').slice(0, 2000),
        reviewedAt: new Date(),
      },
    });
    await db.auditEntry.create({
      data: { actor: 'human', action: 'META_POLICY_CHANGE_REVIEWED', targetType: 'META_POLICY_CHANGE', targetId: change.id, allowed: true, reason: `Cambio ${change.kind} en "${change.source.name}" → ${status} (severidad ${severity}). Nota: ${String(body.note ?? '').slice(0, 300)}` },
    });
    // Un cambio crítico aceptado o descartado deja de bloquear (ya no está OPEN).
    return NextResponse.json({ ok: true, note: status === 'DISMISSED' ? 'Cambio descartado con nota; deja de bloquear' : 'Análisis registrado' });
  }

  if (action === 'emergency-stop') {
    // Apagado de emergencia: bloquea TODA operación Meta. Solo acción humana.
    const reason = String(body.reason ?? '').trim() || 'Parada de emergencia solicitada por el administrador';
    await db.setting.upsert({
      where: { key: POLICY_SETTINGS.killSwitch },
      create: { key: POLICY_SETTINGS.killSwitch, value: JSON.stringify({ reason, at: new Date().toISOString() }) },
      update: { value: JSON.stringify({ reason, at: new Date().toISOString() }) },
    });
    await db.metaPolicyIncident.create({ data: { kind: 'EMERGENCY_STOP', severity: 'CRITICO', module: 'harness', description: `Apagado de emergencia: ${reason}` } });
    await db.auditEntry.create({ data: { actor: 'human', action: 'META_POLICY_EMERGENCY_STOP', targetType: 'META_POLICY', targetId: 'engine', allowed: true, reason } });
    return NextResponse.json({ ok: true, note: 'Parada de emergencia activa: toda operación Meta queda bloqueada' });
  }

  if (action === 'lift-emergency') {
    const note = String(body.note ?? '').trim();
    if (note.length < 5) return NextResponse.json({ error: 'Indica la razón de reactivación (mínimo 5 caracteres)' }, { status: 400 });
    await db.setting.deleteMany({ where: { key: POLICY_SETTINGS.killSwitch } });
    await db.metaPolicyIncident.updateMany({ where: { kind: 'EMERGENCY_STOP', status: 'OPEN' }, data: { status: 'RESOLVED', resolvedAt: new Date(), resolutionNote: `Reactivado por humano: ${note}` } });
    await db.auditEntry.create({ data: { actor: 'human', action: 'META_POLICY_EMERGENCY_LIFT', targetType: 'META_POLICY', targetId: 'engine', allowed: true, reason: note } });
    return NextResponse.json({ ok: true, note: 'Parada de emergencia levantada' });
  }

  if (action === 'set-exclusions') {
    const list: string[] = Array.isArray(body.exclusions) ? body.exclusions.map((x: unknown) => String(x).trim()).filter(Boolean) : [];
    await db.setting.upsert({ where: { key: POLICY_SETTINGS.exclusions }, create: { key: POLICY_SETTINGS.exclusions, value: JSON.stringify(list) }, update: { value: JSON.stringify(list) } });
    await db.auditEntry.create({ data: { actor: 'human', action: 'META_POLICY_EXCLUSIONS_SET', targetType: 'META_POLICY', targetId: 'exclusions', allowed: true, reason: `Lista central de exclusión actualizada: ${list.length} identificador(es)` } });
    return NextResponse.json({ ok: true, exclusions: list });
  }

  if (action === 'test-authorize') {
    // Previsualización del veredicto (no escribe auditoría ni estado).
    const res = await authorize({
      operation: String(body.operation ?? 'FB_GROUP_POST'),
      targetId: body.targetId ? String(body.targetId) : undefined,
      approvedByHuman: body.approvedByHuman === true,
      silent: true,
    });
    return NextResponse.json({ ok: true, result: res });
  }

  if (action === 'resolve-incident') {
    if (!body.incidentId) return NextResponse.json({ error: 'incidentId requerido' }, { status: 400 });
    await db.metaPolicyIncident.update({ where: { id: String(body.incidentId) }, data: { status: 'RESOLVED', resolvedAt: new Date(), resolutionNote: String(body.note ?? '').slice(0, 1000) } });
    await db.auditEntry.create({ data: { actor: 'human', action: 'META_POLICY_INCIDENT_RESOLVED', targetType: 'META_POLICY_INCIDENT', targetId: String(body.incidentId), allowed: true, reason: String(body.note ?? 'Incidente resuelto') } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Acción no soportada' }, { status: 400 });
}
