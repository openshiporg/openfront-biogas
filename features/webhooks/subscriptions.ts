/** Ported from openfront/features/webhooks/subscriptions.ts (STORE scope only: one company per deployment). */
export const WEBHOOK_EVENTS = [
  'lead.created', 'quote.sent', 'quote.accepted', 'order.confirmed', 'order.cancelled', 'payment.verified', 'payment.captured', 'payment.refunded',
  'visit.scheduled', 'visit.completed', 'system.commissioned', 'ticket.opened', 'ticket.resolved', 'installment.paid', 'plan.completed',
] as const

export function normalizeWebhookUrl(value: unknown): string {
  let url: URL
  try {
    url = new URL(String(value || '').trim())
  } catch {
    throw new Error('Webhook URL must be an absolute URL')
  }
  const localDevelopment = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(localDevelopment && url.protocol === 'http:')) throw new Error('Webhook URL must use HTTPS')
  if (url.username || url.password || url.hash) throw new Error('Webhook URL cannot contain credentials or a fragment')
  return url.toString()
}

export function normalizeWebhookEvents(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('At least one webhook event is required')
  const events = value.map(event => String(event || '').trim()).filter(Boolean)
  if (events.length !== value.length) throw new Error('Webhook event names cannot be empty')
  const known = new Set<string>([...WEBHOOK_EVENTS, '*'])
  const unknown = events.filter(e => !known.has(e))
  if (unknown.length) throw new Error(`Unknown webhook event: ${unknown[0]}`)
  return [...new Set(events)].sort()
}
