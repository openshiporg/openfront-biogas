import Link from 'next/link'
import { q, company, viewer } from '../../lib/server'
import { label, money, when } from '../../lib/format'
import { Page, Row, Section, Status, Tabs, Meta, Empty } from '../../components/ui'
import { ActionButton } from '../../components/ActionButton'
import { CommandForm } from '../../components/CommandForm'
import { ReconcileList } from '../components/ReconcileList'

const VIEWS = [
  { key: 'verify', label: 'To verify', status: ['submitted'] },
  { key: 'received', label: 'Received', status: ['verified', 'captured', 'partially_refunded'] },
  { key: 'rejected', label: 'Rejected', status: ['rejected'] },
  { key: 'refunded', label: 'Refunded', status: ['refunded', 'partially_refunded'] },
  { key: 'reconcile', label: 'Read card outcomes', status: ['unknown'] },
]

const FOR = `session { purpose publicCode order { id number } visit { id number } ticket { id number } } order { id number } customer { name phone }`

/**
 * P44 every payment by method and status; P45 the verify queue: a reference sent by a customer or taken by a
 * technician is checked against the bank or mobile-money statement and then verified (or rejected with a reason).
 */
export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ view?: string; method?: string }> }) {
  const sp = await searchParams
  if (sp.view === 'reconcile' || sp.view === 'unknown') return (
    <Page title="Payments">
      <Tabs active="reconcile" items={VIEWS.map(v => ({ key: v.key, label: v.label, href: `/dashboard/platform/payments?view=${v.key}` }))} />
      <ReconcileList />
    </Page>
  )
  const view = VIEWS.find(v => v.key === sp.view) ?? VIEWS[0]
  const [co, me] = await Promise.all([company(), viewer()])
  const where: any = { status: { in: view.status } }
  if (sp.method) where.method = { equals: sp.method }
  const d = await q<any>(`query($w: PaymentWhereInput!) {
    payments(where: $w, orderBy: [{ receivedAt: desc }], take: 200) {
      id status version method amount refundedAmount currencyCode reference payerPhone receivedAt verifiedAt receiptNumber rejectReason
      collectedBy { name } verifiedBy { name } ${FOR}
      refunds(orderBy: [{ createdAt: desc }]) { id status amount reason payoutReference createdAt issuedBy { name } }
    }
    toVerify: paymentsCount(where: { status: { equals: "submitted" } })
  }`, { w: where })
  const canVerify = me.can('canManagePayments')
  const canRefund = me.can('canIssueRefunds')
  const total = d.payments.reduce((s: number, p: any) => s + p.amount, 0)
  const methods = ['mobile_money', 'bank_transfer', 'cash', 'card']

  return (
    <Page title="Payments">
      <Tabs active={view.key} items={VIEWS.map(v => ({ key: v.key, label: v.label, href: `/dashboard/platform/payments?view=${v.key}`, count: v.key === 'verify' ? d.toVerify : undefined }))} />
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href={`/dashboard/platform/payments?view=${view.key}`} className={!sp.method ? 'font-medium underline' : 'text-muted-foreground hover:underline'}>All methods</Link>
        {methods.map(m => <Link key={m} href={`/dashboard/platform/payments?view=${view.key}&method=${m}`} className={sp.method === m ? 'font-medium underline' : 'text-muted-foreground hover:underline'}>{label(m)}</Link>)}
      </div>
      <Section title={`${view.label} · ${d.payments.length} · ${money(total, co.currencyCode)}`}>
        {view.key === 'verify' ? <Meta>Check each reference against your bank or mobile-money statement before you verify it. Verifying pays the order, instalment, visit fee or repair it was for.</Meta> : null}
        {d.payments.length ? d.payments.map((p: any) => {
          const s = p.session ?? {}
          const target = s.order ?? p.order
          return (
            <div key={p.id} className="space-y-2 border-b py-3 last:border-b-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{money(p.amount, p.currencyCode)} · {label(p.method)} · <span className="break-all font-mono text-sm">{p.reference || '—'}</span></span>
                <Status value={p.status} />
              </div>
              <Meta>
                {p.customer?.name ?? ''}{p.payerPhone ? ` · paid from ${p.payerPhone}` : ''} · {label(s.purpose ?? '')} for{' '}
                {target ? <Link href={`/dashboard/platform/orders/${target.id}`} className="underline">{target.number}</Link> : null}
                {s.visit ? <Link href={`/dashboard/platform/field/${s.visit.id}`} className="underline">{s.visit.number}</Link> : null}
                {s.ticket ? <Link href={`/dashboard/platform/tickets/${s.ticket.id}`} className="underline">{s.ticket.number}</Link> : null}
                {' '}· received {when(p.receivedAt, co.timezone)}
                {p.collectedBy ? ` · taken by ${p.collectedBy.name}` : ' · sent by the customer'}
                {p.verifiedBy ? ` · verified by ${p.verifiedBy.name}` : ''}{p.receiptNumber ? ` · receipt ${p.receiptNumber}` : ''}
              </Meta>
              {p.rejectReason ? <p className="text-sm text-red-700">Rejected: {p.rejectReason}</p> : null}
              {p.status === 'submitted' && canVerify ? (
                <div className="flex flex-wrap gap-2">
                  <ActionButton op="verifyOfflinePayment" vars={{ paymentId: p.id, expectedVersion: p.version }} paths={['/dashboard/platform/payments', '/dashboard/platform/home']} className="border">Verify</ActionButton>
                  <ActionButton op="rejectOfflinePayment" vars={{ paymentId: p.id, expectedVersion: p.version }} ask="Why is this reference rejected? The customer sees this." paths={['/dashboard/platform/payments']} className="border">Reject</ActionButton>
                </div>
              ) : null}
              {p.refunds.map((r: any) => (
                <Row key={r.id}><span>Refund {money(r.amount, p.currencyCode)} · {r.reason}</span><Meta>{r.payoutReference ? `payout ${r.payoutReference} · ` : ''}{r.issuedBy?.name ?? ''} · {when(r.createdAt, co.timezone)}</Meta><Status value={r.status} /></Row>
              ))}
              {canRefund && ['verified', 'captured', 'partially_refunded'].includes(p.status) && p.refundedAmount < p.amount ? (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground">Refund</summary>
                  <CommandForm op="refundPayment" submit="Refund" fixed={{ paymentId: p.id }} paths={['/dashboard/platform/payments']} className="mt-2"
                    fields={[
                      { name: 'amount', label: `Amount (up to ${money(p.amount - p.refundedAmount, p.currencyCode)})`, kind: 'money', required: true, width: 'md' },
                      { name: 'reason', label: 'Reason', required: true },
                      ...(p.method === 'card' ? [] : [{ name: 'payoutReference', label: 'Reference of the payout you sent', required: true }]),
                    ]} />
                </details>
              ) : null}
            </div>
          )
        }) : <Empty>{view.key === 'verify' ? 'Nothing waiting to be verified.' : 'No payments here.'}</Empty>}
      </Section>
    </Page>
  )
}
