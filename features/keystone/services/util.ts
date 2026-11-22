import { DomainError, Codes } from '../lib/errors'

export const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
export const req = (v: unknown, field: string, max = 2000) => {
  const s = str(v, max)
  if (!s) throw new DomainError(Codes.INVALID_INPUT, `${field} is required.`)
  return s
}
export const int = (v: unknown, field: string, { min = 0, max = 1_000_000_000 } = {}) => {
  const n = typeof v === 'string' && /^-?\d+$/.test(v.trim()) ? Number(v) : v
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < min || n > max) throw new DomainError(Codes.INVALID_INPUT, `${field} must be a whole number from ${min} to ${max}.`)
  return n
}
export const optInt = (v: unknown, field: string, opts?: { min?: number; max?: number }) => (v === null || v === undefined || v === '' ? null : int(v, field, opts))
/** A decimal quantity as a string ("12.5"), or null. */
export const dec = (v: unknown, field: string) => {
  if (v === null || v === undefined || v === '') return null
  const s = String(v).trim()
  if (!/^-?\d{1,9}(\.\d{1,6})?$/.test(s)) throw new DomainError(Codes.INVALID_INPUT, `${field} must be a number.`)
  return s
}
export const normPhone = (v: unknown) => str(v, 40).replace(/[^\d+]/g, '')
export const normEmail = (v: unknown) => str(v, 200).toLowerCase()
export const oneOf = <T extends string>(v: unknown, values: readonly T[], field: string): T => {
  if (typeof v !== 'string' || !values.includes(v as T)) throw new DomainError(Codes.INVALID_INPUT, `${field} must be one of: ${values.join(', ')}.`)
  return v as T
}
export const notFound = (what: string): never => {
  throw new DomainError(Codes.NOT_FOUND, `${what} not found.`)
}
export const must = <T>(v: T | null | undefined, what: string): T => (v === null || v === undefined ? notFound(what) : v)
export const guard = (ok: unknown, message: string, code: keyof typeof Codes = 'GUARD_FAILED') => {
  if (!ok) throw new DomainError(Codes[code], message)
}
export const isUnique = (e: unknown) => (e as { code?: string })?.code === 'P2002'
export const n = (v: unknown) => Number(v ?? 0)
