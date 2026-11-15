import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Los errores de tipos BLOQUEAN el build (F-OPS-02): el código que no compila
  // limpio no llega a producción. El chequeo completo vive en `npx tsc --noEmit`.
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  // Sin indicador flotante de devtools en modo desarrollo (P19-AJUSTES-01):
  // estorbaba la revisión visual del operador; los errores siguen visibles
  // en dev.log y en los error boundaries de la app.
  devIndicators: false,
  // Cabeceras mínimas de seguridad para un panel de operaciones (F-SEC-13/F-OPS-18).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
