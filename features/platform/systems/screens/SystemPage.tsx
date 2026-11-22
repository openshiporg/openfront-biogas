import Link from 'next/link'
import { notFound } from 'next/navigation'
import { q, company, viewer } from '../../lib/server'
import { label, when } from '../../lib/format'
import { Page, Row, Section, Status, Meta, Empty } from '../../components/ui'
import { ActionButton } from '../../components/ActionButton'
import { CommandForm } from '../../components/CommandForm'

const csvCell = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }

/** P33 system page: warranty, visits, readings, tickets, training; P35 log a reading or check-up call, readings CSV; P36 inactive, decommission, void a warranty. */
export default async function SystemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const path = `/dashboard/platform/systems/${id}`
  const [co, me] = await Promise.all([company(), viewer()])
  const d = await q<any>(`query($id: ID!) {
    installedSystem(where: { id: $id }) {
      id number publicCode status version statusReason installedAt commissionedAt lastCheckedAt lastCheckResult nextCheckDueAt notes
      customer { id name phone email } site { addressLine city region } product { name } serializedUnit { serialNumber } order { id number } installation { id number }
      warranties(orderBy: [{ endsAt: asc }]) { id component startsAt endsAt terms isVoid voidReason }
      readings(orderBy: [{ at: desc }], take: 200) { id at source working cookingHours pressureKpa feedKg waterL slurryUsed problem recordedBy { name } }
      tickets(orderBy: [{ createdAt: desc }]) { id number status category createdAt }
      visits(orderBy: [{ createdAt: desc }]) { id number type status scheduledDate dueAt checkOutAt technicians { name } }
      training { traineeName relationToOwner topics language at }
      subscriptions { id status plan { name } }
    }
  }`, { id })
  const s = d.installedSystem
  if (!s) notFound()
  const manage = me.can('canManageSystems')
  const log = manage || me.can('canManageTickets') || me.can('canDoFieldWork')
  const csv = ['at,source,working,cooking_hours,pressure_kpa,feed_kg,water_l,slurry_used,problem,recorded_by',
    ...s.readings.map((r: any) => [r.at, r.source, r.working, r.cookingHours, r.pressureKpa, r.feedKg, r.waterL, r.slurryUsed, r.problem, r.recordedBy?.name].map(csvCell).join(','))].join('\n')
  const now = new Date().toISOString()
  return (
    <Page title={`${s.number} · ${s.customer?.name ?? ''}`} crumbs={[{ label: 'Systems', href: '/dashboard/platform/systems' }]}>
      <div className="flex flex-wrap items-center gap-3">
        <Status value={s.status} />
        <Meta>
          {s.product?.name}{s.serializedUnit ? ` · serial ${s.serializedUnit.serialNumber}` : ''} · {[s.site?.addressLine, s.site?.city].filter(Boolean).join(', ')}
          {s.commissionedAt ? ` · commissioned ${when(s.commissionedAt, co.timezone, 'date')}` : ''}
          {s.order ? <> · <Link className="underline" href={`/dashboard/platform/orders/${s.order.id}`}>{s.order.number}</Link></> : null}
          {s.installation ? <> · <Link className="underline" href={`/dashboard/platform/installations/${s.installation.id}`}>{s.installation.number}</Link></> : null}
        </Meta>
      </div>
      {s.statusReason ? <Meta>{s.statusReason}</Meta> : null}
      <Meta>{s.lastCheckedAt ? `Last check ${when(s.lastCheckedAt, co.timezone, 'date')} (${label(s.lastCheckResult ?? '')})` : 'Not checked yet'}{s.nextCheckDueAt ? ` · next ${when(s.nextCheckDueAt, co.timezone, 'date')}` : ''}{s.customer?.phone ? ` · ${s.customer.phone}` : ''}</Meta>

      {manage ? (
        <div className="flex flex-wrap gap-2">
          {['inactive', 'decommissioned'].includes(s.status) ? null : <ActionButton op="setSystemStatus" vars={{ systemId: s.id, to: 'inactive', expectedVersion: s.version }} ask="Why is it no longer used? (moved away, stopped feeding…)" paths={[path]} className="border">Mark inactive</ActionButton>}
          {s.status === 'inactive' ? <ActionButton op="setSystemStatus" vars={{ systemId: s.id, to: 'active', expectedVersion: s.version }} ask="Why is it back in use?" paths={[path]} className="border">Back in use</ActionButton> : null}
          {s.status !== 'decommissioned' ? <ActionButton op="setSystemStatus" vars={{ systemId: s.id, to: 'decommissioned', expectedVersion: s.version }} ask="Why is it decommissioned? This is final." paths={[path]} className="border text-red-700">Decommission</ActionButton> : null}
        </div>
      ) : null}

      <Section title="Warranty">
        {s.warranties.map((w: any) => (
          <Row key={w.id}>
            <span>{label(w.component)}</span>
            <Meta>{when(w.startsAt, co.timezone, 'date')} to {when(w.endsAt, co.timezone, 'date')}{w.isVoid ? ` · void: ${w.voidReason}` : w.endsAt < now ? ' · ended' : ''}{w.terms ? ` · ${w.terms}` : ''}</Meta>
            {manage && !w.isVoid && w.endsAt > now ? <ActionButton op="voidWarranty" vars={{ warrantyId: w.id }} ask="Why is this cover void? (tampering, misuse…)" paths={[path]} className="border">Void</ActionButton> : <Status value={w.isVoid ? 'void' : w.endsAt < now ? 'ended' : 'active'} />}
          </Row>
        ))}
        {!s.warranties.length ? <Empty>No warranty on record.</Empty> : null}
      </Section>

      <Section title={`Readings · ${s.readings.length}`}>
        {log && s.status !== 'decommissioned' ? (
          <CommandForm op="submitReading" submit="Log reading" paths={[path, '/dashboard/platform/systems']}
            nest={{ input: { fields: ['source', 'working', 'cookingHours', 'pressureKpa', 'feedKg', 'problem'], fixed: { systemId: s.id } } }}
            fields={[
              { name: 'source', label: 'From', kind: 'select', width: 'sm', options: [{ value: 'call', label: 'Check-up call' }, { value: 'technician', label: 'On site' }, { value: 'customer', label: 'Customer' }, { value: 'meter', label: 'Meter' }] },
              { name: 'working', label: 'Gas working', kind: 'select', width: 'sm', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
              { name: 'cookingHours', label: 'Cooking hours a day', width: 'sm' },
              { name: 'pressureKpa', label: 'Pressure (kPa)', width: 'sm' },
              { name: 'feedKg', label: 'Feed (kg a day)', width: 'sm' },
              { name: 'problem', label: 'Problem', width: 'lg' },
            ]} />
        ) : null}
        {s.readings.slice(0, 20).map((r: any) => (
          <Row key={r.id}>
            <span>{when(r.at, co.timezone)} · {r.working ? 'working' : 'not working'}</span>
            <Meta>{label(r.source)}{r.cookingHours ? ` · ${r.cookingHours} h cooking` : ''}{r.pressureKpa ? ` · ${r.pressureKpa} kPa` : ''}{r.feedKg ? ` · ${r.feedKg} kg feed` : ''}{r.problem ? ` · ${r.problem}` : ''}{r.recordedBy ? ` · ${r.recordedBy.name}` : ''}</Meta>
            <span />
          </Row>
        ))}
        {s.readings.length ? <a download={`${s.number}-readings.csv`} href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`} className="text-sm underline">Download readings (CSV)</a> : <Empty>No readings yet.</Empty>}
      </Section>

      <Section title="Tickets">
        {s.tickets.map((t: any) => <Row key={t.id} href={`/dashboard/platform/tickets/${t.id}`}><span>{t.number} · {label(t.category)}</span><Meta>{when(t.createdAt, co.timezone, 'date')}</Meta><Status value={t.status} /></Row>)}
        {!s.tickets.length ? <Empty>No tickets.</Empty> : null}
        {me.can('canManageTickets') ? <Link className="text-sm underline" href={`/dashboard/platform/tickets?new=${s.id}`}>Open a ticket for this system</Link> : null}
      </Section>

      <Section title="Visits">
        {s.visits.map((v: any) => <Row key={v.id} href={`/dashboard/platform/field/${v.id}`}><span>{v.number} · {label(v.type)}</span><Meta>{v.scheduledDate ?? (v.dueAt ? `due ${when(v.dueAt, co.timezone, 'date')}` : '')} {v.technicians.map((t: any) => t.name).join(', ')}</Meta><Status value={v.status} /></Row>)}
        {!s.visits.length ? <Empty>No visits.</Empty> : null}
      </Section>

      <Section title="Training">
        {s.training.map((t: any, i: number) => <Row key={i}><span>{t.traineeName}{t.relationToOwner ? ` (${t.relationToOwner})` : ''}</span><Meta>{when(t.at, co.timezone, 'date')} · {(t.topics ?? []).join(', ')}{t.language ? ` · ${t.language}` : ''}</Meta><span /></Row>)}
        {!s.training.length ? <Empty>No training recorded.</Empty> : null}
      </Section>
      {s.subscriptions.length ? <Section title="Service plans">{s.subscriptions.map((x: any) => <Row key={x.id}><span>{x.plan?.name}</span><Meta> </Meta><Status value={x.status} /></Row>)}</Section> : null}
    </Page>
  )
}
