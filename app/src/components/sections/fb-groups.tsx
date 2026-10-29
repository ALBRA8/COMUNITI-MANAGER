'use client';

// Sección: Grupos de Facebook (módulo FB-GROUPS, el "pantalón" del chaleco)
// FICHA: modulo-fb-groups/FICHA.md — workers, grupos, auto-join, campañas y anti-ban.
// Rediseño visual: franja de KPIs, gauge de riesgo pre-vuelo, log de entrega por
// grupo y controles de las mejoras P7-P8 (rotación, bump-comment, bold, proxy).
// Destripe Metricool (P8-P12): calendario editorial, mejores horas con datos
// propios, biblioteca de media por marca, informe de campaña imprimible.

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SectionHeader } from '@/components/sections/dashboard';
import { computeRiskScore, riskInputFromCampaign } from '@/lib/fb-risk';
import type { RiskInput, RiskResult } from '@/lib/fb-risk';
import {
  UsersRound, Users, Send, ShieldAlert, ShieldCheck, ImageIcon,
  MessageCircle, ChevronDown, ChevronUp, Radio, Activity, AlertTriangle,
  CalendarDays, Clock, Library, Printer,
} from 'lucide-react';
import { buildBestTime, DAY_LABELS_ES } from '@/lib/fb-besttime';
import type { HeatCell } from '@/lib/fb-besttime';
import type { SectionProps } from '@/app/page';

interface FbWorkerRow {
  id: string; name: string; baseUrl: string; mode: string; status: string;
  lastSeenAt: string | null; sessionAgeDays: number;
  proxyConfigured: boolean; proxyMasked: string;
  usage: { postsToday: number; cap: number; joinsToday: number; joinCap: number };
}
interface FbGroupRow {
  id: string; fbId: string; name: string; url: string; collection: string;
  excluded: boolean; lastPostedAt: string | null;
}
interface FbJobRow {
  id: string; status: string; targetName: string; targetKind: string;
  variantSource: string; postUrl: string; failReason: string;
  postedAt: string | null; updatedAt: string | null; attempts: number; workerName: string | null;
}
interface FbMediaRow {
  id: string; brandId: string | null; label: string; url: string; createdAt: string;
}
interface FbCampaignRow {
  id: string; name: string; mode: string; engine: string; status: string;
  createdAt: string; mediaCount: number; mediaMode: string; boldStyle: string;
  commentDelaySec: number; riskScore: number; riskLevel: string;
  text: string; firstComment: string;
  windowStart: number; windowEnd: number;
  counts: { total: number; queued: number; posted: number; failed: number; review: number };
  jobs: FbJobRow[];
}
interface FbAlertRow {
  id: string; kind: string; message: string; pausedUntil: string | null; resolved: boolean; createdAt: string;
}
interface FbJoinTaskRow {
  id: string; url: string; fbId: string; keyword: string; status: string; attempts: number;
  failReason: string; joinedAt: string | null; createdAt: string; workerName: string | null;
}

// Chips de color (fuera del sistema de variantes de shadcn para poder matizar)
const CHIP_OK = 'inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300';
const CHIP_WARN = 'inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300';
const CHIP_BAD = 'inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-800 dark:bg-red-500/15 dark:text-red-300';
const CHIP_INFO = 'inline-flex items-center rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-medium text-teal-800 dark:bg-teal-500/15 dark:text-teal-300';
const CHIP_NEUTRAL = 'inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground';

const WORKER_STATUS_LABEL: Record<string, string> = {
  OFFLINE: 'Sin conexión', IDLE: 'Inactivo', RUNNING: 'Publicando',
  AWAITING_SESSION: 'Esperando sesión', PAUSED_ANTI_BAN: 'Pausa anti-ban', CHALLENGE_DETECTED: 'Desafío detectado',
};
const WORKER_STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  OFFLINE: 'outline', IDLE: 'secondary', RUNNING: 'default',
  AWAITING_SESSION: 'outline', PAUSED_ANTI_BAN: 'destructive', CHALLENGE_DETECTED: 'destructive',
};
const WORKER_DOT: Record<string, string> = {
  OFFLINE: 'bg-zinc-400', IDLE: 'bg-emerald-500', RUNNING: 'bg-emerald-600 animate-pulse',
  AWAITING_SESSION: 'bg-amber-500', PAUSED_ANTI_BAN: 'bg-red-500', CHALLENGE_DETECTED: 'bg-red-600 animate-pulse',
};
const JOB_STATUS_LABEL: Record<string, string> = {
  QUEUED: 'En cola', LEASED: 'Asignado', POSTED: 'Publicado', FAILED: 'Fallido',
  SKIPPED: 'Omitido', PENDING_REVIEW: 'Revisión de admin', CANCELLED: 'Cancelado',
};
const JOB_STATUS_CHIP: Record<string, string> = {
  QUEUED: CHIP_NEUTRAL, LEASED: CHIP_INFO, POSTED: CHIP_OK, FAILED: CHIP_BAD,
  SKIPPED: CHIP_NEUTRAL, PENDING_REVIEW: CHIP_WARN, CANCELLED: CHIP_NEUTRAL,
};
const JOIN_STATUS_LABEL: Record<string, string> = {
  PENDING: 'En cola', LEASED: 'Uniéndose', JOINED: 'Unido', REQUESTED: 'Solicitud pendiente',
  SKIPPED: 'Ya miembro', FAILED: 'Fallido', CANCELLED: 'Cancelado',
};
const JOIN_STATUS_CHIP: Record<string, string> = {
  PENDING: CHIP_NEUTRAL, LEASED: CHIP_INFO, JOINED: CHIP_OK, REQUESTED: CHIP_WARN,
  SKIPPED: CHIP_NEUTRAL, FAILED: CHIP_BAD, CANCELLED: CHIP_NEUTRAL,
};

const RISK_CHIP: Record<string, string> = { BAJO: CHIP_OK, MEDIO: CHIP_WARN, ALTO: CHIP_BAD };

export function FbGroupsSection({ brandId, refresh }: SectionProps) {
  const [workers, setWorkers] = useState<FbWorkerRow[]>([]);
  const [alerts, setAlerts] = useState<FbAlertRow[]>([]);
  const [groups, setGroups] = useState<FbGroupRow[]>([]);
  const [campaigns, setCampaigns] = useState<FbCampaignRow[]>([]);
  const [joinTasks, setJoinTasks] = useState<FbJoinTaskRow[]>([]);
  const [joinCounts, setJoinCounts] = useState<Record<string, number>>({});
  const [mediaLib, setMediaLib] = useState<FbMediaRow[]>([]);
  const [secretShown, setSecretShown] = useState<string>('');
  const [notice, setNotice] = useState<{ msg: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [w, g, c, j, m] = await Promise.all([
        fetch('/api/fb-workers').then((r) => r.json()),
        fetch('/api/fb-groups').then((r) => r.json()),
        fetch('/api/fb-campaigns').then((r) => r.json()),
        fetch('/api/fb-joins').then((r) => r.json()),
        fetch(`/api/fb-media${brandId ? `?brandId=${brandId}` : ''}`).then((r) => r.json()),
      ]);
      setWorkers(w.workers ?? []);
      setAlerts(w.alerts ?? []);
      setGroups(g.groups ?? []);
      setCampaigns(c.campaigns ?? []);
      setJoinTasks(j.tasks ?? []);
      setJoinCounts(j.counts ?? {});
      setMediaLib(m.media ?? []);
    } catch {
      setNotice({ msg: 'No se pudo cargar el módulo FB-GROUPS', ok: false });
    }
  }, [brandId]);

  useEffect(() => {
    let cancelled = false;
    (async () => { if (!cancelled) await load(); })();
    return () => { cancelled = true; };
  }, [load]);

  const post = async (url: string, body: unknown, okMsg: string) => {
    setBusy(true);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setNotice({ msg: data.error ?? 'Error en la operación', ok: false }); return null; }
      setNotice({ msg: okMsg, ok: true });
      await load();
      refresh?.();
      return data;
    } finally {
      setBusy(false);
    }
  };

  // KPIs agregados
  const groupsActive = groups.filter((g) => !g.excluded);
  const postsToday = workers.reduce((a, w) => a + (w.usage?.postsToday ?? 0), 0);
  const capTotal = workers.reduce((a, w) => a + (w.usage?.cap ?? 0), 0);
  const joinsToday = workers.reduce((a, w) => a + (w.usage?.joinsToday ?? 0), 0);
  const joinCapTotal = workers.reduce((a, w) => a + (w.usage?.joinCap ?? 0), 0);
  const activeAlerts = alerts.filter((a) => !a.resolved);
  const pauseActive = activeAlerts.some((a) => a.pausedUntil && new Date(a.pausedUntil) > new Date());
  const collections = new Set(groups.map((g) => g.collection)).size;

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Grupos de Facebook"
        description="El pantalón del chaleco: publicación en grupos a ritmo humano desde un Chrome real con tu propia sesión. La API oficial de grupos de Meta fue eliminada el 22/04/2024; este módulo es la vía honesta y su riesgo está declarado en la FICHA."
      />

      {/* Franja de KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={UsersRound}
          label="Workers"
          value={String(workers.filter((w) => w.status !== 'OFFLINE').length)}
          sub={`${workers.length} registrado(s) · ${pauseActive ? 'con pausa activa' : 'sin pausas'}`}
          tone={pauseActive ? 'bad' : 'ok'}
        />
        <Kpi
          icon={Users}
          label="Grupos en rotación"
          value={`${groupsActive.length}/${groups.length}`}
          sub={`${collections} colecciones · ${joinCounts.JOINED ?? 0} por auto-join`}
          tone="neutral"
        />
        <Kpi
          icon={Send}
          label="Posts hoy"
          value={String(postsToday)}
          sub={capTotal > 0 ? `techo agregado ${capTotal} · ${joinsToday}/${joinCapTotal} uniones` : 'sin workers: sin techo aún'}
          progress={capTotal > 0 ? postsToday / capTotal : 0}
          tone="neutral"
        />
        <Kpi
          icon={ShieldAlert}
          label="Alertas activas"
          value={String(activeAlerts.length)}
          sub={activeAlerts.length === 0 ? 'escudo sin novedades' : activeAlerts[0].message.slice(0, 60)}
          tone={activeAlerts.length === 0 ? 'ok' : 'warn'}
        />
      </div>

      {notice && (
        <div
          role="status"
          className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
            notice.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
              : 'border-red-200 bg-red-50 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200'
          }`}
        >
          {notice.ok ? <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <span className="break-words">{notice.msg}</span>
          <button className="ml-auto shrink-0 opacity-60 hover:opacity-100" onClick={() => setNotice(null)} aria-label="Cerrar aviso">×</button>
        </div>
      )}

      {/* Workers */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm"><Radio className="h-4 w-4 text-primary" /> Workers de publicación</CardTitle>
          <CardDescription>El mismo worker corre en tu PC (mismo riesgo que las herramientas del mercado) o en un VPS 24/7. El chaleco solo habla HMAC con él.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <WorkerForm busy={busy} onRegister={async (payload) => {
            const data = await post('/api/fb-workers', { action: 'register', ...payload }, 'Worker registrado. Copia el secreto ahora: no se volverá a mostrar.');
            if (data?.secret) setSecretShown(data.secret);
          }} />
          {workers.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin workers registrados. Registra uno para activar la publicación en grupos.</p>
          ) : (
            <div className="grid gap-2.5 lg:grid-cols-2">
              {workers.map((w) => (
                <div key={w.id} className="rounded-lg border p-3 text-xs space-y-2 transition-colors hover:border-primary/30">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${WORKER_DOT[w.status] ?? 'bg-zinc-400'}`} aria-hidden />
                      <b className="truncate">{w.name}</b>
                      <Badge variant={WORKER_STATUS_VARIANT[w.status] ?? 'outline'}>{WORKER_STATUS_LABEL[w.status] ?? w.status}</Badge>
                    </div>
                    <span className="text-muted-foreground shrink-0">{w.mode === 'vps' ? 'VPS 24/7' : 'PC local'}</span>
                  </div>
                  <p className="text-muted-foreground truncate">{w.baseUrl}</p>
                  {/* Consumo del día: posts y uniones contra su techo de warmup */}
                  <div className="grid grid-cols-2 gap-2">
                    <MiniMeter label="Posts hoy" used={w.usage?.postsToday ?? 0} cap={w.usage?.cap ?? 0} />
                    <MiniMeter label="Uniones hoy" used={w.usage?.joinsToday ?? 0} cap={w.usage?.joinCap ?? 0} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
                    <span>Cuenta: {w.sessionAgeDays} días</span>
                    <span className={w.proxyConfigured ? 'text-teal-700 dark:text-teal-300' : ''}>
                      Proxy: {w.proxyConfigured ? (w.proxyMasked || 'configurado') : 'salida directa'}
                    </span>
                    <span>Última visita: {w.lastSeenAt ? new Date(w.lastSeenAt).toLocaleString('es-CO') : 'nunca'}</span>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      Días
                      <Input type="number" className="h-7 w-20 text-xs" defaultValue={w.sessionAgeDays} min={0}
                        onBlur={async (e) => {
                          const v = Number(e.target.value);
                          if (v !== w.sessionAgeDays) await post('/api/fb-workers', { action: 'set_session_age', workerId: w.id, sessionAgeDays: v }, 'Antigüedad actualizada (warmup recalculado)');
                        }} />
                    </label>
                    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy}
                      onClick={() => post('/api/fb-workers', { action: 'delete', workerId: w.id }, 'Worker eliminado')}>
                      Eliminar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {secretShown && (
            <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-2.5 text-xs">
              <b>Secreto del worker (una sola vez):</b>
              <code className="block mt-1 break-all text-[10px]">{secretShown}</code>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Grupos */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm"><Users className="h-4 w-4 text-primary" /> Grupos ({groups.length})</CardTitle>
          <CardDescription>Importados por el worker (sync por DOM) o pegados a mano. Colecciones por nicho; los excluidos salen de la rotación.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <GroupImport busy={busy} onImport={async (payload) => {
            await post('/api/fb-groups', payload, `Importación completada: ${payload.groups.length} grupos procesados`);
          }} />
          {groups.length > 0 && <GroupsTable groups={groups} busy={busy} onToggle={async (g) => {
            await fetch('/api/fb-groups', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: g.id, excluded: !g.excluded }) });
            setNotice({ msg: `Grupo "${g.name}" ${g.excluded ? 'de vuelta en rotación' : 'excluido de la rotación'}`, ok: true });
            await load();
          }} />}
        </CardContent>
      </Card>

      {/* Auto-join (P6) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm"><UsersRound className="h-4 w-4 text-primary" /> Auto-join: unirse a grupos (P6)</CardTitle>
          <CardDescription>
            Pega URLs de grupos y el worker se une a ritmo humano (huecos 20-45 min, techo 2/4/6 al día según
            antigüedad, corte nocturno). Al confirmarse JOINED el grupo entra en la colección <code>auto-join</code> y
            queda disponible para campañas. Los cuestionarios de admisión nunca se automatizan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <JoinForm busy={busy} onCreate={async (payload) => {
            const data = await post('/api/fb-joins', payload, 'Tareas de unión creadas: el worker las reclamará respetando su techo y ritmo.');
            if (data && (data.rejected ?? []).length > 0) {
              setNotice({ msg: `Tareas creadas: ${data.created}. Rechazadas: ${(data.rejected as Array<{ reason: string }>).map((r) => r.reason).join(' | ')}`, ok: false });
            }
          }} />
          {joinTasks.length > 0 && (
            <>
              <div className="flex flex-wrap gap-1.5">
                <span className={CHIP_NEUTRAL}>{joinCounts.PENDING ?? 0} en cola</span>
                <span className={CHIP_INFO}>{joinCounts.LEASED ?? 0} uniéndose</span>
                <span className={CHIP_OK}>{joinCounts.JOINED ?? 0} unidos</span>
                <span className={CHIP_WARN}>{joinCounts.REQUESTED ?? 0} esperando admin</span>
                <span className={CHIP_BAD}>{joinCounts.FAILED ?? 0} fallidos</span>
              </div>
              <div className="max-h-64 overflow-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/60 sticky top-0 backdrop-blur">
                    <tr>
                      <th className="p-2 text-left font-medium">Grupo</th>
                      <th className="p-2 text-left font-medium">Keyword</th>
                      <th className="p-2 text-left font-medium">Estado</th>
                      <th className="p-2 text-left font-medium">Detalle</th>
                      <th className="p-2 text-left font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {joinTasks.map((t) => (
                      <tr key={t.id} className="border-t transition-colors hover:bg-muted/40">
                        <td className="p-2 max-w-[220px] truncate"><a href={t.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">{t.fbId}</a></td>
                        <td className="p-2"><code className="text-[10px]">{t.keyword || '—'}</code></td>
                        <td className="p-2"><span className={JOIN_STATUS_CHIP[t.status] ?? CHIP_NEUTRAL}>{JOIN_STATUS_LABEL[t.status] ?? t.status}</span></td>
                        <td className="p-2 text-muted-foreground max-w-[260px] truncate" title={t.failReason}>
                          {t.joinedAt ? `unido ${new Date(t.joinedAt).toLocaleDateString('es-CO')}` : t.failReason || `${t.attempts} intento(s)`}
                        </td>
                        <td className="p-2">
                          {['PENDING', 'FAILED'].includes(t.status) ? (
                            <Button size="sm" variant="outline" className="h-6 text-[10px]" disabled={busy}
                              onClick={async () => {
                                await fetch('/api/fb-joins', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id, action: 'cancel' }) });
                                setNotice({ msg: 'Tarea de unión cancelada', ok: true }); await load();
                              }}>
                              Cancelar
                            </Button>
                          ) : ['JOINED', 'REQUESTED', 'SKIPPED', 'FAILED', 'CANCELLED'].includes(t.status) ? (
                            <Button size="sm" variant="outline" className="h-6 text-[10px]" disabled={busy}
                              onClick={async () => {
                                await fetch('/api/fb-joins', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id, action: 'delete' }) });
                                setNotice({ msg: 'Tarea terminada eliminada de la lista', ok: true }); await load();
                              }}>
                              Quitar
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Calendario editorial (P8) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm"><CalendarDays className="h-4 w-4 text-primary" /> Calendario editorial</CardTitle>
          <CardDescription>La semana vista en tiempo: campañas activas como agenda viva y cada publicación real en el día en que ocurrió. Nada especulativo: solo hechos con fecha (postedAt) y lo que sigue en cola.</CardDescription>
        </CardHeader>
        <CardContent>
          <WeekCalendar campaigns={campaigns} />
        </CardContent>
      </Card>

      {/* Campañas */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm"><Send className="h-4 w-4 text-primary" /> Campañas</CardTitle>
          <CardDescription>Un texto aprobado → una variante única por grupo (spintax determinista; reescritura IA si el nivel L2/L3 lo permite). El worker tira de los jobs con leases anti-doble-disparo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CampaignForm busy={busy} brandId={brandId} groups={groups} workers={workers} library={mediaLib} onCreate={async (payload) => {
            const data = await post('/api/fb-campaigns', payload, 'Campaña creada. El worker la recogerá dentro de la ventana horaria y del techo diario.');
            if (data?.risk) {
              const r = data.risk as RiskResult;
              setNotice({ msg: `Campaña creada · riesgo pre-vuelo ${r.score}/100 (${r.level})${r.mitigations.length ? ` · ${r.mitigations[0]}` : ''}`, ok: r.level !== 'ALTO' });
            }
          }} />
          {campaigns.length > 0 && (
            <div className="space-y-2.5">
              {campaigns.map((c) => <CampaignRow key={c.id} campaign={c} busy={busy} onChanged={load} setNotice={setNotice} />)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mejores horas (P10, destripe Metricool) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm"><Clock className="h-4 w-4 text-primary" /> Mejores horas (datos propios)</CardTitle>
          <CardDescription>Heatmap hora×día construido SOLO con tus entregas reales: verde = tasa de éxito alta, rojo = dominio de fallos. Sin magia de terceros, sin datos de nadie más: la evidencia acumulada de tu propia cuenta.</CardDescription>
        </CardHeader>
        <CardContent>
          <BestTimeCard campaigns={campaigns} />
        </CardContent>
      </Card>

      {/* Biblioteca de media (P12, destripe Metricool) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm"><Library className="h-4 w-4 text-primary" /> Biblioteca de media{brandId ? ' (marca actual)' : ''}</CardTitle>
          <CardDescription>URLs reutilizables por marca (o globales) listas para adjuntar desde el formulario de campañas. Misma validación que los adjuntos: URL http(s) o ruta local del worker.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <MediaLibrary media={mediaLib} busy={busy} brandId={brandId} onChanged={load} setNotice={setNotice} />
        </CardContent>
      </Card>

      {/* Anti-ban */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm"><ShieldCheck className="h-4 w-4 text-primary" /> Escudo anti-ban</CardTitle>
          <CardDescription>Warmup 5→10→20/día (posts) y 2→4→6/día (uniones) · pausas 3-10 min entre posts y 20-45 min entre uniones · corte nocturno 22:00-07:00 · pausa de 12 h ante cualquier desafío de Facebook.</CardDescription>
        </CardHeader>
        <CardContent className="text-xs space-y-1.5">
          {alerts.length === 0 ? (
            <p className="text-muted-foreground">Sin alertas registradas.</p>
          ) : (
            alerts.map((a) => (
              <div key={a.id} className="flex items-center gap-2 flex-wrap border-b pb-1.5 last:border-b-0">
                <Badge variant={a.kind === 'CHALLENGE' ? 'destructive' : a.kind === 'INFO' ? 'secondary' : 'outline'}>{a.kind}</Badge>
                <span>{a.message}</span>
                {a.pausedUntil && <span className="text-muted-foreground">· pausado hasta {new Date(a.pausedUntil).toLocaleString('es-CO')}</span>}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Piezas visuales reutilizables ─────────────────────────────────

function Kpi({ icon: Icon, label, value, sub, progress, tone = 'neutral' }: {
  icon: typeof Send;
  label: string;
  value: string;
  sub?: string;
  progress?: number;
  tone?: 'ok' | 'warn' | 'bad' | 'neutral';
}) {
  const toneIcon = tone === 'ok' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
    : tone === 'warn' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
    : tone === 'bad' ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'
    : 'bg-primary/10 text-primary';
  return (
    <div className="rounded-xl border bg-card p-3.5 transition-shadow hover:shadow-sm">
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${toneIcon}`} aria-hidden><Icon className="h-4 w-4" /></span>
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="ml-auto text-lg font-semibold tabular-nums">{value}</p>
      </div>
      {typeof progress === 'number' && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={label} aria-valuenow={Math.round(progress * 100)}>
          <div className={`h-full rounded-full transition-all ${progress >= 1 ? 'bg-red-500' : progress >= 0.8 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, Math.max(2, progress * 100))}%` }} />
        </div>
      )}
      {sub && <p className="mt-1.5 truncate text-[11px] text-muted-foreground" title={sub}>{sub}</p>}
    </div>
  );
}

function MiniMeter({ label, used, cap }: { label: string; used: number; cap: number }) {
  const ratio = cap > 0 ? used / cap : 0;
  return (
    <div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">{used}/{cap || '—'}</span>
      </div>
      <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${ratio >= 1 ? 'bg-red-500' : ratio >= 0.8 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, Math.max(2, ratio * 100))}%` }} />
      </div>
    </div>
  );
}

function GroupsTable({ groups, busy, onToggle }: {
  groups: FbGroupRow[];
  busy: boolean;
  onToggle: (g: FbGroupRow) => Promise<void>;
}) {
  const [filter, setFilter] = useState('');
  const shown = groups.filter((g) => !filter || `${g.name} ${g.collection}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <>
      <div className="flex gap-2">
        <Input className="h-8 max-w-xs text-xs" placeholder="Filtrar por nombre o colección…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <span className="self-center text-[11px] text-muted-foreground">{shown.length} de {groups.length}</span>
      </div>
      <div className="max-h-64 overflow-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-muted/60 sticky top-0 backdrop-blur">
            <tr>
              <th className="p-2 text-left font-medium">Grupo</th>
              <th className="p-2 text-left font-medium">Colección</th>
              <th className="p-2 text-left font-medium">Último post</th>
              <th className="p-2 text-left font-medium">Rotación</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((g) => (
              <tr key={g.id} className="border-t transition-colors hover:bg-muted/40">
                <td className="p-2 max-w-[240px] truncate" title={g.name}>{g.url ? <a href={g.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">{g.name}</a> : g.name}</td>
                <td className="p-2"><code className="text-[10px]">{g.collection}</code></td>
                <td className="p-2 text-muted-foreground">{g.lastPostedAt ? new Date(g.lastPostedAt).toLocaleDateString('es-CO') : '—'}</td>
                <td className="p-2">
                  <Button size="sm" variant={g.excluded ? 'destructive' : 'outline'} className="h-6 text-[10px]" disabled={busy} onClick={() => onToggle(g)}>
                    {g.excluded ? 'Excluido' : 'Activo'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── Formularios ───────────────────────────────────────────────────

function WorkerForm({ busy, onRegister }: { busy: boolean; onRegister: (payload: { name: string; baseUrl: string; mode: string; sessionAgeDays: number; proxyUrl: string }) => Promise<void> }) {
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('http://localhost:8765');
  const [mode, setMode] = useState('pc');
  const [sessionAgeDays, setSessionAgeDays] = useState('30');
  const [proxyUrl, setProxyUrl] = useState('');
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 items-center text-xs">
        <Input className="h-8 w-36 text-xs" placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
        <Input className="h-8 w-56 text-xs" placeholder="URL del worker" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        <Select value={mode} onValueChange={setMode}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pc">PC local</SelectItem>
            <SelectItem value="vps">VPS 24/7</SelectItem>
          </SelectContent>
        </Select>
        <Input className="h-8 w-28 text-xs" type="number" min={0} placeholder="Días de cuenta" value={sessionAgeDays} onChange={(e) => setSessionAgeDays(e.target.value)} />
        <Button size="sm" className="h-8 text-xs" disabled={busy || !name || !baseUrl}
          onClick={async () => { await onRegister({ name, baseUrl, mode, sessionAgeDays: Number(sessionAgeDays), proxyUrl: proxyUrl.trim() }); setName(''); setProxyUrl(''); }}>
          Registrar worker
        </Button>
      </div>
      <Input className="h-8 max-w-md text-xs" placeholder="Proxy (opcional): http://host:8080 o socks5://host:1080 — recuerda configurarlo también en el .env del worker" value={proxyUrl} onChange={(e) => setProxyUrl(e.target.value)} />
    </div>
  );
}

function GroupImport({ busy, onImport }: { busy: boolean; onImport: (payload: { groups: Array<{ fbId: string; name: string; url: string; collection: string }> }) => Promise<void> }) {
  const [raw, setRaw] = useState('');
  const [collection, setCollection] = useState('general');
  const parse = () => raw.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [name, url] = l.split('|').map((s) => s.trim());
    return { fbId: name, name, url: url ?? '', collection };
  }).filter((g) => g.fbId);
  return (
    <div className="space-y-2 text-xs">
      <Textarea className="text-xs min-h-[64px]" placeholder={'Nombre del grupo | https://facebook.com/groups/...&#10;(un grupo por línea)'} value={raw} onChange={(e) => setRaw(e.target.value)} />
      <div className="flex gap-2 items-center">
        <Input className="h-8 w-40 text-xs" placeholder="Colección" value={collection} onChange={(e) => setCollection(e.target.value)} />
        <Button size="sm" className="h-8 text-xs" disabled={busy || !raw.trim()} onClick={async () => { await onImport({ groups: parse() }); setRaw(''); }}>
          Importar grupos
        </Button>
        <span className="text-muted-foreground">El worker también sincroniza la lista automáticamente desde tu sesión.</span>
      </div>
    </div>
  );
}

function JoinForm({ busy, onCreate }: { busy: boolean; onCreate: (payload: { urls: string[]; keyword: string }) => Promise<void> }) {
  const [raw, setRaw] = useState('');
  const [keyword, setKeyword] = useState('');
  const urls = raw.split('\n').map((s) => s.trim()).filter(Boolean);
  return (
    <div className="space-y-2 text-xs">
      <Textarea className="text-xs min-h-[64px]" placeholder={'https://www.facebook.com/groups/...&#10;(una URL de grupo por línea)'} value={raw} onChange={(e) => setRaw(e.target.value)} />
      <div className="flex gap-2 items-center">
        <Input className="h-8 w-44 text-xs" placeholder="Keyword de origen (opcional)" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        <Button size="sm" className="h-8 text-xs" disabled={busy || urls.length === 0}
          onClick={async () => { await onCreate({ urls, keyword: keyword.trim() }); setRaw(''); }}>
          Encolar uniones ({urls.length})
        </Button>
        <span className="text-muted-foreground">Descubre grupos buscando en Facebook con tu keyword; pega aquí sus URLs. Solo grupos públicos sin cuestionario se automatizan.</span>
      </div>
    </div>
  );
}

/** Gauge de riesgo pre-vuelo: se recalcula en vivo con cada cambio del formulario. */
function RiskGauge({ input, hasWorker }: { input: RiskInput; hasWorker: boolean }) {
  const risk: RiskResult = useMemo(() => computeRiskScore(input), [input]);
  const barColor = risk.level === 'BAJO' ? 'bg-emerald-500' : risk.level === 'MEDIO' ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="rounded-lg border bg-muted/30 p-3 text-xs" aria-live="polite">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden />
        <b className="text-[13px]">Riesgo pre-vuelo</b>
        <span className={`ml-1 text-base font-semibold tabular-nums ${risk.level === 'ALTO' ? 'text-red-700 dark:text-red-300' : risk.level === 'MEDIO' ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}`}>{risk.score}</span>
        <span className="text-muted-foreground">/100</span>
        <span className={`ml-auto ${RISK_CHIP[risk.level]}`}>{risk.level}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${Math.max(2, risk.score)}%` }} />
      </div>
      {!hasWorker && (
        <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">Sin workers registrados: se evalúa el peor caso (cuenta de 0 días). Registra un worker para una evaluación real.</p>
      )}
      {risk.factors.length > 0 && (
        <ul className="mt-2 space-y-1">
          {risk.factors.map((f) => (
            <li key={f.label} className="flex gap-1.5 leading-snug">
              <span className={`shrink-0 tabular-nums font-medium ${f.points < 0 ? 'text-emerald-700 dark:text-emerald-300' : f.points >= 10 ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>
                {f.points > 0 ? `+${f.points}` : f.points}
              </span>
              <span><b>{f.label}.</b> <span className="text-muted-foreground">{f.note}</span></span>
            </li>
          ))}
        </ul>
      )}
      {risk.mitigations.length > 0 && (
        <p className="mt-2 border-t pt-1.5 text-[11px] text-muted-foreground">Cómo bajarlo: {risk.mitigations.join(' · ')}</p>
      )}
    </div>
  );
}

function CampaignForm({ busy, brandId, groups, workers, library, onCreate }: {
  busy: boolean; brandId: string | null;
  groups: FbGroupRow[];
  workers: FbWorkerRow[];
  library: FbMediaRow[];
  onCreate: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [mode, setMode] = useState('group');
  const [firstComment, setFirstComment] = useState('');
  const [commentDelaySec, setCommentDelaySec] = useState('0');
  const [media, setMedia] = useState('');
  const [rotate, setRotate] = useState(false);
  const [boldStyle, setBoldStyle] = useState('none');
  const [windowStart, setWindowStart] = useState('7');
  const [windowEnd, setWindowEnd] = useState('21');
  const [selected, setSelected] = useState<string[]>([]);
  const active = groups.filter((g) => !g.excluded);
  const mediaUrls = media.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 4);

  // Riesgo en vivo: peor caso = worker más joven (mismas reglas que el servidor).
  const riskInput = useMemo(() => {
    const mediaList = media.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 4);
    return riskInputFromCampaign(
      {
        text,
        mediaUrls: JSON.stringify(mediaList),
        firstComment,
        windowStart: Number(windowStart) || 7,
        windowEnd: Number(windowEnd) || 21,
        targetCount: mode === 'profile' ? 1 : selected.length,
      },
      (() => {
        const youngest = [...workers].sort((a, b) => a.sessionAgeDays - b.sessionAgeDays)[0];
        if (!youngest) return null;
        return { sessionAgeDays: youngest.sessionAgeDays, usedToday: youngest.usage?.postsToday ?? 0, cap: youngest.usage?.cap ?? 0 };
      })(),
    );
  }, [text, media, firstComment, windowStart, windowEnd, mode, selected, workers]);
  const hasWorker = workers.length > 0;

  return (
    <div className="space-y-3 text-xs">
      <div className="flex flex-wrap gap-2">
        <Input className="h-8 w-48 text-xs" placeholder="Nombre de campaña" value={name} onChange={(e) => setName(e.target.value)} />
        <Select value={mode} onValueChange={setMode}>
          <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="group">En grupos</SelectItem>
            <SelectItem value="profile">Muro del perfil</SelectItem>
            <SelectItem value="page_in_group">Como Página en grupos</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1 text-muted-foreground">
          Ventana
          <Input className="h-8 w-16 text-xs" type="number" min={0} max={23} value={windowStart} onChange={(e) => setWindowStart(e.target.value)} aria-label="Hora inicio ventana" />
          <span>a</span>
          <Input className="h-8 w-16 text-xs" type="number" min={0} max={23} value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} aria-label="Hora fin ventana" />
        </label>
      </div>
      <Textarea className="text-xs min-h-[72px]" placeholder="Texto base del post (aprobado o del operador). {Spintax|opcional} soportado; con énfasis unicode puedes marcar *palabras clave*." value={text} onChange={(e) => setText(e.target.value)} />
      <Textarea className="text-xs min-h-[48px]" placeholder="Adjuntos (opcional): una imagen por línea, máx 4. URL http(s) accesible por el worker o ruta local de su máquina." value={media} onChange={(e) => setMedia(e.target.value)} />
      {library.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Biblioteca:</span>
          {library.slice(0, 12).map((m) => {
            const picked = mediaUrls.includes(m.url);
            return (
              <button key={m.id} type="button" disabled={busy || (!picked && mediaUrls.length >= 4)}
                className={`rounded-full border px-2 py-0.5 text-[10px] transition-colors disabled:opacity-40 ${picked ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:border-primary/40'}`}
                title={picked ? 'Quitar de los adjuntos' : 'Añadir a los adjuntos (máx 4)'}
                onClick={() => {
                  setMedia((prev) => {
                    const lines = prev.split('\n').map((s) => s.trim()).filter(Boolean);
                    return (picked ? lines.filter((l) => l !== m.url) : [...lines, m.url]).join('\n');
                  });
                }}>
                {picked ? '−' : '+'} {m.label || m.url.slice(0, 28)}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <label className={`flex items-center gap-1.5 ${mediaUrls.length > 1 ? '' : 'opacity-50'}`} title={mediaUrls.length > 1 ? 'Cada grupo recibe una imagen distinta del pool (rotación determinista)' : 'Necesitas 2+ adjuntos para rotar'}>
          <input type="checkbox" checked={rotate} disabled={mediaUrls.length <= 1} onChange={(e) => setRotate(e.target.checked)} />
          <ImageIcon className="h-3.5 w-3.5" aria-hidden /> Rotar adjuntos ({mediaUrls.length > 1 ? '1 distinta por grupo' : 'requiere 2+'})
        </label>
        <label className="flex items-center gap-1.5">
          <Select value={boldStyle} onValueChange={setBoldStyle}>
            <SelectTrigger className="h-7 w-44 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Énfasis: ninguno</SelectItem>
              <SelectItem value="unicode">Énfasis: negrita unicode (*así*)</SelectItem>
            </SelectContent>
          </Select>
        </label>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <Input className="h-8 max-w-md text-xs" placeholder="Primer comentario (opcional, p.ej. el enlace)" value={firstComment} onChange={(e) => setFirstComment(e.target.value)} />
        <label className="flex items-center gap-1 text-muted-foreground" title="El worker espera este tiempo (±15% de jitter humano) antes de publicar el comentario">
          <MessageCircle className="h-3.5 w-3.5" aria-hidden />
          Espera
          <Input className="h-8 w-20 text-xs" type="number" min={0} max={3600} step={30} value={commentDelaySec} onChange={(e) => setCommentDelaySec(e.target.value)} />
          s
        </label>
        {Number(commentDelaySec) > 0 && <span className="text-[11px] text-muted-foreground">bump-comment con delay (recomendado 60-300 s)</span>}
      </div>
      {mode !== 'profile' && (
        <div className="max-h-36 overflow-auto rounded-lg border p-2 space-y-1">
          {active.length === 0 ? (
            <p className="text-muted-foreground">Importa grupos primero.</p>
          ) : active.map((g) => (
            <label key={g.id} className="flex items-center gap-2 hover:bg-muted/50 rounded px-1 py-0.5">
              <input type="checkbox" checked={selected.includes(g.id)} onChange={(e) => setSelected((s) => e.target.checked ? [...s, g.id] : s.filter((x) => x !== g.id))} />
              <span className="truncate">{g.name} <code className="text-[10px] text-muted-foreground">{g.collection}</code></span>
            </label>
          ))}
        </div>
      )}
      <RiskGauge input={riskInput} hasWorker={hasWorker} />
      <Button size="sm" className="h-8 text-xs" disabled={busy || !name || !text || (mode !== 'profile' && selected.length === 0)}
        onClick={async () => {
          await onCreate({
            brandId, name, text, mode, engine: 'dom', firstComment,
            commentDelaySec: Math.max(0, Number(commentDelaySec) || 0),
            boldStyle,
            mediaUrls,
            mediaMode: rotate && mediaUrls.length > 1 ? 'rotate' : 'all',
            windowStart: Number(windowStart), windowEnd: Number(windowEnd),
            targets: mode === 'profile' ? [] : selected,
          });
          setName(''); setText(''); setFirstComment(''); setMedia(''); setSelected([]); setRotate(false); setCommentDelaySec('0');
        }}>
        Crear campaña ({mode === 'profile' ? 1 : selected.length} objetivo{mode === 'profile' ? '' : 's'}{mediaUrls.length ? ` · ${mediaUrls.length} adjunto${mediaUrls.length > 1 ? 's' : ''}${rotate && mediaUrls.length > 1 ? ' rotados' : ''}` : ''})
      </Button>
    </div>
  );
}

function CampaignRow({ campaign, busy, onChanged, setNotice }: {
  campaign: FbCampaignRow;
  busy: boolean;
  onChanged: () => Promise<void>;
  setNotice: (n: { msg: string; ok: boolean } | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const c = campaign;
  const postedRatio = c.counts.total > 0 ? c.counts.posted / c.counts.total : 0;
  return (
    <div className="rounded-lg border p-3 text-xs space-y-2 transition-colors hover:border-primary/30">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <b className="text-[13px]">{c.name}</b>
          {c.riskLevel && <span className={RISK_CHIP[c.riskLevel] ?? CHIP_NEUTRAL} title="Score de riesgo pre-vuelo (instantánea al crear)">riesgo {c.riskScore} · {c.riskLevel}</span>}
          <span className={CHIP_NEUTRAL}>{c.mode === 'profile' ? 'perfil' : c.mode === 'page_in_group' ? 'Página en grupo' : 'grupos'}</span>
          <Badge variant={c.status === 'DONE' ? 'default' : c.status === 'CANCELLED' || c.status === 'PAUSED' ? 'destructive' : 'secondary'}>{c.status}</Badge>
        </div>
        <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          Log de entrega ({c.counts.total})
        </Button>
      </div>
      {/* Progreso visual de la campaña */}
      <div className="flex h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="bg-emerald-500" style={{ width: `${(c.counts.posted / Math.max(1, c.counts.total)) * 100}%` }} />
        <div className="bg-amber-400" style={{ width: `${(c.counts.review / Math.max(1, c.counts.total)) * 100}%` }} />
        <div className="bg-red-400" style={{ width: `${(c.counts.failed / Math.max(1, c.counts.total)) * 100}%` }} />
      </div>
      <p className="text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5">
        <span>{c.counts.posted} publicados</span>· <span>{c.counts.queued} en cola</span>· <span>{c.counts.failed} fallidos</span>· <span>{c.counts.review} en revisión de admin</span>· <span>total {c.counts.total}</span>
        {c.mediaCount > 0 && <>· <span>{c.mediaCount} adjunto(s){c.mediaMode === 'rotate' ? ' rotados por grupo' : ''}</span></>}
        {c.boldStyle === 'unicode' && <>· <span>negrita unicode</span></>}
        {c.commentDelaySec > 0 && <>· <span>comentario tras {c.commentDelaySec}s</span></>}
      </p>
      {open && (
        <div className="max-h-72 overflow-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead className="bg-muted/60 sticky top-0 backdrop-blur">
              <tr>
                <th className="p-2 text-left font-medium">Grupo</th>
                <th className="p-2 text-left font-medium">Estado</th>
                <th className="p-2 text-left font-medium">Variante</th>
                <th className="p-2 text-left font-medium">Publicado</th>
                <th className="p-2 text-left font-medium">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {c.jobs.map((j) => (
                <tr key={j.id} className="border-t transition-colors hover:bg-muted/40">
                  <td className="p-2 max-w-[180px] truncate" title={j.targetName}>{j.targetName}</td>
                  <td className="p-2"><span className={JOB_STATUS_CHIP[j.status] ?? CHIP_NEUTRAL}>{JOB_STATUS_LABEL[j.status] ?? j.status}</span></td>
                  <td className="p-2 text-muted-foreground">{j.variantSource}</td>
                  <td className="p-2 text-muted-foreground">{j.postedAt ? new Date(j.postedAt).toLocaleString('es-CO') : '—'}</td>
                  <td className="p-2 max-w-[240px] truncate text-muted-foreground" title={j.failReason}>
                    {j.postUrl ? <a href={j.postUrl} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">ver post</a> : j.failReason || (j.workerName ? `worker: ${j.workerName}` : '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex gap-1.5">
        <a href={`/reports/${c.id}`} target="_blank" rel="noreferrer" className="no-underline">
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs">
            <Printer className="h-3.5 w-3.5" aria-hidden /> Informe
          </Button>
        </a>
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={async () => {
          await fetch('/api/fb-campaigns', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaignId: c.id, action: 'pause' }) });
          setNotice({ msg: 'Campaña pausada', ok: true }); await onChanged();
        }}>
          Pausar
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={async () => {
          await fetch('/api/fb-campaigns', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaignId: c.id, action: 'resume' }) });
          setNotice({ msg: 'Campaña reanudada', ok: true }); await onChanged();
        }}>
          Reanudar
        </Button>
        <Button size="sm" variant="destructive" className="h-7 text-xs" disabled={busy} onClick={async () => {
          await fetch('/api/fb-campaigns', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaignId: c.id, action: 'cancel' }) });
          setNotice({ msg: 'Campaña cancelada', ok: true }); await onChanged();
        }}>
          Cancelar
        </Button>
        {postedRatio === 1 && c.counts.total > 0 && <span className={`ml-auto self-center ${CHIP_OK}`} title="Todos los jobs en estado terminal">completa</span>}
      </div>
    </div>
  );
}

// ─── Calendario editorial (P8, destripe Metricool) ────────────────

interface CalItem {
  campaignName: string;
  targetName: string;
  status: string;
  postUrl: string;
}

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function WeekCalendar({ campaigns }: { campaigns: FbCampaignRow[] }) {
  const [offset, setOffset] = useState(0);

  // Bitácora: solo hechos con fecha real (postedAt). Lo pendiente va en la agenda viva.
  const byDay = useMemo(() => {
    const map = new Map<string, CalItem[]>();
    for (const c of campaigns) {
      for (const j of c.jobs) {
        if (!j.postedAt) continue;
        const arr = map.get(dayKey(new Date(j.postedAt))) ?? [];
        arr.push({ campaignName: c.name, targetName: j.targetName, status: j.status, postUrl: j.postUrl });
        map.set(dayKey(new Date(j.postedAt)), arr);
      }
    }
    return map;
  }, [campaigns]);

  const monday = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
    return d;
  }, [offset]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  }), [monday]);

  const rangeLabel = `${days[0].getDate()} ${days[0].toLocaleDateString('es-CO', { month: 'short' })} – ${days[6].getDate()} ${days[6].toLocaleDateString('es-CO', { month: 'short' })} ${days[6].getFullYear()}`;
  const today = dayKey(new Date());
  const agenda = campaigns.filter((c) => ['QUEUED', 'RUNNING', 'PAUSED'].includes(c.status) && c.counts.queued > 0);

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-1.5">
        <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => setOffset((o) => o - 1)} aria-label="Semana anterior">‹</Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={offset === 0} onClick={() => setOffset(0)}>Hoy</Button>
        <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => setOffset((o) => o + 1)} aria-label="Semana siguiente">›</Button>
        <b className="ml-1">{rangeLabel}</b>
        <span className="ml-auto hidden text-[11px] text-muted-foreground sm:inline">bitácora real: cada tarjeta es una publicación con fecha (postedAt)</span>
      </div>
      {agenda.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed p-2">
          <span className="text-[11px] font-medium text-muted-foreground">Agenda viva:</span>
          {agenda.map((c) => (
            <span key={c.id} className={CHIP_INFO} title={`ventana ${c.windowStart}:00–${c.windowEnd}:00 · ${c.counts.failed} fallidos`}>
              {c.name} · {c.counts.queued} en cola (vent. {c.windowStart}–{c.windowEnd})
            </span>
          ))}
        </div>
      )}
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d, i) => {
          const key = dayKey(d);
          const items = byDay.get(key) ?? [];
          const postedN = items.filter((it) => it.status === 'POSTED').length;
          const badN = items.length - postedN;
          return (
            <div key={key} className={`min-h-[96px] rounded-lg border p-1.5 transition-colors ${key === today ? 'border-primary/50 bg-primary/5' : ''}`} aria-label={`${key}: ${items.length} publicación(es)`}>
              <p className={`flex items-center justify-between text-[10px] ${key === today ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
                <span>{['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'][i]} {d.getDate()}</span>
                {items.length > 0 && <span className="tabular-nums">{postedN > 0 ? postedN : ''}{badN > 0 ? `·${badN}` : ''}</span>}
              </p>
              <div className="mt-1 space-y-1">
                {items.slice(0, 3).map((it, k) => (
                  <p key={k} className="flex items-center gap-1 text-[10px] leading-tight" title={`${it.targetName} — ${it.campaignName}${it.postUrl ? '' : ` — ${it.status}`}`}>
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${it.status === 'POSTED' ? 'bg-emerald-500' : it.status === 'FAILED' ? 'bg-red-500' : 'bg-amber-500'}`} aria-hidden />
                    <span className="truncate">{it.targetName}</span>
                  </p>
                ))}
                {items.length > 3 && <p className="text-[10px] text-muted-foreground">+{items.length - 3} más</p>}
              </div>
            </div>
          );
        })}
      </div>
      {campaigns.length === 0 && <p className="text-muted-foreground">Sin campañas aún: cuando publiques, cada entrega aparecerá en el día real en que ocurrió.</p>}
    </div>
  );
}

// ─── Mejores horas (P10) ───────────────────────────────────────────

function BestTimeCard({ campaigns }: { campaigns: FbCampaignRow[] }) {
  const jobs = useMemo(
    () => campaigns.flatMap((c) => c.jobs.map((j) => ({ status: j.status, postedAt: j.postedAt, updatedAt: j.updatedAt }))),
    [campaigns],
  );
  const bt = useMemo(() => buildBestTime(jobs), [jobs]);

  if (bt.sample === 0) {
    return (
      <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        Sin entregas registradas todavía. Este mapa no usa datos de nadie más: se dibuja con los éxitos y fallos que
        tu propio worker reporta. Publica tu primera campaña y vuelve — con 10+ entregas empieza a sugerir franjas.
      </div>
    );
  }

  const cellStyle = (rate: number | null, total: number): CSSProperties => {
    if (total === 0 || rate === null) return {};
    return rate >= 0.5
      ? { backgroundColor: `rgba(16,185,129,${(0.18 + rate * 0.62).toFixed(2)})` }
      : { backgroundColor: `rgba(239,68,68,${(0.18 + (1 - rate) * 0.45).toFixed(2)})` };
  };
  const rowFor = (hour: number) => bt.days.map((d) => bt.cells.find((c) => c.day === d && c.hour === hour) as HeatCell);
  const maxPosted = Math.max(1, ...bt.cells.map((c) => c.posted));

  return (
    <div className="space-y-2 text-xs">
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0.5 text-[10px]">
          <thead>
            <tr>
              <th className="pr-1 text-left font-normal text-muted-foreground">hora</th>
              {bt.days.map((d) => <th key={d} className="w-9 font-medium text-muted-foreground">{DAY_LABELS_ES[d]}</th>)}
            </tr>
          </thead>
          <tbody>
            {bt.hours.map((h) => (
              <tr key={h}>
                <td className="pr-1 tabular-nums text-muted-foreground">{String(h).padStart(2, '0')}</td>
                {rowFor(h).map((c) => (
                  <td
                    key={`${c.day}-${c.hour}`}
                    className="h-5 rounded text-center tabular-nums"
                    style={cellStyle(c.rate, c.total)}
                    title={c.total > 0 ? `${DAY_LABELS_ES[c.day]} ${c.hour}:00 — ${c.posted}/${c.total} publicados` : `${DAY_LABELS_ES[c.day]} ${c.hour}:00 — sin entregas`}
                  >
                    {c.posted > 0 && c.posted >= maxPosted / 2 ? c.posted : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium text-muted-foreground">Sugerencias:</span>
        {bt.suggestions.length === 0 && <span className="text-[11px] text-muted-foreground">aún sin franjas con muestra suficiente (≥3 por celda)</span>}
        {bt.suggestions.map((s) => (
          <span key={`${s.day}-${s.hour}`} className={CHIP_OK} title={`${Math.round(s.rate * 100)}% de entrega en esta franja`}>
            {DAY_LABELS_ES[s.day]} {s.hour}:00 · {Math.round(s.rate * 100)}% ({s.posted})
          </span>
        ))}
      </div>
      {!bt.enoughData && (
        <p className="text-[11px] text-amber-700 dark:text-amber-300">
          Muestra pequeña: {bt.sample} entrega(s) ({bt.totalPosted} publicadas · {bt.totalFailed} fallidas). Las sugerencias se vuelven fiables con ≥10.
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">
        Horas locales del navegador. Los fallos se ubican en la hora de su último reporte (aproximación declarada);
        la noche (22-07) no aparece porque el escudo anti-ban la bloquea.
      </p>
    </div>
  );
}

// ─── Biblioteca de media (P12) ─────────────────────────────────────

function MediaLibrary({ media, busy, brandId, onChanged, setNotice }: {
  media: FbMediaRow[];
  busy: boolean;
  brandId: string | null;
  onChanged: () => Promise<void>;
  setNotice: (n: { msg: string; ok: boolean } | null) => void;
}) {
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');

  const add = async () => {
    const res = await fetch('/api/fb-media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url.trim(), label: label.trim(), brandId }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setNotice({ msg: data.error ?? 'No se pudo guardar el media', ok: false }); return; }
    setNotice({ msg: 'Media guardado en la biblioteca: aparece como chip en el formulario de campañas', ok: true });
    setUrl(''); setLabel('');
    await onChanged();
  };

  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap gap-2">
        <Input className="h-8 w-64 text-xs" placeholder="URL http(s) o ruta local del worker" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Input className="h-8 w-44 text-xs" placeholder="Etiqueta (opcional)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Button size="sm" className="h-8 text-xs" disabled={busy || !url.trim()} onClick={add}>Guardar en biblioteca</Button>
      </div>
      {media.length === 0 ? (
        <p className="text-muted-foreground">Biblioteca vacía. Guarda las imágenes que reusas (portadas, promos) y adjúntalas a cada campaña con un clic desde el formulario.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {media.map((m) => (
            <span key={m.id} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1">
              <ImageIcon className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
              <span className="max-w-[240px] truncate" title={m.url}>{m.label || m.url}</span>
              <button
                className="text-muted-foreground transition-colors hover:text-red-600"
                aria-label="Eliminar de la biblioteca"
                disabled={busy}
                onClick={async () => {
                  const res = await fetch(`/api/fb-media?id=${m.id}`, { method: 'DELETE' });
                  if (!res.ok) { setNotice({ msg: 'No se pudo eliminar', ok: false }); return; }
                  setNotice({ msg: 'Media eliminado de la biblioteca', ok: true });
                  await onChanged();
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
