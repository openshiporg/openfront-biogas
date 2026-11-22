import { DomainError, Codes } from './errors'

/** Money is an integer in minor units with a currency code; no floats anywhere in a calculation. */
export function toMinor(value: unknown, field = 'amount'): number {
  const n = typeof value === 'string' && /^-?\d+$/.test(value.trim()) ? Number(value.trim()) : value
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) throw new DomainError(Codes.INVALID_INPUT, `${field} must be a whole number of minor units.`)
  return n
}

export const positiveMinor = (value: unknown, field = 'amount') => {
  const n = toMinor(value, field)
  if (n <= 0) throw new DomainError(Codes.INVALID_INPUT, `${field} must be greater than zero.`)
  return n
}

/** amount × basis points / 10000, rounded half up, integers only. */
export function percentOf(amount: number, percent: number | string): number {
  const bps = percentToBps(percent)
  return Math.floor((amount * bps + 5000) / 10000)
}

/** "12.5" → 1250 basis points (exact; up to two decimals). */
export function percentToBps(percent: number | string): number {
  const text = String(percent ?? 0).trim()
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text)
  if (!match) throw new DomainError(Codes.INVALID_INPUT, 'A percentage has at most two decimals.')
  const bps = Number(match[2]) * 100 + Number((match[3] ?? '').padEnd(2, '0'))
  return match[1] ? -bps : bps
}

/** Split `total` into `count` parts that differ by at most one minor unit; the remainder goes to the last ones. */
export function splitEvenly(total: number, count: number): number[] {
  if (count <= 0) return []
  const base = Math.floor(total / count)
  const rest = total - base * count
  return Array.from({ length: count }, (_, i) => base + (i >= count - rest ? 1 : 0))
}

const DIGITS: Record<string, number> = { JPY: 0, KRW: 0, UGX: 0 }
export const minorDigits = (currency: string) => DIGITS[currency] ?? 2

export function formatMoney(amount: number | null | undefined, currency = 'USD') {
  const digits = minorDigits(currency)
  const value = Number(amount ?? 0) / 10 ** digits
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
  } catch {
    return `${currency} ${value.toFixed(digits)}`
  }
}
