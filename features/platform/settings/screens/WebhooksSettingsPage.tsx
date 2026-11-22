import { q, company } from '../../lib/server'
import { when } from '../../lib/format'
import { Section, Meta, Status, Row, Empty } from '../../components/ui'
import { RecordForm } from '../../records/RecordForm'
import { RemoveButton } from '../../records/RecordButtons'
import { SettingsShell, settingsAccess, SETTINGS } from '../components/SettingsShell'
import { WEBHOOK_EVENTS } from '@/features/webhooks/subscriptions'

const PATH = `${SETTINGS}/webhooks`
const EVENTS = WEBHOOK_EVENTS.map(e => ({ value: e, label: e }))

/** P64: outgoing webhooks. Each endpoint gets the events it picks, signed with its own secret; the latest deliveries show what was sent and the answer. */
export default async function WebhooksSettingsPage() {
  const { allowed } = await settingsAccess()
  if (!allowed) return <SettingsShell active={PATH} title="Webhooks" allowed={false} />
  const co = await company()
  const d = await q<any>(`{
    webhookEndpoints(orderBy: [{ createdAt: desc }]) { id url events isActive secret lastTriggered failureCount }
    webhookEvents(orderBy: [{ createdAt: desc }], take: 25) { id eventType resourceType resourceId delivered responseStatus deliveryAttempts lastAttempt createdAt endpoint { url } }
  }`)
  return (
    <SettingsShell active={PATH} title="Webhooks" allowed>
      <Section title="Endpoints">
        {d.webhookEndpoints.length ? d.webhookEndpoints.map((w: any) => (
          <div key={w.id} className="border-b py-3 last:border-b-0">
            <div className="flex flex-wrap justify-between gap-2">
              <span className="break-all font-mono text-sm">{w.url}</span>
              <span className="flex items-center gap-3"><Status value={w.isActive ? 'active' : 'paused'} /><RemoveButton list="WebhookEndpoint" id={w.id} paths={[PATH]}>Remove</RemoveButton></span>
            </div>
            <Meta>{!(w.events ?? []).length || w.events.includes('*') ? 'every event' : w.events.join(', ')} · {w.lastTriggered ? `last sent ${when(w.lastTriggered, co.timezone)}` : 'not sent yet'}{w.failureCount ? ` · ${w.failureCount} failures in a row` : ''}</Meta>
            {w.secret ? <p><Meta>Signing secret <span className="break-all font-mono">{w.secret}</span> (check the X-Openfront-Webhook-Signature header, sha256 HMAC of the body)</Meta></p> : null}
            <details><summary className="cursor-pointer text-xs text-muted-foreground">Edit</summary>
              <RecordForm list="WebhookEndpoint" id={w.id} submit="Save" paths={[PATH]} className="mt-2" fields={[
                { name: 'url', label: 'Address (https)', width: 'lg', required: true, defaultValue: w.url },
                { name: 'events', label: 'Events (none ticked sends every event)', kind: 'multi', defaultValue: (w.events ?? []).filter((e: string) => e !== '*'), options: EVENTS },
                { name: 'isActive', label: 'Sending', kind: 'checkbox', defaultValue: w.isActive },
              ]} />
            </details>
          </div>
        )) : <Empty>No endpoints. Add one to send events to your accounting, CRM or messaging tools.</Empty>}
        <Meta>Add an endpoint</Meta>
        <RecordForm list="WebhookEndpoint" submit="Add endpoint" paths={[PATH]} fields={[
          { name: 'url', label: 'Address (https)', width: 'lg', required: true },
          { name: 'events', label: 'Events (none ticked sends every event)', kind: 'multi', options: EVENTS },
        ]} />
      </Section>
      <Section title="Latest deliveries">
        {d.webhookEvents.length ? d.webhookEvents.map((e: any) => (
          <Row key={e.id}><span className="font-mono text-xs">{e.eventType} · {e.resourceType} {e.resourceId}</span><Meta>{e.endpoint?.url ?? ''} · {e.deliveryAttempts} tries · {e.responseStatus ?? 'no answer'} · {when(e.lastAttempt ?? e.createdAt, co.timezone)}</Meta><Status value={e.delivered ? 'sent' : 'failed'} /></Row>
        )) : <Empty>Nothing sent yet.</Empty>}
      </Section>
    </SettingsShell>
  )
}
