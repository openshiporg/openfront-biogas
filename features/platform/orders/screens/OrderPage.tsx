import Link from 'next/link'
import { notFound } from 'next/navigation'
import { q, company, viewer } from '../../lib/server'
import { label, money, when } from '../../lib/format'
import { Page, Row, Section, Status, Meta, Empty } from '../../components/ui'
import { ActionButton } from '../../components/ActionButton'
import { CommandForm, type FormField } from '../../components/CommandForm'
import { FulfilStep } from '../components/FulfilStep'
import { OrderExtras } from '../components/OrderExtras'

/** The next fulfilment step for an order, by status and how it is fulfilled. */
function nextStep(status: string, fulfilment: string): { step: string; label: string } | null {
  if (status === 'confirmed') return { step: 'pick', label: 'Pick' }
  if (status === 'preparing') return { step: 'pack', label: 'Packed' }
  if (status === 'ready') return fulfilment === 'install' ? { step: 'out_for_install', label: 'Out for install' } : fulfilment === 'pickup' ? { step: 'handover', label: 'Handed over' } : { step: 'ship', label: 'Shipped' }
  if (status === 'shipped' || status === 'out_for_install') return { step: 'deliver', label: 'Delivered' }
  if (status === 'delivered' && fulfilment !== 'install') return { step: 'complete', label: 'Complete' }
  if (status === 'completed') return { step: 'close', label: 'Close' }
  return null
}

/** P14 one order: lines, money, plan, pick with serials, pack, ship or hand over, deliver; history from the audit trail. */
export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const path = `/dashboard/platform/orders/${id}`
  const [co, me] = await Promise.all([company(), viewer()])
  const d = await q<any>(`query($id: ID!, $eid: String!) {
    order(where: { id: $id }) {
      id number status version fulfilment channel publicCode currencyCode subtotalAmount discountAmount deliveryAmount taxAmount totalAmount paidAmount refundedAmount surveyFeeCreditAmount balanceAmount
      stockShort trackingNumber carrier cancelReason cancelledAt confirmedAt pickedAt deliveredAt completedAt createdAt shippingAddress
      customer { id name phone email } site { addressLine city region } branch { name } salesAgent { name } quote { id number }
      lines { id kind name sku quantity unitAmount totalAmount fulfilledQuantity warrantyMonths product { id isSerialized } }
      serializedUnits { id serialNumber status product { name } }
      installation { id number status }
      systems { id number status }
      sessions(where: { status: { equals: "pending" } }, orderBy: [{ createdAt: desc }]) { id publicCode amount purpose }
      payments(orderBy: [{ receivedAt: desc }]) { id status method amount reference receivedAt collectedBy { name } }
      plan { id status kind totalAmount paidAmount nextDueAt installments(orderBy: [{ sequence: asc }]) { id sequence label dueDate amount paidAmount status } }
    }
    auditEvents(where: { entityType: { equals: "Order" }, entityId: { equals: $eid } }, orderBy: [{ createdAt: desc }], take: 50) { id action actorLabel fromStatus toStatus reason createdAt }
  }`, { id, eid: id })
  const o = d.order
  if (!o) notFound()
  const cur = o.currencyCode
  const step = nextStep(o.status, o.fulfilment)
  const canFulfil = me.can('canManageOrders') || me.can('canManageInventory')
  const serialLines = o.lines.filter((l: any) => l.product?.isSerialized)
  const stepFields: FormField[] = step?.step === 'pick' && serialLines.length
    ? [{ name: 'serials', label: `Serial numbers (${serialLines.map((l: any) => `${l.quantity} × ${l.name}`).join(', ')}), comma or space between`, required: true, width: 'lg' }]
    : step?.step === 'ship' ? [{ name: 'carrier', label: 'Carrier', width: 'md' }, { name: 'trackingNumber', label: 'Tracking number', width: 'md' }] : []

  return (
    <Page title={`${o.number} · ${o.customer?.name ?? ''}`} crumbs={[{ label: 'Orders', href: '/dashboard/platform/orders' }]}>
      <div className="flex flex-wrap items-center gap-3">
        <Status value={o.status} />
        <Meta>
          {label(o.fulfilment)} · {o.branch?.name ?? ''} · {label(o.channel)}{o.salesAgent ? ` · ${o.salesAgent.name}` : ''}
          {o.quote ? <> · from <Link href={`/dashboard/platform/quotes/${o.quote.id}`} className="underline">{o.quote.number}</Link></> : null}
          {o.confirmedAt ? ` · paid ${when(o.confirmedAt, co.timezone)}` : ''}
        </Meta>
      </div>
      <Meta>{[o.customer?.phone, o.customer?.email].filter(Boolean).join(' · ')}{o.site ? ` · ${[o.site.addressLine, o.site.city, o.site.region].filter(Boolean).join(', ')}` : ''}</Meta>
      {o.stockShort ? <p className="text-sm text-amber-700">Short of stock: picking reserves again once it comes in.</p> : null}
      {o.cancelReason ? <p className="text-sm text-red-700">Cancelled {when(o.cancelledAt, co.timezone)}: {o.cancelReason}</p> : null}

      {canFulfil && step ? (
        <Section title="Next step">
          {stepFields.length ? (
            <FulfilStep orderId={o.id} version={o.version} step={step.step} submit={step.label} fields={stepFields} paths={[path, '/dashboard/platform/orders']} />
          ) : (
            <ActionButton op="fulfilOrder" vars={{ input: { orderId: o.id, step: step.step, expectedVersion: o.version } }} paths={[path, '/dashboard/platform/orders']} className="border">{step.label}</ActionButton>
          )}
          {o.fulfilment === 'install' && ['ready', 'out_for_install'].includes(o.status) ? <Meta>Install orders become installed when the technician commissions the system.</Meta> : null}
        </Section>
      ) : null}

      <Section title="Lines">
        {o.lines.map((l: any) => (
          <Row key={l.id}><span>{l.quantity} × {l.name} <span className="font-mono text-xs text-muted-foreground">{l.sku}</span></span><Meta>{label(l.kind)}{l.warrantyMonths ? ` · ${l.warrantyMonths} mo warranty` : ''}{l.fulfilledQuantity ? ` · ${l.fulfilledQuantity} fulfilled` : ''}</Meta><span className="font-mono text-xs">{money(l.totalAmount, cur)}</span></Row>
        ))}
        <Meta>Subtotal {money(o.subtotalAmount, cur)}{o.discountAmount ? ` · discount ${money(o.discountAmount, cur)}` : ''}{o.deliveryAmount ? ` · delivery ${money(o.deliveryAmount, cur)}` : ''} · tax {money(o.taxAmount, cur)} · total {money(o.totalAmount, cur)}</Meta>
        <p className="text-sm">Paid {money(o.paidAmount, cur)}{o.refundedAmount ? ` · refunded ${money(o.refundedAmount, cur)}` : ''}{o.surveyFeeCreditAmount ? ` · survey fee credited ${money(o.surveyFeeCreditAmount, cur)}` : ''} · <span className="font-medium">owing {money(o.balanceAmount, cur)}</span></p>
      </Section>

      {o.serializedUnits.length ? (
        <Section title="Serial numbers">
          {o.serializedUnits.map((u: any) => <Row key={u.id}><span className="font-mono text-sm">{u.serialNumber}</span><Meta>{u.product?.name}</Meta><Status value={u.status} /></Row>)}
        </Section>
      ) : null}

      {o.installation || o.systems.length ? (
        <Section title="Installation">
          {o.installation ? <Row href={`/dashboard/platform/installations/${o.installation.id}`}><span>{o.installation.number}</span><Status value={o.installation.status} /></Row> : null}
          {o.systems.map((s: any) => <Row key={s.id} href={`/dashboard/platform/systems/${s.id}`}><span>System {s.number}</span><Status value={s.status} /></Row>)}
        </Section>
      ) : null}

      <Section title="Payments">
        {o.payments.map((p: any) => (
          <Row key={p.id}><span>{money(p.amount, cur)} · {label(p.method)} · <span className="font-mono text-xs">{p.reference}</span></span><Meta>{when(p.receivedAt, co.timezone)}{p.collectedBy ? ` · taken by ${p.collectedBy.name}` : ''}</Meta><Status value={p.status} /></Row>
        ))}
        {!o.payments.length ? <Empty>No payments yet.</Empty> : null}
        {o.sessions.map((s: any) => (
          <div key={s.id} className="space-y-1">
            <Meta>Open pay link {label(s.purpose)} {money(s.amount, cur)}: <span className="break-all font-mono">{co.siteUrl}/pay/{s.publicCode}</span></Meta>
            {me.can('canManagePayments') ? (
              <CommandForm op="recordOfflinePayment" submit="Record payment" fixed={{ sessionCode: s.publicCode }} paths={[path, '/dashboard/platform/payments']}
                fields={[
                  { name: 'provider', label: 'Method', kind: 'select', width: 'sm', options: ['bank_transfer', 'mobile_money', 'cash'].map(v => ({ value: v, label: label(v) })) },
                  { name: 'reference', label: 'Reference', required: true },
                  { name: 'payerPhone', label: 'Payer phone', kind: 'tel', width: 'sm' },
                ]} />
            ) : null}
          </div>
        ))}
        {!o.sessions.length && o.balanceAmount > 0 && (me.can('canManagePayments') || me.can('canManageOrders')) && !['cancelled', 'pending_payment'].includes(o.status) ? (
          <CommandForm op="createPayLink" submit="Make a pay link" paths={[path]} nest={{ input: { fields: ['amount'], fixed: { orderId: o.id } } }}
            fields={[{ name: 'amount', label: `Amount (blank for the ${money(o.balanceAmount, cur)} owing)`, kind: 'money', width: 'lg' }]} />
        ) : null}
      </Section>

      {o.plan ? (
        <Section title={`Payment plan · ${label(o.plan.status)}`}>
          {o.plan.installments.map((i: any) => (
            <Row key={i.id}><span>{i.label}</span><Meta>{i.dueDate ? `due ${when(i.dueDate, co.timezone, 'date')} · ` : ''}{money(i.paidAmount, cur)} of {money(i.amount, cur)}</Meta><Status value={i.status} /></Row>
          ))}
        </Section>
      ) : null}

      {me.can('canManageOrders') && !['cancelled', 'installed', 'completed', 'closed'].includes(o.status) ? (
        <Section title="Cancel">
          <Meta>The refund follows the cancellation policy: within the cooling-off window it is in full; before picking, the deposit less the survey fee.</Meta>
          <CommandForm op="cancelOrder" submit="Cancel order" paths={[path, '/dashboard/platform/orders']}
            nest={{ input: { fields: ['reason', 'byCompany', 'payoutReference'], fixed: { orderId: o.id } } }}
            fields={[{ name: 'reason', label: 'Reason', required: true, width: 'lg' }, { name: 'byCompany', label: 'We cancel (full refund)', kind: 'boolean', width: 'md' }, ...(o.paidAmount > 0 ? [{ name: 'payoutReference', label: 'Reference of the refund you sent', width: 'md' as const }] : [])]} />
        </Section>
      ) : null}

      <OrderExtras orderId={o.id} />

      {me.can('canManageSettings') || me.can('canReadReports') ? <Section title="History">
        {d.auditEvents.map((e: any) => (
          <Row key={e.id}><span>{label(e.action.replace(/^order\./, ''))}{e.reason ? `: ${e.reason}` : ''}</span><Meta>{e.actorLabel ?? ''} · {when(e.createdAt, co.timezone)}</Meta>{e.toStatus ? <Status value={e.toStatus} /> : <span />}</Row>
        ))}
        {!d.auditEvents.length ? <Empty>No history yet.</Empty> : null}
      </Section> : null}
    </Page>
  )
}
