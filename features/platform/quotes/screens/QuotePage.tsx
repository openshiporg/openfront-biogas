import Link from 'next/link'
import { notFound } from 'next/navigation'
import { q, company, viewer, requestTime } from '../../lib/server'
import { contactLinks, label, money, when } from '../../lib/format'
import { Page, Row, Section, Status, Meta, Empty } from '../../components/ui'
import { ActionButton } from '../../components/ActionButton'
import { CommandForm } from '../../components/CommandForm'
import { QuoteBuilder } from '../components/QuoteBuilder'
import { builderData } from './NewQuotePage'

/** P7 edit a draft; P8 approve; P9 send and share, new version; P11 accept on paper and take the deposit. */
export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const path = `/dashboard/platform/quotes/${id}`
  const [co, me] = await Promise.all([company(), viewer()])
  const d = await q<any>(`query($id: ID!) {
    quote(where: { id: $id }) {
      id number version casVersion kind status publicCode validUntil notes terms currencyCode totalAmount sentAt viewedAt signedName signedAt declinedReason isLatest
      customer { id name phone email } lead { id number } ticket { id number } preparedBy { name } approvedBy { name }
      options(orderBy: [{ sortOrder: asc }]) {
        id label description isRecommended subtotalAmount discountAmount taxAmount totalAmount
        lines { id kind description quantity unitAmount totalAmount product { id } }
        planOffers { id label schedule depositAmount instalmentAmount instalmentCount frequency planFeeAmount totalAmount template { id } }
      }
      acceptedOption { label } acceptedPlanOffer { label }
      order { id number publicCode status balanceAmount sessions(where: { status: { equals: "pending" } }, orderBy: [{ createdAt: desc }], take: 1) { publicCode amount } }
      previous { id number version }
    }
  }`, { id })
  const x = d.quote
  if (!x) notFound()
  const now = requestTime()
  const expired = ['sent', 'viewed'].includes(x.status) && x.validUntil && new Date(x.validUntil).getTime() < now
  const link = `${co.siteUrl}/quote/${x.publicCode}`
  const share = contactLinks({ phone: x.customer?.phone, email: x.customer?.email, text: `Hello ${x.customer?.name ?? ''}, your quote from ${co.name}: ${link}`, subject: `${co.name} quote ${x.number}` })
  const editable = ['draft', 'pending_approval', 'approved'].includes(x.status)
  const canQuote = me.can('canManageQuotes') || (x.kind === 'service' && me.can('canManageTickets'))
  const data = editable && canQuote ? await builderData() : null
  const session = x.order?.sessions?.[0]

  return (
    <Page title={`${x.number}${x.version > 1 ? ` v${x.version}` : ''} · ${x.customer?.name ?? ''}`} crumbs={[{ label: 'Quotes', href: '/dashboard/platform/quotes' }]}>
      <div className="flex flex-wrap items-center gap-3">
        <Status value={expired ? 'expired' : x.status} />
        <Meta>
          {x.lead ? <Link href={`/dashboard/platform/leads/${x.lead.id}`} className="underline">{x.lead.number}</Link> : null}
          {x.ticket ? <Link href={`/dashboard/platform/tickets/${x.ticket.id}`} className="underline">{x.ticket.number}</Link> : null}
          {' '}· by {x.preparedBy?.name ?? ''}{x.approvedBy ? ` · approved by ${x.approvedBy.name}` : ''}{x.sentAt ? ` · sent ${when(x.sentAt, co.timezone)}` : ''}{x.viewedAt ? ` · viewed ${when(x.viewedAt, co.timezone)}` : ''}{x.validUntil ? ` · valid to ${when(x.validUntil, co.timezone, 'date')}` : ''}
        </Meta>
      </div>
      {!x.isLatest ? <p className="text-sm text-amber-700">A newer version of this quote exists.</p> : null}
      {x.previous ? <Meta>Replaces <Link href={`/dashboard/platform/quotes/${x.previous.id}`} className="underline">{x.previous.number} v{x.previous.version}</Link></Meta> : null}
      {x.signedName ? <p className="text-sm">Accepted by {x.signedName} on {when(x.signedAt, co.timezone)}: {x.acceptedOption?.label}{x.acceptedPlanOffer ? `, ${x.acceptedPlanOffer.label}` : ''}.</p> : null}
      {x.declinedReason ? <p className="text-sm text-red-700">Declined: {x.declinedReason}</p> : null}

      <Section title="Actions">
        <div className="flex flex-wrap gap-2">
          {canQuote && editable && x.status !== 'pending_approval' ? <ActionButton op="sendQuote" vars={{ quoteId: x.id, expectedVersion: x.casVersion }} paths={[path, '/dashboard/platform/quotes']} className="border">Mark sent</ActionButton> : null}
          {x.status === 'pending_approval' && me.can('canApproveDiscounts') ? <ActionButton op="approveQuote" vars={{ quoteId: x.id, expectedVersion: x.casVersion }} paths={[path]} className="border">Approve discount</ActionButton> : null}
          {x.status === 'pending_approval' && !me.can('canApproveDiscounts') ? <Meta>The discount is over your limit; a sales manager or finance approves it before it can be sent.</Meta> : null}
          {canQuote && x.isLatest && ['sent', 'viewed', 'expired', 'declined'].includes(x.status) ? <ActionButton op="reviseQuote" vars={{ quoteId: x.id }} paths={['/dashboard/platform/quotes']} className="border">Issue a new version</ActionButton> : null}
          {canQuote && ['draft', 'pending_approval', 'approved', 'sent', 'viewed'].includes(x.status) ? <ActionButton op="cancelQuote" vars={{ quoteId: x.id, expectedVersion: x.casVersion }} ask="Why is this quote cancelled?" paths={[path]} className="border">Cancel</ActionButton> : null}
        </div>
        {['sent', 'viewed'].includes(x.status) ? (
          <div className="space-y-2">
            <p className="break-all font-mono text-sm">{link}</p>
            <div className="flex flex-wrap gap-2">
              {share.whatsapp ? <a href={share.whatsapp} target="_blank" rel="noreferrer" className="rounded-md border px-3 py-1.5 text-sm">WhatsApp</a> : null}
              {share.sms ? <a href={share.sms} className="rounded-md border px-3 py-1.5 text-sm">SMS</a> : null}
              {share.email ? <a href={share.email} className="rounded-md border px-3 py-1.5 text-sm">Email</a> : null}
              <a href={`/quote/${x.publicCode}`} target="_blank" rel="noreferrer" className="rounded-md border px-3 py-1.5 text-sm">Open as the customer sees it</a>
            </div>
            <CommandForm op="logContact" submit="Log that I shared it"
              nest={{ input: { fields: ['channel'], fixed: { purpose: 'quote_link', customerId: x.customer?.id ?? '', relatedType: x.lead ? 'Lead' : 'Quote', relatedId: x.lead?.id ?? x.id, note: `Shared ${x.number}` } } }}
              fields={[{ name: 'channel', label: 'How', kind: 'select', width: 'sm', options: ['whatsapp', 'sms', 'email', 'call', 'in_person'].map(v => ({ value: v, label: label(v) })) }]} />
          </div>
        ) : null}
      </Section>

      <Section title="Options">
        {x.options.map((o: any) => (
          <div key={o.id} className="space-y-1 rounded-lg border p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{o.label}{o.isRecommended ? ' · recommended' : ''}</span>
              <span className="font-mono text-sm">{money(o.totalAmount, x.currencyCode)}</span>
            </div>
            {o.description ? <Meta>{o.description}</Meta> : null}
            {o.lines.map((l: any) => (
              <Row key={l.id}><span>{l.quantity} × {l.description}</span><Meta>{label(l.kind)}</Meta><span className="font-mono text-xs">{money(l.totalAmount, x.currencyCode)}</span></Row>
            ))}
            <Meta>Tax {money(o.taxAmount, x.currencyCode)}{o.discountAmount ? ` · discount ${money(o.discountAmount, x.currencyCode)}` : ''}</Meta>
            {o.planOffers.length ? (
              <ul className="mt-2 space-y-1 text-sm">
                {o.planOffers.map((p: any) => (
                  <li key={p.id}>{p.label}: {Array.isArray(p.schedule) && p.schedule.length && !p.frequency ? p.schedule.map((m: any) => `${money(m.amount, x.currencyCode)} ${m.label.toLowerCase()}`).join(', ') : p.instalmentCount ? `${money(p.depositAmount, x.currencyCode)} now, then ${p.instalmentCount} × ${money(p.instalmentAmount, x.currencyCode)}${p.planFeeAmount ? ` (plan fee ${money(p.planFeeAmount, x.currencyCode)})` : ''}` : `${money(p.totalAmount, x.currencyCode)} in full`}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
        {!x.options.length ? <Empty>No options.</Empty> : null}
      </Section>

      {canQuote && ['sent', 'viewed'].includes(x.status) && x.isLatest && !expired ? (
        <Section title="Accept for the customer (signed on paper or by phone)">
          <CommandForm op="staffAcceptQuote" submit="Accept" fixed={{ quoteId: x.id }} paths={[path, '/dashboard/platform/orders']}
            fields={[
              { name: 'optionId', label: 'Option', kind: 'select', required: true, width: 'lg', options: x.options.map((o: any) => ({ value: o.id, label: `${o.label} · ${money(o.totalAmount, x.currencyCode)}` })) },
              { name: 'planOfferId', label: 'Payment plan (for that option)', kind: 'select', width: 'lg', options: [{ value: '', label: 'Pay in full' }, ...x.options.flatMap((o: any) => o.planOffers.filter((p: any) => p.instalmentCount > 0).map((p: any) => ({ value: p.id, label: `${o.label}: ${p.label}` })))] },
              { name: 'signedName', label: 'Signed by', required: true, defaultValue: x.customer?.name ?? '' },
            ]} />
          <Meta>A plan must belong to the option you pick.</Meta>
        </Section>
      ) : null}

      {x.order ? (
        <Section title="Order">
          <Row href={`/dashboard/platform/orders/${x.order.id}`}><span>{x.order.number}</span><Meta>owing {money(x.order.balanceAmount, x.currencyCode)}</Meta><Status value={x.order.status} /></Row>
          {session && me.can('canManagePayments') ? (
            <div className="space-y-1">
              <p className="text-sm">Take the {money(session.amount, x.currencyCode)} payment: record the reference the customer gave you. Finance records and verifies in one step.</p>
              <CommandForm op="recordOfflinePayment" submit="Record payment" fixed={{ sessionCode: session.publicCode }} paths={[path, `/dashboard/platform/orders/${x.order.id}`, '/dashboard/platform/payments']}
                fields={[
                  { name: 'provider', label: 'Method', kind: 'select', width: 'sm', options: ['bank_transfer', 'mobile_money', 'cash'].map(v => ({ value: v, label: label(v) })) },
                  { name: 'reference', label: 'Reference', required: true },
                  { name: 'payerPhone', label: 'Payer phone', kind: 'tel', width: 'sm' },
                ]} />
            </div>
          ) : session ? (
            <Meta>Pay link for the customer: <span className="break-all font-mono">{co.siteUrl}/pay/{session.publicCode}</span>. A reference they send in shows on Payments → To verify.</Meta>
          ) : null}
        </Section>
      ) : null}

      {data ? (
        <Section title="Edit draft">
          <QuoteBuilder products={data.products} templates={x.kind === 'service' ? [] : data.templates} currencyCode={x.currencyCode} target={{ quoteId: x.id, kind: x.kind }}
            initial={{ notes: x.notes ?? '', terms: x.terms ?? '', options: x.options.map((o: any) => ({
              label: o.label, description: o.description ?? '', isRecommended: o.isRecommended,
              planTemplateIds: o.planOffers.map((p: any) => p.template?.id).filter(Boolean),
              lines: o.lines.filter((l: any) => !(l.kind === 'labour' && l.description.startsWith('Installation: ')) && l.kind !== 'incentive' && !(l.kind === 'product' && !l.product)).map((l: any) => l.kind === 'product'
                ? { kind: 'product', productId: l.product.id, quantity: String(l.quantity) }
                : { kind: l.kind, description: l.description, quantity: String(l.quantity), amount: (Math.abs(l.unitAmount) / 100).toFixed(2) }),
            })) }} />
        </Section>
      ) : null}
    </Page>
  )
}
