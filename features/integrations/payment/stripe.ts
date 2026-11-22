import crypto from 'node:crypto'

/**
 * Stripe card payments through the REST API (adapted from openfront-barber's fetch adapter, moved from
 * Checkout Sessions to PaymentIntents as the dissertation asks). Money is only ever confirmed by Stripe:
 * a signed webhook checked on the raw body, or a read-back of the PaymentIntent. The browser never says
 * a payment succeeded.
 */
const API = 'https://api.stripe.com/v1'

export const stripeConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY)
export const stripePublishableKey = () => process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || ''

function secretKey() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('Card payments are not set up for this company. Pay by mobile money, bank transfer or cash.')
  return key
}

function form(values: Record<string, string | number | undefined>) {
  const body = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== '') body.append(key, String(value))
  return body
}

export class StripeError extends Error {
  constructor(message: string, readonly status: number, readonly retryable: boolean) {
    super(message)
  }
}

async function call<T>(path: string, init: { method?: 'GET' | 'POST'; body?: URLSearchParams; idempotencyKey?: string } = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API}${path}`, {
      method: init.method || 'GET',
      headers: {
        Authorization: `Bearer ${secretKey()}`,
        'Stripe-Version': '2024-06-20',
        ...(init.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...(init.idempotencyKey ? { 'Idempotency-Key': init.idempotencyKey } : {}),
      },
      body: init.body,
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    throw new StripeError('Could not reach Stripe. Try again.', 0, true)
  }
  const json = (await response.json().catch(() => ({}))) as { error?: { message?: string } } & T
  if (!response.ok) throw new StripeError(json.error?.message || `Stripe request failed (${response.status}).`, response.status, response.status >= 500 || response.status === 429)
  return json
}

export type StripeIntent = {
  id: string
  status: 'requires_payment_method' | 'requires_confirmation' | 'requires_action' | 'processing' | 'requires_capture' | 'canceled' | 'succeeded'
  amount: number
  amount_received: number
  currency: string
  client_secret: string | null
  metadata: Record<string, string>
  latest_charge?: string | null
}

export type StripeRefund = { id: string; status: 'pending' | 'requires_action' | 'succeeded' | 'failed' | 'canceled'; amount: number; currency: string; payment_intent: string | null }

export async function createPaymentIntent(input: { amount: number; currency: string; description: string; metadata: Record<string, string>; idempotencyKey: string; receiptEmail?: string }) {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new Error('Payment amount must be greater than zero.')
  return call<StripeIntent>('/payment_intents', {
    method: 'POST',
    idempotencyKey: input.idempotencyKey,
    body: form({
      amount: input.amount,
      currency: input.currency.toLowerCase(),
      description: input.description.slice(0, 500),
      'automatic_payment_methods[enabled]': 'true',
      'automatic_payment_methods[allow_redirects]': 'never',
      ...(input.receiptEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.receiptEmail) ? { receipt_email: input.receiptEmail } : {}),
      ...Object.fromEntries(Object.entries(input.metadata).map(([k, v]) => [`metadata[${k}]`, v])),
    }),
  })
}

export const retrievePaymentIntent = (id: string) => call<StripeIntent>(`/payment_intents/${encodeURIComponent(id)}`)

export const cancelPaymentIntent = (id: string) => call<StripeIntent>(`/payment_intents/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: form({}) })

export function createRefund(input: { paymentIntentId: string; amount: number; idempotencyKey: string; reason?: string }) {
  return call<StripeRefund>('/refunds', {
    method: 'POST',
    idempotencyKey: input.idempotencyKey,
    body: form({ payment_intent: input.paymentIntentId, amount: input.amount, 'metadata[reason]': (input.reason || '').slice(0, 400) }),
  })
}

export const retrieveRefund = (id: string) => call<StripeRefund>(`/refunds/${encodeURIComponent(id)}`)

/**
 * Stripe-Signature: `t=<unix>,v1=<hex hmac-sha256 of "t.rawBody">`. Checked over the exact bytes
 * received, with a 5-minute tolerance, in constant time.
 */
export function verifyStripeSignature(rawBody: Buffer, header: string | null, secret: string, now = Date.now(), toleranceSec = 300): boolean {
  if (!header || !secret) return false
  const parts = header.split(',').map(p => p.trim().split('=') as [string, string])
  const t = parts.find(([k]) => k === 't')?.[1]
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v)
  if (!t || !/^\d+$/.test(t) || !signatures.length) return false
  if (Math.abs(now / 1000 - Number(t)) > toleranceSec) return false
  const expected = crypto.createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest()
  return signatures.some(sig => {
    if (!/^[0-9a-f]{64}$/i.test(sig)) return false
    const given = Buffer.from(sig, 'hex')
    return given.length === expected.length && crypto.timingSafeEqual(given, expected)
  })
}

/** Builds a header the way Stripe does (used by our own tests to post signed events). */
export function signStripePayload(rawBody: string, secret: string, at = Math.floor(Date.now() / 1000)) {
  const sig = crypto.createHmac('sha256', secret).update(`${at}.${rawBody}`).digest('hex')
  return `t=${at},v1=${sig}`
}

/** Maps a PaymentIntent to our session state. Anything we can't read stays unknown (4.5). */
export function intentOutcome(intent: Pick<StripeIntent, 'status'>): 'captured' | 'pending' | 'authorized' | 'cancelled' | 'failed' | 'unknown' {
  switch (intent.status) {
    case 'succeeded':
      return 'captured'
    case 'requires_capture':
      return 'authorized'
    case 'canceled':
      return 'cancelled'
    case 'requires_payment_method':
    case 'requires_confirmation':
    case 'requires_action':
    case 'processing':
      return 'pending'
    default:
      return 'unknown'
  }
}
