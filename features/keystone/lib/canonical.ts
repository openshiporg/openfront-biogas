import { createHash } from 'node:crypto'

/** Canonical JSON: keys sorted, undefined dropped, bigint and Decimal as strings, dates as ISO-8601. */
export function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Canonical JSON cannot hold a non-finite number')
    return value
  }
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(canonicalize)
  if (typeof value === 'object') {
    const decimalLike = value as { isFinite?: () => boolean; toFixed?: () => string; toString(): string }
    if (typeof decimalLike.isFinite === 'function' && typeof decimalLike.toFixed === 'function') return decimalLike.toString()
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, canonicalize(entry)])
    )
  }
  throw new Error(`Canonical JSON cannot hold a ${typeof value}`)
}

export const canonicalJson = (value: unknown) => JSON.stringify(canonicalize(value))
export const sha256 = (text: string | Uint8Array) => createHash('sha256').update(text).digest('hex')
export const payloadHash = (value: unknown) => sha256(canonicalJson(value))
export const toJsonValue = <T = unknown>(value: unknown) => canonicalize(value) as T
