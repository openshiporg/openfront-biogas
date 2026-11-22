/* Plain-word formatting shared by server and client screens. Money is always minor units + currency. */

const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'UGX', 'RWF', 'XOF', 'XAF', 'VND', 'CLP', 'PYG'])

export function money(amount: number | null | undefined, currency: string | null | undefined, opts: { whole?: boolean } = {}) {
  const code = (currency || 'USD').toUpperCase()
  const v = Number(amount ?? 0)
  const digits = ZERO_DECIMAL.has(code) ? 0 : 2
  const major = v / 10 ** digits
  const whole = opts.whole ?? Number.isInteger(major)
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: code, minimumFractionDigits: whole ? 0 : digits, maximumFractionDigits: whole ? 0 : digits }).format(major)
  } catch {
    return `${code} ${major.toFixed(whole ? 0 : digits)}`
  }
}

export function minorFromMajor(value: string, currency: string) {
  const digits = ZERO_DECIMAL.has((currency || 'USD').toUpperCase()) ? 0 : 2
  const n = Number(String(value).replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 10 ** digits) : 0
}

export function currencyDigits(currency: string) {
  return ZERO_DECIMAL.has((currency || 'USD').toUpperCase()) ? 0 : 2
}

export function date(value: string | Date | null | undefined, timeZone?: string, withTime = false) {
  if (!value) return ''
  const d = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const onlyDate = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  return new Intl.DateTimeFormat('en', {
    timeZone: onlyDate ? 'UTC' : timeZone || undefined,
    weekday: withTime ? undefined : undefined,
    day: 'numeric', month: 'short', year: 'numeric',
    ...(withTime && !onlyDate ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(d)
}

export function dayLabel(value: string) {
  const d = new Date(`${value}T12:00:00Z`)
  return new Intl.DateTimeFormat('en', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(d)
}

export const num = (v: unknown, max = 1) => {
  const n = Number(v ?? 0)
  if (!Number.isFinite(n)) return '0'
  return n.toLocaleString('en', { maximumFractionDigits: max })
}

export function months(n: number | null | undefined) {
  const v = Number(n ?? 0)
  if (!v) return ''
  if (v % 12 === 0) return v === 12 ? '1 year' : `${v / 12} years`
  return v === 1 ? '1 month' : `${v} months`
}

/** Every status a customer can see, in plain words. Unknown values are turned into sentence case. */
const STATUS: Record<string, string> = {
  // quote
  draft: 'Being prepared', pending_approval: 'Being prepared', approved: 'Being prepared', sent: 'Ready for you', viewed: 'Ready for you',
  accepted: 'Accepted', declined: 'Declined', expired: 'Expired', superseded: 'Replaced by a newer version', cancelled: 'Cancelled',
  // order
  pending_payment: 'Waiting for payment', awaiting_deposit: 'Waiting for deposit', confirmed: 'Confirmed', preparing: 'Being prepared', ready: 'Ready',
  shipped: 'On its way', out_for_install: 'Out for installation', delivered: 'Delivered', installed: 'Installed', completed: 'Completed', closed: 'Closed',
  // payments
  pending: 'Waiting', authorized: 'Card approved', captured: 'Paid', failed: 'Did not go through', submitted: 'Waiting for us to confirm your payment', awaiting_verification: 'Waiting for us to confirm your payment',
  verified: 'Confirmed', rejected: 'Not accepted', partially_refunded: 'Partly refunded', refunded: 'Refunded', unknown: 'Being checked',
  // plan and instalment
  active: 'Active', in_arrears: 'Behind on payments', defaulted: 'Overdue', settled_early: 'Paid off early', scheduled: 'Scheduled', due: 'Due now',
  partially_paid: 'Partly paid', overdue: 'Overdue', paid: 'Paid', waived: 'Waived',
  // visit
  requested: 'Requested', rescheduled: 'Rescheduled', en_route: 'On the way', on_site: 'On site', no_access: 'We could not get in',
  // installation
  awaiting_site_prep: 'Getting your site ready', ready_to_schedule: 'Ready to schedule', in_progress: 'In progress', commissioned: 'Working and handed over', on_hold: 'On hold',
  // system
  underperforming: 'Working, below par', not_working: 'Not working', inactive: 'Not in use', decommissioned: 'Removed',
  // ticket
  open: 'Received', triaged: 'Being looked at', phone_resolved: 'Fixed by phone', visit_scheduled: 'Visit booked', awaiting_customer_approval: 'Waiting for your approval',
  resolved: 'Fixed', reopened: 'Reopened',
  // subscription
  renewal_due: 'Renewal due', grace: 'Renewal overdue', lapsed: 'Lapsed', pending_payment_plan: 'Waiting for payment',
  // prep
  done: 'Done',
}

export function statusText(s: string | null | undefined) {
  if (!s) return ''
  return STATUS[s] ?? s.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
}

export type Tone = 'good' | 'wait' | 'bad' | 'plain'
export function statusTone(s: string | null | undefined): Tone {
  if (!s) return 'plain'
  if (['accepted', 'confirmed', 'captured', 'verified', 'paid', 'active', 'completed', 'commissioned', 'resolved', 'delivered', 'installed', 'done', 'phone_resolved', 'settled_early'].includes(s)) return 'good'
  if (['declined', 'expired', 'cancelled', 'failed', 'rejected', 'overdue', 'defaulted', 'in_arrears', 'not_working', 'lapsed', 'grace', 'no_access'].includes(s)) return 'bad'
  if (['draft', 'closed', 'superseded', 'waived', 'inactive', 'decommissioned'].includes(s)) return 'plain'
  return 'wait'
}

const WORDS: Record<string, string> = {
  prefab_bag: 'Prefabricated bag', prefab_tube: 'Prefabricated tube', prefab_tank: 'Prefabricated tank', fixed_dome: 'Fixed dome', floating_drum: 'Floating drum', container: 'Container system',
  cattle: 'Cattle', pig: 'Pigs', pigs: 'Pigs', poultry: 'Poultry', kitchen: 'Kitchen waste', human: 'Toilet waste', manure: 'Animal manure',
  digester_kit: 'Digester system', appliance: 'Appliance', part: 'Part', consumable: 'Consumable', service: 'Service',
  household: 'Home', farm: 'Farm', institution: 'Institution', home: 'Home',
  no_gas: 'No gas', low_pressure: 'Low gas pressure', smell: 'Gas smell', leak: 'Leak', stove_fault: 'Stove fault', slurry_overflow: 'Slurry overflow', other: 'Something else',
  reactor: 'Digester body', appliances: 'Stove and appliances', gas_line: 'Gas line', workmanship: 'Installation work',
  survey: 'Site survey', delivery: 'Delivery', install: 'Installation', commissioning: 'Hand-over and training', follow_up: 'Check-up', maintenance: 'Maintenance visit',
  yearly: 'a year', monthly: 'a month', weekly: 'a week',
  card: 'Card', mobile_money: 'Mobile money', bank_transfer: 'Bank transfer', cash: 'Cash',
  deposit: 'Deposit', full: 'Full payment', instalment: 'Instalment', balance: 'Balance', payoff: 'Pay off the plan', survey_fee: 'Survey fee', plan: 'Service plan', order_change: 'Order change',
  pickup: 'Pick up at a branch',
}
export const word = (s: string | null | undefined) => (s ? WORDS[s] ?? s.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()) : '')

export function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}
export function whatsappHref(phone: string) {
  return `https://wa.me/${phone.replace(/[^\d]/g, '')}`
}
