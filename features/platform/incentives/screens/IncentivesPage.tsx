import { q, company, viewer } from '../../lib/server'
import { label, money, when } from '../../lib/format'
import { Page, Row, Section, Status, Tabs, Meta, Empty, Stat } from '../../components/ui'
import { ActionButton } from '../../components/ActionButton'
import { CommandForm } from '../../components/CommandForm'
import { AttachDocument } from '../components/AttachDocument'
import { incentiveAmount } from '@/features/keystone/services/pricing'

const VIEWS = [
  { key: 'draft', label: 'Drafts', match: ['draft'] },
  { key: 'submitted', label: 'Submitted', match: ['submitted'] },
  { key: 'approved', label: 'Approved, not paid', match: ['approved'] },
  { key: 'closed', label: 'Paid, rejected or withdrawn', match: ['paid', 'rejected', 'withdrawn'] },
  { key: 'all', label: 'All', match: [] as string[] },
] as const
const PATH = '/dashboard/platform/incentives'

/** What the programme pays on an order, by the same rule quotes use (fixed, share of the price, or by digester size; capped). */
function suggested(program: any, order: any) {
  const capacity = order.lines?.map((l: any) => Number(l.product?.digesterSpec?.capacityM3)).find((n: number) => Number.isFinite(n) && n > 0) ?? null
  return incentiveAmount(program, order.totalAmount, capacity)
}

/**
 * P49: grant, subsidy and rebate applications. Open one for an order, attach the documents the programme asks for,
 * submit with the programme's reference, record its decision and mark it paid. Every move goes through
 * transitionIncentiveApplication (compare-and-set and an audit row); a rejection follows the company's policy.
 */
export default async function IncentivesPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams
  const view = VIEWS.find(v => v.key === sp.view) ?? VIEWS[0]
  const [co, me] = await Promise.all([company(), viewer()])
  if (!me.can('canManageIncentives')) {
    return <Page title="Incentives"><Empty>Your role cannot work on incentive applications. Ask the owner for incentive access.</Empty></Page>
  }
  const d = await q<any>(`{
    incentiveApplications(orderBy: [{ createdAt: desc }], take: 300) {
      id status version amount currencyCode treatment reference submittedAt decidedAt paidAt notes rejectionHandling createdAt
      program { id name kind requiredDocuments infoUrl } customer { id name phone } order { id number totalAmount plan { id } }
      media { id caption kind url file { url filename } }
    }
    incentivePrograms(where: { isActive: { equals: true } }, orderBy: [{ name: asc }]) { id name kind treatment amountType amountValue capacityTable capAmount requiredDocuments infoUrl }
    orders(where: { status: { notIn: ["cancelled", "draft"] } }, orderBy: [{ createdAt: desc }], take: 60) {
      id number totalAmount currencyCode customer { id name } lines { product { digesterSpec { capacityM3 } } } incentiveApplications { id program { id } status }
    }
    companySettings { incentiveRejectionPolicy }
  }`)
  const apps: any[] = d.incentiveApplications
  const list = view.match.length ? apps.filter(a => (view.match as readonly string[]).includes(a.status)) : apps
  const count = (m: readonly string[]) => m.length ? apps.filter(a => m.includes(a.status)).length : apps.length
  const programs: any[] = d.incentivePrograms
  const policy = ['final_instalment', 'add_final_instalment'].includes(d.companySettings?.incentiveRejectionPolicy) ? 'final_instalment' : 'absorb'
  const sum = (m: string[]) => apps.filter(a => m.includes(a.status)).reduce((t, a) => t + a.amount, 0)
  const openable = d.orders.filter((o: any) => o.customer && programs.some(p => !o.incentiveApplications.some((a: any) => a.program?.id === p.id && a.status !== 'withdrawn')))

  return (
    <Page title="Incentives">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat name="Drafts" value={count(['draft'])} />
        <Stat name="Waiting on the programme" value={money(sum(['submitted']), co.currencyCode)} />
        <Stat name="Approved, not paid" value={money(sum(['approved']), co.currencyCode)} />
        <Stat name="Paid" value={money(sum(['paid']), co.currencyCode)} />
      </div>
      <Tabs active={view.key} items={VIEWS.map(v => ({ key: v.key, label: v.label, href: `${PATH}?view=${v.key}`, count: count(v.match) }))} />

      <Section title={`${view.label} · ${list.length}`}>
        {list.length ? list.map(a => {
          const required: string[] = Array.isArray(a.program?.requiredDocuments) ? a.program.requiredDocuments : []
          const have = new Set(a.media.map((m: any) => m.caption))
          const missing = required.filter(r => !have.has(r))
          const short = Math.max(0, required.length - a.media.length)
          const vars = { applicationId: a.id, expectedVersion: a.version }
          return (
            <div key={a.id} className="space-y-2 border-b py-3 last:border-b-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{a.program?.name ?? 'Programme'} · {a.customer?.name ?? ''} · {money(a.amount, a.currencyCode)}</span>
                <Status value={a.status} />
              </div>
              <Meta>
                {a.order ? <a className="underline" href={`/dashboard/platform/orders/${a.order.id}`}>{a.order.number}</a> : 'No order'}
                {' · '}{a.treatment === 'paid_to_customer_later' ? 'paid to the customer by the programme' : 'taken off the price now'}
                {a.reference ? ` · reference ${a.reference}` : ''}
                {a.submittedAt ? ` · submitted ${when(a.submittedAt, co.timezone, 'date')}` : ` · opened ${when(a.createdAt, co.timezone, 'date')}`}
                {a.decidedAt ? ` · decided ${when(a.decidedAt, co.timezone, 'date')}` : ''}
                {a.paidAt ? ` · paid ${when(a.paidAt, co.timezone, 'date')}` : ''}
                {a.status === 'rejected' && a.rejectionHandling ? ` · ${a.rejectionHandling === 'final_instalment' ? 'added back as a final instalment' : 'absorbed by the company'}` : ''}
              </Meta>
              {a.notes ? <p className="whitespace-pre-line text-xs text-muted-foreground">{a.notes}</p> : null}

              <div className="space-y-1">
                <Meta>Documents {a.media.length} of {required.length || a.media.length}{required.length ? ` asked (${required.join(', ')})` : ''}</Meta>
                {a.media.map((m: any) => {
                  const href = m.file?.url || m.url
                  return <div key={m.id} className="text-xs">{href ? <a href={href} target="_blank" rel="noreferrer" className="underline">{m.caption || m.file?.filename}</a> : m.caption}</div>
                })}
                {['draft', 'submitted'].includes(a.status) ? <AttachDocument applicationId={a.id} missing={missing} /> : null}
              </div>

              <div className="flex flex-wrap items-end gap-2">
                {a.status === 'draft' ? (
                  short ? <Meta>Attach {short} more document{short > 1 ? 's' : ''} to submit.</Meta>
                    : <CommandForm op="transitionIncentiveApplication" submit="Submit to the programme" fixed={{ ...vars, action: 'submit' }} paths={[PATH]}
                        fields={[{ name: 'reference', label: 'Programme reference (if given)', width: 'md' }]} />
                ) : null}
                {a.status === 'submitted' ? (
                  <>
                    <ActionButton op="transitionIncentiveApplication" vars={{ ...vars, action: 'approve' }} paths={[PATH]} confirm="Record that the programme approved this application?">Approved</ActionButton>
                    <ActionButton op="transitionIncentiveApplication" vars={{ ...vars, action: 'reject', rejectionHandling: policy }} paths={[PATH]}
                      ask={`What reason did the programme give? ${a.treatment === 'off_price_now' && a.order?.plan && policy === 'final_instalment' ? `The ${money(a.amount, a.currencyCode)} is added to the customer's plan as a final instalment.` : 'The company absorbs it; the customer owes nothing more.'}`}>
                      Rejected
                    </ActionButton>
                  </>
                ) : null}
                {a.status === 'approved' ? (
                  <ActionButton op="transitionIncentiveApplication" vars={{ ...vars, action: 'mark_paid' }} paths={[PATH]} confirm={a.treatment === 'paid_to_customer_later' ? 'Record that the programme paid the customer?' : 'Record that the programme paid us?'}>Mark paid</ActionButton>
                ) : null}
                {['draft', 'submitted'].includes(a.status) ? (
                  <ActionButton op="transitionIncentiveApplication" vars={{ ...vars, action: 'withdraw' }} paths={[PATH]} ask="Why is the application withdrawn?">Withdraw</ActionButton>
                ) : null}
              </div>
            </div>
          )
        }) : <Empty>{view.key === 'draft' ? 'No drafts. Open an application for an order below.' : 'None here.'}</Empty>}
      </Section>

      <Section title="Open an application">
        {!programs.length ? <Empty>No active incentive programmes. Add one under Settings, Plans and programmes.</Empty>
          : !openable.length ? <Empty>Every recent order already has an application for each programme.</Empty>
          : (
            <div>
              {openable.slice(0, 10).map((o: any) => {
                const options = programs.filter(p => !o.incentiveApplications.some((a: any) => a.program?.id === p.id && a.status !== 'withdrawn'))
                const first = options[0]
                return (
                  <Row key={o.id}>
                    <span className="space-y-0.5">
                      <span className="block font-medium">{o.number} · {o.customer.name}</span>
                      <Meta>Order total {money(o.totalAmount, o.currencyCode)}{first ? ` · ${first.name} would give ${money(suggested(first, o), o.currencyCode)}` : ''}</Meta>
                    </span>
                    <CommandForm op="openIncentiveApplication" submit="Open" fixed={{ orderId: o.id, customerId: o.customer.id }} paths={[PATH]}
                      fields={[
                        { name: 'programId', label: 'Programme', kind: 'select', width: 'md', options: options.map(p => ({ value: p.id, label: `${p.name} (${label(p.kind)})` })) },
                        { name: 'amount', label: 'Amount', kind: 'money', width: 'sm', defaultValue: first ? (suggested(first, o) / 100).toFixed(2) : '' },
                      ]} />
                  </Row>
                )
              })}
            </div>
          )}
        <Meta>A rejection is {policy === 'final_instalment' ? 'added back to the customer\u2019s plan as a final instalment when the incentive was taken off the price' : 'absorbed by the company'} (company policy under Settings).</Meta>
      </Section>
    </Page>
  )
}
