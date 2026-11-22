import Link from 'next/link'
import { q, company, viewer } from '../../lib/server'
import { contactLinks, label, money, when } from '../../lib/format'
import { Page, Row, Section, Status, Meta, Empty, Stat } from '../../components/ui'
import { RecordForm } from '../../records/RecordForm'

const SITE_TYPES = ['home', 'farm', 'school', 'hotel', 'hospital', 'restaurant', 'other']
const P = '/dashboard/platform'

/** P56: one customer. Sites, contacts, and everything they have with us: leads, quotes, orders, plans, systems, tickets, payments, service plans; store credit. */
export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [co, me] = await Promise.all([company(), viewer()])
  const d = await q<any>(`query($id: ID!) {
    customer(where: { id: $id }) {
      id number type name organisationName phone altPhone email preferredLanguage preferredContact contactConsent storeCreditAmount currencyCode notes referralCode createdAt
      user { email }
      sites { id label addressLine city region postcode country directions siteType }
      contacts { id name role phone email isPrimary }
      leads(orderBy: [{ createdAt: desc }]) { id number status createdAt }
      quotes(orderBy: [{ createdAt: desc }]) { id number status createdAt }
      orders(orderBy: [{ createdAt: desc }]) { id number status totalAmount balanceAmount currencyCode createdAt }
      plans { id status totalAmount paidAmount currencyCode order { number } }
      systems { id number status product { name } commissionedAt }
      tickets(orderBy: [{ createdAt: desc }]) { id number status category createdAt }
      payments(orderBy: [{ receivedAt: desc }], take: 20) { id status method amount currencyCode reference receivedAt }
      subscriptions { id status effectiveStatus plan { name } currentPeriodEnd }
      referralsMade { id status rewardAmount }
    }
  }`, { id }).catch(() => ({ customer: null }))
  const c = d.customer
  if (!c) return <Page title="Customer" crumbs={[{ label: 'Customers', href: `${P}/customers` }]}><Empty>Customer not found, or your role cannot see customers.</Empty></Page>
  const path = `${P}/customers/${c.id}`
  const canEdit = me.can('canManageLeads') || me.can('canManageOrders') || me.can('canManageTickets')
  const cl = contactLinks({ phone: c.phone, email: c.email, text: `Hello ${c.name.split(' ')[0]}, this is ${co.name}.` })
  const links = (['whatsapp', 'sms', 'call', 'email'] as const).filter(k => cl[k]).map(k => ({ href: cl[k] as string, label: { whatsapp: 'WhatsApp', sms: 'Text', call: 'Call', email: 'Email' }[k] }))
  const owing = c.orders.reduce((t: number, o: any) => t + (o.status === 'cancelled' ? 0 : o.balanceAmount ?? 0), 0)
  const List = ({ title, items, empty, render }: { title: string; items: any[]; empty: string; render: (x: any) => React.ReactNode }) => (
    <Section title={`${title} · ${items.length}`}>{items.length ? items.map(render) : <Empty>{empty}</Empty>}</Section>
  )

  return (
    <Page title={c.name} crumbs={[{ label: 'Customers', href: `${P}/customers` }]}>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-mono">{c.number}</span><Meta>{label(c.type)}{c.organisationName ? ` · ${c.organisationName}` : ''} · prefers {c.preferredContact === 'whatsapp' ? 'WhatsApp' : c.preferredContact === 'sms' ? 'text' : label(c.preferredContact).toLowerCase()} · since {when(c.createdAt, co.timezone, 'date')}{c.user ? ' · has an account' : ''}{c.referralCode ? ` · referral code ${c.referralCode}` : ''}</Meta>
        {links.map((l: any) => <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="rounded-md border px-2 py-1 text-xs">{l.label}</a>)}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat name="Owing on orders" value={money(owing, c.currencyCode)} />
        <Stat name="Store credit" value={money(c.storeCreditAmount, c.currencyCode)} />
        <Stat name="Systems" value={c.systems.length} />
        <Stat name="Open tickets" value={c.tickets.filter((t: any) => !['closed', 'resolved'].includes(t.status)).length} />
      </div>

      <List title="Systems" items={c.systems} empty="No installed system." render={(s: any) => <Row key={s.id} href={`${P}/systems/${s.id}`}><span>{s.number} · {s.product?.name}</span><Meta>{s.commissionedAt ? `commissioned ${when(s.commissionedAt, co.timezone, 'date')}` : ''}</Meta><Status value={s.status} /></Row>} />
      <List title="Orders" items={c.orders} empty="No orders." render={(o: any) => <Row key={o.id} href={`${P}/orders/${o.id}`}><span>{o.number} · {money(o.totalAmount, o.currencyCode)}</span><Meta>{o.balanceAmount ? `${money(o.balanceAmount, o.currencyCode)} owing · ` : ''}{when(o.createdAt, co.timezone, 'date')}</Meta><Status value={o.status} /></Row>} />
      <List title="Payment plans" items={c.plans} empty="No payment plan." render={(p: any) => <Row key={p.id} href={`${P}/plans/${p.id}`}><span>{p.order?.number ?? 'Plan'} · {money(p.paidAmount, p.currencyCode)} of {money(p.totalAmount, p.currencyCode)} paid</span><Status value={p.status} /></Row>} />
      <List title="Quotes" items={c.quotes} empty="No quotes." render={(x: any) => <Row key={x.id} href={`${P}/quotes/${x.id}`}><span>{x.number}</span><Meta>{when(x.createdAt, co.timezone, 'date')}</Meta><Status value={x.status} /></Row>} />
      <List title="Leads" items={c.leads} empty="No leads." render={(x: any) => <Row key={x.id} href={`${P}/leads/${x.id}`}><span>{x.number}</span><Meta>{when(x.createdAt, co.timezone, 'date')}</Meta><Status value={x.status} /></Row>} />
      <List title="Tickets" items={c.tickets} empty="No tickets." render={(t: any) => <Row key={t.id} href={`${P}/tickets/${t.id}`}><span>{t.number} · {label(t.category)}</span><Meta>{when(t.createdAt, co.timezone, 'date')}</Meta><Status value={t.status} /></Row>} />
      <List title="Service plans" items={c.subscriptions} empty="No service plan." render={(s: any) => <Row key={s.id} href={`${P}/service-plans`}><span>{s.plan?.name}</span><Meta>{s.currentPeriodEnd ? `to ${when(s.currentPeriodEnd, co.timezone, 'date')}` : ''}</Meta><Status value={s.effectiveStatus} /></Row>} />
      <List title="Latest payments" items={c.payments} empty="No payments." render={(p: any) => <Row key={p.id}><span>{money(p.amount, p.currencyCode)} · {label(p.method)} · <span className="font-mono text-xs">{p.reference}</span></span><Meta>{when(p.receivedAt, co.timezone)}</Meta><Status value={p.status} /></Row>} />

      <Section title={`Sites · ${c.sites.length}`}>
        {c.sites.map((s: any) => (
          <div key={s.id} className="space-y-1 border-b py-3 last:border-b-0">
            <div className="text-sm font-medium">{s.label || label(s.siteType)} <Meta>{[s.addressLine, s.city, s.region, s.postcode].filter(Boolean).join(', ')}</Meta></div>
            {s.directions ? <Meta>{s.directions}</Meta> : null}
            {canEdit ? (
              <details><summary className="cursor-pointer text-xs text-muted-foreground">Edit</summary>
                <RecordForm list="Site" id={s.id} submit="Save site" paths={[path]} className="mt-2" fields={[
                  { name: 'label', label: 'Name', defaultValue: s.label }, { name: 'siteType', label: 'Kind', kind: 'select', width: 'sm', defaultValue: s.siteType, options: SITE_TYPES.map(t => ({ value: t, label: label(t) })) },
                  { name: 'addressLine', label: 'Address', width: 'lg', defaultValue: s.addressLine }, { name: 'city', label: 'City', width: 'sm', defaultValue: s.city },
                  { name: 'region', label: 'State or county', width: 'sm', defaultValue: s.region }, { name: 'postcode', label: 'Postcode', width: 'sm', defaultValue: s.postcode },
                  { name: 'directions', label: 'Directions', kind: 'textarea', defaultValue: s.directions },
                ]} />
              </details>
            ) : null}
          </div>
        ))}
        {!c.sites.length ? <Empty>No site yet.</Empty> : null}
        {canEdit ? (
          <details><summary className="cursor-pointer text-xs text-muted-foreground">Add a site</summary>
            <RecordForm list="Site" fixed={{ customer: c.id }} submit="Add site" paths={[path]} className="mt-2" fields={[
              { name: 'label', label: 'Name' }, { name: 'siteType', label: 'Kind', kind: 'select', width: 'sm', options: SITE_TYPES.map(t => ({ value: t, label: label(t) })) },
              { name: 'addressLine', label: 'Address', width: 'lg', required: true }, { name: 'city', label: 'City', width: 'sm' }, { name: 'region', label: 'State or county', width: 'sm' }, { name: 'postcode', label: 'Postcode', width: 'sm' },
              { name: 'directions', label: 'Directions', kind: 'textarea' },
            ]} />
          </details>
        ) : null}
      </Section>

      <Section title={`Contacts · ${c.contacts.length}`}>
        {c.contacts.map((x: any) => <Row key={x.id}><span>{x.name}{x.role ? ` · ${x.role}` : ''}{x.isPrimary ? ' · main contact' : ''}</span><Meta>{[x.phone, x.email].filter(Boolean).join(' · ')}</Meta></Row>)}
        {!c.contacts.length ? <Empty>Only the customer. Add a farm manager, school bursar or family member.</Empty> : null}
        {canEdit ? (
          <RecordForm list="CustomerContact" fixed={{ customer: c.id }} submit="Add contact" paths={[path]} fields={[
            { name: 'name', label: 'Name', required: true }, { name: 'role', label: 'Role', width: 'sm' }, { name: 'phone', label: 'Phone', kind: 'tel', width: 'sm' }, { name: 'email', label: 'Email', kind: 'email' },
            { name: 'isPrimary', label: 'Main contact', kind: 'checkbox' },
          ]} />
        ) : null}
      </Section>

      {canEdit ? (
        <Section title="Details">
          <RecordForm list="Customer" id={c.id} submit="Save details" paths={[path]} fields={[
            { name: 'name', label: 'Name', required: true, defaultValue: c.name },
            { name: 'organisationName', label: 'Farm, school or business', defaultValue: c.organisationName },
            { name: 'type', label: 'Type', kind: 'select', width: 'sm', defaultValue: c.type, options: ['household', 'farm', 'institution'].map(v => ({ value: v, label: label(v) })) },
            { name: 'phone', label: 'Phone', kind: 'tel', width: 'sm', defaultValue: c.phone }, { name: 'altPhone', label: 'Other phone', kind: 'tel', width: 'sm', defaultValue: c.altPhone },
            { name: 'email', label: 'Email', kind: 'email', defaultValue: c.email },
            { name: 'preferredContact', label: 'Best way to reach', kind: 'select', width: 'sm', defaultValue: c.preferredContact, options: ['whatsapp', 'call', 'sms', 'email'].map(v => ({ value: v, label: label(v) })) },
            { name: 'preferredLanguage', label: 'Language', width: 'sm', defaultValue: c.preferredLanguage },
            { name: 'notes', label: 'Notes', kind: 'textarea', defaultValue: c.notes },
          ]} />
          <Meta>Store credit changes only through a referral reward, a refund to credit or applying it to an order.</Meta>
        </Section>
      ) : null}
    </Page>
  )
}
