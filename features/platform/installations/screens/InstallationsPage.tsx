import { q, company } from '../../lib/server'
import { label, when } from '../../lib/format'
import { Page, Row, Status, Meta, Tabs, Empty } from '../../components/ui'

const STAGES = [
  { key: 'awaiting_site_prep', label: 'Getting ready' },
  { key: 'ready_to_schedule', label: 'Ready to book' },
  { key: 'scheduled', label: 'Booked' },
  { key: 'in_progress', label: 'Installing' },
  { key: 'installed', label: 'To commission' },
  { key: 'on_hold', label: 'On hold' },
  { key: 'commissioned', label: 'Commissioned' },
  { key: 'cancelled', label: 'Cancelled' },
]

/** P19 installations board by stage: get-ready progress, the booked visit, the order. */
export default async function InstallationsPage({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  const sp = await searchParams
  const stage = STAGES.some(s => s.key === sp.stage) ? sp.stage! : 'awaiting_site_prep'
  const co = await company()
  const counts = await q<any>(`{ ${STAGES.map(s => `${s.key}: installationsCount(where: { status: { equals: "${s.key}" } })`).join(' ')} }`)
  const d = await q<any>(`query($s: String!) {
    installations(where: { status: { equals: $s } }, orderBy: [{ targetDate: asc }], take: 100) {
      id number status targetDate holdReason customer { name } site { city } product { name } order { number }
      prepTasks { isRequired status } visits(where: { status: { notIn: ["cancelled"] } }, orderBy: [{ scheduledDate: desc }], take: 1) { number status scheduledDate technicians { name } }
    }
  }`, { s: stage })
  return (
    <Page title="Installations">
      <Tabs active={stage} items={STAGES.map(s => ({ key: s.key, label: s.label, href: `/dashboard/platform/installations?stage=${s.key}`, count: counts[s.key] }))} />
      {d.installations.map((i: any) => {
        const req = i.prepTasks.filter((t: any) => t.isRequired)
        const done = req.filter((t: any) => t.status !== 'pending').length
        const v = i.visits[0]
        return (
          <Row key={i.id} href={`/dashboard/platform/installations/${i.id}`}>
            <span>{i.number} · {i.customer?.name} · {i.product?.name}</span>
            <Meta>
              {i.order?.number}{i.site?.city ? ` · ${i.site.city}` : ''} · get ready {done}/{req.length}
              {i.targetDate ? ` · target ${when(`${i.targetDate}T12:00:00Z`, 'UTC', 'date')}` : ''}
              {v ? ` · ${v.number} ${v.scheduledDate ?? ''} ${v.technicians.map((t: any) => t.name).join(', ')}` : ''}
              {i.holdReason ? ` · held: ${i.holdReason}` : ''}
            </Meta>
            <Status value={i.status} />
          </Row>
        )
      })}
      {!d.installations.length ? <Empty>No installations {label(stage).toLowerCase()}.</Empty> : null}
    </Page>
  )
}
