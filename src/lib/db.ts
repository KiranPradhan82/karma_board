import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const tursoUrl = process.env.TURSO_DATABASE_URL
  const tursoToken = process.env.TURSO_AUTH_TOKEN

  // Use Turso adapter when credentials are available
  if (tursoUrl && tursoToken) {
    try {
      // Sanitize: ensure URL starts with a supported scheme
      const cleanUrl = tursoUrl.trim()
      const supportedSchemes = ['libsql://', 'wss://', 'ws://', 'https://', 'http://', 'file://']
      const hasValidScheme = supportedSchemes.some(s => cleanUrl.startsWith(s))

      if (!hasValidScheme) {
        console.error(`[db] Invalid Turso URL scheme (starts with "${cleanUrl.substring(0, 10)}"). Expected one of: libsql://, https://, file://. Falling back to local SQLite.`)
        return new PrismaClient({ log: [] })
      }

      // Remove any authToken query param from URL (use separate TURSO_AUTH_TOKEN)
      const urlWithoutToken = cleanUrl.split('?')[0]

      const libsql = createClient({
        url: urlWithoutToken,
        authToken: tursoToken,
      })

      const adapter = new PrismaLibSQL(libsql)
      return new PrismaClient({
        adapter,
        log: [],
      })
    } catch (error) {
      console.error('[db] Failed to create Turso client, falling back to local:', error)
    }
  }

  // Fallback to local SQLite
  return new PrismaClient({
    log: [],
  })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}
