import type { Tx } from '../lib/db'
import type { UnitOfWork } from '../lib/unitOfWork'
import { DomainError, Codes } from '../lib/errors'
import { auditChange, lockRow, transition } from '../lib/cas'
import { actorUserId, requirePermission, systemActor, type Actor } from '../lib/actor'
import { nextNumber, publicCode } from '../lib/sequence'
import { addDays, quoteEffectiveStatus } from '../lib/time'
import { getSettings } from './settings'
import { discountBps, incentiveAmount, planOffer, priceLines } from './pricing'
import { int, oneOf, str } from './util'
import { createOrderFromLines, type OrderLineInput } from './orders'
import { openSession } from './money'
import { scopeLead } from './leads'

/**
 * Quotes (W3, 4.3). Staff build a draft with up to three options; prices come from the catalogue on
 * the server. Sending checks the discount against the sender's limit. Only the latest sent version can
 * be accepted, and accepting is one transaction: quote CAS to accepted, order, deposit session.
 */
const LINE_KINDS = ['product', 'labour', 'delivery', 'discount', 'incentive', 'fee'] as const
type LineIn = { kind: string; productId?: string | null; description?: string; quantity?: number; unitAmount?: number; incentiveProgramId?: string | null }
type OptionIn = { label?: string; description?: string; isRecommended?: boolean; lines: LineIn[]; planTemplateIds?: string[] }
export type QuoteDraftInput = { quoteId?: string | null; leadId?: string | null; ticketId?: string | null; customerId?: string | null; kind?: string; notes?: string; terms?: string; options: OptionIn[] }

const latestKeyOf = (q: { leadId: string | null; ticketId: string | null; customerId: string | null; kind: string }) =>
  q.leadId ? `${q.leadId}:${q.kind}` : q.ticketId ? `ticket:${q.ticketId}:${q.kind}` : `customer:${q.customerId}:${q.kind}`

async function buildOption(tx: Tx, option: OptionIn, index: number, settings: Awaited<ReturnType<typeof getSettings>>, kind: string) {
  if (!Array.isArray(option.lines) || !option.lines.length) throw new DomainError(Codes.INVALID_INPUT, `Option ${index + 1} needs at least one line.`)
  if (option.lines.length > 40) throw new DomainError(Codes.INVALID_INPUT, 'At most 40 lines per option.')
  const lines: (OrderLineInput & { incentiveProgramId: string | null })[] = []
  let kitPrice = 0
  let capacity: number | null = null
  for (const raw of option.lines) {
    const k = oneOf(raw.kind, LINE_KINDS, 'Line kind')
    const quantity = int(raw.quantity ?? 1, 'Quantity', { min: 1, max: 10_000 })
    if (k === 'product') {
      const product = await tx.product.findUnique({ where: { id: String(raw.productId ?? '') }, include: { digesterSpec: true } })
      if (!product) throw new DomainError(Codes.INVALID_INPUT, 'A product line points at a product that does not exist.')
      lines.push({ kind: 'product', productId: product.id, name: product.name, sku: product.sku, quantity, unitAmount: product.priceAmount, taxable: product.taxable, warrantyMonths: product.warrantyMonths ?? 0, requiresInstallation: product.requiresInstallation, incentiveProgramId: null, snapshot: { name: product.name, sku: product.sku, priceAmount: product.priceAmount, warrantyMonths: product.warrantyMonths ?? 0, type: product.type } })
      if (product.type === 'digester_kit') {
        kitPrice += product.priceAmount * quantity
        capacity = product.digesterSpec?.capacityM3 ? Number(product.digesterSpec.capacityM3) : capacity
        // The install fee is its own labour line unless staff typed one.
        if (product.installFeeAmount > 0 && kind === 'sale' && !option.lines.some(l => l.kind === 'labour')) lines.push({ kind: 'labour', productId: null, name: `Installation: ${product.name}`, sku: '', quantity: 1, unitAmount: product.installFeeAmount, taxable: true, warrantyMonths: 0, requiresInstallation: false, incentiveProgramId: null, snapshot: {} })
      }
      continue
    }
    if (k === 'incentive') continue
    const description = str(raw.description, 200)
    if (!description) throw new DomainError(Codes.INVALID_INPUT, `Describe the ${k} line.`)
    const amount = Math.trunc(Number(raw.unitAmount ?? 0))
    const unitAmount = k === 'discount' ? -Math.abs(amount) : Math.abs(amount)
    lines.push({ kind: k, productId: null, name: description, sku: '', quantity, unitAmount, taxable: k !== 'discount', warrantyMonths: 0, requiresInstallation: false, incentiveProgramId: null, snapshot: {} })
  }
  // Incentive lines are worked out from the programme, never typed (W4.3).
  for (const raw of option.lines.filter(l => l.kind === 'incentive')) {
    const program = await tx.incentiveProgram.findUnique({ where: { id: String(raw.incentiveProgramId ?? '') } })
    if (!program?.isActive) throw new DomainError(Codes.INVALID_INPUT, 'Pick an active incentive programme.')
    const amount = incentiveAmount({ amountType: program.amountType, amountValue: program.amountValue, capacityTable: program.capacityTable, capAmount: program.capAmount }, kitPrice, capacity)
    if (amount <= 0) continue
    const offNow = program.treatment === 'off_price_now'
    // Paid later to the customer: shown on the quote for information, worth nothing on the price.
    lines.push({ kind: 'incentive', productId: null, name: offNow ? program.name : `${program.name} (paid to you after install)`, sku: '', quantity: 1, unitAmount: offNow ? -amount : 0, taxable: false, warrantyMonths: 0, requiresInstallation: false, incentiveProgramId: program.id, snapshot: { programId: program.id, amount, treatment: program.treatment } })
  }
  const priced = priceLines(lines.filter(l => !(l.kind === 'incentive' && l.unitAmount === 0)), settings)
  const infoLines = lines.filter(l => l.kind === 'incentive' && l.unitAmount === 0).map(l => ({ ...l, totalAmount: 0, taxAmount: 0 }))
  const templates = option.planTemplateIds?.length ? await tx.paymentPlanTemplate.findMany({ where: { id: { in: option.planTemplateIds }, isActive: true }, orderBy: { sortOrder: 'asc' } }) : []
  const offers = templates.map(t => planOffer({ ...t, depositPercent: String(t.depositPercent), planFeePercent: String(t.planFeePercent) }, priced.totalAmount)).filter(Boolean)
  return { priced: { ...priced, lines: [...priced.lines, ...infoLines] }, offers: offers as NonNullable<ReturnType<typeof planOffer>>[], discountBps: discountBps(lines) }
}

/** Create or replace a draft quote (P7). An existing draft is rebuilt; anything past draft is not edited here. */
export async function saveQuoteDraft(uow: UnitOfWork, actor: Actor, input: QuoteDraftInput) {
  requirePermission(actor, 'canManageQuotes', 'canManageTickets')
  const tx = uow.tx
  const settings = await getSettings(tx)
  if (!Array.isArray(input.options) || input.options.length < 1 || input.options.length > 3) throw new DomainError(Codes.INVALID_INPUT, 'A quote has one to three options.')
  const kind = oneOf(input.kind ?? 'sale', ['sale', 'service'] as const, 'Quote kind')
  let quote: any
  if (input.quoteId) {
    quote = await lockRow<any>(tx, 'Quote', input.quoteId)
    if (!['draft', 'pending_approval', 'approved'].includes(quote.status)) throw new DomainError(Codes.INVALID_TRANSITION, 'A sent quote is not edited; issue a new version.', { currentStatus: quote.status })
    if (quote.leadId) await scopeLead(tx, actor, quote.leadId)
    await tx.quoteLine.deleteMany({ where: { option: { quoteId: quote.id } } })
    await tx.quotePlanOffer.deleteMany({ where: { option: { quoteId: quote.id } } })
    await tx.quoteOption.deleteMany({ where: { quoteId: quote.id } })
  } else {
    let leadId = input.leadId ?? null
    let customerId = input.customerId ?? null
    let siteId: string | null = null
    if (leadId) {
      await scopeLead(tx, actor, leadId)
      const lead = await tx.lead.findUnique({ where: { id: leadId } })
      customerId = lead?.customerId ?? customerId
      siteId = lead?.siteId ?? null
    }
    if (input.ticketId) {
      const t = await tx.serviceTicket.findUnique({ where: { id: input.ticketId }, include: { system: true } })
      if (!t) throw new DomainError(Codes.NOT_FOUND, 'Ticket not found.')
      customerId = t.customerId
      siteId = t.system?.siteId ?? null
    }
    if (!customerId) throw new DomainError(Codes.INVALID_INPUT, 'A quote needs a lead, a ticket or a customer.')
    leadId = leadId ?? null
    quote = await tx.quote.create({ data: { number: await nextNumber(tx, 'Q'), version: 1, kind, status: 'draft', publicCode: publicCode('Q'), currencyCode: settings.currencyCode, leadId, customerId, siteId, ticketId: input.ticketId ?? null, preparedById: actorUserId(actor) } })
    auditChange(uow, actor, 'Quote', quote.id, 'quote.created', { number: quote.number }, { toStatus: 'draft' })
  }
  let worst = 0
  const totals: number[] = []
  for (const [i, option] of input.options.entries()) {
    const built = await buildOption(tx, option, i, settings, kind)
    worst = Math.max(worst, built.discountBps)
    totals.push(built.priced.totalAmount)
    await tx.quoteOption.create({
      data: {
        quoteId: quote.id,
        label: str(option.label, 120) || `Option ${i + 1}`,
        description: str(option.description, 1000),
        sortOrder: i,
        isRecommended: Boolean(option.isRecommended),
        subtotalAmount: built.priced.subtotalAmount,
        discountAmount: built.priced.discountAmount,
        taxAmount: built.priced.taxAmount,
        totalAmount: built.priced.totalAmount,
        lines: { create: built.priced.lines.map(l => ({ kind: l.kind, description: l.name, quantity: l.quantity, unitAmount: l.unitAmount, taxAmount: l.taxAmount, totalAmount: l.totalAmount, productId: l.productId, incentiveProgramId: l.incentiveProgramId, snapshot: { ...l.snapshot, sku: l.sku, taxable: l.taxable, warrantyMonths: l.warrantyMonths, requiresInstallation: l.requiresInstallation } })) },
        planOffers: { create: built.offers.map(o => ({ label: o.label, depositAmount: o.depositAmount, instalmentAmount: o.instalmentAmount, instalmentCount: o.instalmentCount, frequency: o.frequency, planFeeAmount: o.planFeeAmount, totalAmount: o.totalAmount, schedule: o.schedule as never, templateId: o.templateId })) },
      },
    })
  }
  // Editing an approved draft needs approval again.
  const status = quote.status === 'draft' ? 'draft' : 'draft'
  await tx.quote.update({
    where: { id: quote.id },
    data: { status, notes: str(input.notes, 4000), terms: str(input.terms, 8000), totalAmount: Math.min(...totals), subtotalAmount: 0, taxAmount: 0, discountAmount: 0, approvedById: null, casVersion: { increment: 1 } },
  })
  if (quote.status !== 'draft') auditChange(uow, actor, 'Quote', quote.id, 'quote.edited', { maxDiscountBps: worst }, { fromStatus: quote.status, toStatus: 'draft' })
  return tx.quote.findUnique({ where: { id: quote.id }, include: { options: { include: { lines: true, planOffers: true }, orderBy: { sortOrder: 'asc' } } } })
}

async function maxDiscountBps(tx: Tx, quoteId: string) {
  const options = await tx.quoteOption.findMany({ where: { quoteId }, include: { lines: true } })
  return Math.max(0, ...options.map(o => discountBps(o.lines.map(l => ({ kind: l.kind, quantity: l.quantity ?? 1, unitAmount: l.unitAmount })))))
}

const limitBps = (actor: Actor) => (actor.kind === 'system' ? 10000 : actor.kind === 'user' ? Math.round(actor.discountLimitPercent * 100) : 0)

/** Mark sent (P9): over-limit discounts go to approval first; sending supersedes older versions. */
export async function sendQuote(uow: UnitOfWork, actor: Actor, input: { quoteId: string; expectedVersion?: number | null }) {
  requirePermission(actor, 'canManageQuotes', 'canManageTickets')
  const tx = uow.tx
  const settings = await getSettings(tx)
  const quote = await lockRow<any>(tx, 'Quote', input.quoteId)
  if (quote.leadId) await scopeLead(tx, actor, quote.leadId)
  const options = await tx.quoteOption.count({ where: { quoteId: quote.id } })
  if (!options) throw new DomainError(Codes.GUARD_FAILED, 'Add at least one option before sending.')
  const bps = await maxDiscountBps(tx, quote.id)
  if (quote.status === 'draft' && bps > limitBps(actor)) {
    return transition(uow, { model: 'Quote', id: quote.id, from: ['draft'], to: 'pending_approval', expectedVersion: input.expectedVersion, versionField: 'casVersion', actor, action: 'quote.approval_requested', data: { approvedById: null } })
  }
  const key = latestKeyOf(quote)
  // Older versions of this lead's quote stop being the latest, so only this one can be accepted.
  const older = await tx.quote.findMany({ where: { latestKey: key, id: { not: quote.id } } })
  for (const o of older) {
    await tx.quote.update({ where: { id: o.id }, data: { latestKey: null, isLatest: false } })
    if (['sent', 'viewed', 'draft', 'pending_approval', 'approved'].includes(o.status)) await transition(uow, { model: 'Quote', id: o.id, from: [o.status], to: 'superseded', versionField: 'casVersion', actor, action: 'quote.superseded', reason: `Replaced by version ${quote.version}` })
  }
  const sent = await transition<any>(uow, {
    model: 'Quote', id: quote.id, from: ['draft', 'approved'], to: 'sent', expectedVersion: input.expectedVersion, versionField: 'casVersion', actor, action: 'quote.sent',
    data: { sentAt: uow.now, validUntil: addDays(uow.now, settings.quoteValidDays), latestKey: key, isLatest: true },
  })
  if (quote.leadId) {
    const lead = await tx.lead.findUnique({ where: { id: quote.leadId } })
    if (lead && ['new', 'contacted', 'survey_scheduled', 'surveyed'].includes(lead.status)) await transition(uow, { model: 'Lead', id: lead.id, from: [lead.status], to: 'quoted', actor: systemActor('quotes'), action: 'lead.quoted', data: { firstContactAt: lead.firstContactAt ?? uow.now } })
  }
  if (quote.ticketId && quote.kind === 'service') {
    const t = await tx.serviceTicket.findUnique({ where: { id: quote.ticketId } })
    if (t && ['triaged', 'in_progress', 'visit_scheduled', 'reopened'].includes(t.status)) await transition(uow, { model: 'ServiceTicket', id: t.id, from: [t.status], to: 'awaiting_customer_approval', actor, action: 'ticket.awaiting_customer_approval' })
  }
  uow.emit('quote.sent', 'Quote', quote.id, { number: quote.number, version: quote.version, publicCode: quote.publicCode })
  return sent
}

/** P8: approve a discount over the agent's limit; the approver's own limit applies. */
export async function approveQuote(uow: UnitOfWork, actor: Actor, input: { quoteId: string; expectedVersion?: number | null }) {
  requirePermission(actor, 'canApproveDiscounts')
  const bps = await maxDiscountBps(uow.tx, input.quoteId)
  if (bps > limitBps(actor)) throw new DomainError(Codes.APPROVAL_REQUIRED, 'This discount is over your own approval limit.')
  return transition(uow, { model: 'Quote', id: input.quoteId, from: ['pending_approval'], to: 'approved', expectedVersion: input.expectedVersion, versionField: 'casVersion', actor, action: 'quote.approved', data: { approvedById: actorUserId(actor) } })
}

/** P9: a new version copies the options into a new draft. The old one is superseded when the new one is sent. */
export async function reviseQuote(uow: UnitOfWork, actor: Actor, input: { quoteId: string }) {
  requirePermission(actor, 'canManageQuotes', 'canManageTickets')
  const tx = uow.tx
  const old = await tx.quote.findUnique({ where: { id: input.quoteId }, include: { options: { include: { lines: true, planOffers: true } } } })
  if (!old) throw new DomainError(Codes.NOT_FOUND, 'Quote not found.')
  if (['accepted', 'cancelled'].includes(old.status)) throw new DomainError(Codes.INVALID_TRANSITION, 'An accepted quote is changed through an order change.', { currentStatus: old.status })
  const top = await tx.quote.aggregate({ where: { number: old.number }, _max: { version: true } })
  const draft = await tx.quote.create({
    data: {
      number: old.number, version: (top._max.version ?? old.version) + 1, kind: old.kind, status: 'draft', publicCode: publicCode('Q'), currencyCode: old.currencyCode, notes: old.notes, terms: old.terms, totalAmount: old.totalAmount,
      leadId: old.leadId, customerId: old.customerId, siteId: old.siteId, ticketId: old.ticketId, preparedById: actorUserId(actor), previousId: old.id, isLatest: false,
      options: { create: old.options.map(o => ({ label: o.label, description: o.description, sortOrder: o.sortOrder, isRecommended: o.isRecommended, subtotalAmount: o.subtotalAmount, discountAmount: o.discountAmount, taxAmount: o.taxAmount, totalAmount: o.totalAmount, lines: { create: o.lines.map(l => ({ kind: l.kind, description: l.description, quantity: l.quantity, unitAmount: l.unitAmount, taxAmount: l.taxAmount, totalAmount: l.totalAmount, snapshot: l.snapshot ?? {}, productId: l.productId, incentiveProgramId: l.incentiveProgramId })) }, planOffers: { create: o.planOffers.map(p => ({ label: p.label, depositAmount: p.depositAmount, instalmentAmount: p.instalmentAmount, instalmentCount: p.instalmentCount, frequency: p.frequency, planFeeAmount: p.planFeeAmount, totalAmount: p.totalAmount, schedule: p.schedule ?? [], templateId: p.templateId })) } })) },
    },
  })
  auditChange(uow, actor, 'Quote', draft.id, 'quote.revised', { from: old.id, version: draft.version }, { toStatus: 'draft' })
  return draft
}

export async function cancelQuote(uow: UnitOfWork, actor: Actor, input: { quoteId: string; reason?: string; expectedVersion?: number | null }) {
  requirePermission(actor, 'canManageQuotes', 'canManageTickets')
  return transition(uow, { model: 'Quote', id: input.quoteId, from: ['draft', 'pending_approval', 'approved'], to: 'cancelled', expectedVersion: input.expectedVersion, versionField: 'casVersion', actor, action: 'quote.cancelled', reason: str(input.reason, 500), data: { latestKey: null, isLatest: false } })
}

export const QUOTE_PUBLIC_INCLUDE = {
  options: { orderBy: { sortOrder: 'asc' as const }, include: { lines: { orderBy: { createdAt: 'asc' as const } }, planOffers: { orderBy: { totalAmount: 'asc' as const } } } },
  customer: { select: { name: true } },
  site: { select: { label: true, city: true, region: true } },
  order: { select: { publicCode: true, status: true } },
}

/** S6: the quote by its code; the first open sets viewedAt and moves sent → viewed. */
export async function viewQuote(uow: UnitOfWork, code: string) {
  const tx = uow.tx
  const quote = await tx.quote.findUnique({ where: { publicCode: code } })
  if (!quote || ['draft', 'pending_approval', 'approved', 'cancelled'].includes(quote.status)) return null
  if (quote.status === 'sent' && quoteEffectiveStatus(quote, uow.now) === 'sent') {
    await transition(uow, { model: 'Quote', id: quote.id, from: ['sent'], to: 'viewed', versionField: 'casVersion', actor: { kind: 'guest', key: code }, action: 'quote.viewed', data: { viewedAt: uow.now } }).catch(() => undefined)
  }
  const full = await tx.quote.findUnique({ where: { id: quote.id }, include: QUOTE_PUBLIC_INCLUDE })
  return full && { ...full, effectiveStatus: quoteEffectiveStatus(full, uow.now) }
}

/**
 * S7, P11: accept. One transaction: CAS the latest, unexpired quote to accepted; create the order from
 * the option's line snapshots; open the deposit (or full) session. A second accept loses the CAS.
 */
export async function acceptQuote(uow: UnitOfWork, actor: Actor, input: { code: string; optionId: string; planOfferId?: string | null; signedName: string; ip?: string; keyHash?: string }) {
  const tx = uow.tx
  const found = await tx.quote.findUnique({ where: { publicCode: input.code }, select: { id: true } })
  if (!found) throw new DomainError(Codes.NOT_FOUND, 'Quote not found.')
  if (actor.kind === 'user' && actor.permissions.has('canAccessDashboard')) requirePermission(actor, 'canManageQuotes', 'canManageTickets')
  const signedName = str(input.signedName, 120)
  if (signedName.length < 2) throw new DomainError(Codes.INVALID_INPUT, 'Type your full name to sign.')
  let option: any
  let offer: any = null
  const quote = await transition<any>(uow, {
    model: 'Quote', id: found.id, from: ['sent', 'viewed'], to: 'accepted', versionField: 'casVersion', actor, action: 'quote.accepted',
    guard: async row => {
      if (quoteEffectiveStatus(row as any, uow.now) === 'expired') throw new DomainError(Codes.EXPIRED, 'This quote has expired. Ask us for a new one.')
      if (!row.isLatest || !row.latestKey) throw new DomainError(Codes.INVALID_TRANSITION, 'A newer version of this quote exists.', { currentStatus: 'superseded' })
      option = await tx.quoteOption.findFirst({ where: { id: input.optionId, quoteId: found.id }, include: { lines: true, planOffers: true } })
      if (!option) throw new DomainError(Codes.INVALID_INPUT, 'Pick one of the options on this quote.')
      if (input.planOfferId) {
        offer = option.planOffers.find((p: any) => p.id === input.planOfferId)
        if (!offer) throw new DomainError(Codes.INVALID_INPUT, 'Pick a payment plan offered for this option.')
      } else if (option.planOffers.length) {
        offer = [...option.planOffers].sort((a: any, b: any) => (a.instalmentCount ?? 0) - (b.instalmentCount ?? 0))[0]
      }
    },
    data: { signedName, signedAt: uow.now, signedIp: str(input.ip, 64), acceptedOptionId: input.optionId, acceptedPlanOfferId: input.planOfferId ?? null },
  })
  if (offer && !input.planOfferId) await tx.quote.update({ where: { id: quote.id }, data: { acceptedPlanOfferId: offer.id } })
  if (quote.kind === 'service') {
    const { onServiceQuoteAccepted } = await import('./tickets')
    const result = await onServiceQuoteAccepted(uow, actor, quote, option)
    uow.emit('quote.accepted', 'Quote', quote.id, { number: quote.number, optionId: option.id })
    return result
  }
  const lines: OrderLineInput[] = option.lines
    .filter((l: any) => l.totalAmount !== 0 || l.kind === 'product')
    .map((l: any) => ({ kind: l.kind, productId: l.productId, name: l.description, sku: l.snapshot?.sku ?? '', quantity: l.quantity ?? 1, unitAmount: l.unitAmount, taxable: Boolean(l.snapshot?.taxable ?? l.kind !== 'discount'), warrantyMonths: Number(l.snapshot?.warrantyMonths ?? 0), requiresInstallation: Boolean(l.snapshot?.requiresInstallation), snapshot: l.snapshot ?? {}, taxAmount: l.taxAmount, totalAmount: l.totalAmount }))
  const lead = quote.leadId ? await tx.lead.findUnique({ where: { id: quote.leadId } }) : null
  const order = await createOrderFromLines(uow, actor, {
    channel: 'quote', lines, customerId: quote.customerId, siteId: quote.siteId, quoteId: quote.id, branchId: lead?.branchId ?? null, salesAgentId: lead?.assignedToId ?? quote.preparedById, referralId: lead?.referralId ?? null,
    fulfilment: lines.some(l => l.requiresInstallation) ? 'install' : 'delivery', fixedTotals: { subtotalAmount: option.subtotalAmount, discountAmount: option.discountAmount, taxAmount: option.taxAmount, totalAmount: option.totalAmount },
  })
  const firstDue = offer ? (offer.schedule as any[])?.[0]?.amount ?? offer.depositAmount : order.totalAmount
  const amount = Math.max(0, Math.min(firstDue, order.totalAmount))
  const session = amount > 0
    ? await openSession(uow, { code: 'bank_transfer', amount, currencyCode: order.currencyCode, purpose: offer && offer.instalmentCount > 0 ? 'deposit' : 'full', description: `${order.number} ${offer && offer.instalmentCount > 0 ? 'deposit' : 'payment'}`, target: { orderId: order.id, quoteId: quote.id, customerId: order.customerId }, keyHash: input.keyHash ?? null })
    : null
  if (session) await tx.paymentSession.update({ where: { id: session.id }, data: { providerId: null } })
  uow.emit('quote.accepted', 'Quote', quote.id, { number: quote.number, orderNumber: order.number, optionId: option.id })
  return { quoteId: quote.id, orderId: order.id, orderNumber: order.number, orderCode: order.publicCode, sessionCode: session?.publicCode ?? null, amount, currencyCode: order.currencyCode }
}

export async function declineQuote(uow: UnitOfWork, actor: Actor, input: { code: string; reason?: string }) {
  const found = await uow.tx.quote.findUnique({ where: { publicCode: input.code }, select: { id: true } })
  if (!found) throw new DomainError(Codes.NOT_FOUND, 'Quote not found.')
  const reason = str(input.reason, 500)
  return transition(uow, { model: 'Quote', id: found.id, from: ['sent', 'viewed'], to: 'declined', versionField: 'casVersion', actor, action: 'quote.declined', reason, data: { declinedReason: reason } })
}
