import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // El log de queries es herramienta de desarrollo: en producción solo
    // errores y warnings (cada query con parámetros en stdout termina en
    // server.log y filtra datos sensibles; F-SEC-04).
    log: process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
