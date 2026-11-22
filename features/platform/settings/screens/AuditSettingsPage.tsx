import { q, company } from '../../lib/server'
import { label, when } from '../../lib/format'
import { Section, Meta, Status, Row, Empty } from '../../components/ui'
import { SettingsShell, settingsAccess, SETTINGS } from '../components/SettingsShell'

const PATH = `${SETTINGS}/audit`

/** P64: the audit trail. Every status change, refund, waiver and stock adjustment, who did it and why; filter by record type or person. */
export default async function AuditSettingsPage({ searchParams }: { searchParams: Promise<{ type?: string; actor?: string; q?: string }> }) {
  const sp = await searchParams
  const { allowed } = await settingsAccess(['canManageSettings', 'canReadReports'])
  if (!allowed) return <SettingsShell active={PATH} title="Audit log" allowed={false} />
  const co = await company()
  const where: any = {}
  if (sp.type) where.entityType = { equals: sp.type }
  if (sp.actor) where.actorLabel = { contains: sp.actor, mode: 'insensitive' }
  if (sp.q) where.OR = [{ action: { contains: sp.q, mode: 'insensitive' } }, { reason: { contains: sp.q, mode: 'insensitive' } }, { entityId: { equals: sp.q } }]
  const d = await q<any>(`query($w: AuditEventWhereInput!) { auditEvents(where: $w, orderBy: [{ createdAt: desc }], take: 200) { id action entityType entityId actorLabel fromStatus toStatus reason createdAt } }`, { w: where })
  const types = ['Order', 'Payment', 'Refund', 'Quote', 'Lead', 'Visit', 'Installation', 'InstalledSystem', 'ServiceTicket', 'PaymentPlan', 'Installment', 'StockLevel', 'PurchaseOrder', 'IncentiveApplication', 'Commission', 'Referral', 'ServicePlanSubscription']
  return (
    <SettingsShell active={PATH} title="Audit log" allowed>
      <form action={PATH} className="flex flex-wrap items-end gap-2">
        <select name="type" defaultValue={sp.type ?? ''} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="">Every record</option>{types.map(t => <option key={t} value={t}>{label(t.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase())}</option>)}</select>
        <input name="actor" defaultValue={sp.actor ?? ''} placeholder="Who" className="h-9 rounded-md border bg-background px-3 text-sm" />
        <input name="q" defaultValue={sp.q ?? ''} placeholder="Action, reason or record id" className="h-9 rounded-md border bg-background px-3 text-sm sm:w-64" />
        <button className="h-9 rounded-md border px-3 text-sm">Filter</button>
      </form>
      <Section title={`${d.auditEvents.length}${d.auditEvents.length === 200 ? '+' : ''} events`}>
        {d.auditEvents.length ? d.auditEvents.map((e: any) => (
          <Row key={e.id}>
            <span className="space-y-0.5">
              <span className="block text-sm">{e.action}{e.reason ? <span className="text-muted-foreground">: {e.reason}</span> : null}</span>
              <Meta>{e.entityType} <a className="font-mono underline" href={`${PATH}?q=${e.entityId}`}>{e.entityId.slice(0, 14)}</a> · {e.actorLabel || 'system'} · {when(e.createdAt, co.timezone)}</Meta>
            </span>
            <span className="flex items-center gap-2">{e.fromStatus ? <><Status value={e.fromStatus} /><Meta>→</Meta></> : null}{e.toStatus ? <Status value={e.toStatus} /> : null}</span>
          </Row>
        )) : <Empty>No events match.</Empty>}
      </Section>
    </SettingsShell>
  )
}
