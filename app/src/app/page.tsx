'use client';

// COMUNITI-MANAGER — Panel del agente de comunidad (AGENTE-GENERAL)

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Users, CalendarDays, Inbox, BadgeCheck, PenTool,
  Search, BarChart3, Workflow, History,
  Pause, Play, UsersRound, Gavel, Settings, Sun, Moon, RadioTower,
} from 'lucide-react';

import DashboardSection from '@/components/sections/dashboard';
import { BrandsSection, CalendarSection } from '@/components/sections/brands-calendar';
import { CommunitySection, ApprovalsSection } from '@/components/sections/inbox-approvals';
import { CreationSection, MediaSection } from '@/components/sections/creation';
import { ResearchSection, CompetitorsSection, AnalyticsSection } from '@/components/sections/research-analytics';
import { ToolsSection, AutomationsSection } from '@/components/sections/ops';
import { MemorySection, HistorySection, ErrorsSection, SecuritySection } from '@/components/sections/memory-history';
import { MetaComplianceSection } from '@/components/sections/meta-compliance';
import { FbGroupsSection } from '@/components/sections/fb-groups';
import { SettingsSection } from '@/components/sections/settings';
import { ChannelsSection } from '@/components/sections/channels';

export interface HarnessState {
  status: string;
  autonomyMode: string;
  paused: boolean;
  tools: { key: string; provider: string; category: string; description: string; contracts: string[]; status: string; capabilities: string[]; rateLimit: string; costNote: string; lastResult: string }[];
  agents: { key: string; name: string; role: string; limits: string; allowedContracts: string[] }[];
  brands: { id: string; name: string; identity: string; tone: string; maxPostsPerDay: number; allowedHours: string; products?: string; audience?: string; vocabulary?: string; forbiddenWords?: string; policies?: string; faqs?: string; approvedExamples?: string; supportInfo?: string; accounts: { id: string; network: string; handle: string; status: string }[]; _count: { publications: number; drafts: number } }[];
  alerts: { unresolvedErrors: number; pendingApprovals: number };
}

export interface SectionProps {
  harness: HarnessState | null;
  brandId: string;
  refresh: () => void;
}

// Navegación minimalista (P19-LIMPIEZA): 14 ítems en 5 grupos con orden de
// misión — Panel, Canales (Telegram primero), Contenido, Operación, Sistema.
// Recorte P19-LIMPIEZA-02 por directiva del operador: fuera 'Agentes'
// (documentación interna de arquitectura, sin acción posible) y 'Límites y
// costes' (pasiva; los límites reales los aplica el motor y se ven en la
// marca y en el Centro de Cumplimiento Meta). Las vistas secundarias NO
// desaparecen: se pliegan dentro de su vista madre (biblioteca→creación,
// memoria→marcas, competidores→investigación, herramientas+seguridad→ajustes,
// errores→historial). Los nombres de 'Grupos de Facebook' y 'Centro de
// Cumplimiento Meta' son invariantes que el arnés agéntico de QA usa como
// anclas — no renombrar.
const NAV = [
  { id: 'dashboard', label: 'Resumen ejecutivo', icon: LayoutDashboard, group: 'Panel' },
  { id: 'brands', label: 'Marcas y cuentas', icon: Users, group: 'Panel' },
  { id: 'calendar', label: 'Calendario editorial', icon: CalendarDays, group: 'Panel' },
  { id: 'channels', label: 'Canales', icon: RadioTower, group: 'Canales' },
  { id: 'fbgroups', label: 'Grupos de Facebook', icon: UsersRound, group: 'Canales' },
  { id: 'creation', label: 'Centro de creación', icon: PenTool, group: 'Contenido' },
  { id: 'approvals', label: 'Cola de aprobaciones', icon: BadgeCheck, group: 'Contenido' },
  { id: 'inbox', label: 'Comentarios y mensajes', icon: Inbox, group: 'Contenido' },
  { id: 'research', label: 'Investigación', icon: Search, group: 'Contenido' },
  { id: 'automations', label: 'Automatizaciones', icon: Workflow, group: 'Operación' },
  { id: 'analytics', label: 'Analítica', icon: BarChart3, group: 'Operación' },
  { id: 'metacompliance', label: 'Centro de Cumplimiento Meta', icon: Gavel, group: 'Sistema' },
  { id: 'settings', label: 'Ajustes e integraciones', icon: Settings, group: 'Sistema' },
  { id: 'history', label: 'Historial y errores', icon: History, group: 'Sistema' },
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
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

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

  const [toggling, setToggling] = useState(false);
  const togglePause = async () => {
    if (toggling) return; // F4-UX-01: sin doble disparo en el control de parada
    setToggling(true);
    try {
      const res = await fetch('/api/harness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: harness?.paused ? 'resume' : 'pause' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`La ${harness?.paused ? 'reanudación' : 'pausa global'} NO se aplicó: ${data.error ?? 'error del servidor'}. Revisa el estado real en el badge.`);
      }
    } catch {
      alert('Fallo de red: la acción de pausa/reanudación no se confirmó. Revisa el badge de estado.');
    } finally {
      setToggling(false);
    }
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
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-xs ring-1 ring-foreground/10">CM</div>
            <div className="leading-tight">
              <p className="text-sm font-semibold">COMUNITI-MANAGER</p>
              <p className="text-[11px] text-muted-foreground hidden sm:block">Panel del agente de comunidad</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant={harness?.paused ? 'destructive' : 'secondary'} className="hidden sm:inline-flex">
              {harness?.paused ? 'En pausa' : 'Operativo'}
            </Badge>
            <Badge variant="outline" className="hidden md:inline-flex">
              Autonomía: {MODE_LABELS[harness?.autonomyMode ?? ''] ?? harness?.autonomyMode ?? '—'}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={mounted && theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
              className="hidden sm:inline-flex"
            >
              {mounted && theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button size="sm" variant={harness?.paused ? 'default' : 'outline'} disabled={toggling} onClick={togglePause}>
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
                        item.id === 'history' ? harness?.alerts.unresolvedErrors : 0;
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
            ) : (
              <div key={active} className="animate-in fade-in slide-in-from-bottom-1 duration-300">
            {active === 'dashboard' ? <DashboardSection harness={harness} brandId={brandId} refresh={refresh} />
            : active === 'brands' ? (
              <div className="grid gap-6">
                <BrandsSection harness={harness} brandId={brandId} refresh={refresh} />
                <MemorySection harness={harness} brandId={brandId} refresh={refresh} />
              </div>
            )
            : active === 'calendar' ? <CalendarSection harness={harness} brandId={brandId} refresh={refresh} />
            : active === 'channels' ? <ChannelsSection harness={harness} brandId={brandId} refresh={refresh} onNavigate={setActive} />
            : active === 'fbgroups' ? <FbGroupsSection harness={harness} brandId={brandId} refresh={refresh} />
            : active === 'creation' ? (
              <div className="grid gap-6">
                <CreationSection harness={harness} brandId={brandId} refresh={refresh} />
                <MediaSection harness={harness} brandId={brandId} refresh={refresh} />
              </div>
            )
            : active === 'approvals' ? <ApprovalsSection harness={harness} brandId={brandId} refresh={refresh} />
            : active === 'inbox' ? <CommunitySection harness={harness} brandId={brandId} refresh={refresh} />
            : active === 'research' ? (
              <div className="grid gap-6">
                <ResearchSection harness={harness} brandId={brandId} refresh={refresh} />
                <CompetitorsSection harness={harness} brandId={brandId} refresh={refresh} />
              </div>
            )
            : active === 'automations' ? <AutomationsSection harness={harness} brandId={brandId} refresh={refresh} />
            : active === 'analytics' ? <AnalyticsSection harness={harness} brandId={brandId} refresh={refresh} />
            : active === 'metacompliance' ? <MetaComplianceSection />
            : active === 'settings' ? (
              <div className="grid gap-6">
                <SettingsSection harness={harness} brandId={brandId} refresh={refresh} onNavigate={setActive} />
                <ToolsSection harness={harness} brandId={brandId} refresh={refresh} />
                <SecuritySection harness={harness} brandId={brandId} refresh={refresh} />
              </div>
            )
            : active === 'history' ? (
              <div className="grid gap-6">
                <HistorySection harness={harness} brandId={brandId} refresh={refresh} />
                <ErrorsSection harness={harness} brandId={brandId} refresh={refresh} />
              </div>
            )
            : null}
              </div>
            )}
          </div>
        </main>
      </div>

      <footer className="mt-auto border-t border-border/60 px-4 py-3 text-[11px] text-muted-foreground">
        COMUNITI-MANAGER — operado por AGENTE-GENERAL. Estados verificados, estimaciones y pendientes de credenciales siempre distinguidos.
      </footer>
    </div>
  );
}
