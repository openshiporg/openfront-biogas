import { q, company, viewer, todayIso, plusDays, requestTime } from '../../lib/server'
import { label, money } from '../../lib/format'
import { Page, Section, Meta, Empty, Stat } from '../../components/ui'

const DAY = 86400000
const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const hours = (h: number | null) => h === null ? '—' : h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} days`
const pct = (n: number, d: number) => d ? `${Math.round((n / d) * 100)}%` : '—'

function Bars({ rows, fmt = String }: { rows: { label: string; value: number }[]; fmt?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map(r => r.value))
  return (
    <div className="space-y-1.5">
      {rows.map(r => (
        <div key={r.label} className="grid grid-cols-[minmax(6rem,10rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-muted-foreground">{r.label}</span>
          <span className="h-2.5 rounded bg-muted"><span className="block h-2.5 rounded bg-emerald-600" style={{ width: `${(r.value / max) * 100}%` }} /></span>
          <span className="font-mono text-xs">{fmt(r.value)}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * P57: derived on read, nothing stored. Sales funnel, installs a month, share of systems working, time to first response
 * and to repair, arrears by age, stock value; CSV export of payments and invoices for the accountant.
 */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const sp = await searchParams
  const [co, me] = await Promise.all([company(), viewer()])
  if (!me.can('canReadReports')) return <Page title="Reports"><Empty>Your role cannot read reports. Ask the owner for report access.</Empty></Page>
  const now = requestTime()
  const days = [30, 90, 365].includes(Number(sp.days)) ? Number(sp.days) : 90
  const since = new Date(now - days * DAY).toISOString()
  const d = await q<any>(`query($since: DateTime!) {
    allLeads: leadsCount allTickets: serviceTicketsCount
    leads(where: { createdAt: { gte: $since } }, take: 5000) { status quotesCount }
    quotes(where: { createdAt: { gte: $since } }, take: 5000) { status }
    orders(where: { createdAt: { gte: $since } }, take: 5000) { status totalAmount }
    commissioned: installedSystems(where: { commissionedAt: { not: null } }, take: 5000) { commissionedAt }
    systems: installedSystems(where: { status: { notIn: ["decommissioned"] } }, take: 5000) { status lastCheckResult }
    tickets: serviceTickets(where: { createdAt: { gte: $since } }, take: 5000) { createdAt firstResponseAt resolvedAt }
    installments(where: { status: { notIn: ["paid", "waived", "cancelled"] }, dueDate: { lt: "${new Date(now).toISOString()}" } }, take: 5000) { dueDate amount paidAmount }
    stockLevels(take: 5000) { onHand product { unitCostAmount type } }
    payments(where: { receivedAt: { gte: $since }, status: { in: ["verified", "captured", "partially_refunded", "refunded"] } }, take: 10000) { amount refundedAmount method }
  }`, { since })

  const leadCount = d.leads.length
  const quoted = d.leads.filter((l: any) => l.quotesCount > 0).length
  const quotesSent = d.quotes.filter((x: any) => !['draft', 'pending_approval'].includes(x.status)).length
  const accepted = d.quotes.filter((x: any) => ['accepted', 'converted'].includes(x.status)).length
  const ordersLive = d.orders.filter((o: any) => o.status !== 'cancelled')
  const sales = ordersLive.reduce((t: number, o: any) => t + o.totalAmount, 0)

  const tz = co.timezone
  const month = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit' }).format(new Date(iso))
  const months: string[] = []
  for (let i = 11; i >= 0; i -= 1) { const dt = new Date(now); dt.setUTCDate(1); dt.setUTCMonth(dt.getUTCMonth() - i); months.push(month(dt.toISOString())) }
  const installs = months.map(m => ({ label: new Date(`${m}-15T00:00:00Z`).toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }), value: d.commissioned.filter((s: any) => month(s.commissionedAt) === m).length }))

  const sys: any[] = d.systems
  const working = sys.filter(s => ['active', 'commissioned'].includes(s.status)).length
  const byStatus = Object.entries(sys.reduce((m: Record<string, number>, s) => ({ ...m, [s.status]: (m[s.status] ?? 0) + 1 }), {})).map(([k, v]) => ({ label: label(k), value: v as number }))

  const firstResp = median(d.tickets.filter((t: any) => t.firstResponseAt).map((t: any) => (Date.parse(t.firstResponseAt) - Date.parse(t.createdAt)) / 3600000))
  const repair = median(d.tickets.filter((t: any) => t.resolvedAt).map((t: any) => (Date.parse(t.resolvedAt) - Date.parse(t.createdAt)) / 3600000))

  const buckets = [{ label: '1–30 days', max: 30 }, { label: '31–60 days', max: 60 }, { label: '61–90 days', max: 90 }, { label: 'Over 90 days', max: Infinity }]
  const arrears = buckets.map((b, i) => ({
    label: b.label,
    value: d.installments.filter((x: any) => { const age = (now - Date.parse(x.dueDate)) / DAY; return age > (i ? buckets[i - 1].max : 0) && age <= b.max }).reduce((t: number, x: any) => t + x.amount - x.paidAmount, 0),
  }))
  const arrearsTotal = arrears.reduce((t, a) => t + a.value, 0)

  const stockValue = d.stockLevels.reduce((t: number, l: any) => t + Math.max(0, l.onHand) * (l.product?.unitCostAmount ?? 0), 0)
  const byMethod = Object.entries(d.payments.reduce((m: Record<string, number>, p: any) => ({ ...m, [p.method]: (m[p.method] ?? 0) + p.amount - (p.refundedAmount ?? 0) }), {})).map(([k, v]) => ({ label: label(k), value: v as number }))
  const takings = byMethod.reduce((t, r) => t + r.value, 0)
  const today = todayIso(tz, new Date(now))
  const fmtMoney = (n: number) => money(n, co.currencyCode)

  return (
    <Page title="Reports">
      <div className="flex flex-wrap gap-3 text-sm">
        {[30, 90, 365].map(n => <a key={n} href={`/dashboard/platform/reports?days=${n}`} className={n === days ? 'font-medium underline' : 'text-muted-foreground hover:underline'}>Last {n} days</a>)}
      </div>

      <Section title={`Sales funnel · last ${days} days`}>
        <Bars rows={[{ label: 'Leads', value: leadCount }, { label: 'Leads quoted', value: quoted }, { label: 'Quotes sent', value: quotesSent }, { label: 'Quotes accepted', value: accepted }, { label: 'Orders', value: ordersLive.length }]} />
        {!d.allLeads ? <Meta>Leads and quotes are not visible to your role, so the first four rows read zero.</Meta> : null}
        <Meta>{pct(quoted, leadCount)} of leads got a quote · {pct(accepted, quotesSent)} of sent quotes were accepted · {fmtMoney(sales)} ordered</Meta>
      </Section>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat name="Systems working" value={`${pct(working, sys.length)} (${working} of ${sys.length})`} />
        <Stat name="Median first response" value={d.allTickets ? hours(firstResp) : 'Needs ticket access'} />
        <Stat name="Median time to repair" value={d.allTickets ? hours(repair) : 'Needs ticket access'} />
        <Stat name="Stock value at cost" value={fmtMoney(stockValue)} />
      </div>

      <Section title="Systems commissioned a month"><Bars rows={installs} /></Section>
      <Section title="Installed systems by status">{byStatus.length ? <Bars rows={byStatus} /> : <Empty>No systems yet.</Empty>}</Section>
      <Section title={`Arrears by age · ${fmtMoney(arrearsTotal)}`}>
        <Bars rows={arrears} fmt={fmtMoney} />
        <Meta>Unpaid instalments past their due date. Follow up from <a className="underline" href="/dashboard/platform/plans">Payment plans</a>.</Meta>
      </Section>
      <Section title={`Money in by method · last ${days} days · ${fmtMoney(takings)}`}>{byMethod.length ? <Bars rows={byMethod} fmt={fmtMoney} /> : <Empty>No verified payments in this period.</Empty>}</Section>

      <Section title="Export for the accountant">
        <form action="/dashboard/platform/reports/export" className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">What<select name="kind" className="h-9 rounded-md border bg-background px-3 text-sm"><option value="payments">Payments</option><option value="invoices">Invoices</option></select></label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">From<input type="date" name="from" defaultValue={plusDays(today, -days)} className="h-9 rounded-md border bg-background px-3 text-sm" /></label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">To<input type="date" name="to" defaultValue={today} className="h-9 rounded-md border bg-background px-3 text-sm" /></label>
          <button className="h-9 rounded-md border px-3 text-sm">Download CSV</button>
        </form>
      </Section>
    </Page>
  )
}
