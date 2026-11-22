import type { Tx } from '../lib/db'
import { getSettings } from './settings'
import { installmentEffectiveStatus, planEffectiveStatus, quoteEffectiveStatus, sessionEffectiveStatus, subscriptionEffectiveStatus, ticketEffectiveStatus } from '../lib/time'
import { PROVIDERS, PROVIDER_CODES } from '../../integrations/payment'
import { stripeConfigured, stripePublishableKey } from '../../integrations/payment/stripe'

/**
 * What customers and guests see. Every public read goes through one of these so internal fields
 * (staff notes, client secrets, signed IPs, other customers) never leave the server.
 */
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)

export async function paymentMethods(tx: Tx) {
  const settings = await getSettings(tx)
  const rows = await tx.paymentProvider.findMany({ orderBy: { sortOrder: 'asc' } })
  const byCode = new Map(rows.map(r => [r.code, r]))
  return PROVIDER_CODES.filter(code => (byCode.get(code)?.isEnabled ?? true) && PROVIDERS[code].available()).map(code => ({
    code,
    label: byCode.get(code)?.name || PROVIDERS[code].label,
    kind: PROVIDERS[code].settlement === 'processor' ? 'card' : 'reference',
    customerCanSubmit: PROVIDERS[code].settlement === 'processor' || PROVIDERS[code].customerCanSubmit,
    instructions: byCode.get(code)?.instructions || settings.offlinePaymentInstructions[code] || '',
    publishableKey: code === 'stripe' ? stripePublishableKey() : '',
  }))
}

export async function storefrontInfo(tx: Tx) {
  const settings = await getSettings(tx)
  const row = await tx.companySettings.findFirst()
  const branches = await tx.branch.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, code: true, address: true, phone: true, lat: true, lng: true } })
  return {
    name: settings.name, legalName: row?.legalName ?? '', country: settings.country, currencyCode: settings.currencyCode, timezone: settings.timezone, units: settings.units,
    phone: settings.phone, whatsappNumber: settings.whatsappNumber, email: settings.email, address: settings.address,
    taxLabel: settings.taxLabel, taxRatePercent: settings.taxRatePercent, taxInclusive: settings.taxInclusive,
    heroText: row?.heroText ?? '', about: row?.about ?? '', impactNumbers: row?.impactNumbers ?? [],
    surveyFeeAmount: settings.surveyFeeAmount, quoteValidDays: settings.quoteValidDays, returnWindowDays: settings.returnWindowDays, visitCancelCutoffHours: settings.visitCancelCutoffHours,
    cardPayments: stripeConfigured(),
    branches: branches.map(b => ({ ...b, lat: b.lat ? String(b.lat) : null, lng: b.lng ? String(b.lng) : null })),
    paymentMethods: await paymentMethods(tx),
  }
}

export function quoteView(q: any, now = new Date()) {
  return {
    code: q.publicCode, number: q.number, version: q.version, kind: q.kind, status: quoteEffectiveStatus(q, now), validUntil: iso(q.validUntil), sentAt: iso(q.sentAt),
    notes: q.notes, terms: q.terms, currencyCode: q.currencyCode, customerName: q.customer?.name ?? '', site: q.site ?? null,
    signedName: q.signedName, signedAt: iso(q.signedAt), acceptedOptionId: q.acceptedOptionId, acceptedPlanOfferId: q.acceptedPlanOfferId,
    canAccept: ['sent', 'viewed'].includes(quoteEffectiveStatus(q, now)) && q.isLatest,
    order: q.order ? { code: q.order.publicCode, status: q.order.status } : null,
    options: (q.options ?? []).map((o: any) => ({
      id: o.id, label: o.label, description: o.description, isRecommended: o.isRecommended, subtotalAmount: o.subtotalAmount, discountAmount: o.discountAmount, taxAmount: o.taxAmount, totalAmount: o.totalAmount,
      lines: o.lines.map((l: any) => ({ id: l.id, kind: l.kind, description: l.description, quantity: l.quantity, unitAmount: l.unitAmount, totalAmount: l.totalAmount, productId: l.productId, warrantyMonths: Number(l.snapshot?.warrantyMonths ?? 0) })),
      planOffers: o.planOffers.map((p: any) => ({ id: p.id, label: p.label, depositAmount: p.depositAmount, instalmentAmount: p.instalmentAmount, instalmentCount: p.instalmentCount, frequency: p.frequency, planFeeAmount: p.planFeeAmount, totalAmount: p.totalAmount, schedule: p.schedule })),
    })),
  }
}

export async function sessionView(tx: Tx, code: string) {
  const s = await tx.paymentSession.findUnique({ where: { publicCode: code }, include: { provider: true, order: { select: { number: true, publicCode: true, status: true } }, installments: { select: { id: true, label: true, amount: true, paidAmount: true, dueDate: true } }, payments: { select: { status: true, method: true, reference: true, amount: true, receiptNumber: true, rejectReason: true, createdAt: true }, orderBy: { createdAt: 'desc' } }, subscription: { include: { plan: { select: { name: true } } } }, visit: { select: { number: true, publicCode: true } } } })
  if (!s) return null
  const now = new Date()
  const status = sessionEffectiveStatus(s, now)
  const waiting = s.payments.find(p => p.status === 'submitted')
  return {
    code: s.publicCode, status: waiting && status !== 'captured' ? 'awaiting_verification' : status, amount: s.amount, currencyCode: s.currencyCode, purpose: s.purpose, description: s.description, expiresAt: iso(s.expiresAt),
    provider: s.provider?.code ?? null,
    order: s.order ? { number: s.order.number, code: s.order.publicCode, status: s.order.status } : null,
    visit: s.visit ? { number: s.visit.number, code: s.visit.publicCode } : null,
    plan: s.subscription ? { name: s.subscription.plan?.name ?? '' } : null,
    installments: s.installments.map(i => ({ ...i, dueDate: iso(i.dueDate) })),
    payments: s.payments.map(p => ({ status: p.status, method: p.method, reference: p.reference, amount: p.amount, receiptNumber: p.receiptNumber, rejectReason: p.rejectReason, at: iso(p.createdAt) })),
    canPay: status === 'pending' && !waiting,
    methods: status === 'pending' && !waiting ? await paymentMethods(tx) : [],
  }
}

export async function orderView(tx: Tx, where: { publicCode?: string; id?: string }) {
  const o = await tx.order.findUnique({
    where: where.publicCode ? { publicCode: where.publicCode } : { id: where.id! },
    include: {
      lines: { orderBy: { createdAt: 'asc' } },
      payments: { orderBy: { createdAt: 'asc' }, select: { status: true, method: true, amount: true, reference: true, receiptNumber: true, refundedAmount: true, createdAt: true } },
      sessions: { where: { status: { in: ['pending'] } }, orderBy: { createdAt: 'desc' }, select: { publicCode: true, amount: true, purpose: true, expiresAt: true, status: true } },
      plan: { include: { installments: { orderBy: { sequence: 'asc' } } } },
      installation: { include: { prepTasks: { orderBy: { sortOrder: 'asc' } }, visits: { orderBy: { createdAt: 'asc' }, select: { type: true, status: true, windowStart: true, windowEnd: true, publicCode: true, number: true } } } },
      refunds: { select: { amount: true, status: true, createdAt: true, reason: true } },
      pickupBranch: false as never,
      branch: { select: { name: true, address: true, phone: true } },
      quote: { select: { publicCode: true, number: true } },
      invoices: { select: { number: true, status: true, totalAmount: true, issuedAt: true, dueAt: true } },
      systems: { select: { id: true, number: true, publicCode: true } },
    } as never,
  }) as any
  if (!o) return null
  const settings = await getSettings(tx)
  const now = new Date()
  return {
    id: o.id, code: o.publicCode, number: o.number, status: o.status, channel: o.channel, fulfilment: o.fulfilment, currencyCode: o.currencyCode,
    subtotalAmount: o.subtotalAmount, discountAmount: o.discountAmount, deliveryAmount: o.deliveryAmount, taxAmount: o.taxAmount, totalAmount: o.totalAmount, paidAmount: o.paidAmount, refundedAmount: o.refundedAmount,
    balanceAmount: o.totalAmount - (o.paidAmount - o.refundedAmount), surveyFeeCreditAmount: o.surveyFeeCreditAmount,
    trackingNumber: o.trackingNumber, carrier: o.carrier, cancelReason: o.cancelReason,
    createdAt: iso(o.createdAt), confirmedAt: iso(o.confirmedAt), pickedAt: iso(o.pickedAt), deliveredAt: iso(o.deliveredAt), completedAt: iso(o.completedAt), cancelledAt: iso(o.cancelledAt),
    branch: o.branch, quote: o.quote ? { code: o.quote.publicCode, number: o.quote.number } : null,
    lines: o.lines.map((l: any) => ({ id: l.id, kind: l.kind, name: l.name, sku: l.sku, quantity: l.quantity, unitAmount: l.unitAmount, taxAmount: l.taxAmount, totalAmount: l.totalAmount, warrantyMonths: l.warrantyMonths, returnedQuantity: l.returnedQuantity })),
    payments: o.payments.map((p: any) => ({ status: p.status, method: p.method, amount: p.amount, reference: p.reference, receiptNumber: p.receiptNumber, refundedAmount: p.refundedAmount, at: iso(p.createdAt) })),
    refunds: o.refunds.map((r: any) => ({ amount: r.amount, status: r.status, reason: r.reason, at: iso(r.createdAt) })),
    payLinks: o.sessions.filter((s: any) => sessionEffectiveStatus(s, now) === 'pending').map((s: any) => ({ code: s.publicCode, amount: s.amount, purpose: s.purpose, expiresAt: iso(s.expiresAt) })),
    plan: o.plan ? planView(o.plan, settings.instalmentGraceDays, settings.defaultAfterDays, now) : null,
    installation: o.installation ? { number: o.installation.number, status: o.installation.status, targetDate: iso(o.installation.targetDate), prepTasks: o.installation.prepTasks.map((t: any) => ({ id: t.id, prompt: t.prompt, helpText: t.helpText, isRequired: t.isRequired, status: t.status, doneAt: iso(t.doneAt), doneBy: t.doneBy })), visits: o.installation.visits.map((v: any) => ({ ...v, windowStart: iso(v.windowStart), windowEnd: iso(v.windowEnd) })) } : null,
    invoices: o.invoices.map((i: any) => ({ ...i, issuedAt: iso(i.issuedAt), dueAt: iso(i.dueAt) })),
    systems: o.systems,
  }
}

export function planView(plan: any, graceDays: number, defaultAfterDays: number, now = new Date()) {
  const rows = plan.installments ?? []
  return {
    id: plan.id, status: planEffectiveStatus(plan, rows, now, graceDays, defaultAfterDays), kind: plan.kind, currencyCode: plan.currencyCode, totalAmount: plan.totalAmount, paidAmount: plan.paidAmount, planFeeAmount: plan.planFeeAmount, depositAmount: plan.depositAmount,
    balanceAmount: plan.totalAmount - plan.paidAmount, frequency: plan.frequency, nextDueAt: iso(plan.nextDueAt),
    installments: rows.map((r: any) => ({ id: r.id, sequence: r.sequence, label: r.label, amount: r.amount, paidAmount: r.paidAmount, dueDate: iso(r.dueDate), status: installmentEffectiveStatus(r, now, graceDays), trigger: r.trigger, paidAt: iso(r.paidAt) })),
  }
}

export async function visitView(tx: Tx, code: string) {
  const { visitByCode } = await import('./visits')
  const v = await visitByCode(tx, code)
  if (!v) return null
  return {
    code: v.publicCode, number: v.number, type: v.type, status: v.status, date: v.scheduledDate ? v.scheduledDate.toISOString().slice(0, 10) : null, slotIndex: v.slotIndex, windowStart: iso(v.windowStart), windowEnd: iso(v.windowEnd),
    technicians: v.technicians.map(t => t.name.split(' ')[0]), site: v.site, canChange: v.canChange, freeChangeUntil: iso(v.freeChangeUntil), cutoffHours: v.cutoffHours, feeAmount: v.feeAmount, feePaid: v.feePaid, cancelReason: v.cancelReason,
  }
}

export async function systemView(tx: Tx, where: { publicCode?: string; id?: string }, full = false) {
  const s = await tx.installedSystem.findUnique({
    where: where.publicCode ? { publicCode: where.publicCode } : { id: where.id! },
    include: { product: { select: { name: true, slug: true, id: true } }, serializedUnit: { select: { serialNumber: true } }, warranties: { orderBy: { component: 'asc' } }, subscriptions: { include: { plan: { select: { name: true, slug: true, visitsPerYear: true, partsDiscountPercent: true } } }, orderBy: { createdAt: 'desc' } }, site: { select: { label: true, city: true } }, tickets: full ? { orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, number: true, status: true, category: true, createdAt: true, resolvedAt: true } } : false, visits: full ? { where: { status: { in: ['scheduled', 'requested', 'completed'] } }, orderBy: { createdAt: 'desc' }, take: 10, select: { number: true, type: true, status: true, windowStart: true, dueAt: true, publicCode: true } } : false } as never,
  }) as any
  if (!s) return null
  const now = new Date()
  const base = { code: s.publicCode, number: s.number, status: s.status, model: s.product?.name ?? '', productSlug: s.product?.slug ?? '', commissionedAt: iso(s.commissionedAt), site: s.site }
  if (!full) return base
  return {
    ...base, id: s.id, serialNumber: s.serializedUnit?.serialNumber ?? null, installedAt: iso(s.installedAt), lastCheckedAt: iso(s.lastCheckedAt), nextCheckDueAt: iso(s.nextCheckDueAt),
    warranties: s.warranties.map((w: any) => ({ component: w.component, startsAt: iso(w.startsAt), endsAt: iso(w.endsAt), isVoid: w.isVoid, active: !w.isVoid && (!w.endsAt || w.endsAt > now) })),
    servicePlan: s.subscriptions.filter((x: any) => x.status !== 'cancelled').map((x: any) => ({ id: x.id, name: x.plan?.name ?? '', status: subscriptionEffectiveStatus(x, now), currentPeriodEnd: iso(x.currentPeriodEnd), visitsUsed: x.visitsUsed, visitsPerYear: x.plan?.visitsPerYear ?? 0 }))[0] ?? null,
    tickets: (s.tickets ?? []).map((t: any) => ({ ...t, status: ticketEffectiveStatus(t, now), createdAt: iso(t.createdAt), resolvedAt: iso(t.resolvedAt) })),
    visits: (s.visits ?? []).map((v: any) => ({ ...v, windowStart: iso(v.windowStart), dueAt: iso(v.dueAt) })),
  }
}

export async function ticketView(tx: Tx, id: string, customerId: string) {
  const t = await tx.serviceTicket.findFirst({ where: { id, customerId }, include: { events: { where: { isCustomerVisible: true }, orderBy: { createdAt: 'asc' } }, visits: { orderBy: { createdAt: 'desc' }, select: { number: true, type: true, status: true, windowStart: true, windowEnd: true, publicCode: true } }, quotes: { where: { status: { in: ['sent', 'viewed', 'accepted', 'declined', 'expired'] } }, orderBy: { createdAt: 'desc' }, include: { options: { include: { lines: true, planOffers: true }, orderBy: { sortOrder: 'asc' } }, order: { select: { publicCode: true, status: true } } } }, system: { select: { number: true, publicCode: true, product: { select: { name: true } } } } } })
  if (!t) return null
  const now = new Date()
  const sessions = await tx.paymentSession.findMany({ where: { ticketId: t.id, status: 'pending' }, select: { publicCode: true, amount: true, expiresAt: true, status: true } })
  return {
    id: t.id, number: t.number, status: ticketEffectiveStatus(t, now), category: t.category, severity: t.severity, description: t.description, createdAt: iso(t.createdAt), resolvedAt: iso(t.resolvedAt), resolution: t.resolution, warrantyDecision: t.warrantyDecision,
    system: t.system ? { number: t.system.number, code: t.system.publicCode, model: t.system.product?.name ?? '' } : null,
    events: t.events.map(e => ({ type: e.type, body: e.body, at: iso(e.createdAt) })),
    visits: t.visits.map(v => ({ ...v, windowStart: iso(v.windowStart), windowEnd: iso(v.windowEnd) })),
    repairQuote: t.quotes[0] ? quoteView({ ...t.quotes[0], customer: null, site: null }, now) : null,
    payLinks: sessions.filter(s => sessionEffectiveStatus(s, now) === 'pending').map(s => ({ code: s.publicCode, amount: s.amount, expiresAt: iso(s.expiresAt) })),
  }
}
