'use client';

// Última línea de defensa (F-OPS-06): error del layout raíz.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Error global del panel</h1>
        <p style={{ color: '#666', marginBottom: '1rem' }}>{error.message.slice(0, 200)}</p>
        <button onClick={reset} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>Reintentar</button>
      </body>
    </html>
  );
}
