import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { syncRegistry, computeStatus, TOOLS } from '@/lib/registry';
import { AGENTS } from '@/lib/agents';

export const dynamic = 'force-dynamic';

// Estado global del arnés (doctor): herramientas, agentes, pausa, modo
export async function GET() {
  await syncRegistry();
  const [tools, pausedSetting, modeSetting, brands, errorCount, pendingApprovals] = await Promise.all([
    db.toolRecord.findMany(),
    db.setting.findUnique({ where: { key: 'global_pause' } }),
    db.setting.findUnique({ where: { key: 'autonomy_mode' } }),
    db.brand.findMany({ include: { accounts: true, _count: { select: { publications: true, drafts: true } } } }),
    db.errorLog.count({ where: { resolved: false } }),
    db.approval.count({ where: { status: 'PENDING' } }),
  ]);

  return NextResponse.json({
    status: pausedSetting?.value === 'true' ? 'PAUSED' : 'OPERATIONAL',
    autonomyMode: modeSetting?.value ?? 'L2_SUPERVISED',
    paused: pausedSetting?.value === 'true',
    tools: tools.map((t) => ({ ...t, contracts: JSON.parse(t.contracts), capabilities: JSON.parse(t.capabilities) })),
    agents: AGENTS.map((a) => ({ key: a.key, name: a.name, role: a.role, limits: a.limits, allowedContracts: a.allowedContracts })),
    brands,
    alerts: { unresolvedErrors: errorCount, pendingApprovals },
    definitions: TOOLS.length,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body.action === 'pause') {
    const { setPaused } = await import('@/lib/orchestrator');
    await setPaused(true);
    return NextResponse.json({ ok: true, paused: true });
  }
  if (body.action === 'resume') {
    const { setPaused } = await import('@/lib/orchestrator');
    await setPaused(false);
    return NextResponse.json({ ok: true, paused: false });
  }
  if (body.action === 'set_mode') {
    const mode = String(body.mode);
    if (!['L1_ASSISTED', 'L2_SUPERVISED', 'L3_AUTONOMOUS_LIMITED'].includes(mode)) {
      return NextResponse.json({ error: 'Modo inválido' }, { status: 400 });
    }
    await db.setting.upsert({ where: { key: 'autonomy_mode' }, create: { key: 'autonomy_mode', value: mode }, update: { value: mode } });
    await db.auditEntry.create({ data: { actor: 'human', action: 'SET_AUTONOMY', targetType: 'SYSTEM', allowed: true, reason: `Modo de autonomía: ${mode}` } });
    return NextResponse.json({ ok: true, mode });
  }
  return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 });
}
