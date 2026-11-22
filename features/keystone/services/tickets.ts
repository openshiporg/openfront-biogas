import type { UnitOfWork } from '../lib/unitOfWork'
import { DomainError, Codes } from '../lib/errors'
import { auditChange, lockRow, transition } from '../lib/cas'
import { actorUserId, requirePermission, systemActor, type Actor } from '../lib/actor'
import { nextNumber } from '../lib/sequence'
import { addDays, addWorkingDays } from '../lib/time'
import { getSettings } from './settings'
import { coverFor } from './systems'
import { openSession } from './money'
import { normPhone, oneOf, str } from './util'

/**
 * Service tickets (W8, 4.9, 4.10). The response clock starts at open; past target reads from
 * responseDueAt. Warranty cover comes from the system's rows and the fault category. Paid work waits at
 * awaiting_customer_approval until the service quote is accepted (and paid, when the setting says so).
 */
export const CATEGORIES = ['no_gas', 'low_pressure', 'smell', 'leak', 'stove_fault', 'slurry_overflow', 'other'] as const

export async function openTicket(uow: UnitOfWork, actor: Actor, input: { systemId?: string | null; customerId?: string | null; channel: string; category: string; description: string; callbackPhone?: string; severity?: string; mediaIds?: string[] }) {
  const tx = uow.tx
  const settings = await getSettings(tx)
  const system = input.systemId ? await tx.installedSystem.findUnique({ where: { id: input.systemId }, include: { warranties: true, subscriptions: { include: { plan: true } } } }) : null
  const customerId = system?.customerId ?? input.customerId ?? null
  if (!customerId) throw new DomainError(Codes.INVALID_INPUT, 'A ticket needs a customer or a system.')
  const category = oneOf(input.category, CATEGORIES, 'Problem')
  const description = str(input.description, 4000)
  if (description.length < 3) throw new DomainError(Codes.INVALID_INPUT, 'Describe the problem.')
  const urgent = input.severity === 'urgent' || ['smell', 'leak'].includes(category)
  const priority = system?.subscriptions.some(s => s.status === 'active' && s.plan?.priorityResponse)
  const days = urgent || priority ? Math.max(1, Math.ceil(settings.serviceResponseTargetDays / 2)) : settings.serviceResponseTargetDays
  const cover = system ? coverFor(system.warranties, category, uow.now) : null
  const ticket = await tx.serviceTicket.create({
    data: {
      number: await nextNumber(tx, 'T'), status: 'open', channel: oneOf(input.channel, ['portal', 'public_form', 'phone', 'follow_up'] as const, 'Channel'), category, severity: urgent ? 'urgent' : 'normal', description,
      callbackPhone: normPhone(input.callbackPhone), responseDueAt: addWorkingDays(uow.now, days), warrantyDecision: 'pending', warrantyNote: cover ? cover.reason : 'No installed system linked',
      systemId: system?.id ?? null, customerId,
    },
  })
  if (input.mediaIds?.length) await tx.media.updateMany({ where: { id: { in: input.mediaIds.slice(0, 10) }, ticketId: null, visitId: null }, data: { ticketId: ticket.id } })
  await tx.ticketEvent.create({ data: { type: 'status', body: `Opened (${input.channel.replace('_', ' ')})`, ticketId: ticket.id, userId: actorUserId(actor), isCustomerVisible: true } })
  auditChange(uow, actor, 'ServiceTicket', ticket.id, 'ticket.opened', { number: ticket.number, category }, { toStatus: 'open' })
  uow.emit('ticket.opened', 'ServiceTicket', ticket.id, { number: ticket.number, category, severity: ticket.severity })
  return ticket
}

const MOVES: Record<string, { from: string[]; to: string; reason?: boolean }> = {
  triage: { from: ['open', 'reopened'], to: 'triaged' },
  phone_resolved: { from: ['open', 'triaged', 'reopened'], to: 'phone_resolved', reason: true },
  start: { from: ['triaged', 'visit_scheduled', 'awaiting_customer_approval', 'reopened'], to: 'in_progress' },
  resolve: { from: ['in_progress', 'visit_scheduled', 'triaged'], to: 'resolved', reason: true },
  reopen: { from: ['resolved', 'phone_resolved'], to: 'reopened', reason: true },
  close: { from: ['resolved', 'phone_resolved'], to: 'closed' },
  cancel: { from: ['open', 'triaged', 'visit_scheduled', 'awaiting_customer_approval', 'reopened'], to: 'cancelled', reason: true },
}

/** P39, P42: named ticket moves; P40 the warranty decision travels with triage or on its own. */
export async function transitionTicket(uow: UnitOfWork, actor: Actor, input: { ticketId: string; action: string; reason?: string; customerConfirmed?: boolean; warrantyDecision?: string; partReplaced?: string; supplierClaim?: boolean; assignedToId?: string | null; expectedVersion?: number | null }) {
  requirePermission(actor, 'canManageTickets')
  const tx = uow.tx
  const t = await lockRow<any>(tx, 'ServiceTicket', input.ticketId)
  const reason = str(input.reason, 2000)
  if (input.action === 'warranty') return decideWarranty(uow, actor, { ...input, ticket: t })
  if (input.action === 'assign') {
    const user = input.assignedToId ? await tx.user.findUnique({ where: { id: input.assignedToId }, include: { role: true } }) : null
    if (input.assignedToId && !user?.isActive) throw new DomainError(Codes.INVALID_INPUT, 'Pick an active staff member.')
    await tx.serviceTicket.update({ where: { id: t.id }, data: { assignedToId: user?.id ?? null, version: { increment: 1 } } })
    auditChange(uow, actor, 'ServiceTicket', t.id, 'ticket.assigned', { to: user?.id ?? null })
    return tx.serviceTicket.findUnique({ where: { id: t.id } })
  }
  const move = MOVES[input.action]
  if (!move) throw new DomainError(Codes.INVALID_INPUT, 'Unknown ticket move.')
  if (move.reason && !reason) throw new DomainError(Codes.INVALID_INPUT, input.action.includes('resolve') ? 'Say what fixed it.' : 'Give a reason.')
  if (input.action === 'start' && t.status === 'awaiting_customer_approval') {
    const settings = await getSettings(tx)
    const q = await tx.quote.findFirst({ where: { ticketId: t.id, kind: 'service', status: 'accepted' }, orderBy: { createdAt: 'desc' }, include: { order: true } })
    if (!q) throw new DomainError(Codes.GUARD_FAILED, 'The customer has not accepted the repair quote yet.')
    if (settings.payBeforeServiceWork && q.order && q.order.paidAmount - q.order.refundedAmount < q.order.totalAmount) throw new DomainError(Codes.GUARD_FAILED, 'The repair must be paid before work starts.')
  }
  if (input.action === 'reopen' && t.resolvedAt && uow.now.getTime() > addDays(new Date(t.resolvedAt), 14).getTime()) throw new DomainError(Codes.EXPIRED, 'Tickets can be reopened within 14 days of being resolved. Open a new one.')
  if (input.action === 'resolve' && t.warrantyDecision === 'pending' && t.systemId) throw new DomainError(Codes.GUARD_FAILED, 'Record the warranty decision first.')
  const data: Record<string, unknown> = { firstResponseAt: t.firstResponseAt ?? uow.now }
  if (['resolve', 'phone_resolved'].includes(input.action)) Object.assign(data, { resolvedAt: uow.now, resolution: reason, customerConfirmed: Boolean(input.customerConfirmed) })
  if (input.action === 'close') data.closedAt = uow.now
  if (input.action === 'reopen') Object.assign(data, { resolvedAt: null, closedAt: null })
  const out = await transition<any>(uow, { model: 'ServiceTicket', id: t.id, from: move.from, to: move.to, expectedVersion: input.expectedVersion, actor, action: `ticket.${move.to}`, reason, data })
  await tx.ticketEvent.create({ data: { type: 'status', body: `${move.to.replaceAll('_', ' ')}${reason ? `: ${reason}` : ''}`, ticketId: t.id, userId: actorUserId(actor), isCustomerVisible: true } })
  if (['resolved', 'phone_resolved'].includes(move.to)) {
    uow.emit('ticket.resolved', 'ServiceTicket', t.id, { number: t.number, resolution: reason })
    if (t.systemId) {
      const s = await tx.installedSystem.findUnique({ where: { id: t.systemId } })
      if (s && ['not_working', 'underperforming'].includes(s.status)) await transition(uow, { model: 'InstalledSystem', id: s.id, from: [s.status], to: 'active', actor: systemActor('tickets'), action: 'system.active', reason: `Ticket ${t.number} resolved`, data: { lastCheckResult: 'working', lastCheckedAt: uow.now } })
    }
  }
  if (move.to === 'reopened') await transition(uow, { model: 'ServiceTicket', id: t.id, from: ['reopened'], to: 'triaged', actor, action: 'ticket.triaged' })
  return move.to === 'reopened' ? tx.serviceTicket.findUnique({ where: { id: t.id } }) : out
}

async function decideWarranty(uow: UnitOfWork, actor: Actor, input: { ticket: any; warrantyDecision?: string; reason?: string; partReplaced?: string; supplierClaim?: boolean }) {
  const tx = uow.tx
  const decision = oneOf(input.warrantyDecision, ['covered', 'not_covered', 'goodwill'] as const, 'Warranty decision')
  const t = input.ticket
  if (['resolved', 'closed', 'cancelled'].includes(t.status)) throw new DomainError(Codes.INVALID_TRANSITION, 'This ticket is closed.', { currentStatus: t.status })
  if (decision === 'covered') {
    const system = t.systemId ? await tx.installedSystem.findUnique({ where: { id: t.systemId }, include: { warranties: true } }) : null
    const cover = system ? coverFor(system.warranties, t.category, uow.now) : null
    if (!cover?.covered) throw new DomainError(Codes.GUARD_FAILED, `Not under warranty: ${cover?.reason ?? 'no system linked'}. Use not covered or goodwill.`)
  }
  await tx.serviceTicket.update({ where: { id: t.id }, data: { warrantyDecision: decision, warrantyNote: str(input.reason, 1000), partReplaced: str(input.partReplaced, 200), supplierClaim: Boolean(input.supplierClaim), version: { increment: 1 }, firstResponseAt: t.firstResponseAt ?? uow.now } })
  await tx.ticketEvent.create({ data: { type: 'note', body: `Warranty: ${decision.replace('_', ' ')}${input.reason ? `. ${input.reason}` : ''}`, ticketId: t.id, userId: actorUserId(actor), isCustomerVisible: true } })
  auditChange(uow, actor, 'ServiceTicket', t.id, 'ticket.warranty_decision', { decision, supplierClaim: Boolean(input.supplierClaim) }, { reason: input.reason })
  return tx.serviceTicket.findUnique({ where: { id: t.id } })
}

export async function addTicketNote(uow: UnitOfWork, actor: Actor, input: { ticketId: string; body: string; isCustomerVisible?: boolean }) {
  const tx = uow.tx
  const t = await tx.serviceTicket.findUnique({ where: { id: input.ticketId } })
  if (!t) throw new DomainError(Codes.NOT_FOUND, 'Ticket not found.')
  const isCustomer = actor.kind === 'user' && actor.customerId === t.customerId && !actor.permissions.has('canManageTickets')
  if (!isCustomer) requirePermission(actor, 'canManageTickets')
  const body = str(input.body, 4000)
  if (!body) throw new DomainError(Codes.INVALID_INPUT, 'Write something.')
  return tx.ticketEvent.create({ data: { type: isCustomer ? 'customer_message' : 'note', body, ticketId: t.id, userId: actorUserId(actor), isCustomerVisible: isCustomer || Boolean(input.isCustomerVisible) } })
}

/**
 * A service quote accepted (S24 or P41 by phone): it becomes a service order with a pay link; the ticket
 * leaves awaiting_customer_approval unless the company wants payment first.
 */
export async function onServiceQuoteAccepted(uow: UnitOfWork, actor: Actor, quote: any, option: any) {
  const tx = uow.tx
  const settings = await getSettings(tx)
  const { createOrderFromLines } = await import('./orders')
  const order = await createOrderFromLines(uow, actor, {
    channel: 'staff', customerId: quote.customerId, siteId: quote.siteId, quoteId: quote.id, fulfilment: 'service',
    lines: option.lines.filter((l: any) => l.totalAmount !== 0).map((l: any) => ({ kind: l.kind, productId: l.productId, name: l.description, sku: l.snapshot?.sku ?? '', quantity: l.quantity ?? 1, unitAmount: l.unitAmount, taxable: Boolean(l.snapshot?.taxable ?? true), warrantyMonths: Number(l.snapshot?.warrantyMonths ?? 0), requiresInstallation: false, snapshot: l.snapshot ?? {}, taxAmount: l.taxAmount, totalAmount: l.totalAmount })),
    fixedTotals: { subtotalAmount: option.subtotalAmount, discountAmount: option.discountAmount, taxAmount: option.taxAmount, totalAmount: option.totalAmount },
  })
  const session = order.totalAmount > 0 ? await openSession(uow, { code: 'bank_transfer', amount: order.totalAmount, currencyCode: order.currencyCode, purpose: 'service', description: `Repair ${order.number}`, target: { orderId: order.id, ticketId: quote.ticketId, quoteId: quote.id, customerId: order.customerId } }) : null
  if (session) await tx.paymentSession.update({ where: { id: session.id }, data: { providerId: null } })
  // Services hold no stock: the order is confirmed on acceptance when payment can follow the work.
  if (!settings.payBeforeServiceWork || order.totalAmount === 0) await transition(uow, { model: 'Order', id: order.id, from: ['pending_payment'], to: 'confirmed', actor: systemActor('tickets'), action: 'order.confirmed', data: { confirmedAt: uow.now } })
  if (quote.ticketId) {
    const t = await tx.serviceTicket.findUnique({ where: { id: quote.ticketId } })
    if (t?.status === 'awaiting_customer_approval' && !settings.payBeforeServiceWork) await transition(uow, { model: 'ServiceTicket', id: t.id, from: ['awaiting_customer_approval'], to: 'in_progress', actor: systemActor('tickets'), action: 'ticket.in_progress', reason: 'Repair quote accepted' })
    await tx.ticketEvent.create({ data: { type: 'status', body: 'Repair quote accepted', ticketId: quote.ticketId, isCustomerVisible: true } })
  }
  return { quoteId: quote.id, orderId: order.id, orderNumber: order.number, orderCode: order.publicCode, sessionCode: session?.publicCode ?? null, amount: order.totalAmount, currencyCode: order.currencyCode }
}
