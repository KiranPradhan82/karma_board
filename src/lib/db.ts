import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createTursoClient(): PrismaClient {
  const tursoUrl = process.env.TURSO_DATABASE_URL
  const tursoToken = process.env.TURSO_AUTH_TOKEN

  const libsql = createClient({
    url: tursoUrl!,
    authToken: tursoToken,
  })

  const adapter = new PrismaLibSQL(libsql)
  return new PrismaClient({ adapter, log: [] })
}

function createLocalClient(): PrismaClient {
  return new PrismaClient({ log: [] })
}

// Lazy singleton - creates the client only when first query runs
const handlers: ProxyHandler<PrismaClient> = {
  get(_target, prop, receiver) {
    if (prop === '$then' || prop === '$dispose') {
      // Handle await and dispose without triggering connection
      return undefined
    }

    if (!globalForPrisma.prisma) {
      const tursoUrl = process.env.TURSO_DATABASE_URL
      const tursoToken = process.env.TURSO_AUTH_TOKEN

      if (tursoUrl && tursoToken && tursoUrl.startsWith('libsql://')) {
        globalForPrisma.prisma = createTursoClient()
      } else {
        globalForPrisma.prisma = createLocalClient()
      }
    }

    const client = globalForPrisma.prisma
    const value = Reflect.get(client, prop, receiver)

    if (typeof value === 'function') {
      return value.bind(client)
    }
    return value
  },
}

export const db = new Proxy({} as PrismaClient, handlers)
