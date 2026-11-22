import Link from 'next/link'
import { notFound } from 'next/navigation'
import { q, company, viewer, requestTime, siteUrl } from '../../lib/server'
import { contactLinks, label, money, when } from '../../lib/format'
import { Page, Row, Section, Status, Meta, Empty, Stat } from '../../components/ui'
import { ActionButton } from '../../components/ActionButton'
import { CommandForm } from '../../components/CommandForm'
import { LinkCommand } from '../../common/LinkCommand'
import { installmentEffectiveStatus, planEffectiveStatus } from '@/features/keystone/lib/time'

const OPEN = ['scheduled', 'due', 'partially_paid', 'overdue']

/** P48: one payment plan. Waive an instalment, record an early payoff (pay link for the rest), reschedule the open instalments. */
export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [co, me] = await Promise.all([company(), viewer()])
  if (!me.can('canReadPayments') && !me.can('canManagePlans')) {
    return <Page title="Payment plan"><Empty>Your role cannot see payment plans. Ask the owner for payments access.</Empty></Page>
  }
  const d = await q<any>(`query($id: ID!) {
    paymentPlan(where: { id: $id }) {
      id status version kind currencyCode principalAmount planFeeAmount depositAmount totalAmount paidAmount startDate frequency nextDueAt
      order { id number publicCode } customer { id name phone email } template { name }
      installments(orderBy: [{ sequence: asc }]) { id sequence label dueDate amount paidAmount status version paidAt waivedReason trigger remindedAt }
    }
    companySettings { instalmentGraceDays defaultAfterDays }
  }`, { id }).catch(() => null)
  const p = d?.paymentPlan
  if (!p) notFound()
  const now = new Date(requestTime())
  const grace = d.companySettings?.instalmentGraceDays ?? 0
  const status = planEffectiveStatus(p, p.installments, now, grace, d.companySettings?.defaultAfterDays ?? 60)
  const m = (v: number) => money(v, p.currencyCode)
  const open = p.installments.filter((i: any) => OPEN.includes(i.status))
  const left = open.reduce((t: number, i: any) => t + i.amount - i.paidAmount, 0)
  const live = ['pending', 'active', 'in_arrears', 'defaulted'].includes(p.status)
  const canPlans = me.can('canManagePlans')
  const canLink = canPlans || me.can('canManagePayments')
  const path = `/dashboard/platform/plans/${p.id}`
  const c = contactLinks({ phone: p.customer?.phone, email: p.customer?.email, text: `Hello ${p.customer?.name ?? ''}, about your payment plan for order ${p.order?.number ?? ''}.`, subject: `Your payment plan, ${p.order?.number ?? ''}` })

  return (
    <Page title={`Plan for ${p.order?.number ?? 'order'}`} crumbs={[{ label: 'Payment plans', href: '/dashboard/platform/plans' }]}>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Status value={status} />
        <span>{p.customer ? <Link className="underline" href={`/dashboard/platform/customers/${p.customer.id}`}>{p.customer.name}</Link> : null}</span>
        {p.order ? <Link className="underline" href={`/dashboard/platform/orders/${p.order.id}`}>Order {p.order.number}</Link> : null}
        <Meta>{p.template?.name ?? label(p.kind)}{p.frequency ? ` · ${label(p.frequency)}` : ''}</Meta>
        {c.whatsapp ? <a className="underline" href={c.whatsapp} target="_blank" rel="noreferrer">WhatsApp</a> : null}
        {c.call ? <a className="underline" href={c.call}>Call</a> : null}
        {c.sms ? <a className="underline" href={c.sms}>Text</a> : null}
        {c.email ? <a className="underline" href={c.email}>Email</a> : null}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Stat name="Total" value={m(p.totalAmount)} />
        <Stat name="Paid" value={m(p.paidAmount)} />
        <Stat name="Left to pay" value={m(left)} />
        <Stat name="Plan fee" value={m(p.planFeeAmount)} />
        <Stat name="Next due" value={p.nextDueAt ? when(p.nextDueAt, co.timezone, 'date') : '—'} />
      </div>

      <Section title="Instalments">
        {p.installments.length ? p.installments.map((i: any) => {
          const eff = installmentEffectiveStatus(i, now, grace)
          const isOpen = OPEN.includes(i.status)
          return (
            <Row key={i.id}>
              <span className="space-y-0.5">
                <span className="block">{i.label || `Instalment ${i.sequence}`} · {m(i.amount)}</span>
                <Meta>
                  {i.dueDate ? `due ${when(i.dueDate, co.timezone, 'date')}` : i.trigger !== 'date' ? `due ${label(i.trigger)}` : ''}
                  {i.paidAmount ? ` · paid ${m(i.paidAmount)}${i.paidAt ? ` on ${when(i.paidAt, co.timezone, 'date')}` : ''}` : ''}
                  {i.waivedReason ? ` · waived: ${i.waivedReason}` : ''}
                  {i.remindedAt ? ` · reminded ${when(i.remindedAt, co.timezone)}` : ''}
                </Meta>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <Status value={eff} />
                {isOpen && canLink && live ? <LinkCommand op="staffInstallmentLink" vars={{ planId: p.id, installmentIds: [i.id] }} base={siteUrl()} paths={[path]}>Pay link</LinkCommand> : null}
                {isOpen && canPlans ? <ActionButton op="waiveInstallment" vars={{ installmentId: i.id, expectedVersion: i.version }} paths={[path]} ask={`Why waive ${m(i.amount - i.paidAmount)}? The order total drops by the same amount.`}>Waive</ActionButton> : null}
              </span>
            </Row>
          )
        }) : <Empty>This plan has no instalments.</Empty>}
      </Section>

      {live && open.length ? (
        <>
          {canLink ? (
            <Section title="Early payoff">
              <p className="text-sm">The customer pays {m(left)} or less in one go: the pay link waives the share of the plan fee not yet earned when the company setting allows it, and the plan completes once it is paid.</p>
              <LinkCommand op="staffInstallmentLink" vars={{ planId: p.id, payoff: true }} base={siteUrl()} paths={[path]}>Make payoff link</LinkCommand>
            </Section>
          ) : null}
          {canPlans ? (
            <Section title="Reschedule">
              <p className="text-sm text-muted-foreground">Moves every open instalment's due date by the same number of months or days.</p>
              <CommandForm
                op="reschedulePlan" submit="Reschedule" paths={[path]} fixed={{ planId: p.id, expectedVersion: p.version }}
                fields={[
                  { name: 'shiftMonths', label: 'Months later (or earlier, e.g. -1)', width: 'sm' },
                  { name: 'shiftDays', label: 'or days later', width: 'sm' },
                  { name: 'reason', label: 'Reason', required: true, width: 'lg' },
                ]}
              />
            </Section>
          ) : null}
        </>
      ) : null}
      <Meta>Principal {m(p.principalAmount)}, deposit {m(p.depositAmount)}. Overdue after {grace} grace day(s); statuses are read from the due dates.</Meta>
    </Page>
  )
}
