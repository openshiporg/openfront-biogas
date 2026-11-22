import 'server-only'
import { cookies, headers } from 'next/headers'
import { keystoneContext } from '@/features/keystone/context'

/*
 * Every storefront read and write goes through the Keystone GraphQL schema with the visitor's own
 * session cookie, so list access rules and the custom operations decide what they may see and do.
 * The request runs in-process (no HTTP hop to ourselves), with the same cookie and client address.
 */

export const SESSION_COOKIE = 'keystonejs-session'
export const CART_COOKIE = 'biogas_cart'

export type GqlResult<T> = { ok: true; data: T } | { ok: false; error: string; code: string | null; field?: string | null }

const FALLBACK = 'Something went wrong on our side. Please try again, or call us.'
// Driver or stack text never reaches a visitor, whatever the resolver threw.
const UNSAFE = /prisma|invocation|\bat\s+\S+\s*\(|node_modules|postgres(ql)?:\/\/|\bSQL\b|ECONN|query engine|\.ts:\d+|\.js:\d+|Cannot query field|Unknown argument|Unknown type|Variable "\$/i

function friendly(errors: readonly { message?: string; extensions?: Record<string, unknown> }[]) {
  const first = errors[0]
  const code = typeof first?.extensions?.code === 'string' ? (first.extensions.code as string) : null
  const message = (first?.message || '').trim()
  const field = typeof first?.extensions?.field === 'string' ? (first.extensions.field as string) : null
  if (code === 'KS_ACCESS_DENIED') return { error: 'Please sign in to see this.', code }
  if (!message || message.length > 300 || UNSAFE.test(message)) return { error: FALLBACK, code }
  return { error: message, code, field }
}

async function requestContext() {
  const jar = await cookies()
  const h = await headers()
  const token = jar.get(SESSION_COOKIE)?.value
  const req = {
    headers: {
      cookie: token ? `${SESSION_COOKIE}=${token}` : '',
      'x-cart-token': jar.get(CART_COOKIE)?.value || '',
      'x-forwarded-for': h.get('x-forwarded-for') || '',
      'user-agent': h.get('user-agent') || '',
      host: h.get('host') || '',
    },
    socket: { remoteAddress: '' },
  }
  // Keystone's session start writes Set-Cookie on a response; give it one so in-process sign-in returns a
  // token (the storefront action then sets the cookie itself).
  const res = { setHeader() {}, getHeader() { return undefined }, headersSent: false }
  return keystoneContext.withRequest(req as never, res as never)
}

/** Run one GraphQL document as the current visitor. */
export async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<GqlResult<T>> {
  try {
    const context = await requestContext()
    const result = await context.graphql.raw({ query, variables })
    if (result.errors?.length) {
      const f = friendly(result.errors as never)
      if (f.error === FALLBACK) console.error(JSON.stringify({ component: 'storefront-gql', error: String(result.errors[0]?.message ?? '').slice(0, 300) }))
      return { ok: false, ...f }
    }
    return { ok: true, data: result.data as T }
  } catch (error) {
    console.error(JSON.stringify({ component: 'storefront-gql', error: error instanceof Error ? error.message.slice(0, 300) : 'unknown' }))
    return { ok: false, error: FALLBACK, code: null }
  }
}

/** Same as gql, but a failure becomes null (for optional page sections). */
export async function gqlOrNull<T>(query: string, variables: Record<string, unknown> = {}): Promise<T | null> {
  const r = await gql<T>(query, variables)
  return r.ok ? r.data : null
}

/** Which custom operations the running schema exposes (so a page whose operation is missing says so plainly). */
export async function hasOperations(...names: string[]): Promise<boolean> {
  const r = await gqlOrNull<{ q: { fields: { name: string }[] } | null; m: { fields: { name: string }[] } | null }>(
    '{ q: __type(name: "Query") { fields { name } } m: __type(name: "Mutation") { fields { name } } }',
  )
  if (!r) return false
  const all = new Set([...(r.q?.fields ?? []), ...(r.m?.fields ?? [])].map(f => f.name))
  return names.every(n => all.has(n))
}
