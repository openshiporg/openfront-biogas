import { q, company, viewer, requestTime } from '../../lib/server'
import { label, money, when } from '../../lib/format'
import { Row, Section, Status, Meta, Empty } from '../../components/ui'
import { UnkeyedButton } from './UnkeyedButton'

const PATH = '/dashboard/platform/payments'

/**
 * P46 (payments, reconcile tab): card payments and card refunds whose outcome we have not heard (no webhook yet, or it
 * failed). "Read from Stripe" asks Stripe and applies its answer exactly as the webhook would; reading twice changes
 * nothing. Bank, mobile-money and cash references never appear here: staff verify those in the verify tab.
 */
export async function ReconcileList() {
  const [co, me] = await Promise.all([company(), viewer()])
  if (!me.can('canManagePayments') && !me.can('canIssueRefunds')) return null
  const stale = new Date(requestTime() - 10 * 60 * 1000).toISOString()
  const d = await q<any>(`query($stale: DateTime!) {
    sessions: paymentSessions(where: { provider: { code: { equals: "stripe" } }, providerRef: { not: { equals: "" } }, OR: [{ status: { in: ["unknown", "authorized"] } }, { status: { equals: "pending" }, createdAt: { lt: $stale } }] }, orderBy: [{ createdAt: desc }], take: 100) {
      id publicCode status providerStatus amount currencyCode purpose lastCheckedAt createdAt order { id number } customer { name }
    }
    unknownPayments: payments(where: { status: { equals: "unknown" } }, take: 100) { id amount currencyCode method session { id publicCode } order { id number } customer { name } receivedAt }
    refunds(where: { status: { in: ["pending", "unknown"] }, providerRef: { not: { equals: "" } } }, orderBy: [{ createdAt: desc }], take: 100) {
      id status amount currencyCode reason createdAt order { id number }
    }
  }`, { stale }).catch(() => ({ sessions: [], unknownPayments: [], refunds: [] }))
  const seen = new Set(d.sessions.map((s: any) => s.id))
  const orphan = d.unknownPayments.filter((p: any) => p.session && !seen.has(p.session.id))
  const total = d.sessions.length + orphan.length + d.refunds.length

  return (
    <Section title={`Card outcomes to read back · ${total}`}>
      <Meta>Card payments started over 10 minutes ago with no answer from Stripe, and card refunds still pending. Reading back applies Stripe&apos;s answer once.</Meta>
      {d.sessions.map((s: any) => (
        <Row key={s.id}>
          <span className="space-y-0.5">
            <span className="block">{money(s.amount, s.currencyCode)} · {label(s.purpose)} · <span className="font-mono text-xs">{s.publicCode}</span></span>
            <Meta>{s.customer?.name ?? ''}{s.order ? <> · <a className="underline" href={`/dashboard/platform/orders/${s.order.id}`}>{s.order.number}</a></> : null} · started {when(s.createdAt, co.timezone)}{s.lastCheckedAt ? ` · last read ${when(s.lastCheckedAt, co.timezone)} (${s.providerStatus || 'no answer'})` : ''}</Meta>
          </span>
          <span className="flex items-center gap-2"><Status value={s.status} />{me.can('canManagePayments') ? <UnkeyedButton op="reconcilePaymentSession" vars={{ sessionId: s.id }} paths={[PATH]}>Read from Stripe</UnkeyedButton> : null}</span>
        </Row>
      ))}
      {orphan.map((p: any) => (
        <Row key={p.id}>
          <span className="space-y-0.5">
            <span className="block">{money(p.amount, p.currencyCode)} · {label(p.method)} · <span className="font-mono text-xs">{p.session.publicCode}</span></span>
            <Meta>{p.customer?.name ?? ''}{p.order ? ` · ${p.order.number}` : ''} · {when(p.receivedAt, co.timezone)}</Meta>
          </span>
          <span className="flex items-center gap-2"><Status value="unknown" />{me.can('canManagePayments') ? <UnkeyedButton op="reconcilePaymentSession" vars={{ sessionId: p.session.id }} paths={[PATH]}>Read from Stripe</UnkeyedButton> : null}</span>
        </Row>
      ))}
      {d.refunds.map((r: any) => (
        <Row key={r.id}>
          <span className="space-y-0.5">
            <span className="block">Refund {money(r.amount, r.currencyCode)}{r.order ? ` on ${r.order.number}` : ''}</span>
            <Meta>{r.reason} · {when(r.createdAt, co.timezone)}</Meta>
          </span>
          <span className="flex items-center gap-2"><Status value={r.status} /><UnkeyedButton op="reconcileRefund" vars={{ refundId: r.id }} paths={[PATH]}>Read from Stripe</UnkeyedButton></span>
        </Row>
      ))}
      {!total ? <Empty>Every card payment and refund has its answer.</Empty> : null}
    </Section>
  )
}
