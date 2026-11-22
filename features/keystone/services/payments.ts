import type { Db, Tx } from '../lib/db'
import type { UnitOfWork } from '../lib/unitOfWork'
import { DomainError, Codes } from '../lib/errors'
import { auditChange, lockRow, transition } from '../lib/cas'
import { systemActor, type Actor, actorUserId } from '../lib/actor'
import { runInTransaction } from '../lib/unitOfWork'
import { sessionEffectiveStatus } from '../lib/time'
import { applyMoney, openSession, providerRow, type Purpose, type SessionTarget } from './money'
import { PROVIDERS, isProviderCode, referenceKey, type ProviderCode } from '../../integrations/payment'
import * as stripe from '../../integrations/payment/stripe'
import { keyHash } from '../lib/idempotency'
import { nextNumber } from '../lib/sequence'

/**
 * Payment sessions and payments (4.5), adapted from openfront-barbershop's PaymentSession flow:
 * card through Stripe PaymentIntents (confirmed only by a signed webhook or a read-back), and recorded
 * references that finance verifies. Same reference cannot pay twice: Payment.referenceKey is unique.
 */
/** A pay link: a pending session for an amount and a target. The method is picked when paying. */
export async function startSession(uow: UnitOfWork, input: { amount: number; currencyCode: string; purpose: Purpose; description: string; target: SessionTarget; code?: ProviderCode }) {
  const session = await openSession(uow, { ...input, code: input.code ?? 'bank_transfer' })
  // A pay link has no fixed method until the customer picks one.
  if (!input.code) await uow.tx.paymentSession.update({ where: { id: session.id }, data: { providerId: null } })
  auditChange(uow, systemActor('payments'), 'PaymentSession', session.id, 'session.opened', { purpose: input.purpose, amount: input.amount }, { toStatus: 'pending' })
  return { sessionId: session.id, code: session.publicCode!, amount: session.amount, currencyCode: session.currencyCode, purpose: input.purpose, expiresAt: session.expiresAt }
}

/**
 * Card: attaches one PaymentIntent to a pending session, outside any transaction (no network I/O while
 * rows are locked). Stripe's idempotency key is the session id, so a retry returns the same intent, and
 * the row is only written while it still has no intent. The client secret is returned to the payer and
 * never stored in a command receipt.
 */
export async function attachCardIntent(db: Db, sessionId: string, email?: string) {
  if (!stripe.stripeConfigured()) throw new DomainError(Codes.PROVIDER_UNAVAILABLE, 'Card payments are not set up. Pay by mobile money, bank transfer or cash.')
  const s = await db.paymentSession.findUnique({ where: { id: sessionId } })
  if (!s) throw new DomainError(Codes.NOT_FOUND, 'Payment not found.')
  if (sessionEffectiveStatus(s, new Date()) !== 'pending') throw new DomainError(Codes.INVALID_TRANSITION, s.status === 'pending' ? 'This payment link has expired. Ask us for a new one.' : 'This is already paid.', { currentStatus: s.status })
  const provider = await providerRowDb(db, 'stripe')
  if (s.providerRef) {
    const intent = await stripe.retrievePaymentIntent(s.providerRef)
    return { clientSecret: intent.client_secret, publishableKey: stripe.stripePublishableKey(), intentId: intent.id, status: stripe.intentOutcome(intent) }
  }
  const intent = await stripe.createPaymentIntent({
    amount: s.amount,
    currency: s.currencyCode,
    description: s.description || 'Payment',
    metadata: { sessionCode: s.publicCode ?? '', purpose: s.purpose },
    idempotencyKey: `biogas-session-${s.id}`,
    receiptEmail: email,
  })
  await db.paymentSession.updateMany({ where: { id: s.id, providerRef: '' }, data: { providerRef: intent.id, providerStatus: intent.status, providerId: provider.id, clientSecret: '' } })
  // Card sessions last 30 minutes from when the card form opens (4.4).
  await db.paymentSession.updateMany({ where: { id: s.id, status: 'pending' }, data: { expiresAt: new Date(Math.max(s.expiresAt?.getTime() ?? 0, Date.now() + PROVIDERS.stripe.sessionMinutes * 60_000)) } })
  return { clientSecret: intent.client_secret, publishableKey: stripe.stripePublishableKey(), intentId: intent.id, status: stripe.intentOutcome(intent) }
}

async function providerRowDb(db: Db, code: ProviderCode) {
  const info = PROVIDERS[code]
  const row = await db.paymentProvider.upsert({ where: { code }, create: { code, name: info.label, isOnline: info.settlement === 'processor' }, update: {} })
  if (!row.isEnabled) throw new DomainError(Codes.PROVIDER_UNAVAILABLE, `${row.name} is switched off for this company.`)
  return row
}

/** Card money confirmed by Stripe (webhook or read-back). Amount, currency and our session code must match. */
export async function captureCard(uow: UnitOfWork, sessionId: string, intent: stripe.StripeIntent) {
  const tx = uow.tx
  const s = await lockRow<any>(tx, 'PaymentSession', sessionId)
  if (s.providerRef && s.providerRef !== intent.id) throw new DomainError(Codes.GUARD_FAILED, 'Payment does not belong to this session.')
  if (intent.amount_received !== s.amount && intent.amount !== s.amount) throw new DomainError(Codes.GUARD_FAILED, 'Amount does not match.')
  if (intent.currency.toUpperCase() !== s.currencyCode) throw new DomainError(Codes.GUARD_FAILED, 'Currency does not match.')
  if (intent.metadata?.sessionCode && intent.metadata.sessionCode !== s.publicCode) throw new DomainError(Codes.GUARD_FAILED, 'Session code does not match.')
  const outcome = stripe.intentOutcome(intent)
  await tx.paymentSession.update({ where: { id: s.id }, data: { lastCheckedAt: uow.now, providerStatus: intent.status } })
  if (outcome === 'captured') {
    if (['captured', 'partially_refunded', 'refunded'].includes(s.status)) return { status: s.status, replay: true }
    // A late webhook for an expired session still captures: the customer's money is real.
    await transition(uow, { model: 'PaymentSession', id: s.id, from: ['pending', 'authorized', 'expired', 'unknown', 'failed'], to: 'captured', actor: systemActor('stripe'), action: 'session.captured', data: { capturedAt: uow.now } })
    const provider = await tx.paymentProvider.findUnique({ where: { code: 'stripe' } })
    const payment = await tx.payment.create({
      data: { status: 'captured', method: 'card', amount: s.amount, currencyCode: s.currencyCode, reference: intent.id, referenceKey: `stripe:${intent.id}`, receivedAt: uow.now, verifiedAt: uow.now, providerId: provider?.id ?? null, sessionId: s.id, orderId: s.orderId, customerId: s.customerId ?? (s.orderId ? (await tx.order.findUnique({ where: { id: s.orderId }, select: { customerId: true } }))?.customerId : null) },
    })
    auditChange(uow, systemActor('stripe'), 'Payment', payment.id, 'payment.captured', { amount: s.amount, reference: intent.id }, { toStatus: 'captured' })
    await applyMoney(uow, systemActor('stripe'), payment.id)
    uow.emit('payment.captured', 'Payment', payment.id, { amount: s.amount, currencyCode: s.currencyCode, sessionCode: s.publicCode })
    return { status: 'captured', replay: false }
  }
  if (outcome === 'cancelled' && s.status === 'pending') {
    await transition(uow, { model: 'PaymentSession', id: s.id, from: ['pending'], to: 'cancelled', actor: systemActor('stripe'), action: 'session.cancelled' })
    return { status: 'cancelled', replay: false }
  }
  if (outcome === 'authorized' && s.status === 'pending') {
    await transition(uow, { model: 'PaymentSession', id: s.id, from: ['pending'], to: 'authorized', actor: systemActor('stripe'), action: 'session.authorized' })
    return { status: 'authorized', replay: false }
  }
  return { status: s.status, replay: false }
}

/** Reads the intent back from Stripe and applies it (P46 reconcile; also called when the customer returns). */
export async function reconcileSession(db: Db, sessionId: string) {
  const s = await db.paymentSession.findUnique({ where: { id: sessionId }, include: { provider: true } })
  if (!s) throw new DomainError(Codes.NOT_FOUND, 'Payment not found.')
  if (s.provider?.code !== 'stripe' || !s.providerRef) return { status: s.status, checked: false }
  let intent: stripe.StripeIntent
  try {
    intent = await stripe.retrievePaymentIntent(s.providerRef)
  } catch (error) {
    // We cannot read the outcome: it stays as it is (or unknown) and remains in the reconcile queue.
    await db.paymentSession.update({ where: { id: s.id }, data: { lastCheckedAt: new Date(), providerStatus: 'unreadable' } })
    throw new DomainError(Codes.PROVIDER_ERROR, error instanceof Error ? error.message : 'Could not read the payment from Stripe.')
  }
  const result = await runInTransaction(db, uow => captureCard(uow, s.id, intent))
  const { deliverWebhookEvents } = await import('../../webhooks/outbound')
  if (result.webhookEventIds.length) await deliverWebhookEvents(db, result.webhookEventIds)
  return { status: result.value.status, checked: true }
}

/** Webhook (4.5): stored once by event id, verified on the raw body, matched before any change. */
export async function handleStripeWebhook(db: Db, rawBody: Buffer, signature: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET || ''
  if (!secret || !stripe.verifyStripeSignature(rawBody, signature, secret)) return { status: 400, body: { error: 'Invalid signature' } }
  let event: { id?: string; type?: string; data?: { object?: any } }
  try {
    event = JSON.parse(rawBody.toString('utf8'))
  } catch {
    return { status: 400, body: { error: 'Invalid payload' } }
  }
  if (!event.id || !event.type) return { status: 400, body: { error: 'Invalid event' } }
  const { sha256 } = await import('../lib/canonical')
  const provider = await db.paymentProvider.upsert({ where: { code: 'stripe' }, create: { code: 'stripe', name: 'Card', isOnline: true }, update: {} })
  try {
    await db.paymentWebhookEvent.create({ data: { providerEventId: `stripe:${event.id}`, type: event.type, payloadHash: sha256(rawBody), status: 'received', providerId: provider.id } })
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      const prior = await db.paymentWebhookEvent.findUnique({ where: { providerEventId: `stripe:${event.id}` } })
      if (prior && prior.status !== 'failed') return { status: 200, body: { received: true, duplicate: true } }
    } else throw error
  }
  const mark = (status: string, error = '') => db.paymentWebhookEvent.update({ where: { providerEventId: `stripe:${event.id}` }, data: { status, error: error.slice(0, 500), processedAt: new Date() } })
  const object = event.data?.object
  try {
    if (event.type.startsWith('payment_intent.') && object?.object === 'payment_intent') {
      const session = await db.paymentSession.findFirst({ where: { providerRef: object.id } })
      if (!session) {
        await mark('ignored', 'No session for this payment intent')
        return { status: 200, body: { received: true } }
      }
      const committed = await runInTransaction(db, uow => captureCard(uow, session.id, object))
      const { deliverWebhookEvents } = await import('../../webhooks/outbound')
      if (committed.webhookEventIds.length) await deliverWebhookEvents(db, committed.webhookEventIds)
      await mark('processed')
      return { status: 200, body: { received: true } }
    }
    if (event.type.startsWith('charge.refund') || event.type === 'refund.updated') {
      const refundObject = object?.object === 'refund' ? object : null
      if (refundObject?.id) await settleRefundFromProvider(db, refundObject)
      await mark('processed')
      return { status: 200, body: { received: true } }
    }
    await mark('ignored')
    return { status: 200, body: { received: true } }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'failed'
    // A mismatch is never retried into success; the event is kept for staff.
    await mark(error instanceof DomainError && error.code === Codes.GUARD_FAILED ? 'mismatch' : 'failed', message)
    return { status: error instanceof DomainError ? 200 : 500, body: { received: true } }
  }
}

// ---------- Recorded payments (mobile money, bank transfer, cash) ----------

export async function submitOffline(uow: UnitOfWork, actor: Actor, input: { sessionId: string; code: ProviderCode; reference: string; payerPhone?: string; amount?: number; collectedByStaff?: boolean }) {
  const tx = uow.tx
  const s = await lockRow<any>(tx, 'PaymentSession', input.sessionId)
  const effective = sessionEffectiveStatus(s, uow.now)
  if (!['pending', 'expired'].includes(effective)) throw new DomainError(Codes.INVALID_TRANSITION, 'This payment is already settled.', { currentStatus: s.status })
  const info = PROVIDERS[input.code]
  if (info.settlement !== 'offline') throw new DomainError(Codes.INVALID_INPUT, 'Pick mobile money, bank transfer or cash.')
  if (!info.customerCanSubmit && !input.collectedByStaff) throw new DomainError(Codes.NOT_AUTHORIZED, 'Cash is recorded by our staff when they collect it.')
  const reference = input.reference.trim()
  if (!/^[A-Za-z0-9 ._/-]{4,60}$/.test(reference)) throw new DomainError(Codes.INVALID_INPUT, 'Enter the transaction reference exactly as on your receipt.')
  const key = referenceKey(input.code, reference)
  const clash = await tx.payment.findUnique({ where: { referenceKey: key }, select: { id: true, status: true } })
  if (clash && clash.status !== 'rejected') throw new DomainError(Codes.DUPLICATE_REFERENCE, 'That reference has already been used for a payment.')
  if (clash) await tx.payment.update({ where: { id: clash.id }, data: { referenceKey: null } })
  const provider = await providerRow(tx, input.code)
  const amount = input.amount ?? s.amount
  if (amount !== s.amount) throw new DomainError(Codes.INVALID_INPUT, 'Pay the amount shown.')
  const customerId = s.customerId ?? (s.orderId ? (await tx.order.findUnique({ where: { id: s.orderId }, select: { customerId: true } }))?.customerId : null)
  const payment = await tx.payment.create({
    data: { status: 'submitted', method: info.method, amount, currencyCode: s.currencyCode, reference, referenceKey: key, payerPhone: input.payerPhone ?? '', receivedAt: uow.now, providerId: provider.id, sessionId: s.id, orderId: s.orderId, customerId, collectedById: input.collectedByStaff ? actorUserId(actor) : null },
  })
  // The session keeps its 3-day reference window while finance checks.
  if (s.providerId !== provider.id) await tx.paymentSession.update({ where: { id: s.id }, data: { providerId: provider.id } })
  auditChange(uow, actor, 'Payment', payment.id, 'payment.submitted', { reference, method: info.method, amount }, { toStatus: 'submitted' })
  return { paymentId: payment.id, status: 'submitted', reference }
}

export async function verifyOffline(uow: UnitOfWork, actor: Actor, paymentId: string, expectedVersion?: number | null) {
  const payment = await transition<any>(uow, {
    model: 'Payment', id: paymentId, from: ['submitted'], to: 'verified', expectedVersion, actor, action: 'payment.verified',
    data: { verifiedAt: uow.now, verifiedById: actorUserId(actor) },
    guard: async row => {
      if (!row.referenceKey) throw new DomainError(Codes.DUPLICATE_REFERENCE, 'This reference was used by another payment.')
    },
  })
  if (payment.sessionId) {
    const s = await lockRow<any>(uow.tx, 'PaymentSession', payment.sessionId)
    if (!['captured', 'partially_refunded', 'refunded'].includes(s.status)) await transition(uow, { model: 'PaymentSession', id: s.id, from: [s.status], to: 'captured', actor, action: 'session.captured', data: { capturedAt: uow.now } })
  }
  await applyMoney(uow, actor, paymentId)
  uow.emit('payment.verified', 'Payment', paymentId, { amount: payment.amount, currencyCode: payment.currencyCode, reference: payment.reference })
  return uow.tx.payment.findUnique({ where: { id: paymentId } })
}

export async function rejectOffline(uow: UnitOfWork, actor: Actor, paymentId: string, reason: string, expectedVersion?: number | null) {
  if (!reason.trim()) throw new DomainError(Codes.INVALID_INPUT, 'Say why the reference is rejected.')
  // The reference is released so the customer can enter the right one.
  return transition(uow, { model: 'Payment', id: paymentId, from: ['submitted'], to: 'rejected', expectedVersion, actor, action: 'payment.rejected', reason, data: { rejectReason: reason, referenceKey: null } })
}

/** Cash or a reference taken by staff (P30, P11): recorded and verified in one step by someone allowed to verify. */
export async function recordAndVerify(uow: UnitOfWork, actor: Actor, input: { sessionId: string; code: ProviderCode; reference: string; payerPhone?: string }) {
  const submitted = await submitOffline(uow, actor, { ...input, collectedByStaff: true })
  return verifyOffline(uow, actor, submitted.paymentId)
}

// ---------- Refunds (4.4) ----------

/**
 * Refund part or all of one payment. Total refunded can never pass what was captured: checked here with
 * the payment and order rows locked, and by CHECK constraints as the backstop. Cards refund through
 * Stripe after commit; a recorded payment is refunded as a payout with its own reference.
 */
export async function refund(uow: UnitOfWork, actor: Actor, input: { paymentId: string; amount: number; reason: string; payoutReference?: string; idempotencyKey: string }) {
  const tx = uow.tx
  const payment = await lockRow<any>(tx, 'Payment', input.paymentId)
  if (!['verified', 'captured', 'partially_refunded'].includes(payment.status)) throw new DomainError(Codes.INVALID_TRANSITION, 'Only received money can be refunded.', { currentStatus: payment.status })
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new DomainError(Codes.INVALID_INPUT, 'Refund amount must be more than zero.')
  if (payment.refundedAmount + input.amount > payment.amount) throw new DomainError(Codes.OVER_REFUND, `At most ${payment.amount - payment.refundedAmount} can still be refunded on this payment.`)
  if (payment.orderId) {
    const order = await lockRow<any>(tx, 'Order', payment.orderId)
    if (order.refundedAmount + input.amount > order.paidAmount) throw new DomainError(Codes.OVER_REFUND, 'The order has not received that much.')
    await tx.order.update({ where: { id: order.id }, data: { refundedAmount: { increment: input.amount } } })
  }
  const card = payment.method === 'card'
  if (!card && !input.payoutReference?.trim()) throw new DomainError(Codes.INVALID_INPUT, 'Enter the reference of the payout you sent the customer.')
  const refundedAmount = payment.refundedAmount + input.amount
  const nextStatus = refundedAmount === payment.amount ? 'refunded' : 'partially_refunded'
  await tx.payment.update({ where: { id: payment.id }, data: { refundedAmount, status: nextStatus, version: { increment: 1 } } })
  auditChange(uow, actor, 'Payment', payment.id, 'payment.refund', { amount: input.amount }, { fromStatus: payment.status, toStatus: nextStatus, reason: input.reason })
  if (payment.sessionId) {
    const s = await tx.paymentSession.findUnique({ where: { id: payment.sessionId } })
    if (s && ['captured', 'partially_refunded'].includes(s.status)) await tx.paymentSession.update({ where: { id: s.id }, data: { status: nextStatus, version: { increment: 1 } } })
  }
  const row = await tx.refund.create({
    data: { status: card ? 'pending' : 'succeeded', amount: input.amount, currencyCode: payment.currencyCode, reason: input.reason, payoutReference: input.payoutReference?.trim() ?? '', paymentId: payment.id, orderId: payment.orderId, issuedById: actorUserId(actor) },
  })
  auditChange(uow, actor, 'Refund', row.id, 'refund.issued', { amount: input.amount, paymentId: payment.id }, { toStatus: row.status, reason: input.reason })
  uow.emit('payment.refunded', 'Payment', payment.id, { amount: input.amount, refundId: row.id })
  // Commission inside the claw-back window goes back (4.15).
  if (payment.orderId) await clawBack(uow, actor, payment.orderId)
  if (card) {
    const refundId = row.id
    const intentId = payment.reference
    const key = `biogas-refund-${keyHash(input.idempotencyKey)}`
    uow.after(async db => {
      try {
        const r = await stripe.createRefund({ paymentIntentId: intentId, amount: input.amount, idempotencyKey: key, reason: input.reason })
        await db.refund.update({ where: { id: refundId }, data: { providerRef: r.id, status: r.status === 'succeeded' ? 'succeeded' : r.status === 'failed' || r.status === 'canceled' ? 'failed' : 'pending' } })
      } catch (error) {
        // Outcome unknown: kept for the reconcile tab, never guessed.
        await db.refund.update({ where: { id: refundId }, data: { status: 'unknown', reason: `${input.reason} (Stripe: ${error instanceof Error ? error.message.slice(0, 120) : 'no answer'})` } })
      }
    })
  }
  return row
}

export async function settleRefundFromProvider(db: Db, r: { id: string; status: string; payment_intent?: string | null; amount?: number; metadata?: Record<string, string> }) {
  const row = await db.refund.findFirst({ where: { providerRef: r.id } })
  if (!row) return
  const status = r.status === 'succeeded' ? 'succeeded' : r.status === 'failed' || r.status === 'canceled' ? 'failed' : 'pending'
  if (row.status !== status) await db.refund.update({ where: { id: row.id }, data: { status, version: { increment: 1 } } })
}

/** Reads a card refund back from Stripe (reconcile tab). */
export async function reconcileRefund(db: Db, refundId: string) {
  const row = await db.refund.findUnique({ where: { id: refundId } })
  if (!row?.providerRef) throw new DomainError(Codes.GUARD_FAILED, 'This refund has no Stripe reference yet.')
  const r = await stripe.retrieveRefund(row.providerRef)
  await settleRefundFromProvider(db, r)
  return db.refund.findUnique({ where: { id: refundId } })
}

async function clawBack(uow: UnitOfWork, actor: Actor, orderId: string) {
  const { getSettings } = await import('./settings')
  const settings = await getSettings(uow.tx)
  const commissions = await uow.tx.commission.findMany({ where: { orderId, status: { in: ['accrued', 'approved', 'paid'] } } })
  for (const c of commissions) {
    if (uow.now.getTime() - c.createdAt.getTime() > settings.commissionClawbackDays * 86_400_000) continue
    await transition(uow, { model: 'Commission', id: c.id, from: ['accrued', 'approved', 'paid'], to: 'clawed_back', actor, action: 'commission.clawed_back', reason: 'Order refunded', data: { clawedBackAt: uow.now } })
  }
}

export async function sessionByCode(tx: Tx, code: string) {
  const s = await tx.paymentSession.findUnique({ where: { publicCode: code }, include: { provider: true } })
  if (!s) throw new DomainError(Codes.NOT_FOUND, 'Payment link not found.')
  return s
}

export const providerCode = (v: unknown): ProviderCode => {
  if (!isProviderCode(v)) throw new DomainError(Codes.INVALID_INPUT, 'Pick a payment method.')
  return v
}

export { nextNumber }
