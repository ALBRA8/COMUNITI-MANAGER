'use client';

// Secciones: Investigación de mercado + Competidores + Analítica

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SectionHeader, EmptyBrand } from '@/components/sections/dashboard';
import type { SectionProps } from '@/app/page';

interface Evidence { id: string; source: string; url: string; claim: string; payloadJson: string; capturedAt: string }

// ─── Investigación ────────────────────────────────────────────────

export function ResearchSection({ harness, brandId, refresh }: SectionProps) {
  const [topic, setTopic] = useState('');
  const [result, setResult] = useState<{ outcome: string; reason?: string; data?: unknown; dataState?: string } | null>(null);
  const [evidences, setEvidences] = useState<Evidence[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!brandId) return;
    const res = await fetch(`/api/research?brandId=${brandId}`);
    setEvidences(await res.json());
  }, [brandId]);

  useEffect(() => { load(); }, [load, harness?.status]);

  const run = async () => {
    if (!topic || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/research', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brandId, topic }) });
      setResult(await res.json());
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <SectionHeader title="Investigación de mercado" description="Evidencias con fuente y fecha. Sin herramienta conectada se declara “sin evidencia”; nunca se inventan datos." />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Card>
            <CardHeader><CardTitle className="text-sm">Nueva investigación</CardTitle>
            <CardDescription>Fuentes: ScrapeCreators (API social), AGENTE-CHISMOSO (escucha) o NEX-SCOPE (YouTube), según credenciales.</CardDescription></CardHeader>
            <CardContent className="space-y-2">
              <Input placeholder="Tema a investigar" value={topic} onChange={(e) => setTopic(e.target.value)} />
              <Button onClick={run} size="sm" disabled={!brandId || !topic || busy}>{busy ? 'Investigando…' : 'Investigar'}</Button>
            </CardContent>
          </Card>
          {result && (
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-sm">Resultado</CardTitle></CardHeader>
              <CardContent className="text-xs space-y-1.5">
                <Badge variant={result.outcome === 'OK' ? 'secondary' : 'outline'}>
                  {result.dataState === 'VERIFICADO' ? 'Verificado' : result.dataState === 'PENDIENTE_CREDENCIALES' ? 'Pendiente de credenciales' : 'Error'}
                </Badge>
                {result.reason && <p className="text-muted-foreground">{result.reason}</p>}
                {result.data && <pre className="bg-muted rounded-md p-2 overflow-x-auto max-h-48 text-[10px]">{JSON.stringify(result.data, null, 2)}</pre>}
              </CardContent>
            </Card>
          )}
        </div>
        <Card>
          <CardHeader><CardTitle className="text-sm">Evidencias registradas ({evidences.length})</CardTitle>
          <CardDescription>Cada evidencia guarda fuente, fecha y payload para auditoría.</CardDescription></CardHeader>
          <CardContent className="space-y-2 max-h-96 overflow-y-auto">
            {!brandId ? <EmptyBrand text="La investigación se asocia a una marca." /> : evidences.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin evidencias todavía.</p>
            ) : evidences.map((e) => (
              <div key={e.id} className="border rounded-md p-2.5 text-xs">
                <div className="flex items-center gap-1.5 mb-1">
                  <Badge variant="outline" className="text-[10px]">{e.source}</Badge>
                  <span className="text-[10px] text-muted-foreground">{new Date(e.capturedAt).toLocaleString('es')}</span>
                </div>
                <p>{e.claim}</p>
                {e.url && <p className="text-[10px] text-muted-foreground break-all">{e.url}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Competidores ─────────────────────────────────────────────────

export function CompetitorsSection({ harness, brandId, refresh }: SectionProps) {
  const [handle, setHandle] = useState('');
  const [network, setNetwork] = useState('instagram');
  const [result, setResult] = useState<{ outcome: string; reason?: string; data?: unknown; dataState?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!handle || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/research', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brandId, competitorHandle: handle, network }) });
      setResult(await res.json());
      refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <SectionHeader title="Análisis de competidores" description="Datos públicos de perfiles y publicaciones con evidencia verificable (ScrapeCreators) o investigación web (CHISMOSO)." />
      <Card className="mb-3">
        <CardContent className="pt-4 flex flex-wrap gap-2 items-end">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Red</p>
            <select className="text-xs bg-background border border-border rounded-md px-2 py-1.5" value={network} onChange={(e) => setNetwork(e.target.value)} aria-label="Red del competidor">
              {['instagram', 'tiktok', 'youtube', 'x'].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="space-y-1 flex-1 min-w-48">
            <p className="text-xs text-muted-foreground">Perfil del competidor</p>
            <Input placeholder="p. ej. marca.rival" value={handle} onChange={(e) => setHandle(e.target.value)} />
          </div>
          <Button onClick={run} size="sm" disabled={!brandId || !handle || busy}>{busy ? 'Analizando…' : 'Analizar'}</Button>
        </CardContent>
      </Card>
      {result && (
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm">Informe</CardTitle></CardHeader>
          <CardContent className="text-xs space-y-1.5">
            <Badge variant={result.outcome === 'OK' ? 'secondary' : 'outline'}>
              {result.dataState === 'VERIFICADO' ? 'Verificado' : result.dataState === 'PENDIENTE_CREDENCIALES' ? 'Pendiente de credenciales' : 'Error'}
            </Badge>
            {result.reason && <p className="text-muted-foreground">{result.reason}</p>}
            {result.data && <pre className="bg-muted rounded-md p-2 overflow-x-auto max-h-64 text-[10px]">{JSON.stringify(result.data, null, 2)}</pre>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Analítica ────────────────────────────────────────────────────

interface Report { generatedAt: string; dataState: string; providerReason?: string; publications: { total: number; published: number; awaitingConnector: number; failed: number }; community: { classification: string; _count: { _all: number } }[]; experiments: number; recommendations: string[] }

export function AnalyticsSection({ harness, brandId, refresh }: SectionProps) {
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    if (!brandId || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/analytics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brandId }) });
      const data = await res.json();
      setReport(data.report);
      refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <SectionHeader title="Analítica" description="Informes que distinguen datos verificados de estimaciones y justifican cada recomendación." />
      <div className="flex items-center gap-2 mb-3">
        <Button onClick={generate} size="sm" disabled={!brandId || busy}>{busy ? 'Generando…' : 'Generar informe de rendimiento'}</Button>
      </div>
      {!report ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Sin informes todavía. Genera el primero cuando tengas publicaciones o interacciones registradas.</CardContent></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm">Datos</CardTitle>
              <CardDescription>{new Date(report.generatedAt).toLocaleString('es')} · {report.dataState === 'VERIFICADO' ? 'con métricas del proveedor' : 'pendiente de conector de métricas'}</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 text-sm">
              <div className="border rounded-md p-2"><p className="text-muted-foreground text-xs">Publicaciones</p><p className="text-xl font-semibold">{report.publications.total}</p><p className="text-[10px] text-muted-foreground">{report.publications.published} publicadas · {report.publications.awaitingConnector} pendientes de conector</p></div>
              <div className="border rounded-md p-2"><p className="text-muted-foreground text-xs">Experimentos</p><p className="text-xl font-semibold">{report.experiments}</p><p className="text-[10px] text-muted-foreground">registrados</p></div>
              {report.providerReason && <p className="col-span-2 text-[11px] text-muted-foreground">{report.providerReason}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-sm">Recomendaciones justificadas</CardTitle></CardHeader>
            <CardContent>
              <ul className="text-xs space-y-1.5 list-disc pl-4">
                {report.recommendations.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
