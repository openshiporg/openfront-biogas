import Link from 'next/link'
import { notFound } from 'next/navigation'
import { q, company, viewer, todayIso } from '../../lib/server'
import { label, when } from '../../lib/format'
import { Page, Row, Section, Status, Meta, Empty } from '../../components/ui'
import { ActionButton } from '../../components/ActionButton'
import { SlotPicker } from '../../schedule/components/SlotPicker'

/** P20 tick or waive get-ready items, mark ready (with an override reason when items are open), P21 hold, resume, cancel; book the install. */
export default async function InstallationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const path = `/dashboard/platform/installations/${id}`
  const [co, me] = await Promise.all([company(), viewer()])
  const d = await q<any>(`query($id: ID!) {
    installation(where: { id: $id }) {
      id number status version targetDate holdReason heldFrom overrideReason
      customer { id name phone } site { addressLine city } product { name } order { id number status }
      prepTasks(orderBy: [{ sortOrder: asc }]) { id prompt helpText isRequired status doneAt note doneBy }
      visits(orderBy: [{ scheduledDate: desc }]) { id number type status version scheduledDate technicians { name } }
      system { id number status }
    }
    users(where: { isActive: { equals: true }, role: { canDoFieldWork: { equals: true } } }, orderBy: [{ name: asc }]) { id name role { canManageSettings } }
  }`, { id })
  const i = d.installation
  if (!i) notFound()
  const can = me.can('canManageVisits') || me.can('canManageOrders')
  const prepOpen = !['commissioned', 'cancelled', 'installed'].includes(i.status)
  const req = i.prepTasks.filter((t: any) => t.isRequired && t.status === 'pending')
  const techs = [...d.users.filter((u: any) => !u.role?.canManageSettings), ...d.users.filter((u: any) => u.role?.canManageSettings)].map((u: any) => ({ id: u.id, name: u.name }))
  const booked = i.visits.find((v: any) => v.type === 'install' && ['scheduled', 'rescheduled', 'en_route', 'on_site'].includes(v.status))
  const waiting = i.visits.find((v: any) => v.type === 'install' && v.status === 'requested')
  return (
    <Page title={`${i.number} · ${i.customer?.name ?? ''}`} crumbs={[{ label: 'Installations', href: '/dashboard/platform/installations' }]}>
      <div className="flex flex-wrap items-center gap-3">
        <Status value={i.status} />
        <Meta>
          {i.product?.name} · {[i.site?.addressLine, i.site?.city].filter(Boolean).join(', ')}
          {i.targetDate ? ` · target ${when(`${i.targetDate}T12:00:00Z`, 'UTC', 'date')}` : ''}
          {i.order ? <> · <Link className="underline" href={`/dashboard/platform/orders/${i.order.id}`}>{i.order.number}</Link> ({label(i.order.status)})</> : null}
          {i.system ? <> · <Link className="underline" href={`/dashboard/platform/systems/${i.system.id}`}>{i.system.number}</Link></> : null}
        </Meta>
      </div>
      {i.holdReason ? <p className="text-sm text-amber-700">On hold: {i.holdReason}</p> : null}
      {i.overrideReason ? <Meta>Marked ready with items open: {i.overrideReason}</Meta> : null}

      {can ? (
        <div className="flex flex-wrap gap-2">
          {i.status === 'awaiting_site_prep' ? (
            req.length
              ? <ActionButton op="transitionInstallation" vars={{ installationId: i.id, action: 'ready', expectedVersion: i.version }} ask={`${req.length} required item(s) are open. Why is the site ready anyway?`} paths={[path]} className="border">Mark ready (override)</ActionButton>
              : <ActionButton op="transitionInstallation" vars={{ installationId: i.id, action: 'ready', expectedVersion: i.version }} paths={[path]} className="border">Mark ready</ActionButton>
          ) : null}
          {['awaiting_site_prep', 'ready_to_schedule', 'scheduled', 'in_progress', 'installed'].includes(i.status) ? <ActionButton op="transitionInstallation" vars={{ installationId: i.id, action: 'hold', expectedVersion: i.version }} ask="Why is it on hold? Booked visits come off the schedule." paths={[path]} className="border">Put on hold</ActionButton> : null}
          {i.status === 'on_hold' ? <ActionButton op="transitionInstallation" vars={{ installationId: i.id, action: 'resume', expectedVersion: i.version }} paths={[path]} className="border">Resume</ActionButton> : null}
          {['awaiting_site_prep', 'ready_to_schedule', 'scheduled', 'on_hold'].includes(i.status) ? <ActionButton op="transitionInstallation" vars={{ installationId: i.id, action: 'cancel', expectedVersion: i.version }} ask="Why is the installation cancelled? (The order is cancelled on the order page.)" paths={[path]} className="border text-red-700">Cancel installation</ActionButton> : null}
        </div>
      ) : null}

      <Section title={`Get ready · ${i.prepTasks.filter((t: any) => t.status !== 'pending').length}/${i.prepTasks.length}`}>
        {i.prepTasks.map((t: any) => (
          <Row key={t.id}>
            <span>{t.prompt}{t.isRequired ? '' : ' (optional)'}</span>
            <Meta>{t.status !== 'pending' ? `${label(t.status)}${t.doneBy ? ` by ${t.doneBy}` : ''}${t.doneAt ? ` ${when(t.doneAt, co.timezone, 'date')}` : ''}${t.note ? ` · ${t.note}` : ''}` : t.helpText ?? ''}</Meta>
            {can && prepOpen ? (
              <span className="flex gap-1">
                {t.status !== 'done' ? <ActionButton op="setSitePrepTask" vars={{ taskId: t.id, status: 'done' }} paths={[path]} className="border">Done</ActionButton> : null}
                {t.status === 'pending' ? <ActionButton op="setSitePrepTask" vars={{ taskId: t.id, status: 'waived' }} ask="Why is it waived?" paths={[path]} className="border">Waive</ActionButton> : null}
                {t.status !== 'pending' ? <ActionButton op="setSitePrepTask" vars={{ taskId: t.id, status: 'pending' }} paths={[path]} className="border">Undo</ActionButton> : null}
              </span>
            ) : <Status value={t.status} />}
          </Row>
        ))}
        {!i.prepTasks.length ? <Empty>No get-ready items.</Empty> : null}
      </Section>

      <Section title="Visits">
        {i.visits.map((v: any) => (
          <Row key={v.id} href={`/dashboard/platform/field/${v.id}`}>
            <span>{v.number} · {label(v.type)}</span>
            <Meta>{v.scheduledDate ?? 'not booked'} · {v.technicians.map((t: any) => t.name).join(', ')}</Meta>
            <Status value={v.status} />
          </Row>
        ))}
        {me.can('canManageVisits') && !booked && ['ready_to_schedule', 'scheduled'].includes(i.status) ? (
          <div className="space-y-2 pt-2">
            <Meta>Book the install{waiting ? ` (${waiting.number})` : ''}: pick a day and crew.</Meta>
            <SlotPicker {...(waiting ? { visitId: waiting.id, expectedVersion: waiting.version } : { create: { type: 'install', installationId: i.id } })} from={todayIso(co.timezone)} techs={techs} timezone={co.timezone} submit="Book install" paths={[path, '/dashboard/platform/installations', '/dashboard/platform/schedule']} />
          </div>
        ) : null}
      </Section>
    </Page>
  )
}
