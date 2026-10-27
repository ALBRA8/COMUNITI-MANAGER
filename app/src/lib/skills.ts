// Biblioteca de habilidades (SKILL.md versionadas en base de datos).
// La semilla inicial es de autoría propia del arnés (nada copiado de
// referentes): plantillas operativas en español para community management.

import { db } from '@/lib/db';

export interface SkillSeed {
  key: string;
  name: string;
  category: string;
  body: string;
}

export const SKILL_SEEDS: SkillSeed[] = [
  {
    key: 'post-valor-3-actos',
    name: 'Post de valor en 3 actos',
    category: 'CONTENT',
    body: `# Post de valor en 3 actos

## Objetivo
Escribir una publicación que educa sin vender y deja a la marca como autoridad honesta.

## Estructura
1. **Gancho (1 frase)**: pregunta directa o dato contraintuitivo relacionado con el dolor real de la audiencia. Sin clickbait, sin mayúsculas sostenidas.
2. **Desarrollo (3-5 líneas)**: un solo consejo accionable, con ejemplo concreto de la marca. No listas de 10 puntos: profundidad sobre amplitud.
3. **Cierre (1-2 líneas)**: invitación suave (pregunta abierta o recurso gratuito). El CTA duro se reserva para posts de oferta.

## Reglas de marca
- Usar SOLO el vocabulario aprobado de la memoria de marca.
- Verificar que ninguna cifra sea una promesa: si es estimación, decirlo.
- Formato nativo por red: en Instagram saltos de línea cortos; en LinkedIn párrafos de 2 líneas; en X un solo mensaje sin hilos salvo que la memoria lo apruebe.

## Criterio de finalización
La validación del supervisor pasa sin incidencias y el texto no contiene palabras prohibidas.`,
  },
  {
    key: 'respuesta-faq-empatica',
    name: 'Respuesta a FAQ con empatía y prueba',
    category: 'ENGAGEMENT',
    body: `# Respuesta a FAQ con empatía y prueba

## Objetivo
Responder preguntas frecuentes en comentarios y mensajes en menos de 24 h, con tono de marca y sin comprometer promesas.

## Estructura
1. **Agradecimiento breve** (1 frase, sin fórmulas robóticas).
2. **Respuesta directa** con la FAQ autorizada de la memoria de marca, parafraseada, no copiada literal.
3. **Prueba o enlace** (evidencia, testimonio aprobado o URL oficial).
4. **Puerta abierta**: invitar a seguir la conversación por el canal oficial de soporte si el caso es particular.

## Reglas de marca
- Nunca inventar precios: citar SOLO los precios autorizados de la memoria.
- Si la pregunta toca un caso legal, de reembolso o de crisis → derivar a humano (HUMAN_REQUIRED), nunca improvisar.
- Máximo 3 frases por respuesta; si necesita más, es un caso de soporte.

## Criterio de finalización
Clasificación FAQ confirmada, respuesta dentro del vocabulario aprobado y registro en la bandeja.`,
  },
  {
    key: 'crisis-primeros-60-minutos',
    name: 'Crisis: primeros 60 minutos',
    category: 'CRISIS',
    body: `# Crisis: primeros 60 minutos

## Objetivo
Contener una situación de crisis pública (reclamos masivos, error de publicación, rumor) sin empeorarla.

## Protocolo
1. **Minuto 0-10 — Detectar y congelar**: pausar publicaciones programadas de la marca (pausa global si la crisis es grave). Nada nuevo sale sin aprobación humana.
2. **Minuto 10-20 — Clasificar**: ¿es un reclamo legítimo, un malentendido o abuso/troll? Guardar evidencia (URL + captura del texto original).
3. **Minuto 20-40 — Responder o escalar**:
   - Reclamo legítimo → respuesta pública breve: reconocimiento + "te escribimos por privado". Sin explicaciones defensivas.
   - Malentendido → aclaración factual con evidencia, tono neutro, una sola vez.
   - Abuso/troll → no responder; moderar según política.
4. **Minuto 40-60 — Informar**: resumen para el operador con volumen, sentimiento y decisiones tomadas.

## Reglas duras
- Bajo crisis, autonomía L3 se degrada a L2: todo requiere aprobación humana.
- Nunca borrar críticas legítimas; solo se modera abuso, spam o fraude.

## Criterio de finalización
Pausa aplicada, evidencias guardadas y resumen entregado al operador.`,
  },
  {
    key: 'semana-equilibrada-contenido',
    name: 'Semana equilibrada de contenido',
    category: 'GROWTH',
    body: `# Semana equilibrada de contenido

## Objetivo
Distribuir el contenido semanal de una marca sin saturar y cubriendo los pilares definidos.

## Distribución base (ajustable por memoria de marca)
- **40% valor** (educa): posts de 3 actos, tips, recursos.
- **25% prueba social** (confía): testimonios aprobados, casos, resultados verificados.
- **20% comunidad** (conecta): preguntas, encuestas, respuestas destacadas.
- **15% oferta** (vende): producto, promoción, CTA claro.

## Reglas
- Respetar maxPostsPerDay y allowedHours de la marca (el arnés los bloquea solos).
- No dos días seguidos sin publicar; no más de una oferta por semana salvo campaña aprobada.
- Cada pieza nace de una fase PLAN con tema/pilar registrado.

## Criterio de finalización
El plan semanal queda en el calendario con estados y la marca tiene borradores en VALIDATE antes del primer día.`,
  },
  {
    key: 'publicar-en-grupos-fb',
    name: 'Publicación segura en grupos de Facebook',
    category: 'GROWTH',
    body: `# Publicación segura en grupos de Facebook (módulo FB-GROUPS)

## Objetivo
Distribuir contenido aprobado en grupos propios del usuario a ritmo humano, maximizando alcance y minimizando riesgo de restricción.

## Contexto técnico
La Graph API oficial de Meta eliminó la publicación en grupos (22/04/2024). La única vía es el navegador con la sesión del usuario (worker FB-GROUPS del chaleco). Automatizar publicación viola los Términos de Meta: el riesgo de la cuenta es del dueño y se declara en la FICHA del módulo.

## Procedimiento
1. **Fuente del contenido**: siempre un borrador aprobado (APPROVE) o texto del operador. Nunca inventar datos de la marca: usar memoria de marca (tono, vocabulario, prohibidos).
2. **Objetivos**: grupos donde el usuario es miembro, en colecciones por nicho. Excluir grupos con health score bajo.
3. **Ventana**: respetar windowStart-windowEnd local y el techo diario con warmup (5/día semana 1, 10/día semana 2, 20/día desde la semana 3).
4. **Variante por grupo**: spintax determinista por (job, grupo) o reescritura IA del borrador aprobado según nivel de autonomía. Nunca el mismo texto dos veces.
5. **Primer comentario**: si el post lleva enlace, colocarlo en comentario automático 1-3 min después, no en el cuerpo.
6. **Evidencia**: cada publicación devuelve URL viva o motivo exacto del fallo. Sin URL no hay éxito.
7. **Defensa**: ante cualquier advertencia o checkpoint de Facebook, pausa de 12 h de la cuenta y alerta al panel. El grupo que rechaza sale de rotación.

## Criterio de finalización
Campaña con todos sus jobs en estado terminal, resultados auditados y health scores actualizados.`,
  },
];

/** Siembra la biblioteca inicial una sola vez ( Setting: skills_seeded ). */
export async function ensureSkillSeeds(): Promise<{ seeded: number }> {
  const flag = await db.setting.findUnique({ where: { key: 'skills_seeded' } });
  if (flag?.value === 'true') return { seeded: 0 };

  let seeded = 0;
  for (const s of SKILL_SEEDS) {
    await db.skill.upsert({
      where: { key: s.key },
      create: { key: s.key, name: s.name, category: s.category, body: s.body, source: 'semilla' },
      update: { name: s.name, category: s.category, body: s.body },
    });
    seeded += 1;
  }
  await db.setting.upsert({ where: { key: 'skills_seeded' }, create: { key: 'skills_seeded', value: 'true' }, update: { value: 'true' } });
  await db.auditEntry.create({ data: { actor: 'system', action: 'SKILLS_SEEDED', targetType: 'SKILL', allowed: true, reason: `Biblioteca inicial sembrada (${seeded} habilidades de autoría propia)` } });
  return { seeded };
}
