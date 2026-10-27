// Mapa fase → agente (separado para evitar dependencia circular en cycle.ts)
import type { AgentKey, CyclePhase } from '@/lib/contracts';

export const PHASE_AGENT: Record<CyclePhase, AgentKey> = {
  RESEARCH: 'researcher',
  ANALYZE: 'trends',
  PLAN: 'planner',
  CREATE: 'writer',
  VALIDATE: 'supervisor',
  APPROVE: 'planner',
  PUBLISH: 'publisher',
  VERIFY: 'publisher',
  ENGAGE: 'community',
  MEASURE: 'analyst',
  LEARN: 'optimizer',
  OPTIMIZE: 'strategy',
};
