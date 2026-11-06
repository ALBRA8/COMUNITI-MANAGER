import Link from 'next/link';

// 404 honesta (F-OPS-06) con salida de vuelta al panel.
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <h2 className="text-lg font-semibold">Página no encontrada</h2>
      <p className="text-sm text-muted-foreground">La ruta que buscas no existe en el arnés.</p>
      <Link href="/" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
        Volver al panel
      </Link>
    </div>
  );
}
