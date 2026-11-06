// Puente de autenticación OPCIONAL del panel (F-SEC-01 / F-ARC-20).
//
// La casa opera como arnés personal detrás de proxy propio (FICHA §3): sin
// sesión ni cookies por diseño. Este helper añade la frontera que falta para
// un despliegue expuesto SIN romper el modo local ni los tests:
//
// - Si PANEL_TOKEN NO está definido → comportamiento actual (modo local).
// - Si PANEL_TOKEN está definido → toda mutación de panel exige la cabecera
//   `x-panel-token` con el valor correcto (comparación en tiempo constante).
//   Los endpoints de worker (HMAC propio), webhooks y el tick del scheduler
//   NO pasan por aquí: tienen su propio mecanismo de autenticación.
//
// Despliegue recomendado con Caddy: el proxy inyecta la cabecera al panel
// autenticado (basic_auth + header_up X-Panel-Token <secreto>) y el navegador
// no necesita ningún cambio.

import crypto from 'crypto';

export function panelAuthEnabled(): boolean {
  return Boolean(process.env.PANEL_TOKEN);
}

export function checkPanelToken(req: Request): boolean {
  if (!panelAuthEnabled()) return true; // modo local: sin frontera adicional
  const provided = req.headers.get('x-panel-token') ?? '';
  const expected = process.env.PANEL_TOKEN ?? '';
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Devuelve una respuesta 401 si el token es requerido y falta; null si sigue. */
export function guardPanel(req: Request): Response | null {
  if (checkPanelToken(req)) return null;
  return new Response(JSON.stringify({ error: 'Token de panel requerido (x-panel-token)' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
