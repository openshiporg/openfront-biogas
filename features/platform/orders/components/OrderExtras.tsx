import { q, company, viewer } from '../../lib/server'
import { label, money, when } from '../../lib/format'
import { Row, Section, Status, Meta, Empty } from '../../components/ui'
import { ActionButton } from '../../components/ActionButton'
import { CommandForm } from '../../components/CommandForm'
import { ChangeForm } from './ChangeForm'
import { ReturnForm } from './ReturnForm'

/**
 * P15 change a confirmed order (propose, approve with the extra to pay or the credit applied, reject); P17 take back
 * delivered parts into a stock location and refund them (restocking fee by policy); P18 issue an invoice for the order or
 * for one instalment, and void one. Mounted on orders/[id]; every action is a named staff operation.
 */
export async function OrderExtras({ orderId }: { orderId: string }) {
  const [co, me] = await Promise.all([company(), viewer()])
  const path = `/dashboard/platform/orders/${orderId}`
  const paths = [path, '/dashboard/platform/orders']
  const d = await q<any>(`query($id: ID!) {
    order(where: { id: $id }) {
      id number status currencyCode deliveredAt paidAmount refundedAmount
      lines { id kind name quantity returnedQuantity unitAmount product { id } }
      changes(orderBy: [{ createdAt: desc }]) { id status version description differenceAmount createdAt createdBy { name } }
      invoices(orderBy: [{ issuedAt: desc }]) { id number status version issuedAt dueAt totalAmount installment { label } }
      plan { installments(orderBy: [{ sequence: asc }]) { id label amount status invoice { id status } } }
    }
    products(where: { isPublished: { equals: true }, type: { not: { equals: "service" } } }, orderBy: [{ name: asc }]) { id name priceAmount currencyCode }
    stockLocations(where: { isActive: { equals: true } }, orderBy: [{ name: asc }]) { id name type }
    companySettings { returnWindowDays restockingFeePercent }
  }`, { id: orderId }).catch(() => null)
  const o = d?.order
  if (!o) return null
  const cur = o.currencyCode
  const canOrders = me.can('canManageOrders')
  const canRefund = me.can('canIssueRefunds')
  const canInvoice = me.can('canManageOrders') || me.can('canManagePayments')
  const finished = ['pending_payment', 'cancelled', 'completed', 'closed'].includes(o.status)
  const returnable = o.lines.filter((l: any) => l.kind === 'product' && l.product && l.quantity > l.returnedQuantity)
  const windowDays = d.companySettings?.returnWindowDays ?? 30
  const windowEnds = o.deliveredAt ? new Date(new Date(o.deliveredAt).getTime() + windowDays * 86400000) : null
  const canReturn = ['delivered', 'completed', 'closed'].includes(o.status) && (!windowEnds || windowEnds > new Date())
  const uninvoiced = (o.plan?.installments ?? []).filter((i: any) => !i.invoice || i.invoice.status === 'void')

  return (
    <>
      <Section title={`Changes · ${o.changes.length}`}>
        {o.changes.map((c: any) => (
          <Row key={c.id}>
            <span className="space-y-0.5">
              <span className="block">{c.description}</span>
              <Meta>{c.differenceAmount > 0 ? `${money(c.differenceAmount, cur)} more to pay` : c.differenceAmount < 0 ? `${money(-c.differenceAmount, cur)} less` : 'no price change'} · {c.createdBy?.name ?? ''} · {when(c.createdAt, co.timezone, 'date')}</Meta>
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <Status value={c.status} />
              {canOrders && c.status === 'proposed' ? (
                <>
                  <ActionButton op="decideOrderChange" vars={{ changeId: c.id, approve: true, expectedVersion: c.version }} paths={paths}
                    confirm={c.differenceAmount > 0 ? `Approve? The customer pays ${money(c.differenceAmount, cur)} more (a pay link is made; on a plan it goes on the last instalment).` : 'Approve the change?'}>Approve</ActionButton>
                  <ActionButton op="decideOrderChange" vars={{ changeId: c.id, approve: false, expectedVersion: c.version }} paths={paths} ask="Why is the change turned down?">Reject</ActionButton>
                </>
              ) : null}
            </span>
          </Row>
        ))}
        {canOrders && !finished ? (
          <ChangeForm orderId={o.id} paths={paths} products={d.products.map((p: any) => ({ value: p.id, label: `${p.name} · ${money(p.priceAmount, p.currencyCode)}` }))} />
        ) : !o.changes.length ? <Empty>{finished ? 'Changes are made to confirmed orders that are not finished.' : 'No changes.'}</Empty> : null}
      </Section>

      {canRefund && returnable.length && ['delivered', 'completed', 'closed'].includes(o.status) ? (
        <Section title="Return parts and refund">
          {canReturn ? (
            <>
              <Meta>Within {windowDays} days of delivery{windowEnds ? ` (until ${when(windowEnds.toISOString(), co.timezone, 'date')})` : ''}. The refund is what was paid for those items (tax included, less any order discount), paid back against the customer’s payments.</Meta>
              <ReturnForm orderId={o.id} paths={[...paths, '/dashboard/platform/inventory', '/dashboard/platform/payments']}
                lines={returnable.map((l: any) => ({ id: l.id, name: l.name, left: l.quantity - l.returnedQuantity }))}
                locations={d.stockLocations.map((l: any) => ({ value: l.id, label: l.name }))} />
            </>
          ) : <Empty>The {windowDays}-day return window has passed.</Empty>}
        </Section>
      ) : null}

      {canInvoice ? (
        <Section title={`Invoices · ${o.invoices.length}`}>
          {o.invoices.map((i: any) => (
            <Row key={i.id}>
              <span>{i.number} · {money(i.totalAmount, cur)}{i.installment ? ` · ${i.installment.label}` : ''}</span>
              <Meta>issued {when(i.issuedAt, co.timezone, 'date')} · due {when(i.dueAt, co.timezone, 'date')}</Meta>
              <span className="flex items-center gap-2">
                <Status value={i.status} />
                {i.status === 'issued' && me.can('canManagePayments') ? <ActionButton op="voidInvoice" vars={{ invoiceId: i.id, expectedVersion: i.version }} paths={paths} ask="Why is the invoice void?">Void</ActionButton> : null}
              </span>
            </Row>
          ))}
          {o.status !== 'cancelled' ? (
            <CommandForm op="issueInvoice" submit="Issue invoice" fixed={{ orderId: o.id }} paths={paths} fields={[
              { name: 'installmentId', label: 'For', kind: 'select', width: 'lg', options: [{ value: '', label: 'The whole order' }, ...uninvoiced.map((i: any) => ({ value: i.id, label: `${i.label} · ${money(i.amount, cur)} (${label(i.status)})` }))] },
              { name: 'dueDays', label: 'Due in days', kind: 'number', width: 'sm', defaultValue: '14' },
            ]} />
          ) : null}
        </Section>
      ) : null}
    </>
  )
}
