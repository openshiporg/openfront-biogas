import Link from 'next/link'
import { q, company, viewer, todayIso, plusDays } from '../../lib/server'
import { label } from '../../lib/format'
import { Page, Section, Status, Meta, Empty } from '../../components/ui'

const VISIT = `id number type status scheduledDate windowStart windowEnd customer { name phone } site { addressLine city lat lng } technicians { name } system { number } installation { number } ticket { number }`

/** P24 my day: the technician's visits today in time order with a map link each, then the next days. */
export default async function FieldTodayPage() {
  const [co, me] = await Promise.all([company(), viewer()])
  const today = todayIso(co.timezone)
  const mine = { technicians: { some: { id: { equals: me.id } } } }
  const d = await q<any>(`query($t: CalendarDay!, $n: CalendarDay!, $w: VisitWhereInput!, $u: VisitWhereInput!) {
    today: visits(where: { AND: [$w, { scheduledDate: { equals: $t } }] }, orderBy: [{ slotIndex: asc }]) { ${VISIT} }
    next: visits(where: { AND: [$w, { scheduledDate: { gt: $t, lte: $n } }, { status: { in: ["scheduled", "rescheduled"] } }] }, orderBy: [{ scheduledDate: asc }, { slotIndex: asc }]) { ${VISIT} }
    open: visits(where: { AND: [$u, { status: { in: ["en_route", "on_site"] } }, { NOT: [{ scheduledDate: { equals: $t } }] }] }) { ${VISIT} }
  }`, { t: today, n: plusDays(today, 7), w: mine, u: mine })
  const fmt = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: co.timezone, hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
  const dayName = (x: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${x}T00:00:00Z`))
  const card = (v: any, showDay = false) => {
    const addr = [v.site?.addressLine, v.site?.city].filter(Boolean).join(', ')
    const map = v.site?.lat && v.site?.lng ? `https://www.google.com/maps/dir/?api=1&destination=${v.site.lat},${v.site.lng}` : addr ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}` : ''
    return (
      <div key={v.id} className="space-y-2 rounded-lg border p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Link href={`/dashboard/platform/field/${v.id}`} className="text-base font-medium hover:underline">
            {showDay ? `${dayName(String(v.scheduledDate))} ` : ''}{v.windowStart ? `${fmt(v.windowStart)}–${fmt(v.windowEnd)}` : ''} · {label(v.type)}
          </Link>
          <Status value={v.status} />
        </div>
        <p className="text-sm">{v.customer?.name ?? ''}{addr ? ` · ${addr}` : ''}</p>
        <Meta>{v.number}{v.system ? ` · ${v.system.number}` : ''}{v.installation ? ` · ${v.installation.number}` : ''}{v.ticket ? ` · ${v.ticket.number}` : ''}{v.technicians.length > 1 ? ` · with ${v.technicians.map((t: any) => t.name).join(', ')}` : ''}</Meta>
        <div className="flex flex-wrap gap-2">
          <Link href={`/dashboard/platform/field/${v.id}`} className="rounded-md border px-3 py-2 text-sm font-medium">Open</Link>
          {v.customer?.phone ? <a href={`tel:${v.customer.phone}`} className="rounded-md border px-3 py-2 text-sm">Call</a> : null}
          {map ? <a href={map} target="_blank" rel="noreferrer" className="rounded-md border px-3 py-2 text-sm">Directions</a> : null}
        </div>
      </div>
    )
  }
  return (
    <Page title={`My day · ${dayName(today)}`}>
      {d.open.length ? <Section title="In progress">{d.open.map((v: any) => card(v, true))}</Section> : null}
      <Section title={`Today · ${d.today.length}`}>
        <div className="space-y-3">{d.today.map((v: any) => card(v))}</div>
        {!d.today.length ? <Empty>No visits today.</Empty> : null}
      </Section>
      <Section title="Next 7 days">
        <div className="space-y-3">{d.next.map((v: any) => card(v, true))}</div>
        {!d.next.length ? <Empty>Nothing booked yet.</Empty> : null}
      </Section>
    </Page>
  )
}
