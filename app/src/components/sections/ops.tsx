'use client';

// Secciones: Agentes + Herramientas e integraciones + Automatizaciones

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SectionHeader } from '@/components/sections/dashboard';
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

export function AutomationsSection({ harness }: SectionProps) {
  const automations = [
    { name: 'Ciclo autónomo diario', trigger: 'Programación (cron del arnés)', detail: 'Encadena las 12 fases por marca respetando pausa, horarios y aprobaciones.', status: 'Manual por ahora' },
    { name: 'Clasificación de interacciones', trigger: 'Nueva interacción (bandeja o webhook)', detail: 'El community manager clasifica y decide responder/derivar según política y modo de autonomía.', status: 'Activa en el ciclo' },
    { name: 'Verificación de publicaciones', trigger: 'Tras publicar', detail: 'El publicador verifica el resultado y guarda evidencia; resultado incierto → reconciliación.', status: 'Activa en el ciclo' },
    { name: 'Malla del ecosistema', trigger: 'Webhook entrante (Chismoso/Leads/CRM)', detail: 'Los eventos del ecosistema se registran como interacciones con evidencia.', status: 'Requiere HARNESS_WEBHOOK_SECRET' },
    { name: 'Reintentos con backoff', trigger: 'Fallo de tarea', detail: 'Hasta maxAttempts con backoff exponencial; falla definitiva → registro de errores.', status: 'Activa' },
  ];
  return (
    <div>
      <SectionHeader title="Automatizaciones" description="La planificación inteligente vive en el orquestador; la automatización determinista en los jobs de la semilla. Separadas por diseño." />
      <div className="grid gap-3 md:grid-cols-2">
        {automations.map((a) => (
          <Card key={a.name}>
            <CardHeader className="pb-1">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm">{a.name}</CardTitle>
                <Badge variant={a.status === 'Activa' || a.status === 'Activa en el ciclo' ? 'secondary' : 'outline'}>{a.status}</Badge>
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
