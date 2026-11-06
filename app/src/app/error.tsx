'use client';

// Error boundary del App Router (F-OPS-06): un fallo de render ya no deja la
// pantalla muerta; ofrece recuperación sin perder el contexto del panel.
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <h2 className="text-lg font-semibold">Algo falló al renderizar esta sección</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        El panel interceptó el error en lugar de quedarse en blanco. Detalle técnico: <code className="text-xs">{error.message.slice(0, 200)}</code>
      </p>
      <button onClick={reset} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
        Reintentar
      </button>
    </div>
  );
}
