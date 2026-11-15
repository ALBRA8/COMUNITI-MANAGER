'use client';

// Canales (P19-LIMPIEZA): la vista de las redes donde el agente publica.
// Canal primero, herramienta después. Un canal solo aparece Conectado con
// credenciales reales (variables de entorno o worker registrado); nunca se
// simula. El motor Meta-Policy ya vigila los límites oficiales de cada red.

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { SectionProps } from '@/app/page';
import { SectionHeader } from '@/components/sections/dashboard';

interface IntegrationCard {
  key: string;
  provider: string;
  status: string;
  envKeys: string[];
  missingEnv: string[];
}

interface IntegrationsState {
  integrations: IntegrationCard[];
  socialAccounts: { network: string; handle: string; status: string }[];
  fbWorker: { registered: number; lastPingAt: string | null; names: string[] };
}

interface TestResult {
  outcome: string;
  reason?: string;
  httpStatus?: number;
}

interface CanalDef {
  id: string;
  nombre: string;
  redes: string[]; // redes de marca que alimentan este canal
  herramientas: string[];
  via: string;
  uso: string;
  nota?: string;
  accion?: { label: string; nav: string };
  pasos?: string[];
  qr?: boolean; // la tarjeta muestra el QR vivo de la sesión propia
}

const CANALES: CanalDef[] = [
  {
    id: 'telegram',
    nombre: 'Telegram (canales y grupos)',
    redes: ['telegram'],
    herramientas: ['telegram.bot'],
    via: 'Bot API oficial. Creas el bot con @BotFather, pegas el token en Ajustes y añades el bot como administrador del canal.',
    uso: 'Publicación directa en canales y grupos propios. Límites oficiales ya verificados en el motor: 20 msg/min por grupo, 1 msg/s por chat y backoff honesto ante 429.',
    nota: 'Hoy: configuración, prueba real (getMe) y cuentas por marca. El despacho programado se activa con el ejecutor del canal.',
    pasos: [
      'Habla con @BotFather en Telegram y crea tu bot (/newbot).',
      'Pega el token en TELEGRAM_BOT_TOKEN (Ajustes e integraciones) y reinicia el server.',
      'Pulsa Probar aquí: la Bot API debe responder con el @usuario del bot.',
      'Añade el bot como administrador de tu canal o grupo.',
    ],
  },
  {
    id: 'whatsapp',
    nombre: 'WhatsApp (sesión propia del agente)',
    redes: [],
    herramientas: ['whatsapp.session'],
    via: 'Conector propio del agente: sesión de WhatsApp vinculada por QR (protocolo WhatsApp Web, sin navegador). El conector corre en tu PC o VPS y reporta el estado al panel.',
    uso: 'El canal de difusión y avisos del agente con su propia sesión. El motor aplica pausa global y techos de volumen a todo envío.',
    nota: 'Protocolo no oficial: WhatsApp puede restringir el número ante reportes o volumen abusivo. Sin navegador (la política §5.1 no aplica); el riesgo se declara y se mitiga con techos y aprobaciones. El despacho programado se activa con el ejecutor del canal.',
    qr: true,
    pasos: [
      'Arranca el conector donde corre el panel: node scripts/whatsapp-daemon.cjs',
      'El QR aparece aquí abajo: en tu móvil, WhatsApp → Dispositivos vinculados → Vincular dispositivo.',
      'Al vincular, la tarjeta pasa a Conectado; la sesión queda guardada y no se re-escanea al reiniciar.',
      'Para desvincular: detén el conector y borra prisma/db/whatsapp-session (o POST /logout en el puerto del conector).',
    ],
  },
  {
    id: 'fbgroups',
    nombre: 'Grupos de Facebook',
    redes: ['facebook'],
    herramientas: ['fbgroups.worker'],
    via: 'Worker propio: Chrome real con tu sesión (PC o VPS). Única vía viable desde que Meta eliminó la API de Grupos (22/04/2024).',
    uso: 'Campañas HITL en grupos: variantes por grupo con spintax, warmup, primer comentario y pausa defensiva.',
    nota: 'Riesgo de restricción declarado en la FICHA del módulo; techo por warmup (5/10/20 según antigüedad) aplicado por el motor.',
    accion: { label: 'Ir al módulo de Facebook', nav: 'fbgroups' },
  },
  {
    id: 'igfb',
    nombre: 'Instagram y Facebook (vías API)',
    redes: ['instagram', 'facebook'],
    herramientas: ['postgale.publish', 'postiz.publish'],
    via: 'Vía API multi-red: Postgale (SaaS) o Postiz self-host (AGPL-3.0). Instagram exige cuenta profesional vinculada en la vía.',
    uso: 'Publicación y programación en Instagram, Facebook (Páginas), Threads, TikTok y más desde una sola cuenta de la vía.',
    nota: 'Sin la vía conectada, el ciclo crea y valida contenido pero no lo publica por API.',
  },
];

const ESTADO: Record<string, { label: string; variante: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  CONNECTED: { label: 'Conectado', variante: 'default' },
  REACHABLE: { label: 'Alcanzable', variante: 'secondary' },
  AWAITING_CREDENTIALS: { label: 'Pendiente de credenciales', variante: 'outline' },
  ERROR: { label: 'Error', variante: 'destructive' },
};

interface WaSessionState {
  hasSession: boolean;
  state: string;
  qrDataUrl: string;
  user: string;
  phone: string;
  lastSeenAt: string | null;
  stale: boolean;
  note: string;
}

const WA_STATE_LABEL: Record<string, string> = {
  DISCONNECTED: 'Sin sesión — arranca el conector',
  CONNECTING: 'Conectando con WhatsApp…',
  QR_WAITING: 'QR listo — escanéalo con tu móvil',
  CONNECTED: 'Sesión vinculada',
};

// QR en vivo de la sesión de WhatsApp propia: consulta /api/whatsapp/session
// mientras la tarjeta está abierta. Nada se simula: si el conector está caído,
// el bloque lo dice con el último reporte y el aviso de frescura.
function WhatsappQrBlock() {
  const [wa, setWa] = useState<WaSessionState | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/whatsapp/session', { cache: 'no-store' });
        if (res.ok && !cancelled) setWa(await res.json());
      } catch { /* se recupera en el siguiente tick */ }
    };
    load();
    const t = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  if (!wa || !wa.hasSession) return null; // sin sesión jamás creada: la tarjeta no añade ruido
  const conectado = wa.state === 'CONNECTED' && !wa.stale;
  return (
    <div className="rounded-md border bg-background/50 p-3 grid gap-2 sm:grid-cols-[auto_1fr] items-start">
      {wa.qrDataUrl ? (
        <img src={wa.qrDataUrl} alt="QR de WhatsApp para vincular la sesión del agente" className="h-44 w-44 rounded-md border bg-white p-1" />
      ) : (
        <div className="flex h-44 w-44 items-center justify-center rounded-md border border-dashed text-[11px] text-muted-foreground text-center px-3">
          {conectado ? 'Sesión activa' : 'Sin QR ahora mismo'}
        </div>
      )}
      <div className="text-xs space-y-1">
        <p className="font-medium">Estado del conector: {WA_STATE_LABEL[wa.state] ?? wa.state}{wa.stale && wa.state !== 'DISCONNECTED' ? ' (sin reportes recientes: ¿conector caído?)' : ''}</p>
        {conectado && <p>Vinculado a: <b>{wa.user || wa.phone || 'WhatsApp'}</b>{wa.phone ? ` · ${wa.phone}` : ''}</p>}
        {wa.lastSeenAt && <p className="text-muted-foreground">Último reporte: {new Date(wa.lastSeenAt).toLocaleString('es-CO')}</p>}
        <p className="text-[11px] text-muted-foreground">{wa.note}</p>
      </div>
    </div>
  );
}

export function ChannelsSection({ refresh, onNavigate }: SectionProps & { onNavigate?: (id: string) => void }) {
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
      } catch { /* se recupera con Probar o al recargar */ }
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
        <SectionHeader title="Canales" description="Cargando estado real de los canales…" />
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  const byKey = new Map(state.integrations.map((i) => [i.key, i]));
  const cuentasPorRed = new Map<string, number>();
  for (const a of state.socialAccounts) {
    cuentasPorRed.set(a.network, (cuentasPorRed.get(a.network) ?? 0) + 1);
  }

  return (
    <div className="grid gap-4">
      <SectionHeader
        title="Canales"
        description="Las redes donde el agente publica. Un canal solo aparece Conectado con credenciales reales; nunca se simula."
      />

      {CANALES.map((c) => {
        const tarjetas = c.herramientas.map((k) => byKey.get(k)).filter(Boolean) as IntegrationCard[];
        const conectado = tarjetas.some((t) => t.status === 'CONNECTED');
        const estado = conectado ? ESTADO.CONNECTED : ESTADO.AWAITING_CREDENTIALS;
        const cuentas = c.redes.reduce((n, r) => n + (cuentasPorRed.get(r) ?? 0), 0);
        return (
          <div key={c.id} className="rounded-lg border bg-card p-4 grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">{c.nombre}</h3>
              <Badge variant={estado.variante}>{estado.label}</Badge>
              {c.id === 'fbgroups' && state.fbWorker.registered > 0 && (
                <Badge variant="secondary">{state.fbWorker.registered} worker(es) · último ping {state.fbWorker.lastPingAt ? new Date(state.fbWorker.lastPingAt).toLocaleString('es-CO') : '—'}</Badge>
              )}
              {c.redes.length > 0 && (
                <Badge variant="outline" className="ml-auto">{cuentas} cuenta(s) en marcas</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{c.via}</p>
            <p className="text-xs">{c.uso}</p>
            {c.nota && <p className="text-[11px] text-muted-foreground border-l-2 border-border pl-2">{c.nota}</p>}
            {c.pasos && (
              <ol className="text-[11px] text-muted-foreground list-decimal list-inside grid gap-0.5">
                {c.pasos.map((paso, i) => <li key={i}>{paso}</li>)}
              </ol>
            )}
            {c.qr && <WhatsappQrBlock />}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {tarjetas.map((t) => {
                const r = tests[t.key];
                return (
                  <div key={t.key} className="flex flex-wrap items-center gap-2">
                    {t.missingEnv.length > 0 && (
                      <span className="text-[11px] font-mono bg-muted rounded px-1.5 py-0.5">Falta: {t.missingEnv.join(', ')}</span>
                    )}
                    <Button size="sm" variant="outline" disabled={r === 'cargando'} onClick={() => runTest(t.key)}>
                      {r === 'cargando' ? 'Probando…' : 'Probar'}
                    </Button>
                    {r && r !== 'cargando' && (
                      <span className={
                        'text-[11px] ' + (r.outcome === 'OK' ? 'text-emerald-500' : r.outcome === 'ERROR' ? 'text-destructive' : 'text-muted-foreground')
                      }>
                        {r.outcome}{r.httpStatus ? ` (HTTP ${r.httpStatus})` : ''}: {r.reason}
                      </span>
                    )}
                  </div>
                );
              })}
              {c.accion && (
                <Button size="sm" variant="ghost" onClick={() => onNavigate?.(c.accion!.nav)}>{c.accion.label}</Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
