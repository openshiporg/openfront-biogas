import Link from 'next/link'
import { q, company, viewer, todayIso, plusDays, requestTime } from '../../lib/server'
import { label, money, when } from '../../lib/format'
import { Page, Row, Section, Stat, Status, Meta, Empty } from '../../components/ui'

/** Runs one read; a list this role cannot see reads as null and its tile is left out. */
async function maybe<T>(query: string, variables: Record<string, unknown> = {}): Promise<T | null> {
  try { return await q<T>(query, variables) } catch { return null }
}

/** P1: today at a glance. Every count is derived from dates on read; nothing is precomputed. */
export default async function HomePage() {
  const [co, me] = await Promise.all([company(), viewer()])
  const now = new Date(requestTime())
  const today = todayIso(co.timezone, now)
  const dayStart = new Date(`${today}T00:00:00Z`)
  const nowIso = now.toISOString()
  const weekAhead = new Date(`${plusDays(today, 7)}T00:00:00Z`).toISOString()

  const [visits, lateLeads, tickets, toVerify, overdue, systems] = await Promise.all([
    maybe<any>(`query($d: CalendarDay!) { visits(where: { scheduledDate: { equals: $d }, status: { notIn: ["cancelled"] } }, orderBy: [{ slotIndex: asc }]) { id number type status windowStart customer { name } technicians { name } } }`, { d: today }),
    maybe<any>(`query($n: DateTime!) { leads(where: { status: { equals: "new" }, firstContactAt: null, firstResponseDueAt: { lt: $n } }, orderBy: [{ firstResponseDueAt: asc }], take: 8) { id number firstResponseDueAt customer { name } assignedTo { name } } leadsCount(where: { status: { equals: "new" }, firstContactAt: null, firstResponseDueAt: { lt: $n } }) }`, { n: nowIso }),
    maybe<any>(`query($n: DateTime!) { serviceTickets(where: { status: { in: ["open", "triaged", "visit_scheduled", "in_progress", "reopened", "awaiting_customer_approval"] }, responseDueAt: { lt: $n } }, orderBy: [{ responseDueAt: asc }], take: 8) { id number category status responseDueAt customer { name } } serviceTicketsCount(where: { status: { in: ["open", "triaged", "visit_scheduled", "in_progress", "reopened", "awaiting_customer_approval"] }, responseDueAt: { lt: $n } }) }`, { n: nowIso }),
    maybe<any>(`{ payments(where: { status: { equals: "submitted" } }, orderBy: [{ receivedAt: asc }], take: 8) { id amount currencyCode method reference receivedAt customer { name } collectedBy { name } } paymentsCount(where: { status: { equals: "submitted" } }) }`),
    maybe<any>(`query($s: DateTime!, $w: DateTime!) { overdue: installmentsCount(where: { status: { in: ["scheduled", "due", "partially_paid", "overdue"] }, dueDate: { lt: $s } }) dueSoon: installmentsCount(where: { status: { in: ["scheduled", "due", "partially_paid"] }, dueDate: { gte: $s, lt: $w } }) }`, { s: dayStart.toISOString(), w: weekAhead }),
    maybe<any>(`{ all: installedSystemsCount(where: { status: { notIn: ["decommissioned", "inactive"] } }) working: installedSystemsCount(where: { status: { in: ["commissioned", "active"] } }) }`),
  ])
  const share = systems && systems.all ? `${Math.round((systems.working / systems.all) * 100)}%` : '—'

  return (
    <Page title="Today">
      <p className="text-sm text-muted-foreground">{me.name ? `Signed in as ${me.name}. ` : ''}{when(now, co.timezone, 'date')}</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {visits ? <Stat name="Visits today" value={<Link href="/dashboard/platform/schedule" className="hover:underline">{visits.visits.length}</Link>} /> : null}
        {lateLeads ? <Stat name="Late first contacts" value={<Link href="/dashboard/platform/leads?view=late" className="hover:underline">{lateLeads.leadsCount}</Link>} /> : null}
        {tickets ? <Stat name="Tickets past target" value={<Link href="/dashboard/platform/tickets" className="hover:underline">{tickets.serviceTicketsCount}</Link>} /> : null}
        {toVerify ? <Stat name="Payments to verify" value={<Link href="/dashboard/platform/payments?view=verify" className="hover:underline">{toVerify.paymentsCount}</Link>} /> : null}
        {overdue ? <Stat name="Instalments overdue" value={<Link href="/dashboard/platform/plans?view=overdue" className="hover:underline">{overdue.overdue}</Link>} /> : null}
        {systems ? <Stat name="Systems working" value={<Link href="/dashboard/platform/systems" className="hover:underline">{share}</Link>} /> : null}
      </div>

      {visits ? (
        <Section title="Visits today">
          {visits.visits.length ? visits.visits.map((v: any) => (
            <Row key={v.id} href={`/dashboard/platform/field/${v.id}`}>
              <span>{v.number} · {label(v.type)} · {v.customer?.name ?? ''}</span>
              <Meta>{when(v.windowStart, co.timezone, 'time')} · {v.technicians.map((t: any) => t.name).join(', ') || 'Nobody assigned'}</Meta>
              <Status value={v.status} />
            </Row>
          )) : <Empty>No visits booked for today.</Empty>}
        </Section>
      ) : null}

      {lateLeads?.leads.length ? (
        <Section title="Late first contacts">
          {lateLeads.leads.map((l: any) => (
            <Row key={l.id} href={`/dashboard/platform/leads/${l.id}`}>
              <span>{l.number} · {l.customer?.name}</span>
              <Meta>due {when(l.firstResponseDueAt, co.timezone)} · {l.assignedTo?.name ?? 'Unassigned'}</Meta>
            </Row>
          ))}
        </Section>
      ) : null}

      {tickets?.serviceTickets.length ? (
        <Section title="Tickets past target">
          {tickets.serviceTickets.map((t: any) => (
            <Row key={t.id} href={`/dashboard/platform/tickets/${t.id}`}>
              <span>{t.number} · {label(t.category)} · {t.customer?.name}</span>
              <Meta>target {when(t.responseDueAt, co.timezone)}</Meta>
              <Status value={t.status} />
            </Row>
          ))}
        </Section>
      ) : null}

      {toVerify?.payments.length ? (
        <Section title="Payments to verify">
          {toVerify.payments.map((p: any) => (
            <Row key={p.id} href="/dashboard/platform/payments?view=verify">
              <span>{money(p.amount, p.currencyCode)} · {label(p.method)} · {p.reference}</span>
              <Meta>{p.customer?.name ?? ''}{p.collectedBy ? ` · taken by ${p.collectedBy.name}` : ''} · {when(p.receivedAt, co.timezone)}</Meta>
            </Row>
          ))}
        </Section>
      ) : null}
      {overdue ? <Meta>{overdue.dueSoon} instalment(s) fall due in the next 7 days.</Meta> : null}
    </Page>
  )
}
