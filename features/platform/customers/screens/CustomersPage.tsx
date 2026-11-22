import Link from 'next/link'
import { q, company, viewer } from '../../lib/server'
import { label, money } from '../../lib/format'
import { Page, Row, Section, Meta, Empty, Stat, Tabs } from '../../components/ui'
import { RecordForm } from '../../records/RecordForm'

const PATH = '/dashboard/platform/customers'
const TYPES = ['household', 'farm', 'institution']

/** P56: find a customer by name, phone, email or number; see what each has with us; add one. */
export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const sp = await searchParams
  const [co, me] = await Promise.all([company(), viewer()])
  const term = (sp.q ?? '').trim()
  const where: any = {}
  if (term) where.OR = ['name', 'phone', 'email', 'number', 'organisationName'].map(f => ({ [f]: { contains: term, mode: 'insensitive' } }))
  if (TYPES.includes(sp.type ?? '')) where.type = { equals: sp.type }
  let d: any
  try {
    d = await q<any>(`query($w: CustomerWhereInput!) {
      customers(where: $w, orderBy: [{ createdAt: desc }], take: 100) {
        id number type name organisationName phone email storeCreditAmount currencyCode
        ordersCount systemsCount ticketsCount(where: { status: { notIn: ["closed", "resolved"] } }) sites(take: 1) { city region }
      }
      total: customersCount
    }`, { w: where })
  } catch {
    return <Page title="Customers"><Empty>Your role cannot see customers. Ask the owner for access.</Empty></Page>
  }
  const canAdd = me.can('canManageLeads') || me.can('canManageOrders') || me.can('canManageTickets')

  return (
    <Page title="Customers">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat name="Customers" value={d.total} />
        <Stat name="With a system" value={d.customers.filter((c: any) => c.systemsCount).length + (d.customers.length < d.total ? '+' : '')} />
        <Stat name="Open tickets in view" value={d.customers.reduce((t: number, c: any) => t + c.ticketsCount, 0)} />
        <Stat name="Store credit in view" value={money(d.customers.reduce((t: number, c: any) => t + c.storeCreditAmount, 0), co.currencyCode)} />
      </div>
      <Tabs active={TYPES.includes(sp.type ?? '') ? sp.type! : 'all'} items={[{ key: 'all', label: 'All', href: `${PATH}${term ? `?q=${encodeURIComponent(term)}` : ''}` }, ...TYPES.map(t => ({ key: t, label: label(t), href: `${PATH}?type=${t}${term ? `&q=${encodeURIComponent(term)}` : ''}` }))]} />
      <form action={PATH} className="flex flex-wrap gap-2">
        {sp.type ? <input type="hidden" name="type" value={sp.type} /> : null}
        <input name="q" defaultValue={term} placeholder="Name, phone, email or number" className="h-9 w-full rounded-md border bg-background px-3 text-sm sm:w-80" />
        <button className="h-9 rounded-md border px-3 text-sm">Find</button>
      </form>
      <Section title={`${d.customers.length}${d.customers.length === 100 ? '+' : ''} customers`}>
        {d.customers.length ? d.customers.map((c: any) => (
          <Row key={c.id} href={`${PATH}/${c.id}`}>
            <span className="space-y-0.5">
              <span className="block font-medium">{c.name}{c.organisationName ? ` · ${c.organisationName}` : ''}</span>
              <Meta>{c.number} · {label(c.type)}{c.phone ? ` · ${c.phone}` : ''}{c.email ? ` · ${c.email}` : ''}{c.sites[0] ? ` · ${[c.sites[0].city, c.sites[0].region].filter(Boolean).join(', ')}` : ''}</Meta>
            </span>
            <Meta>{c.ordersCount} orders · {c.systemsCount} systems{c.ticketsCount ? ` · ${c.ticketsCount} open tickets` : ''}{c.storeCreditAmount ? ` · ${money(c.storeCreditAmount, c.currencyCode)} credit` : ''}</Meta>
          </Row>
        )) : <Empty>{term ? `Nobody matches “${term}”.` : 'No customers yet.'}</Empty>}
      </Section>
      {canAdd ? (
        <Section title="Add a customer">
          <RecordForm list="Customer" submit="Add customer" paths={[PATH]} fields={[
            { name: 'name', label: 'Name', required: true },
            { name: 'type', label: 'Type', kind: 'select', width: 'sm', options: TYPES.map(t => ({ value: t, label: label(t) })) },
            { name: 'organisationName', label: 'Farm, school or business' },
            { name: 'phone', label: 'Phone', kind: 'tel', width: 'sm' },
            { name: 'email', label: 'Email', kind: 'email' },
            { name: 'preferredContact', label: 'Best way to reach', kind: 'select', width: 'sm', options: ['whatsapp', 'call', 'sms', 'email'].map(v => ({ value: v, label: label(v) })) },
          ]} />
          <Meta>For someone asking about a system, add a lead instead so the sales follow-up starts.</Meta>
        </Section>
      ) : null}
    </Page>
  )
}
