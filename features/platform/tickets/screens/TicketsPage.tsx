import { q, company, viewer } from '../../lib/server'
import { label, when } from '../../lib/format'
import { Page, Row, Section, Status, Tabs, Meta, Empty } from '../../components/ui'
import { CommandForm } from '../../components/CommandForm'

const VIEWS = [
  { key: 'open', label: 'Open', status: ['open', 'reopened', 'triaged'] },
  { key: 'work', label: 'Visit or quote', status: ['visit_scheduled', 'awaiting_customer_approval', 'in_progress'] },
  { key: 'resolved', label: 'Resolved', status: ['resolved', 'phone_resolved'] },
  { key: 'closed', label: 'Closed', status: ['closed', 'cancelled'] },
]
const CATEGORIES = ['no_gas', 'low_pressure', 'smell', 'leak', 'stove_fault', 'slurry_overflow', 'other']

/** P37 ticket queue by status, past the response target on top; P38 open a ticket for a customer who phoned. */
export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ view?: string; new?: string }> }) {
  const sp = await searchParams
  const view = VIEWS.find(v => v.key === sp.view) ?? VIEWS[0]
  const [co, me] = await Promise.all([company(), viewer()])
  const d = await q<any>(`query($s: [String!]) {
    serviceTickets(where: { status: { in: $s } }, orderBy: [{ responseDueAt: asc }], take: 200) {
      id number status effectiveStatus pastTarget category severity channel description responseDueAt firstResponseAt createdAt warrantyDecision
      customer { name } system { number } assignedTo { name }
    }
    ${VIEWS.map(v => `${v.key}: serviceTicketsCount(where: { status: { in: ${JSON.stringify(v.status)} } })`).join('\n')}
  }`, { s: view.status })
  const pre = sp.new ? (await q<any>(`query($id: ID!) { installedSystem(where: { id: $id }) { id number customer { id name phone } } }`, { id: sp.new })).installedSystem : null
  const customers = me.can('canManageTickets') && !pre ? (await q<any>(`{ installedSystems(where: { status: { notIn: ["decommissioned"] } }, orderBy: [{ number: asc }], take: 500) { id number customer { name } } }`)).installedSystems : []
  // Past the response target first, then urgent, then by due time.
  const rows = [...d.serviceTickets].sort((a: any, b: any) => Number(b.pastTarget) - Number(a.pastTarget) || Number(b.severity === 'urgent') - Number(a.severity === 'urgent'))
  return (
    <Page title="Tickets">
      <Tabs active={view.key} items={VIEWS.map(v => ({ key: v.key, label: v.label, href: `/dashboard/platform/tickets?view=${v.key}`, count: d[v.key] }))} />
      {me.can('canManageTickets') ? (
        <Section title={pre ? `New ticket for ${pre.number} · ${pre.customer?.name}` : 'A customer phoned'}>
          <CommandForm op="staffCreateTicket" submit="Open ticket" paths={['/dashboard/platform/tickets']}
            nest={{ input: { fields: ['systemId', 'category', 'severity', 'description', 'callbackPhone'] } }}
            fields={[
              pre ? { name: 'systemId', label: 'System', kind: 'hidden', defaultValue: pre.id }
                : { name: 'systemId', label: 'System', kind: 'select', required: true, width: 'lg', options: [{ value: '', label: 'Pick the system…' }, ...customers.map((s: any) => ({ value: s.id, label: `${s.number} · ${s.customer?.name ?? ''}` }))] },
              { name: 'category', label: 'Problem', kind: 'select', required: true, width: 'md', options: CATEGORIES.map(c => ({ value: c, label: label(c) })) },
              { name: 'severity', label: 'Severity', kind: 'select', width: 'sm', options: [{ value: 'normal', label: 'Normal' }, { value: 'urgent', label: 'Urgent' }] },
              { name: 'description', label: 'What they said', required: true, width: 'lg' },
              { name: 'callbackPhone', label: 'Call back on', kind: 'tel', width: 'md', defaultValue: pre?.customer?.phone ?? '' },
            ]} />
        </Section>
      ) : null}
      <Section title={view.label}>
        {rows.map((t: any) => (
          <Row key={t.id} href={`/dashboard/platform/tickets/${t.id}`}>
            <span>{t.number} · {t.customer?.name} · {label(t.category)}{t.severity === 'urgent' ? ' · urgent' : ''}</span>
            <Meta>
              {t.system?.number ?? 'no system'} · {label(t.channel)} · {when(t.createdAt, co.timezone)}
              {t.pastTarget ? ' · past response target' : t.responseDueAt && !t.firstResponseAt ? ` · answer by ${when(t.responseDueAt, co.timezone)}` : ''}
              {t.assignedTo ? ` · ${t.assignedTo.name}` : ''} · warranty {label(t.warrantyDecision)}
            </Meta>
            <Status value={t.effectiveStatus ?? t.status} />
          </Row>
        ))}
        {!rows.length ? <Empty>No tickets here.</Empty> : null}
      </Section>
    </Page>
  )
}
