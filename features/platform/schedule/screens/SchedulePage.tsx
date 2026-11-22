import Link from 'next/link'
import { q, company, viewer, todayIso, plusDays } from '../../lib/server'
import { label, money } from '../../lib/format'
import { Page, Row, Section, Status, Meta, Empty } from '../../components/ui'
import { ActionButton } from '../../components/ActionButton'
import { CommandForm } from '../../components/CommandForm'
import { SlotPicker } from '../components/SlotPicker'

const VISIT = `id dueAt number type status version scheduledDate slotIndex windowStart windowEnd feeAmount feePaid publicCode
  customer { name phone } site { addressLine city } technicians { id name } lead { id number } installation { id number } ticket { id number } system { id number }`

/**
 * P22 the dispatcher's board: one day by technician, a week ahead, the visits waiting for a slot, moves and
 * cancellations, and technician days off. Free slots come from the same rule the storefront books against.
 */
export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams
  const [co, me] = await Promise.all([company(), viewer()])
  const today = todayIso(co.timezone)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? '') ? sp.date! : today
  const weekEnd = plusDays(date, 6)
  const d = await q<any>(`query($d: CalendarDay!, $e: CalendarDay!, $w: CalendarDay!, $due: DateTime!) {
    day: visits(where: { scheduledDate: { gte: $d, lt: $e }, status: { notIn: ["cancelled"] } }, orderBy: [{ slotIndex: asc }]) { ${VISIT} }
    week: visits(where: { scheduledDate: { gte: $d, lte: $w }, status: { notIn: ["cancelled"] } }, orderBy: [{ scheduledDate: asc }]) { id scheduledDate }
    waiting: visits(where: { status: { equals: "requested" }, OR: [{ dueAt: null }, { dueAt: { lte: $due } }] }, orderBy: [{ dueAt: asc }], take: 50) { ${VISIT} branch { id } }
    users(where: { isActive: { equals: true }, role: { canDoFieldWork: { equals: true } } }, orderBy: [{ name: asc }]) { id name branch { name } role { canManageSettings } }
    technicianTimeOffs(where: { date: { gte: $d, lte: $w } }, orderBy: [{ date: asc }]) { id date reason technician { id name } }
  }`, { d: date, e: plusDays(date, 1), w: weekEnd, due: `${plusDays(today, 30)}T23:59:59.000Z` })
  const techs = d.users.filter((u: any) => !u.role?.canManageSettings).map((u: any) => ({ id: u.id, name: u.name }))
  // Crews first, the owner last: the pickers list technicians in this order.
  const allTechs = [...techs, ...d.users.filter((u: any) => u.role?.canManageSettings).map((u: any) => ({ id: u.id, name: u.name }))]
  const canManage = me.can('canManageVisits')
  const fmt = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: co.timezone, hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
  const dayName = (x: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${x}T00:00:00Z`))
  const perDay = new Map<string, number>()
  for (const v of d.week) { const k = String(v.scheduledDate).slice(0, 10); perDay.set(k, (perDay.get(k) ?? 0) + 1) }
  const off = new Set(d.technicianTimeOffs.filter((t: any) => String(t.date).slice(0, 10) === date).map((t: any) => t.technician.id))
  const forTech = (id: string) => d.day.filter((v: any) => v.technicians.some((t: any) => t.id === id))
  const unassigned = d.day.filter((v: any) => !v.technicians.length)

  const visitRow = (v: any, move = true) => (
    <div key={v.id} className="space-y-1 border-b py-2 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link href={`/dashboard/platform/field/${v.id}`} className="min-w-0 break-words text-sm font-medium hover:underline">
          {v.windowStart ? `${fmt(v.windowStart)} ` : ''}{label(v.type)} · {v.customer?.name ?? ''}
        </Link>
        <Status value={v.status} />
      </div>
      <Meta>
        {v.number}{v.status === 'requested' && v.dueAt ? ` · due ${dayName(String(v.dueAt).slice(0, 10))}` : ''} · {[v.site?.addressLine, v.site?.city].filter(Boolean).join(', ')}
        {v.lead ? ` · ${v.lead.number}` : ''}{v.installation ? ` · ${v.installation.number}` : ''}{v.ticket ? ` · ${v.ticket.number}` : ''}{v.system ? ` · ${v.system.number}` : ''}
        {v.feeAmount ? ` · fee ${money(v.feeAmount, co.currencyCode)}${v.feePaid ? ' paid' : ' unpaid'}` : ''}
        {v.technicians.length > 1 ? ` · with ${v.technicians.map((t: any) => t.name).join(', ')}` : ''}
      </Meta>
      {canManage && move && ['requested', 'scheduled', 'rescheduled'].includes(v.status) ? (
        <div className="flex flex-wrap items-start gap-2">
          <SlotPicker visitId={v.id} expectedVersion={v.version} from={today} techs={allTechs} timezone={co.timezone} branchId={v.branch?.id} submit={v.status === 'requested' ? 'Book' : 'Move'} paths={['/dashboard/platform/schedule']} />
          <ActionButton op="cancelVisit" vars={{ visitId: v.id, expectedVersion: v.version }} ask="Why is this visit cancelled? The customer sees this." paths={['/dashboard/platform/schedule']} className="border">Cancel visit</ActionButton>
        </div>
      ) : null}
    </div>
  )

  return (
    <Page title="Schedule">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={`/dashboard/platform/schedule?date=${plusDays(date, -1)}`} className="rounded-md border px-2 py-1">←</Link>
        {Array.from({ length: 7 }, (_, i) => plusDays(date, i)).map(x => (
          <Link key={x} href={`/dashboard/platform/schedule?date=${x}`} className={x === date ? 'rounded-md bg-muted px-2 py-1 font-medium' : 'rounded-md px-2 py-1 text-muted-foreground hover:underline'}>
            {dayName(x)}{perDay.get(x) ? ` · ${perDay.get(x)}` : ''}
          </Link>
        ))}
        <Link href={`/dashboard/platform/schedule?date=${plusDays(date, 7)}`} className="rounded-md border px-2 py-1">→</Link>
        {date !== today ? <Link href="/dashboard/platform/schedule" className="text-muted-foreground underline">Today</Link> : null}
      </div>

      {d.waiting.length ? (
        <Section title={`Waiting for a slot (due within 30 days) · ${d.waiting.length}`}>
          {d.waiting.map((v: any) => visitRow(v))}
        </Section>
      ) : null}

      <Section title={dayName(date)}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {techs.map((t: any) => (
            <div key={t.id} className="rounded-lg border p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{t.name}</span>
                <Meta>{off.has(t.id) ? 'off' : `${forTech(t.id).length} visit(s)`}</Meta>
              </div>
              {forTech(t.id).map((v: any) => visitRow(v))}
              {!forTech(t.id).length && !off.has(t.id) ? <Meta>Nothing booked.</Meta> : null}
            </div>
          ))}
        </div>
        {d.day.filter((v: any) => v.technicians.length && !v.technicians.some((t: any) => techs.some((x: any) => x.id === t.id))).map((v: any) => visitRow(v))}
        {unassigned.map((v: any) => visitRow(v))}
        {!d.day.length ? <Empty>No visits on this day.</Empty> : null}
      </Section>

      {canManage ? (
        <Section title="Days off">
          {d.technicianTimeOffs.map((t: any) => (
            <Row key={t.id}>
              <span>{t.technician.name} · {dayName(String(t.date).slice(0, 10))}</span><Meta>{t.reason ?? ''}</Meta>
              <ActionButton op="removeTechnicianTimeOff" vars={{ id: t.id }} paths={['/dashboard/platform/schedule']}>Remove</ActionButton>
            </Row>
          ))}
          {!d.technicianTimeOffs.length ? <Meta>No days off this week.</Meta> : null}
          <CommandForm op="addTechnicianTimeOff" submit="Add day off" paths={['/dashboard/platform/schedule']}
            fields={[
              { name: 'technicianId', label: 'Technician', kind: 'select', required: true, width: 'md', options: allTechs.map((t: any) => ({ value: t.id, label: t.name })) },
              { name: 'date', label: 'Date', kind: 'date', required: true, width: 'md', defaultValue: date },
              { name: 'reason', label: 'Reason', width: 'md' },
            ]} />
          <Meta>A day off fails if the technician already has visits that day; move them first.</Meta>
        </Section>
      ) : null}
    </Page>
  )
}
