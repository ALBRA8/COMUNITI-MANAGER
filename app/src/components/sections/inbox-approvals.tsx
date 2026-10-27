'use client';

// Secciones: Bandeja de comentarios/mensajes + Cola de aprobaciones

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { STATUS_LABEL, SectionHeader, EmptyBrand } from '@/components/sections/dashboard';
import type { SectionProps } from '@/app/page';

interface CommentItem {
  id: string; network: string; author: string; text: string; kind: string;
  classification: string; sentiment: string; risk: string; status: string;
  suggestedReply: string; replyText: string; evidence: string; createdAt: string;
}

const RISK_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  LOW: 'secondary', MEDIUM: 'outline', HIGH: 'default', CRITICAL: 'destructive',
};

// ─── Comunidad ────────────────────────────────────────────────────

export function CommunitySection({ harness, brandId, refresh }: SectionProps) {
  const [items, setItems] = useState<CommentItem[]>([]);
  const [newItem, setNewItem] = useState({ network: 'instagram', author: '', text: '' });
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!brandId) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/community?brandId=${brandId}`);
      const data = await res.json();
      if (!cancelled) setItems(data);
    })();
    return () => { cancelled = true; };
  }, [brandId, harness?.status]);

  const load = useCallback(async () => {
    if (!brandId) return;
    const res = await fetch(`/api/community?brandId=${brandId}`);
    setItems(await res.json());
  }, [brandId]);

  const add = async () => {
    if (!newItem.text) return;
    const res = await fetch('/api/community', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brandId, ...newItem }) });
    const data = await res.json();
    setNote(data.autoReplyAllowed ? 'Clasificada: respuesta automática permitida en modo actual.' : `Clasificada: ${data.autoReplyReason}`);
    setNewItem({ network: 'instagram', author: '', text: '' });
    load();
  };

  const act = async (id: string, action: string) => {
    const res = await fetch('/api/community', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action, replyText: replies[id] }),
    });
    const data = await res.json();
    if (data.requiresApproval) setNote(`Enviado a la cola de aprobaciones (${data.reason})`);
    else setNote(data.note ?? data.reason ?? 'Acción aplicada');
    load(); refresh();
  };

  return (
    <div>
      <SectionHeader title="Bandeja de comentarios y mensajes" description="Clasificación en 11 categorías, respuesta autorizada, moderación y derivación humana. Sin respuestas duplicadas (idempotencia)." />
      {note && <p className="text-xs text-muted-foreground mb-3">{note}</p>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm">Registrar interacción entrante</CardTitle>
          <CardDescription>Simula o reenvía una interacción real (los webhooks del ecosistema entran por aquí).</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            <Select value={newItem.network} onValueChange={(v) => setNewItem({ ...newItem, network: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {['instagram', 'facebook', 'tiktok', 'x', 'linkedin', 'youtube', 'threads', 'whatsapp'].map((n) => (
                  <SelectItem key={n} value={n}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="Autor" value={newItem.author} onChange={(e) => setNewItem({ ...newItem, author: e.target.value })} />
            <Textarea placeholder="Texto del comentario o mensaje" value={newItem.text} onChange={(e) => setNewItem({ ...newItem, text: e.target.value })} rows={3} />
            <Button onClick={add} size="sm" disabled={!brandId || !newItem.text}>Clasificar con el agente community manager</Button>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-2 max-h-[70vh] overflow-y-auto">
          {!brandId ? <EmptyBrand text="La bandeja se activa al crear una marca." /> : items.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Sin interacciones registradas.</CardContent></Card>
          ) : items.map((c) => (
            <Card key={c.id}>
              <CardContent className="pt-4 space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline">{c.network}</Badge>
                  <Badge>{c.classification}</Badge>
                  <Badge variant={RISK_VARIANT[c.risk]}>Riesgo {c.risk}</Badge>
                  <Badge variant={c.status === 'REPLIED' ? 'secondary' : c.status === 'ESCALATED' ? 'destructive' : 'outline'}>{STATUS_LABEL[c.status] ?? c.status}</Badge>
                  <span className="text-[10px] text-muted-foreground ml-auto">{c.author} · {new Date(c.createdAt).toLocaleString('es')}</span>
                </div>
                <p className="text-sm">{c.text}</p>
                {c.suggestedReply && (
                  <p className="text-xs text-muted-foreground border-l-2 pl-2">Respuesta autorizada de la memoria de marca: {c.suggestedReply}</p>
                )}
                {c.status !== 'REPLIED' && c.status !== 'MODERATED' && (
                  <div className="flex flex-wrap gap-1.5">
                    <Textarea
                      placeholder="Texto de respuesta (usa la FAQ autorizada si existe)"
                      rows={2}
                      className="text-xs"
                      value={replies[c.id] ?? c.suggestedReply}
                      onChange={(e) => setReplies({ ...replies, [c.id]: e.target.value })}
                    />
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="secondary" onClick={() => act(c.id, 'reply')}>Responder</Button>
                      <Button size="sm" variant="outline" onClick={() => act(c.id, 'escalate')}>Derivar a humano</Button>
                      <Button size="sm" variant="destructive" onClick={() => act(c.id, 'moderate')}>Moderar</Button>
                    </div>
                  </div>
                )}
                {c.replyText && <p className="text-xs border rounded-md p-2 bg-muted/40">Respuesta: {c.replyText}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Aprobaciones ─────────────────────────────────────────────────

interface ApprovalItem {
  id: string; targetType: string; targetId: string; summary: string; risk: string;
  status: string; requestedBy: string; decidedBy: string | null; reason: string; createdAt: string;
}

export function ApprovalsSection({ harness, brandId, refresh }: SectionProps) {
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [reason, setReason] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch('/api/approvals');
      const data = await res.json();
      if (!cancelled) setItems(data);
    })();
    return () => { cancelled = true; };
  }, [harness?.status]);

  const load = useCallback(async () => {
    const res = await fetch('/api/approvals');
    setItems(await res.json());
  }, []);

  const decide = async (id: string, decision: string) => {
    await fetch('/api/approvals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, decision, reason: reason[id] ?? '' }) });
    load(); refresh();
  };

  const pending = items.filter((a) => a.status === 'PENDING');
  const decided = items.filter((a) => a.status !== 'PENDING');

  return (
    <div>
      <SectionHeader title="Cola de aprobaciones" description="Publicar, responder y moderar requieren aprobación según el modo de autonomía. Toda decisión queda auditada." />
      <div className="space-y-2">
        {pending.length === 0 && <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">No hay aprobaciones pendientes.</CardContent></Card>}
        {pending.map((a) => (
          <Card key={a.id}>
            <CardContent className="pt-4 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge>{a.targetType}</Badge>
                <Badge variant="outline">Riesgo {a.risk}</Badge>
                <span className="text-[10px] text-muted-foreground ml-auto">solicitada por {a.requestedBy} · {new Date(a.createdAt).toLocaleString('es')}</span>
              </div>
              <p className="text-sm">{a.summary}</p>
              <Input placeholder="Motivo de la decisión (opcional)" value={reason[a.id] ?? ''} onChange={(e) => setReason({ ...reason, [a.id]: e.target.value })} className="text-xs" />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => decide(a.id, 'APPROVED')}>Aprobar</Button>
                <Button size="sm" variant="destructive" onClick={() => decide(a.id, 'REJECTED')}>Rechazar</Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {decided.map((a) => (
          <Card key={a.id} className="opacity-70">
            <CardContent className="pt-3 flex flex-wrap items-center gap-2 text-xs">
              <Badge variant={a.status === 'APPROVED' ? 'secondary' : 'destructive'}>{a.status}</Badge>
              <span className="flex-1 truncate">{a.summary}</span>
              <span className="text-[10px] text-muted-foreground">{a.decidedBy} · {a.reason}</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
