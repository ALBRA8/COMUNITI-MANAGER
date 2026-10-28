// Módulo FB-GROUPS — funciones puras compartidas por panel y servidor.
// Sin imports de DB ni del SDK: este archivo también lo consume el cliente
// (gauge de riesgo en vivo del formulario de campañas). FICHA: modulo-fb-groups/FICHA.md

// ─── Score de riesgo pre-vuelo (roadmap #1: maherpost/groupposting) ──
// 0-100 (mayor = más riesgo). Factores deterministas y declarados: el panel
// advierte ANTES del límite, no después. No es una promesa: es una foto del
// perfil de la campaña contra el warmup que ya conoce el chaleco.

export interface RiskInput {
  sessionAgeDays: number; // antigüedad de la cuenta (peor caso si hay varias)
  usedToday: number; // posts ya publicados hoy por el worker más joven
  cap: number; // techo diario del worker más joven
  targets: number; // objetivos de la campaña
  textLength: number; // longitud del texto base
  hasSpintax: boolean; // ¿el texto base usa {a|b}?
  mediaCount: number;
  hasFirstComment: boolean;
  windowStart: number;
  windowEnd: number;
}

export interface RiskFactor {
  label: string;
  points: number;
  note: string;
}

export interface RiskResult {
  score: number;
  level: 'BAJO' | 'MEDIO' | 'ALTO';
  factors: RiskFactor[];
  mitigations: string[];
}

export function computeRiskScore(input: RiskInput): RiskResult {
  const factors: RiskFactor[] = [];
  const mitigations: string[] = [];

  // 1) Cuenta joven (warmup): la mitad del riesgo real viene de cuentas sin historial.
  if (input.sessionAgeDays < 7) {
    factors.push({ label: 'Cuenta muy joven', points: 25, note: '< 7 días: techo 5/día, Meta vigila de cerca' });
  } else if (input.sessionAgeDays < 14) {
    factors.push({ label: 'Cuenta joven', points: 15, note: '7-13 días: techo 10/día' });
  } else if (input.sessionAgeDays < 30) {
    factors.push({ label: 'Cuenta en rodaje', points: 8, note: '14-29 días: aún construyendo historial' });
  }

  // 2) Techo del día casi agotado: empujar hasta el borde del límite es un patrón de ráfaga.
  if (input.cap > 0) {
    const ratio = input.usedToday / input.cap;
    if (ratio >= 1) {
      factors.push({ label: 'Techo de hoy agotado', points: 10, note: 'Los jobs quedarán en cola hasta mañana' });
    } else if (ratio >= 0.8) {
      factors.push({ label: 'Techo casi agotado', points: 6, note: `${Math.round(ratio * 100)}% del cupo diario usado` });
    } else if (ratio >= 0.5) {
      factors.push({ label: 'Medio techo consumido', points: 3, note: `${Math.round(ratio * 100)}% del cupo diario usado` });
    }
  }

  // 3) Volumen del lote: muchos objetivos en una sola campaña = ráfaga idéntica.
  if (input.targets > 25) {
    factors.push({ label: 'Lote muy grande', points: 15, note: `${input.targets} objetivos: reparte en varias campañas/días` });
    mitigations.push('Divide el lote: 10-15 grupos por campaña y escala por semanas limpias');
  } else if (input.targets > 15) {
    factors.push({ label: 'Lote grande', points: 10, note: `${input.targets} objetivos en una campaña` });
  } else if (input.targets > 8) {
    factors.push({ label: 'Lote mediano', points: 5, note: `${input.targets} objetivos en una campaña` });
  }

  // 4) Texto idéntico sin variación: el patrón nº1 detectado por Meta y por admins.
  if (!input.hasSpintax && input.targets > 3) {
    factors.push({ label: 'Texto idéntico sin spintax', points: 10, note: 'El mismo texto exacto a más de 3 grupos' });
    mitigations.push('Añade {variantes|alternativas} de spintax al texto base');
  }

  // 5) Posts demasiado cortos parecen spam de enlaces.
  if (input.textLength > 0 && input.textLength < 80) {
    factors.push({ label: 'Texto muy corto', points: 5, note: `${input.textLength} caracteres: los posts cortos con enlaces son señal clásica` });
  }

  // 6) Ventana estrecha con lote grande: publicar todo apretado en pocas horas.
  const windowHours = input.windowEnd >= input.windowStart
    ? input.windowEnd - input.windowStart
    : 24 - input.windowStart + input.windowEnd;
  if (windowHours > 0 && windowHours < 6 && input.targets > 3) {
    factors.push({ label: 'Ventana horaria estrecha', points: 10, note: `${windowHours} h para ${input.targets} objetivos: gaps humanos de 3-10 min lo impiden, se acumulará` });
    mitigations.push('Amplía la ventana a 10-14 h para respirar entre posts');
  }

  // 7) Enlace en primer comentario: patrón legítimo pero conocido de evasión de filtros.
  if (input.hasFirstComment) {
    factors.push({ label: 'Enlace en primer comentario', points: 5, note: 'Patrón de bump-comment: úsalo con moderación y con delay' });
  }

  // Mitigante: adjuntos hacen el post más orgánico.
  if (input.mediaCount > 0) {
    factors.push({ label: 'Adjuntos presentes (mitiga)', points: -5, note: `${input.mediaCount} imagen(es): los posts con foto parecen más orgánicos` });
  }

  const score = Math.max(0, Math.min(100, factors.reduce((acc, f) => acc + f.points, 0)));
  const level: RiskResult['level'] = score < 35 ? 'BAJO' : score < 65 ? 'MEDIO' : 'ALTO';

  if (level !== 'BAJO' && !mitigations.length) {
    mitigations.push('Espacia las campañas en días distintos y respeta el warmup');
  }

  return { score, level, factors, mitigations };
}

/** Entrada de riesgo a partir de la campaña + contexto del peor worker (peor caso, honesto). */
export function riskInputFromCampaign(
  c: { text: string; mediaUrls: string; firstComment: string; windowStart: number; windowEnd: number; targetCount: number },
  worker: { sessionAgeDays: number; usedToday: number; cap: number } | null,
): RiskInput {
  let mediaCount = 0;
  try { const arr = JSON.parse(c.mediaUrls ?? '[]'); if (Array.isArray(arr)) mediaCount = arr.length; } catch { /* sin adjuntos */ }
  return {
    sessionAgeDays: worker?.sessionAgeDays ?? 0,
    usedToday: worker?.usedToday ?? 0,
    cap: worker?.cap ?? 0,
    targets: Math.max(1, c.targetCount),
    textLength: c.text.trim().length,
    hasSpintax: /\{[^{}]+\}/.test(c.text),
    mediaCount,
    hasFirstComment: Boolean(c.firstComment.trim()),
    windowStart: c.windowStart,
    windowEnd: c.windowEnd,
  };
}

// ─── Negrita unicode (gap de paridad menor) ────────────────────────
// Facebook no admite texto enriquecido en posts; los del nicho usan caracteres
// unicode matemáticos. Convertimos SOLO los segmentos marcados *así* — el
// texto queda legible si la plataforma no los renderiza como negrita.

const BOLD_OFFSET_LOWER = 0x1d5ba - 0x61; // 'a' → MATHEMATICAL SANS-SERIF BOLD SMALL A (U+1D5BA)
const BOLD_OFFSET_UPPER = 0x1d5a0 - 0x41; // 'A' → MATHEMATICAL SANS-SERIF BOLD CAPITAL A (U+1D5A0)
const BOLD_OFFSET_DIGIT = 0x1d7ec - 0x30; // '0' → MATHEMATICAL SANS-SERIF BOLD DIGIT ZERO (U+1D7EC)

function toBoldChar(ch: string): string {
  const code = ch.charCodeAt(0);
  if (code >= 0x61 && code <= 0x7a) return String.fromCodePoint(code + BOLD_OFFSET_LOWER);
  if (code >= 0x41 && code <= 0x5a) return String.fromCodePoint(code + BOLD_OFFSET_UPPER);
  if (code >= 0x30 && code <= 0x39) return String.fromCodePoint(code + BOLD_OFFSET_DIGIT);
  return ch; // tildes, ñ, signos: quedan como están (honesto, sin inventar glifos)
}

/** Convierte los segmentos *marcados con asteriscos* en negrita unicode. Los asteriscos desaparecen. */
export function applyUnicodeBold(text: string): string {
  return text.replace(/\*([^*\n]+)\*/g, (_m, seg: string) => [...seg].map(toBoldChar).join(''));
}

// ─── Rotación de adjuntos (roadmap #3: pilotposter) ────────────────
// Determinista por job: el mismo job siempre recibe la misma imagen (re-claims
// estables) y el conjunto de jobs reparte las imágenes del pool.

export function pickRotatedMedia<T>(pool: T[], jobId: string): T | null {
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0];
  let h = 2166136261;
  for (let i = 0; i < jobId.length; i++) {
    h ^= jobId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return pool[(h >>> 0) % pool.length];
}

// ─── Proxy por cuenta (gap de paridad menor) ───────────────────────
// El proxy se APLICA donde corre el Chrome (env FB_PROXY del worker). El panel
// solo documenta cuál cuenta usa cuál; nunca mostramos credenciales del proxy.

/** Enmascara user:pass@ de una URL de proxy para exponerla en el panel. */
export function maskProxy(raw: string): string {
  const url = raw.trim();
  if (!url) return '';
  return url.replace(/^(https?|socks[45]?)(:\/\/)([^@/]+)@/i, (_m, scheme: string, sep: string) => `${scheme}${sep}•••@`);
}

export function isValidProxyUrl(raw: string): boolean {
  return /^(https?|socks[45]?):\/\/.+/i.test(raw.trim());
}
