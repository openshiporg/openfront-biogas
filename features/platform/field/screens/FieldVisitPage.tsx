import Link from 'next/link'
import { notFound } from 'next/navigation'
import { q, company, viewer } from '../../lib/server'
import { label, money, when } from '../../lib/format'
import { Page, Row, Section, Status, Meta, Empty } from '../../components/ui'
import { ActionButton } from '../../components/ActionButton'
import { CommandForm } from '../../components/CommandForm'
import { Checklist, CompleteVisit, TakePayment, type Item } from '../components/FieldTools'
import { CheckIn } from '../components/CheckIn'

/**
 * P25 travel and check in (with location), P26 checklist, P27 complete with signature, P28 parts from the van,
 * P29 commission with training, P30 take a payment on site, P31 what the customer owns and earlier visits.
 */
export default async function FieldVisitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const path = `/dashboard/platform/field/${id}`
  const [co, me] = await Promise.all([company(), viewer()])
  const d = await q<any>(`query($id: ID!) {
    visit(where: { id: $id }) {
      id number type status version scheduledDate windowStart windowEnd checkInAt checkOutAt outcome notes signedName feeAmount feePaid cancelReason publicCode checklistAnswers
      customer { id name phone } site { addressLine city region lat lng directions siteType animals peopleServed waterSource }
      technicians { id name } lead { id number } ticket { id number category description status }
      installation { id number status product { name } order { id number } }
      system { id number status product { name } lastCheckResult lastCheckedAt warranties { component endsAt } }
      survey { feasibility notes } training { traineeName topics }
      partsUsed { id quantity chargeable unitAmount product { name } }
      readings(orderBy: [{ at: desc }], take: 3) { at working pressureKpa cookingHours problem }
    }
  }`, { id })
  const v = d.visit
  if (!v) notFound()
  const field = me.can('canDoFieldWork') && v.technicians.some((t: any) => t.id === me.id)
  const act = field || me.can('canManageVisits')
  const open = ['scheduled', 'rescheduled', 'en_route', 'on_site'].includes(v.status)
  const commissionable = ['install', 'commissioning'].includes(v.type) && v.installation && v.installation.status !== 'commissioned'
  const [cl, ccl, extra, units] = await Promise.all([
    act ? q<any>(`query($v: ID!) { visitChecklist(visitId: $v) }`, { v: id }) : null,
    act && commissionable ? q<any>(`query($v: ID!) { visitChecklist(visitId: $v, kind: "commissioning") }`, { v: id }) : null,
    act ? q<any>(`{
      products(where: { type: { in: ["part", "consumable"] }, isPublished: { equals: true } }, orderBy: [{ name: asc }]) { id name sku }
      kits: products(where: { type: { equals: "digester_kit" } }, orderBy: [{ priceAmount: asc }]) { id name }
    }`) : null,
    // The serials picked for this install; a technician who cannot read stock types the one on the tank.
    act && commissionable ? q<any>(`query($s: ID!) { serializedUnits(where: { status: { equals: "reserved" }, order: { installation: { id: { equals: $s } } } }) { serialNumber } }`, { s: v.installation.id }).catch(() => null) : null,
  ])
  const items: Item[] = cl?.visitChecklist?.items ?? []
  const commissionItems: Item[] = ccl?.visitChecklist?.items ?? []
  const saved: Record<string, string> = Object.fromEntries(((v.checklistAnswers?.items ?? []) as any[]).filter(a => a.value !== null && a.value !== undefined).map(a => [a.itemId, typeof a.value === 'boolean' ? (a.value ? 'yes' : 'no') : String(a.value)]))
  const addr = [v.site?.addressLine, v.site?.city, v.site?.region].filter(Boolean).join(', ')
  const map = v.site?.lat && v.site?.lng ? `https://www.google.com/maps/dir/?api=1&destination=${v.site.lat},${v.site.lng}` : addr ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}` : ''
  const fmt = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: co.timezone, hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
  const sameDay = v.status === 'completed' && v.checkOutAt && new Intl.DateTimeFormat('en-CA', { timeZone: co.timezone }).format(new Date(v.checkOutAt)) === new Intl.DateTimeFormat('en-CA', { timeZone: co.timezone }).format(new Date())

  return (
    <Page title={`${label(v.type)} · ${v.customer?.name ?? ''}`} crumbs={[{ label: field ? 'My day' : 'Schedule', href: field ? '/dashboard/platform/field' : '/dashboard/platform/schedule' }]}>
      <div className="flex flex-wrap items-center gap-3">
        <Status value={v.status} />
        <Meta>{v.number}{v.scheduledDate ? ` · ${when(`${v.scheduledDate}T12:00:00Z`, 'UTC', 'date')}` : ''}{v.windowStart ? ` ${fmt(v.windowStart)}–${fmt(v.windowEnd)}` : ''} · {v.technicians.map((t: any) => t.name).join(', ')}{v.checkInAt ? ` · arrived ${fmt(v.checkInAt)}` : ''}{v.checkOutAt ? ` · left ${fmt(v.checkOutAt)}` : ''}</Meta>
      </div>
      <div className="space-y-1 text-sm">
        <p>{addr}{v.site?.directions ? ` · ${v.site.directions}` : ''}</p>
        <div className="flex flex-wrap gap-2">
          {v.customer?.phone ? <a href={`tel:${v.customer.phone}`} className="rounded-md border px-3 py-2 text-sm">Call {v.customer.phone}</a> : null}
          {map ? <a href={map} target="_blank" rel="noreferrer" className="rounded-md border px-3 py-2 text-sm">Directions</a> : null}
        </div>
      </div>
      {v.cancelReason ? <p className="text-sm text-red-700">Cancelled: {v.cancelReason}</p> : null}

      {act && ['scheduled', 'rescheduled', 'en_route'].includes(v.status) ? (
        <Section title="On the way">
          <div className="flex flex-wrap items-center gap-2">
            {v.status !== 'en_route' ? <ActionButton op="startVisitTravel" vars={{ visitId: v.id, expectedVersion: v.version }} paths={[path]} className="h-10 border">On my way</ActionButton> : null}
            <CheckIn visitId={v.id} version={v.version} path={path} />
            <ActionButton op="completeVisit" vars={{ input: { visitId: v.id, outcome: 'no_access', expectedVersion: v.version } }} ask="What happened? (nobody home, gate locked…)" paths={[path, '/dashboard/platform/field']} className="h-10 border">No access</ActionButton>
          </div>
        </Section>
      ) : null}

      <Section title="The job">
        {v.lead ? <Row><span>Survey for lead {v.lead.number}</span><Meta>{label(v.site?.siteType ?? '')}{v.site?.animals ? ` · animals ${JSON.stringify(v.site.animals).replace(/[{}"]/g, '')}` : ''}{v.site?.peopleServed ? ` · ${v.site.peopleServed} people` : ''}{v.site?.waterSource ? ` · water ${v.site.waterSource}` : ''}</Meta><span /></Row> : null}
        {v.installation ? <Row><span>{v.installation.number} · {v.installation.product?.name}</span><Meta>{v.installation.order?.number ?? ''}</Meta><Status value={v.installation.status} /></Row> : null}
        {v.ticket ? <Row><span>{v.ticket.number} · {label(v.ticket.category)}</span><Meta>{v.ticket.description}</Meta><Status value={v.ticket.status} /></Row> : null}
        {v.system ? (
          <>
            <Row><span>{v.system.number} · {v.system.product?.name}</span><Meta>{v.system.lastCheckedAt ? `last check ${when(v.system.lastCheckedAt, co.timezone, 'date')} (${label(v.system.lastCheckResult ?? '')})` : ''}</Meta><Status value={v.system.status} /></Row>
            <Meta>Warranty: {v.system.warranties.map((w: any) => `${label(w.component)} to ${when(w.endsAt, co.timezone, 'date')}`).join(' · ') || 'none'}</Meta>
          </>
        ) : null}
        {v.feeAmount ? <Meta>Visit fee {money(v.feeAmount, co.currencyCode)} · {v.feePaid ? 'paid' : 'not paid yet'}</Meta> : null}
      </Section>

      {items.length ? (
        <Section title={cl.visitChecklist.name}>
          <Checklist visitId={v.id} items={items} initial={saved} path={path} editable={act && open && v.type !== 'commissioning'} />
          {!open || v.type === 'commissioning' ? null : v.status !== 'on_site' ? <Meta>Check in to start; you can fill it in on the way.</Meta> : null}
        </Section>
      ) : null}

      {act && open ? (
        <Section title="Parts used">
          {v.partsUsed.map((p: any) => <Row key={p.id}><span>{p.quantity} × {p.product?.name}</span><Meta>{p.chargeable ? `charged ${money(p.unitAmount * p.quantity, co.currencyCode)}` : 'no charge'}</Meta><span /></Row>)}
          <CommandForm op="logPartUsage" submit="Log part" fixed={{ visitId: v.id }} paths={[path]}
            fields={[
              { name: 'productId', label: 'Part (from your van)', kind: 'select', required: true, width: 'lg', options: [{ value: '', label: 'Pick…' }, ...(extra?.products ?? []).map((p: any) => ({ value: p.id, label: `${p.name} · ${p.sku}` }))] },
              { name: 'quantity', label: 'Qty', kind: 'number', required: true, width: 'sm', defaultValue: '1' },
              { name: 'chargeable', label: 'Charge it', kind: 'select', width: 'sm', options: [{ value: '', label: 'No' }, { value: 'true', label: 'Yes' }] },
            ]} />
        </Section>
      ) : v.partsUsed.length ? (
        <Section title="Parts used">{v.partsUsed.map((p: any) => <Row key={p.id}><span>{p.quantity} × {p.product?.name}</span><Meta>{p.chargeable ? 'charged' : 'no charge'}</Meta><span /></Row>)}</Section>
      ) : null}

      {act && v.status === 'on_site' ? (
        <Section title={commissionable ? 'Finish: commission and hand over' : 'Finish the visit'}>
          <CompleteVisit visitId={v.id} version={v.version} type={v.type} items={items} initial={saved} commissionItems={commissionItems} path={path} customerName={v.customer?.name ?? ''}
            serials={(units?.serializedUnits ?? []).map((u: any) => u.serialNumber)} products={extra?.kits ?? []} commission={Boolean(commissionable)} />
        </Section>
      ) : null}

      {act && (v.status === 'on_site' || sameDay) ? (
        <Section title="Take a payment">
          <Meta>Cash, mobile money or a bank transfer the customer makes now. It goes to the visit fee first, then a repair quote, then the order balance, never more than is owed. Finance verifies it.</Meta>
          <TakePayment visitId={v.id} owed={v.feeAmount && !v.feePaid ? (v.feeAmount / 100).toFixed(2) : 'all owed'} currency={co.currencyCode} path={path} />
        </Section>
      ) : null}

      {v.status === 'completed' || v.status === 'no_access' ? (
        <Section title="Result">
          <p className="text-sm">{label(v.outcome ?? v.status)}{v.signedName ? ` · signed by ${v.signedName}` : ''}</p>
          {v.notes ? <p className="text-sm">{v.notes}</p> : null}
          <div className="flex flex-col gap-1">
          {v.survey ? <Meta>Survey: {label(v.survey.feasibility)}{v.survey.notes ? ` · ${v.survey.notes}` : ''}</Meta> : null}
          {v.training.map((t: any, i: number) => <Meta key={i}>Trained {t.traineeName}: {(t.topics ?? []).join(', ')}</Meta>)}
          {v.readings.map((r: any, i: number) => <Meta key={i}>Reading {when(r.at, co.timezone)}: {r.working ? 'working' : 'not working'}{r.pressureKpa ? ` · ${r.pressureKpa} kPa` : ''}{r.cookingHours ? ` · ${r.cookingHours} h cooking` : ''}{r.problem ? ` · ${r.problem}` : ''}</Meta>)}
          </div>
          {v.system && v.type !== 'survey' ? <Link href={`/dashboard/platform/systems/${v.system.id}`} className="text-sm underline">Open {v.system.number}</Link> : null}
        </Section>
      ) : null}
      {!act ? <Empty>You can read this visit; only its crew or a dispatcher works it.</Empty> : null}
    </Page>
  )
}
