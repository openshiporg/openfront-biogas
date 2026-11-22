import Link from 'next/link'
import { q, company } from '../../lib/server'
import { label, money, when } from '../../lib/format'
import { Page, Row, Section, Status, Tabs, Meta, Empty } from '../../components/ui'

const VIEWS = [
  { key: 'pick', label: 'To pick and pack', status: ['confirmed', 'preparing'] },
  { key: 'payment', label: 'Awaiting payment', status: ['pending_payment'] },
  { key: 'moving', label: 'Ready and on the way', status: ['ready', 'shipped', 'out_for_install'] },
  { key: 'done', label: 'Delivered and installed', status: ['delivered', 'installed', 'completed'] },
  { key: 'closed', label: 'Closed and cancelled', status: ['closed', 'cancelled'] },
]

/** P12 orders by stage; short-stock orders say so, and a paid order goes to the pick list. */
export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams
  const view = VIEWS.find(v => v.key === sp.view) ?? VIEWS[0]
  const co = await company()
  const d = await q<any>(`query($s: [String!]) {
    orders(where: { status: { in: $s } }, orderBy: [{ createdAt: desc }], take: 200) { id number status fulfilment channel totalAmount balanceAmount currencyCode stockShort createdAt confirmedAt customer { name } branch { name } plan { status } lines(where: { kind: { equals: "product" } }) { name quantity } }
    ${VIEWS.map(v => `${v.key}: ordersCount(where: { status: { in: ${JSON.stringify(v.status)} } })`).join('\n')}
  }`, { s: view.status })
  return (
    <Page title="Orders">
      <Tabs active={view.key} items={VIEWS.map(v => ({ key: v.key, label: v.label, href: `/dashboard/platform/orders?view=${v.key}`, count: d[v.key] }))} />
      <Section title={view.label}>
        {d.orders.length ? d.orders.map((o: any) => (
          <Row key={o.id}>
            <Link href={`/dashboard/platform/orders/${o.id}`} className="min-w-0 break-words hover:underline">{o.number} · {o.customer?.name ?? ''} · {o.lines.map((l: any) => `${l.quantity} × ${l.name}`).join(', ')}</Link>
            <Meta>{label(o.fulfilment)} · {o.branch?.name ?? ''} · {money(o.totalAmount, o.currencyCode)}{o.balanceAmount > 0 ? ` · owing ${money(o.balanceAmount, o.currencyCode)}` : ''}{o.plan ? ` · plan ${label(o.plan.status)}` : ''} · {when(o.confirmedAt ?? o.createdAt, co.timezone)}{o.stockShort ? ' · short of stock' : ''}</Meta>
            <Status value={o.status} />
          </Row>
        )) : <Empty>No orders here.</Empty>}
      </Section>
    </Page>
  )
}
