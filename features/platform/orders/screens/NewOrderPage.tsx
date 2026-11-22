import { q, viewer, siteUrl } from '../../lib/server'
import { money } from '../../lib/format'
import { Page, Section, Empty } from '../../components/ui'
import { StaffCart } from '../components/StaffCart'

/** P13: create an order for a walk-in or phone customer (parts, stoves, spares; systems go through a quote). */
export default async function NewOrderPage() {
  const me = await viewer()
  if (!me.can('canManageOrders')) return <Page title="New order" crumbs={[{ label: 'Orders', href: '/dashboard/platform/orders' }]}><Empty>Your role cannot make orders.</Empty></Page>
  const d = await q<any>(`{
    customers(orderBy: [{ name: asc }], take: 500) { id name phone number }
    products(where: { isPublished: { equals: true }, sellOnline: { equals: true }, type: { not: { equals: "service" } } }, orderBy: [{ name: asc }]) { id name sku priceAmount currencyCode availableQuantity type }
    branches(where: { isActive: { equals: true } }, orderBy: [{ name: asc }]) { id name }
  }`)
  return (
    <Page title="New order" crumbs={[{ label: 'Orders', href: '/dashboard/platform/orders' }]}>
      <Section title="Walk-in or phone order">
        <StaffCart base={siteUrl()}
          customers={d.customers.map((c: any) => ({ value: c.id, label: `${c.name} · ${c.phone || c.number}` }))}
          products={d.products.map((p: any) => ({ value: p.id, label: `${p.name} · ${money(p.priceAmount, p.currencyCode)} · ${p.availableQuantity ?? 0} free${p.type === 'digester_kit' ? ' (system: a quote is usual)' : ''}` }))}
          branches={d.branches.map((b: any) => ({ value: b.id, label: b.name }))} />
      </Section>
    </Page>
  )
}
