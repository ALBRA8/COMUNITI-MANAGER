'use client';

// Social Autopilot AI — Arnés de community management (panel en español)

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Users, CalendarDays, Inbox, BadgeCheck, PenTool,
  Image as ImageIcon, Search, BarChart3, LineChart, Bot, Wrench,
  Workflow, BookMarked, History, AlertTriangle, Wallet, ShieldCheck,
  Pause, Play, Radar, UsersRound,
} from 'lucide-react';

import DashboardSection from '@/components/sections/dashboard';
import { BrandsSection, CalendarSection } from '@/components/sections/brands-calendar';
import { CommunitySection, ApprovalsSection } from '@/components/sections/inbox-approvals';
import { CreationSection, MediaSection } from '@/components/sections/creation';
import { ResearchSection, CompetitorsSection, AnalyticsSection } from '@/components/sections/research-analytics';
import { AgentsSection, ToolsSection, AutomationsSection } from '@/components/sections/ops';
import { MemorySection, HistorySection, ErrorsSection, CostsSection, SecuritySection } from '@/components/sections/memory-history';
import { FbGroupsSection } from '@/components/sections/fb-groups';

export interface HarnessState {
  status: string;
  autonomyMode: string;
  paused: boolean;
  tools: { key: string; provider: string; category: string; description: string; contracts: string[]; status: string; capabilities: string[]; rateLimit: string; costNote: string; lastResult: string }[];
  agents: { key: string; name: string; role: string; limits: string; allowedContracts: string[] }[];
  brands: { id: string; name: string; identity: string; tone: string; maxPostsPerDay: number; allowedHours: string; accounts: { id: string; network: string; handle: string; status: string }[]; _count: { publications: number; drafts: number } }[];
  alerts: { unresolvedErrors: number; pendingApprovals: number };
}

export interface SectionProps {
  harness: HarnessState | null;
  brandId: string;
  refresh: () => void;
}

const NAV = [
  { id: 'dashboard', label: 'Resumen ejecutivo', icon: LayoutDashboard, group: 'Vista general' },
  { id: 'brands', label: 'Marcas y cuentas', icon: Users, group: 'Vista general' },
  { id: 'calendar', label: 'Calendario editorial', icon: CalendarDays, group: 'Vista general' },
  { id: 'inbox', label: 'Comentarios y mensajes', icon: Inbox, group: 'Comunidad' },
  { id: 'approvals', label: 'Cola de aprobaciones', icon: BadgeCheck, group: 'Comunidad' },
  { id: 'creation', label: 'Centro de creación', icon: PenTool, group: 'Contenido' },
  { id: 'media', label: 'Biblioteca multimedia', icon: ImageIcon, group: 'Contenido' },
  { id: 'research', label: 'Investigación de mercado', icon: Search, group: 'Inteligencia' },
  { id: 'competitors', label: 'Análisis de competidores', icon: Radar, group: 'Inteligencia' },
  { id: 'analytics', label: 'Analítica', icon: BarChart3, group: 'Inteligencia' },
  { id: 'agents', label: 'Agentes', icon: Bot, group: 'Operación' },
  { id: 'tools', label: 'Herramientas e integraciones', icon: Wrench, group: 'Operación' },
  { id: 'automations', label: 'Automatizaciones', icon: Workflow, group: 'Operación' },
  { id: 'fbgroups', label: 'Grupos de Facebook', icon: UsersRound, group: 'Operación' },
  { id: 'memory', label: 'Memoria de marca', icon: BookMarked, group: 'Gobierno' },
  { id: 'history', label: 'Historial de ejecución', icon: History, group: 'Gobierno' },
  { id: 'errors', label: 'Registro de errores', icon: AlertTriangle, group: 'Gobierno' },
  { id: 'costs', label: 'Costes y límites', icon: Wallet, group: 'Gobierno' },
  { id: 'security', label: 'Configuración de seguridad', icon: ShieldCheck, group: 'Gobierno' },
];

const MODE_LABELS: Record<string, string> = {
  L1_ASSISTED: 'Asistido',
  L2_SUPERVISED: 'Supervisado',
  L3_AUTONOMOUS_LIMITED: 'Autónomo con límites',
};

export default function Page() {
  const [harness, setHarness] = useState<HarnessState | null>(null);
  const [active, setActive] = useState('dashboard');
  const [brandId, setBrandId] = useState('');
  const [navOpen, setNavOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/harness', { cache: 'no-store' });
      const data: HarnessState = await res.json();
      setHarness(data);
      setBrandId((prev) => prev || data.brands[0]?.id || '');
    } catch {
      // el panel se recupera en el siguiente refresh
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  const togglePause = async () => {
    await fetch('/api/harness', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: harness?.paused ? 'resume' : 'pause' }),
    });
    refresh();
  };

  const grouped = useMemo(() => {
    const groups: Record<string, typeof NAV> = {};
    for (const item of NAV) {
      (groups[item.group] ??= []).push(item);
    }
    return groups;
  }, []);

  const activeBrand = harness?.brands.find((b) => b.id === brandId);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Barra superior */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex h-14 items-center gap-3 px-4">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setNavOpen(!navOpen)} aria-label="Abrir navegación">
            <LayoutDashboard className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-xs">SA</div>
            <div className="leading-tight">
              <p className="text-sm font-semibold">Social Autopilot AI</p>
              <p className="text-[11px] text-muted-foreground hidden sm:block">Arnés para el ecosistema de agentes ALBRA</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant={harness?.paused ? 'destructive' : 'secondary'} className="hidden sm:inline-flex">
              {harness?.paused ? 'En pausa' : 'Operativo'}
            </Badge>
            <Badge variant="outline" className="hidden md:inline-flex">
              Autonomía: {MODE_LABELS[harness?.autonomyMode ?? ''] ?? harness?.autonomyMode ?? '—'}
            </Badge>
            <Button size="sm" variant={harness?.paused ? 'default' : 'outline'} onClick={togglePause}>
              {harness?.paused ? <Play className="h-4 w-4 mr-1" /> : <Pause className="h-4 w-4 mr-1" />}
              {harness?.paused ? 'Reanudar' : 'Pausa global'}
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Navegación */}
        <aside className={cn(
          'w-60 shrink-0 border-r border-border/60 bg-card/40',
          'hidden md:block'
        )}>
          <ScrollArea className="h-[calc(100vh-3.5rem)]">
            <nav className="p-3 space-y-4" aria-label="Secciones del arnés">
              {Object.entries(grouped).map(([group, items]) => (
                <div key={group}>
                  <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group}</p>
                  <div className="space-y-0.5">
                    {items.map((item) => {
                      const Icon = item.icon;
                      const badge =
                        item.id === 'approvals' ? harness?.alerts.pendingApprovals :
                        item.id === 'errors' ? harness?.alerts.unresolvedErrors : 0;
                      return (
                        <button
                          key={item.id}
                          onClick={() => { setActive(item.id); setNavOpen(false); }}
                          className={cn(
                            'w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors text-left',
                            active === item.id
                              ? 'bg-primary/10 text-primary font-medium'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{item.label}</span>
                          {!!badge && badge > 0 && (
                            <Badge variant="destructive" className="ml-auto h-4 px-1 text-[10px]">{badge}</Badge>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </ScrollArea>
        </aside>

        {/* Navegación móvil */}
        {navOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setNavOpen(false)} />
            <div className="absolute left-0 top-0 h-full w-64 bg-background border-r border-border p-3 overflow-y-auto">
              {Object.entries(grouped).map(([group, items]) => (
                <div key={group} className="mb-4">
                  <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group}</p>
                  {items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => { setActive(item.id); setNavOpen(false); }}
                      className={cn('w-full flex items-center gap-2 rounded-md px-2 py-2 text-sm text-left', active === item.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground')}
                    >
                      <item.icon className="h-4 w-4" /> {item.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Contenido */}
        <main className="flex-1 min-w-0">
          <div className="border-b border-border/60 bg-card/30 px-4 py-2.5 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Marca activa:</span>
            <select
              className="text-xs bg-background border border-border rounded-md px-2 py-1"
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              aria-label="Seleccionar marca activa"
            >
              {harness?.brands.length ? (
                harness.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)
              ) : (
                <option value="">Sin marcas — crea la primera</option>
              )}
            </select>
            {activeBrand && (
              <>
                <Separator orientation="vertical" className="h-4 hidden sm:block" />
                <span className="text-[11px] text-muted-foreground hidden sm:inline">
                  {activeBrand.accounts.length} cuenta(s) · {activeBrand._count.publications} publicaciones · {activeBrand._count.drafts} borradores
                </span>
              </>
            )}
          </div>

          <div className="p-4 md:p-6">
            {!harness ? (
              <div className="grid gap-3">
                <div className="h-8 w-48 animate-pulse rounded bg-muted" />
                <div className="h-40 animate-pulse rounded-lg bg-muted" />
              </div>
            ) : active === 'dashboard' ? <DashboardSection harness={harness} brandId={brandId} refresh={refresh} />
            : active === 'brands' ? <BrandsSection harness={harness} brandId={brandId} refresh={refresh} />
            : active === 'calendar' ? <CalendarSection harness={harness} brandId={brandId} refresh={refresh} />
            : active === 'inbox' ? <CommunitySection harness={harness} brandId={brandId} refresh={refresh} />
            : active === 'approvals' ? <ApprovalsSection harness={harness} brandId={brandId} refresh={refresh} />
            : active === 'creation' ? <CreationSection harness={harness} brandId={brandId} refresh={refresh} />
            : active === 'media' ? <MediaSection harness={harness} brandId={brandId} refresh={refresh} />
            : active === 'research' ? <ResearchSection harness={harness} brandId={brandId} refresh={refresh} />
            : active === 'competitors' ? <CompetitorsSection harness={harness} brandId={brandId} refresh={refresh} />
            : active === 'analytics' ? <AnalyticsSection harness={harness} brandId={brandId} refresh={refresh} />
            : active === 'agents' ? <AgentsSection harness={harness} brandId={brandId} refresh={refresh} />
            : active === 'tools' ? <ToolsSection harness={harness} brandId={brandId} refresh={refresh} />
            : active === 'automations' ? <AutomationsSection harness={harness} brandId={brandId} refresh={refresh} />
            : active === 'memory' ? <MemorySection harness={harness} brandId={brandId} refresh={refresh} />
            : active === 'history' ? <HistorySection harness={harness} brandId={brandId} refresh={refresh} />
            : active === 'errors' ? <ErrorsSection harness={harness} brandId={brandId} refresh={refresh} />
            : active === 'costs' ? <CostsSection harness={harness} brandId={brandId} refresh={refresh} />
            : active === 'security' ? <SecuritySection harness={harness} brandId={brandId} refresh={refresh} />
            : active === 'fbgroups' ? <FbGroupsSection harness={harness} brandId={brandId} refresh={refresh} />
            : null}
          </div>
        </main>
      </div>

      <footer className="mt-auto border-t border-border/60 px-4 py-3 text-[11px] text-muted-foreground">
        Social Autopilot AI — el arnés viste al agente: AGENTE-GENERAL (semilla) + ecosistema ALBRA. Los estados distinguen siempre entre datos verificados, estimaciones y funciones pendientes de credenciales.
      </footer>
    </div>
  );
}
