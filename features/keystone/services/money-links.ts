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
