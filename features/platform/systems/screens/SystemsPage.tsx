import Link from 'next/link'
import { q, company, todayIso, plusDays } from '../../lib/server'
import { label, when } from '../../lib/format'
import { Page, Row, Section, Status, Tabs, Meta, Empty } from '../../components/ui'

const VIEWS = [
  { key: 'attention', label: 'Needs attention', status: ['underperforming', 'not_working'] },
  { key: 'working', label: 'Working', status: ['commissioned', 'active'] },
  { key: 'followups', label: 'Follow-ups due', status: [] },
  { key: 'map', label: 'Map', status: ['commissioned', 'active', 'underperforming', 'not_working'] },
  { key: 'off', label: 'Inactive and decommissioned', status: ['inactive', 'decommissioned'] },
]
const DOT: Record<string, string> = { commissioned: '#10b981', active: '#10b981', underperforming: '#f59e0b', not_working: '#dc2626' }

/** P32 installed systems by status with a map of sites; P34 follow-ups due and their results. */
export default async function SystemsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams
  const view = VIEWS.find(v => v.key === sp.view) ?? VIEWS[0]
  const co = await company()
  const today = todayIso(co.timezone)
  const due = `${plusDays(today, 14)}T23:59:59.000Z`
  const d = await q<any>(`query($s: [String!], $due: DateTime!, $f: Boolean!) {
    installedSystems(where: { status: { in: $s } }, orderBy: [{ commissionedAt: desc }], take: 300) @skip(if: $f) {
      id number status statusReason commissionedAt lastCheckedAt lastCheckResult nextCheckDueAt customer { name } site { city lat lng } product { name }
      tickets(where: { status: { notIn: ["resolved", "closed", "cancelled"] } }) { number }
    }
    followups: visits(where: { type: { equals: "follow_up" }, status: { in: ["requested", "scheduled", "rescheduled"] }, dueAt: { lte: $due } }, orderBy: [{ dueAt: asc }], take: 100) @include(if: $f) {
      id number status dueAt scheduledDate customer { name phone } system { id number product { name } commissionedAt } technicians { name }
    }
    done: visits(where: { type: { equals: "follow_up" }, status: { in: ["completed", "no_access"] } }, orderBy: [{ checkOutAt: desc }], take: 20) @include(if: $f) {
      id number status checkOutAt outcome system { id number } readings { working cookingHours problem }
    }
    ${VIEWS.filter(v => v.status.length && v.key !== 'map').map(v => `${v.key}: installedSystemsCount(where: { status: { in: ${JSON.stringify(v.status)} } })`).join('\n')}
    followupsCount: visitsCount(where: { type: { equals: "follow_up" }, status: { in: ["requested", "scheduled", "rescheduled"] }, dueAt: { lte: $due } })
  }`, { s: view.status, due, f: view.key === 'followups' })
  const counts: Record<string, number> = { ...d, followups: d.followupsCount }
  const pts = (d.installedSystems ?? []).filter((s: any) => s.site?.lat && s.site?.lng).map((s: any) => ({ ...s, x: Number(s.site.lng), y: Number(s.site.lat) }))
  const [minX, maxX, minY, maxY] = pts.length ? [Math.min(...pts.map((p: any) => p.x)), Math.max(...pts.map((p: any) => p.x)), Math.min(...pts.map((p: any) => p.y)), Math.max(...pts.map((p: any) => p.y))] : [0, 1, 0, 1]
  const W = 900, H = 520, pad = 40
  const sx = (x: number) => pad + ((x - minX) / (maxX - minX || 1)) * (W - 2 * pad)
  const sy = (y: number) => H - pad - ((y - minY) / (maxY - minY || 1)) * (H - 2 * pad)
  return (
    <Page title="Systems">
      <Tabs active={view.key} items={VIEWS.map(v => ({ key: v.key, label: v.label, href: `/dashboard/platform/systems?view=${v.key}`, count: v.key === 'map' ? undefined : counts[v.key] }))} />
      {view.key === 'followups' ? (
        <>
          <Section title="Due in the next 14 days or late">
            {d.followups.map((v: any) => (
              <Row key={v.id} href={v.system ? `/dashboard/platform/systems/${v.system.id}` : undefined}>
                <span>{v.system?.number} · {v.customer?.name} · {v.system?.product?.name}</span>
                <Meta>{v.number} · due {when(v.dueAt, co.timezone, 'date')}{v.scheduledDate ? ` · booked ${v.scheduledDate} ${v.technicians.map((t: any) => t.name).join(', ')}` : ' · not booked'}{v.dueAt < `${today}T00:00:00Z` ? ' · late' : ''}</Meta>
                <Status value={v.status} />
              </Row>
            ))}
            {!d.followups.length ? <Empty>No follow-ups due.</Empty> : null}
            <Meta>Book them on the <Link className="underline" href="/dashboard/platform/schedule">schedule</Link>, or log a check-up call on the system.</Meta>
          </Section>
          <Section title="Latest results">
            {d.done.map((v: any) => (
              <Row key={v.id} href={v.system ? `/dashboard/platform/systems/${v.system.id}` : undefined}>
                <span>{v.system?.number} · {v.number}</span>
                <Meta>{v.checkOutAt ? when(v.checkOutAt, co.timezone, 'date') : ''} · {v.readings[0] ? `${v.readings[0].working ? 'working' : 'not working'}${v.readings[0].cookingHours ? ` · ${v.readings[0].cookingHours} h cooking` : ''}${v.readings[0].problem ? ` · ${v.readings[0].problem}` : ''}` : label(v.outcome ?? v.status)}</Meta>
                <Status value={v.status} />
              </Row>
            ))}
            {!d.done.length ? <Empty>No follow-ups done yet.</Empty> : null}
          </Section>
        </>
      ) : view.key === 'map' ? (
        <Section title={`${pts.length} sites with a location`}>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-md border bg-muted/30" role="img" aria-label="Map of installed systems">
            {pts.map((p: any) => (
              <a key={p.id} href={`/dashboard/platform/systems/${p.id}`}>
                <circle cx={sx(p.x)} cy={sy(p.y)} r={7} fill={DOT[p.status] ?? '#6b7280'} stroke="#fff" strokeWidth={2}><title>{`${p.number} · ${p.customer?.name} · ${label(p.status)}`}</title></circle>
                <text x={sx(p.x) + 10} y={sy(p.y) + 4} fontSize={12} fill="currentColor">{p.number} {p.site.city ?? ''}</text>
              </a>
            ))}
          </svg>
          <Meta>Green working · amber underperforming · red not working. Click a dot to open the system.</Meta>
        </Section>
      ) : (
        <Section title={view.label}>
          {d.installedSystems.map((s: any) => (
            <Row key={s.id} href={`/dashboard/platform/systems/${s.id}`}>
              <span>{s.number} · {s.customer?.name} · {s.product?.name}</span>
              <Meta>
                {s.site?.city ?? ''}{s.commissionedAt ? ` · since ${when(s.commissionedAt, co.timezone, 'date')}` : ''}
                {s.lastCheckedAt ? ` · checked ${when(s.lastCheckedAt, co.timezone, 'date')}` : ''}{s.nextCheckDueAt ? ` · next check ${when(s.nextCheckDueAt, co.timezone, 'date')}` : ''}
                {s.tickets.length ? ` · open ${s.tickets.map((t: any) => t.number).join(', ')}` : ''}{s.statusReason ? ` · ${s.statusReason}` : ''}
              </Meta>
              <Status value={s.status} />
            </Row>
          ))}
          {!d.installedSystems.length ? <Empty>No systems here.</Empty> : null}
        </Section>
      )}
    </Page>
  )
}
