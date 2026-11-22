import { percentOf, percentToBps, splitEvenly } from '../lib/money'
import { DomainError, Codes } from '../lib/errors'
import type { Settings } from './settings'

/**
 * Integer money arithmetic for quote options, carts and orders (C06, C07). A line's total is
 * quantity × unit; discount and incentive lines are negative. Tax is one company rate, inclusive or
 * exclusive; discounts reduce the taxable base in proportion. All amounts are minor units.
 */
export type PriceLine = { kind: string; quantity: number; unitAmount: number; taxable: boolean }
export type PricedLine<T> = T & { totalAmount: number; taxAmount: number }
export type Priced<T> = { lines: PricedLine<T>[]; subtotalAmount: number; discountAmount: number; taxAmount: number; totalAmount: number }

const NEGATIVE = new Set(['discount', 'incentive'])

export function priceLines<T extends PriceLine>(lines: T[], settings: Pick<Settings, 'taxRatePercent' | 'taxInclusive'>): Priced<T> {
  for (const l of lines) {
    if (!Number.isSafeInteger(l.quantity) || l.quantity <= 0) throw new DomainError(Codes.INVALID_INPUT, 'Each line needs a quantity of at least 1.')
    if (!Number.isSafeInteger(l.unitAmount)) throw new DomainError(Codes.INVALID_INPUT, 'Prices are whole minor units.')
    if (NEGATIVE.has(l.kind) ? l.unitAmount > 0 : l.unitAmount < 0) throw new DomainError(Codes.INVALID_INPUT, `A ${l.kind} line has the wrong sign.`)
  }
  const totals = lines.map(l => l.quantity * l.unitAmount)
  const subtotalAmount = totals.filter(t => t > 0).reduce((a, b) => a + b, 0)
  const discountAmount = 0 - totals.filter(t => t < 0).reduce((a, b) => a + b, 0)
  if (discountAmount > subtotalAmount) throw new DomainError(Codes.INVALID_INPUT, 'Discounts cannot be more than the price.')
  const taxablePositive = lines.reduce((sum, l, i) => sum + (l.taxable && totals[i] > 0 ? totals[i] : 0), 0)
  // Discounts spread over taxable and non-taxable value in proportion.
  const taxableDiscount = subtotalAmount ? Math.floor((discountAmount * taxablePositive) / subtotalAmount) : 0
  const base = Math.max(0, taxablePositive - taxableDiscount)
  const bps = percentToBps(settings.taxRatePercent)
  const taxAmount = bps <= 0 ? 0 : settings.taxInclusive ? base - Math.floor((base * 10000 + Math.floor((10000 + bps) / 2)) / (10000 + bps)) : percentOf(base, settings.taxRatePercent)
  const net = subtotalAmount - discountAmount
  const totalAmount = settings.taxInclusive ? net : net + taxAmount
  // Tax shown per taxable positive line, remainder on the last such line.
  const taxable = lines.map((l, i) => (l.taxable && totals[i] > 0 ? totals[i] : 0))
  const shares = taxable.map(t => (taxablePositive ? Math.floor((taxAmount * t) / taxablePositive) : 0))
  const lastTaxable = taxable.map((t, i) => (t > 0 ? i : -1)).filter(i => i >= 0).pop()
  if (lastTaxable !== undefined) shares[lastTaxable] += taxAmount - shares.reduce((a, b) => a + b, 0)
  return { lines: lines.map((l, i) => ({ ...l, totalAmount: totals[i], taxAmount: shares[i] })), subtotalAmount, discountAmount, taxAmount, totalAmount }
}

/** Discount (not incentives) as basis points of the subtotal, for the approval rule (W3.3). */
export function discountBps(lines: { kind: string; quantity: number; unitAmount: number }[]) {
  const subtotal = lines.filter(l => l.unitAmount > 0).reduce((s, l) => s + l.quantity * l.unitAmount, 0)
  const discount = -lines.filter(l => l.kind === 'discount').reduce((s, l) => s + l.quantity * l.unitAmount, 0)
  return subtotal ? Math.ceil((discount * 10000) / subtotal) : 0
}

export type PlanTemplate = { id: string; name: string; kind: string; depositPercent: unknown; instalmentCount: number; frequency: string; planFeePercent: unknown; minOrderAmount: number; milestones: unknown }
export type ScheduleRow = { sequence: number; label: string; amount: number; trigger: 'on_order' | 'date' | 'on_delivery' | 'on_commissioning'; offset?: number }
export type PlanOffer = { templateId: string; label: string; kind: string; depositAmount: number; instalmentAmount: number; instalmentCount: number; frequency: string; planFeeAmount: number; totalAmount: number; schedule: ScheduleRow[] }

/** One payment plan offer for an option total. Instalments carry the plan fee spread evenly. */
export function planOffer(t: PlanTemplate, total: number): PlanOffer | null {
  if (total <= 0 || total < Number(t.minOrderAmount ?? 0)) return null
  if (t.kind === 'full' || (t.kind === 'instalments' && t.instalmentCount === 0)) {
    return { templateId: t.id, label: t.name, kind: 'full', depositAmount: total, instalmentAmount: 0, instalmentCount: 0, frequency: '', planFeeAmount: 0, totalAmount: total, schedule: [{ sequence: 0, label: 'Full payment', amount: total, trigger: 'on_order' }] }
  }
  if (t.kind === 'milestones') {
    const ms = (Array.isArray(t.milestones) ? t.milestones : []) as { label?: string; percent?: string | number; trigger?: string }[]
    const bpsList = ms.map(m => percentToBps(String(m.percent ?? 0)))
    if (!ms.length || bpsList.reduce((a, b) => a + b, 0) !== 10000) throw new DomainError(Codes.INVALID_INPUT, `Plan "${t.name}": milestone percentages must add up to 100.`)
    const amounts = bpsList.map(b => Math.floor((total * b) / 10000))
    amounts[amounts.length - 1] += total - amounts.reduce((a, b) => a + b, 0)
    const schedule = ms.map((m, i) => ({ sequence: i, label: m.label || `Milestone ${i + 1}`, amount: amounts[i], trigger: (['on_order', 'on_delivery', 'on_commissioning'].includes(String(m.trigger)) ? m.trigger : i === 0 ? 'on_order' : 'on_commissioning') as ScheduleRow['trigger'] }))
    if (schedule[0].trigger !== 'on_order') schedule[0].trigger = 'on_order'
    return { templateId: t.id, label: t.name, kind: 'milestones', depositAmount: amounts[0], instalmentAmount: 0, instalmentCount: ms.length - 1, frequency: '', planFeeAmount: 0, totalAmount: total, schedule }
  }
  const deposit = percentOf(total, String(t.depositPercent ?? 0))
  const financed = total - deposit
  const fee = percentOf(financed, String(t.planFeePercent ?? 0))
  const parts = splitEvenly(financed + fee, t.instalmentCount)
  const schedule: ScheduleRow[] = [
    { sequence: 0, label: 'Deposit', amount: deposit, trigger: 'on_order' },
    ...parts.map((amount, i) => ({ sequence: i + 1, label: `Instalment ${i + 1} of ${t.instalmentCount}`, amount, trigger: 'date' as const, offset: i + 1 })),
  ]
  return { templateId: t.id, label: t.name, kind: 'instalments', depositAmount: deposit, instalmentAmount: parts[0] ?? 0, instalmentCount: t.instalmentCount, frequency: t.frequency, planFeeAmount: fee, totalAmount: total + fee, schedule }
}

/** Incentive amount for a programme against an option (fixed, percent of the price, or by digester size), capped. */
export function incentiveAmount(p: { amountType: string; amountValue: string; capacityTable: unknown; capAmount: number | null }, priceAmount: number, capacityM3: number | null) {
  let amount = 0
  if (p.amountType === 'fixed') amount = Number.parseInt(p.amountValue || '0', 10) || 0
  else if (p.amountType === 'percent') amount = percentOf(priceAmount, p.amountValue || '0')
  else {
    const table = (Array.isArray(p.capacityTable) ? p.capacityTable : []) as { maxM3: number; amount: number }[]
    const row = [...table].sort((a, b) => a.maxM3 - b.maxM3).find(r => capacityM3 !== null && capacityM3 <= r.maxM3)
    amount = row ? Number(row.amount) : 0
  }
  if (p.capAmount !== null && p.capAmount !== undefined) amount = Math.min(amount, p.capAmount)
  return Math.max(0, Math.min(amount, priceAmount))
}
