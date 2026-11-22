import { q, company, viewer, requestTime, siteUrl } from '../../lib/server'
import { contactLinks, label, money, when } from '../../lib/format'
import { Page, Row, Section, Status, Tabs, Meta, Empty } from '../../components/ui'
import { RemindButtons } from '../components/RemindButtons'
import { installmentEffectiveStatus, planEffectiveStatus, daysLate } from '@/features/keystone/lib/time'

const VIEWS = [
  { key: 'remind', label: 'To remind' },
  { key: 'week', label: 'Due this week' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'defaulted', label: 'Defaulted' },
  { key: 'all', label: 'All live plans' },
  { key: 'done', label: 'Finished' },
]
const OPEN = ['scheduled', 'due', 'partially_paid', 'overdue']
const DAY = 86400000

/**
 * P47 payment plans: due this week, overdue, defaulted (all derived from dates on read), and the "to remind" queue:
 * instalments due within 3 days or late and not reminded in the last 3 days, each with one-tap WhatsApp, SMS or call.
 */
export default async function PlansPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams
  const view = VIEWS.find(v => v.key === sp.view) ?? VIEWS[0]
  const [co, me] = await Promise.all([company(), viewer()])
  if (!me.can('canReadPayments') && !me.can('canManagePlans') && !me.can('canManagePayments')) {
    return <Page title="Payment plans"><Empty>Your role cannot see payment plans. Ask the owner for payments access.</Empty></Page>
  }
  const finished = view.key === 'done'
  const d = await q<any>(`query($s: [String!]) {
    paymentPlans(where: { status: { in: $s } }, orderBy: [{ nextDueAt: asc }], take: 500) {
      id status kind currencyCode totalAmount paidAmount nextDueAt
      order { id number publicCode } customer { id name phone email }
      installments(orderBy: [{ sequence: asc }]) { id sequence label dueDate amount paidAmount status remindedAt }
    }
    companySettings { instalmentGraceDays defaultAfterDays }
  }`, { s: finished ? ['completed', 'settled_early', 'cancelled'] : ['pending', 'active', 'in_arrears', 'defaulted'] })
  const now = new Date(requestTime())
  const grace = d.companySettings?.instalmentGraceDays ?? 0
  const dflt = d.companySettings?.defaultAfterDays ?? 60
  const site = siteUrl()
  const plans = d.paymentPlans.map((p: any) => {
    const inst = p.installments.map((i: any) => ({ ...i, eff: installmentEffectiveStatus(i, now, grace) }))
    const next = inst.find((i: any) => OPEN.includes(i.eff))
    return { ...p, inst, eff: planEffectiveStatus(p, p.installments, now, grace, dflt), next }
  })
  const weekEnd = now.getTime() + 7 * DAY
  const dueRows = plans.flatMap((p: any) => p.inst.filter((i: any) => OPEN.includes(i.eff) && i.dueDate).map((i: any) => ({ p, i })))
  const lists: Record<string, { p: any; i: any }[]> = {
    week: dueRows.filter(({ i }: any) => ['scheduled', 'due', 'partially_paid'].includes(i.eff) && new Date(i.dueDate).getTime() <= weekEnd),
    overdue: dueRows.filter(({ i, p }: any) => i.eff === 'overdue' && p.eff !== 'defaulted'),
    defaulted: dueRows.filter(({ i, p }: any) => i.eff === 'overdue' && p.eff === 'defaulted'),
    remind: dueRows.filter(({ i }: any) => new Date(i.dueDate).getTime() <= now.getTime() + 3 * DAY && (!i.remindedAt || now.getTime() - new Date(i.remindedAt).getTime() > 3 * DAY)),
  }
  const counts: Record<string, number> = { ...Object.fromEntries(Object.entries(lists).map(([k, v]) => [k, v.length])), all: finished ? 0 : plans.length }
  const path = `/dashboard/platform/plans?view=${view.key}`
  const canRemind = me.can('canManagePlans') || me.can('canManagePayments')

  const instRow = ({ p, i }: { p: any; i: any }) => {
    const owed = money(i.amount - i.paidAmount, p.currencyCode)
    const late = daysLate(i.dueDate, now)
    const track = site && p.order?.publicCode ? ` Pay or see your plan: ${site}/order/${p.order.publicCode}` : ''
    const text = `Hello ${p.customer?.name ?? ''}, a reminder from ${co.name}: ${i.label || `instalment ${i.sequence}`} of ${owed} for order ${p.order?.number ?? ''} ${late > 0 ? `was due ${when(i.dueDate, co.timezone, 'date')}` : `is due ${when(i.dueDate, co.timezone, 'date')}`}.${track}`
    const c = contactLinks({ phone: p.customer?.phone, email: p.customer?.email, text, subject: `Payment reminder, ${p.order?.number ?? ''}` })
    return (
      <Row key={i.id}>
        <a href={`/dashboard/platform/plans/${p.id}`} className="min-w-0 break-words hover:underline">{p.customer?.name} · {p.order?.number} · {i.label || `#${i.sequence}`} · {owed}</a>
        <Meta>
          due {when(i.dueDate, co.timezone, 'date')}{late > 0 ? ` · ${late} days late` : ''}{i.remindedAt ? ` · reminded ${when(i.remindedAt, co.timezone)}` : ' · not reminded'} · plan {label(p.eff)}
        </Meta>
        {canRemind ? <RemindButtons installmentId={i.id} customerId={p.customer?.id ?? null} links={{ whatsapp: c.whatsapp, sms: c.sms, call: p.customer?.phone ? `tel:${p.customer.phone}` : null }} path={path} /> : <Status value={i.eff} />}
      </Row>
    )
  }

  return (
    <Page title="Payment plans">
      <Tabs active={view.key} items={VIEWS.map(v => ({ key: v.key, label: v.label, href: `/dashboard/platform/plans?view=${v.key}`, count: v.key === 'done' ? undefined : counts[v.key] }))} />
      {lists[view.key] ? (
        <Section title={view.label}>
          {lists[view.key].map(instRow)}
          {!lists[view.key].length ? <Empty>{view.key === 'remind' ? 'Nobody to remind right now.' : 'None.'}</Empty> : null}
        </Section>
      ) : (
        <Section title={view.label}>
          {plans.map((p: any) => (
            <Row key={p.id} href={`/dashboard/platform/plans/${p.id}`}>
              <span>{p.customer?.name} · {p.order?.number} · {label(p.kind)}</span>
              <Meta>paid {money(p.paidAmount, p.currencyCode)} of {money(p.totalAmount, p.currencyCode)}{p.next?.dueDate ? ` · next ${when(p.next.dueDate, co.timezone, 'date')} ${money(p.next.amount - p.next.paidAmount, p.currencyCode)}` : ''}</Meta>
              <Status value={p.eff} />
            </Row>
          ))}
          {!plans.length ? <Empty>No plans here.</Empty> : null}
        </Section>
      )}
    </Page>
  )
}
