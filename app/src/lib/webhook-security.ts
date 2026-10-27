// Seguridad de webhooks entrantes: verificación de firma HMAC-SHA256
// (equivalente a x-hub-signature-256 de GitHub) con comparación en tiempo
// constante. Función pura: testeable sin base de datos.

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SignatureCheck {
  ok: boolean;
  method: 'hmac' | 'bearer' | 'none';
  reason: string;
}

/** Firma esperada con el formato estándar `sha256=<hex>` sobre el cuerpo crudo. */
export function computeSignature(rawBody: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) {
    // comparación de longitud-distinta sin filtrar el motivo exacto
    timingSafeEqual(Buffer.alloc(32), Buffer.alloc(32));
    return false;
  }
  return timingSafeEqual(ba, bb);
}

/**
 * Verifica un webhook entrante cuando HARNESS_WEBHOOK_SECRET está configurado.
 * Acepta (en este orden): firma HMAC `x-harness-signature: sha256=<hex>` o
 * Bearer token (compatibilidad hacia atrás). Si el secreto no está configurado,
 * la verificación se omite (despliegue local) y se informa con honestidad.
 */
export function verifyWebhookSignature(
  rawBody: string,
  headers: { 'x-harness-signature'?: string | null; authorization?: string | null },
  secret: string | undefined,
): SignatureCheck {
  if (!secret) {
    return { ok: true, method: 'none', reason: 'Sin HARNESS_WEBHOOK_SECRET: verificación omitida (modo local)' };
  }

  const sig = headers['x-harness-signature'];
  if (sig) {
    const expected = computeSignature(rawBody, secret);
    if (safeEqual(sig.trim(), expected)) {
      return { ok: true, method: 'hmac', reason: 'Firma HMAC-SHA256 válida' };
    }
    return { ok: false, method: 'hmac', reason: 'Firma HMAC-SHA256 inválida' };
  }

  const auth = headers.authorization;
  if (auth && safeEqual(auth, `Bearer ${secret}`)) {
    return { ok: true, method: 'bearer', reason: 'Bearer token válido (compatibilidad)' };
  }

  return { ok: false, method: 'none', reason: 'Sin firma HMAC ni Bearer válido' };
}
