// HMAC-SHA256 del worker (mismo algoritmo que el chaleco, comparación en tiempo constante).
import crypto from 'node:crypto';

export function sign(body, secret) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

export function verify(body, secret, provided) {
  const expected = sign(body, secret);
  const a = Buffer.from(String(provided ?? ''));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
