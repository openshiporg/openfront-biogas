import crypto from 'node:crypto'
import type { Db, Tx } from '../keystone/lib/db'
import type { WebhookIntent } from '../keystone/lib/unitOfWork'

/**
 * Outgoing webhooks on state changes (section 7), ported from openfront/features/webhooks. A command
 * records one WebhookEvent per subscribed endpoint inside its own transaction; after commit the server
 * posts each one, signed with the endpoint secret. There is no worker or retry timer: a failed delivery
 * stays on the settings page with a Resend button.
 */
export const WEBHOOK_TIMEOUT_MS = 8_000

export async function recordWebhookEvents(tx: Tx, intents: WebhookIntent[], now: Date): Promise<string[]> {
  if (!intents.length) return []
  const endpoints = await tx.webhookEndpoint.findMany({ where: { isActive: true }, select: { id: true, events: true } })
  const ids: string[] = []
  for (const intent of intents) {
    const subscribed = endpoints.filter(e => Array.isArray(e.events) && ((e.events as string[]).includes(intent.eventType) || (e.events as string[]).includes('*')))
    for (const endpoint of subscribed) {
      const payload = { event: intent.eventType, timestamp: now.toISOString(), listKey: intent.resourceType, id: intent.resourceId, data: intent.data }
      const row = await tx.webhookEvent.create({
        data: { eventType: intent.eventType, resourceType: intent.resourceType, resourceId: intent.resourceId, payload: payload as never, endpointId: endpoint.id, delivered: false, deliveryAttempts: 0 },
        select: { id: true },
      })
      ids.push(row.id)
    }
  }
  return ids
}

export const signWebhookBody = (secret: string, body: string) => crypto.createHmac('sha256', secret).update(body).digest('hex')

export async function deliverWebhookEvent(db: Db, eventId: string) {
  const event = await db.webhookEvent.findUnique({ where: { id: eventId }, include: { endpoint: true } })
  if (!event?.endpoint || event.delivered) return
  const body = JSON.stringify(event.payload)
  const attempts = (event.deliveryAttempts ?? 0) + 1
  try {
    if (!event.endpoint.secret) throw new Error('Webhook endpoint secret is required')
    const response = await fetch(event.endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Openfront-Webhook-Signature': `sha256=${signWebhookBody(event.endpoint.secret, body)}`,
        'X-Openfront-Topic': event.eventType,
        'X-Openfront-Delivery-ID': event.id,
      },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    })
    const text = (await response.text()).slice(0, 4_000)
    await db.webhookEvent.update({ where: { id: event.id }, data: { delivered: response.ok, deliveryAttempts: attempts, responseStatus: response.status, responseBody: text, lastAttempt: new Date() } })
    await db.webhookEndpoint.update({ where: { id: event.endpoint.id }, data: response.ok ? { failureCount: 0, lastTriggered: new Date() } : { failureCount: { increment: 1 } } })
  } catch (error) {
    await db.webhookEvent.update({ where: { id: event.id }, data: { delivered: false, deliveryAttempts: attempts, responseStatus: 0, responseBody: error instanceof Error ? error.message.slice(0, 500) : 'Delivery failed', lastAttempt: new Date() } })
    await db.webhookEndpoint.update({ where: { id: event.endpoint.id }, data: { failureCount: { increment: 1 } } })
  }
}

/** After commit. Never throws into the caller: the business change already happened. */
export async function deliverWebhookEvents(db: Db, ids: string[]) {
  await Promise.allSettled(ids.map(id => deliverWebhookEvent(db, id).catch(() => undefined)))
}
