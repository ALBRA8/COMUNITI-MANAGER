// Contratos normalizados del arnés (PRD §6) y tipos globales.

export const CONTRACTS = [
  'get_capabilities',
  'get_connection_status',
  'list_accounts',
  'fetch_metrics',
  'fetch_comments',
  'fetch_messages',
  'research_topic',
  'analyze_competitor',
  'create_content_draft',
  'generate_creative_brief',
  'validate_content',
  'request_approval',
  'schedule_post',
  'publish_post',
  'verify_publication',
  'reply_to_comment',
  'reply_to_message',
  'moderate_item',
  'create_lead',
  'record_experiment',
  'generate_performance_report',
  'fb_groups_post',
  'fb_groups_sync',
  'fb_groups_report',
] as const;
export type Contract = (typeof CONTRACTS)[number];

export const NETWORKS = [
  'instagram', 'facebook', 'tiktok', 'x', 'linkedin', 'youtube', 'threads',
] as const;
export type Network = (typeof NETWORKS)[number];

export type ToolStatus = 'CONNECTED' | 'AWAITING_CREDENTIALS' | 'UNAVAILABLE' | 'DISABLED';
export type ToolOutcome = 'OK' | 'ERROR' | 'CAPACITY_UNAVAILABLE';

export type TaskStatus =
  | 'PENDING' | 'RUNNING' | 'WAITING_APPROVAL' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'PAUSED';

export type AutonomyMode = 'L1_ASSISTED' | 'L2_SUPERVISED' | 'L3_AUTONOMOUS_LIMITED';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type AgentKey =
  | 'strategy' | 'researcher' | 'trends' | 'planner' | 'writer' | 'creative'
  | 'adapter' | 'publisher' | 'community' | 'moderator' | 'capture'
  | 'analyst' | 'optimizer' | 'supervisor';

export const CYCLE_PHASES = [
  'RESEARCH', 'ANALYZE', 'PLAN', 'CREATE', 'VALIDATE', 'APPROVE',
  'PUBLISH', 'VERIFY', 'ENGAGE', 'MEASURE', 'LEARN', 'OPTIMIZE',
] as const;
export type CyclePhase = (typeof CYCLE_PHASES)[number];

// Resultado estándar de toda ejecución de contrato
export interface ContractResult<T = unknown> {
  outcome: ToolOutcome;
  data?: T;
  reason?: string; // obligatorio si outcome != OK
  evidence?: { source: string; url?: string; payload: unknown };
}

// Especificaciones por red (validación de contenido)
export const NETWORK_SPECS: Record<Network, { maxLength: number; hashtags: number; media: string[]; format: string }> = {
  instagram: { maxLength: 2200, hashtags: 30, media: ['image', 'carousel', 'reel'], format: 'Caption + imagen/carrusel; hook en primeras 125 palabras' },
  facebook: { maxLength: 63206, hashtags: 5, media: ['image', 'video', 'text'], format: 'Post versátil; enlaces con vista previa' },
  tiktok: { maxLength: 2200, hashtags: 8, media: ['video'], format: 'Vídeo vertical 9:16 con gancho en 3s' },
  x: { maxLength: 280, hashtags: 2, media: ['image', 'video'], format: 'Texto corto o hilo; 1-2 hashtags' },
  linkedin: { maxLength: 3000, hashtags: 3, media: ['image', 'document', 'video'], format: 'Profesional; primera línea = gancho' },
  youtube: { maxLength: 5000, hashtags: 15, media: ['video'], format: 'Título + descripción con capítulos' },
  threads: { maxLength: 500, hashtags: 1, media: ['image', 'video'], format: 'Conversacional' },
};

// Clasificación de interacciones (PRD §8)
export const COMMENT_CLASSES = [
  'FAQ', 'PRODUCT_INQUIRY', 'SALES_REQUEST', 'LEAD', 'SUPPORT', 'COMPLAINT',
  'REFUND', 'SPAM', 'FRAUD', 'ABUSE', 'CRISIS', 'HUMAN_REQUIRED',
] as const;
export type CommentClass = (typeof COMMENT_CLASSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  PENDING: 'Pendiente',
  RUNNING: 'En ejecución',
  WAITING_APPROVAL: 'Esperando aprobación',
  COMPLETED: 'Completada',
  FAILED: 'Fallida',
  CANCELLED: 'Cancelada',
  PAUSED: 'En pausa',
};

export const TOOL_STATUS_LABELS: Record<ToolStatus, string> = {
  CONNECTED: 'Conectado',
  AWAITING_CREDENTIALS: 'Pendiente de credenciales',
  UNAVAILABLE: 'No disponible',
  DISABLED: 'Desactivado',
};

// Aprobación necesaria según modo de autonomía y riesgo de la acción
export function requiresApproval(mode: AutonomyMode, risk: RiskLevel): boolean {
  if (mode === 'L1_ASSISTED') return true;
  if (mode === 'L2_SUPERVISED') return risk !== 'LOW';
  // L3: solo riesgo alto/crítico requiere aprobación
  return risk === 'HIGH' || risk === 'CRITICAL';
}

export function riskOfAction(contract: Contract): RiskLevel {
  switch (contract) {
    case 'publish_post':
    case 'reply_to_comment':
    case 'reply_to_message':
    case 'moderate_item':
      return 'HIGH';
    case 'schedule_post':
      return 'MEDIUM';
    case 'create_lead':
      return 'MEDIUM';
    default:
      return 'LOW';
  }
}
