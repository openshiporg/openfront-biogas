import Link from 'next/link'
import { notFound } from 'next/navigation'
import { q, company, viewer, requestTime } from '../../lib/server'
import { contactLinks, label, money, when } from '../../lib/format'
import { Page, Row, Section, Status, Meta, Empty } from '../../components/ui'
import { ActionButton } from '../../components/ActionButton'
import { CommandForm } from '../../components/CommandForm'
import { AreaCheck, SizeForm } from '../components/LeadTools'

const LOST_REASONS = ['Price too high', 'Bought from another company', 'No space or water on site', 'Not enough feed', 'No longer interested', 'Could not reach them']

/** P4 contact log, one-tap contact, assign, mark lost; P5 size a system; P6 check the service area. */
export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const path = `/dashboard/platform/leads/${id}`
  const [co, me] = await Promise.all([company(), viewer()])
  const d = await q<any>(`query($id: ID!) {
    lead(where: { id: $id }) {
      id number status version source interest message firstResponseDueAt firstContactAt lostReason createdAt
      customer { id number name phone email preferredContact preferredLanguage }
      site { addressLine city region postcode country siteType animals peopleServed kitchenWasteKgPerDay serviceArea { name } }
      assignedTo { id name } branch { name } referral { referrer { name } }
      activities(orderBy: [{ at: desc }]) { id type summary outcome at user { name } }
      assessments(orderBy: [{ createdAt: desc }], take: 3) { id estimatedGasM3 cookingHours paybackMonths createdAt recommendedProduct { name priceAmount } }
      quotes(orderBy: [{ createdAt: desc }]) { id number status totalAmount currencyCode isLatest }
      visits(orderBy: [{ createdAt: desc }]) { id number type status windowStart }
    }
  }`, { id })
  const l = d.lead
  if (!l) notFound()
  const agents = me.can('canSeeAllLeads') ? (await q<any>(`{ users(where: { isActive: { equals: true }, role: { canManageLeads: { equals: true } } }, orderBy: [{ name: asc }]) { id name } }`).catch(() => ({ users: [] }))).users : []
  const links = contactLinks({ phone: l.customer?.phone, email: l.customer?.email, text: `Hello ${l.customer?.name ?? ''}, this is ${me.name} from ${co.name} about your biogas enquiry.`, subject: `${co.name}: your biogas enquiry` })
  const late = l.status === 'new' && !l.firstContactAt && l.firstResponseDueAt && new Date(l.firstResponseDueAt).getTime() < requestTime()
  const s = l.site ?? {}
  const open = ['new', 'contacted', 'survey_scheduled', 'surveyed', 'quoted'].includes(l.status)

  return (
    <Page title={`${l.number} · ${l.customer?.name ?? ''}`} crumbs={[{ label: 'Leads', href: '/dashboard/platform/leads' }]}>
      <div className="flex flex-wrap items-center gap-3">
        <Status value={l.status} />
        {late ? <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">First contact late</span> : null}
        <Meta>{label(l.interest)} · {label(l.source)} · {l.branch?.name ?? ''} · came in {when(l.createdAt, co.timezone)}{l.referral?.referrer ? ` · referred by ${l.referral.referrer.name}` : ''}</Meta>
      </div>
      {l.message ? <p className="text-sm">“{l.message}”</p> : null}
      {l.lostReason ? <p className="text-sm text-red-700">Lost: {l.lostReason}</p> : null}

      <Section title="Contact">
        <p className="text-sm">{l.customer?.phone ?? ''}{l.customer?.email ? ` · ${l.customer.email}` : ''}{l.customer?.preferredContact ? ` · prefers ${label(l.customer.preferredContact)}` : ''}</p>
        <div className="flex flex-wrap gap-2">
          {links.whatsapp ? <a href={links.whatsapp} target="_blank" rel="noreferrer" className="rounded-md border px-3 py-1.5 text-sm">WhatsApp</a> : null}
          {links.sms ? <a href={links.sms} className="rounded-md border px-3 py-1.5 text-sm">SMS</a> : null}
          {links.call ? <a href={links.call} className="rounded-md border px-3 py-1.5 text-sm">Call</a> : null}
          {links.email ? <a href={links.email} className="rounded-md border px-3 py-1.5 text-sm">Email</a> : null}
        </div>
        <CommandForm
          op="logContact" submit="Log contact" paths={[path, '/dashboard/platform/leads']}
          nest={{ input: { fields: ['channel', 'purpose', 'note'], fixed: { relatedType: 'Lead', relatedId: l.id } } }}
          fields={[
            { name: 'channel', label: 'How', kind: 'select', width: 'sm', options: ['call', 'whatsapp', 'sms', 'email', 'in_person'].map(v => ({ value: v, label: label(v) })) },
            { name: 'purpose', label: 'About', kind: 'select', width: 'sm', options: ['follow_up', 'visit_date', 'quote_link', 'other'].map(v => ({ value: v, label: label(v) })) },
            { name: 'note', label: 'What was said', width: 'lg' },
          ]}
        />
      </Section>

      {me.can('canManageLeads') && open ? (
        <Section title="Move">
          <div className="flex flex-wrap gap-2">
            {l.status === 'new' ? <ActionButton op="transitionLead" vars={{ leadId: l.id, to: 'contacted', expectedVersion: l.version }} paths={[path]} className="border">Mark contacted</ActionButton> : null}
            <ActionButton op="transitionLead" vars={{ leadId: l.id, to: 'lost', expectedVersion: l.version }} choices={LOST_REASONS.map(r => ({ value: r, label: r }))} paths={[path]} className="border">Mark lost</ActionButton>
            <ActionButton op="transitionLead" vars={{ leadId: l.id, to: 'unqualified', expectedVersion: l.version }} ask="Why is this lead not a fit?" paths={[path]} className="border">Not a fit</ActionButton>
            <Link href={`/dashboard/platform/quotes/new?leadId=${l.id}`} className="rounded-md border px-3 py-1.5 text-sm font-medium">Build a quote</Link>
            {me.can('canManageVisits') ? <Link href={`/dashboard/platform/schedule?leadId=${l.id}&type=survey`} className="rounded-md border px-3 py-1.5 text-sm font-medium">Book a survey</Link> : null}
          </div>
        </Section>
      ) : null}
      {me.can('canManageLeads') && l.status === 'lost' ? <ActionButton op="transitionLead" vars={{ leadId: l.id, to: 'new', expectedVersion: l.version }} paths={[path]} className="border">Reopen</ActionButton> : null}

      <Section title={`Assigned to ${l.assignedTo?.name ?? 'nobody'}`}>
        {agents.length ? (
          <CommandForm op="assignLead" submit="Assign" fixed={{ leadId: l.id, expectedVersion: l.version }} paths={[path]}
            fields={[{ name: 'userId', label: 'Sales agent', kind: 'select', required: true, defaultValue: l.assignedTo?.id, options: agents.map((u: any) => ({ value: u.id, label: u.name })) }]} />
        ) : <Meta>Only a sales manager or dispatcher reassigns leads.</Meta>}
      </Section>

      <Section title="Site">
        <p className="text-sm">{[s.addressLine, s.city, s.region, s.postcode, s.country].filter(Boolean).join(', ') || 'No address yet.'}</p>
        <Meta>{s.siteType ? label(s.siteType) : ''}{s.animals && Object.keys(s.animals).length ? ` · ${Object.entries(s.animals).map(([k, v]) => `${v} ${k}`).join(', ')}` : ''}{s.peopleServed ? ` · ${s.peopleServed} people` : ''}{s.kitchenWasteKgPerDay ? ` · ${s.kitchenWasteKgPerDay} kg kitchen waste/day` : ''}{s.serviceArea ? ` · area ${s.serviceArea.name}` : ' · no service area matched'}</Meta>
        <AreaCheck postcode={s.postcode ?? ''} region={s.region ?? ''} country={s.country ?? ''} />
      </Section>

      <Section title="Sizing">
        {l.assessments.map((a: any) => (
          <Row key={a.id}>
            <span>{a.estimatedGasM3} m³/day · {a.cookingHours} h cooking{a.recommendedProduct ? ` · ${a.recommendedProduct.name} (${money(a.recommendedProduct.priceAmount, co.currencyCode)})` : ''}</span>
            <Meta>{a.paybackMonths ? `payback ~${a.paybackMonths} months · ` : ''}{when(a.createdAt, co.timezone)}</Meta>
          </Row>
        ))}
        {me.can('canManageLeads') || me.can('canManageQuotes') ? <SizeForm leadId={l.id} currencyCode={co.currencyCode} path={path} /> : null}
      </Section>

      <Section title="Quotes and visits">
        {l.quotes.map((x: any) => (
          <Row key={x.id} href={`/dashboard/platform/quotes/${x.id}`}><span>{x.number}{x.isLatest ? '' : ' (older version)'}</span><Meta>{money(x.totalAmount, x.currencyCode)}</Meta><Status value={x.status} /></Row>
        ))}
        {l.visits.map((v: any) => (
          <Row key={v.id} href={`/dashboard/platform/field/${v.id}`}><span>{v.number} · {label(v.type)}</span><Meta>{when(v.windowStart, co.timezone)}</Meta><Status value={v.status} /></Row>
        ))}
        {!l.quotes.length && !l.visits.length ? <Empty>No quotes or visits yet.</Empty> : null}
      </Section>

      <Section title="Contact log">
        {l.activities.length ? l.activities.map((a: any) => (
          <Row key={a.id}><span>{label(a.type)} · {a.summary}{a.outcome ? ` — ${a.outcome}` : ''}</span><Meta>{a.user?.name ?? 'System'} · {when(a.at, co.timezone)}</Meta></Row>
        )) : <Empty>Nobody has been in touch yet.</Empty>}
      </Section>
    </Page>
  )
}
