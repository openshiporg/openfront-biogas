import 'server-only'
import { gql } from './client'

/* Records a guest reaches by their unguessable code (S6, S14, S15, S16). */

// null means "no such code" (the page shows not-found); a server failure throws, so the page shows the error state instead.
const one = async <T,>(op: string, code: string) => {
  const r = await gql<Record<string, T | null>>(`query($code: String!) { ${op}(code: $code) }`, { code })
  if (!r.ok) {
    if (r.code === 'NOT_FOUND') return null
    throw new Error(r.error)
  }
  return r.data[op] ?? null
}

export const getQuote = (code: string) => one<any>('getQuoteByCode', code)
export const getOrder = (code: string) => one<any>('getOrderByCode', code)
export const getVisit = (code: string) => one<any>('getVisitByCode', code)
export const getPaySession = (code: string) => one<any>('getPaymentSession', code)

/* Signed-in customer reads (S20–S25). A failure is a real error, so callers can tell "none" from "broken". */
export async function mine<T>(op: string, args: Record<string, unknown> = {}) {
  const vars = Object.keys(args)
  const sig = vars.length ? `(${vars.map(v => `$${v}: ID!`).join(', ')})` : ''
  const call = vars.length ? `(${vars.map(v => `${v}: $${v}`).join(', ')})` : ''
  const r = await gql<Record<string, T>>(`query${sig} { ${op}${call} }`, args)
  return r.ok ? { ok: true as const, data: r.data[op] } : { ok: false as const, error: r.error }
}
