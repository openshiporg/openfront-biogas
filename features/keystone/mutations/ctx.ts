import { GraphQLError } from 'graphql'
import { isDomainError } from '../lib/errors'
import { actorFromSession, actorOrGuest, type Actor } from '../lib/actor'
import { command, unkeyed } from '../lib/command'
import type { Db } from '../lib/db'
import type { UnitOfWork } from '../lib/unitOfWork'
import type { Session } from '../access'

// Business-rule messages reach the caller with their stable code; database and driver detail never does
// (ported from openfront-home-services mutations/op.ts).
const UNSAFE = /prisma|invocation|\bat\s+\S+\s*\(|node_modules|postgres(ql)?:\/\/|\bSQL\b|ECONN|query engine|\.ts:\d+|\.js:\d+/i
const SAFE_DETAIL_KEYS = new Set(['currentStatus', 'currentVersion', 'to', 'reason', 'field', 'problems', 'replay'])

export type Ctx = { prisma: Db; session?: Session | null; req?: { headers?: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } } }

export const op = <A, R>(fn: (root: unknown, args: A, context: Ctx) => Promise<R>) => async (root: unknown, args: A, context: Ctx): Promise<R> => {
  try {
    return await fn(root, args, context)
  } catch (error: any) {
    if (error instanceof GraphQLError) throw error
    if (isDomainError(error)) {
      const details = Object.fromEntries(Object.entries(error.details).filter(([key]) => SAFE_DETAIL_KEYS.has(key)))
      throw new GraphQLError(error.message, { extensions: { code: error.code, ...details } })
    }
    const message = typeof error?.message === 'string' ? error.message : ''
    if (error?.code === 'P2002') throw new GraphQLError('That conflicts with an existing record. Reload and try again.', { extensions: { code: 'STALE_STATE' } })
    console.error('Operation failed:', message.slice(0, 300).replace(/postgres(ql)?:\/\/\S+/g, '<url>'))
    const safe = message && message.length <= 300 && !UNSAFE.test(message) && !error?.code
    throw new GraphQLError(safe ? message : 'Unable to complete the request. Please try again.', { extensions: { code: 'KS_USER_INPUT_ERROR' } })
  }
}

export const staff = (context: Ctx) => actorFromSession(context.session)
export const anyone = (context: Ctx, guestKey: string) => actorOrGuest(context.session, guestKey)

type Keyed = { idempotencyKey?: string | null }

/** Run one idempotent command; the receipt is keyed by the caller's key and fingerprinted on the other args. */
export async function run<A extends Keyed, T>(context: Ctx, name: string, actor: Actor, args: A, work: (uow: UnitOfWork) => Promise<T>, now?: Date): Promise<T> {
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name, actor, idempotencyKey: String(idempotencyKey ?? ''), params, now }, work)
  return result.value
}

export const tx = <T>(context: Ctx, work: (uow: UnitOfWork) => Promise<T>) => unkeyed(context.prisma, work)

export function clientIp(context: Ctx) {
  const forwarded = context.req?.headers?.['x-forwarded-for']
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim()
  return (first || context.req?.socket?.remoteAddress || '').slice(0, 64)
}

/** Base URL for links staff share (quote, pay, visit). */
export const siteUrl = () => (process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.RAILWAY_PUBLIC_DOMAIN && `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` || '').replace(/\/$/, '')
