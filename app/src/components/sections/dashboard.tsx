'use client';

// Resumen ejecutivo + utilidades compartidas de las secciones

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { SectionProps } from '@/app/page';

export const TASK_STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'outline', RUNNING: 'secondary', WAITING_APPROVAL: 'default',
  COMPLETED: 'secondary', FAILED: 'destructive', CANCELLED: 'outline', PAUSED: 'outline',
  PUBLISHED: 'secondary', SCHEDULED: 'outline', AWAITING_CONNECTOR: 'outline',
};
export const TOOL_STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  CONNECTED: 'default', AWAITING_CREDENTIALS: 'outline', UNAVAILABLE: 'destructive', DISABLED: 'outline',
};
export const TOOL_STATUS_LABEL: Record<string, string> = {
  CONNECTED: 'Conectado', AWAITING_CREDENTIALS: 'Pendiente de credenciales',
  UNAVAILABLE: 'No disponible', DISABLED: 'Desactivado',
};
export const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendiente', RUNNING: 'En ejecución', WAITING_APPROVAL: 'Esperando aprobación',
  COMPLETED: 'Completada', FAILED: 'Fallida', CANCELLED: 'Cancelada', PAUSED: 'En pausa',
  PUBLISHED: 'Publicada', SCHEDULED: 'Programada', PUBLISHING: 'Publicando',
  AWAITING_CONNECTOR: 'Pendiente de conector', UNVERIFIED: 'Sin verificar', VERIFIED: 'Verificada',
};

export function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function EmptyBrand({ text }: { text: string }) {
  return (
    <Alert>
      <AlertTitle>Sin marca activa</AlertTitle>
      <AlertDescription>{text} Ve a “Marcas y cuentas” para crear la primera.</AlertDescription>
    </Alert>
  );
}

export default function DashboardSection({ harness, brandId, refresh }: SectionProps) {
  const [cycle, setCycle] = useState<{ phases: { phase: string; status: string; summary: string }[]; stoppedAt?: string } | null>(null);
  const [running, setRunning] = useState(false);
  const brand = harness?.brands.find((b) => b.id === brandId);

  useEffect(() => {
    if (!brandId) return;
    fetch(`/api/orchestrator?brandId=${brandId}`)
      .then((r) => r.json())
      .then((tasks) => {
        if (Array.isArray(tasks) && tasks.length > 0) {
          const byPhase: Record<string, { phase: string; status: string; summary: string }> = {};
          for (const t of tasks.reverse()) {
            byPhase[t.phase] = { phase: t.phase, status: t.status, summary: t.errorDetail || '' };
          }
          setCycle({ phases: Object.values(byPhase) });
        }
      }).catch(() => {});
  }, [brandId, harness?.status]);

  const runCycle = async () => {
    if (!brandId || running) return;
    setRunning(true);
    try {
      const res = await fetch('/api/orchestrator', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId }),
      });
      const data = await res.json();
      setCycle(data);
      refresh();
    } finally {
      setRunning(false);
    }
  };

  const connected = harness?.tools.filter((t) => t.status === 'CONNECTED').length ?? 0;
  const total = harness?.tools.length ?? 0;
  const kpis = [
    { label: 'Publicaciones', value: brand?._count.publications ?? 0, note: 'registradas en la BD' },
    { label: 'Borradores', value: brand?._count.drafts ?? 0, note: 'en el centro de creación' },
    { label: 'Aprobaciones pendientes', value: harness?.alerts.pendingApprovals ?? 0, note: 'requieren decisión humana' },
    { label: 'Errores sin resolver', value: harness?.alerts.unresolvedErrors ?? 0, note: 'ver registro de errores' },
  ];

  return (
    <div>
      <SectionHeader
        title="Resumen ejecutivo"
        description="Estado del arnés, del ciclo autónomo y de las alertas del sistema."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 mb-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-1">
              <CardDescription>{k.label}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{k.value}</p>
              <p className="text-[11px] text-muted-foreground">{k.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ciclo autónomo</CardTitle>
            <CardDescription>Investigar → Analizar → Planificar → Crear → Validar → Aprobar → Publicar → Verificar → Interactuar → Medir → Aprender → Optimizar</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={runCycle}
                disabled={!brandId || running || harness?.paused}
                className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {running ? 'Ejecutando…' : 'Ejecutar ciclo completo'}
              </button>
              {cycle?.stoppedAt && (
                <Badge variant="outline">Detenido en: {cycle.stoppedAt}</Badge>
              )}
            </div>
            {cycle?.phases?.length ? (
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {cycle.phases.map((p, i) => (
                  <div key={`${p.phase}-${i}`} className="flex items-center gap-2 text-xs border rounded-md px-2 py-1.5">
                    <Badge variant={p.status === 'COMPLETED' ? 'secondary' : p.status === 'FAILED' ? 'destructive' : 'outline'}>{p.phase}</Badge>
                    <span className="text-muted-foreground">{STATUS_LABEL[p.status] ?? p.status}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sin ejecuciones todavía. El ciclo respeta la pausa global, la autonomía configurada y la idempotencia.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conectividad del ecosistema</CardTitle>
            <CardDescription>{connected} de {total} herramientas conectadas (honesto: sin credenciales no se simula)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {harness?.tools.map((t) => (
                <div key={t.key} className="flex items-center gap-2 text-xs border rounded-md px-2 py-1.5">
                  <span className="font-medium truncate flex-1">{t.provider}</span>
                  <Badge variant={TOOL_STATUS_VARIANT[t.status]}>{TOOL_STATUS_LABEL[t.status]}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
