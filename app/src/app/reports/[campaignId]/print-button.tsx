'use client';

import { Printer } from 'lucide-react';

// Botón de impresión (isla cliente dentro del informe P9). El resto de la
// página es un componente de servidor que lee la auditoría append-only.
export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="no-print inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
    >
      <Printer className="h-3.5 w-3.5" aria-hidden />
      Imprimir / Guardar PDF
    </button>
  );
}
