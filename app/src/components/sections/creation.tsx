'use client';

// Secciones: Centro de creación + Biblioteca multimedia

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { STATUS_LABEL, SectionHeader, EmptyBrand } from '@/components/sections/dashboard';
import type { SectionProps } from '@/app/page';

interface DraftVersion { id: string; network: string; text: string; specCheck: string }
interface Draft {
  id: string; objective: string; theme: string; status: string; version: number;
  createdAt: string; versions: DraftVersion[];
}

const NET_EMOJI: Record<string, string> = {
  instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', x: 'X',
  linkedin: 'LinkedIn', youtube: 'YouTube', threads: 'Threads',
};

export function CreationSection({ harness, brandId, refresh }: SectionProps) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [form, setForm] = useState({ objective: '', theme: '', network: 'instagram', adaptTo: [] as string[] });
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!brandId) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/drafts?brandId=${brandId}`);
      const data = await res.json();
      if (!cancelled) setDrafts(data);
    })();
    return () => { cancelled = true; };
  }, [brandId, harness?.status]);

  const load = useCallback(async () => {
    if (!brandId) return;
    const res = await fetch(`/api/drafts?brandId=${brandId}`);
    setDrafts(await res.json());
  }, [brandId]);

  const create = async () => {
    if (!form.objective) return;
    const res = await fetch('/api/drafts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brandId, ...form }) });
    const data = await res.json();
    const blocked = data.adapted?.some((a: { validation: { ok: boolean } }) => !a.validation.ok);
    setNote(blocked
      ? 'Borrador creado. Algunas adaptaciones tienen incidencias de validación (vocabulario prohibido, longitud o precios no autorizados).'
      : 'Borrador creado y validado contra la memoria de marca.');
    setForm({ objective: '', theme: '', network: 'instagram', adaptTo: [] });
    load();
  };

  const saveVersion = async (versionId: string) => {
    const res = await fetch('/api/drafts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ versionId, text: editing[versionId] }) });
    const data = await res.json();
    setNote(data.validation?.ok ? 'Versión validada correctamente.' : `Incidencias: ${data.validation?.issues?.join(' · ')}`);
    load();
  };

  return (
    <div>
      <SectionHeader title="Centro de creación" description="Borradores con memoria de marca, validación del supervisor y adaptación multirred con specs reales por red." />
      {note && <p className="text-xs text-muted-foreground mb-3">{note}</p>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Nuevo borrador</CardTitle>
            <CardDescription>El Redactor aplica tono y vocabulario; el Adaptador genera versiones nativas.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input placeholder="Objetivo del contenido" value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} />
            <Input placeholder="Pilar / tema" value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })} />
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Red principal:</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(NET_EMOJI).map((n) => (
                  <button key={n} onClick={() => setForm({ ...form, network: n })}
                    className={`text-xs border rounded-md px-2 py-1 ${form.network === n ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                    {NET_EMOJI[n]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Adaptar además a:</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(NET_EMOJI).filter((n) => n !== form.network).map((n) => (
                  <button key={n}
                    onClick={() => setForm({ ...form, adaptTo: form.adaptTo.includes(n) ? form.adaptTo.filter((x) => x !== n) : [...form.adaptTo, n] })}
                    className={`text-xs border rounded-md px-2 py-1 ${form.adaptTo.includes(n) ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground'}`}>
                    {NET_EMOJI[n]}
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={create} size="sm" disabled={!brandId || !form.objective}>Crear y adaptar</Button>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-3 max-h-[70vh] overflow-y-auto">
          {!brandId ? <EmptyBrand text="El centro de creación necesita una marca." /> : drafts.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Sin borradores todavía.</CardContent></Card>
          ) : drafts.map((d) => (
            <Card key={d.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm">{d.objective}</CardTitle>
                  <Badge variant={d.status === 'PUBLISHED' ? 'secondary' : d.status === 'REJECTED' ? 'destructive' : 'outline'}>{STATUS_LABEL[d.status] ?? d.status} · v{d.version}</Badge>
                </div>
                {d.theme && <CardDescription>Pilar: {d.theme}</CardDescription>}
              </CardHeader>
              <CardContent className="space-y-2">
                {d.versions.map((v) => {
                  const check = JSON.parse(v.specCheck || '{"ok":true,"issues":[]}') as { ok: boolean; issues: string[] };
                  return (
                    <div key={v.id} className="border rounded-md p-2.5 space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px]">{NET_EMOJI[v.network] ?? v.network}</Badge>
                        {check.ok
                          ? <Badge variant="secondary" className="text-[10px]">Validado</Badge>
                          : <Badge variant="destructive" className="text-[10px]">{check.issues.length} incidencia(s)</Badge>}
                      </div>
                      {!check.ok && <ul className="text-[10px] text-destructive list-disc pl-4">{check.issues.map((i, k) => <li key={k}>{i}</li>)}</ul>}
                      {editing[v.id] !== undefined ? (
                        <div className="space-y-1.5">
                          <Textarea rows={3} value={editing[v.id]} onChange={(e) => setEditing({ ...editing, [v.id]: e.target.value })} className="text-xs" />
                          <div className="flex gap-1.5">
                            <Button size="sm" variant="secondary" onClick={() => saveVersion(v.id)}>Guardar y revalidar</Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditing({ ...editing, [v.id]: undefined })}>Cancelar</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <p className="text-xs whitespace-pre-wrap">{v.text}</p>
                          <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setEditing({ ...editing, [v.id]: v.text })}>Editar</Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Biblioteca multimedia ────────────────────────────────────────

export function MediaSection({ harness, brandId, refresh }: SectionProps) {
  const assets: { id: string; label: string; source: string; status: string }[] = (harness?.tools ?? [])
    .filter((t) => t.category === 'CREATIVITY')
    .map((t) => ({ id: t.key, label: t.provider, source: t.provider, status: t.status }));

  return (
    <div>
      <SectionHeader title="Biblioteca multimedia" description="Los assets se producen con los agentes de creatividad del ecosistema (KREA imágenes/voz, YT-Automation vídeo). Cada asset conserva fuente y licencia." />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm">Generadores disponibles</CardTitle>
          <CardDescription>Estado honesto de cada fábrica de assets</CardDescription></CardHeader>
          <CardContent className="space-y-1.5">
            {assets.map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-xs border rounded-md px-2 py-1.5">
                <span className="flex-1 truncate">{a.label}</span>
                <Badge variant={a.status === 'CONNECTED' ? 'default' : 'outline'}>{a.status === 'CONNECTED' ? 'Conectado' : 'Pendiente de credenciales'}</Badge>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground pt-2">
              Con credenciales configuradas (variables de entorno), el Director creativo emite briefs y los assets generados se registran aquí con su referencia de origen.
            </p>
          </CardContent>
        </Card>
        <Card className="md:col-span-1 xl:col-span-2">
          <CardHeader><CardTitle className="text-sm">Política de assets</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1.5">
            <p>1. Todo asset externo guarda: proveedor, fecha, prompt o brief y licencia declarada.</p>
            <p>2. Los assets procedentes de material de terceros requieren autorización documentada antes de publicarse.</p>
            <p>3. Cada pieza de vídeo generada conserva la referencia a su fuente (PRD §15 de OpusClip adaptado a nuestro flujo propio).</p>
            <p>4. La publicación de assets requiere la misma aprobación HITL que el texto.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
