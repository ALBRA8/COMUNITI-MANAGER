'use client';

// Sección: Grupos de Facebook (módulo FB-GROUPS, el "pantalón" del chaleco)
// FICHA: modulo-fb-groups/FICHA.md — workers, grupos, campañas y anti-ban.

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SectionHeader } from '@/components/sections/dashboard';
import type { SectionProps } from '@/app/page';

interface FbWorkerRow {
  id: string; name: string; baseUrl: string; mode: string; status: string;
  lastSeenAt: string | null; sessionAgeDays: number;
}
interface FbGroupRow {
  id: string; fbId: string; name: string; url: string; collection: string;
  excluded: boolean; lastPostedAt: string | null;
}
interface FbCampaignRow {
  id: string; name: string; mode: string; engine: string; status: string;
  createdAt: string; mediaCount: number; counts: { total: number; queued: number; posted: number; failed: number; review: number };
}
interface FbAlertRow {
  id: string; kind: string; message: string; pausedUntil: string | null; resolved: boolean; createdAt: string;
}
interface FbJoinTaskRow {
  id: string; url: string; fbId: string; keyword: string; status: string; attempts: number;
  failReason: string; joinedAt: string | null; createdAt: string; workerName: string | null;
}

const WORKER_STATUS_LABEL: Record<string, string> = {
  OFFLINE: 'Sin conexión', IDLE: 'Inactivo', RUNNING: 'Publicando',
  AWAITING_SESSION: 'Esperando sesión', PAUSED_ANTI_BAN: 'Pausa anti-ban', CHALLENGE_DETECTED: 'Desafío detectado',
};
const WORKER_STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  OFFLINE: 'outline', IDLE: 'secondary', RUNNING: 'default',
  AWAITING_SESSION: 'outline', PAUSED_ANTI_BAN: 'destructive', CHALLENGE_DETECTED: 'destructive',
};
const JOB_STATUS_LABEL: Record<string, string> = {
  QUEUED: 'En cola', LEASED: 'Asignado', POSTED: 'Publicado', FAILED: 'Fallido',
  SKIPPED: 'Omitido', PENDING_REVIEW: 'Revisión de admin', CANCELLED: 'Cancelado',
};
const JOIN_STATUS_LABEL: Record<string, string> = {
  PENDING: 'En cola', LEASED: 'Uniéndose', JOINED: 'Unido', REQUESTED: 'Solicitud pendiente',
  SKIPPED: 'Ya miembro', FAILED: 'Fallido', CANCELLED: 'Cancelado',
};
const JOIN_STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'outline', LEASED: 'secondary', JOINED: 'default', REQUESTED: 'secondary',
  SKIPPED: 'outline', FAILED: 'destructive', CANCELLED: 'outline',
};

export function FbGroupsSection({ brandId, refresh }: SectionProps) {
  const [workers, setWorkers] = useState<FbWorkerRow[]>([]);
  const [alerts, setAlerts] = useState<FbAlertRow[]>([]);
  const [groups, setGroups] = useState<FbGroupRow[]>([]);
  const [campaigns, setCampaigns] = useState<FbCampaignRow[]>([]);
  const [joinTasks, setJoinTasks] = useState<FbJoinTaskRow[]>([]);
  const [joinCounts, setJoinCounts] = useState<Record<string, number>>({});
  const [secretShown, setSecretShown] = useState<string>('');
  const [notice, setNotice] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [w, g, c, j] = await Promise.all([
        fetch('/api/fb-workers').then((r) => r.json()),
        fetch('/api/fb-groups').then((r) => r.json()),
        fetch('/api/fb-campaigns').then((r) => r.json()),
        fetch('/api/fb-joins').then((r) => r.json()),
      ]);
      setWorkers(w.workers ?? []);
      setAlerts(w.alerts ?? []);
      setGroups(g.groups ?? []);
      setCampaigns(c.campaigns ?? []);
      setJoinTasks(j.tasks ?? []);
      setJoinCounts(j.counts ?? {});
    } catch {
      setNotice('No se pudo cargar el módulo FB-GROUPS');
    }
  }, []);

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
      if (!res.ok) { setNotice(data.error ?? 'Error en la operación'); return null; }
      setNotice(okMsg);
      await load();
      refresh?.();
      return data;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <SectionHeader
        title="Grupos de Facebook"
        description="El pantalón del chaleco: publicación en grupos a ritmo humano desde un Chrome real con tu propia sesión. La API oficial de grupos de Meta fue eliminada el 22/04/2024; este módulo es la vía honesta y su riesgo está declarado en la FICHA."
      />

      {notice && (
        <p className="mb-3 text-xs text-muted-foreground border-l-2 border-primary pl-2">{notice}</p>
      )}

      {/* Workers */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Workers de publicación</CardTitle>
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
            <div className="grid gap-2 md:grid-cols-2">
              {workers.map((w) => (
                <div key={w.id} className="rounded border p-2.5 text-xs space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <b>{w.name}</b>
                    <Badge variant={WORKER_STATUS_VARIANT[w.status] ?? 'outline'}>{WORKER_STATUS_LABEL[w.status] ?? w.status}</Badge>
                  </div>
                  <p className="text-muted-foreground">{w.baseUrl} · modo {w.mode === 'vps' ? 'VPS 24/7' : 'PC local'}</p>
                  <p className="text-muted-foreground">Cuenta FB declarada: {w.sessionAgeDays} días · techo {w.sessionAgeDays < 7 ? 5 : w.sessionAgeDays < 14 ? 10 : 20}/día</p>
                  <p className="text-muted-foreground">Última visita: {w.lastSeenAt ? new Date(w.lastSeenAt).toLocaleString('es-CO') : 'nunca'}</p>
                  <div className="flex gap-1.5 flex-wrap">
                    <Input type="number" className="h-7 w-24 text-xs" defaultValue={w.sessionAgeDays} min={0}
                      onBlur={async (e) => {
                        const v = Number(e.target.value);
                        if (v !== w.sessionAgeDays) await post('/api/fb-workers', { action: 'set_session_age', workerId: w.id, sessionAgeDays: v }, 'Antigüedad actualizada (warmup recalculado)');
                      }} />
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
            <div className="rounded border border-dashed p-2.5 text-xs">
              <b>Secreto del worker (una sola vez):</b>
              <code className="block mt-1 break-all text-[10px]">{secretShown}</code>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Grupos */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Grupos ({groups.length})</CardTitle>
          <CardDescription>Importados por el worker (sync por DOM) o pegados a mano. Colecciones por nicho; los excluidos salen de la rotación.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <GroupImport busy={busy} onImport={async (payload) => {
            await post('/api/fb-groups', payload, `Importación completada: ${payload.groups.length} grupos procesados`);
          }} />
          {groups.length > 0 && (
            <div className="max-h-64 overflow-auto rounded border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="p-1.5 text-left font-medium">Grupo</th>
                    <th className="p-1.5 text-left font-medium">Colección</th>
                    <th className="p-1.5 text-left font-medium">Último post</th>
                    <th className="p-1.5 text-left font-medium">Rotación</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.id} className="border-t">
                      <td className="p-1.5">{g.name}</td>
                      <td className="p-1.5"><code className="text-[10px]">{g.collection}</code></td>
                      <td className="p-1.5 text-muted-foreground">{g.lastPostedAt ? new Date(g.lastPostedAt).toLocaleDateString('es-CO') : '—'}</td>
                      <td className="p-1.5">
                        <Button size="sm" variant={g.excluded ? 'destructive' : 'outline'} className="h-6 text-[10px]" disabled={busy}
                          onClick={async () => {
                            await fetch('/api/fb-groups', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: g.id, excluded: !g.excluded }) });
                            setNotice(`Grupo "${g.name}" ${g.excluded ? 'de vuelta en rotación' : 'excluido de la rotación'}`);
                            await load();
                          }}>
                          {g.excluded ? 'Excluido' : 'Activo'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Auto-join (P6) */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Auto-join: unirse a grupos (P6)</CardTitle>
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
              setNotice(`Tareas creadas: ${data.created}. Rechazadas: ${(data.rejected as Array<{ reason: string }>).map((r) => r.reason).join(' | ')}`);
            }
          }} />
          {joinTasks.length > 0 && (
            <div className="max-h-56 overflow-auto rounded border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="p-1.5 text-left font-medium">Grupo</th>
                    <th className="p-1.5 text-left font-medium">Keyword</th>
                    <th className="p-1.5 text-left font-medium">Estado</th>
                    <th className="p-1.5 text-left font-medium">Detalle</th>
                    <th className="p-1.5 text-left font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {joinTasks.map((t) => (
                    <tr key={t.id} className="border-t">
                      <td className="p-1.5 max-w-[220px] truncate"><a href={t.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">{t.fbId}</a></td>
                      <td className="p-1.5"><code className="text-[10px]">{t.keyword || '—'}</code></td>
                      <td className="p-1.5"><Badge variant={JOIN_STATUS_VARIANT[t.status] ?? 'outline'}>{JOIN_STATUS_LABEL[t.status] ?? t.status}</Badge></td>
                      <td className="p-1.5 text-muted-foreground max-w-[260px] truncate" title={t.failReason}>
                        {t.joinedAt ? `unido ${new Date(t.joinedAt).toLocaleDateString('es-CO')}` : t.failReason || `${t.attempts} intento(s)`}
                      </td>
                      <td className="p-1.5">
                        {['PENDING', 'FAILED'].includes(t.status) ? (
                          <Button size="sm" variant="outline" className="h-6 text-[10px]" disabled={busy}
                            onClick={async () => {
                              await fetch('/api/fb-joins', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id, action: 'cancel' }) });
                              setNotice('Tarea de unión cancelada'); await load();
                            }}>
                            Cancelar
                          </Button>
                        ) : ['JOINED', 'REQUESTED', 'SKIPPED', 'FAILED', 'CANCELLED'].includes(t.status) ? (
                          <Button size="sm" variant="outline" className="h-6 text-[10px]" disabled={busy}
                            onClick={async () => {
                              await fetch('/api/fb-joins', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id, action: 'delete' }) });
                              setNotice('Tarea terminada eliminada de la lista'); await load();
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
          )}
          {joinTasks.length > 0 && (
            <p className="text-muted-foreground text-[11px]">
              Cola: {joinCounts.PENDING ?? 0} pendiente(s) · {joinCounts.JOINED ?? 0} unidos · {joinCounts.REQUESTED ?? 0} esperando admin · {joinCounts.FAILED ?? 0} fallidos
            </p>
          )}
        </CardContent>
      </Card>

      {/* Campañas */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Campañas</CardTitle>
          <CardDescription>Un texto aprobado → una variante única por grupo (spintax determinista; reescritura IA si el nivel L2/L3 lo permite). El worker tira de los jobs con leases anti-doble-disparo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <CampaignForm busy={busy} brandId={brandId} groups={groups} onCreate={async (payload) => {
            await post('/api/fb-campaigns', payload, 'Campaña creada. El worker la recogerá dentro de la ventana horaria y del techo diario.');
          }} />
          {campaigns.length > 0 && (
            <div className="space-y-2">
              {campaigns.map((c) => (
                <div key={c.id} className="rounded border p-2.5 text-xs space-y-1.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <b>{c.name}</b>
                    <div className="flex gap-1">
                      <Badge variant="outline">{c.mode === 'profile' ? 'perfil' : c.mode === 'page_in_group' ? 'Página en grupo' : 'grupos'}</Badge>
                      <Badge variant={c.status === 'DONE' ? 'default' : c.status === 'CANCELLED' || c.status === 'PAUSED' ? 'destructive' : 'secondary'}>{c.status}</Badge>
                    </div>
                  </div>
                  <p className="text-muted-foreground">
                    {c.counts.posted} publicados · {c.counts.queued} en cola · {c.counts.failed} fallidos · {c.counts.review} en revisión de admin · total {c.counts.total}
                    {c.mediaCount > 0 ? ` · ${c.mediaCount} adjunto(s)` : ''}
                  </p>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={async () => {
                      await fetch('/api/fb-campaigns', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaignId: c.id, action: 'pause' }) });
                      setNotice('Campaña pausada'); await load();
                    }}>
                      Pausar
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={async () => {
                      await fetch('/api/fb-campaigns', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaignId: c.id, action: 'resume' }) });
                      setNotice('Campaña reanudada'); await load();
                    }}>
                      Reanudar
                    </Button>
                    <Button size="sm" variant="destructive" className="h-7 text-xs" disabled={busy} onClick={async () => {
                      await fetch('/api/fb-campaigns', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaignId: c.id, action: 'cancel' }) });
                      setNotice('Campaña cancelada'); await load();
                    }}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Anti-ban */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Escudo anti-ban</CardTitle>
          <CardDescription>Warmup 5→10→20/día (posts) y 2→4→6/día (uniones) · pausas 3-10 min entre posts y 20-45 min entre uniones · corte nocturno 22:00-07:00 · pausa de 12 h ante cualquier desafío de Facebook.</CardDescription>
        </CardHeader>
        <CardContent className="text-xs space-y-1.5">
          {alerts.length === 0 ? (
            <p className="text-muted-foreground">Sin alertas registradas.</p>
          ) : (
            alerts.map((a) => (
              <div key={a.id} className="flex items-center gap-2 flex-wrap border-b pb-1.5">
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

function WorkerForm({ busy, onRegister }: { busy: boolean; onRegister: (payload: { name: string; baseUrl: string; mode: string; sessionAgeDays: number }) => Promise<void> }) {
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('http://localhost:8765');
  const [mode, setMode] = useState('pc');
  const [sessionAgeDays, setSessionAgeDays] = useState('30');
  return (
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
        onClick={async () => { await onRegister({ name, baseUrl, mode, sessionAgeDays: Number(sessionAgeDays) }); setName(''); }}>
        Registrar worker
      </Button>
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

function CampaignForm({ busy, brandId, groups, onCreate }: {
  busy: boolean; brandId: string | null;
  groups: FbGroupRow[];
  onCreate: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [mode, setMode] = useState('group');
  const [firstComment, setFirstComment] = useState('');
  const [media, setMedia] = useState('');
  const [windowStart, setWindowStart] = useState('7');
  const [windowEnd, setWindowEnd] = useState('21');
  const [selected, setSelected] = useState<string[]>([]);
  const active = groups.filter((g) => !g.excluded);
  const mediaUrls = media.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 4);
  return (
    <div className="space-y-2 text-xs">
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
        <Input className="h-8 w-24 text-xs" type="number" min={0} max={23} value={windowStart} onChange={(e) => setWindowStart(e.target.value)} title="Hora inicio ventana" />
        <span className="self-center">a</span>
        <Input className="h-8 w-24 text-xs" type="number" min={0} max={23} value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} title="Hora fin ventana" />
      </div>
      <Textarea className="text-xs min-h-[72px]" placeholder="Texto base del post (aprobado o del operador). {Spintax|opcional} soportado." value={text} onChange={(e) => setText(e.target.value)} />
      <Textarea className="text-xs min-h-[48px]" placeholder="Adjuntos (opcional): una imagen por línea, máx 4. URL http(s) accesible por el worker o ruta local de su máquina." value={media} onChange={(e) => setMedia(e.target.value)} />
      <Input className="h-8 text-xs" placeholder="Primer comentario (opcional, p.ej. el enlace)" value={firstComment} onChange={(e) => setFirstComment(e.target.value)} />
      {mode !== 'profile' && (
        <div className="max-h-32 overflow-auto rounded border p-2 space-y-1">
          {active.length === 0 ? (
            <p className="text-muted-foreground">Importa grupos primero.</p>
          ) : active.map((g) => (
            <label key={g.id} className="flex items-center gap-2">
              <input type="checkbox" checked={selected.includes(g.id)} onChange={(e) => setSelected((s) => e.target.checked ? [...s, g.id] : s.filter((x) => x !== g.id))} />
              <span>{g.name} <code className="text-[10px] text-muted-foreground">{g.collection}</code></span>
            </label>
          ))}
        </div>
      )}
      <Button size="sm" className="h-8 text-xs" disabled={busy || !name || !text || (mode !== 'profile' && selected.length === 0)}
        onClick={async () => {
          await onCreate({
            brandId, name, text, mode, engine: 'dom', firstComment,
            mediaUrls,
            windowStart: Number(windowStart), windowEnd: Number(windowEnd),
            targets: mode === 'profile' ? [] : selected,
          });
          setName(''); setText(''); setFirstComment(''); setMedia(''); setSelected([]);
        }}>
        Crear campaña ({mode === 'profile' ? 1 : selected.length} objetivo{mode === 'profile' ? '' : 's'}{mediaUrls.length ? ` · ${mediaUrls.length} adjunto${mediaUrls.length > 1 ? 's' : ''}` : ''})
      </Button>
    </div>
  );
}
