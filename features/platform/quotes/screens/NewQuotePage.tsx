import { q, company } from '../../lib/server'
import { Page, Meta } from '../../components/ui'
import { CommandForm } from '../../components/CommandForm'
import { QuoteBuilder } from '../components/QuoteBuilder'

export async function builderData() {
  const d = await q<any>(`{
    products(where: { isPublished: { equals: true } }, orderBy: [{ type: asc }, { priceAmount: asc }]) { id name sku type priceAmount }
    paymentPlanTemplates(where: { isActive: { equals: true } }, orderBy: [{ sortOrder: asc }]) { id name kind }
  }`)
  return { products: d.products, templates: d.paymentPlanTemplates }
}

/** P7 start: a quote for a lead (from the lead page) or for a customer picked here. */
export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ leadId?: string; customerId?: string; ticketId?: string }> }) {
  const sp = await searchParams
  const co = await company()
  const kind = sp.ticketId ? 'service' : 'sale'
  const target = sp.leadId ? { leadId: sp.leadId } : sp.ticketId ? { ticketId: sp.ticketId } : sp.customerId ? { customerId: sp.customerId } : null
  const who = sp.leadId ? (await q<any>(`query($id: ID!) { lead(where: { id: $id }) { number customer { name } } }`, { id: sp.leadId })).lead
    : sp.ticketId ? (await q<any>(`query($id: ID!) { serviceTicket(where: { id: $id }) { number customer { name } } }`, { id: sp.ticketId })).serviceTicket
    : sp.customerId ? { number: '', customer: (await q<any>(`query($id: ID!) { customer(where: { id: $id }) { name } }`, { id: sp.customerId })).customer } : null
  const data = await builderData()
  return (
    <Page title="New quote" crumbs={[{ label: 'Quotes', href: '/dashboard/platform/quotes' }]}>
      {target ? (
        <>
          <Meta>For {who?.customer?.name ?? ''} {who?.number ? `(${who.number})` : ''}{kind === 'service' ? ' · paid repair' : ''}</Meta>
          <QuoteBuilder products={data.products} templates={kind === 'service' ? [] : data.templates} currencyCode={co.currencyCode} target={{ ...target, kind }} />
        </>
      ) : (
        <div className="space-y-2">
          <p className="text-sm">Quotes start from a lead or a ticket. Open the lead and choose “Build a quote”, or add the person as a lead first.</p>
          <CommandForm op="addLead" submit="Add lead" paths={['/dashboard/platform/leads']}
            nest={{ input: { fields: ['name', 'phone', 'email', 'postcode', 'region'], fixed: { source: 'phone', interest: 'home' } } }}
            fields={[{ name: 'name', label: 'Name', required: true }, { name: 'phone', label: 'Phone', kind: 'tel', width: 'sm' }, { name: 'email', label: 'Email', kind: 'email' }, { name: 'postcode', label: 'Postcode', width: 'sm' }, { name: 'region', label: 'Region', width: 'sm' }]} />
          <Meta>The new lead appears under Leads; build its quote from there.</Meta>
        </div>
      )}
    </Page>
  )
}
