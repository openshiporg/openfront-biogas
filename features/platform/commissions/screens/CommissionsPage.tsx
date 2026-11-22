import { q, company, viewer } from '../../lib/server'
import { money, when } from '../../lib/format'
import { Page, Row, Section, Status, Tabs, Meta, Empty, Stat } from '../../components/ui'
import { ActionButton } from '../../components/ActionButton'

const VIEWS = [
  { key: 'accrued', label: 'To approve', match: ['accrued'] },
  { key: 'approved', label: 'To pay', match: ['approved'] },
  { key: 'paid', label: 'Paid', match: ['paid'] },
  { key: 'clawed_back', label: 'Clawed back', match: ['clawed_back'] },
  { key: 'all', label: 'All', match: [] as string[] },
] as const
const PATH = '/dashboard/platform/commissions'

/**
 * P51: sales commissions. One accrues when an agent's order is commissioned; finance approves it, marks it paid with the
 * payroll run, or claws it back with a reason (a refund claws back on its own). Grouped by agent so a pay run is one look.
 */
export default async function CommissionsPage({ searchParams }: { searchParams: Promise<{ view?: string; agent?: string }> }) {
  const sp = await searchParams
  const view = VIEWS.find(v => v.key === sp.view) ?? VIEWS[0]
  const [co, me] = await Promise.all([company(), viewer()])
  if (!me.can('canManageCommissions')) {
    return <Page title="Commissions"><Empty>Your role cannot see commissions. Ask the owner for commission access.</Empty></Page>
  }
  const d = await q<any>(`{
    commissions(orderBy: [{ createdAt: desc }], take: 500) {
      id status version basisAmount amount currencyCode rule approvedAt paidAt clawedBackAt createdAt
      agent { id name } order { id number status customer { name } }
    }
  }`)
  const all: any[] = d.commissions
  const inView = view.match.length ? all.filter(c => (view.match as readonly string[]).includes(c.status)) : all
  const list = sp.agent ? inView.filter(c => c.agent?.id === sp.agent) : inView
  const count = (m: readonly string[]) => m.length ? all.filter(c => m.includes(c.status)).length : all.length
  const total = (m: string[]) => all.filter(c => m.includes(c.status)).reduce((t, c) => t + c.amount, 0)
  const agents = new Map<string, { name: string; amount: number; n: number }>()
  for (const c of inView) {
    const k = c.agent?.id ?? ''
    const a = agents.get(k) ?? { name: c.agent?.name ?? 'No agent', amount: 0, n: 0 }
    a.amount += c.amount; a.n += 1; agents.set(k, a)
  }

  return (
    <Page title="Commissions">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat name="To approve" value={money(total(['accrued']), co.currencyCode)} />
        <Stat name="To pay" value={money(total(['approved']), co.currencyCode)} />
        <Stat name="Paid" value={money(total(['paid']), co.currencyCode)} />
        <Stat name="Clawed back" value={money(total(['clawed_back']), co.currencyCode)} />
      </div>
      <Tabs active={view.key} items={VIEWS.map(v => ({ key: v.key, label: v.label, href: `${PATH}?view=${v.key}`, count: count(v.match) }))} />
      {agents.size > 1 || sp.agent ? (
        <div className="flex flex-wrap gap-3 text-sm">
          <a href={`${PATH}?view=${view.key}`} className={!sp.agent ? 'font-medium underline' : 'text-muted-foreground hover:underline'}>Every agent</a>
          {[...agents.entries()].map(([id, a]) => (
            <a key={id} href={`${PATH}?view=${view.key}&agent=${id}`} className={sp.agent === id ? 'font-medium underline' : 'text-muted-foreground hover:underline'}>{a.name} · {a.n} · {money(a.amount, co.currencyCode)}</a>
          ))}
        </div>
      ) : null}
      <Section title={`${view.label} · ${list.length} · ${money(list.reduce((t, c) => t + c.amount, 0), co.currencyCode)}`}>
        {list.length ? list.map(c => {
          const vars = { commissionId: c.id, expectedVersion: c.version }
          const rule = c.rule && typeof c.rule === 'object' ? c.rule : null
          return (
            <Row key={c.id}>
              <span className="space-y-0.5">
                <span className="block font-medium">{c.agent?.name ?? 'No agent'} · {money(c.amount, c.currencyCode)}</span>
                <Meta>
                  {c.order ? <a className="underline" href={`/dashboard/platform/orders/${c.order.id}`}>{c.order.number}</a> : 'No order'} {c.order?.customer?.name ?? ''}
                  {` · on ${money(c.basisAmount, c.currencyCode)}`}{rule?.name ? ` (${rule.name})` : ''}
                  {` · earned ${when(c.createdAt, co.timezone, 'date')}`}
                  {c.approvedAt ? ` · approved ${when(c.approvedAt, co.timezone, 'date')}` : ''}
                  {c.paidAt ? ` · paid ${when(c.paidAt, co.timezone, 'date')}` : ''}
                  {c.clawedBackAt ? ` · clawed back ${when(c.clawedBackAt, co.timezone, 'date')}` : ''}
                </Meta>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <Status value={c.status} />
                {c.status === 'accrued' ? <ActionButton op="approveCommission" vars={{ ...vars, action: 'approve' }} paths={[PATH]}>Approve</ActionButton> : null}
                {c.status === 'approved' ? <ActionButton op="approveCommission" vars={{ ...vars, action: 'mark_paid' }} paths={[PATH]} confirm={`Mark ${money(c.amount, c.currencyCode)} to ${c.agent?.name ?? 'the agent'} as paid?`}>Mark paid</ActionButton> : null}
                {['accrued', 'approved', 'paid'].includes(c.status) ? <ActionButton op="approveCommission" vars={{ ...vars, action: 'claw_back' }} paths={[PATH]} ask="Why is this commission clawed back?">Claw back</ActionButton> : null}
              </span>
            </Row>
          )
        }) : <Empty>{view.key === 'accrued' ? 'Nothing to approve. Commissions accrue when an agent\u2019s order is commissioned.' : 'None here.'}</Empty>}
      </Section>
      <p><Meta>A refund on an order claws its commission back on its own. Commission rules are under Settings, Plans and programmes.</Meta></p>
    </Page>
  )
}
