'use client';

// Secciones: Marcas y cuentas + Calendario editorial

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { NETWORKS, NETWORK_SPECS } from '@/lib/contracts';
import { TOOL_STATUS_VARIANT, TOOL_STATUS_LABEL, STATUS_LABEL, SectionHeader, EmptyBrand } from '@/components/sections/dashboard';
import type { SectionProps } from '@/app/page';

const NET_LABEL: Record<string, string> = {
  instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', x: 'X',
  linkedin: 'LinkedIn', youtube: 'YouTube', threads: 'Threads',
};

// ─── Marcas y cuentas ─────────────────────────────────────────────

export function BrandsSection({ harness, refresh }: SectionProps) {
  const [form, setForm] = useState({ name: '', identity: '', audience: '', tone: '', products: '', vocabulary: '', forbiddenWords: '', policies: '', maxPostsPerDay: 3, allowedHours: '08-20', networks: [] as string[] });

  const create = async () => {
    if (!form.name || !form.identity) return;
    await fetch('/api/brands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setForm({ name: '', identity: '', audience: '', tone: '', products: '', vocabulary: '', forbiddenWords: '', policies: '', maxPostsPerDay: 3, allowedHours: '08-20', networks: [] });
    refresh();
  };

  return (
    <div>
      <SectionHeader title="Marcas y cuentas" description="Cada marca tiene memoria aislada; los datos de una marca nunca son accesibles desde otra." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Marcas registradas</CardTitle>
            <CardDescription>{harness?.brands.length ?? 0} marca(s)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-96 overflow-y-auto">
            {harness?.brands.map((b) => (
              <div key={b.id} className="border rounded-md p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm">{b.name}</p>
                  <Badge variant="outline">{b.accounts.length} cuenta(s)</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{b.identity}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {b.accounts.map((a) => (
                    <Badge key={a.id} variant={TOOL_STATUS_VARIANT[a.status]} className="text-[10px]">
                      {NET_LABEL[a.network] ?? a.network}: {TOOL_STATUS_LABEL[a.status]}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
            {!harness?.brands.length && <p className="text-sm text-muted-foreground">Sin marcas todavía.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Nueva marca</CardTitle>
            <CardDescription>La identidad, el tono y las palabras prohibidas alimentan la memoria de marca y la validación de contenido.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input placeholder="Nombre de la marca" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input placeholder="Identidad (qué es la marca)" value={form.identity} onChange={(e) => setForm({ ...form, identity: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Público objetivo" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} />
              <Input placeholder="Tono de voz" value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })} />
            </div>
            <Input placeholder="Vocabulario preferido (separado por comas)" value={form.vocabulary} onChange={(e) => setForm({ ...form, vocabulary: e.target.value })} />
            <Input placeholder="Palabras prohibidas (separado por comas)" value={form.forbiddenWords} onChange={(e) => setForm({ ...form, forbiddenWords: e.target.value })} />
            <Textarea placeholder="Políticas comerciales (precios autorizados, condiciones…)" value={form.policies} onChange={(e) => setForm({ ...form, policies: e.target.value })} rows={2} />
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" min={1} max={10} value={form.maxPostsPerDay} onChange={(e) => setForm({ ...form, maxPostsPerDay: Number(e.target.value) })} placeholder="Máx. posts/día" />
              <Input value={form.allowedHours} onChange={(e) => setForm({ ...form, allowedHours: e.target.value })} placeholder="Horario 08-20" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Redes a activar (sin credenciales quedan “pendientes” de forma honesta):</p>
              <div className="flex flex-wrap gap-2">
                {NETWORKS.map((n) => (
                  <label key={n} className="flex items-center gap-1.5 text-xs border rounded-md px-2 py-1 cursor-pointer">
                    <Checkbox
                      checked={form.networks.includes(n)}
                      onCheckedChange={(c) => setForm({ ...form, networks: c ? [...form.networks, n] : form.networks.filter((x) => x !== n) })}
                    />
                    {NET_LABEL[n] ?? n}
                  </label>
                ))}
              </div>
            </div>
            <Button onClick={create} disabled={!form.name || !form.identity}>Crear marca</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Calendario editorial ─────────────────────────────────────────

interface Pub {
  id: string; network: string; status: string; scheduledAt: string | null; publishedAt: string | null;
  verifyStatus: string; externalId: string | null; idempotencyKey: string; errorDetail: string;
  draft: { objective: string; versions: { network: string; text: string }[] };
}

export function CalendarSection({ harness, brandId, refresh }: SectionProps) {
  const [data, setData] = useState<{ publications: Pub[]; drafts: { id: string; objective: string; status: string; versions: { network: string; text: string }[] }[] } | null>(null);

  useEffect(() => {
    if (!brandId) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/calendar?brandId=${brandId}`);
      const data = await res.json();
      if (!cancelled) setData(data);
    })();
    return () => { cancelled = true; };
  }, [brandId, harness?.status]);

  if (!brandId) return <div><SectionHeader title="Calendario editorial" description="Publicaciones programadas, publicadas y pendientes." /><EmptyBrand text="El calendario se activa al crear una marca." /></div>;

  const byDay = new Map<string, Pub[]>();
  for (const p of data?.publications ?? []) {
    const d = (p.publishedAt ?? p.scheduledAt ?? '').slice(0, 10) || 'Sin fecha';
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(p);
  }

  return (
    <div>
      <SectionHeader title="Calendario editorial" description="Cada publicación guarda id único, versión, aprobaciones, id externo y evidencia de verificación." />
      {!data?.publications.length ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          Sin publicaciones registradas. Ejecuta el ciclo autónomo desde el Resumen ejecutivo o crea un borrador en el Centro de creación.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[...byDay.entries()].map(([day, pubs]) => (
            <Card key={day}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{day}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {pubs.map((p) => (
                  <div key={p.id} className="border rounded-md p-2.5 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline">{NET_LABEL[p.network] ?? p.network}</Badge>
                      <Badge variant={p.status === 'PUBLISHED' ? 'secondary' : p.status === 'FAILED' ? 'destructive' : 'outline'}>
                        {STATUS_LABEL[p.status] ?? p.status}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground line-clamp-2">{p.draft.versions.find((v) => v.network === p.network)?.text ?? p.draft.objective}</p>
                    <p className="text-[10px] text-muted-foreground">Idempotencia: {p.idempotencyKey.slice(0, 24)}… · Verificación: {STATUS_LABEL[p.verifyStatus] ?? p.verifyStatus}</p>
                    {p.errorDetail && <p className="text-[10px] text-destructive">{p.errorDetail}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
