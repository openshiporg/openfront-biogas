import Link from 'next/link'
import { q, company, viewer } from '../../lib/server'
import { money, when } from '../../lib/format'
import { Page, Row, Section, Status, Tabs, Meta, Empty, Stat } from '../../components/ui'
import { ActionButton } from '../../components/ActionButton'
import { CommandForm, type FormField } from '../../components/CommandForm'
import { RecordForm } from '../../records/RecordForm'
import { NewPurchaseOrder } from '../components/NewPurchaseOrder'

const PATH = '/dashboard/platform/purchasing'
const VIEWS = [
  { key: 'open', label: 'Open', match: ['draft', 'sent', 'partially_received'] },
  { key: 'received', label: 'Received', match: ['received', 'closed'] },
  { key: 'cancelled', label: 'Cancelled', match: ['cancelled'] },
  { key: 'suppliers', label: 'Suppliers', match: [] as string[] },
] as const

/**
 * P54: suppliers and purchase orders. Draft an order, send it, receive what arrived against each line (serial numbers for
 * serialised kits) into its location, close it. Moves go through savePurchaseOrder, transitionPurchaseOrder and
 * receivePurchaseOrder; receiving writes stock movements and updates the product's cost.
 */
export default async function PurchasingPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams
  const view = VIEWS.find(v => v.key === sp.view) ?? VIEWS[0]
  const [co, me] = await Promise.all([company(), viewer()])
  if (!me.can('canManageInventory') && !me.can('canReadReports')) {
    return <Page title="Purchasing"><Empty>Your role cannot see purchasing. Ask the owner for inventory access.</Empty></Page>
  }
  const canEdit = me.can('canManageInventory')
  const d = await q<any>(`{
    purchaseOrders(orderBy: [{ createdAt: desc }], take: 200) {
      id number status version expectedAt notes totalAmount currencyCode createdAt
      supplier { id name phone email } location { id name }
      lines { id quantity receivedQuantity unitCostAmount product { id name sku isSerialized } }
    }
    suppliers(orderBy: [{ name: asc }]) { id name contact phone email country leadTimeDays }
    stockLocations(where: { isActive: { equals: true } }, orderBy: [{ name: asc }]) { id name }
    products(where: { type: { not: { equals: "service" } } }, orderBy: [{ name: asc }]) { id name sku unitCostAmount }
  }`)
  const pos: any[] = d.purchaseOrders
  const count = (m: readonly string[]) => pos.filter(p => m.includes(p.status)).length
  const list = pos.filter(p => (view.match as readonly string[]).includes(p.status))
  const onOrder = pos.filter(p => ['sent', 'partially_received'].includes(p.status)).reduce((t, p) => t + p.lines.reduce((s: number, l: any) => s + (l.quantity - (l.receivedQuantity ?? 0)) * l.unitCostAmount, 0), 0)
  const late = pos.filter(p => ['sent', 'partially_received'].includes(p.status) && p.expectedAt && new Date(p.expectedAt) < new Date()).length

  return (
    <Page title="Purchasing">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat name="Drafts" value={count(['draft'])} />
        <Stat name="With suppliers" value={count(['sent', 'partially_received'])} />
        <Stat name="Late" value={late} />
        <Stat name="Still to arrive" value={money(onOrder, co.currencyCode)} />
      </div>
      <Tabs active={view.key} items={VIEWS.map(v => ({ key: v.key, label: v.label, href: `${PATH}?view=${v.key}`, count: v.key === 'suppliers' ? d.suppliers.length : count(v.match) }))} />

      {view.key === 'suppliers' ? (
        <Section title="Suppliers">
          {d.suppliers.map((s: any) => (
            <div key={s.id} className="space-y-2 border-b py-3 last:border-b-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{s.name}</span>
                <Meta>{[s.contact, s.phone, s.email, s.country].filter(Boolean).join(' · ')}{s.leadTimeDays ? ` · ${s.leadTimeDays} days to deliver` : ''} · {pos.filter(p => p.supplier?.id === s.id).length} orders</Meta>
              </div>
              {canEdit ? (
                <details>
                  <summary className="cursor-pointer text-xs text-muted-foreground">Edit</summary>
                  <RecordForm list="Supplier" id={s.id} submit="Save" paths={[PATH]} className="mt-2" fields={[
                    { name: 'name', label: 'Name', required: true, defaultValue: s.name }, { name: 'contact', label: 'Contact', defaultValue: s.contact },
                    { name: 'phone', label: 'Phone', kind: 'tel', width: 'sm', defaultValue: s.phone }, { name: 'email', label: 'Email', kind: 'email', defaultValue: s.email },
                    { name: 'country', label: 'Country', width: 'sm', defaultValue: s.country }, { name: 'leadTimeDays', label: 'Days to deliver', kind: 'number', width: 'sm', defaultValue: String(s.leadTimeDays ?? '') },
                  ]} />
                </details>
              ) : null}
            </div>
          ))}
          {!d.suppliers.length ? <Empty>No suppliers yet.</Empty> : null}
          {canEdit ? (
            <div className="space-y-2 pt-2">
              <Meta>Add a supplier</Meta>
              <RecordForm list="Supplier" submit="Add supplier" paths={[PATH]} fields={[
                { name: 'name', label: 'Name', required: true }, { name: 'contact', label: 'Contact' }, { name: 'phone', label: 'Phone', kind: 'tel', width: 'sm' },
                { name: 'email', label: 'Email', kind: 'email' }, { name: 'country', label: 'Country', width: 'sm' }, { name: 'leadTimeDays', label: 'Days to deliver', kind: 'number', width: 'sm' },
              ]} />
            </div>
          ) : null}
        </Section>
      ) : (
        <Section title={`${view.label} · ${list.length}`}>
          {list.length ? list.map(p => {
            const vars = { purchaseOrderId: p.id, expectedVersion: p.version }
            const open = p.lines.filter((l: any) => (l.receivedQuantity ?? 0) < l.quantity)
            const receiveFields: FormField[] = open.flatMap((l: any, i: number) => {
              const left = l.quantity - (l.receivedQuantity ?? 0)
              const f: FormField[] = [
                { name: `lines.${i}.lineId`, label: '', kind: 'hidden', defaultValue: l.id },
                { name: `lines.${i}.quantity`, label: `${l.product?.name} (${left} expected)`, kind: 'number', width: 'md', defaultValue: String(left) },
              ]
              if (l.product?.isSerialized) f.push({ name: `lines.${i}.serialNumbers`, label: 'Serial numbers, comma separated', width: 'lg' })
              return f
            })
            return (
              <div key={p.id} className="space-y-2 border-b py-3 last:border-b-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{p.number} · {p.supplier?.name ?? ''} · {money(p.totalAmount, p.currencyCode)}</span>
                  <Status value={p.status} />
                </div>
                <Meta>
                  To {p.location?.name ?? 'no location'} · made {when(p.createdAt, co.timezone, 'date')}
                  {p.expectedAt ? ` · expected ${when(p.expectedAt, co.timezone, 'date')}` : ''}{p.notes ? ` · ${p.notes}` : ''}
                  {p.supplier?.email ? <> · <a className="underline" href={`mailto:${p.supplier.email}?subject=${encodeURIComponent(`Purchase order ${p.number}`)}`}>email supplier</a></> : null}
                </Meta>
                <div>
                  {p.lines.map((l: any) => (
                    <div key={l.id} className="flex flex-wrap justify-between gap-2 text-sm">
                      <span>{l.product?.name ?? ''} <Meta>{l.product?.sku}</Meta></span>
                      <span className="font-mono text-xs">{l.receivedQuantity ?? 0} of {l.quantity} received · {money(l.unitCostAmount, p.currencyCode)} each</span>
                    </div>
                  ))}
                </div>
                {canEdit ? (
                  <div className="flex flex-wrap items-end gap-2">
                    {p.status === 'draft' ? <ActionButton op="transitionPurchaseOrder" vars={{ ...vars, action: 'send' }} paths={[PATH]} confirm={`Mark ${p.number} as sent to ${p.supplier?.name ?? 'the supplier'}?`}>Mark sent</ActionButton> : null}
                    {['draft', 'sent'].includes(p.status) ? <ActionButton op="transitionPurchaseOrder" vars={{ ...vars, action: 'cancel' }} paths={[PATH]} ask="Why is the order cancelled?">Cancel</ActionButton> : null}
                    {['partially_received', 'received'].includes(p.status) ? <ActionButton op="transitionPurchaseOrder" vars={{ ...vars, action: 'close' }} paths={[PATH]} ask={p.status === 'partially_received' ? 'Close with lines still to come? Say why.' : 'Note for closing (optional)'}>Close</ActionButton> : null}
                  </div>
                ) : null}
                {canEdit && ['sent', 'partially_received'].includes(p.status) && open.length ? (
                  <details>
                    <summary className="cursor-pointer text-xs text-muted-foreground">Receive what arrived</summary>
                    <CommandForm op="receivePurchaseOrder" submit="Receive into stock" className="mt-2" paths={[PATH, '/dashboard/platform/inventory']}
                      fixed={vars} rows={{ lines: { count: open.length, fields: ['lineId', 'quantity', 'serialNumbers'], requires: 'quantity', split: ['serialNumbers'] } }}
                      fields={[...receiveFields, { name: 'locationId', label: 'Into', kind: 'select', width: 'md', defaultValue: p.location?.id, options: d.stockLocations.map((l: any) => ({ value: l.id, label: l.name })) }]} />
                  </details>
                ) : null}
              </div>
            )
          }) : <Empty>{view.key === 'open' ? 'No open purchase orders. Draft one below; the low-stock list under Inventory shows what to order.' : 'None here.'}</Empty>}
        </Section>
      )}

      {canEdit && view.key === 'open' ? (
        <Section title="New purchase order" aside={<Link className="text-xs underline" href="/dashboard/platform/inventory?view=low">Low stock</Link>}>
          {d.suppliers.length ? (
            <NewPurchaseOrder path={PATH}
              suppliers={d.suppliers.map((s: any) => ({ value: s.id, label: s.name }))}
              locations={d.stockLocations.map((l: any) => ({ value: l.id, label: l.name }))}
              products={d.products.map((p: any) => ({ value: p.id, label: `${p.name}${p.unitCostAmount ? ` (last cost ${money(p.unitCostAmount, co.currencyCode)})` : ''}` }))} />
          ) : <Empty>Add a supplier first under the Suppliers tab.</Empty>}
        </Section>
      ) : null}
    </Page>
  )
}
