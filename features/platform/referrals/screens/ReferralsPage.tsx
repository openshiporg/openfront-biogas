import { q, company, viewer } from '../../lib/server'
import { money, when } from '../../lib/format'
import { Page, Row, Section, Status, Tabs, Meta, Empty, Stat } from '../../components/ui'
import { ActionButton } from '../../components/ActionButton'

const VIEWS = [
  { key: 'qualified', label: 'Ready to reward', match: ['qualified', 'approved'] },
  { key: 'pending', label: 'Not bought yet', match: ['pending'] },
  { key: 'rewarded', label: 'Rewarded', match: ['rewarded'] },
  { key: 'void', label: 'Void', match: ['void'] },
  { key: 'all', label: 'All', match: [] as string[] },
] as const
const PATH = '/dashboard/platform/referrals'

/**
 * P50: referral rewards. A referral qualifies when the referred customer's system is commissioned; staff approve it and grant
 * the reward as store credit or as the referrer's next instalment paid. Voiding needs a reason. All moves are grantReferralReward.
 */
export default async function ReferralsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams
  const view = VIEWS.find(v => v.key === sp.view) ?? VIEWS[0]
  const [co, me] = await Promise.all([company(), viewer()])
  const canGrant = me.can('canManageCommissions') || me.can('canManagePayments')
  if (!canGrant && !me.can('canManageLeads')) {
    return <Page title="Referrals"><Empty>Your role cannot see referrals. Ask the owner for access.</Empty></Page>
  }
  const d = await q<any>(`{
    referrals(orderBy: [{ createdAt: desc }], take: 300) {
      id code status version rewardAmount currencyCode rewardKind qualifiedAt rewardedAt voidReason createdAt
      referrer { id name phone storeCreditAmount plans(where: { status: { in: ["active", "in_arrears", "defaulted"] } }) { id } }
      lead { id number customer { name } } order { id number customer { name } }
    }
    companySettings { referralRewardAmount }
  }`)
  const all: any[] = d.referrals
  const list = view.match.length ? all.filter(r => (view.match as readonly string[]).includes(r.status)) : all
  const count = (m: readonly string[]) => m.length ? all.filter(r => m.includes(r.status)).length : all.length
  const standard: number = d.companySettings?.referralRewardAmount ?? 0
  const granted = all.filter(r => r.status === 'rewarded').reduce((t, r) => t + r.rewardAmount, 0)

  return (
    <Page title="Referrals">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat name="Ready to reward" value={count(['qualified', 'approved'])} />
        <Stat name="Not bought yet" value={count(['pending'])} />
        <Stat name="Rewards given" value={money(granted, co.currencyCode)} />
        <Stat name="Standard reward" value={standard ? money(standard, co.currencyCode) : 'Not set'} />
      </div>
      <Tabs active={view.key} items={VIEWS.map(v => ({ key: v.key, label: v.label, href: `${PATH}?view=${v.key}`, count: count(v.match) }))} />
      <Section title={`${view.label} · ${list.length}`}>
        {list.length ? list.map(r => {
          const friend = r.order?.customer?.name ?? r.lead?.customer?.name ?? ''
          const reward = r.rewardAmount || standard
          const vars = { referralId: r.id, expectedVersion: r.version }
          return (
            <Row key={r.id}>
              <span className="space-y-0.5">
                <span className="block font-medium">{r.referrer?.name ?? 'No referrer'} referred {friend || 'a lead'}</span>
                <Meta>
                  Code <span className="font-mono">{r.code}</span>
                  {r.lead ? <> · lead <a className="underline" href={`/dashboard/platform/leads/${r.lead.id}`}>{r.lead.number}</a></> : null}
                  {r.order ? <> · order <a className="underline" href={`/dashboard/platform/orders/${r.order.id}`}>{r.order.number}</a></> : null}
                  {r.qualifiedAt ? ` · qualified ${when(r.qualifiedAt, co.timezone, 'date')}` : ` · made ${when(r.createdAt, co.timezone, 'date')}`}
                  {r.status === 'rewarded' ? ` · ${money(r.rewardAmount, r.currencyCode)} as ${r.rewardKind === 'free_instalment' ? 'an instalment paid' : 'store credit'} on ${when(r.rewardedAt, co.timezone, 'date')}` : ''}
                  {r.status === 'void' && r.voidReason ? ` · void: ${r.voidReason}` : ''}
                  {r.referrer ? ` · store credit now ${money(r.referrer.storeCreditAmount, co.currencyCode)}` : ''}
                </Meta>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <Status value={r.status} />
                {canGrant && r.status === 'qualified' ? <ActionButton op="grantReferralReward" vars={{ ...vars, action: 'approve' }} paths={[PATH]}>Approve</ActionButton> : null}
                {canGrant && ['qualified', 'approved'].includes(r.status) && r.referrer ? (
                  <>
                    <ActionButton op="grantReferralReward" vars={{ ...vars, action: 'grant', rewardKind: 'store_credit' }} paths={[PATH]} confirm={`Give ${r.referrer.name} ${money(reward, co.currencyCode)} store credit?`}>
                      Give {money(reward, co.currencyCode)} credit
                    </ActionButton>
                    {r.referrer.plans.length ? (
                      <ActionButton op="grantReferralReward" vars={{ ...vars, action: 'grant', rewardKind: 'free_instalment' }} paths={[PATH]} confirm={`Pay ${r.referrer.name}'s next instalment as the reward?`}>
                        Pay next instalment
                      </ActionButton>
                    ) : null}
                  </>
                ) : null}
                {canGrant && ['pending', 'qualified', 'approved'].includes(r.status) ? <ActionButton op="grantReferralReward" vars={{ ...vars, action: 'void' }} paths={[PATH]} ask="Why is this referral void?">Void</ActionButton> : null}
              </span>
            </Row>
          )
        }) : <Empty>{view.key === 'qualified' ? 'No referral is waiting for a reward.' : 'None here.'}</Empty>}
      </Section>
      <p><Meta>A referral qualifies when the friend&apos;s system is commissioned. The standard reward is set under Settings, Company.</Meta></p>
    </Page>
  )
}
