import type { UnitOfWork } from '../lib/unitOfWork'
import { DomainError, Codes } from '../lib/errors'
import type { Actor } from '../lib/actor'
import { openSession, orderBalance, type Purpose } from './money'
import { auditChange } from '../lib/cas'
import { int } from './util'

/**
 * A pay link staff share (S14): the balance of an order, a visit's survey fee, a ticket's repair, or any
 * amount up to what is owed. The method is picked by the customer on /pay/[code].
 */
export async function startSession(uow: UnitOfWork, actor: Actor, input: { orderId?: string; visitId?: string; ticketId?: string; amount?: number }) {
  const tx = uow.tx
  let session
  if (input.orderId) {
    const order = await tx.order.findUnique({ where: { id: input.orderId } })
    if (!order || order.status === 'cancelled') throw new DomainError(Codes.NOT_FOUND, 'Order not found.')
    const due = await orderBalance(tx, order.id)
    if (due <= 0) throw new DomainError(Codes.GUARD_FAILED, 'Nothing is owed on this order.')
    const amount = input.amount ? Math.min(int(input.amount, 'Amount', { min: 1 }), due) : due
    const purpose: Purpose = order.status === 'pending_payment' ? (order.planId ? 'deposit' : 'full') : 'balance'
    session = await openSession(uow, { code: 'bank_transfer', amount, currencyCode: order.currencyCode, purpose, description: `${order.number} ${purpose}`, target: { orderId: order.id, customerId: order.customerId } })
  } else if (input.visitId) {
    const v = await tx.visit.findUnique({ where: { id: input.visitId } })
    if (!v || v.feeAmount <= 0 || v.feePaid) throw new DomainError(Codes.GUARD_FAILED, 'This visit has no unpaid fee.')
    const { getSettings } = await import('./settings')
    const settings = await getSettings(tx)
    session = await openSession(uow, { code: 'bank_transfer', amount: v.feeAmount, currencyCode: settings.currencyCode, purpose: 'survey_fee', description: `Survey ${v.number}`, target: { visitId: v.id, customerId: v.customerId } })
  } else if (input.ticketId) {
    const q = await tx.quote.findFirst({ where: { ticketId: input.ticketId, status: 'accepted', kind: 'service' }, include: { order: true }, orderBy: { createdAt: 'desc' } })
    if (!q?.order) throw new DomainError(Codes.GUARD_FAILED, 'The repair quote is not accepted yet.')
    const due = await orderBalance(tx, q.order.id)
    if (due <= 0) throw new DomainError(Codes.GUARD_FAILED, 'The repair is paid.')
    session = await openSession(uow, { code: 'bank_transfer', amount: due, currencyCode: q.order.currencyCode, purpose: 'service', description: `Repair ${q.order.number}`, target: { orderId: q.order.id, ticketId: input.ticketId, customerId: q.order.customerId } })
  } else throw new DomainError(Codes.INVALID_INPUT, 'Pick an order, a visit or a ticket.')
  await tx.paymentSession.update({ where: { id: session.id }, data: { providerId: null } })
  auditChange(uow, actor, 'PaymentSession', session.id, 'session.pay_link', { amount: session.amount, purpose: session.purpose }, { toStatus: 'pending' })
  return { sessionId: session.id, code: session.publicCode, amount: session.amount, currencyCode: session.currencyCode, purpose: session.purpose, expiresAt: session.expiresAt }
}

/** References already sent in and waiting for finance, so two collections cannot both claim the same balance. */
async function awaiting(tx: UnitOfWork['tx'], where: Record<string, unknown>) {
  const r = await tx.payment.aggregate({ where: { status: 'submitted', ...where }, _sum: { amount: true } })
  return r._sum.amount ?? 0
}

/**
 * P30: a technician takes a payment on site. Only a crew member (or a visit manager) on a visit that is
 * on site, or was completed today in the company's time zone. The amount is what this visit is for:
 * its unpaid survey fee, else its accepted repair, else its installation's order balance, never more
 * than is still owed after references already waiting. The payment stays submitted until finance
 * verifies it and records who collected it; the reply carries nothing about other payments.
 */
export async function collectOnSite(uow: UnitOfWork, actor: Actor, input: { visitId: string; provider: string; reference: string; payerPhone?: string; amount?: number }) {
  const tx = uow.tx
  const { requirePermission } = await import('../lib/actor')
  requirePermission(actor, 'canDoFieldWork', 'canManageVisits')
  const visit = await tx.visit.findUnique({ where: { id: String(input.visitId ?? '') }, include: { technicians: { select: { id: true } }, installation: { select: { orderId: true } } } })
  if (!visit) throw new DomainError(Codes.NOT_FOUND, 'Visit not found.')
  if (actor.kind === 'user' && !actor.permissions.has('canManageVisits') && !visit.technicians.some(t => t.id === actor.userId)) throw new DomainError(Codes.NOT_AUTHORIZED, 'You are not on this visit.')
  const { getSettings } = await import('./settings')
  const { localDay } = await import('../lib/time')
  const settings = await getSettings(tx)
  const today = localDay(uow.now, settings.timezone)
  const doneToday = visit.status === 'completed' && visit.checkOutAt && localDay(visit.checkOutAt, settings.timezone) === today
  if (visit.status !== 'on_site' && !doneToday) throw new DomainError(Codes.GUARD_FAILED, 'Take a payment while on site, or on the day the visit was completed.', { currentStatus: visit.status })

  const { providerCode, submitOffline } = await import('./payments')
  const code = providerCode(input.provider)
  if (code === 'stripe') throw new DomainError(Codes.INVALID_INPUT, 'Pick cash, mobile money or bank transfer.')

  // What this visit collects for, and how much is still owed on it.
  let target: { purpose: Purpose; owed: number; currencyCode: string; description: string; orderId?: string; visitId?: string; ticketId?: string; customerId: string | null } | null = null
  if (visit.feeAmount > 0 && !visit.feePaid) {
    const owed = visit.feeAmount - (await awaiting(tx, { session: { visitId: visit.id, purpose: { equals: 'survey_fee' } } }))
    target = { purpose: 'survey_fee', owed, currencyCode: settings.currencyCode, description: `Survey ${visit.number}`, visitId: visit.id, customerId: visit.customerId }
  }
  if (!target && visit.ticketId) {
    const q = await tx.quote.findFirst({ where: { ticketId: visit.ticketId, status: 'accepted', kind: 'service' }, include: { order: true }, orderBy: { createdAt: 'desc' } })
    if (q?.order && q.order.status !== 'cancelled') {
      const owed = (await orderBalance(tx, q.order.id)) - (await awaiting(tx, { orderId: q.order.id }))
      if (owed > 0) target = { purpose: 'service', owed, currencyCode: q.order.currencyCode, description: `Repair ${q.order.number}`, orderId: q.order.id, ticketId: visit.ticketId, customerId: q.order.customerId }
    }
  }
  if (!target && visit.installation?.orderId) {
    const order = await tx.order.findUnique({ where: { id: visit.installation.orderId } })
    if (order && order.status !== 'cancelled') {
      const owed = (await orderBalance(tx, order.id)) - (await awaiting(tx, { orderId: order.id }))
      if (owed > 0) target = { purpose: order.status === 'pending_payment' ? (order.planId ? 'deposit' : 'full') : 'balance', owed, currencyCode: order.currencyCode, description: `${order.number} on site`, orderId: order.id, customerId: order.customerId }
    }
  }
  if (!target || target.owed <= 0) throw new DomainError(Codes.GUARD_FAILED, 'Nothing is owed on this visit, or the payment is already waiting for finance.')
  const amount = input.amount === undefined || input.amount === null ? target.owed : int(input.amount, 'Amount', { min: 1 })
  if (amount > target.owed) throw new DomainError(Codes.INVALID_INPUT, `At most ${target.owed} can be taken; that is what is still owed.`)

  const session = await openSession(uow, { code, amount, currencyCode: target.currencyCode, purpose: target.purpose, description: target.description, target: { orderId: target.orderId, visitId: target.visitId, ticketId: target.ticketId, customerId: target.customerId } })
  const paid = await submitOffline(uow, actor, { sessionId: session.id, code, reference: String(input.reference ?? ''), payerPhone: input.payerPhone, amount, collectedByStaff: true })
  auditChange(uow, actor, 'Visit', visit.id, 'visit.payment_collected', { paymentId: paid.paymentId, amount, method: code, purpose: target.purpose })
  return { paymentId: paid.paymentId, status: paid.status, reference: paid.reference, amount, currencyCode: target.currencyCode, purpose: target.purpose, sessionCode: session.publicCode }
}
