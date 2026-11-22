import { PrismaClient } from '@prisma/client'

/**
 * Database tests run against a migrated, disposable Postgres schema named by BIOGAS_TEST_DATABASE_URL
 * (the scratch database's `vitest` schema). Pass the URL inline for the one command; it is never
 * written to a file. Without it the database suites are skipped, never faked.
 */
export const TEST_DATABASE_URL = process.env.BIOGAS_TEST_DATABASE_URL ?? ''
export const hasTestDatabase = /^postgres(ql)?:\/\//.test(TEST_DATABASE_URL) && /[?&]schema=vitest\b/.test(TEST_DATABASE_URL)

export function testPrisma(connectionLimit = 10) {
  const url = new URL(TEST_DATABASE_URL)
  url.searchParams.set('connection_limit', String(connectionLimit))
  url.searchParams.set('pool_timeout', '30')
  return new PrismaClient({ datasourceUrl: url.toString(), log: [] })
}

/** Empties every application table in the test schema. */
export async function resetDatabase(prisma: PrismaClient) {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'`
  if (!tables.length) return
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map(t => `"${t.tablename.replaceAll('"', '')}"`).join(', ')} CASCADE`)
}

let counter = 0
export const uniqueKey = (prefix = 'test') => `${prefix}-${Date.now().toString(36)}-${(counter += 1).toString(36)}-${Math.random().toString(36).slice(2, 8)}`
