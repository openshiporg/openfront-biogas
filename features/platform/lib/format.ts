/**
 * Display formatting. Money arrives as integers in minor units with a currency code; nothing here turns
 * money into a float for arithmetic, only for display.
 */

const SYMBOL: Record<string, string> = { USD: '$', KES: 'KSh ', INR: '₹', PKR: 'Rs ' }

/** 129000 + 'USD' → "$1,290.00". */
export function money(minor: number | string | null | undefined, currency = 'USD') {
  if (minor === null || minor === undefined || minor === '') return '—'
  const n = Number(minor)
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(Math.trunc(n))
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const cents = String(abs % 100).padStart(2, '0')
  return `${n < 0 ? '−' : ''}${SYMBOL[currency] ?? `${currency} `}${whole}.${cents}`
}

/** "1290.50" typed by staff → 129050 minor units, or null when it is not a number. */
export function toMinor(text: string): number | null {
  const t = text.trim().replace(/[,$\s]/g, '')
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return null
  const [w, f = ''] = t.replace('-', '').split('.')
  const v = Number(w) * 100 + Number(f.padEnd(2, '0'))
  return t.startsWith('-') ? -v : v
}

export function when(iso: string | Date | null | undefined, tz = 'America/Chicago', style: 'full' | 'time' | 'day' | 'date' = 'full') {
  if (!iso) return ''
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(d.getTime())) return ''
  const opts: Intl.DateTimeFormatOptions =
    style === 'time' ? { hour: 'numeric', minute: '2-digit' }
    : style === 'day' ? { weekday: 'short', month: 'short', day: 'numeric' }
    : style === 'date' ? { year: 'numeric', month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts }).format(d)
}

/** A stored date-only value ("2026-11-23T00:00:00.000Z") as "Mon, Nov 23", read in UTC so it never shifts a day. */
export function dayText(iso: string | null | undefined) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(iso))
}

const WORDS: Record<string, string> = {
  survey_scheduled: 'Survey booked', pending_approval: 'Awaiting approval', pending_payment: 'Awaiting payment', out_for_install: 'Out for install',
  awaiting_site_prep: 'Awaiting site prep', ready_to_schedule: 'Ready to schedule', on_hold: 'On hold', in_progress: 'In progress', en_route: 'On the way',
  on_site: 'On site', no_access: 'Nobody home', phone_resolved: 'Fixed by phone', visit_scheduled: 'Visit booked', awaiting_customer_approval: 'Awaiting customer',
  not_working: 'Not working', in_arrears: 'In arrears', settled_early: 'Settled early', partially_paid: 'Part paid', partially_refunded: 'Part refunded',
  partially_received: 'Part received', renewal_due: 'Renewal due', clawed_back: 'Clawed back', not_covered: 'Not covered', feasible_with_work: 'Feasible with work',
  not_feasible: 'Not feasible', digester_kit: 'Digester kit', follow_up: 'Follow-up', walk_in: 'Walk-in', field_agent: 'Field agent', mobile_money: 'Mobile money',
  bank_transfer: 'Bank transfer', low_pressure: 'Low pressure', no_gas: 'No gas', stove_fault: 'Stove fault', slurry_overflow: 'Slurry overflow', gas_line: 'Gas line',
  survey_fee: 'Survey fee', off_price_now: 'Off the price now', paid_to_customer_later: 'Paid to the customer later', carbon_discount: 'Carbon discount',
  transfer_out: 'Transfer out', transfer_in: 'Transfer in', in_stock: 'In stock', percent_of_order: '% of order', fixed_per_system: 'Fixed per system',
}

/** Stored code → words ("survey_scheduled" → "Survey booked"). */
export function label(value: string | null | undefined) {
  if (!value) return ''
  if (WORDS[value]) return WORDS[value]
  const s = value.replaceAll('_', ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** One-tap contact links (section 7): the system sends nothing; these open the staff member's own app. */
export function contactLinks(input: { phone?: string | null; email?: string | null; text?: string; subject?: string }) {
  const digits = (input.phone ?? '').replace(/[^\d+]/g, '')
  const text = encodeURIComponent(input.text ?? '')
  return {
    whatsapp: digits ? `https://wa.me/${digits.replace('+', '')}${text ? `?text=${text}` : ''}` : null,
    sms: digits ? `sms:${digits}${text ? `?&body=${text}` : ''}` : null,
    call: digits ? `tel:${digits}` : null,
    email: input.email ? `mailto:${input.email}?subject=${encodeURIComponent(input.subject ?? '')}&body=${text}` : null,
  }
}
