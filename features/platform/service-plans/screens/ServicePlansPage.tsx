import { q, company, viewer, requestTime, siteUrl } from '../../lib/server'
import { dayText, label, money, when } from '../../lib/format'
import { Page, Row, Section, Status, Tabs, Meta, Empty, Stat } from '../../components/ui'
import { ActionButton } from '../../components/ActionButton'
import { LinkCommand } from '../../common/LinkCommand'
import { proRataRefund } from '@/features/keystone/services/subscriptions'

const VIEWS = [
  { key: 'live', label: 'Active', match: ['active', 'renewal_due'] },
  { key: 'renew', label: 'Renewal due or in grace', match: ['renewal_due', 'grace'] },
  { key: 'pending', label: 'Waiting for payment', match: ['pending_payment'] },
  { key: 'ended', label: 'Lapsed or cancelled', match: ['lapsed', 'cancelled'] },
  { key: 'all', label: 'All', match: [] as string[] },
] as const
const PATH = '/dashboard/platform/service-plans'

/** P43: service plan subscribers. Sell a plan for a system, renew with a pay link, cancel with the pro-rata refund, visits used. */
export default async function ServicePlansPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams
  const view = VIEWS.find(v => v.key === sp.view) ?? VIEWS[0]
  const [co, me] = await Promise.all([company(), viewer()])
  if (!me.can('canManagePlans') && !me.can('canManageSystems')) {
    return <Page title="Service plans"><Empty>Your role cannot see service plan subscribers. Ask the owner for plan access.</Empty></Page>
  }
  const now = new Date(requestTime())
  const d = await q<any>(`{
    servicePlanSubscriptions(orderBy: [{ createdAt: desc }], take: 300) {
      id status effectiveStatus version priceAmount currencyCode billing startedAt currentPeriodStart currentPeriodEnd visitsUsed cancelledAt cancelReason refundAmount
      plan { id name visitsPerYear } system { id number product { name } } customer { id name phone }
      visits(orderBy: [{ scheduledDate: asc }]) { id number status scheduledDate }
    }
    servicePlans(orderBy: [{ priceAmount: asc }]) { id name priceAmount currencyCode billing visitsPerYear isPublished }
    installedSystems(where: { status: { notIn: ["decommissioned"] } }, orderBy: [{ createdAt: desc }], take: 300) { id number customer { name } product { name } subscriptions(where: { status: { in: ["active", "pending_payment"] } }) { id } }
    companySettings { surveyFeeAmount }
  }`)
  const visitPrice: number = d.companySettings?.surveyFeeAmount ?? 0
  const subs: any[] = d.servicePlanSubscriptions
  const list = view.match.length ? subs.filter(s => (view.match as readonly string[]).includes(s.effectiveStatus)) : subs
  const count = (m: readonly string[]) => m.length ? subs.filter(s => m.includes(s.effectiveStatus)).length : subs.length
  const sellable = d.installedSystems.filter((s: any) => !s.subscriptions.length)
  const plans = d.servicePlans.filter((p: any) => p.isPublished)
  const canSell = me.can('canManagePlans') || me.can('canManageSystems')
  const live = subs.filter(s => ['active', 'renewal_due'].includes(s.effectiveStatus))

  return (
    <Page title="Service plans">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat name="Active" value={live.length} />
        <Stat name="Renewal due or in grace" value={count(['renewal_due', 'grace'])} />
        <Stat name="Waiting for payment" value={count(['pending_payment'])} />
        <Stat name="Yearly value" value={money(live.reduce((t, s) => t + (s.billing === 'monthly' ? s.priceAmount * 12 : s.priceAmount), 0), co.currencyCode)} />
      </div>
      <Tabs active={view.key} items={VIEWS.map(v => ({ key: v.key, label: v.label, href: `${PATH}?view=${v.key}`, count: count(v.match) }))} />

      {canSell ? (
        <Section title="Sell a plan">
          {!plans.length ? <Empty>No published service plans. Add one under Settings, Plans and programmes.</Empty>
            : !sellable.length ? <Empty>Every installed system already has a plan, or none is installed yet.</Empty>
            : (
              <div className="space-y-2">
                <LinkCommand
                  op="staffSubscribeToPlan" vars={{}} base={siteUrl()} paths={[PATH]}
                  selects={[
                    { name: 'systemId', label: 'System', options: sellable.map((s: any) => ({ value: s.id, label: `${s.number} · ${s.customer?.name ?? ''} · ${s.product?.name ?? ''}` })) },
                    { name: 'planId', label: 'Plan', options: plans.map((p: any) => ({ value: p.id, label: `${p.name} · ${money(p.priceAmount, p.currencyCode)} ${p.billing === 'monthly' ? 'a month' : 'a year'}` })) },
                  ]}
                >
                  Sell and make pay link
                </LinkCommand>
                <p><Meta>The plan starts when the customer pays the link; share it by WhatsApp, text or email from the customer page.</Meta></p>
              </div>
            )}
        </Section>
      ) : null}

      <Section title={`${view.label} · ${list.length}`}>
        {list.length ? list.map(s => {
          const allowance = s.plan?.visitsPerYear ?? 0
          const refund = s.status === 'active' ? proRataRefund({ ...s, currentPeriodStart: s.currentPeriodStart ? new Date(s.currentPeriodStart) : null, currentPeriodEnd: s.currentPeriodEnd ? new Date(s.currentPeriodEnd) : null }, visitPrice, now) : 0
          const nextVisit = s.visits.find((v: any) => ['requested', 'scheduled'].includes(v.status))
          return (
            <Row key={s.id}>
              <span className="space-y-0.5">
                <span className="block font-medium">{s.customer?.name ?? ''} · {s.plan?.name ?? ''}</span>
                <Meta>
                  {s.system ? <a className="underline" href={`/dashboard/platform/systems/${s.system.id}`}>{s.system.number}</a> : null} {s.system?.product?.name ?? ''} · {money(s.priceAmount, s.currencyCode)} {s.billing === 'monthly' ? 'a month' : 'a year'}
                  {s.currentPeriodEnd ? ` · period ${when(s.currentPeriodStart, co.timezone, 'date')} to ${when(s.currentPeriodEnd, co.timezone, 'date')}` : ''}
                  {` · visits used ${s.visitsUsed} of ${allowance}`}{nextVisit ? ` · next visit ${nextVisit.scheduledDate ? dayText(nextVisit.scheduledDate) : 'to book'}` : ''}
                  {s.status === 'cancelled' ? ` · cancelled ${when(s.cancelledAt, co.timezone, 'date')}${s.cancelReason ? `: ${s.cancelReason}` : ''}${s.refundAmount ? `, refunded ${money(s.refundAmount, s.currencyCode)}` : ''}` : ''}
                </Meta>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <Status value={s.effectiveStatus} />
                {me.can('canManagePlans') && s.status !== 'cancelled' ? (
                  <>
                    <LinkCommand op="renewSubscription" vars={{ subscriptionId: s.id }} base={siteUrl()} paths={[PATH]}>{s.status === 'pending_payment' ? 'New pay link' : 'Renew'}</LinkCommand>
                    <ActionButton op="cancelSubscription" vars={{ subscriptionId: s.id, expectedVersion: s.version, visitListPriceAmount: visitPrice }} paths={[PATH]}
                      ask={`Why is the plan being cancelled? ${refund > 0 ? `The customer gets ${money(refund, s.currencyCode)} back (unused whole months less ${s.visitsUsed} visit(s) at ${money(visitPrice, s.currencyCode)}).` : 'No refund is due.'}`}>
                      Cancel{refund > 0 ? `, refund ${money(refund, s.currencyCode)}` : ''}
                    </ActionButton>
                  </>
                ) : null}
              </span>
            </Row>
          )
        }) : <Empty>{view.key === 'all' ? 'Nobody has a service plan yet. Sell one above once a system is installed.' : 'None here.'}</Empty>}
      </Section>
      <p><Meta>Statuses read from the period dates: renewal is due in the last 30 days, then 30 days of grace, then the plan lapses.</Meta></p>
    </Page>
  )
}
