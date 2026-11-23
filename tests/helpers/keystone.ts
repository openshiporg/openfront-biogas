/**
 * The real GraphQL API in process: the app's Keystone config, its schema, its resolvers and list
 * access rules, against the migrated test schema. `as(user)` runs operations with the same session a
 * signed-in cookie gives that user, so permission checks are the ones the live site runs.
 */
import { randomUUID } from 'node:crypto'
import { TEST_DATABASE_URL } from './db'

type Ctx = any
let base: Ctx | null = null

export async function keystone(): Promise<Ctx> {
  if (base) return base
  // The config reads DATABASE_URL when it loads; point it at the test schema first.
  process.env.DATABASE_URL = TEST_DATABASE_URL
  process.env.SESSION_SECRET ||= 'a-32-character-session-secret-for-tests-only'.padEnd(40, 'x')
  const { getContext } = await import('@keystone-6/core/context')
  const PrismaModule = await import('@prisma/client')
  const config = (await import('../../features/keystone/index')).default
  base = getContext(config as never, PrismaModule as never)
  return base
}

const SESSION_SELECT = { id: true, name: true, email: true, isActive: true, customer: { select: { id: true } }, role: true } as const

/** A context carrying the session the app builds for this user (see features/keystone sessionData). */
export async function as(userId: string | null): Promise<Ctx> {
  const ctx = await keystone()
  if (!userId) return ctx.withSession(null)
  const u = await ctx.prisma.user.findUnique({ where: { id: userId }, select: SESSION_SELECT })
  if (!u) throw new Error('No such user')
  return ctx.withSession({ itemId: u.id, listKey: 'User', data: { name: u.name, email: u.email, isActive: u.isActive, customer: u.customer, role: u.role } })
}

export class GqlError extends Error {
  constructor(public code: string, message: string) { super(`${message} [${code}]`) }
}

/** Run one operation; GraphQL errors throw with their stable code in the message. */
export async function gql<T = any>(ctx: Ctx, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const result = await ctx.graphql.raw({ query, variables })
  if (result.errors?.length) {
    const e = result.errors[0]
    throw new GqlError(String(e.extensions?.code ?? ''), e.message)
  }
  return result.data as T
}

/** gql for a single root field. */
export async function op<T = any>(ctx: Ctx, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const data = await gql<Record<string, T>>(ctx, query, variables)
  return Object.values(data)[0]
}

export const key = (what: string) => `${what}:${randomUUID()}`
