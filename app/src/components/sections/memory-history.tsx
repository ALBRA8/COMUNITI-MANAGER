'use client';

// Secciones: Memoria de marca + Historial + Errores + Costes + Seguridad

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SectionHeader, EmptyBrand, STATUS_LABEL } from '@/components/sections/dashboard';
import type { SectionProps, HarnessState } from '@/app/page';

// ─── Memoria de marca ─────────────────────────────────────────────

interface BrandDetail {
  id: string; name: string; identity: string; products: string; audience: string; tone: string;
  vocabulary: string; forbiddenWords: string; policies: string; faqs: string; approvedExamples: string;
  supportInfo: string; maxPostsPerDay: number; allowedHours: string;
}

export function MemorySection({ harness, brandId, refresh }: SectionProps) {
  if (!brandId) return <div><SectionHeader title="Memoria de marca" description="Base de conocimiento independiente por marca." /><EmptyBrand text="La memoria se activa al crear una marca." /></div>;

  const brandFromState = harness?.brands.find((x) => x.id === brandId);
  if (!brandFromState) {
    return <div><SectionHeader title="Memoria de marca" description="Base de conocimiento independiente por marca." /><EmptyBrand text="Selecciona una marca válida." /></div>;
  }

  return <MemoryForm key={brandId} brand={brandFromState} refresh={refresh} />;
}

function MemoryForm({ brand, refresh }: { brand: NonNullable<HarnessState['brands'][number]>; refresh: () => void }) {
  const [brandForm, setBrandForm] = useState<BrandDetail>({
    id: brand.id, name: brand.name, identity: brand.identity, products: '', audience: '', tone: brand.tone,
    vocabulary: '', forbiddenWords: '', policies: '', faqs: '[]', approvedExamples: '[]',
    supportInfo: '', maxPostsPerDay: brand.maxPostsPerDay, allowedHours: brand.allowedHours,
  });
  const [note, setNote] = useState('');

  const save = async () => {
    if (!brandForm) return;
    let faqs: unknown = [];
    try { faqs = JSON.parse(brandForm.faqs || '[]'); } catch { setNote('FAQs debe ser JSON válido: [{"q":"...","a":"..."}]'); return; }
    let examples: unknown = [];
    try { examples = JSON.parse(brandForm.approvedExamples || '[]'); } catch { setNote('Ejemplos debe ser JSON válido: [{"network":"instagram","text":"..."}]'); return; }
    await fetch('/api/brands', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: brandForm.id, identity: brandForm.identity, tone: brandForm.tone, products: brandForm.products, audience: brandForm.audience, vocabulary: brandForm.vocabulary, forbiddenWords: brandForm.forbiddenWords, policies: brandForm.policies, supportInfo: brandForm.supportInfo, maxPostsPerDay: brandForm.maxPostsPerDay, allowedHours: brandForm.allowedHours, faqs, approvedExamples: examples }),
    });
    setNote('Memoria de marca actualizada. Toda generación usará estos datos.');
    refresh();
  };

  const set = (k: keyof BrandDetail, v: string | number) => setBrandForm({ ...brandForm, [k]: v });

  return (
    <div>
      <SectionHeader title="Memoria de marca" description="Identidad, tono, vocabulario, prohibidos, FAQs y precios autorizados. Procedencia conservada; datos nunca compartidos entre marcas." />
      {note && <p className="text-xs text-muted-foreground mb-3">{note}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">Identidad y voz</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Input value={brandForm.identity} onChange={(e) => set('identity', e.target.value)} placeholder="Identidad" />
            <Input value={brandForm.tone} onChange={(e) => set('tone', e.target.value)} placeholder="Tono de voz" />
            <Input value={brandForm.vocabulary} onChange={(e) => set('vocabulary', e.target.value)} placeholder="Vocabulario preferido (comas)" />
            <Input value={brandForm.forbiddenWords} onChange={(e) => set('forbiddenWords', e.target.value)} placeholder="Palabras prohibidas (comas)" />
            <Textarea value={brandForm.products} onChange={(e) => set('products', e.target.value)} placeholder="Productos y servicios" rows={2} />
            <Textarea value={brandForm.audience} onChange={(e) => set('audience', e.target.value)} placeholder="Público objetivo" rows={2} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Políticas y conocimiento</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Textarea value={brandForm.policies} onChange={(e) => set('policies', e.target.value)} placeholder="Políticas comerciales y precios autorizados" rows={3} />
            <Textarea value={brandForm.faqs} onChange={(e) => set('faqs', e.target.value)} placeholder='FAQs JSON: [{"q":"horario","a":"Atendemos 8-18"}]' rows={3} />
            <Textarea value={brandForm.approvedExamples} onChange={(e) => set('approvedExamples', e.target.value)} placeholder='Ejemplos aprobados JSON: [{"network":"instagram","text":"..."}]' rows={3} />
            <Textarea value={brandForm.supportInfo} onChange={(e) => set('supportInfo', e.target.value)} placeholder="Información de soporte" rows={2} />
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" min={1} max={10} value={brandForm.maxPostsPerDay} onChange={(e) => set('maxPostsPerDay', Number(e.target.value))} placeholder="Máx. posts/día" />
              <Input value={brandForm.allowedHours} onChange={(e) => set('allowedHours', e.target.value)} placeholder="Horario 08-20" />
            </div>
            <Button onClick={save} size="sm">Guardar memoria</Button>
          </CardContent>
        </Card>
      </div>
      <SkillsLibrary brandId={brand.id} />
    </div>
  );
}

// ─── Biblioteca de habilidades (SKILL.md) ─────────────────────────

interface SkillRow {
  id: string; key: string; name: string; category: string; format: string;
  body: string; version: number; status: string; source: string;
  brandId: string | null; brand: { id: string; name: string } | null;
}

const SKILL_CATEGORIES = ['CONTENT', 'ENGAGEMENT', 'ANALYTICS', 'CRISIS', 'GROWTH'];
const SKILL_CAT_LABEL: Record<string, string> = {
  CONTENT: 'Contenido', ENGAGEMENT: 'Engagement', ANALYTICS: 'Analítica', CRISIS: 'Crisis', GROWTH: 'Crecimiento',
};

function SkillsLibrary({ brandId }: { brandId: string }) {
  const [skills, setSkills] = useState<SkillRow[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{ name: string; category: string; body: string } | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch(`/api/skills?brandId=${encodeURIComponent(brandId)}`);
    if (res.ok) setSkills(await res.json());
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/skills?brandId=${encodeURIComponent(brandId)}`);
      const data = res.ok ? await res.json() : null;
      if (!cancelled && data) setSkills(data);
    })();
    return () => { cancelled = true; };
  }, [brandId]);

  const create = async () => {
    if (!form?.name.trim() || !form.body.trim()) { setNote('Nombre y contenido son obligatorios.'); return; }
    setSaving(true);
    const res = await fetch('/api/skills', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brandId, name: form.name, category: form.category, body: form.body }) });
    const data = await res.json().catch(() => ({}));
    setNote(res.ok ? `Habilidad creada: ${form.name}` : (data.error ?? 'Error al crear'));
    setSaving(false);
    if (res.ok) setForm(null);
    load();
  };

  const saveEdit = async () => {
    if (!form || !editId) return;
    setSaving(true);
    const res = await fetch('/api/skills', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update', id: editId, name: form.name, category: form.category, body: form.body }) });
    const data = await res.json().catch(() => ({}));
    setNote(res.ok ? `Habilidad actualizada (versión ${(data.skill?.version ?? '?')}). Las anteriores quedan en el historial de auditoría.` : (data.error ?? 'Error al actualizar'));
    setSaving(false);
    if (res.ok) { setForm(null); setEditId(null); }
    load();
  };

  const archive = async (id: string, name: string) => {
    setSaving(true);
    await fetch('/api/skills', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'archive', id }) });
    setNote(`Habilidad "${name}" archivada.`);
    setSaving(false);
    load();
  };

  return (
    <Card className="mt-4">
      <CardHeader className="pb-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm">Biblioteca de habilidades (SKILL.md)</CardTitle>
            <CardDescription>Procedimientos versionados en base de datos que los agentes consultan al ejecutar. Semilla de autoría propia + habilidades que crees tú. Globales y de marca conviven.</CardDescription>
          </div>
          {!form && <Button size="sm" variant="outline" onClick={() => { setForm({ name: '', category: 'CONTENT', body: '' }); setEditId(null); setNote(''); }}>Nueva habilidad</Button>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {note && <p className="text-xs text-muted-foreground">{note}</p>}

        {form && (
          <div className="space-y-2 rounded-lg border p-3">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre de la habilidad" />
            <div className="flex flex-wrap gap-1">
              {SKILL_CATEGORIES.map((c) => (
                <button key={c} onClick={() => setForm({ ...form, category: c })}
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors ${form.category === c ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-accent'}`}
                  aria-pressed={form.category === c}>{SKILL_CAT_LABEL[c]}</button>
              ))}
            </div>
            <Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder={'# Título\n## Objetivo\n## Estructura / Protocolo\n## Reglas de marca\n## Criterio de finalización'} rows={8} />
            <div className="flex gap-2">
              <Button size="sm" onClick={editId ? saveEdit : create} disabled={saving}>{saving ? 'Guardando…' : editId ? 'Guardar nueva versión' : 'Crear habilidad'}</Button>
              <Button size="sm" variant="outline" onClick={() => { setForm(null); setEditId(null); }}>Cancelar</Button>
            </div>
          </div>
        )}

        {skills === null && <p className="text-xs text-muted-foreground">Cargando habilidades…</p>}

        {skills !== null && (
          <div className="grid gap-2 max-h-96 overflow-y-auto">
            {skills.map((s) => (
              <div key={s.id} className="rounded-lg border p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold">{s.name} <span className="font-normal text-muted-foreground">· v{s.version}</span></p>
                    <p className="text-[10px] text-muted-foreground"><code>{s.key}</code> · {s.brand ? `de marca (${s.brand.name})` : 'global'}{s.source === 'semilla' ? ' · semilla del arnés' : ''}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[10px]">{SKILL_CAT_LABEL[s.category] ?? s.category}</Badge>
                    {s.status === 'DRAFT' && <Badge variant="outline" className="text-[10px]">Borrador</Badge>}
                  </div>
                </div>
                {expanded === s.id ? (
                  <pre className="whitespace-pre-wrap text-[11px] text-muted-foreground max-h-64 overflow-y-auto rounded bg-muted p-2">{s.body}</pre>
                ) : (
                  <p className="text-[11px] text-muted-foreground line-clamp-2">{s.body.split('\n').filter((l) => l && !l.startsWith('#')).slice(0, 2).join(' ')}</p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => setExpanded(expanded === s.id ? null : s.id)}>{expanded === s.id ? 'Ocultar' : 'Ver completa'}</Button>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => { setForm({ name: s.name, category: s.category, body: s.body }); setEditId(s.id); setNote(`Editando "${s.name}": al guardar se crea la versión ${s.version + 1}.`); }}>Editar</Button>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-destructive" disabled={saving} onClick={() => archive(s.id, s.name)}>Archivar</Button>
                </div>
              </div>
            ))}
            {skills.length === 0 && <p className="text-xs text-muted-foreground">Sin habilidades aún.</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Historial de ejecución ───────────────────────────────────────

interface TaskRow { id: string; type: string; phase: string; agent: string; status: string; attempts: number; errorDetail: string; createdAt: string; events: { id: string; phase: string; message: string; createdAt: string }[] }

export function HistorySection({ harness, brandId }: SectionProps) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);

  useEffect(() => {
    if (!brandId) {
      queueMicrotask(() => setTasks([]));
      return;
    }
    let cancelled = false;
    const load = () => fetch(`/api/orchestrator?brandId=${brandId}`).then((r) => r.json()).then((d) => { if (!cancelled) setTasks(d); }).catch(() => {});
    load();
    const t = setInterval(load, 10000);
    return () => { cancelled = true; clearInterval(t); };
  }, [brandId, harness?.status]);

  return (
    <div>
      <SectionHeader title="Historial de ejecución" description="Traza paso a paso de cada tarea del orquestador (quién, qué, cuándo, con qué resultado)." />
      {!brandId ? <EmptyBrand text="El historial se organiza por marca." /> : (
        <div className="space-y-2">
          {tasks.length === 0 && <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">Sin tareas registradas.</CardContent></Card>}
          {tasks.map((t) => (
            <Card key={t.id}>
              <CardContent className="pt-3 pb-3 text-xs space-y-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline">{t.phase}</Badge>
                  <Badge variant={t.status === 'COMPLETED' ? 'secondary' : t.status === 'FAILED' ? 'destructive' : t.status === 'WAITING_APPROVAL' ? 'default' : 'outline'}>
                    {STATUS_LABEL[t.status] ?? t.status}
                  </Badge>
                  <span className="font-medium">{t.type}</span>
                  <span className="text-muted-foreground">agente: {t.agent} · intentos: {t.attempts}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">{new Date(t.createdAt).toLocaleString('es')}</span>
                </div>
                {t.errorDetail && <p className="text-destructive">{t.errorDetail}</p>}
                <div className="pl-3 border-l space-y-0.5">
                  {t.events.map((e) => (
                    <p key={e.id} className="text-muted-foreground">{new Date(e.createdAt).toLocaleTimeString('es')} — {e.message}</p>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Registro de errores ──────────────────────────────────────────

interface ErrorRow { id: string; source: string; severity: string; message: string; recovery: string; resolved: boolean; createdAt: string }

export function ErrorsSection({ harness, brandId, refresh }: SectionProps) {
  const [errors, setErrors] = useState<ErrorRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch('/api/errors');
      const data = await res.json();
      if (!cancelled) setErrors(data);
    })();
    return () => { cancelled = true; };
  }, [harness?.status]);

  const load = useCallback(async () => {
    const res = await fetch('/api/errors');
    setErrors(await res.json());
  }, []);

  const resolve = async (id: string) => {
    await fetch('/api/errors', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, resolved: true }) });
    load(); refresh();
  };

  return (
    <div>
      <SectionHeader title="Registro de errores" description="Cada error guarda severidad, detalle y acción de recuperación sugerida." />
      <div className="space-y-2">
        {errors.length === 0 && <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">Sin errores registrados.</CardContent></Card>}
        {errors.map((e) => (
          <Card key={e.id} className={e.resolved ? 'opacity-60' : ''}>
            <CardContent className="pt-3 pb-3 text-xs space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant={e.severity === 'CRITICAL' ? 'destructive' : e.severity === 'WARNING' ? 'outline' : 'secondary'}>{e.severity}</Badge>
                <span className="font-medium">{e.source}</span>
                {e.resolved ? <Badge variant="secondary">Resuelto</Badge> : (
                  <Button size="sm" variant="ghost" className="h-5 text-[10px] ml-1" onClick={() => resolve(e.id)}>Marcar resuelto</Button>
                )}
                <span className="text-[10px] text-muted-foreground ml-auto">{new Date(e.createdAt).toLocaleString('es')}</span>
              </div>
              <p>{e.message}</p>
              {e.recovery && <p className="text-muted-foreground">Recuperación: {e.recovery}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Costes y límites ─────────────────────────────────────────────

export function CostsSection({ harness, brandId }: SectionProps) {
  const brand = harness?.brands.find((b) => b.id === brandId);
  return (
    <div>
      <SectionHeader title="Costes y límites" description="Presupuesto por marca, límites de frecuencia y coste estimado de cada proveedor." />
      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm">Límites de la marca activa</CardTitle></CardHeader>
          <CardContent className="text-xs space-y-1">
            {brand ? (
              <>
                <p>Máximo de publicaciones por día: <b>{brand.maxPostsPerDay}</b></p>
                <p>Horario permitido: <b>{brand.allowedHours}</b></p>
                <p className="text-muted-foreground">El planificador y el publicador rechazan acciones fuera de estos límites.</p>
              </>
            ) : <p className="text-muted-foreground">Selecciona una marca.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm">Coste estimado por herramienta</CardTitle></CardHeader>
          <CardContent className="text-xs space-y-1">
            {harness?.tools.map((t) => (
              <div key={t.key} className="flex justify-between gap-2 border-b border-border/40 pb-1">
                <span className="truncate">{t.provider}</span>
                <span className="text-muted-foreground shrink-0">{t.costNote || 'Sin coste documentado'}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Configuración de seguridad ───────────────────────────────────

export function SecuritySection({ harness, refresh }: SectionProps) {
  const [audit, setAudit] = useState<{ id: string; actor: string; action: string; targetType: string; targetId: string; allowed: boolean; reason: string; createdAt: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch('/api/audit');
      const data = await res.json();
      if (!cancelled) setAudit(data);
    })();
    return () => { cancelled = true; };
  }, [harness?.status]);

  const load = useCallback(async () => {
    const res = await fetch('/api/audit');
    setAudit(await res.json());
  }, []);

  const setMode = async (mode: string) => {
    await fetch('/api/harness', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set_mode', mode }) });
    refresh();
  };

  const MODES = [
    { id: 'L1_ASSISTED', name: 'Asistido', desc: 'Investiga, recomienda y prepara borradores. Ninguna acción externa sin autorización.' },
    { id: 'L2_SUPERVISED', name: 'Supervisado', desc: 'Ejecuta acciones expresamente autorizadas; publicar/responder/moderar requiere aprobación.' },
    { id: 'L3_AUTONOMOUS_LIMITED', name: 'Autónomo con límites', desc: 'Acciones de bajo riesgo dentro de límites; riesgo alto siempre con aprobación.' },
  ];

  return (
    <div>
      <SectionHeader title="Configuración de seguridad" description="Autonomía ≠ permiso: ningún agente puede eludir el firewall, la pausa global o las aprobaciones." />
      <div className="grid gap-3 md:grid-cols-3 mb-4">
        {MODES.map((m) => (
          <Card key={m.id} className={harness?.autonomyMode === m.id ? 'border-primary' : ''}>
            <CardHeader className="pb-1">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm">{m.name}</CardTitle>
                {harness?.autonomyMode === m.id && <Badge>Activo</Badge>}
              </div>
              <CardDescription>{m.desc}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button size="sm" variant={harness?.autonomyMode === m.id ? 'secondary' : 'outline'} disabled={harness?.autonomyMode === m.id} onClick={() => setMode(m.id)}>
                {harness?.autonomyMode === m.id ? 'Modo actual' : 'Activar'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader className="pb-1"><CardTitle className="text-sm">Auditoría (inmutable, append-only)</CardTitle>
        <CardDescription>Toda acción externa, decisión y cambio de configuración queda registrada.</CardDescription></CardHeader>
        <CardContent className="text-xs space-y-1 max-h-80 overflow-y-auto">
          {audit.length === 0 && <p className="text-muted-foreground">Sin entradas de auditoría todavía.</p>}
          {audit.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-1.5 border-b border-border/40 pb-1">
              <Badge variant={a.allowed ? 'secondary' : 'destructive'} className="text-[10px]">{a.action}</Badge>
              <span>{a.actor}</span>
              <span className="text-muted-foreground">{a.reason}</span>
              <span className="text-[10px] text-muted-foreground ml-auto">{new Date(a.createdAt).toLocaleString('es')}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
