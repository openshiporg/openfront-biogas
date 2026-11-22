import { q, company, viewer, requestTime } from '../../lib/server'
import { label, when } from '../../lib/format'
import { Page, Row, Section, Status, Tabs, Meta, Empty } from '../../components/ui'
import { CommandForm } from '../../components/CommandForm'

const VIEWS = [
  { key: 'open', label: 'Open', where: { status: { in: ['new', 'contacted', 'survey_scheduled', 'surveyed', 'quoted'] } } },
  { key: 'late', label: 'Late first contact', where: { status: { equals: 'new' }, firstContactAt: null } },
  { key: 'won', label: 'Won', where: { status: { equals: 'won' } } },
  { key: 'lost', label: 'Lost', where: { status: { in: ['lost', 'unqualified'] } } },
  { key: 'all', label: 'All', where: {} },
] as const
const BOARD = ['new', 'contacted', 'survey_scheduled', 'surveyed', 'quoted']
const SOURCES = ['phone', 'walk_in', 'field_agent', 'dealer', 'event', 'referral']
const INTERESTS = ['home', 'farm', 'institution', 'parts', 'service']

/** P2 leads board by status, late first contacts flagged; P3 add a lead by hand. */
export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams
  const view = VIEWS.find(v => v.key === sp.view) ?? VIEWS[0]
  const [co, me] = await Promise.all([company(), viewer()])
  const nowIso = new Date(requestTime()).toISOString()
  const where = view.key === 'late' ? { ...view.where, firstResponseDueAt: { lt: nowIso } } : view.where
  const d = await q<any>(`query($w: LeadWhereInput!, $n: DateTime!) {
    leads(where: $w, orderBy: [{ createdAt: desc }], take: 200) { id number status source interest firstResponseDueAt firstContactAt createdAt customer { name phone } site { city region } assignedTo { name } }
    late: leadsCount(where: { status: { equals: "new" }, firstContactAt: null, firstResponseDueAt: { lt: $n } })
  }`, { w: where, n: nowIso })
  const late = (l: any) => l.status === 'new' && !l.firstContactAt && l.firstResponseDueAt && l.firstResponseDueAt < nowIso
  const rows = (list: any[]) => list.map((l: any) => (
    <Row key={l.id} href={`/dashboard/platform/leads/${l.id}`}>
      <span>{l.number} · {l.customer?.name ?? ''} {late(l) ? <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">Late</span> : null}</span>
      <Meta>{label(l.interest)} · {label(l.source)} · {[l.site?.city, l.site?.region].filter(Boolean).join(', ')} · {l.assignedTo?.name ?? 'Unassigned'} · {when(l.createdAt, co.timezone)}</Meta>
      <Status value={l.status} />
    </Row>
  ))
  return (
    <Page title="Leads">
      <Tabs active={view.key} items={VIEWS.map(v => ({ key: v.key, label: v.label, href: `/dashboard/platform/leads?view=${v.key}`, count: v.key === 'late' ? d.late : undefined }))} />
      {me.can('canManageLeads') ? (
        <Section title="Add a lead">
          <CommandForm
            op="addLead" submit="Add lead" paths={['/dashboard/platform/leads']}
            nest={{ input: ['name', 'phone', 'email', 'source', 'interest', 'addressLine', 'city', 'region', 'postcode', 'country', 'message', 'referralCode'] }}
            fields={[
              { name: 'name', label: 'Name', required: true },
              { name: 'phone', label: 'Phone', kind: 'tel', width: 'sm' },
              { name: 'email', label: 'Email', kind: 'email' },
              { name: 'source', label: 'How they came', kind: 'select', options: SOURCES.map(s => ({ value: s, label: label(s) })), width: 'sm' },
              { name: 'interest', label: 'Interest', kind: 'select', options: INTERESTS.map(s => ({ value: s, label: label(s) })), width: 'sm' },
              { name: 'addressLine', label: 'Address' },
              { name: 'city', label: 'Town', width: 'sm' },
              { name: 'region', label: 'Region', width: 'sm' },
              { name: 'postcode', label: 'Postcode', width: 'sm' },
              { name: 'country', label: 'Country', width: 'sm', defaultValue: co.currencyCode === 'USD' ? 'US' : '' },
              { name: 'referralCode', label: 'Referred by (code)', width: 'sm' },
              { name: 'message', label: 'What they asked', width: 'lg' },
            ]}
          />
        </Section>
      ) : null}
      {view.key === 'open' ? BOARD.map(s => {
        const list = d.leads.filter((l: any) => l.status === s)
        return (
          <Section key={s} title={`${label(s)} · ${list.length}`}>
            {list.length ? rows(list) : <Empty>None.</Empty>}
          </Section>
        )
      }) : (
        <Section title={view.label}>{d.leads.length ? rows(d.leads) : <Empty>No leads here.</Empty>}</Section>
      )}
    </Page>
  )
}
