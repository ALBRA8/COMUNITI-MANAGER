'use client';

// Sección: Ajustes e integraciones (P18) — centro unificado de configuración.
// Una sola vista para el estado real de IA, APIs, WhatsApp, Instagram,
// Facebook, worker y webhooks. Minimalista: texto sobrio, una tarjeta por
// integración, cero adornos. Honestidad radical: los estados se leen de las
// variables de entorno y la base de datos; nunca se simula una conexión.

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/sections/dashboard';
import type { SectionProps } from '@/app/page';
import { PlugZap, KeyRound, Radio, Database, Bot } from 'lucide-react';

interface IntegrationCard {
  key: string;
  provider: string;
  category: string;
  description: string;
  status: string;
  envKeys: string[];
  missingEnv: string[];
  contracts: string[];
  lastResult: string | null;
}

interface IntegrationsState {
  llm: { connected: boolean; provider: string; note: string };
  integrations: IntegrationCard[];
  counts: { total: number; connected: number; awaiting: number };
  socialAccounts: { network: string; handle: string; status: string }[];
  fbWorker: { registered: number; lastPingAt: string | null; names: string[] };
  webhooks: { secretConfigured: boolean; sources: string[] };
  system: { paused: boolean; autonomyMode: string; envKeysConfigured: string[] };
}

interface TestResult { outcome: string; reason?: string; httpStatus?: number }

const STATUS_LABEL: Record<string, string> = {
  CONNECTED: 'Conectada',
  AWAITING_CREDENTIALS: 'Pendiente de credenciales',
};

// Agrupación visual: el panel entero (módulos, campañas, publicaciones) consume
// estas capacidades; aquí se configuran y se comprueban. Los servicios de OTROS
// agentes del ecosistema van en un grupo aparte: este agente es independiente
// y publica sin ellos (mundo aparte, integración opcional vía malla firmada).
const GROUPS: { title: string; hint: string; keys: string[] }[] = [
  {
    title: 'Canales de publicación (Facebook, Telegram, WhatsApp, Instagram…)',
    hint: 'Las conexiones propias del agente para publicar y administrar cuentas. Un canal solo aparece Conectado con credenciales o sesión reales; la vista Canales resume su uso y pasos de activación.',
    keys: ['fbgroups.worker', 'telegram.bot', 'whatsapp.session', 'postgale.publish', 'postiz.publish', 'postlake.publish'],
  },
  {
    title: 'Investigación de mercado',
    hint: 'Datos públicos con evidencia verificable para alimentar el contenido y analizar competidores.',
    keys: ['scrapecreators.research'],
  },
  {
    title: 'Ecosistema (mundo aparte: otros agentes)',
    hint: 'Servicios de OTROS agentes — CRM, Chismoso, Leads, KREA, YT-Automation, NEX-SCOPE, WhatsPower y la semilla ALBRA Seed. Este agente es independiente: los consume solo si los activas, vía malla firmada; nada de esto hace falta para publicar.',
    keys: ['albra.seed', 'whatspower.broadcast', 'crm.conversation', 'chismoso.listening', 'krea.creativity', 'ytauto.video', 'nexscope.research'],
  },
];

export function SettingsSection({ refresh, onNavigate }: SectionProps & { onNavigate?: (id: string) => void }) {
  const [state, setState] = useState<IntegrationsState | null>(null);
  const [tests, setTests] = useState<Record<string, TestResult | 'cargando'>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations', { cache: 'no-store' });
      if (res.ok) setState(await res.json());
    } catch { /* se recupera en el siguiente refresh */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/integrations', { cache: 'no-store' });
        const data: IntegrationsState | undefined = res.ok ? await res.json() : undefined;
        if (!cancelled && data) setState(data);
      } catch { /* se recupera con el botón Probar o al recargar */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const runTest = async (key: string) => {
    setTests((p) => ({ ...p, [key]: 'cargando' }));
    try {
      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test', tool: key }),
      });
      const data: TestResult = await res.json();
      setTests((p) => ({ ...p, [key]: data }));
    } catch {
      setTests((p) => ({ ...p, [key]: { outcome: 'ERROR', reason: 'Fallo de red al probar' } }));
    }
    refresh();
  };

  if (!state) {
    return (
      <div>
        <SectionHeader title="Ajustes e integraciones" description="Cargando estado real…" />
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  const byKey = new Map(state.integrations.map((i) => [i.key, i]));
  const accountsByNetwork = new Map<string, { total: number; connected: number }>();
  for (const a of state.socialAccounts) {
    const cur = accountsByNetwork.get(a.network) ?? { total: 0, connected: 0 };
    cur.total += 1;
    if (a.status === 'CONNECTED') cur.connected += 1;
    accountsByNetwork.set(a.network, cur);
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Ajustes e integraciones"
        description="Un solo lugar para configurar y comprobar IA, APIs y redes. Los estados son reales: nada aparece conectado sin credenciales."
      />

      {/* Resumen superior: LLM + conteo + sistema */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="py-4">
          <CardContent className="px-4 space-y-1">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">Inteligencia (IA)</p>
              <Badge variant="default" className="ml-auto text-[10px]">Activa</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{state.llm.provider}</p>
            <p className="text-[11px] text-muted-foreground">{state.llm.note}</p>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="px-4 space-y-1">
            <div className="flex items-center gap-2">
              <PlugZap className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">Integraciones</p>
            </div>
            <p className="text-2xl font-semibold leading-none">{state.counts.connected}<span className="text-sm text-muted-foreground"> / {state.counts.total}</span></p>
            <p className="text-[11px] text-muted-foreground">{state.counts.awaiting} pendientes de credenciales</p>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="px-4 space-y-1">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">Webhooks entrantes</p>
              <Badge variant={state.webhooks.secretConfigured ? 'default' : 'outline'} className="ml-auto text-[10px]">
                {state.webhooks.secretConfigured ? 'Firmados' : 'Solo loopback'}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">Fuentes: {state.webhooks.sources.join(', ')}</p>
            <p className="text-[11px] text-muted-foreground">Secreto: HARNESS_WEBHOOK_SECRET {state.webhooks.secretConfigured ? 'configurado' : 'no configurado'}</p>
          </CardContent>
        </Card>
        <Card className="py-4">
          <CardContent className="px-4 space-y-1">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">Sistema</p>
              <Badge variant={state.system.paused ? 'destructive' : 'outline'} className="ml-auto text-[10px]">
                {state.system.paused ? 'En pausa' : 'Operativo'}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">Autonomía: {state.system.autonomyMode}</p>
            <p className="text-[11px] text-muted-foreground">Variables activas: {state.system.envKeysConfigured.join(', ') || '—'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Cuentas sociales objetivo */}
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-sm">Cuentas sociales objetivo</CardTitle>
          <CardDescription>Cuentas por red asociadas a tus marcas. Se crean y conectan desde Marcas y cuentas; aquí está su estado global.</CardDescription>
        </CardHeader>
        <CardContent className="text-xs flex flex-wrap gap-2">
          {accountsByNetwork.size === 0 && (
            <p className="text-muted-foreground">
              Aún no hay cuentas objetivo.{' '}
              <button className="underline underline-offset-2 hover:text-foreground" onClick={() => onNavigate?.('brands')}>
                Crear la primera en Marcas y cuentas
              </button>
            </p>
          )}
          {[...accountsByNetwork.entries()].map(([network, c]) => (
            <Badge key={network} variant="outline" className="text-[11px] py-1">
              {network}: {c.connected}/{c.total} conectadas
            </Badge>
          ))}
        </CardContent>
      </Card>

      {/* Grupos de integraciones */}
      {GROUPS.map((g) => (
        <div key={g.title}>
          <p className="text-xs font-medium text-muted-foreground mb-1">{g.title}</p>
          <p className="text-[11px] text-muted-foreground mb-2">{g.hint}</p>
          <div className="grid gap-3 md:grid-cols-2">
            {g.keys.map((k) => {
              const i = byKey.get(k);
              if (!i) return null;
              const t = tests[k];
              return (
                <Card key={k}>
                  <CardHeader className="pb-1">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm">{i.provider}</CardTitle>
                      <Badge variant={i.status === 'CONNECTED' ? 'default' : 'outline'} className="text-[10px] shrink-0">
                        {STATUS_LABEL[i.status] ?? i.status}
                      </Badge>
                    </div>
                    <CardDescription className="line-clamp-2">{i.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="text-xs space-y-2">
                    {i.envKeys.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-muted-foreground">Variables:</span>
                        {i.envKeys.map((e) => (
                          <code key={e} className={`rounded px-1 py-0.5 text-[10px] border ${i.missingEnv.includes(e) ? 'border-destructive/40 text-destructive' : 'border-border text-foreground'}`}>
                            {e}{i.missingEnv.includes(e) ? ' (falta)' : ''}
                          </code>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => runTest(k)} disabled={t === 'cargando'}>
                        <Radio className="h-3 w-3 mr-1" /> Probar
                      </Button>
                      <span className="text-[11px] text-muted-foreground">
                        {i.contracts.length} contrato(s){i.lastResult ? ` · último: ${i.lastResult}` : ''}
                      </span>
                    </div>
                    {t && t !== 'cargando' && (
                      <p className={`text-[11px] ${t.outcome === 'OK' || t.outcome === 'REACHABLE' ? 'text-muted-foreground' : 'text-destructive'}`}>
                        Prueba: {t.outcome} — {t.reason}{typeof t.httpStatus === 'number' ? ` (HTTP ${t.httpStatus})` : ''}
                      </p>
                    )}
                    {k === 'fbgroups.worker' && state.fbWorker.registered === 0 && (
                      <button className="text-[11px] underline underline-offset-2 text-muted-foreground hover:text-foreground" onClick={() => onNavigate?.('fbgroups')}>
                        Registrar un worker en Grupos de Facebook
                      </button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      {/* Seguridad de las claves */}
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-sm">¿Dónde se configuran las claves?</CardTitle>
          <CardDescription>Protección de datos: las credenciales no se guardan en la base de datos del panel.</CardDescription>
        </CardHeader>
        <CardContent className="text-xs space-y-1 text-muted-foreground">
          <p>Cada variable se define en el entorno del servidor (<code className="text-[10px]">.env</code>) y el panel la detecta al reiniciar. Ejemplo: <code className="text-[10px]">POSTGALE_URL=https://…</code> y <code className="text-[10px]">POSTGALE_API_KEY=…</code> activan Postgale.</p>
          <p>Cada red se conecta de forma propia: worker de Chrome para grupos de Facebook, Bot API oficial para Telegram, sesión QR propia para WhatsApp y vías API (Postgale/Postiz) para Instagram/Facebook. La automatización de navegador contra redes está bloqueada por la política §5.1; la sesión de WhatsApp es protocolo WhatsApp Web sin navegador, con el riesgo declarado en la tarjeta del canal.</p>
        </CardContent>
      </Card>
    </div>
  );
}
