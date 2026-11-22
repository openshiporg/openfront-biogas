/**
 * The time rule (section 4): no cron and no workers. A state that depends only on the clock is derived
 * from stored dates and now, shown as `effectiveStatus` and re-checked inside every mutation that depends on it.
 */
export const DAY = 86_400_000

export const addDays = (at: Date, days: number) => new Date(at.getTime() + days * DAY)
export const startOfDayUtc = (at: Date) => new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()))
export const isoDate = (at: Date) => at.toISOString().slice(0, 10)
export const dateOnly = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Dates are YYYY-MM-DD')
  return new Date(`${value}T00:00:00.000Z`)
}

/** Adds working days (Mon–Fri). */
export function addWorkingDays(at: Date, days: number) {
  const d = new Date(at)
  let left = days
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1)
    const wd = d.getUTCDay()
    if (wd !== 0 && wd !== 6) left -= 1
  }
  return d
}

export const addMonths = (at: Date, months: number) => {
  const d = new Date(at)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, last))
  return d
}

const OPEN_QUOTE = ['sent', 'viewed', 'approved', 'draft', 'pending_approval']
export function quoteEffectiveStatus(q: { status: string; validUntil: Date | string | null }, now: Date) {
  if (['sent', 'viewed'].includes(q.status) && q.validUntil && new Date(q.validUntil).getTime() < now.getTime()) return 'expired'
  return q.status
}
export const quoteIsOpen = (status: string) => OPEN_QUOTE.includes(status)

/** Instalment: scheduled → due on its date; overdue after the grace days. */
export function installmentEffectiveStatus(i: { status: string; dueDate: Date | string | null; amount: number; paidAmount: number }, now: Date, graceDays: number) {
  if (['paid', 'waived', 'cancelled'].includes(i.status)) return i.status
  if (!i.dueDate) return i.paidAmount > 0 ? 'partially_paid' : 'scheduled'
  const due = new Date(i.dueDate).getTime()
  if (now.getTime() < due) return i.paidAmount > 0 ? 'partially_paid' : 'scheduled'
  if (now.getTime() >= due + (graceDays + 1) * DAY) return 'overdue'
  return i.paidAmount > 0 ? 'partially_paid' : 'due'
}

export function daysLate(dueDate: Date | string | null, now: Date) {
  if (!dueDate) return 0
  return Math.max(0, Math.floor((now.getTime() - new Date(dueDate).getTime()) / DAY))
}

/** Plan: active → in_arrears while any instalment is overdue; defaulted when the oldest is late past the threshold. */
export function planEffectiveStatus(
  plan: { status: string },
  installments: { status: string; dueDate: Date | string | null; amount: number; paidAmount: number }[],
  now: Date,
  graceDays: number,
  defaultAfterDays: number
) {
  if (!['active', 'in_arrears'].includes(plan.status)) return plan.status
  const overdue = installments.filter(i => installmentEffectiveStatus(i, now, graceDays) === 'overdue')
  if (!overdue.length) return 'active'
  const worst = Math.max(...overdue.map(i => daysLate(i.dueDate, now)))
  return worst >= defaultAfterDays ? 'defaulted' : 'in_arrears'
}

/** Service plan subscription: renewal_due in the last 30 days, grace for 30 days after the end, then lapsed. */
export const SUBSCRIPTION_GRACE_DAYS = 30
export function subscriptionEffectiveStatus(s: { status: string; currentPeriodEnd: Date | string | null }, now: Date) {
  if (!['active', 'renewal_due'].includes(s.status) || !s.currentPeriodEnd) return s.status
  const end = new Date(s.currentPeriodEnd).getTime()
  if (now.getTime() < end - 30 * DAY) return 'active'
  if (now.getTime() < end) return 'renewal_due'
  if (now.getTime() < end + SUBSCRIPTION_GRACE_DAYS * DAY) return 'grace'
  return 'lapsed'
}
export const subscriptionGivesBenefits = (effective: string) => ['active', 'renewal_due'].includes(effective)

/** Lead: late when no first contact by its due time. */
export const leadIsLate = (l: { status: string; firstContactAt: Date | string | null; firstResponseDueAt: Date | string | null }, now: Date) =>
  l.status === 'new' && !l.firstContactAt && !!l.firstResponseDueAt && new Date(l.firstResponseDueAt).getTime() < now.getTime()

/** Ticket: past its response target while still open; reads closed after 7 quiet days resolved. */
export function ticketEffectiveStatus(t: { status: string; resolvedAt: Date | string | null }, now: Date) {
  if (t.status === 'resolved' && t.resolvedAt && now.getTime() >= new Date(t.resolvedAt).getTime() + 7 * DAY) return 'closed'
  return t.status
}
export const ticketPastTarget = (t: { status: string; responseDueAt: Date | string | null }, now: Date) =>
  ['open', 'triaged', 'visit_scheduled', 'in_progress', 'reopened', 'awaiting_customer_approval'].includes(t.status) && !!t.responseDueAt && new Date(t.responseDueAt).getTime() < now.getTime()

/** Payment session: pending past expiresAt reads expired. */
export const sessionEffectiveStatus = (s: { status: string; expiresAt: Date | string | null }, now: Date) =>
  s.status === 'pending' && s.expiresAt && new Date(s.expiresAt).getTime() < now.getTime() ? 'expired' : s.status

function tzOffsetMs(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(at)
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - Math.floor(at.getTime() / 1000) * 1000
}

/** The instant of `minutes` after local midnight on `day` (YYYY-MM-DD) in the company's time zone. */
export function zonedTime(day: string, minutes: number, timeZone: string) {
  const guess = dateOnly(day).getTime() + minutes * 60_000
  let tz = timeZone
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
  } catch {
    tz = 'UTC'
  }
  const first = tzOffsetMs(new Date(guess), tz)
  let at = guess - first
  const second = tzOffsetMs(new Date(at), tz)
  if (second !== first) at = guess - second
  return new Date(at)
}

/** Today's date (YYYY-MM-DD) in the company's time zone. */
export function localDay(at: Date, timeZone: string) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
  } catch {
    return isoDate(at)
  }
}

export const plusDays = (day: string, days: number) => isoDate(addDays(dateOnly(day), days))

/** The working day is 08:00 to 18:00, split evenly into the company's slots per technician. */
export function slotWindow(day: string, slotIndex: number, slotsPerDay: number, timeZone: string) {
  const length = Math.floor(600 / Math.max(1, slotsPerDay))
  const start = 8 * 60 + slotIndex * length
  return { windowStart: zonedTime(day, start, timeZone), windowEnd: zonedTime(day, start + length, timeZone) }
}
