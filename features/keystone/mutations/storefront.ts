import { DomainError, Codes } from '../lib/errors'
import { requireCustomer, type Actor } from '../lib/actor'
import { keyHash } from '../lib/idempotency'
import { anyone, clientIp, op, run, tx, type Ctx } from './ctx'
import { sizeSystem } from '../services/sizing'
import { createLeadCore, parseLeadInput, matchArea } from '../services/leads'
import { openSlots, todayLocal } from '../services/scheduling'
import { bookSurveyForLead, cancelByCode, rescheduleByCode } from '../services/visits'
import { acceptQuote, declineQuote, viewQuote } from '../services/quotes'
import { addToCart, cartByToken, completeCart, newCart, priceCart, removeCartLine, setCartFulfilment, updateCartLine } from '../services/carts'
import { attachCardIntent, captureCard, providerCode, reconcileSession, submitOffline } from '../services/payments'
import { openTicket } from '../services/tickets'
import { setPrepTask } from '../services/systems'
import { installmentSession, subscribeToPlan } from '../services/backoffice'
import { orderView, planView, quoteView, sessionView, storefrontInfo, systemView, ticketView, visitView } from '../services/views'
import { getSettings } from '../services/settings'
import { sessionEffectiveStatus } from '../lib/time'
import { str } from '../services/util'
import * as stripe from '../../integrations/payment/stripe'

const graphql = String.raw

/**
 * Storefront operations (section 5.9 public and customer). Guests reach a record only by its
 * unguessable code; a signed-in customer reaches only rows linked to their own Customer. Money moves
 * take an idempotency key. Documented for the storefront in docs/storefront-operations.md.
 */
export const storefrontTypeDefs = graphql`
  type Query {
    storefrontInfo: JSON
    availableVisitSlots(from: String, days: Int, postcode: String, region: String, country: String): JSON
    checkServiceArea(postcode: String, region: String, country: String): JSON
    getQuoteByCode(code: String!): JSON
    getOrderByCode(code: String!): JSON
    getVisitByCode(code: String!): JSON
    getSystemByCode(code: String!): JSON
    getPaymentSession(code: String!): JSON
    activeCart: JSON
    myOverview: JSON
    myOrders: JSON
    myOrder(id: ID!): JSON
    myPayments: JSON
    mySystems: JSON
    mySystem(id: ID!): JSON
    myTickets: JSON
    myTicket(id: ID!): JSON
    myProfile: JSON
  }
  type Mutation {
    sizeSystem(input: JSON!): JSON
    submitQuoteRequest(input: JSON!, idempotencyKey: String!): JSON
    bookSurveyVisit(leadCode: String!, date: String!, slotIndex: Int!, idempotencyKey: String!): JSON
    acceptQuote(code: String!, optionId: ID!, planOfferId: ID, signedName: String!, idempotencyKey: String!): JSON
    declineQuote(code: String!, reason: String, idempotencyKey: String!): JSON
    addToCart(productId: ID!, quantity: Int!): JSON
    updateCartLine(lineId: ID!, quantity: Int!): JSON
    removeCartLine(lineId: ID!): JSON
    setCartFulfilment(input: JSON!): JSON
    completeCart(idempotencyKey: String!): JSON
    initiatePaymentSession(code: String!, provider: String!, email: String): JSON
    completePaymentSession(code: String!): JSON
    submitOfflinePayment(code: String!, provider: String!, reference: String!, payerPhone: String, idempotencyKey: String!): JSON
    rescheduleVisitByCode(code: String!, date: String!, slotIndex: Int!, idempotencyKey: String!): JSON
    cancelVisitByCode(code: String!, reason: String, idempotencyKey: String!): JSON
    createTicket(input: JSON!, idempotencyKey: String!): JSON
    completeSitePrepTask(taskId: ID!, done: Boolean!, note: String, idempotencyKey: String!): JSON
    acceptServiceQuote(code: String!, optionId: ID!, signedName: String!, idempotencyKey: String!): JSON
    payInstallment(planId: ID!, installmentIds: [ID!], payoff: Boolean, idempotencyKey: String!): JSON
    subscribeToPlan(planId: ID!, systemId: ID!, idempotencyKey: String!): JSON
    updateMyProfile(input: JSON!): JSON
  }
`

const CART_COOKIE = 'biogas_cart'
type Res = { setHeader?: (k: string, v: string | string[]) => void; getHeader?: (k: string) => unknown }

function cookie(context: Ctx, name: string) {
  const raw = context.req?.headers?.cookie
  const header = Array.isArray(raw) ? raw.join(';') : raw ?? ''
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return null
}

function setCookie(context: Ctx, name: string, value: string, maxAge: number) {
  const res = (context as unknown as { res?: Res }).res
  if (!res?.setHeader) return
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  const prev = res.getHeader?.('Set-Cookie')
  const list = Array.isArray(prev) ? prev.map(String) : prev ? [String(prev)] : []
  res.setHeader('Set-Cookie', [...list, `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`])
}

/** Header token (x-cart-token) for server-rendered storefront calls, else the cookie. */
const cartToken = (context: Ctx) => {
  const h = context.req?.headers?.['x-cart-token']
  return (Array.isArray(h) ? h[0] : h) || cookie(context, CART_COOKIE)
}

async function ensureCart(context: Ctx, actor: Actor) {
  const existing = await cartByToken(context.prisma, cartToken(context))
  if (existing) return { id: existing.id, token: null as string | null }
  const created = await newCart(context.prisma, actor)
  setCookie(context, CART_COOKIE, created.token, 30 * 86400)
  return { id: created.cartId, token: created.token }
}

const guest = (context: Ctx, key: string) => anyone(context, key)
const customerId = (context: Ctx) => {
  try {
    return requireCustomer(anyone(context, 'me'))
  } catch {
    throw new DomainError(Codes.NOT_AUTHORIZED, 'Sign in with your customer account.')
  }
}

export const storefrontResolvers = {
  Query: {
    storefrontInfo: op(async (_r, _a, c) => storefrontInfo(c.prisma)),
    availableVisitSlots: op(async (_r, a: { from?: string; days?: number; postcode?: string; region?: string; country?: string }, c) => {
      const today = await todayLocal(c.prisma)
      const from = a.from && a.from > today ? a.from : today
      const area = a.postcode || a.region ? await matchArea(c.prisma, a) : null
      if ((a.postcode || a.region) && !area) return { served: false, slots: [] }
      const slots = await openSlots(c.prisma, { from, days: Math.min(a.days ?? 14, 14), branchId: area?.branchId ?? null })
      // The customer sees times, never which technician.
      return { served: true, slots: slots.map(({ technicianIds, ...s }) => ({ ...s, free: technicianIds.length })) }
    }),
    checkServiceArea: op(async (_r, a: { postcode?: string; region?: string; country?: string }, c) => {
      const area = await matchArea(c.prisma, a)
      return area ? { served: true, area: { name: area.name, deliveryFeeAmount: area.deliveryFeeAmount, installSurchargeAmount: area.installSurchargeAmount, branch: area.branch?.name ?? null } } : { served: false, area: null }
    }),
    getQuoteByCode: op(async (_r, a: { code: string }, c) => {
      const q = await tx(c, uow => viewQuote(uow, str(a.code, 40)))
      return q ? quoteView(q) : null
    }),
    getOrderByCode: op(async (_r, a: { code: string }, c) => orderView(c.prisma, { publicCode: str(a.code, 40) })),
    getVisitByCode: op(async (_r, a: { code: string }, c) => visitView(c.prisma, str(a.code, 40))),
    getSystemByCode: op(async (_r, a: { code: string }, c) => systemView(c.prisma, { publicCode: str(a.code, 40) })),
    getPaymentSession: op(async (_r, a: { code: string }, c) => sessionView(c.prisma, str(a.code, 40))),
    activeCart: op(async (_r, _a, c) => {
      const cart = await cartByToken(c.prisma, cartToken(c))
      return cart ? priceCart(c.prisma, cart.id) : null
    }),
    myOverview: op(async (_r, _a, c) => myOverview(c, customerId(c))),
    myOrders: op(async (_r, _a, c) => {
      const id = customerId(c)
      const [orders, quotes] = await Promise.all([
        c.prisma.order.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' }, select: { id: true, number: true, publicCode: true, status: true, totalAmount: true, paidAmount: true, refundedAmount: true, currencyCode: true, createdAt: true, fulfilment: true } }),
        c.prisma.quote.findMany({ where: { customerId: id, status: { notIn: ['draft', 'pending_approval', 'approved', 'cancelled'] } }, orderBy: { createdAt: 'desc' }, select: { number: true, version: true, publicCode: true, status: true, validUntil: true, totalAmount: true, currencyCode: true, kind: true, createdAt: true } }),
      ])
      const { quoteEffectiveStatus } = await import('../lib/time')
      return { orders: orders.map(o => ({ ...o, code: o.publicCode, balanceAmount: o.totalAmount - (o.paidAmount - o.refundedAmount) })), quotes: quotes.map(q => ({ ...q, code: q.publicCode, status: quoteEffectiveStatus(q, new Date()) })) }
    }),
    myOrder: op(async (_r, a: { id: string }, c) => {
      const id = customerId(c)
      const owned = await c.prisma.order.count({ where: { id: a.id, customerId: id } })
      return owned ? orderView(c.prisma, { id: a.id }) : null
    }),
    myPayments: op(async (_r, _a, c) => {
      const id = customerId(c)
      const settings = await getSettings(c.prisma)
      const [plans, payments, customer] = await Promise.all([
        c.prisma.paymentPlan.findMany({ where: { customerId: id, status: { not: 'cancelled' } }, include: { installments: { orderBy: { sequence: 'asc' } }, order: { select: { number: true, publicCode: true } } }, orderBy: { createdAt: 'desc' } }),
        c.prisma.payment.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' }, take: 100, select: { status: true, method: true, amount: true, currencyCode: true, reference: true, receiptNumber: true, refundedAmount: true, createdAt: true, order: { select: { number: true } } } }),
        c.prisma.customer.findUnique({ where: { id }, select: { storeCreditAmount: true, currencyCode: true } }),
      ])
      return { storeCreditAmount: customer?.storeCreditAmount ?? 0, plans: plans.map(p => ({ ...planView(p, settings.instalmentGraceDays, settings.defaultAfterDays), order: p.order ? { number: p.order.number, code: p.order.publicCode } : null })), payments }
    }),
    mySystems: op(async (_r, _a, c) => {
      const id = customerId(c)
      const rows = await c.prisma.installedSystem.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' }, select: { id: true } })
      return Promise.all(rows.map(r => systemView(c.prisma, { id: r.id }, true)))
    }),
    mySystem: op(async (_r, a: { id: string }, c) => {
      const id = customerId(c)
      const owned = await c.prisma.installedSystem.count({ where: { id: a.id, customerId: id } })
      if (!owned) return null
      const view = await systemView(c.prisma, { id: a.id }, true)
      const plans = await c.prisma.servicePlan.findMany({ where: { isPublished: true }, orderBy: { priceAmount: 'asc' }, select: { id: true, name: true, slug: true, priceAmount: true, currencyCode: true, billing: true, visitsPerYear: true, partsDiscountPercent: true, priorityResponse: true, includedItems: true, description: true } })
      return { ...view, availablePlans: plans.map(p => ({ ...p, partsDiscountPercent: String(p.partsDiscountPercent) })) }
    }),
    myTickets: op(async (_r, _a, c) => {
      const id = customerId(c)
      const { ticketEffectiveStatus } = await import('../lib/time')
      const rows = await c.prisma.serviceTicket.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' }, select: { id: true, number: true, status: true, category: true, createdAt: true, resolvedAt: true, system: { select: { number: true } }, visits: { where: { status: { in: ['scheduled', 'rescheduled'] } }, select: { windowStart: true }, take: 1 } } })
      return rows.map(t => ({ ...t, status: ticketEffectiveStatus(t, new Date()), nextVisitAt: t.visits[0]?.windowStart ?? null }))
    }),
    myTicket: op(async (_r, a: { id: string }, c) => ticketView(c.prisma, a.id, customerId(c))),
    myProfile: op(async (_r, _a, c) => {
      const id = customerId(c)
      const cu = await c.prisma.customer.findUnique({ where: { id }, select: { name: true, organisationName: true, type: true, phone: true, altPhone: true, email: true, preferredLanguage: true, preferredContact: true, contactConsent: true, referralCode: true, storeCreditAmount: true, currencyCode: true, number: true } })
      return cu
    }),
  },
  Mutation: {
    sizeSystem: op(async (_r, a: { input: unknown }, c) => sizeSystem(c.prisma, a.input)),
    submitQuoteRequest: op(async (_r, a: { input: any; idempotencyKey: string }, c) => {
      const actor = guest(c, `quote-request:${a.idempotencyKey}`)
      const input = parseLeadInput(a.input, 'website')
      return run(c, 'submitQuoteRequest', actor, a, async uow => {
        const { lead, area } = await createLeadCore(uow, actor, { ...input, assignedToId: null, referrerCustomerId: null })
        // A lead code lets the visitor book the survey on the next screen without an account.
        const leadCode = `${lead.id}.${keyHash(`lead:${lead.id}:${process.env.SESSION_SECRET ?? ''}`).slice(0, 24)}`
        let survey = null
        const wanted = a.input?.survey as { date?: string; slotIndex?: number } | undefined
        if (area && wanted?.date && Number.isInteger(wanted.slotIndex)) survey = await bookSurveyForLead(uow, actor, { leadId: lead.id, date: wanted.date, slotIndex: wanted.slotIndex! })
        return { leadNumber: lead.number, leadCode, served: Boolean(area), areaName: area?.name ?? null, survey }
      })
    }),
    bookSurveyVisit: op(async (_r, a: { leadCode: string; date: string; slotIndex: number; idempotencyKey: string }, c) => {
      const [leadId, mac] = str(a.leadCode, 120).split('.')
      if (!leadId || mac !== keyHash(`lead:${leadId}:${process.env.SESSION_SECRET ?? ''}`).slice(0, 24)) throw new DomainError(Codes.NOT_FOUND, 'Request not found.')
      const actor = guest(c, `lead:${leadId}`)
      return run(c, 'bookSurveyVisit', actor, a, uow => bookSurveyForLead(uow, actor, { leadId, date: a.date, slotIndex: a.slotIndex }))
    }),
    acceptQuote: op(async (_r, a: { code: string; optionId: string; planOfferId?: string | null; signedName: string; idempotencyKey: string }, c) => {
      const actor = guest(c, `quote:${a.code}`)
      return run(c, 'acceptQuote', actor, a, uow => acceptQuote(uow, actor, { ...a, ip: clientIp(c), keyHash: keyHash(`accept:${a.code}`) }))
    }),
    declineQuote: op(async (_r, a: { code: string; reason?: string; idempotencyKey: string }, c) => {
      const actor = guest(c, `quote:${a.code}`)
      return run(c, 'declineQuote', actor, a, async uow => {
        const q = await declineQuote(uow, actor, a)
        return { status: (q as any).status }
      })
    }),
    addToCart: op(async (_r, a: { productId: string; quantity: number }, c) => {
      const actor = guest(c, 'cart')
      const cart = await ensureCart(c, actor)
      await addToCart(c.prisma, cart.id, a.productId, a.quantity)
      return { ...(await priceCart(c.prisma, cart.id)), cartToken: cart.token }
    }),
    updateCartLine: op(async (_r, a: { lineId: string; quantity: number }, c) => {
      const cart = await cartByToken(c.prisma, cartToken(c))
      if (!cart) throw new DomainError(Codes.NOT_FOUND, 'Your cart is empty.')
      await updateCartLine(c.prisma, cart.id, a.lineId, a.quantity)
      return priceCart(c.prisma, cart.id)
    }),
    removeCartLine: op(async (_r, a: { lineId: string }, c) => {
      const cart = await cartByToken(c.prisma, cartToken(c))
      if (!cart) throw new DomainError(Codes.NOT_FOUND, 'Your cart is empty.')
      await removeCartLine(c.prisma, cart.id, a.lineId)
      return priceCart(c.prisma, cart.id)
    }),
    setCartFulfilment: op(async (_r, a: { input: any }, c) => {
      const cart = await cartByToken(c.prisma, cartToken(c))
      if (!cart) throw new DomainError(Codes.NOT_FOUND, 'Your cart is empty.')
      await setCartFulfilment(c.prisma, cart.id, a.input ?? {})
      return priceCart(c.prisma, cart.id)
    }),
    completeCart: op(async (_r, a: { idempotencyKey: string }, c) => {
      const cart = await cartByToken(c.prisma, cartToken(c))
      const actor = guest(c, `cart:${cart?.id ?? 'none'}`)
      return run(c, 'completeCart', actor, a, async uow => {
        if (!cart) {
          // A replay after the cart converted is answered from the receipt before this runs.
          throw new DomainError(Codes.NOT_FOUND, 'Your cart is empty.')
        }
        return completeCart(uow, actor, cart.id, keyHash(`cart:${a.idempotencyKey}`))
      })
    }),
    initiatePaymentSession: op(async (_r, a: { code: string; provider: string; email?: string }, c) => {
      const code = providerCode(a.provider)
      const s = await c.prisma.paymentSession.findUnique({ where: { publicCode: str(a.code, 40) } })
      if (!s) throw new DomainError(Codes.NOT_FOUND, 'Payment link not found.')
      if (sessionEffectiveStatus(s, new Date()) !== 'pending') throw new DomainError(Codes.INVALID_TRANSITION, s.status === 'pending' ? 'This payment link has expired. Ask us for a new one.' : 'This is already paid.', { currentStatus: s.status })
      if (code === 'stripe') {
        const intent = await attachCardIntent(c.prisma, s.id, a.email)
        return { provider: 'stripe', clientSecret: intent.clientSecret, publishableKey: intent.publishableKey, amount: s.amount, currencyCode: s.currencyCode }
      }
      const methods = (await sessionView(c.prisma, s.publicCode!))?.methods ?? []
      const m = methods.find(x => x.code === code)
      if (!m) throw new DomainError(Codes.PROVIDER_UNAVAILABLE, 'That payment method is not offered.')
      return { provider: code, instructions: m.instructions, amount: s.amount, currencyCode: s.currencyCode, reference: s.publicCode }
    }),
    completePaymentSession: op(async (_r, a: { code: string }, c) => {
      const s = await c.prisma.paymentSession.findUnique({ where: { publicCode: str(a.code, 40) } })
      if (!s) throw new DomainError(Codes.NOT_FOUND, 'Payment link not found.')
      if (s.providerRef) await reconcileSession(c.prisma, s.id).catch(e => (e instanceof DomainError && e.code === Codes.PROVIDER_ERROR ? null : Promise.reject(e)))
      return sessionView(c.prisma, s.publicCode!)
    }),
    submitOfflinePayment: op(async (_r, a: { code: string; provider: string; reference: string; payerPhone?: string; idempotencyKey: string }, c) => {
      const s = await c.prisma.paymentSession.findUnique({ where: { publicCode: str(a.code, 40) } })
      if (!s) throw new DomainError(Codes.NOT_FOUND, 'Payment link not found.')
      const actor = guest(c, `session:${s.publicCode}`)
      return run(c, 'submitOfflinePayment', actor, a, uow => submitOffline(uow, actor, { sessionId: s.id, code: providerCode(a.provider), reference: a.reference, payerPhone: a.payerPhone }))
    }),
    rescheduleVisitByCode: op(async (_r, a: { code: string; date: string; slotIndex: number; idempotencyKey: string }, c) => {
      const actor = guest(c, `visit:${a.code}`)
      return run(c, 'rescheduleVisitByCode', actor, a, async uow => {
        await rescheduleByCode(uow, actor, a)
        return visitView(uow.tx, a.code)
      })
    }),
    cancelVisitByCode: op(async (_r, a: { code: string; reason?: string; idempotencyKey: string }, c) => {
      const actor = guest(c, `visit:${a.code}`)
      return run(c, 'cancelVisitByCode', actor, a, async uow => {
        const out = await cancelByCode(uow, actor, a)
        return { status: out.status, feeKept: out.feeKept }
      })
    }),
    createTicket: op(async (_r, a: { input: any; idempotencyKey: string }, c) => {
      const i = a.input ?? {}
      const signedIn = (() => { try { return customerId(c) } catch { return null } })()
      let systemId: string | null = null
      if (i.systemCode) {
        const s = await c.prisma.installedSystem.findUnique({ where: { publicCode: str(i.systemCode, 40) } })
        if (!s) throw new DomainError(Codes.NOT_FOUND, 'We could not find a system with that code. Check the sticker, or call us.')
        systemId = s.id
      } else if (i.systemId && signedIn) {
        const s = await c.prisma.installedSystem.findFirst({ where: { id: str(i.systemId, 60), customerId: signedIn } })
        if (!s) throw new DomainError(Codes.NOT_FOUND, 'System not found.')
        systemId = s.id
      }
      if (!systemId && !signedIn) throw new DomainError(Codes.INVALID_INPUT, 'Sign in, or enter the code on your system’s sticker.')
      const actor = guest(c, `ticket:${systemId ?? signedIn}`)
      return run(c, 'createTicket', actor, a, async uow => {
        const t = await openTicket(uow, actor, { systemId, customerId: signedIn, channel: signedIn ? 'portal' : 'public_form', category: i.category, description: i.description, callbackPhone: i.callbackPhone, severity: i.severity, mediaIds: Array.isArray(i.mediaIds) ? i.mediaIds : [] })
        return { number: t.number, id: signedIn ? t.id : null, status: t.status, responseDueAt: t.responseDueAt }
      })
    }),
    completeSitePrepTask: op(async (_r, a: { taskId: string; done: boolean; note?: string; idempotencyKey: string }, c) => {
      customerId(c)
      const actor = anyone(c, 'me')
      return run(c, 'completeSitePrepTask', actor, a, async uow => {
        const t = await setPrepTask(uow, actor, { taskId: a.taskId, status: a.done ? 'done' : 'pending', note: a.note, by: 'customer' })
        return { id: t!.id, status: t!.status }
      })
    }),
    acceptServiceQuote: op(async (_r, a: { code: string; optionId: string; signedName: string; idempotencyKey: string }, c) => {
      const me = customerId(c)
      const q = await c.prisma.quote.findUnique({ where: { publicCode: str(a.code, 40) }, select: { customerId: true, kind: true } })
      if (!q || q.customerId !== me || q.kind !== 'service') throw new DomainError(Codes.NOT_FOUND, 'Quote not found.')
      const actor = anyone(c, 'me')
      return run(c, 'acceptServiceQuote', actor, a, uow => acceptQuote(uow, actor, { ...a, ip: clientIp(c) }))
    }),
    payInstallment: op(async (_r, a: { planId: string; installmentIds?: string[]; payoff?: boolean; idempotencyKey: string }, c) => {
      const me = customerId(c)
      const actor = anyone(c, 'me')
      return run(c, 'payInstallment', actor, a, uow => installmentSession(uow, actor, { planId: a.planId, installmentIds: a.installmentIds ?? undefined, payoff: Boolean(a.payoff), customerId: me }))
    }),
    subscribeToPlan: op(async (_r, a: { planId: string; systemId: string; idempotencyKey: string }, c) => {
      const me = customerId(c)
      const actor = anyone(c, 'me')
      return run(c, 'subscribeToPlan', actor, a, uow => subscribeToPlan(uow, actor, { planId: a.planId, systemId: a.systemId, customerId: me }))
    }),
    updateMyProfile: op(async (_r, a: { input: any }, c) => {
      const me = customerId(c)
      const i = a.input ?? {}
      const { normPhone } = await import('../services/util')
      const data: Record<string, unknown> = {}
      if (typeof i.name === 'string' && i.name.trim()) data.name = str(i.name, 200)
      if (typeof i.phone === 'string') data.phone = normPhone(i.phone)
      if (typeof i.altPhone === 'string') data.altPhone = normPhone(i.altPhone)
      if (typeof i.preferredLanguage === 'string') data.preferredLanguage = str(i.preferredLanguage, 10)
      if (['call', 'sms', 'whatsapp', 'email'].includes(i.preferredContact)) data.preferredContact = i.preferredContact
      if (typeof i.contactConsent === 'boolean') Object.assign(data, { contactConsent: i.contactConsent, consentAt: i.contactConsent ? new Date() : null })
      const cu = await c.prisma.customer.update({ where: { id: me }, data, select: { name: true, phone: true, altPhone: true, preferredLanguage: true, preferredContact: true, contactConsent: true } })
      if (data.name) await c.prisma.user.update({ where: { id: c.session!.itemId }, data: { name: data.name as string } })
      return cu
    }),
  },
}

async function myOverview(c: Ctx, id: string) {
  const settings = await getSettings(c.prisma)
  const now = new Date()
  const [customer, visits, plans, installations, quotes, systems, tickets] = await Promise.all([
    c.prisma.customer.findUnique({ where: { id }, select: { name: true, number: true, referralCode: true, storeCreditAmount: true, currencyCode: true } }),
    c.prisma.visit.findMany({ where: { customerId: id, status: { in: ['scheduled', 'rescheduled', 'en_route'] }, windowStart: { gte: new Date(now.getTime() - 12 * 3600_000) } }, orderBy: { windowStart: 'asc' }, take: 5, select: { number: true, type: true, status: true, windowStart: true, windowEnd: true, publicCode: true } }),
    c.prisma.paymentPlan.findMany({ where: { customerId: id, status: { in: ['active', 'in_arrears', 'defaulted', 'pending'] } }, include: { installments: { orderBy: { sequence: 'asc' } }, order: { select: { number: true, publicCode: true, id: true } } } }),
    c.prisma.installation.findMany({ where: { customerId: id, status: { notIn: ['commissioned', 'cancelled'] } }, include: { prepTasks: { where: { status: 'pending' }, orderBy: { sortOrder: 'asc' } }, order: { select: { id: true, number: true } } } }),
    c.prisma.quote.findMany({ where: { customerId: id, status: { in: ['sent', 'viewed'] }, isLatest: true }, select: { number: true, publicCode: true, validUntil: true, status: true, totalAmount: true, currencyCode: true } }),
    c.prisma.installedSystem.count({ where: { customerId: id } }),
    c.prisma.serviceTicket.count({ where: { customerId: id, status: { notIn: ['resolved', 'closed', 'cancelled', 'phone_resolved'] } } }),
  ])
  const due = plans.flatMap(p => planView(p, settings.instalmentGraceDays, settings.defaultAfterDays, now).installments.filter((i: any) => ['due', 'overdue', 'partially_paid'].includes(i.status) || (i.status === 'scheduled' && i.dueDate && new Date(i.dueDate).getTime() < now.getTime() + 14 * 86_400_000)).map((i: any) => ({ ...i, planId: p.id, order: p.order ? { number: p.order.number, id: p.order.id } : null })))
  const { quoteEffectiveStatus } = await import('../lib/time')
  return {
    customer,
    nextVisits: visits,
    paymentsDue: due,
    toGetReady: installations.map(i => ({ installationNumber: i.number, orderId: i.order?.id ?? null, orderNumber: i.order?.number ?? null, status: i.status, tasks: i.prepTasks.map(t => ({ id: t.id, prompt: t.prompt, helpText: t.helpText, isRequired: t.isRequired })) })),
    openQuotes: quotes.filter(q => quoteEffectiveStatus(q, now) !== 'expired').map(q => ({ ...q, code: q.publicCode })),
    systemCount: systems,
    openTicketCount: tickets,
  }
}

export { captureCard, stripe }
