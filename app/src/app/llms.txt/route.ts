// llms.txt propio del arnés (P11 v2-lite, destripe Blotato §3 — patrón
// "documentación en espejo Markdown/llms.txt para agentes"): superficie
// agéntica del chaleco documentada una por una, con honestidad radical.
// Es SOLO DESCRIPCIÓN: nada de esto autoriza a un agente a eludir el motor
// de cumplimiento ni el HITL. La verdad de cada entrega vive en la auditoría.

export const dynamic = 'force-dynamic';

export async function GET() {
  const now = new Date().toISOString();
  const body = `# COMUNITI-MANAGER — arnés del ecosistema ALBRA (superficie agéntica)

> Documento para agentes (llms.txt). Generado ${now}.
> Regla rectora: que una acción sea técnicamente posible no significa que la red la autorice.
> La ausencia de información nunca es permiso. Este documento NO modifica políticas.

## Módulo FB-GROUPS (pantalón operativo)

- GET /api/fb-agent/fb-groups — resumen de solo lectura: workers, grupos, campañas
  con conteos honestos, tareas de unión, alertas, límites vigentes y estado del motor
  de cumplimiento (meta.policy). Si policy.overall = BLOQUEADO o DESACTUALIZADO,
  las operaciones Meta están retenidas: escalar a revisión humana, no reintentar.
- POST /api/fb-campaigns — crear campaña. Nace SIEMPRE en DRAFT con jobs
  PENDING_APPROVAL. Ningún job vuela sin aprobación humana explícita
  (PATCH /api/fb-campaigns/{id} action=approve), que deja auditoría con actor y marca de tiempo.
- GET /api/fb-campaigns — lectura de campañas y sus estados reales.
- Publicación real: la ejecuta el worker del usuario con su propia sesión de navegador
  (no existe API de Meta para grupos: deprecada con Graph v19, 22/04/2024).

## Gobierno (META POLICY INTELLIGENCE)

- GET /api/meta-policy — estado del motor de 6 estados (PERMITIDO,
  PERMITIDO_CON_CONDICIONES, REQUIERE_APROBACION, NO_VERIFICADO, BLOQUEADO,
  POLITICA_DESACTUALIZADA), fuentes oficiales versionadas, cambios, incidentes y
  decisiones auditadas. Incluye networkCaps: techos propios multi-red (P13).
- POST /api/meta-policy — acciones HUMANAS únicamente (verificación, revisión manual,
  clasificación de cambios, apagado de emergencia, exclusiones). Ninguna de estas
  acciones puede ser ejecutada por un agente: el puente agéntico es de solo lectura
  y no puede desactivar restricciones.
- Techos propios multi-red (P13): toda publicación respeta el techo de su red
  (tabla auditable en /api/meta-policy, campo networkCaps). Es condición del motor,
  fija en código, no modificable por agentes.

## Reglas permanentes para cualquier agente

1. Leer antes de escribir: /api/fb-agent/fb-groups y /api/meta-policy primero.
2. HITL: ninguna publicación sale sin aprobación humana registrada.
3. Nunca evadir sistemas de detección, restricciones ni controles de integridad de
   ninguna red; ante CHALLENGE, 429 o aviso de restricción: parada y escalado humano.
4. Los estados son honestos: POSTED solo con postUrl verificable; FAILED con motivo real.
5. Datos personales: mínimos, con fin declarado y registro auditado (Ley 1581 de 2012).
6. Este archivo describe capacidades; no concede permisos. El veredicto lo emite el motor.
`;
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
