'use client';

// Centro de Cumplimiento Meta (META POLICY INTELLIGENCE) — sección de Gobierno.
// Panel de vigilancia y cumplimiento: estado del motor, fuentes oficiales con
// evidencia de verificación, cambios detectados con análisis humano, informes
// diario/semanal/mensual (hechos verificados vs interpretación vs recomendación),
// decisiones auditadas y apagado de emergencia. La revisión manual es el
// procedimiento alternativo honesto para fuentes que no se dejan consultar sola.

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SectionHeader } from '@/components/sections/dashboard';
import {
  ShieldCheck, ShieldAlert, ShieldX, RefreshCw, FileCheck2, Printer,
  PlayCircle, Ban, History, ScanSearch, CircleAlert, ClipboardCheck,
} from 'lucide-react';

// ─── Tipos (espejo de la API) ──────────────────────────────────────

interface PolicySource {
  id: string; key: string; name: string; url: string; product: string; alsoCovers: string;
  family: string; priority: string; checkIntervalHours: number; method: string; active: boolean;
  lastCheckAt: string | null; lastOkAt: string | null; lastHash: string; lastStatus: string;
  lastError: string; consecutiveFailures: number;
}

interface PolicyChange {
  id: string; sourceId: string; kind: string; severity: string; summary: string; impact: string;
  affectedModules: string; recommendation: string; status: string; detectedAt: string;
  reviewedAt: string | null; reviewNote: string;
  source: { key: string; name: string; url: string; product: string };
}

interface PolicyIncident {
  id: string; kind: string; severity: string; module: string; description: string;
  status: string; resolutionNote: string; createdAt: string; resolvedAt: string | null;
}

interface CheckRun {
  id: string; sourceId: string; kind: string; status: string; httpStatus: number | null;
  durationMs: number | null; hash: string; previousHash: string; error: string;
  evidence: string; createdAt: string; source: { key: string; name: string };
}

interface AuditRow {
  id: string; actor: string; action: string; targetType: string; targetId: string;
  allowed: boolean; reason: string; createdAt: string;
}

interface PolicyStateResponse {
  state: {
    engineEnabled: boolean;
    killSwitch: { reason: string; at: string } | null;
    exclusions: string[];
    staleDays: number;
    overall: 'AL_DIA' | 'ATENCION' | 'DESACTUALIZADO' | 'BLOQUEADO';
    overallReasons: string[];
    sources: { total: number; ok: number; failed: number; blocked: number; neverChecked: number; manual: number };
    lastCheckAt: string | null;
    nextDueAt: string | null;
    changes: { open: number; bySeverity: Record<string, number>; pendingAnalysis: number };
    incidentsOpen: number;
    blockedChecksToday: number;
    fbGroupsFreshness: { fresh: boolean; detail: string };
  };
  sources: PolicySource[];
  changes: PolicyChange[];
  incidents: PolicyIncident[];
  recentChecks: CheckRun[];
  decisions: AuditRow[];
}

interface PolicyReportData {
  report: {
    kind: string; generatedAt: string; period: { from: string; to: string };
    facts: string[]; interpretations: string[]; recommendations: string[];
    numbers: { checks: number; failed: number; changes: number; bySeverity: Record<string, number>; incidents: number; blockedOps: number };
    sourcesUnavailable: { key: string; name: string; error: string }[];
    changesList: { key: string; name: string; kind: string; severity: string; status: string; summary: string }[];
  };
}

const PRODUCT_FILTERS = [
  { id: '', label: 'Todas' },
  { id: 'FACEBOOK', label: 'Facebook' },
  { id: 'FACEBOOK_GROUPS', label: 'Grupos' },
  { id: 'INSTAGRAM', label: 'Instagram' },
  { id: 'WHATSAPP', label: 'WhatsApp' },
  { id: 'META_BUSINESS', label: 'Meta Business' },
  { id: 'ADS', label: 'Publicidad' },
  { id: 'COMMERCE', label: 'Comercio' },
  { id: 'APIS', label: 'APIs' },
  { id: 'PRIVACY', label: 'Privacidad' },
  { id: 'DEVELOPERS', label: 'Desarrolladores' },
  { id: 'COLOMBIA', label: 'Colombia' },
  { id: 'TRANSPARENCY', label: 'Transparencia' },
];

function matchesProduct(s: PolicySource, filter: string): boolean {
  if (!filter) return true;
  return s.product === filter || s.alsoCovers.split(',').map((x) => x.trim()).includes(filter);
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

const OVERALL_STYLE: Record<string, { label: string; cls: string; Icon: typeof ShieldCheck }> = {
  AL_DIA: { label: 'Cumplimiento al día', cls: 'bg-emerald-600', Icon: ShieldCheck },
  ATENCION: { label: 'Atención: revisar pendientes', cls: 'bg-amber-500', Icon: ShieldAlert },
  DESACTUALIZADO: { label: 'Documentación desactualizada', cls: 'bg-amber-600', Icon: ShieldAlert },
  BLOQUEADO: { label: 'Operaciones bloqueadas', cls: 'bg-red-600', Icon: ShieldX },
};

const SEVERITY_CLS: Record<string, string> = {
  CRITICO: 'bg-red-600 text-white',
  ALTO: 'bg-orange-500 text-white',
  MEDIO: 'bg-amber-400 text-black',
  BAJO: 'bg-muted text-muted-foreground',
};

const SOURCE_STATUS_CLS: Record<string, string> = {
  OK: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  CHANGED: 'bg-amber-100 text-amber-800 border-amber-200',
  FAILED: 'bg-red-100 text-red-800 border-red-200',
  BLOCKED: 'bg-red-100 text-red-800 border-red-200',
  PENDING: 'bg-muted text-muted-foreground border-border',
};

// ─── Sección principal ─────────────────────────────────────────────

export function MetaComplianceSection() {
  const [data, setData] = useState<PolicyStateResponse | null>(null);
  const [busy, setBusy] = useState('');
  const [filter, setFilter] = useState('');
  const [manualSource, setManualSource] = useState<PolicySource | null>(null);
  const [manualNote, setManualNote] = useState('');
  const [reviewChange, setReviewChange] = useState<PolicyChange | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [report, setReport] = useState<PolicyReportData['report'] | null>(null);
  const [exclusionsText, setExclusionsText] = useState('');
  const [stopReason, setStopReason] = useState('');
  const [stopOpen, setStopOpen] = useState(false);
  const [liftNote, setLiftNote] = useState('');
  const [liftOpen, setLiftOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/meta-policy', { cache: 'no-store' });
      const json: PolicyStateResponse = await res.json();
      setData(json);
      setExclusionsText((json.state.exclusions ?? []).join('\n'));
    } catch {
      // reintenta en el siguiente ciclo
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const post = async (body: Record<string, unknown>, tag: string) => {
    setBusy(tag);
    try {
      const res = await fetch('/api/meta-policy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok && json.error) alert(`El panel respondió: ${json.error}`);
      return json;
    } finally {
      setBusy('');
      load();
    }
  };

  const loadReport = async (kind: 'daily' | 'weekly' | 'monthly') => {
    setBusy(`report-${kind}`);
    try {
      const res = await fetch(`/api/meta-policy?report=${kind}`, { cache: 'no-store' });
      const json: PolicyReportData = await res.json();
      setReport(json.report);
    } finally {
      setBusy('');
    }
  };

  if (!data) {
    return (
      <div>
        <SectionHeader title="Centro de Cumplimiento Meta" description="Vigilancia permanente de políticas, condiciones y requisitos técnicos de Meta." />
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  const { state } = data;
  const overall = OVERALL_STYLE[state.overall] ?? OVERALL_STYLE.ATENCION;
  const sourcesFiltered = data.sources.filter((s) => matchesProduct(s, filter));
  const changesFiltered = data.changes.filter((c) => matchesProduct(c.source as unknown as PolicySource, filter));

  return (
    <div>
      <SectionHeader title="Centro de Cumplimiento Meta" description="META POLICY INTELLIGENCE — vigilancia, versionado y autorización central. Que una acción sea técnicamente posible no significa que Meta la autorice; lo no verificado nunca es permiso." />

      {/* Estado general */}
      <Card className="mb-4">
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-white ${overall.cls}`}>
            <overall.Icon className="h-5 w-5" />
            <div className="leading-tight">
              <p className="text-sm font-semibold">{overall.label}</p>
              <p className="text-[11px] opacity-90">Motor {state.engineEnabled ? 'activo' : 'deshabilitado'} · vence documentación a {state.staleDays} días</p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground space-y-0.5 min-w-48 flex-1">
            {state.overallReasons.length === 0 ? (
              <p>Sin bloqueos ni pendientes críticos registrados.</p>
            ) : (
              state.overallReasons.map((r, i) => <p key={i}>· {r}</p>)
            )}
            <p>Última verificación: <strong>{fmtDate(state.lastCheckAt)}</strong> · Próxima programada: <strong>{fmtDate(state.nextDueAt)}</strong></p>
            {state.killSwitch && <p className="text-red-700 font-medium">Parada de emergencia vigente desde {fmtDate(state.killSwitch.at)}: {state.killSwitch.reason}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy !== ''} onClick={() => post({ action: 'run-checks' }, 'run')}>
              <RefreshCw className={`h-4 w-4 mr-1 ${busy === 'run' ? 'animate-spin' : ''}`} /> Verificar vencidas
            </Button>
            <Button size="sm" variant="outline" disabled={busy !== ''} onClick={() => post({ action: 'run-checks', forceAll: true }, 'all')}>
              <PlayCircle className={`h-4 w-4 mr-1 ${busy === 'all' ? 'animate-spin' : ''}`} /> Verificar todas ahora
            </Button>
            {state.killSwitch ? (
              <Button size="sm" variant="default" onClick={() => { setLiftNote(''); setLiftOpen(true); }}>
                <ShieldCheck className="h-4 w-4 mr-1" /> Levantar emergencia
              </Button>
            ) : (
              <Button size="sm" variant="destructive" onClick={() => { setStopReason(''); setStopOpen(true); }}>
                <Ban className="h-4 w-4 mr-1" /> Apagado de emergencia
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
        <KpiCard label="Fuentes verificadas" value={`${state.sources.ok}/${state.sources.total}`} tone="ok" />
        <KpiCard label="No verificables (fallo/bloqueo)" value={`${state.sources.failed + state.sources.blocked}`} tone="warn" />
        <KpiCard label="Nunca verificadas" value={`${state.sources.neverChecked}`} tone={state.sources.neverChecked > 0 ? 'warn' : 'ok'} />
        <KpiCard label="Cambios abiertos" value={`${state.changes.open}`} sub={Object.entries(state.changes.bySeverity).filter(([, v]) => v > 0).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—'} tone={state.changes.bySeverity.CRITICO > 0 ? 'bad' : state.changes.open > 0 ? 'warn' : 'ok'} />
        <KpiCard label="Incidentes abiertos" value={`${state.incidentsOpen}`} tone={state.incidentsOpen > 0 ? 'warn' : 'ok'} />
        <KpiCard label="Operaciones bloqueadas hoy" value={`${state.blockedChecksToday}`} tone={state.blockedChecksToday > 0 ? 'warn' : 'ok'} />
      </div>

      {/* Filtros por producto */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {PRODUCT_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${filter === f.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground hover:bg-muted'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Tabs defaultValue="sources">
        <TabsList className="mb-3">
          <TabsTrigger value="sources">Fuentes ({sourcesFiltered.length})</TabsTrigger>
          <TabsTrigger value="changes">Cambios ({changesFiltered.filter((c) => c.status === 'OPEN').length} abiertos)</TabsTrigger>
          <TabsTrigger value="reports">Informes</TabsTrigger>
          <TabsTrigger value="decisions">Decisiones e incidentes</TabsTrigger>
          <TabsTrigger value="config">Exclusiones y simulador</TabsTrigger>
        </TabsList>

        {/* ── Fuentes ── */}
        <TabsContent value="sources">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><FileCheck2 className="h-4 w-4" /> Fuentes oficiales vigiladas</CardTitle>
              <CardDescription>Cada consulta deja evidencia (URL, instante, método y hash). Si una fuente no permite consulta automatizada, se registra el fallo y se usa el procedimiento alternativo: revisión humana registrada. Nunca se simula una verificación.</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[28rem]">
                <div className="space-y-2 pr-3">
                  {sourcesFiltered.map((s) => (
                    <div key={s.id} className="rounded-lg border border-border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={SOURCE_STATUS_CLS[s.lastStatus] ?? SOURCE_STATUS_CLS.PENDING}>{s.lastStatus}</Badge>
                        <span className="text-sm font-medium">{s.name}</span>
                        <Badge variant="outline" className="text-[10px]">{s.product}{s.alsoCovers ? ` +${s.alsoCovers}` : ''}</Badge>
                        <Badge variant="outline" className="text-[10px]">{s.priority === 'DAILY' ? 'cada 24 h' : s.method === 'MANUAL' ? 'revisión manual' : `cada ${Math.round(s.checkIntervalHours / 24)} d`}</Badge>
                        <span className="text-[11px] text-muted-foreground ml-auto">Última OK: {fmtDate(s.lastOkAt)}{s.lastHash ? ` · hash ${(s.lastHash || '').slice(0, 8)}` : ''}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1 break-all">{s.url}</p>
                      {s.lastError && <p className="text-[11px] text-red-700 mt-1">Fallo: {s.lastError}{s.consecutiveFailures > 0 ? ` (${s.consecutiveFailures} consecutivos)` : ''}</p>}
                      <div className="flex gap-2 mt-2">
                        <Button size="sm" variant="outline" disabled={busy !== '' || s.method === 'MANUAL'} onClick={() => post({ action: 'check-source', sourceId: s.id }, `check-${s.id}`)}>
                          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Verificar ahora
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setManualSource(s); setManualNote(''); }}>
                          <ClipboardCheck className="h-3.5 w-3.5 mr-1" /> Registrar revisión manual
                        </Button>
                      </div>
                    </div>
                  ))}
                  {sourcesFiltered.length === 0 && <p className="text-sm text-muted-foreground">Sin fuentes para este filtro.</p>}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Cambios ── */}
        <TabsContent value="changes">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><ScanSearch className="h-4 w-4" /> Cambios detectados y su análisis</CardTitle>
              <CardDescription>Un cambio CRÍTICO sin analizar bloquea automáticamente las operaciones del producto afectado. La IA nunca aplica cambios de reglas por su cuenta: el análisis, aceptación o descarte es humano y queda auditado.</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[30rem]">
                <div className="space-y-3 pr-3">
                  {changesFiltered.map((c) => (
                    <div key={c.id} className={`rounded-lg border p-3 ${c.status === 'OPEN' ? 'border-border' : 'opacity-70'}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={SEVERITY_CLS[c.severity] ?? SEVERITY_CLS.BAJO}>{c.severity}</Badge>
                        <Badge variant="outline">{c.kind}</Badge>
                        <span className="text-sm font-medium">{c.source.name}</span>
                        <Badge variant="outline" className="text-[10px]">{c.status}</Badge>
                        <span className="text-[11px] text-muted-foreground ml-auto">Detectado: {fmtDate(c.detectedAt)}</span>
                      </div>
                      <p className="text-sm mt-2">{c.summary}</p>
                      {c.impact && <p className="text-xs text-muted-foreground mt-1">{c.impact}</p>}
                      {c.recommendation && <p className="text-xs mt-1 text-amber-700">{c.recommendation}</p>}
                      {c.reviewNote && <p className="text-xs mt-1 text-emerald-700">Análisis humano: {c.reviewNote}</p>}
                      {c.status === 'OPEN' && (
                        <div className="flex gap-2 mt-2">
                          <Button size="sm" variant="outline" onClick={() => { setReviewChange(c); setReviewNote(''); }}>
                            <ScanSearch className="h-3.5 w-3.5 mr-1" /> Analizar / clasificar
                          </Button>
                          <Button size="sm" variant="ghost" disabled={busy !== ''} onClick={() => post({ action: 'review-change', changeId: c.id, status: 'DISMISSED', note: 'Descartado desde el panel' }, `chg-${c.id}`)}>
                            Descartar
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                  {changesFiltered.length === 0 && <p className="text-sm text-muted-foreground">Sin cambios registrados. La ausencia de cambios detectados no certifica vigencia absoluta.</p>}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Informes ── */}
        <TabsContent value="reports">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Printer className="h-4 w-4" /> Informes de cumplimiento</CardTitle>
              <CardDescription>Cada informe distingue tres planos: hechos verificados (evidencia), interpretación técnica y recomendación preventiva. Ningún informe declara éxito de una revisión que no se pudo hacer.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 mb-4">
                <Button size="sm" variant="outline" disabled={busy !== ''} onClick={() => loadReport('daily')}>Informe diario</Button>
                <Button size="sm" variant="outline" disabled={busy !== ''} onClick={() => loadReport('weekly')}>Informe semanal</Button>
                <Button size="sm" variant="outline" disabled={busy !== ''} onClick={() => loadReport('monthly')}>Informe mensual integral</Button>
                {report && (
                  <Button size="sm" variant="ghost" onClick={() => window.print()}>
                    <Printer className="h-4 w-4 mr-1" /> Imprimir
                  </Button>
                )}
              </div>
              {report ? (
                <div className="space-y-3">
                  <div className="text-xs text-muted-foreground">
                    {report.kind} · generado {fmtDate(report.generatedAt)} · período desde {fmtDate(report.period.from)} · consultas {report.numbers.checks}, sin verificar {report.numbers.failed}, cambios {report.numbers.changes}, incidentes {report.numbers.incidents}, operaciones bloqueadas {report.numbers.blockedOps}
                  </div>
                  <ReportBlock title="Hechos verificados" items={report.facts} tone="border-emerald-200 bg-emerald-50/40" />
                  {report.sourcesUnavailable.length > 0 && (
                    <ReportBlock title="Fuentes que NO pudieron verificarse" items={report.sourcesUnavailable.map((s) => `${s.name} (${s.key}): ${s.error}`)} tone="border-red-200 bg-red-50/40" />
                  )}
                  <ReportBlock title="Interpretación técnica (no es política confirmada)" items={report.interpretations} tone="border-amber-200 bg-amber-50/40" />
                  <ReportBlock title="Recomendación preventiva" items={report.recommendations} tone="border-border bg-muted/30" />
                  {report.changesList.length > 0 && (
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-sm font-medium mb-2">Cambios del período</p>
                      <div className="space-y-1.5">
                        {report.changesList.map((c, i) => (
                          <p key={i} className="text-xs"><Badge className={`mr-1 ${SEVERITY_CLS[c.severity] ?? ''}`}>{c.severity}</Badge> <strong>{c.name}</strong> — {c.kind} ({c.status}): {c.summary}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Selecciona un informe para generarlo con los datos actuales (se computa en vivo desde los registros de verificación, no se simula nada).</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Decisiones e incidentes ── */}
        <TabsContent value="decisions">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4" /> Historial de decisiones del motor</CardTitle>
                <CardDescription>Auditoría append-only: cada consulta al motor, revisión manual y parada de emergencia.</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-96">
                  <div className="space-y-1.5 pr-3">
                    {data.decisions.map((d) => (
                      <div key={d.id} className="text-xs border-b border-border/60 pb-1.5">
                        <span className={`inline-block w-2 h-2 rounded-full mr-1.5 align-middle ${d.allowed ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        <strong>{d.action}</strong> · {fmtDate(d.createdAt)} · {d.actor}
                        <p className="text-muted-foreground mt-0.5">{d.reason}</p>
                      </div>
                    ))}
                    {data.decisions.length === 0 && <p className="text-sm text-muted-foreground">Sin decisiones registradas aún.</p>}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><CircleAlert className="h-4 w-4" /> Incidentes relacionados con políticas</CardTitle>
                <CardDescription>Fallos de fuente, cambios críticos y paradas de emergencia.</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-96">
                  <div className="space-y-2 pr-3">
                    {data.incidents.map((i) => (
                      <div key={i.id} className={`rounded-lg border p-2.5 ${i.status === 'OPEN' ? 'border-border' : 'opacity-60'}`}>
                        <div className="flex items-center gap-2">
                          <Badge className={SEVERITY_CLS[i.severity] ?? SEVERITY_CLS.BAJO}>{i.severity}</Badge>
                          <Badge variant="outline" className="text-[10px]">{i.kind}</Badge>
                          <Badge variant="outline" className="text-[10px]">{i.status}</Badge>
                          <span className="text-[11px] text-muted-foreground ml-auto">{fmtDate(i.createdAt)}</span>
                        </div>
                        <p className="text-xs mt-1">{i.description}</p>
                        {i.status === 'OPEN' && (
                          <Button size="sm" variant="ghost" className="mt-1" disabled={busy !== ''} onClick={() => post({ action: 'resolve-incident', incidentId: i.id, note: 'Resuelto desde el panel' }, `inc-${i.id}`)}>
                            Marcar resuelto
                          </Button>
                        )}
                      </div>
                    ))}
                    {data.incidents.length === 0 && <p className="text-sm text-muted-foreground">Sin incidentes registrados.</p>}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Configuración ── */}
        <TabsContent value="config">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Lista central de exclusión</CardTitle>
                <CardDescription>Identificadores vetados para toda comunicación comercial (bajas, grupos donde piden no publicar, contactos). Un identificador por línea. El motor lo consulta antes de autorizar cualquier operación.</CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea rows={5} value={exclusionsText} onChange={(e) => setExclusionsText(e.target.value)} placeholder={'grupo-123456\nfacebook.com/groups/otro-grupo\n+573001112233'} />
                <Button size="sm" className="mt-2" disabled={busy !== ''} onClick={() => post({ action: 'set-exclusions', exclusions: exclusionsText.split('\n').map((x) => x.trim()).filter(Boolean) }, 'excl')}>
                  Guardar exclusión
                </Button>
              </CardContent>
            </Card>
            <SimulatorCard post={post} busy={busy} />
          </div>
        </TabsContent>
      </Tabs>

      {/* Últimas verificaciones */}
      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Evidencia de las últimas consultas</CardTitle>
          <CardDescription>Registro técnico de cada intento de verificación (exitoso o fallido).</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-72">
            <div className="space-y-1.5 pr-3">
              {data.recentChecks.map((c) => (
                <div key={c.id} className="text-xs border-b border-border/60 pb-1.5">
                  <Badge variant="outline" className={`mr-1.5 ${SOURCE_STATUS_CLS[c.status] ?? ''}`}>{c.status}</Badge>
                  <strong>{c.source.name}</strong> · {c.kind} · {fmtDate(c.createdAt)}{c.httpStatus ? ` · HTTP ${c.httpStatus}` : ''}{c.durationMs ? ` · ${c.durationMs} ms` : ''}
                  {(c.error || (c.hash && c.hash !== c.previousHash)) && (
                    <p className="text-muted-foreground mt-0.5">{c.error || `Contenido distinto al anterior (hash ${c.previousHash.slice(0, 8)} → ${c.hash.slice(0, 8)})`}</p>
                  )}
                </div>
              ))}
              {data.recentChecks.length === 0 && <p className="text-sm text-muted-foreground">Sin consultas registradas: usa «Verificar todas ahora».</p>}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Diálogos */}
      <Dialog open={!!manualSource} onOpenChange={(o) => !o && setManualSource(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revisión manual — {manualSource?.name}</DialogTitle>
            <DialogDescription>
              Procedimiento alternativo honesto: indica qué verificaste al abrir la fuente en el navegador (viste el documento, cambió algo, fecha observada). Esta nota queda como evidencia auditada; sin nota no se registra verificación.
            </DialogDescription>
          </DialogHeader>
          <Textarea rows={4} value={manualNote} onChange={(e) => setManualNote(e.target.value)} placeholder="Ej.: Abrí la página hoy 30/10/2026 y revisé la sección de automatización; sin cambios visibles respecto a la última revisión." />
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualSource(null)}>Cancelar</Button>
            <Button
              disabled={busy !== '' || manualNote.trim().length < 10}
              onClick={async () => {
                await post({ action: 'manual-review', sourceId: manualSource?.id, note: manualNote }, 'manual');
                setManualSource(null);
              }}
            >
              Registrar revisión
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reviewChange} onOpenChange={(o) => !o && setReviewChange(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Analizar cambio — {reviewChange?.source.name}</DialogTitle>
            <DialogDescription>{reviewChange?.summary}</DialogDescription>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">{reviewChange?.impact}</p>
          <Textarea rows={3} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="Tu análisis: qué cambia, si afecta a la operación, decisión tomada…" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewChange(null)}>Cancelar</Button>
            <Button variant="secondary" disabled={busy !== ''} onClick={async () => { await post({ action: 'review-change', changeId: reviewChange?.id, status: 'ANALYZED', note: reviewNote }, 'rev'); setReviewChange(null); }}>
              Guardar análisis
            </Button>
            <Button disabled={busy !== ''} onClick={async () => { await post({ action: 'review-change', changeId: reviewChange?.id, status: 'ACCEPTED', note: reviewNote || 'Aceptado tras revisión' }, 'rev'); setReviewChange(null); }}>
              Aceptar cambio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={stopOpen} onOpenChange={setStopOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-700">Apagado de emergencia</DialogTitle>
            <DialogDescription>Bloquea TODA operación Meta (publicaciones, uniones, aprobaciones de campañas) hasta que un humano la levante. Queda registrado como incidente crítico.</DialogDescription>
          </DialogHeader>
          <Input value={stopReason} onChange={(e) => setStopReason(e.target.value)} placeholder="Razón (obligatoria)" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setStopOpen(false)}>Cancelar</Button>
            <Button variant="destructive" disabled={stopReason.trim().length < 5 || busy !== ''} onClick={async () => { await post({ action: 'emergency-stop', reason: stopReason }, 'stop'); setStopOpen(false); }}>
              Confirmar parada
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={liftOpen} onOpenChange={setLiftOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Levantar parada de emergencia</DialogTitle>
            <DialogDescription>Reactiva el motor. Registra la razón de reactivación.</DialogDescription>
          </DialogHeader>
          <Input value={liftNote} onChange={(e) => setLiftNote(e.target.value)} placeholder="Razón de reactivación (mínimo 5 caracteres)" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setLiftOpen(false)}>Cancelar</Button>
            <Button disabled={liftNote.trim().length < 5 || busy !== ''} onClick={async () => { await post({ action: 'lift-emergency', note: liftNote }, 'lift'); setLiftOpen(false); }}>
              Reactivar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Piezas pequeñas ───────────────────────────────────────────────

function KpiCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: 'ok' | 'warn' | 'bad' }) {
  const cls = tone === 'bad' ? 'text-red-700' : tone === 'warn' ? 'text-amber-700' : 'text-emerald-700';
  return (
    <Card>
      <CardContent className="p-3">
        <p className={`text-xl font-bold leading-none ${cls}`}>{value}</p>
        <p className="text-[11px] text-muted-foreground mt-1">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function ReportBlock({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (items.length === 0) return null;
  return (
    <div className={`rounded-lg border p-3 ${tone}`}>
      <p className="text-sm font-medium mb-1.5">{title}</p>
      <ul className="list-disc pl-4 space-y-1">
        {items.map((t, i) => <li key={i} className="text-xs">{t}</li>)}
      </ul>
    </div>
  );
}

function SimulatorCard({ post, busy }: { post: (body: Record<string, unknown>, tag: string) => Promise<Record<string, unknown>>; busy: string }) {
  const [operation, setOperation] = useState('FB_GROUP_POST');
  const [approved, setApproved] = useState(false);
  const [target, setTarget] = useState('');
  const [result, setResult] = useState<{ verdict: string; reasons: string[]; conditions: string[] } | null>(null);

  const run = async () => {
    const json = await post({ action: 'test-authorize', operation, approvedByHuman: approved, targetId: target || undefined }, 'sim');
    if (json?.result) setResult(json.result as { verdict: string; reasons: string[]; conditions: string[] });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Simulador del motor de autorización</CardTitle>
        <CardDescription>Previsualiza qué veredicto devolvería el motor para una operación, sin ejecutar ni auditar nada.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 items-center">
          <select className="text-xs bg-background border border-border rounded-md px-2 py-1.5" value={operation} onChange={(e) => setOperation(e.target.value)} aria-label="Operación a simular">
            <option value="FB_GROUP_POST">FB_GROUP_POST (publicar en grupo)</option>
            <option value="FB_JOIN_GROUP">FB_JOIN_GROUP (unirse a grupo)</option>
            <option value="FB_CAMPAIGN_APPROVAL">FB_CAMPAIGN_APPROVAL (aprobar campaña)</option>
            <option value="AGENT_READ_BRIDGE">AGENT_READ_BRIDGE (lectura agéntica)</option>
          </select>
          <label className="text-xs flex items-center gap-1">
            <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} /> con aprobación humana
          </label>
          <Input className="h-8 w-48 text-xs" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="targetId (opcional)" />
          <Button size="sm" variant="outline" disabled={busy !== ''} onClick={run}>Simular veredicto</Button>
        </div>
        {result && (
          <div className="mt-3 rounded-lg border border-border p-3">
            <Badge className={result.verdict === 'BLOQUEADO' ? 'bg-red-600 text-white' : result.verdict === 'POLITICA_DESACTUALIZADA' ? 'bg-amber-600 text-white' : result.verdict === 'PERMITIDO_CON_CONDICIONES' ? 'bg-emerald-600 text-white' : 'bg-muted'}>{result.verdict}</Badge>
            <ul className="list-disc pl-4 mt-2 space-y-0.5">
              {result.reasons.map((r, i) => <li key={i} className="text-xs">{r}</li>)}
            </ul>
            {result.conditions.length > 0 && (
              <p className="text-[11px] text-muted-foreground mt-2">Condiciones: {result.conditions.length} regla(s) estándar exigidas (HITL, warmup, sin evasión, parada ante señales, auditoría).</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
