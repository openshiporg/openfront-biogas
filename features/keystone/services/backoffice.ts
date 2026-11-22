import type { UnitOfWork } from '../lib/unitOfWork'
import { DomainError, Codes } from '../lib/errors'
import { auditChange, lockRow, transition } from '../lib/cas'
import { actorUserId, requirePermission, type Actor } from '../lib/actor'
import { nextNumber } from '../lib/sequence'
import { getSettings } from './settings'
import { adjust, receive, transfer } from './stock'
import { allocateToPlan, openSession } from './money'
import { proRataRefund, activateSubscription, assertSellable } from './subscriptions'
import { refund } from './payments'
import { int, oneOf, str } from './util'
import { installmentEffectiveStatus } from '../lib/time'

// ---------------- Purchasing and stock (W14, P53–P55) ----------------

export async function savePurchaseOrder(uow: UnitOfWork, actor: Actor, input: { purchaseOrderId?: string | null; supplierId: string; locationId: string; expectedAt?: string | null; notes?: string; lines: { productId: string; quantity: number; unitCostAmount: number }[] }) {
  requirePermission(actor, 'canManageInventory')
  const tx = uow.tx
  const settings = await getSettings(tx)
  if (!input.lines?.length) throw new DomainError(Codes.INVALID_INPUT, 'Add at least one line.')
  const lines = input.lines.map(l => ({ productId: str(l.productId, 60), quantity: int(l.quantity, 'Quantity', { min: 1, max: 1_000_000 }), unitCostAmount: int(l.unitCostAmount, 'Unit cost', { min: 0 }) }))
  const total = lines.reduce((s, l) => s + l.quantity * l.unitCostAmount, 0)
  const data = { supplierId: input.supplierId, locationId: input.locationId, expectedAt: input.expectedAt ? new Date(input.expectedAt) : null, notes: str(input.notes, 2000), totalAmount: total, currencyCode: settings.currencyCode }
  if (input.purchaseOrderId) {
    const po = await lockRow<any>(tx, 'PurchaseOrder', input.purchaseOrderId)
    if (po.status !== 'draft') throw new DomainError(Codes.INVALID_TRANSITION, 'Only a draft order is edited.', { currentStatus: po.status })
    await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: po.id } })
    await tx.purchaseOrder.update({ where: { id: po.id }, data: { ...data, version: { increment: 1 }, lines: { create: lines } } })
    auditChange(uow, actor, 'PurchaseOrder', po.id, 'po.edited', { total })
    return tx.purchaseOrder.findUnique({ where: { id: po.id } })
  }
  const po = await tx.purchaseOrder.create({ data: { number: await nextNumber(tx, 'PO'), status: 'draft', ...data, lines: { create: lines } } })
  auditChange(uow, actor, 'PurchaseOrder', po.id, 'po.created', { total }, { toStatus: 'draft' })
  return po
}

export async function transitionPurchaseOrder(uow: UnitOfWork, actor: Actor, input: { purchaseOrderId: string; action: 'send' | 'close' | 'cancel'; reason?: string; expectedVersion?: number | null }) {
  requirePermission(actor, 'canManageInventory')
  const map = { send: { from: ['draft'], to: 'sent' }, close: { from: ['partially_received', 'received'], to: 'closed' }, cancel: { from: ['draft', 'sent'], to: 'cancelled' } } as const
  const m = map[input.action]
  if (!m) throw new DomainError(Codes.INVALID_INPUT, 'Unknown move.')
  return transition(uow, { model: 'PurchaseOrder', id: input.purchaseOrderId, from: m.from, to: m.to, expectedVersion: input.expectedVersion, actor, action: `po.${m.to}`, reason: str(input.reason, 500) })
}

/** Receive against the order: stock in, serials created for serialised products. */
export async function receivePurchaseOrder(uow: UnitOfWork, actor: Actor, input: { purchaseOrderId: string; lines: { lineId: string; quantity: number; serialNumbers?: string[] }[]; locationId?: string | null; expectedVersion?: number | null }) {
  requirePermission(actor, 'canManageInventory')
  const tx = uow.tx
  const po = await lockRow<any>(tx, 'PurchaseOrder', input.purchaseOrderId)
  if (!['sent', 'partially_received'].includes(po.status)) throw new DomainError(Codes.INVALID_TRANSITION, 'Send the order before receiving it.', { currentStatus: po.status })
  if (input.expectedVersion !== undefined && input.expectedVersion !== null && input.expectedVersion !== po.version) throw new DomainError(Codes.STALE_STATE, 'This was changed by someone else. Reload and try again.', { currentVersion: po.version })
  const locationId = input.locationId ?? po.locationId
  if (!locationId) throw new DomainError(Codes.INVALID_INPUT, 'Pick where the stock goes.')
  let received = 0
  for (const r of input.lines ?? []) {
    const qty = int(r.quantity, 'Quantity', { min: 0, max: 1_000_000 })
    if (!qty) continue
    const line = await tx.purchaseOrderLine.findFirst({ where: { id: r.lineId, purchaseOrderId: po.id }, include: { product: true } })
    if (!line?.productId) throw new DomainError(Codes.INVALID_INPUT, 'Line not on this order.')
    const left = line.quantity - (line.receivedQuantity ?? 0)
    if (qty > left) throw new DomainError(Codes.INVALID_INPUT, `Only ${left} of ${line.product?.name} are still expected.`)
    await receive(tx, line.productId, locationId, qty, { refType: 'PurchaseOrder', refId: po.id, userId: actorUserId(actor), unitCostAmount: line.unitCostAmount })
    await tx.purchaseOrderLine.update({ where: { id: line.id }, data: { receivedQuantity: { increment: qty } } })
    if (line.product?.isSerialized) {
      const serials = (r.serialNumbers ?? []).map(s => str(s, 80)).filter(Boolean)
      if (serials.length !== qty) throw new DomainError(Codes.INVALID_INPUT, `Enter ${qty} serial number(s) for ${line.product.name}.`)
      for (const serialNumber of serials) await tx.serializedUnit.create({ data: { serialNumber, status: 'in_stock', productId: line.productId, locationId } })
    }
    if (line.unitCostAmount > 0) await tx.product.update({ where: { id: line.productId }, data: { unitCostAmount: line.unitCostAmount } })
    received += qty
  }
  if (!received) throw new DomainError(Codes.INVALID_INPUT, 'Enter what arrived.')
  const lines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: po.id } })
  const complete = lines.every(l => (l.receivedQuantity ?? 0) >= l.quantity)
  return transition(uow, { model: 'PurchaseOrder', id: po.id, from: ['sent', 'partially_received'], to: complete ? 'received' : 'partially_received', actor, action: complete ? 'po.received' : 'po.partially_received', data: {} })
}

/** Count or adjust (P53). A count gives the number on the shelf; the difference is the movement. */
export async function adjustStock(uow: UnitOfWork, actor: Actor, input: { productId: string; locationId: string; delta?: number; countedQuantity?: number; reason: string }) {
  requirePermission(actor, 'canManageInventory')
  const tx = uow.tx
  const reason = str(input.reason, 300)
  if (!reason) throw new DomainError(Codes.INVALID_INPUT, 'Give a reason.')
  let delta = input.delta !== undefined && input.delta !== null ? Math.trunc(Number(input.delta)) : NaN
  if (input.countedQuantity !== undefined && input.countedQuantity !== null) {
    const counted = int(input.countedQuantity, 'Counted', { min: 0 })
    const { lockLevel } = await import('./stock')
    const level = await lockLevel(tx, input.productId, input.locationId)
    delta = counted - level.onHand
    if (delta === 0) return { delta: 0 }
  }
  if (!Number.isSafeInteger(delta) || delta === 0) throw new DomainError(Codes.INVALID_INPUT, 'Enter the change or the counted number.')
  const result = await adjust(tx, input.productId, input.locationId, delta, { refType: 'Adjustment', refId: input.locationId, userId: actorUserId(actor), reason })
  auditChange(uow, actor, 'StockLevel', `${input.productId}:${input.locationId}`, 'stock.adjusted', { delta, ...result }, { reason })
  return { delta, ...result }
}

export async function transferStock(uow: UnitOfWork, actor: Actor, input: { productId: string; fromLocationId: string; toLocationId: string; quantity: number; reason?: string }) {
  requirePermission(actor, 'canManageInventory')
  const qty = int(input.quantity, 'Quantity', { min: 1, max: 1_000_000 })
  await transfer(uow.tx, input.productId, input.fromLocationId, input.toLocationId, qty, { refType: 'Transfer', refId: `${input.fromLocationId}>${input.toLocationId}`, userId: actorUserId(actor), reason: str(input.reason, 300) })
  await uow.tx.serializedUnit.updateMany({ where: { productId: input.productId, locationId: input.fromLocationId, status: 'in_stock' }, data: {} })
  auditChange(uow, actor, 'StockLevel', input.productId, 'stock.transferred', { from: input.fromLocationId, to: input.toLocationId, quantity: qty })
  return { quantity: qty }
}

export async function moveSerial(uow: UnitOfWork, actor: Actor, input: { serialNumber: string; locationId?: string | null; status?: string; reason?: string }) {
  requirePermission(actor, 'canManageInventory')
  const unit = await uow.tx.serializedUnit.findUnique({ where: { serialNumber: str(input.serialNumber, 80) } })
  if (!unit) throw new DomainError(Codes.NOT_FOUND, 'Serial not found.')
  const status = input.status ? oneOf(input.status, ['in_stock', 'returned', 'scrapped'] as const, 'Status') : unit.status
  if (unit.status === 'installed') throw new DomainError(Codes.GUARD_FAILED, 'An installed unit moves with its system.')
  await uow.tx.serializedUnit.update({ where: { id: unit.id }, data: { status, locationId: input.locationId ?? unit.locationId } })
  auditChange(uow, actor, 'SerializedUnit', unit.id, 'serial.moved', { status, locationId: input.locationId }, { reason: input.reason })
  return uow.tx.serializedUnit.findUnique({ where: { id: unit.id } })
}

// ---------------- Incentives (4.12, P49) ----------------

const INCENTIVE: Record<string, { from: string[]; to: string }> = {
  submit: { from: ['draft'], to: 'submitted' },
  approve: { from: ['submitted'], to: 'approved' },
  reject: { from: ['submitted'], to: 'rejected' },
  mark_paid: { from: ['approved'], to: 'paid' },
  withdraw: { from: ['draft', 'submitted'], to: 'withdrawn' },
}

export async function transitionIncentiveApplication(uow: UnitOfWork, actor: Actor, input: { applicationId: string; action: string; reference?: string; reason?: string; rejectionHandling?: 'absorb' | 'final_instalment'; expectedVersion?: number | null }) {
  requirePermission(actor, 'canManageIncentives')
  const tx = uow.tx
  const m = INCENTIVE[input.action]
  if (!m) throw new DomainError(Codes.INVALID_INPUT, 'Unknown move.')
  const app = await tx.incentiveApplication.findUnique({ where: { id: input.applicationId }, include: { program: true, media: true } })
  if (!app) throw new DomainError(Codes.NOT_FOUND, 'Application not found.')
  const reason = str(input.reason, 1000)
  const data: Record<string, unknown> = {}
  if (input.action === 'submit') {
    const required = (Array.isArray(app.program?.requiredDocuments) ? app.program!.requiredDocuments : []) as string[]
    if (required.length > app.media.length) throw new DomainError(Codes.GUARD_FAILED, `Attach the required documents: ${required.join(', ')}.`)
    Object.assign(data, { submittedAt: uow.now, reference: str(input.reference, 120) || app.reference })
  }
  if (['approve', 'reject'].includes(input.action)) data.decidedAt = uow.now
  if (input.action === 'mark_paid') data.paidAt = uow.now
  if (input.action === 'reject') {
    if (!reason) throw new DomainError(Codes.INVALID_INPUT, 'Give the reason the programme gave.')
    const settings = await getSettings(tx)
    const handling = input.rejectionHandling ?? (settings.incentiveRejectionPolicy === 'final_instalment' ? 'final_instalment' : 'absorb')
    data.rejectionHandling = handling
    // Taken off the price up front and the contract allows it: add it back as a final instalment.
    if (handling === 'final_instalment' && app.treatment === 'off_price_now' && app.orderId && app.amount > 0) {
      const order = await lockRow<any>(tx, 'Order', app.orderId)
      if (!order.planId) throw new DomainError(Codes.GUARD_FAILED, 'This order has no plan to add an instalment to. Absorb it instead.')
      const top = await tx.installment.aggregate({ where: { planId: order.planId }, _max: { sequence: true } })
      await tx.installment.create({ data: { planId: order.planId, sequence: (top._max.sequence ?? 0) + 1, label: `${app.program?.name ?? 'Incentive'} not paid`, amount: app.amount, dueDate: uow.now, trigger: 'date', status: 'due' } })
      await tx.paymentPlan.update({ where: { id: order.planId }, data: { totalAmount: { increment: app.amount }, status: 'active', version: { increment: 1 } } })
      await tx.order.update({ where: { id: order.id }, data: { totalAmount: { increment: app.amount }, discountAmount: { decrement: Math.min(order.discountAmount, app.amount) } } })
    }
  }
  if (input.action === 'mark_paid' && app.treatment === 'paid_to_customer_later') data.notes = `${app.notes ? `${app.notes}\n` : ''}Paid to the customer by the programme`
  return transition(uow, { model: 'IncentiveApplication', id: app.id, from: m.from, to: m.to, expectedVersion: input.expectedVersion, actor, action: `incentive.${m.to}`, reason, data })
}

export async function openIncentiveApplication(uow: UnitOfWork, actor: Actor, input: { programId: string; orderId?: string | null; customerId: string; amount?: number; notes?: string }) {
  requirePermission(actor, 'canManageIncentives')
  const tx = uow.tx
  const program = await tx.incentiveProgram.findUnique({ where: { id: input.programId } })
  if (!program?.isActive) throw new DomainError(Codes.INVALID_INPUT, 'Pick an active programme.')
  const settings = await getSettings(tx)
  const app = await tx.incentiveApplication.create({ data: { status: 'draft', programId: program.id, orderId: input.orderId ?? null, customerId: input.customerId, amount: Math.max(0, Math.trunc(Number(input.amount ?? 0))), currencyCode: settings.currencyCode, treatment: program.treatment, notes: str(input.notes, 2000) } })
  auditChange(uow, actor, 'IncentiveApplication', app.id, 'incentive.opened', {}, { toStatus: 'draft' })
  return app
}

// ---------------- Commissions (4.15, P51) ----------------

export async function approveCommission(uow: UnitOfWork, actor: Actor, input: { commissionId: string; action?: 'approve' | 'mark_paid' | 'claw_back'; reason?: string; expectedVersion?: number | null }) {
  requirePermission(actor, 'canManageCommissions')
  const action = input.action ?? 'approve'
  const m = { approve: { from: ['accrued'], to: 'approved', data: { approvedAt: new Date() } }, mark_paid: { from: ['approved'], to: 'paid', data: { paidAt: new Date() } }, claw_back: { from: ['accrued', 'approved', 'paid'], to: 'clawed_back', data: { clawedBackAt: new Date() } } }[action]
  if (!m) throw new DomainError(Codes.INVALID_INPUT, 'Unknown move.')
  if (action === 'claw_back' && !str(input.reason, 500)) throw new DomainError(Codes.INVALID_INPUT, 'Give a reason.')
  return transition(uow, { model: 'Commission', id: input.commissionId, from: m.from, to: m.to, expectedVersion: input.expectedVersion, actor, action: `commission.${m.to}`, reason: str(input.reason, 500), data: m.data })
}

// ---------------- Referrals (W13, P50) ----------------

export async function grantReferralReward(uow: UnitOfWork, actor: Actor, input: { referralId: string; action?: 'approve' | 'grant' | 'void'; rewardKind?: 'store_credit' | 'free_instalment'; reason?: string; expectedVersion?: number | null }) {
  requirePermission(actor, 'canManageCommissions', 'canManagePayments')
  const tx = uow.tx
  const action = input.action ?? 'grant'
  const r = await tx.referral.findUnique({ where: { id: input.referralId } })
  if (!r) throw new DomainError(Codes.NOT_FOUND, 'Referral not found.')
  if (action === 'void') {
    const reason = str(input.reason, 500)
    if (!reason) throw new DomainError(Codes.INVALID_INPUT, 'Give a reason.')
    return transition(uow, { model: 'Referral', id: r.id, from: ['pending', 'qualified', 'approved'], to: 'void', expectedVersion: input.expectedVersion, actor, action: 'referral.void', reason, data: { voidReason: reason } })
  }
  if (action === 'approve') return transition(uow, { model: 'Referral', id: r.id, from: ['qualified'], to: 'approved', expectedVersion: input.expectedVersion, actor, action: 'referral.approved' })
  if (!r.referrerId) throw new DomainError(Codes.GUARD_FAILED, 'This referral has no referrer.')
  const settings = await getSettings(tx)
  const kind = input.rewardKind ?? 'store_credit'
  let amount = r.rewardAmount || settings.referralRewardAmount
  if (kind === 'free_instalment') {
    // One instalment's worth: the referrer's next unpaid instalment is paid from the reward.
    const inst = await tx.installment.findFirst({ where: { plan: { customerId: r.referrerId, status: { in: ['active', 'in_arrears', 'defaulted'] } }, status: { notIn: ['paid', 'waived', 'cancelled'] } }, orderBy: [{ dueDate: 'asc' }, { sequence: 'asc' }], include: { plan: { include: { order: true } } } })
    if (!inst?.plan?.order) throw new DomainError(Codes.GUARD_FAILED, 'The referrer has no instalment due. Give store credit instead.')
    amount = inst.amount - inst.paidAmount
    await tx.order.update({ where: { id: inst.plan.order.id }, data: { discountAmount: { increment: amount }, totalAmount: { decrement: amount } } })
    await tx.installment.update({ where: { id: inst.id }, data: { status: 'waived', waivedReason: 'Referral reward', version: { increment: 1 } } })
    await tx.paymentPlan.update({ where: { id: inst.plan.id }, data: { totalAmount: { decrement: amount }, version: { increment: 1 } } })
  } else {
    if (amount <= 0) throw new DomainError(Codes.GUARD_FAILED, 'Set the referral reward amount in settings first.')
    await tx.customer.update({ where: { id: r.referrerId }, data: { storeCreditAmount: { increment: amount } } })
  }
  return transition(uow, { model: 'Referral', id: r.id, from: ['approved', 'qualified'], to: 'rewarded', expectedVersion: input.expectedVersion, actor, action: 'referral.rewarded', data: { rewardedAt: uow.now, rewardAmount: amount, rewardKind: kind } })
}

// ---------------- Plans (W11, P47–P48) ----------------

export async function waiveInstallment(uow: UnitOfWork, actor: Actor, input: { installmentId: string; reason: string; expectedVersion?: number | null }) {
  requirePermission(actor, 'canManagePlans')
  const tx = uow.tx
  const reason = str(input.reason, 500)
  if (!reason) throw new DomainError(Codes.INVALID_INPUT, 'Give a reason.')
  const inst = await tx.installment.findUnique({ where: { id: input.installmentId }, include: { plan: { include: { order: true } } } })
  if (!inst?.plan) throw new DomainError(Codes.NOT_FOUND, 'Instalment not found.')
  await lockRow(tx, 'PaymentPlan', inst.plan.id)
  const waived = inst.amount - inst.paidAmount
  const out = await transition(uow, { model: 'Installment', id: inst.id, from: ['scheduled', 'due', 'partially_paid', 'overdue'], to: 'waived', expectedVersion: input.expectedVersion, actor, action: 'installment.waived', reason, data: { waivedReason: reason } })
  await tx.paymentPlan.update({ where: { id: inst.plan.id }, data: { totalAmount: { decrement: waived }, version: { increment: 1 } } })
  if (inst.plan.order) await tx.order.update({ where: { id: inst.plan.order.id }, data: { totalAmount: { decrement: waived }, discountAmount: { increment: waived } } })
  await settlePlanIfDone(uow, inst.plan.id)
  return out
}

async function settlePlanIfDone(uow: UnitOfWork, planId: string) {
  const open = await uow.tx.installment.count({ where: { planId, status: { notIn: ['paid', 'waived', 'cancelled'] } } })
  const plan = await uow.tx.paymentPlan.findUnique({ where: { id: planId } })
  if (!open && plan && ['pending', 'active', 'in_arrears', 'defaulted'].includes(plan.status)) await transition(uow, { model: 'PaymentPlan', id: planId, from: [plan.status], to: 'completed', actor: { kind: 'system', name: 'plans' }, action: 'plan.completed' })
}

/** Move unpaid instalments' due dates by a number of days or months (P48 reschedule). */
export async function reschedulePlan(uow: UnitOfWork, actor: Actor, input: { planId: string; shiftDays?: number; shiftMonths?: number; reason: string; expectedVersion?: number | null }) {
  requirePermission(actor, 'canManagePlans')
  const tx = uow.tx
  const reason = str(input.reason, 500)
  if (!reason) throw new DomainError(Codes.INVALID_INPUT, 'Give a reason.')
  const plan = await lockRow<any>(tx, 'PaymentPlan', input.planId)
  if (input.expectedVersion !== undefined && input.expectedVersion !== null && input.expectedVersion !== plan.version) throw new DomainError(Codes.STALE_STATE, 'This was changed by someone else. Reload and try again.', { currentVersion: plan.version })
  if (!['active', 'in_arrears', 'defaulted', 'pending'].includes(plan.status)) throw new DomainError(Codes.INVALID_TRANSITION, 'This plan is closed.', { currentStatus: plan.status })
  const days = Math.trunc(Number(input.shiftDays ?? 0))
  const months = Math.trunc(Number(input.shiftMonths ?? 0))
  if ((!days && !months) || Math.abs(days) > 365 || Math.abs(months) > 24) throw new DomainError(Codes.INVALID_INPUT, 'Shift by up to 365 days or 24 months.')
  const { addMonths, addDays } = await import('../lib/time')
  const rows = await tx.installment.findMany({ where: { planId: plan.id, status: { in: ['scheduled', 'due', 'partially_paid', 'overdue'] }, dueDate: { not: null } } })
  for (const r of rows) {
    const next = months ? addMonths(r.dueDate!, months) : addDays(r.dueDate!, days)
    await tx.installment.update({ where: { id: r.id }, data: { dueDate: next, status: r.status === 'overdue' || r.status === 'due' ? (next.getTime() > uow.now.getTime() ? 'scheduled' : 'due') : r.status, version: { increment: 1 } } })
  }
  const settings = await getSettings(tx)
  const fresh = await tx.installment.findMany({ where: { planId: plan.id, status: { notIn: ['paid', 'waived', 'cancelled'] } }, orderBy: { sequence: 'asc' } })
  const late = fresh.some(r => installmentEffectiveStatus(r, uow.now, settings.instalmentGraceDays) === 'overdue')
  await tx.paymentPlan.update({ where: { id: plan.id }, data: { version: { increment: 1 }, status: plan.status === 'pending' ? 'pending' : late ? plan.status : 'active', nextDueAt: fresh.find(r => r.dueDate)?.dueDate ?? null } })
  auditChange(uow, actor, 'PaymentPlan', plan.id, 'plan.rescheduled', { days, months, instalments: rows.length }, { reason })
  return tx.paymentPlan.findUnique({ where: { id: plan.id } })
}

/** Pay link for one, several or all open instalments (S22, P47, P48 payoff). With payoff the remaining plan fee is waived. */
export async function installmentSession(uow: UnitOfWork, actor: Actor, input: { planId: string; installmentIds?: string[]; payoff?: boolean; customerId?: string | null }) {
  const tx = uow.tx
  const settings = await getSettings(tx)
  const plan = await lockRow<any>(tx, 'PaymentPlan', input.planId)
  if (input.customerId && plan.customerId !== input.customerId) throw new DomainError(Codes.NOT_FOUND, 'Plan not found.')
  const order = await tx.order.findFirst({ where: { planId: plan.id } })
  if (!order) throw new DomainError(Codes.NOT_FOUND, 'Plan has no order.')
  const open = await tx.installment.findMany({ where: { planId: plan.id, status: { notIn: ['paid', 'waived', 'cancelled'] } }, orderBy: { sequence: 'asc' } })
  if (!open.length) throw new DomainError(Codes.GUARD_FAILED, 'Nothing is due on this plan.')
  let rows = input.payoff ? open : input.installmentIds?.length ? open.filter(r => input.installmentIds!.includes(r.id)) : [open[0]]
  if (!rows.length) throw new DomainError(Codes.INVALID_INPUT, 'Pick instalments on this plan.')
  // Oldest unpaid first: the chosen set must start with the oldest open one (allocation pays it first anyway).
  rows = open.slice(0, Math.max(...rows.map(r => open.indexOf(r))) + 1)
  let amount = rows.reduce((s, r) => s + r.amount - r.paidAmount, 0)
  if (input.payoff && settings.waivePlanFeeOnPayoff && plan.planFeeAmount > 0) {
    // Fee not yet earned: share of the plan fee carried by instalments not yet due.
    const future = open.filter(r => r.dueDate && r.dueDate.getTime() > uow.now.getTime())
    const instalmentCount = await tx.installment.count({ where: { planId: plan.id, sequence: { gt: 0 } } })
    const feeBack = instalmentCount ? Math.floor((plan.planFeeAmount * future.length) / instalmentCount) : 0
    if (feeBack > 0) {
      const last = future[future.length - 1]
      await tx.installment.update({ where: { id: last.id }, data: { amount: last.amount - Math.min(feeBack, last.amount - last.paidAmount), version: { increment: 1 } } })
      await tx.paymentPlan.update({ where: { id: plan.id }, data: { totalAmount: { decrement: Math.min(feeBack, last.amount - last.paidAmount) }, version: { increment: 1 } } })
      await tx.order.update({ where: { id: order.id }, data: { totalAmount: { decrement: Math.min(feeBack, last.amount - last.paidAmount) } } })
      amount -= Math.min(feeBack, last.amount - last.paidAmount)
      auditChange(uow, actor, 'PaymentPlan', plan.id, 'plan.payoff_fee_waived', { amount: feeBack })
    }
  }
  const s = await openSession(uow, { code: 'bank_transfer', amount, currencyCode: plan.currencyCode, purpose: input.payoff ? 'payoff' : 'instalment', description: input.payoff ? `${order.number} payoff` : `${order.number} ${rows.map(r => r.label).join(', ')}`.slice(0, 280), target: { orderId: order.id, installmentIds: rows.map(r => r.id), customerId: plan.customerId } })
  await tx.paymentSession.update({ where: { id: s.id }, data: { providerId: null } })
  return { sessionCode: s.publicCode, amount, currencyCode: plan.currencyCode }
}

/** Pay a balance or part of it from store credit (staff, with the customer's say-so). */
export async function applyStoreCredit(uow: UnitOfWork, actor: Actor, input: { orderId: string; amount: number }) {
  requirePermission(actor, 'canManagePayments')
  const tx = uow.tx
  const order = await lockRow<any>(tx, 'Order', input.orderId)
  if (!order.customerId) throw new DomainError(Codes.GUARD_FAILED, 'No customer.')
  const customer = await lockRow<any>(tx, 'Customer', order.customerId)
  const due = order.totalAmount - (order.paidAmount - order.refundedAmount)
  const amount = Math.min(int(input.amount, 'Amount', { min: 1 }), customer.storeCreditAmount, due)
  if (amount <= 0) throw new DomainError(Codes.GUARD_FAILED, 'No credit or nothing due.')
  await tx.customer.update({ where: { id: customer.id }, data: { storeCreditAmount: { decrement: amount } } })
  const payment = await tx.payment.create({ data: { status: 'verified', method: 'store_credit', amount, currencyCode: order.currencyCode, reference: `credit:${order.number}:${uow.now.getTime()}`, receivedAt: uow.now, verifiedAt: uow.now, orderId: order.id, customerId: customer.id, verifiedById: actorUserId(actor) } })
  const { applyMoney } = await import('./money')
  await applyMoney(uow, actor, payment.id)
  auditChange(uow, actor, 'Payment', payment.id, 'payment.store_credit', { amount }, { toStatus: 'verified' })
  return payment
}

export { allocateToPlan }

// ---------------- Service plan subscriptions (W9, P43) ----------------

/** Sell a plan for a system (P43 staff, S23 customer). A pay link starts it. */
export async function subscribeToPlan(uow: UnitOfWork, actor: Actor, input: { planId: string; systemId: string; customerId?: string | null }) {
  const tx = uow.tx
  const plan = await tx.servicePlan.findUnique({ where: { id: input.planId } })
  assertSellable(plan)
  const system = await tx.installedSystem.findUnique({ where: { id: input.systemId } })
  if (!system || (input.customerId && system.customerId !== input.customerId)) throw new DomainError(Codes.NOT_FOUND, 'System not found.')
  if (['decommissioned'].includes(system.status)) throw new DomainError(Codes.GUARD_FAILED, 'This system is decommissioned.')
  const live = await tx.servicePlanSubscription.findFirst({ where: { systemId: system.id, status: { in: ['active', 'pending_payment'] } } })
  if (live?.status === 'active') throw new DomainError(Codes.GUARD_FAILED, 'This system already has a plan. Renew it instead.')
  const sub = live ?? (await tx.servicePlanSubscription.create({ data: { status: 'pending_payment', priceAmount: plan!.priceAmount, currencyCode: plan!.currencyCode, billing: plan!.billing, planId: plan!.id, systemId: system.id, customerId: system.customerId, autoRenew: false } }))
  if (!live) auditChange(uow, actor, 'ServicePlanSubscription', sub.id, 'subscription.created', { planId: plan!.id }, { toStatus: 'pending_payment' })
  const s = await openSession(uow, { code: 'bank_transfer', amount: sub.priceAmount, currencyCode: sub.currencyCode, purpose: 'plan', description: `${plan!.name} for ${system.number}`, target: { subscriptionId: sub.id, customerId: system.customerId } })
  await tx.paymentSession.update({ where: { id: s.id }, data: { providerId: null } })
  return { subscriptionId: sub.id, sessionCode: s.publicCode, amount: sub.priceAmount, currencyCode: sub.currencyCode }
}

export async function renewSubscription(uow: UnitOfWork, actor: Actor, input: { subscriptionId: string }) {
  requirePermission(actor, 'canManagePlans', 'canManageSystems')
  const sub = await uow.tx.servicePlanSubscription.findUnique({ where: { id: input.subscriptionId }, include: { plan: true, system: true } })
  if (!sub || sub.status === 'cancelled') throw new DomainError(Codes.NOT_FOUND, 'Subscription not found.')
  const s = await openSession(uow, { code: 'bank_transfer', amount: sub.priceAmount, currencyCode: sub.currencyCode, purpose: 'plan', description: `Renew ${sub.plan?.name ?? 'plan'} for ${sub.system?.number ?? ''}`, target: { subscriptionId: sub.id, customerId: sub.customerId } })
  await uow.tx.paymentSession.update({ where: { id: s.id }, data: { providerId: null } })
  return { sessionCode: s.publicCode, amount: sub.priceAmount, currencyCode: sub.currencyCode }
}

/** Cancel with the pro-rata refund (4.11): unused whole months less visits done at list price, never below zero. */
export async function cancelSubscription(uow: UnitOfWork, actor: Actor, input: { subscriptionId: string; reason: string; visitListPriceAmount?: number; payoutReference?: string; idempotencyKey: string; expectedVersion?: number | null }) {
  requirePermission(actor, 'canManagePlans')
  const tx = uow.tx
  const reason = str(input.reason, 500)
  if (!reason) throw new DomainError(Codes.INVALID_INPUT, 'Give a reason.')
  const sub = await lockRow<any>(tx, 'ServicePlanSubscription', input.subscriptionId)
  const settings = await getSettings(tx)
  const visitPrice = input.visitListPriceAmount ?? settings.surveyFeeAmount
  const refundAmount = sub.status === 'active' ? proRataRefund(sub, Math.max(0, visitPrice), uow.now) : 0
  await transition(uow, { model: 'ServicePlanSubscription', id: sub.id, from: ['pending_payment', 'active', 'renewal_due', 'grace', 'lapsed'], to: 'cancelled', expectedVersion: input.expectedVersion, actor, action: 'subscription.cancelled', reason, data: { cancelledAt: uow.now, cancelReason: reason, refundAmount } })
  await tx.visit.updateMany({ where: { subscriptionId: sub.id, status: 'requested' }, data: { status: 'cancelled', cancelReason: 'Plan cancelled', cancelledBy: 'company' } })
  let left = refundAmount
  if (left > 0) {
    const allocs = await tx.paymentAllocation.findMany({ where: { subscriptionId: sub.id }, include: { payment: true }, orderBy: { createdAt: 'desc' } })
    for (const a of allocs) {
      if (left <= 0 || !a.payment) break
      const take = Math.min(left, a.amount, a.payment.amount - a.payment.refundedAmount)
      if (take <= 0) continue
      await refund(uow, actor, { paymentId: a.payment.id, amount: take, reason: `Plan cancelled: ${reason}`, payoutReference: input.payoutReference, idempotencyKey: `${input.idempotencyKey}:${a.payment.id}` })
      left -= take
    }
  }
  return { subscriptionId: sub.id, refundAmount: refundAmount - left }
}

export { activateSubscription }
