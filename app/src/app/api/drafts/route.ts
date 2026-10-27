import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { loadBrandMemory, validateContent } from '@/lib/brand-memory';
import { NETWORKS, NETWORK_SPECS, type Network } from '@/lib/contracts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Borradores: listar / crear / adaptar multirred
export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get('brandId');
  const drafts = await db.contentDraft.findMany({
    where: brandId ? { brandId } : undefined,
    include: { versions: true, publications: true },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  });
  return NextResponse.json(drafts);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { brandId, objective, theme, network, text, adaptTo } = body;
  if (!brandId || !objective) return NextResponse.json({ error: 'brandId y objective requeridos' }, { status: 400 });

  const memory = await loadBrandMemory(brandId);
  if (!memory) return NextResponse.json({ error: 'Marca no encontrada' }, { status: 404 });

  // Crear borrador con una versión inicial (redactada por LLM o plantilla)
  const targetNetwork: Network = NETWORKS.includes(network) ? network : 'instagram';
  let initialText = text ?? '';
  if (!initialText) {
    const task = await createDraftWithWriter(memory, targetNetwork, objective, theme ?? '');
    initialText = task;
  }
  const check = validateContent(memory, targetNetwork, initialText);
  const draft = await db.contentDraft.create({
    data: {
      brandId, objective, theme: theme ?? '',
      brief: 'Centro de creación',
      status: check.ok ? 'IN_REVIEW' : 'DRAFT',
      versions: { create: { network: targetNetwork, text: initialText, specCheck: JSON.stringify(check) } },
    },
  });

  // Adaptación multirred a otras redes solicitadas
  const adapted: { network: string; text: string; validation: unknown }[] = [];
  const others: Network[] = (Array.isArray(adaptTo) ? adaptTo : []).filter((n: string) => NETWORKS.includes(n) && n !== targetNetwork);
  for (const n of others) {
    const adaptedText = await adaptForNetwork(memory, n, initialText, objective);
    const c = validateContent(memory, n, adaptedText);
    await db.postVersion.create({ data: { draftId: draft.id, network: n, text: adaptedText, specCheck: JSON.stringify(c) } });
    adapted.push({ network: n, text: adaptedText, validation: c });
  }

  return NextResponse.json({ draft, adapted }, { status: 201 });
}

// Revalidar / editar versión
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { versionId, text } = body;
  const version = await db.postVersion.findUnique({ where: { id: versionId }, include: { draft: true } });
  if (!version) return NextResponse.json({ error: 'Versión no encontrada' }, { status: 404 });
  const memory = await loadBrandMemory(version.draft.brandId);
  if (!memory) return NextResponse.json({ error: 'Marca no encontrada' }, { status: 404 });
  const check = validateContent(memory, version.network as Network, text);
  const updated = await db.postVersion.update({
    where: { id: versionId },
    data: { text, specCheck: JSON.stringify(check) },
  });
  return NextResponse.json({ version: updated, validation: check });
}

async function createDraftWithWriter(memory: NonNullable<Awaited<ReturnType<typeof loadBrandMemory>>>, network: Network, objective: string, theme: string): Promise<string> {
  try {
    const { default: ZAI } = await import('z-ai-web-dev-sdk');
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: 'Eres el Redactor de la marca. Escribes en el tono definido, con su vocabulario, sin promesas exageradas ni precios no autorizados. Devuelves SOLO el texto de la publicación.' },
        {
          role: 'user',
          content: JSON.stringify({
            marca: memory.name, identidad: memory.identity, tono: memory.tone,
            vocabulario: memory.vocabulary, prohibido: memory.forbiddenWords,
            publico: memory.audience, objetivo: objective, tema: theme, red: network,
          }),
        },
      ],
    });
    const t = completion.choices[0]?.message?.content?.trim();
    if (t) return t;
  } catch { /* LLM no disponible */ }
  return `[Borrador plantilla — LLM no disponible] ${memory.name}: ${objective}${theme ? ` — ${theme}` : ''} (tono: ${memory.tone || 'por definir'})`;
}

async function adaptForNetwork(memory: NonNullable<Awaited<ReturnType<typeof loadBrandMemory>>>, network: Network, sourceText: string, objective: string): Promise<string> {
  const spec = NETWORK_SPECS[network];
  try {
    const { default: ZAI } = await import('z-ai-web-dev-sdk');
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: 'Eres el Adaptador Multirred. Conviertes un contenido en versión nativa para una red, respetando su especificación y sin cambiar el mensaje de fondo ni añadir afirmaciones nuevas. Devuelves SOLO el texto.' },
        {
          role: 'user',
          content: JSON.stringify({
            especificacion: spec, marca: memory.name, tono: memory.tone,
            objetivo: objective, texto_original: sourceText, red_destino: network,
          }),
        },
      ],
    });
    const t = completion.choices[0]?.message?.content?.trim();
    if (t) return t;
  } catch { /* sin LLM */ }
  return `${sourceText.slice(0, Math.max(80, spec.maxLength - 120))}… [Adaptación pendiente: LLM no disponible — especificación ${network}: ${spec.format}]`;
}
