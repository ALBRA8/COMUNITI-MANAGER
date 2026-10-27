'use client';

// Secciones: Agentes + Herramientas e integraciones + Automatizaciones

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SectionHeader, EmptyBrand } from '@/components/sections/dashboard';
import type { SectionProps } from '@/app/page';

// ─── Agentes ──────────────────────────────────────────────────────

export function AgentsSection({ harness }: SectionProps) {
  return (
    <div>
      <SectionHeader title="Agentes" description="14 agentes especializados del arnés + agentes del ecosistema ALBRA que no se duplican: se coordinan." />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {harness?.agents.map((a) => (
          <Card key={a.key}>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm">{a.name}</CardTitle>
              <CardDescription>{a.role}</CardDescription>
            </CardHeader>
            <CardContent className="text-xs space-y-1.5">
              <div className="flex flex-wrap gap-1">
                {a.allowedContracts.map((c) => (
                  <Badge key={c} variant="outline" className="text-[10px]">{c}</Badge>
                ))}
              </div>
              <p className="text-muted-foreground">Límite: {a.limits}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="mt-4">
        <CardHeader className="pb-1"><CardTitle className="text-sm">Ecosistema ALBRA (sin duplicación)</CardTitle>
        <CardDescription>Estos agentes ya cubren capacidades que el arnés NO reimplementa: el arnés orquesta y consume.</CardDescription></CardHeader>
        <CardContent className="text-xs grid gap-1.5 md:grid-cols-2">
          <p><b>AGENTE-CHISMOSO</b> — escucha social, tendencias y oportunidades (malla de eventos).</p>
          <p><b>CRM-ALBRA</b> — mensajería entrante, CRM y handoff humano; el arnés actúa como su host.</p>
          <p><b>AGENTE-LEADS</b> — prospección B2B y outreach 1:1 con evidencia.</p>
          <p><b>WHATSPOWER-ULTRA</b> — difusión masiva WhatsApp con escudo anti-ban.</p>
          <p><b>AGENTE-KREA</b> — generación de imágenes, voz y ebooks.</p>
          <p><b>YOUTUBE-AUTOMATION</b> — fábrica de vídeo y autopublish YouTube.</p>
          <p><b>NEX-SCOPE</b> — investigación de nichos y planes de contenido YouTube.</p>
          <p><b>AGENTE-GENERAL</b> — semilla universal: runtime, memoria, seguridad y auditoría.</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Herramientas ─────────────────────────────────────────────────

const TOOL_STATUS_LABEL: Record<string, string> = {
  CONNECTED: 'Conectado', AWAITING_CREDENTIALS: 'Pendiente de credenciales',
  UNAVAILABLE: 'No disponible', DISABLED: 'Desactivado',
};
const TOOL_STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  CONNECTED: 'default', AWAITING_CREDENTIALS: 'outline', UNAVAILABLE: 'destructive', DISABLED: 'outline',
};

export function ToolsSection({ harness }: SectionProps) {
  return (
    <div>
      <SectionHeader title="Herramientas e integraciones" description="Registro central consultado por el orquestador antes de cada selección. Estados reales, nunca simulados." />
      <div className="grid gap-3 md:grid-cols-2">
        {harness?.tools.map((t) => (
          <Card key={t.key}>
            <CardHeader className="pb-1">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-sm">{t.provider}</CardTitle>
                <Badge variant={TOOL_STATUS_VARIANT[t.status]}>{TOOL_STATUS_LABEL[t.status]}</Badge>
              </div>
              <CardDescription>{t.description}</CardDescription>
            </CardHeader>
            <CardContent className="text-xs space-y-1.5">
              <div className="flex flex-wrap gap-1">
                {t.contracts.map((c) => <Badge key={c} variant="outline" className="text-[10px]">{c}</Badge>)}
              </div>
              <p className="text-muted-foreground">Categoría: {t.category}{t.rateLimit ? ` · Límite: ${t.rateLimit}` : ''}{t.costNote ? ` · Coste: ${t.costNote}` : ''}</p>
              <p className="text-muted-foreground">Clave de registro: <code className="text-[10px]">{t.key}</code>{t.lastResult ? ` · Último resultado: ${t.lastResult}` : ''}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Automatizaciones ─────────────────────────────────────────────

interface ScheduleRow {
  id: string; brandId: string; name: string; hour: number; minute: number; days: string;
  timezone: string; topic: string; objective: string; enabled: boolean;
  lastRunAt: string | null; lastResult: string;
  brand: { id: string; name: string };
}

const DAY_LABELS = [
  { d: '1', s: 'L' }, { d: '2', s: 'M' }, { d: '3', s: 'X' }, { d: '4', s: 'J' },
  { d: '5', s: 'V' }, { d: '6', s: 'S' }, { d: '7', s: 'D' },
];
const DAY_NAMES: Record<string, string> = { '1': 'lunes', '2': 'martes', '3': 'miércoles', '4': 'jueves', '5': 'viernes', '6': 'sábado', '7': 'domingo' };

function daysToLabel(days: string): string {
  const set = new Set(days.split(','));
  if (set.size === 7) return 'Todos los días';
  if (set.has('1') && set.has('5') && set.size === 5 && ['1', '2', '3', '4', '5'].every((d) => set.has(d))) return 'Lunes a viernes';
  if (set.size === 2 && set.has('6') && set.has('7')) return 'Fin de semana';
  return days.split(',').map((d) => DAY_NAMES[d] ?? d).join(', ');
}

export function AutomationsSection({ harness, brandId, refresh }: SectionProps) {
  const [schedules, setSchedules] = useState<ScheduleRow[] | null>(null);
  const [loop, setLoop] = useState<{ active: boolean; lastTick: string | null }>({ active: false, lastTick: null });
  const [note, setNote] = useState('');
  const [form, setForm] = useState({ name: 'Ciclo diario', time: '09:00', days: '1,2,3,4,5,6,7', timezone: 'America/Bogota', topic: '', objective: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const res = await fetch('/api/scheduler');
    if (res.ok) {
      const data = await res.json();
      setSchedules(data.schedules);
      setLoop(data.loop);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch('/api/scheduler');
      if (!res.ok) return;
      const data = await res.json();
      if (!cancelled) {
        setSchedules(data.schedules);
        setLoop(data.loop);
      }
    })();
    return () => { cancelled = true; };
  }, [refresh]);

  const act = async (payload: Record<string, unknown>, okNote: string) => {
    setSaving(true);
    const res = await fetch('/api/scheduler', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    setNote(res.ok ? okNote : (data.error ?? 'Error en la operación'));
    setSaving(false);
    load();
    refresh();
  };

  const create = async () => {
    if (!brandId) return;
    setSaving(true);
    const res = await fetch('/api/scheduler', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', brandId, ...form }) });
    const data = await res.json().catch(() => ({}));
    setNote(res.ok ? `Programación creada: ${form.name} a las ${form.time}.` : (data.error ?? 'Error al crear'));
    setSaving(false);
    if (res.ok) { setForm({ ...form, topic: '', objective: '' }); }
    load();
    refresh();
  };

  const toggleDay = (d: string) => {
    const set = new Set(form.days.split(','));
    if (set.has(d)) set.delete(d); else set.add(d);
    const ordered = DAY_LABELS.map((x) => x.d).filter((x) => set.has(x));
    if (ordered.length) setForm({ ...form, days: ordered.join(',') });
  };

  return (
    <div>
      <SectionHeader title="Automatizaciones" description="La planificación inteligente vive en el orquestador; la automatización determinista en los jobs de la semilla. Separadas por diseño." />

      {note && <p className="text-xs text-muted-foreground mb-3">{note}</p>}

      {!brandId && <EmptyBrand text="Las programaciones se crean por marca: crea o selecciona una marca." />}

      {brandId && (
        <Card className="mb-4">
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm">Nueva programación del ciclo</CardTitle>
              <Badge variant={loop.active ? 'secondary' : 'outline'}>{loop.active ? 'Bucle interno activo' : 'Bucle interno: se activa al reiniciar'}</Badge>
            </div>
            <CardDescription>El ciclo completo (12 fases) se ejecuta a la hora local indicada, respetando pausa global, horarios permitidos y aprobaciones. Anti-duplicado por día.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <label className="text-[11px] font-medium">Nombre</label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium">Hora local (HH:MM)</label>
                <Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium">Zona horaria</label>
                <Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} placeholder="America/Bogota" />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium">Tema opcional</label>
                <Input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="Ej.: novedades del sector" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium">Días:</span>
              {DAY_LABELS.map(({ d, s }) => (
                <button
                  key={d}
                  onClick={() => toggleDay(d)}
                  className={`h-8 w-8 rounded-full text-xs font-semibold border transition-colors ${form.days.split(',').includes(d) ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-accent'}`}
                  aria-pressed={form.days.split(',').includes(d)}
                  aria-label={DAY_NAMES[d]}
                >{s}</button>
              ))}
              <Button size="sm" onClick={create} disabled={saving || !form.days} className="ml-auto">{saving ? 'Guardando…' : 'Crear programación'}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {schedules === null && <p className="text-xs text-muted-foreground">Cargando programaciones…</p>}

      {schedules !== null && schedules.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 mb-4">
          {schedules.map((s) => (
            <Card key={s.id}>
              <CardHeader className="pb-1">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm">{s.name}</CardTitle>
                  <Badge variant={s.enabled ? 'secondary' : 'outline'}>{s.enabled ? 'Activa' : 'Pausada'}</Badge>
                </div>
                <CardDescription>{s.brand.name} · {String(s.hour).padStart(2, '0')}:{String(s.minute).padStart(2, '0')} {s.timezone} · {daysToLabel(s.days)}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                {s.topic && <p className="text-muted-foreground">Tema: {s.topic}</p>}
                <p className="text-muted-foreground">
                  Última ejecución: {s.lastRunAt ? new Date(s.lastRunAt).toLocaleString('es-CO') : 'nunca'}
                  {s.lastResult ? ` · ${s.lastResult}` : ''}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="outline" disabled={saving} onClick={() => act({ action: 'run_now', scheduleId: s.id }, 'Ciclo lanzado ahora.')}>Ejecutar ahora</Button>
                  <Button size="sm" variant="outline" disabled={saving} onClick={() => act({ action: 'toggle', scheduleId: s.id }, s.enabled ? 'Programación pausada.' : 'Programación activada.')}>{s.enabled ? 'Pausar' : 'Activar'}</Button>
                  <Button size="sm" variant="destructive" disabled={saving} onClick={() => act({ action: 'delete', scheduleId: s.id }, 'Programación eliminada.')}>Eliminar</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {schedules !== null && brandId && schedules.length === 0 && (
        <p className="text-xs text-muted-foreground mb-4">Sin programaciones aún para esta vista. Crea una arriba: el arnés disparará el ciclo solo a la hora indicada.</p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {[
          { name: 'Clasificación de interacciones', trigger: 'Nueva interacción (bandeja o webhook)', detail: 'El community manager clasifica y decide responder/derivar según política y modo de autonomía.', status: 'Activa en el ciclo' },
          { name: 'Verificación de publicaciones', trigger: 'Tras publicar', detail: 'El publicador verifica el resultado y guarda evidencia; resultado incierto → reconciliación.', status: 'Activa en el ciclo' },
          { name: 'Malla del ecosistema', trigger: 'Webhook entrante (Chismoso/Leads/CRM)', detail: 'Firmado con HMAC-SHA256 (x-harness-signature) o Bearer; los eventos se registran como interacciones con evidencia.', status: 'Activa' },
          { name: 'Reintentos con backoff', trigger: 'Fallo de tarea', detail: 'Hasta maxAttempts con backoff exponencial; falla definitiva → registro de errores.', status: 'Activa' },
          { name: 'Tick externo (cron del SO)', trigger: 'POST /api/scheduler {action:tick} con firma', detail: 'Alternativa al bucle interno: un cron del sistema llama al tick cada minuto con el secreto del arnés.', status: 'Opcional' },
        ].map((a) => (
          <Card key={a.name}>
            <CardHeader className="pb-1">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm">{a.name}</CardTitle>
                <Badge variant={a.status.startsWith('Activa') ? 'secondary' : 'outline'}>{a.status}</Badge>
              </div>
              <CardDescription>Disparador: {a.trigger}</CardDescription>
            </CardHeader>
            <CardContent><p className="text-xs text-muted-foreground">{a.detail}</p></CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
