import type { Tx } from '../lib/db'
import type { UnitOfWork } from '../lib/unitOfWork'
import { DomainError, Codes } from '../lib/errors'
import { auditChange, lockRow, transition } from '../lib/cas'
import { nextNumber, publicCode } from '../lib/sequence'
import { addMonths, addDays, installmentEffectiveStatus } from '../lib/time'
import { systemActor, type Actor } from '../lib/actor'
import { getSettings } from './settings'
import { reserveLines, type Reservation } from './stock'
import { PROVIDERS, type ProviderCode } from '../../integrations/payment'

/**
 * Money in: sessions, captured and verified payments, allocation to an order, its plan's instalments
 * (oldest first), a subscription, a visit fee or a ticket. Every function here runs inside the caller's
 * transaction with the rows it changes locked.
 */
export type Purpose = 'deposit' | 'full' | 'instalment' | 'balance' | 'payoff' | 'survey_fee' | 'service' | 'plan' | 'order_change'

export async function providerRow(tx: Tx, code: ProviderCode) {
  const info = PROVIDERS[code]
  const row = await tx.paymentProvider.upsert({
    where: { code },
    create: { code, name: info.label, isEnabled: true, isOnline: info.settlement === 'processor', sortOrder: Object.keys(PROVIDERS).indexOf(code) },
    update: {},
  })
  if (!row.isEnabled) throw new DomainError(Codes.PROVIDER_UNAVAILABLE, `${row.name} is switched off for this company.`)
  return row
}

export type SessionTarget = {
  orderId?: string | null
  installmentIds?: string[]
  subscriptionId?: string | null
  ticketId?: string | null
  quoteId?: string | null
  visitId?: string | null
  orderChangeId?: string | null
  customerId?: string | null
}

/** A pending session. Card sessions last 30 minutes; a reference session 3 days (4.4). */
export async function openSession(uow: UnitOfWork, input: { code: ProviderCode; amount: number; currencyCode: string; purpose: Purpose; description: string; target: SessionTarget; keyHash?: string | null }) {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new DomainError(Codes.INVALID_INPUT, 'Nothing to pay.')
  const provider = await providerRow(uow.tx, input.code)
  const t = input.target
  return uow.tx.paymentSession.create({
    data: {
      status: 'pending',
      publicCode: publicCode('PAY'),
      amount: input.amount,
      currencyCode: input.currencyCode,
      purpose: input.purpose,
      description: input.description.slice(0, 300),
      expiresAt: new Date(uow.now.getTime() + PROVIDERS[input.code].sessionMinutes * 60_000),
      idempotencyKeyHash: input.keyHash ?? null,
      providerId: provider.id,
      orderId: t.orderId ?? null,
      subscriptionId: t.subscriptionId ?? null,
      ticketId: t.ticketId ?? null,
      quoteId: t.quoteId ?? null,
      visitId: t.visitId ?? null,
      orderChangeId: t.orderChangeId ?? null,
      customerId: t.customerId ?? null,
      ...(t.installmentIds?.length ? { installments: { connect: t.installmentIds.map(id => ({ id })) } } : {}),
    },
    include: { installments: { select: { id: true } } },
  })
}

/** Who paid: the session's customer, or the order's. */
async function customerFor(tx: Tx, s: { customerId: string | null; orderId: string | null }) {
  if (s.customerId) return s.customerId
  if (s.orderId) return (await tx.order.findUnique({ where: { id: s.orderId }, select: { customerId: true } }))?.customerId ?? null
  return null
}

/**
 * Records money that is now real (a card capture, or an offline reference staff verified) and applies
 * it. `payment` already exists for offline methods (submitted → verified); for cards it is created here.
 */
export async function applyMoney(uow: UnitOfWork, actor: Actor, paymentId: string) {
  const tx = uow.tx
  const payment = await lockRow<any>(tx, 'Payment', paymentId)
  if (!['verified', 'captured'].includes(payment.status)) throw new DomainError(Codes.GUARD_FAILED, 'Only verified or captured money is applied.')
  if (payment.allocatedAmount > 0) return payment
  const session = payment.sessionId ? await tx.paymentSession.findUnique({ where: { id: payment.sessionId }, include: { installments: { select: { id: true } } } }) : null
  let left = payment.amount
  const allocate = async (kind: string, amount: number, link: Record<string, string>) => {
    if (amount <= 0) return
    await tx.paymentAllocation.create({ data: { paymentId, amount, kind, ...link } })
    left -= amount
  }

  const orderId = payment.orderId ?? session?.orderId ?? null
  if (orderId) {
    const order = await lockRow<any>(tx, 'Order', orderId)
    if (order.currencyCode !== payment.currencyCode) throw new DomainError(Codes.GUARD_FAILED, 'Payment currency does not match the order.')
    const outstanding = Math.max(0, order.totalAmount - (order.paidAmount - order.refundedAmount))
    const toOrder = Math.min(left, outstanding)
    if (toOrder > 0) {
      await tx.order.update({ where: { id: orderId }, data: { paidAmount: { increment: toOrder } } })
      const planned = await allocateToPlan(uow, order, toOrder, session?.purpose === 'payoff', paymentId)
      if (toOrder - planned > 0) await tx.paymentAllocation.create({ data: { paymentId, amount: toOrder - planned, kind: 'order', orderId } })
      left -= toOrder
    }
    // A change order paid for: mark it applied.
    if (session?.orderChangeId) {
      const change = await tx.orderChange.findUnique({ where: { id: session.orderChangeId } })
      if (change?.status === 'approved') await transition(uow, { model: 'OrderChange', id: change.id, from: ['approved'], to: 'applied', actor, action: 'orderChange.applied' })
    }
    if (order.status === 'pending_payment') await confirmOrder(uow, actor, orderId)
  }
  if (session?.subscriptionId) {
    const { activateSubscription } = await import('./subscriptions')
    const used = await activateSubscription(uow, actor, session.subscriptionId, left)
    await allocate('subscription', used, { subscriptionId: session.subscriptionId })
  }
  if (session?.visitId && session.purpose === 'survey_fee') {
    await tx.visit.update({ where: { id: session.visitId }, data: { feePaid: true } })
    await allocate('visit', Math.min(left, payment.amount), {})
  }
  if (session?.ticketId && !orderId) await allocate('ticket', left, {})

  // Anything left over is the customer's credit (4.6: a payment larger than the whole balance).
  if (left > 0) {
    const customerId = payment.customerId ?? (session ? await customerFor(tx, session) : null)
    if (customerId) {
      await tx.customer.update({ where: { id: customerId }, data: { storeCreditAmount: { increment: left } } })
      await allocate('credit', left, {})
      auditChange(uow, actor, 'Customer', customerId, 'customer.credit_added', { amount: left, paymentId })
    }
  }
  const allocated = payment.amount - left
  await tx.payment.update({ where: { id: paymentId }, data: { allocatedAmount: allocated, receiptNumber: payment.receiptNumber ?? (await nextNumber(tx, 'R')) } })
  return tx.payment.findUnique({ where: { id: paymentId } })
}

/** Oldest unpaid first (4.6). Instalment rows are locked through the plan row. Returns what was applied. */
export async function allocateToPlan(uow: UnitOfWork, order: { id: string; planId: string | null }, amount: number, payoff = false, paymentId?: string) {
  if (!order.planId) return 0
  const tx = uow.tx
  const plan = await lockRow<any>(tx, 'PaymentPlan', order.planId)
  if (['cancelled', 'completed', 'settled_early'].includes(plan.status)) return 0
  const settings = await getSettings(tx)
  const rows = await tx.installment.findMany({ where: { planId: plan.id, status: { notIn: ['paid', 'waived', 'cancelled'] } }, orderBy: { sequence: 'asc' } })
  let left = amount
  for (const row of rows) {
    if (left <= 0) break
    const take = Math.min(left, row.amount - row.paidAmount)
    if (take <= 0) continue
    const paidAmount = row.paidAmount + take
    const paid = paidAmount >= row.amount
    await tx.installment.update({ where: { id: row.id }, data: { paidAmount, status: paid ? 'paid' : 'partially_paid', paidAt: paid ? uow.now : row.paidAt, version: { increment: 1 } } })
    if (paymentId) await tx.paymentAllocation.create({ data: { paymentId, amount: take, kind: 'installment', installmentId: row.id, orderId: order.id } })
    left -= take
    if (paid) uow.emit('installment.paid', 'Installment', row.id, { planId: plan.id, amount: row.amount })
  }
  const paidAmount = Math.min(plan.totalAmount, plan.paidAmount + (amount - left))
  const remaining = await tx.installment.findMany({ where: { planId: plan.id, status: { notIn: ['paid', 'waived', 'cancelled'] } }, orderBy: { sequence: 'asc' } })
  let status = plan.status === 'pending' ? 'active' : plan.status
  if (!remaining.length) status = payoff && settings.waivePlanFeeOnPayoff && rows.length > 1 ? 'settled_early' : 'completed'
  else if (plan.status === 'in_arrears' && !remaining.some(r => installmentEffectiveStatus(r, uow.now, settings.instalmentGraceDays) === 'overdue')) status = 'active'
  await tx.paymentPlan.update({ where: { id: plan.id }, data: { paidAmount, status, version: { increment: 1 }, nextDueAt: remaining.find(r => r.dueDate)?.dueDate ?? null } })
  if (status !== plan.status) {
    auditChange(uow, systemActor('payments'), 'PaymentPlan', plan.id, 'plan.status', { paidAmount }, { fromStatus: plan.status, toStatus: status })
    if (['completed', 'settled_early'].includes(status)) uow.emit('plan.completed', 'PaymentPlan', plan.id, { orderId: order.id })
  }
  return amount - left
}

/**
 * pending_payment → confirmed (W4.2): reserve stock, create the plan and dated instalments, open the
 * installation and incentive applications, mark the lead won.
 */
export async function confirmOrder(uow: UnitOfWork, actor: Actor, orderId: string) {
  const tx = uow.tx
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { lines: true, quote: { include: { acceptedPlanOffer: true, acceptedOption: { include: { lines: true } } } } } })
  if (!order) throw new DomainError(Codes.NOT_FOUND, 'Order not found.')
  let reservations: Reservation[] = []
  let stockShort = false
  try {
    await tx.$executeRaw`SAVEPOINT reserve_stock`
    reservations = await reserveLines(tx, order.lines.filter(l => l.productId && l.kind === 'product').map(l => ({ productId: l.productId!, quantity: l.quantity })), order.branchId, { refType: 'Order', refId: order.id, userId: actor.kind === 'user' ? actor.userId : null })
    await tx.$executeRaw`RELEASE SAVEPOINT reserve_stock`
  } catch (error) {
    await tx.$executeRaw`ROLLBACK TO SAVEPOINT reserve_stock`
    if ((error as { code?: string }).code !== 'OUT_OF_STOCK') throw error
    // The customer has paid: the order is confirmed and flagged; the storekeeper sees it short.
    stockShort = true
  }
  await transition(uow, { model: 'Order', id: orderId, from: ['pending_payment'], to: 'confirmed', actor, action: 'order.confirmed', data: { confirmedAt: uow.now, reservations: reservations as never, stockShort } })
  uow.emit('order.confirmed', 'Order', orderId, { number: order.number, totalAmount: order.totalAmount, currencyCode: order.currencyCode })

  const offer = order.quote?.acceptedPlanOffer
  if (offer && !order.planId && Array.isArray(offer.schedule) && (offer.schedule as unknown[]).length > 1) await createPlan(uow, order, offer)

  // Installation for orders that need one (W4.4).
  const needsInstall = order.fulfilment === 'install' && order.lines.some(l => l.requiresInstallation)
  if (needsInstall) {
    const existing = await tx.installation.findUnique({ where: { orderId } })
    if (!existing) {
      const kitLine = order.lines.find(l => l.requiresInstallation && l.productId)
      const spec = kitLine?.productId ? await tx.digesterSpec.findUnique({ where: { productId: kitLine.productId }, include: { preInstallTemplate: { include: { items: { orderBy: { sortOrder: 'asc' } } } } } }) : null
      const items = spec?.preInstallTemplate?.items ?? []
      const inst = await tx.installation.create({
        data: { number: await nextNumber(tx, 'IN'), status: items.some(i => i.isRequired) ? 'awaiting_site_prep' : 'ready_to_schedule', orderId, siteId: order.siteId, customerId: order.customerId, productId: kitLine?.productId ?? null, prepTasks: { create: items.map(i => ({ prompt: i.prompt, helpText: i.helpText, sortOrder: i.sortOrder, isRequired: i.isRequired, status: 'pending' })) } },
      })
      auditChange(uow, actor, 'Installation', inst.id, 'installation.created', { orderId }, { toStatus: inst.status })
    }
  }
  // Incentive applications for incentive lines (W4.3).
  const incentiveLines = order.quote?.acceptedOption?.lines.filter(l => l.kind === 'incentive' && l.incentiveProgramId) ?? []
  for (const line of incentiveLines) {
    const program = await tx.incentiveProgram.findUnique({ where: { id: line.incentiveProgramId! } })
    if (!program) continue
    const app = await tx.incentiveApplication.create({ data: { status: 'draft', programId: program.id, orderId, customerId: order.customerId, amount: -line.totalAmount, currencyCode: order.currencyCode, treatment: program.treatment } })
    auditChange(uow, actor, 'IncentiveApplication', app.id, 'incentive.opened', { orderId }, { toStatus: 'draft' })
  }
  if (order.quote?.leadId) {
    const lead = await tx.lead.findUnique({ where: { id: order.quote.leadId } })
    if (lead && !['won', 'lost', 'unqualified'].includes(lead.status)) await transition(uow, { model: 'Lead', id: lead.id, from: [lead.status], to: 'won', actor: systemActor('orders'), action: 'lead.won' })
  }
  // A repair paid first: work can start (W8.4).
  if (order.quote?.kind === 'service' && order.quote.ticketId) {
    const t = await tx.serviceTicket.findUnique({ where: { id: order.quote.ticketId } })
    if (t?.status === 'awaiting_customer_approval') await transition(uow, { model: 'ServiceTicket', id: t.id, from: ['awaiting_customer_approval'], to: 'in_progress', actor: systemActor('payments'), action: 'ticket.in_progress', reason: 'Repair paid' })
  }
  // Survey fee paid earlier is credited to the order (W2.2).
  if (order.customerId && order.channel === 'quote') {
    const fee = await tx.visit.findFirst({ where: { customerId: order.customerId, type: 'survey', feePaid: true, feeAmount: { gt: 0 } }, orderBy: { createdAt: 'desc' } })
    if (fee && order.surveyFeeCreditAmount === 0) await tx.order.update({ where: { id: orderId }, data: { surveyFeeCreditAmount: fee.feeAmount } })
  }
}

/** Plan and instalments from the accepted offer: due dates monthly or weekly from the order date. */
export async function createPlan(uow: UnitOfWork, order: { id: string; customerId: string | null; currencyCode: string; totalAmount: number }, offer: any) {
  const tx = uow.tx
  const schedule = offer.schedule as { sequence: number; label: string; amount: number; trigger: string; offset?: number }[]
  const start = uow.now
  const due = (row: (typeof schedule)[number]) => {
    if (row.trigger === 'on_order') return start
    if (row.trigger !== 'date') return null
    return offer.frequency === 'weekly' ? addDays(start, 7 * (row.offset ?? row.sequence)) : addMonths(start, row.offset ?? row.sequence)
  }
  const plan = await tx.paymentPlan.create({
    data: {
      status: 'pending',
      kind: offer.instalmentCount > 0 && schedule.every(r => r.trigger === 'on_order' || r.trigger === 'date') ? 'instalments' : 'milestones',
      currencyCode: order.currencyCode,
      principalAmount: order.totalAmount,
      planFeeAmount: offer.planFeeAmount,
      depositAmount: offer.depositAmount,
      totalAmount: schedule.reduce((s, r) => s + r.amount, 0),
      startDate: start,
      frequency: offer.frequency ?? '',
      customerId: order.customerId,
      templateId: offer.templateId ?? null,
      installments: { create: schedule.map(r => ({ sequence: r.sequence, label: r.label, amount: r.amount, dueDate: due(r), trigger: r.trigger, status: r.trigger === 'on_order' ? 'due' : 'scheduled' })) },
    },
  })
  await tx.order.update({ where: { id: order.id }, data: { planId: plan.id } })
  // The plan's total includes the plan fee; the order's total grows by it so the balance reads right.
  if (plan.totalAmount !== order.totalAmount) await tx.order.update({ where: { id: order.id }, data: { totalAmount: plan.totalAmount } })
  // The deposit already paid on the order counts against the first instalment.
  const current = await tx.order.findUnique({ where: { id: order.id }, select: { paidAmount: true, refundedAmount: true, planId: true, id: true } })
  if (current && current.paidAmount - current.refundedAmount > 0) await allocateToPlan(uow, current, current.paidAmount - current.refundedAmount)
  auditChange(uow, systemActor('orders'), 'PaymentPlan', plan.id, 'plan.created', { orderId: order.id }, { toStatus: 'active' })
  return plan
}

/** Milestones fall due when the order reaches the stage (W12): delivery or commissioning. */
export async function triggerMilestones(uow: UnitOfWork, orderId: string, trigger: 'on_delivery' | 'on_commissioning') {
  const order = await uow.tx.order.findUnique({ where: { id: orderId }, select: { planId: true } })
  if (!order?.planId) return
  await uow.tx.installment.updateMany({ where: { planId: order.planId, trigger, dueDate: null, status: 'scheduled' }, data: { dueDate: uow.now, status: 'due' } })
}

/** Amount still owed on an order, and the instalments it covers. */
export async function orderBalance(tx: Tx, orderId: string) {
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { totalAmount: true, paidAmount: true, refundedAmount: true } })
  if (!order) throw new DomainError(Codes.NOT_FOUND, 'Order not found.')
  return Math.max(0, order.totalAmount - (order.paidAmount - order.refundedAmount))
}
