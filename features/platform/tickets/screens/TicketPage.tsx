import Link from 'next/link'
import { notFound } from 'next/navigation'
import { q, company, viewer, todayIso } from '../../lib/server'
import { label, money, when, contactLinks } from '../../lib/format'
import { Page, Row, Section, Status, Meta, Empty } from '../../components/ui'
import { ActionButton } from '../../components/ActionButton'
import { CommandForm } from '../../components/CommandForm'
import { SlotPicker } from '../../schedule/components/SlotPicker'

const OPEN = ['open', 'triaged', 'reopened', 'visit_scheduled', 'awaiting_customer_approval', 'in_progress']

/**
 * P39 triage with the troubleshooting guide, fixed by phone; P40 warranty decision; P41 a paid repair quote and its pay link;
 * P42 resolve, reopen, close, notes and the call log. Book a service visit from here.
 */
export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const path = `/dashboard/platform/tickets/${id}`
  const [co, me] = await Promise.all([company(), viewer()])
  const d = await q<any>(`query($id: ID!) {
    serviceTicket(where: { id: $id }) {
      id number status effectiveStatus pastTarget version channel category severity description callbackPhone responseDueAt firstResponseAt resolvedAt closedAt resolution
      warrantyDecision warrantyNote supplierClaim partReplaced customerConfirmed createdAt
      customer { id name phone email } assignedTo { id name }
      system { id number status product { name } commissionedAt warranties { component endsAt isVoid } site { city } }
      visits(orderBy: [{ createdAt: desc }]) { id number type status scheduledDate technicians { name } }
      quotes(orderBy: [{ createdAt: desc }]) { id number status currencyCode options { totalAmount } order { id number status balanceAmount currencyCode } }
      events(orderBy: [{ createdAt: desc }]) { id type body isCustomerVisible createdAt user { name } }
    }
  }`, { id })
  const t = d.serviceTicket
  if (!t) notFound()
  const g = await q<any>(`query($c: String!) {
    troubleshootingGuides(where: { isPublished: { equals: true }, symptomCategory: { equals: $c } }) { id title stepsText }
    users(where: { isActive: { equals: true }, role: { canAccessDashboard: { equals: true } } }, orderBy: [{ name: asc }]) { id name role { canDoFieldWork canManageSettings } }
  }`, { c: t.category })
  const can = me.can('canManageTickets')
  const isOpen = OPEN.includes(t.status)
  const techs = [...g.users.filter((u: any) => u.role?.canDoFieldWork && !u.role?.canManageSettings), ...g.users.filter((u: any) => u.role?.canDoFieldWork && u.role?.canManageSettings)].map((u: any) => ({ id: u.id, name: u.name }))
  const booked = t.visits.some((v: any) => ['scheduled', 'rescheduled', 'en_route', 'on_site'].includes(v.status))
  const reach = contactLinks({ phone: t.callbackPhone || t.customer?.phone, email: t.customer?.email, text: `Hello ${t.customer?.name ?? ''}, about your ticket ${t.number}: `, subject: `Ticket ${t.number}` })
  const act = (action: string, children: string, extra: { ask?: string; className?: string } = {}) =>
    <ActionButton op="transitionTicket" vars={{ input: { ticketId: t.id, action, expectedVersion: t.version } }} ask={extra.ask} paths={[path, '/dashboard/platform/tickets']} className={extra.className ?? 'border'}>{children}</ActionButton>
  return (
    <Page title={`${t.number} · ${t.customer?.name ?? ''}`} crumbs={[{ label: 'Tickets', href: '/dashboard/platform/tickets' }]}>
      <div className="flex flex-wrap items-center gap-3">
        <Status value={t.effectiveStatus ?? t.status} />
        <Meta>
          {label(t.category)}{t.severity === 'urgent' ? ' · urgent' : ''} · {label(t.channel)} · {when(t.createdAt, co.timezone)}
          {t.pastTarget ? ' · past the response target' : t.responseDueAt && !t.firstResponseAt ? ` · answer by ${when(t.responseDueAt, co.timezone)}` : ''}
          {t.assignedTo ? ` · ${t.assignedTo.name}` : ''}
        </Meta>
      </div>
      <p className="whitespace-pre-wrap text-sm">{t.description}</p>
      <div className="flex flex-wrap gap-2 text-sm">
        {t.callbackPhone || t.customer?.phone ? <a className="rounded-md border px-3 py-1.5" href={`tel:${t.callbackPhone || t.customer.phone}`}>Call {t.callbackPhone || t.customer.phone}</a> : null}
        {reach.whatsapp ? <a className="rounded-md border px-3 py-1.5" href={reach.whatsapp} target="_blank" rel="noreferrer">WhatsApp</a> : null}
        {reach.sms ? <a className="rounded-md border px-3 py-1.5" href={reach.sms}>SMS</a> : null}
        {reach.email ? <a className="rounded-md border px-3 py-1.5" href={reach.email}>Email</a> : null}
      </div>
      {t.system ? (
        <Meta>
          <Link className="underline" href={`/dashboard/platform/systems/${t.system.id}`}>{t.system.number}</Link> · {t.system.product?.name} · {label(t.system.status)}
          {' · warranty '}{t.system.warranties.filter((w: any) => !w.isVoid).map((w: any) => `${label(w.component)} to ${when(w.endsAt, co.timezone, 'date')}`).join(', ') || 'none'}
        </Meta>
      ) : null}

      {can ? (
        <div className="flex flex-wrap gap-2">
          {['open', 'reopened'].includes(t.status) ? act('triage', 'Triage') : null}
          {['open', 'triaged', 'reopened'].includes(t.status) ? act('phone_resolved', 'Fixed by phone', { ask: 'What fixed it?' }) : null}
          {['triaged', 'visit_scheduled', 'awaiting_customer_approval', 'reopened'].includes(t.status) ? act('start', 'Start work') : null}
          {['in_progress', 'visit_scheduled', 'triaged'].includes(t.status) ? act('resolve', 'Resolve', { ask: 'What fixed it?' }) : null}
          {['resolved', 'phone_resolved'].includes(t.status) ? act('close', 'Close') : null}
          {['resolved', 'phone_resolved'].includes(t.status) ? act('reopen', 'Reopen', { ask: 'Why is it reopened?' }) : null}
          {['open', 'triaged', 'visit_scheduled', 'awaiting_customer_approval', 'reopened'].includes(t.status) ? act('cancel', 'Cancel', { ask: 'Why is it cancelled?', className: 'border text-red-700' }) : null}
        </div>
      ) : null}
      {t.resolution ? <Meta>Resolution: {t.resolution}{t.customerConfirmed ? ' · customer confirmed' : ''}</Meta> : null}

      {g.troubleshootingGuides.length ? (
        <Section title="Troubleshooting guide">
          {g.troubleshootingGuides.map((x: any) => (
            <div key={x.id} className="space-y-1">
              <p className="text-sm font-medium">{x.title}</p>
              <ol className="list-decimal space-y-0.5 pl-5 text-sm">{String(x.stepsText ?? '').split('\n').filter(Boolean).map((s: string, i: number) => <li key={i}>{s.replace(/^\d+[.)]\s*/, '')}</li>)}</ol>
            </div>
          ))}
        </Section>
      ) : null}

      <Section title={`Warranty · ${label(t.warrantyDecision)}`}>
        {t.warrantyNote ? <Meta>{t.warrantyNote}{t.partReplaced ? ` · part ${t.partReplaced}` : ''}{t.supplierClaim ? ' · supplier claim' : ''}</Meta> : null}
        {can && isOpen ? (
          <CommandForm op="transitionTicket" submit="Record decision" paths={[path]}
            nest={{ input: { fields: ['warrantyDecision', 'reason', 'partReplaced', 'supplierClaim'], fixed: { ticketId: t.id, action: 'warranty' } } }}
            fields={[
              { name: 'warrantyDecision', label: 'Decision', kind: 'select', required: true, width: 'md', options: [{ value: 'covered', label: 'Covered' }, { value: 'not_covered', label: 'Not covered' }, { value: 'goodwill', label: 'Goodwill (free anyway)' }] },
              { name: 'reason', label: 'Why', width: 'lg' },
              { name: 'partReplaced', label: 'Part replaced', width: 'md' },
              { name: 'supplierClaim', label: 'Claim from supplier', kind: 'boolean', width: 'sm' },
            ]} />
        ) : null}
      </Section>

      <Section title="Repair quote">
        {t.quotes.map((x: any) => (
          <Row key={x.id} href={`/dashboard/platform/quotes/${x.id}`}>
            <span>{x.number}{x.options[0] ? ` · ${money(x.options[0].totalAmount, x.currencyCode)}` : ''}</span>
            <Meta>{x.order ? `${x.order.number} · ${label(x.order.status)}${x.order.balanceAmount > 0 ? ` · owing ${money(x.order.balanceAmount, x.order.currencyCode)}` : ' · paid'}` : 'share it from the quote page'}</Meta>
            <Status value={x.status} />
          </Row>
        ))}
        {!t.quotes.length ? <Empty>No repair quote.</Empty> : null}
        {me.can('canManageQuotes') || can ? (isOpen && t.warrantyDecision !== 'covered' ? <Link className="text-sm underline" href={`/dashboard/platform/quotes/new?ticketId=${t.id}`}>Write a repair quote</Link> : null) : null}
      </Section>

      <Section title="Visits">
        {t.visits.map((v: any) => <Row key={v.id} href={`/dashboard/platform/field/${v.id}`}><span>{v.number} · {label(v.type)}</span><Meta>{v.scheduledDate ?? 'not booked'} · {v.technicians.map((x: any) => x.name).join(', ')}</Meta><Status value={v.status} /></Row>)}
        {!t.visits.length ? <Empty>No visits.</Empty> : null}
        {me.can('canManageVisits') && isOpen && !booked && t.system ? (
          <div className="space-y-2 pt-2">
            <Meta>Book a service visit.</Meta>
            <SlotPicker create={{ type: 'service', ticketId: t.id }} from={todayIso(co.timezone)} techs={techs} timezone={co.timezone} submit="Book service visit" paths={[path, '/dashboard/platform/schedule']} />
          </div>
        ) : null}
      </Section>

      <Section title="Notes and calls">
        {can ? (
          <>
            <CommandForm op="addTicketNote" submit="Add note" fixed={{ ticketId: t.id }} paths={[path]}
              fields={[{ name: 'body', label: 'Note or call log', required: true, width: 'lg' }, { name: 'isCustomerVisible', label: 'Customer sees it', kind: 'boolean', width: 'sm' }]} />
            <CommandForm op="transitionTicket" submit="Assign" paths={[path]}
              nest={{ input: { fields: ['assignedToId'], fixed: { ticketId: t.id, action: 'assign' } } }}
              fields={[{ name: 'assignedToId', label: 'Owner', kind: 'select', width: 'md', defaultValue: t.assignedTo?.id ?? '', options: [{ value: '', label: 'Nobody' }, ...g.users.map((u: any) => ({ value: u.id, label: u.name }))] }]} />
          </>
        ) : null}
        {t.events.map((e: any) => (
          <Row key={e.id}><span className="whitespace-pre-wrap">{e.body}</span><Meta>{label(e.type)} · {e.user?.name ?? 'customer'} · {when(e.createdAt, co.timezone)}{e.isCustomerVisible ? ' · customer sees it' : ''}</Meta><span /></Row>
        ))}
      </Section>
    </Page>
  )
}
