import type { Tx } from '../lib/db'
import type { UnitOfWork } from '../lib/unitOfWork'
import { DomainError, Codes } from '../lib/errors'
import { auditChange, lockRow, transition } from '../lib/cas'
import { actorUserId, requirePermission, systemActor, type Actor } from '../lib/actor'
import { nextNumber, publicCode } from '../lib/sequence'
import { addDays, addWorkingDays } from '../lib/time'
import { percentOf } from '../lib/money'
import { getSettings, type Settings } from './settings'
import { priceLines } from './pricing'
import { pickReserved, pickUnreserved, releaseReservations, reserveLines, returnToStock, stockUnits, type Reservation } from './stock'
import { openSession, triggerMilestones } from './money'
import { refund } from './payments'
import { int, str } from './util'

/** Orders (W4, W10, 4.4): line snapshots, fulfilment, cancellation with the refund rules, changes, returns, invoices. */
export type OrderLineInput = {
  kind: string
  productId: string | null
  name: string
  sku: string
  quantity: number
  unitAmount: number
  taxable: boolean
  warrantyMonths: number
  requiresInstallation: boolean
  snapshot: Record<string, unknown>
  taxAmount?: number
  totalAmount?: number
}

type NewOrder = {
  channel: 'quote' | 'shop' | 'staff'
  lines: OrderLineInput[]
  customerId: string | null
  siteId?: string | null
  quoteId?: string | null
  branchId?: string | null
  salesAgentId?: string | null
  referralId?: string | null
  fulfilment: 'install' | 'delivery' | 'pickup' | 'service'
  deliveryAmount?: number
  shippingAddress?: Record<string, unknown>
  /** A quote option was priced when it was built; the order keeps exactly what the customer signed. */
  fixedTotals?: { subtotalAmount: number; discountAmount: number; taxAmount: number; totalAmount: number }
}

export async function createOrderFromLines(uow: UnitOfWork, actor: Actor, input: NewOrder) {
  const tx = uow.tx
  const settings = await getSettings(tx)
  if (!input.lines.length) throw new DomainError(Codes.INVALID_INPUT, 'An order needs at least one line.')
  const delivery = Math.max(0, input.deliveryAmount ?? 0)
  const allLines = delivery > 0 ? [...input.lines, { kind: 'delivery', productId: null, name: 'Delivery', sku: '', quantity: 1, unitAmount: delivery, taxable: true, warrantyMonths: 0, requiresInstallation: false, snapshot: {} }] : input.lines
  const priced = input.fixedTotals
    ? { lines: allLines.map(l => ({ ...l, taxAmount: l.taxAmount ?? 0, totalAmount: l.totalAmount ?? l.quantity * l.unitAmount })), ...input.fixedTotals }
    : priceLines(allLines, settings)
  const order = await tx.order.create({
    data: {
      number: await nextNumber(tx, 'O'),
      status: 'pending_payment',
      channel: input.channel,
      publicCode: publicCode('O'),
      currencyCode: settings.currencyCode,
      subtotalAmount: priced.subtotalAmount,
      discountAmount: priced.discountAmount,
      deliveryAmount: delivery,
      taxAmount: priced.taxAmount,
      totalAmount: priced.totalAmount,
      fulfilment: input.fulfilment,
      shippingAddress: (input.shippingAddress ?? {}) as never,
      customerId: input.customerId,
      siteId: input.siteId ?? null,
      quoteId: input.quoteId ?? null,
      branchId: input.branchId ?? null,
      salesAgentId: input.salesAgentId ?? null,
      referralId: input.referralId ?? null,
      lines: { create: priced.lines.map(l => ({ kind: l.kind, name: l.name.slice(0, 200), sku: l.sku, quantity: l.quantity, unitAmount: l.unitAmount, taxAmount: l.taxAmount, totalAmount: l.totalAmount, warrantyMonths: l.warrantyMonths, requiresInstallation: l.requiresInstallation, snapshot: l.snapshot as never, productId: l.productId })) },
    },
  })
  auditChange(uow, actor, 'Order', order.id, 'order.created', { number: order.number, channel: input.channel, totalAmount: order.totalAmount }, { toStatus: 'pending_payment' })
  return order
}

// ---------------- Cancellation (4.4) ----------------

export type CancelQuote = { allowed: boolean; rule: string; refundAmount: number; keepAmount: number; paidAmount: number }

const PRE_PICK = ['pending_payment', 'confirmed']
const PRE_DELIVERY = ['pending_payment', 'confirmed', 'preparing', 'ready', 'shipped', 'out_for_install']
const AFTER_INSTALL = ['installed', 'completed', 'closed', 'cancelled']

/**
 * The refund the rules give (pure, so the order page shows it before staff press cancel, and tests can
 * check every stage). Amounts are what the customer has paid net of earlier refunds.
 */
export function cancellationRefund(
  order: { status: string; confirmedAt: Date | null; pickedAt: Date | null; paidAmount: number; refundedAmount: number; deliveryAmount: number; surveyFeeCreditAmount: number; lines: { kind: string; totalAmount: number; snapshot: unknown }[] },
  settings: Pick<Settings, 'coolingOffDays' | 'restockingFeePercent'>,
  now: Date,
  opts: { byCompany?: boolean; kitReturned?: boolean } = {},
): CancelQuote {
  const paid = Math.max(0, order.paidAmount - order.refundedAmount)
  const out = (allowed: boolean, rule: string, keep: number): CancelQuote => {
    const keepAmount = Math.min(paid, Math.max(0, keep))
    return { allowed, rule, refundAmount: allowed ? paid - keepAmount : 0, keepAmount: allowed ? keepAmount : paid, paidAmount: paid }
  }
  if (AFTER_INSTALL.includes(order.status)) return out(false, order.status === 'cancelled' ? 'Already cancelled' : 'Installed: no cancellation; warranty and service apply', paid)
  if (opts.byCompany) return out(true, 'Company cancels: full refund, including the survey fee', 0)
  const kitValue = order.lines.filter(l => l.kind === 'product' && (l.snapshot as { type?: string } | null)?.type !== 'service').reduce((s, l) => s + l.totalAmount, 0)
  const restocking = percentOf(kitValue, settings.restockingFeePercent)
  const coolingEnds = order.confirmedAt ? addWorkingDays(new Date(order.confirmedAt), settings.coolingOffDays) : null
  if (PRE_DELIVERY.includes(order.status) && (!coolingEnds || now.getTime() <= coolingEnds.getTime())) return out(true, `Within the ${settings.coolingOffDays}-working-day cooling-off window: full refund`, 0)
  if (PRE_PICK.includes(order.status) && !order.pickedAt) return out(true, 'Before picking: deposit less the survey fee', order.surveyFeeCreditAmount)
  if (PRE_DELIVERY.includes(order.status)) return out(true, `Picked, not delivered: less a ${settings.restockingFeePercent}% restocking fee`, restocking)
  // Delivered, not installed.
  if (!opts.kitReturned) return out(false, 'Delivered: the kit must come back unopened before cancelling', paid)
  return out(true, `Delivered and returned unopened: less the restocking fee and delivery`, restocking + order.deliveryAmount)
}

export async function cancelOrder(uow: UnitOfWork, actor: Actor, input: { orderId: string; reason: string; byCompany?: boolean; kitReturned?: boolean; returnLocationId?: string | null; payoutReference?: string; expectedVersion?: number | null; idempotencyKey: string }) {
  requirePermission(actor, 'canManageOrders')
  const tx = uow.tx
  const reason = str(input.reason, 500)
  if (!reason) throw new DomainError(Codes.INVALID_INPUT, 'Give a reason.')
  const settings = await getSettings(tx)
  const locked = await lockRow<any>(tx, 'Order', input.orderId)
  const order = await tx.order.findUnique({ where: { id: locked.id }, include: { lines: true } })
  const quote = cancellationRefund(order as any, settings, uow.now, { byCompany: input.byCompany, kitReturned: input.kitReturned })
  if (!quote.allowed) throw new DomainError(Codes.GUARD_FAILED, quote.rule)
  const ref = { refType: 'Order', refId: locked.id, userId: actorUserId(actor), reason: `Cancelled: ${reason}` }
  // Stock: unpicked reservations are released; a picked kit that came back goes on the shelf.
  if (!locked.pickedAt) await releaseReservations(tx, (Array.isArray(locked.reservations) ? locked.reservations : []) as Reservation[], ref)
  else if (input.kitReturned || ['preparing', 'ready'].includes(locked.status)) {
    const locationId = input.returnLocationId ?? (Array.isArray(locked.reservations) ? (locked.reservations as Reservation[])[0]?.locationId : null)
    if (!locationId) throw new DomainError(Codes.INVALID_INPUT, 'Pick the location the kit goes back to.')
    for (const line of order!.lines.filter(l => l.productId && l.kind === 'product' && l.fulfilledQuantity > 0)) for (const unit of await stockUnits(tx, line.productId!, line.fulfilledQuantity)) await returnToStock(tx, unit.productId, locationId, unit.quantity, ref)
    await tx.serializedUnit.updateMany({ where: { orderId: locked.id }, data: { status: 'in_stock', orderId: null, locationId } })
  }
  if (!locked.pickedAt) await tx.serializedUnit.updateMany({ where: { orderId: locked.id }, data: { status: 'in_stock', orderId: null } })
  await transition(uow, { model: 'Order', id: locked.id, from: [locked.status], to: 'cancelled', expectedVersion: input.expectedVersion, actor, action: 'order.cancelled', reason, data: { cancelReason: reason, cancelledAt: uow.now, reservations: [] } })
  if (locked.planId) {
    await tx.installment.updateMany({ where: { planId: locked.planId, status: { notIn: ['paid', 'waived'] } }, data: { status: 'cancelled' } })
    await transition(uow, { model: 'PaymentPlan', id: locked.planId, from: ['pending', 'active', 'in_arrears', 'defaulted'], to: 'cancelled', actor, action: 'plan.cancelled', reason }).catch(e => (e?.code === Codes.INVALID_TRANSITION ? null : Promise.reject(e)))
  }
  const inst = await tx.installation.findUnique({ where: { orderId: locked.id } })
  if (inst && !['commissioned', 'cancelled'].includes(inst.status)) await transition(uow, { model: 'Installation', id: inst.id, from: [inst.status], to: 'cancelled', actor, action: 'installation.cancelled', reason })
  await tx.incentiveApplication.updateMany({ where: { orderId: locked.id, status: { in: ['draft', 'submitted'] } }, data: { status: 'withdrawn' } })
  await tx.paymentSession.updateMany({ where: { orderId: locked.id, status: 'pending' }, data: { status: 'cancelled' } })
  // Refund newest money first until the rule's amount is reached.
  let left = quote.refundAmount
  const payments = await tx.payment.findMany({ where: { orderId: locked.id, status: { in: ['verified', 'captured', 'partially_refunded'] } }, orderBy: { createdAt: 'desc' } })
  for (const p of payments) {
    if (left <= 0) break
    const take = Math.min(left, p.amount - p.refundedAmount, p.allocatedAmount)
    if (take <= 0) continue
    await refund(uow, actor, { paymentId: p.id, amount: take, reason: `Order cancelled: ${reason}`, payoutReference: input.payoutReference, idempotencyKey: `${input.idempotencyKey}:${p.id}` })
    left -= take
  }
  uow.emit('order.cancelled', 'Order', locked.id, { number: locked.number, refundAmount: quote.refundAmount - left })
  return { orderId: locked.id, rule: quote.rule, refundAmount: quote.refundAmount - left, keptAmount: quote.keepAmount }
}

// ---------------- Fulfilment (W6, W10, P14) ----------------

const STEPS: Record<string, { from: string[]; to: string; fulfilment?: string[] }> = {
  pick: { from: ['confirmed'], to: 'preparing' },
  pack: { from: ['preparing'], to: 'ready' },
  ship: { from: ['ready'], to: 'shipped', fulfilment: ['delivery'] },
  out_for_install: { from: ['ready'], to: 'out_for_install', fulfilment: ['install'] },
  handover: { from: ['ready'], to: 'delivered', fulfilment: ['pickup'] },
  deliver: { from: ['shipped', 'out_for_install'], to: 'delivered' },
  complete: { from: ['delivered'], to: 'completed', fulfilment: ['delivery', 'pickup', 'service'] },
  close: { from: ['completed'], to: 'closed' },
}

export async function fulfilOrder(uow: UnitOfWork, actor: Actor, input: { orderId: string; step: string; serialNumbers?: string[]; trackingNumber?: string; carrier?: string; expectedVersion?: number | null }) {
  requirePermission(actor, 'canManageOrders', 'canManageInventory')
  const step = STEPS[input.step]
  if (!step) throw new DomainError(Codes.INVALID_INPUT, 'Unknown fulfilment step.')
  const tx = uow.tx
  const order = await tx.order.findUnique({ where: { id: input.orderId }, include: { lines: { include: { product: true } } } })
  if (!order) throw new DomainError(Codes.NOT_FOUND, 'Order not found.')
  if (step.fulfilment && !step.fulfilment.includes(order.fulfilment)) throw new DomainError(Codes.GUARD_FAILED, `That step is not used for ${order.fulfilment} orders.`)
  const ref = { refType: 'Order', refId: order.id, userId: actorUserId(actor) }
  let data: Record<string, unknown> = {}
  if (input.step === 'pick') {
    let reservations = (Array.isArray(order.reservations) ? order.reservations : []) as Reservation[]
    // Paid while short: try to reserve now that stock may have come in.
    if (order.stockShort) reservations = await reserveLines(tx, order.lines.filter(l => l.productId && l.kind === 'product').map(l => ({ productId: l.productId!, quantity: l.quantity })), order.branchId, ref)
    for (const r of reservations) await pickReserved(tx, r.productId, r.locationId, r.quantity, ref)
    const serials = (input.serialNumbers ?? []).map(s => str(s, 80)).filter(Boolean)
    for (const line of order.lines.filter(l => l.product?.isSerialized)) {
      const mine = await tx.serializedUnit.findMany({ where: { orderId: order.id, productId: line.productId! } })
      const needed = line.quantity - mine.length
      const candidates = serials.length ? await tx.serializedUnit.findMany({ where: { serialNumber: { in: serials }, productId: line.productId!, status: 'in_stock' } }) : []
      if (candidates.length < needed) throw new DomainError(Codes.INVALID_INPUT, `Scan or type ${needed} serial number(s) in stock for ${line.name}.`)
      for (const u of candidates.slice(0, needed)) await tx.serializedUnit.update({ where: { id: u.id }, data: { status: 'reserved', orderId: order.id } })
    }
    for (const line of order.lines.filter(l => l.kind === 'product')) await tx.orderLine.update({ where: { id: line.id }, data: { fulfilledQuantity: line.quantity } })
    data = { pickedAt: uow.now, stockShort: false, reservations: [] }
  }
  if (input.step === 'ship') data = { trackingNumber: str(input.trackingNumber, 80), carrier: str(input.carrier, 80) }
  if (input.step === 'handover' || input.step === 'deliver') data = { deliveredAt: uow.now }
  if (input.step === 'complete') data = { completedAt: uow.now }
  const updated = await transition(uow, { model: 'Order', id: order.id, from: step.from, to: step.to, expectedVersion: input.expectedVersion, actor, action: `order.${step.to}`, data })
  if (step.to === 'delivered') await triggerMilestones(uow, order.id, 'on_delivery')
  if (step.to === 'completed') await tx.referral.updateMany({ where: { order: { id: order.id }, status: 'pending' }, data: { status: 'qualified', qualifiedAt: uow.now } })
  return updated
}

// ---------------- Order changes (P15) ----------------

export async function proposeOrderChange(uow: UnitOfWork, actor: Actor, input: { orderId: string; description: string; add?: { productId: string; quantity: number }[]; lines?: { description: string; amount: number }[] }) {
  requirePermission(actor, 'canManageOrders')
  const tx = uow.tx
  const order = await tx.order.findUnique({ where: { id: input.orderId } })
  if (!order) throw new DomainError(Codes.NOT_FOUND, 'Order not found.')
  if (['pending_payment', 'cancelled', 'completed', 'closed'].includes(order.status)) throw new DomainError(Codes.GUARD_FAILED, 'Changes are made to confirmed orders that are not finished.')
  const settings = await getSettings(tx)
  const lines: OrderLineInput[] = []
  for (const a of input.add ?? []) {
    const p = await tx.product.findUnique({ where: { id: a.productId } })
    if (!p) throw new DomainError(Codes.INVALID_INPUT, 'Product not found.')
    lines.push({ kind: 'product', productId: p.id, name: p.name, sku: p.sku, quantity: int(a.quantity, 'Quantity', { min: 1, max: 1000 }), unitAmount: p.priceAmount, taxable: p.taxable, warrantyMonths: p.warrantyMonths ?? 0, requiresInstallation: false, snapshot: { name: p.name, sku: p.sku, priceAmount: p.priceAmount, type: p.type } })
  }
  for (const l of input.lines ?? []) {
    const amount = Math.trunc(Number(l.amount))
    lines.push({ kind: amount < 0 ? 'discount' : 'fee', productId: null, name: str(l.description, 200) || 'Change', sku: '', quantity: 1, unitAmount: amount, taxable: amount > 0, warrantyMonths: 0, requiresInstallation: false, snapshot: {} })
  }
  if (!lines.length) throw new DomainError(Codes.INVALID_INPUT, 'Add what changes.')
  const positive = lines.filter(l => l.unitAmount >= 0)
  const negative = -lines.filter(l => l.unitAmount < 0).reduce((s, l) => s + l.unitAmount * l.quantity, 0)
  const pricedPos = positive.length ? priceLines(positive, settings) : { lines: [], totalAmount: 0, taxAmount: 0 }
  const difference = pricedPos.totalAmount - negative
  const row = await tx.orderChange.create({ data: { status: 'proposed', description: str(input.description, 1000) || 'Order change', differenceAmount: difference, linesJson: [...pricedPos.lines, ...lines.filter(l => l.unitAmount < 0).map(l => ({ ...l, totalAmount: l.unitAmount * l.quantity, taxAmount: 0 }))] as never, orderId: order.id, createdById: actorUserId(actor) } })
  auditChange(uow, actor, 'OrderChange', row.id, 'orderChange.proposed', { difference }, { toStatus: 'proposed' })
  return row
}

/** The customer agreed (by phone or on paper). The order is updated now; a positive difference gets a pay link. */
export async function decideOrderChange(uow: UnitOfWork, actor: Actor, input: { changeId: string; approve: boolean; reason?: string; expectedVersion?: number | null }) {
  requirePermission(actor, 'canManageOrders')
  const tx = uow.tx
  const change = await tx.orderChange.findUnique({ where: { id: input.changeId } })
  if (!change?.orderId) throw new DomainError(Codes.NOT_FOUND, 'Change not found.')
  if (!input.approve) return transition(uow, { model: 'OrderChange', id: change.id, from: ['proposed'], to: 'rejected', expectedVersion: input.expectedVersion, actor, action: 'orderChange.rejected', reason: str(input.reason, 500) })
  const order = await lockRow<any>(tx, 'Order', change.orderId)
  const lines = (change.linesJson ?? []) as (OrderLineInput & { taxAmount: number; totalAmount: number })[]
  const diff = change.differenceAmount ?? 0
  if (order.totalAmount + diff < order.paidAmount - order.refundedAmount) throw new DomainError(Codes.GUARD_FAILED, 'This change takes the order below what is already paid; refund first.')
  for (const l of lines) await tx.orderLine.create({ data: { kind: l.kind, name: l.name, sku: l.sku, quantity: l.quantity, unitAmount: l.unitAmount, taxAmount: l.taxAmount, totalAmount: l.totalAmount, warrantyMonths: l.warrantyMonths, snapshot: l.snapshot as never, productId: l.productId, orderId: order.id } })
  const added = lines.filter(l => l.productId && l.kind === 'product').map(l => ({ productId: l.productId!, quantity: l.quantity }))
  const newRes = added.length && !order.pickedAt ? await reserveLines(tx, added, order.branchId, { refType: 'OrderChange', refId: change.id, userId: actorUserId(actor) }) : []
  const subtotalDelta = lines.filter(l => l.totalAmount > 0).reduce((s, l) => s + l.totalAmount, 0)
  const discountDelta = -lines.filter(l => l.totalAmount < 0).reduce((s, l) => s + l.totalAmount, 0)
  const taxDelta = lines.reduce((s, l) => s + (l.taxAmount ?? 0), 0)
  await tx.order.update({ where: { id: order.id }, data: { totalAmount: { increment: diff }, subtotalAmount: { increment: subtotalDelta }, discountAmount: { increment: discountDelta }, taxAmount: { increment: taxDelta }, reservations: [...((order.reservations ?? []) as Reservation[]), ...newRes] as never } })
  // Plan re-scheduled: the difference lands on the last unpaid instalment, or as a new one due now.
  if (order.planId && diff !== 0) {
    const last = await tx.installment.findFirst({ where: { planId: order.planId, status: { in: ['scheduled', 'due', 'partially_paid', 'overdue'] } }, orderBy: { sequence: 'desc' } })
    if (last && last.amount + diff >= last.paidAmount && last.amount + diff > 0) await tx.installment.update({ where: { id: last.id }, data: { amount: last.amount + diff, version: { increment: 1 } } })
    else if (diff > 0) {
      const top = await tx.installment.aggregate({ where: { planId: order.planId }, _max: { sequence: true } })
      await tx.installment.create({ data: { planId: order.planId, sequence: (top._max.sequence ?? 0) + 1, label: 'Order change', amount: diff, dueDate: uow.now, trigger: 'date', status: 'due' } })
    } else throw new DomainError(Codes.GUARD_FAILED, 'The plan has no unpaid instalment large enough to take this reduction.')
    await tx.paymentPlan.update({ where: { id: order.planId }, data: { totalAmount: { increment: diff }, version: { increment: 1 } } })
  }
  const approved = await transition<any>(uow, { model: 'OrderChange', id: change.id, from: ['proposed'], to: diff > 0 ? 'approved' : 'applied', expectedVersion: input.expectedVersion, actor, action: diff > 0 ? 'orderChange.approved' : 'orderChange.applied' })
  let sessionCode: string | null = null
  if (diff > 0) {
    const s = await openSession(uow, { code: 'bank_transfer', amount: diff, currencyCode: order.currencyCode, purpose: 'order_change', description: `${order.number} change`, target: { orderId: order.id, orderChangeId: change.id, customerId: order.customerId } })
    await tx.paymentSession.update({ where: { id: s.id }, data: { providerId: null } })
    sessionCode = s.publicCode
  }
  return { ...approved, sessionCode }
}

// ---------------- Returns (W10.4, P17) ----------------

export async function returnOrderLines(uow: UnitOfWork, actor: Actor, input: { orderId: string; lines: { orderLineId: string; quantity: number }[]; locationId: string; reason: string; payoutReference?: string; idempotencyKey: string }) {
  requirePermission(actor, 'canIssueRefunds')
  const tx = uow.tx
  const settings = await getSettings(tx)
  const order = await lockRow<any>(tx, 'Order', input.orderId)
  if (!['delivered', 'completed', 'closed'].includes(order.status)) throw new DomainError(Codes.GUARD_FAILED, 'Only delivered items are returned.')
  if (order.deliveredAt && uow.now.getTime() > addDays(new Date(order.deliveredAt), settings.returnWindowDays).getTime()) throw new DomainError(Codes.EXPIRED, `The ${settings.returnWindowDays}-day return window has passed.`)
  const location = await tx.stockLocation.findUnique({ where: { id: input.locationId } })
  if (!location) throw new DomainError(Codes.INVALID_INPUT, 'Pick where the items go back.')
  let amount = 0
  for (const r of input.lines) {
    const line = await tx.orderLine.findFirst({ where: { id: r.orderLineId, orderId: order.id } })
    if (!line?.productId) throw new DomainError(Codes.INVALID_INPUT, 'Pick product lines from this order.')
    const qty = int(r.quantity, 'Quantity', { min: 1, max: line.quantity })
    if (line.returnedQuantity + qty > line.quantity) throw new DomainError(Codes.INVALID_INPUT, `Only ${line.quantity - line.returnedQuantity} of ${line.name} can come back.`)
    await tx.orderLine.update({ where: { id: line.id }, data: { returnedQuantity: { increment: qty } } })
    for (const unit of await stockUnits(tx, line.productId, qty)) await returnToStock(tx, unit.productId, location.id, unit.quantity, { refType: 'Order', refId: order.id, userId: actorUserId(actor), reason: `Return: ${input.reason}` })
    const lineGross = line.totalAmount + (settings.taxInclusive ? 0 : line.taxAmount)
    amount += Math.floor((lineGross * qty) / line.quantity)
  }
  // Order-level discounts are shared across lines in proportion.
  if (order.discountAmount > 0 && order.subtotalAmount > 0) amount -= Math.floor((amount * order.discountAmount) / order.subtotalAmount)
  amount = Math.min(amount, order.paidAmount - order.refundedAmount)
  let left = amount
  const payments = await tx.payment.findMany({ where: { orderId: order.id, status: { in: ['verified', 'captured', 'partially_refunded'] } }, orderBy: { createdAt: 'desc' } })
  for (const p of payments) {
    if (left <= 0) break
    const take = Math.min(left, p.amount - p.refundedAmount)
    if (take <= 0) continue
    await refund(uow, actor, { paymentId: p.id, amount: take, reason: `Return: ${str(input.reason, 300)}`, payoutReference: input.payoutReference, idempotencyKey: `${input.idempotencyKey}:${p.id}` })
    left -= take
  }
  auditChange(uow, actor, 'Order', order.id, 'order.returned', { lines: input.lines, refundAmount: amount - left })
  return { orderId: order.id, refundAmount: amount - left }
}

// ---------------- Invoices (P18) ----------------

export async function issueInvoice(uow: UnitOfWork, actor: Actor, input: { orderId: string; installmentId?: string | null; dueDays?: number }) {
  requirePermission(actor, 'canManageOrders', 'canManagePayments')
  const tx = uow.tx
  const order = await tx.order.findUnique({ where: { id: input.orderId }, include: { lines: true } })
  if (!order || order.status === 'cancelled') throw new DomainError(Codes.NOT_FOUND, 'Order not found.')
  let total = order.totalAmount
  let linesJson: unknown = order.lines.map(l => ({ name: l.name, quantity: l.quantity, unitAmount: l.unitAmount, taxAmount: l.taxAmount, totalAmount: l.totalAmount }))
  if (input.installmentId) {
    const inst = await tx.installment.findUnique({ where: { id: input.installmentId }, include: { invoice: true } })
    if (!inst || inst.planId !== order.planId) throw new DomainError(Codes.INVALID_INPUT, 'That instalment is not on this order’s plan.')
    if (inst.invoice && inst.invoice.status !== 'void') throw new DomainError(Codes.GUARD_FAILED, `Invoice ${inst.invoice.number} already covers this instalment.`)
    total = inst.amount
    linesJson = [{ name: `${inst.label} for order ${order.number}`, quantity: 1, unitAmount: inst.amount, taxAmount: 0, totalAmount: inst.amount }]
  }
  const invoice = await tx.invoice.create({ data: { number: await nextNumber(tx, 'INV'), status: 'issued', issuedAt: uow.now, dueAt: addDays(uow.now, input.dueDays ?? 14), totalAmount: total, currencyCode: order.currencyCode, linesJson: linesJson as never, orderId: order.id, customerId: order.customerId } })
  if (input.installmentId) await tx.installment.update({ where: { id: input.installmentId }, data: { invoiceId: invoice.id } })
  auditChange(uow, actor, 'Invoice', invoice.id, 'invoice.issued', { orderId: order.id, total }, { toStatus: 'issued' })
  return invoice
}

export async function voidInvoice(uow: UnitOfWork, actor: Actor, input: { invoiceId: string; reason: string; expectedVersion?: number | null }) {
  requirePermission(actor, 'canManagePayments')
  return transition(uow, { model: 'Invoice', id: input.invoiceId, from: ['issued'], to: 'void', expectedVersion: input.expectedVersion, actor, action: 'invoice.void', reason: str(input.reason, 300) })
}

/** An order page reads invoice status from money received (an invoice is paid when what it covers is). */
export async function syncInvoices(tx: Tx, orderId: string) {
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { invoices: { include: { installment: true } } } })
  if (!order) return
  for (const inv of order.invoices.filter(i => i.status === 'issued')) {
    const paid = inv.installment ? inv.installment.status === 'paid' : order.paidAmount - order.refundedAmount >= order.totalAmount
    if (paid) await tx.invoice.update({ where: { id: inv.id }, data: { status: 'paid', version: { increment: 1 } } })
  }
}

export { systemActor, pickUnreserved }
