/**
 * Dissertation §11 tests 5, 6, 8, 13, 14, 16 and 18: stock races, the Stripe webhook, instalment
 * allocation, the warranty decision, customer isolation, states derived from the clock, and the seed.
 * Real database (the `vitest` schema), real services and GraphQL operations; nothing is stubbed.
 */
import crypto from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// The scratch database is remote (about 0.1 s a query): whole sales take minutes, whatever the global config says.
vi.setConfig({ testTimeout: 900_000, hookTimeout: 900_000 })
import { hasTestDatabase, testPrisma } from '../helpers/db'
import { guest, onboardCompany, race, run } from '../helpers/company'
import { acceptFor, as, commissionedSystem, confirmedOrder, key, op, payByReference, reference, requestQuote, sendQuoteFor, staffIds } from '../helpers/flow'
import { addToCart, completeCart, newCart, setCartFulfilment } from '../../features/keystone/services/carts'
import { handleStripeWebhook } from '../../features/keystone/services/payments'
import { installmentEffectiveStatus, planEffectiveStatus, quoteEffectiveStatus, subscriptionEffectiveStatus, subscriptionGivesBenefits } from '../../features/keystone/lib/time'
import { coverFor } from '../../features/keystone/services/systems'

const prisma = hasTestDatabase ? testPrisma(8) : (null as never)
let ids: Awaited<ReturnType<typeof staffIds>>
const DAY = 86_400_000

describe.skipIf(!hasTestDatabase)('§11 money, care and isolation', () => {
  beforeAll(async () => {
    await onboardCompany(prisma)
    ids = await staffIds(prisma)
  }, 300_000)
  afterAll(async () => prisma?.$disconnect())

  it('5. two checkouts for the last unit: one wins, and reserved never passes on hand', async () => {
    const part = await prisma.product.findFirst({ where: { type: { not: 'digester_kit' }, sellOnline: true, isPublished: true, isSerialized: false }, orderBy: { priceAmount: 'asc' } })
    expect(part).toBeTruthy()
    // Exactly one unit left, at one location.
    const levels = await prisma.stockLevel.findMany({ where: { productId: part!.id } })
    for (const l of levels) await prisma.stockLevel.update({ where: { id: l.id }, data: { onHand: 0, reserved: 0 } })
    const location = await prisma.stockLocation.findFirst({ where: { isActive: true, type: { in: ['warehouse', 'branch'] } } })
    await prisma.stockLevel.upsert({ where: { productId_locationId: { productId: part!.id, locationId: location!.id } }, create: { productId: part!.id, locationId: location!.id, onHand: 1, reserved: 0 }, update: { onHand: 1, reserved: 0 } })
    const branch = await prisma.branch.findFirst({ where: { isActive: true } })

    // Two shoppers check out one unit each; both carts pass the availability check.
    const shopper = async (n: number) => {
      const actor = guest()
      const cart = await newCart(prisma as never, actor)
      await addToCart(prisma as never, cart.cartId, part!.id, 1)
      await setCartFulfilment(prisma as never, cart.cartId, { fulfilment: 'pickup', pickupBranchId: branch!.id, name: `Shopper ${n} Okonjo`, phone: `+1512555${String(1000 + n)}`, email: `shopper${n}.${Date.now()}@hillcountrymail.com` })
      return run(prisma, 'completeCart', actor, { n }, uow => completeCart(uow, actor, cart.cartId))
    }
    const orders = await Promise.all([shopper(1), shopper(2)])
    // Stock is reserved when the money is real: both pay, finance verifies both at once.
    const r = await race(orders.map(o => payByReference(o.sessionCode!, ids.finance)))
    expect(r.won).toBe(2)
    const confirmed = await prisma.order.findMany({ where: { id: { in: orders.map(o => o.orderId) } } })
    expect(confirmed.every(o => o.status === 'confirmed')).toBe(true)
    // The money is real for both; only one gets the unit, the other is flagged short for the storekeeper.
    expect(confirmed.filter(o => !o.stockShort)).toHaveLength(1)
    expect(confirmed.filter(o => o.stockShort)).toHaveLength(1)
    const after = await prisma.stockLevel.findMany({ where: { productId: part!.id } })
    for (const l of after) expect(l.reserved).toBeLessThanOrEqual(l.onHand)
    expect(after.reduce((s, l) => s + l.reserved, 0)).toBe(1)
    // A third shopper is told before paying.
    await expect(shopper(3)).rejects.toThrow(/OUT_OF_STOCK|left/)
  })

  describe('6. the Stripe webhook', () => {
    const secret = 'whsec_' + crypto.randomBytes(16).toString('hex')
    const sign = (body: string, s = secret) => {
      const t = Math.floor(Date.now() / 1000)
      return `t=${t},v1=${crypto.createHmac('sha256', s).update(`${t}.${body}`).digest('hex')}`
    }
    const deliver = (body: string, sig: string) => handleStripeWebhook(prisma as never, Buffer.from(body), sig)
    let sessionId = ''
    let amount = 0
    let currency = ''
    let intentId = ''
    const event = (over: Record<string, unknown> = {}, id = `evt_${crypto.randomBytes(8).toString('hex')}`) =>
      JSON.stringify({ id, type: 'payment_intent.succeeded', data: { object: { id: intentId, object: 'payment_intent', status: 'succeeded', amount, amount_received: amount, currency: currency.toLowerCase(), metadata: {}, ...over } } })

    beforeAll(async () => {
      process.env.STRIPE_WEBHOOK_SECRET = secret
      const lead = await requestQuote()
      const q = await sendQuoteFor(ids.sales, lead.leadId)
      const accepted = await acceptFor(q.code!, lead.who.name)
      const s = await prisma.paymentSession.findUnique({ where: { publicCode: accepted.sessionCode } })
      intentId = `pi_${crypto.randomBytes(10).toString('hex')}`
      const stripe = await prisma.paymentProvider.upsert({ where: { code: 'stripe' }, create: { code: 'stripe', name: 'Card', isOnline: true }, update: {} })
      // As initiatePaymentSession leaves it after creating the PaymentIntent with Stripe.
      await prisma.paymentSession.update({ where: { id: s!.id }, data: { providerRef: intentId, providerId: stripe.id } })
      sessionId = s!.id
      amount = s!.amount
      currency = s!.currencyCode
    })
    afterAll(() => { delete process.env.STRIPE_WEBHOOK_SECRET })

    const captured = () => prisma.payment.count({ where: { sessionId, status: 'captured' } })

    it('a wrong signature changes nothing', async () => {
      const body = event()
      expect((await deliver(body, sign(body, 'whsec_wrong'))).status).toBe(400)
      expect((await deliver(body, 't=1,v1=00')).status).toBe(400)
      expect(await captured()).toBe(0)
    })

    it('a wrong amount or currency changes nothing', async () => {
      for (const body of [event({ amount: amount + 100, amount_received: amount + 100 }), event({ currency: currency === 'USD' ? 'eur' : 'usd' })]) {
        const res = await deliver(body, sign(body))
        expect(res.status).toBe(200)
        const stored = await prisma.paymentWebhookEvent.findUnique({ where: { providerEventId: `stripe:${JSON.parse(body).id}` } })
        expect(stored?.status).toBe('mismatch')
      }
      expect(await captured()).toBe(0)
      expect((await prisma.paymentSession.findUnique({ where: { id: sessionId } }))?.status).toBe('pending')
    })

    it('the same event delivered twice, and a second event for the same intent, capture once', async () => {
      const id = `evt_${crypto.randomBytes(8).toString('hex')}`
      const body = event({}, id)
      const both = await Promise.all([deliver(body, sign(body)), deliver(body, sign(body))])
      expect(both.every(r => r.status === 200)).toBe(true)
      const again = event()
      await deliver(again, sign(again))
      expect(await captured()).toBe(1)
      const s = await prisma.paymentSession.findUnique({ where: { id: sessionId }, include: { order: true } })
      expect(s?.status).toBe('captured')
      expect(s?.order?.paidAmount).toBe(amount)
      expect(s?.order?.status).toBe('confirmed')
    })
  })

  describe('8. instalment allocation', () => {
    let order: Awaited<ReturnType<typeof confirmedOrder>>
    let planId = ''
    const rows = () => prisma.installment.findMany({ where: { planId }, orderBy: { sequence: 'asc' } })
    const open = async () => (await rows()).filter(r => !['paid', 'waived', 'cancelled'].includes(r.status))
    // A balance pay link for an exact amount, paid by reference and verified by finance.
    const pay = async (amount: number) => {
      const link = await op(await as(ids.finance), `mutation($i: JSON!, $k: String!) { createPayLink(input: $i, idempotencyKey: $k) }`, { k: key('link'), i: { orderId: order.orderId, amount } })
      return payByReference(link.code, ids.finance)
    }

    beforeAll(async () => {
      order = await confirmedOrder(ids, { plan: true })
      const o = await prisma.order.findUnique({ where: { id: order.orderId } })
      planId = o!.planId!
      expect(planId).toBeTruthy()
    })

    it('an exact payment pays the oldest open instalment', async () => {
      const [first] = await open()
      const paymentId = await pay(first.amount - first.paidAmount)
      const r = await prisma.installment.findUnique({ where: { id: first.id } })
      expect(r?.status).toBe('paid')
      const alloc = await prisma.paymentAllocation.findMany({ where: { paymentId, kind: 'installment' } })
      expect(alloc.map(a => a.installmentId)).toEqual([first.id])
    })

    it('a partial payment leaves the oldest partly paid', async () => {
      const [next] = await open()
      await pay(Math.floor((next.amount - next.paidAmount) / 3))
      const r = await prisma.installment.findUnique({ where: { id: next.id } })
      expect(r?.status).toBe('partially_paid')
      expect(r!.paidAmount).toBe(next.paidAmount + Math.floor((next.amount - next.paidAmount) / 3))
    })

    it('an over-payment runs across instalments, oldest first', async () => {
      const [a, b] = await open()
      const owedA = a.amount - a.paidAmount
      const extra = Math.floor(b.amount / 2)
      const paymentId = await pay(owedA + extra)
      expect((await prisma.installment.findUnique({ where: { id: a.id } }))?.status).toBe('paid')
      const rb = await prisma.installment.findUnique({ where: { id: b.id } })
      expect(rb?.paidAmount).toBe(b.paidAmount + extra)
      const alloc = await prisma.paymentAllocation.findMany({ where: { paymentId, kind: 'installment' } })
      expect(alloc.reduce((s, x) => s + x.amount, 0)).toBe(owedA + extra)
    })

    it('concurrent payments never over-allocate', async () => {
      const left = (await open()).reduce((s, r) => s + r.amount - r.paidAmount, 0)
      const linkFor = async (amount: number) => (await op(await as(ids.finance), `mutation($i: JSON!, $k: String!) { createPayLink(input: $i, idempotencyKey: $k) }`, { k: key('link'), i: { orderId: order.orderId, amount } })).code as string
      // Two links of 70% of what is left each: together they pass the balance.
      const share = Math.ceil(left * 0.7)
      const codes = [await linkFor(share), await linkFor(share)]
      const r = await race(codes.map(c => payByReference(c, ids.finance)))
      expect(r.won).toBe(2)
      const plan = await prisma.paymentPlan.findUnique({ where: { id: planId } })
      const all = await rows()
      const instAlloc = await prisma.paymentAllocation.aggregate({ where: { installment: { planId } }, _sum: { amount: true } })
      for (const i of all) expect(i.paidAmount).toBeLessThanOrEqual(i.amount)
      expect(plan!.paidAmount).toBeLessThanOrEqual(plan!.totalAmount)
      // The deposit is applied when the plan is made (no allocation row); every later payment allocates, and together they are exactly what the instalments show paid.
      const deposit = await prisma.payment.findUnique({ where: { id: order.depositPaymentId } })
      expect((instAlloc._sum.amount ?? 0) + deposit!.amount).toBe(all.reduce((s, i) => s + i.paidAmount, 0))
      expect(plan!.paidAmount).toBe(all.reduce((s, i) => s + i.paidAmount, 0))
      expect(['completed', 'settled_early']).toContain(plan!.status)
      // What did not fit is the customer's credit, not a second allocation.
      const o = await prisma.order.findUnique({ where: { id: order.orderId } })
      expect(o!.paidAmount).toBeLessThanOrEqual(o!.totalAmount)
      const customer = await prisma.customer.findUnique({ where: { id: o!.customerId! } })
      expect(customer!.storeCreditAmount).toBe(2 * share - left)
    })

    it('a payoff clears every open instalment at once', async () => {
      const other = await confirmedOrder(ids, { plan: true })
      const o = await prisma.order.findUnique({ where: { id: other.orderId } })
      const link = await op(await as(ids.finance), `mutation($p: ID!, $k: String!) { staffInstallmentLink(planId: $p, payoff: true, idempotencyKey: $k) }`, { p: o!.planId, k: key('payoff') })
      await payByReference(link.sessionCode, ids.finance)
      const plan = await prisma.paymentPlan.findUnique({ where: { id: o!.planId! }, include: { installments: true } })
      expect(['completed', 'settled_early']).toContain(plan!.status)
      expect(plan!.installments.every(i => ['paid', 'waived', 'cancelled'].includes(i.status))).toBe(true)
    })
  })

  describe('13. the warranty decision and paid repairs', () => {
    let sys: Awaited<ReturnType<typeof commissionedSystem>>
    const care = () => as(ids.care)
    const openTicket = async (category: string) => op(await care(), `mutation($i: JSON!, $k: String!) { staffCreateTicket(input: $i, idempotencyKey: $k) }`, { k: key('ticket'), i: { systemId: sys.system.id, category, description: 'Gas pressure drops by evening', callbackPhone: sys.who.phone } })
    const move = async (ticketId: string, action: string, extra: Record<string, unknown> = {}) => op(await care(), `mutation($i: JSON!, $k: String!) { transitionTicket(input: $i, idempotencyKey: $k) }`, { k: key(action), i: { ticketId, action, ...extra } })

    beforeAll(async () => {
      sys = await commissionedSystem(ids)
    })

    it('inside cover: covered is accepted', async () => {
      const t = await openTicket('leak')
      const out = await move(t.id, 'warranty', { warrantyDecision: 'covered', reason: 'Joint failed inside a year' })
      expect(out.warrantyDecision).toBe('covered')
    })

    it('outside cover: covered is refused, not covered is accepted', async () => {
      const systemId = sys.system.id
      const w = await prisma.warrantyCoverage.findFirst({ where: { systemId, component: 'appliances' } })
      expect(w).toBeTruthy()
      await prisma.warrantyCoverage.update({ where: { id: w!.id }, data: { endsAt: new Date(Date.now() - DAY) } })
      const t = await openTicket('stove_fault')
      await expect(move(t.id, 'warranty', { warrantyDecision: 'covered' })).rejects.toThrow(/GUARD_FAILED|Not under warranty/)
      expect((await move(t.id, 'warranty', { warrantyDecision: 'not_covered', reason: 'Stove warranty ended' })).warrantyDecision).toBe('not_covered')
    })

    it('voided cover: covered is refused', async () => {
      const systemId = sys.system.id
      const w = await prisma.warrantyCoverage.findFirst({ where: { systemId, component: 'reactor' } })
      const dispatcher = await as(ids.dispatcher)
      await op(dispatcher, `mutation($w: ID!, $r: String!, $k: String!) { voidWarranty(warrantyId: $w, reason: $r, idempotencyKey: $k) }`, { w: w!.id, r: 'Reactor moved by the owner', k: key('void') })
      const now = new Date()
      const fresh = await prisma.warrantyCoverage.findMany({ where: { systemId } })
      expect(coverFor(fresh, 'no_gas', now).covered).toBe(false)
      const t = await openTicket('no_gas')
      await expect(move(t.id, 'warranty', { warrantyDecision: 'covered' })).rejects.toThrow(/GUARD_FAILED|voided/)
    })

    it('paid work blocks at awaiting_customer_approval until the repair quote is accepted', async () => {
      const t = await openTicket('stove_fault')
      await move(t.id, 'triage')
      await move(t.id, 'warranty', { warrantyDecision: 'not_covered', reason: 'Outside cover' })
      const sales = await as(ids.manager ?? ids.sales)
      const stove = await prisma.product.findFirst({ where: { type: { not: 'digester_kit' } }, orderBy: { priceAmount: 'desc' } })
      const draft = await op(sales, `mutation($i: JSON!, $k: String!) { saveQuoteDraft(input: $i, idempotencyKey: $k) }`, { k: key('repair'), i: { ticketId: t.id, customerId: sys.customerId, kind: 'service', options: [{ label: 'Replace the burner', lines: [{ kind: 'product', productId: stove!.id, quantity: 1 }, { kind: 'labour', description: 'Fit and test', quantity: 1, unitAmount: 6000 }] }] } })
      await op(sales, `mutation($q: ID!, $k: String!) { sendQuote(quoteId: $q, idempotencyKey: $k) }`, { q: draft.id, k: key('send') })
      expect((await prisma.serviceTicket.findUnique({ where: { id: t.id } }))?.status).toBe('awaiting_customer_approval')
      await expect(move(t.id, 'start')).rejects.toThrow(/GUARD_FAILED|not accepted/)
      await expect(move(t.id, 'resolve', { reason: 'Burner replaced' })).rejects.toThrow(/INVALID_TRANSITION/)
      const quote = await prisma.quote.findUnique({ where: { id: draft.id }, include: { options: true } })
      await op(sales, `mutation($q: ID!, $o: ID!, $s: String!, $k: String!) { staffAcceptQuote(quoteId: $q, optionId: $o, signedName: $s, idempotencyKey: $k) }`, { q: quote!.id, o: quote!.options[0].id, s: sys.who.name, k: key('accept') })
      const after = await prisma.serviceTicket.findUnique({ where: { id: t.id } })
      const settings = await prisma.companySettings.findFirst()
      expect(after?.status).toBe(settings?.payBeforeServiceWork ? 'awaiting_customer_approval' : 'in_progress')
    })
  })

  describe('14. a customer sees only their own records', () => {
    let a: Awaited<ReturnType<typeof commissionedSystem>>
    let bCtx: any
    beforeAll(async () => {
      a = await commissionedSystem(ids, { plan: true })
      // B: a second customer with a login.
      const b = await requestQuote()
      const bUser = await prisma.user.create({ data: { name: b.who.name, email: b.who.email, password: 'x'.repeat(60), customer: { connect: { id: b.customerId } } } as never })
      bCtx = await as(bUser.id)
    })

    it('by id, every customer query returns nothing for another customer', async () => {
      const systemId = a.system.id
      const ticket = await op(await as(ids.care), `mutation($i: JSON!, $k: String!) { staffCreateTicket(input: $i, idempotencyKey: $k) }`, { k: key('t'), i: { systemId, category: 'other', description: 'Noise from the inlet' } })
      expect(await op(bCtx, `query($id: ID!) { myOrder(id: $id) }`, { id: a.orderId })).toBeNull()
      expect(await op(bCtx, `query($id: ID!) { mySystem(id: $id) }`, { id: systemId })).toBeNull()
      const otherTicket = await op(bCtx, `query($id: ID!) { myTicket(id: $id) }`, { id: ticket.id }).catch((error: Error) => {
        if (/NOT_FOUND/.test(error.message)) return null
        throw error
      })
      expect(otherTicket).toBeNull()
      const mine = await op(bCtx, `{ myOrders }`)
      expect(JSON.stringify(mine)).not.toContain(a.orderId)
      expect(JSON.stringify(await op(bCtx, `{ mySystems }`))).not.toContain(systemId)
      expect(JSON.stringify(await op(bCtx, `{ myTickets }`))).not.toContain(ticket.id)
      expect(JSON.stringify(await op(bCtx, `{ myPayments }`))).not.toContain(a.depositPaymentId)
    })

    it('list access: a customer reads no other customer rows through the generated API', async () => {
      const systemId = a.system.id
      const plan = await prisma.paymentPlan.findFirst({ where: { order: { id: a.orderId } } })
      const r = await bCtx.graphql.raw({ query: `query($q: ID!, $o: ID!, $s: ID!, $p: ID!) { quote(where: { id: $q }) { id } order(where: { id: $o }) { id } installedSystem(where: { id: $s }) { id } paymentPlan(where: { id: $p }) { id } quotes { id } orders { id } }`, variables: { q: a.quoteId, o: a.orderId, s: systemId, p: plan!.id } })
      const d = r.data ?? {}
      expect(d.quote ?? null).toBeNull()
      expect(d.order ?? null).toBeNull()
      expect(d.installedSystem ?? null).toBeNull()
      expect(d.paymentPlan ?? null).toBeNull()
      expect((d.quotes ?? []).map((x: any) => x.id)).not.toContain(a.quoteId)
      expect((d.orders ?? []).map((x: any) => x.id)).not.toContain(a.orderId)
    })

    it('a wrong public code returns nothing', async () => {
      const visitor = await as(null)
      for (const [q, code] of [['getQuoteByCode', 'Q-ZZZZ-ZZZZ-ZZZZ-ZZZZ'], ['getOrderByCode', 'O-ZZZZ-ZZZZ-ZZZZ-ZZZZ'], ['getSystemByCode', 'S-ZZZZ-ZZZZ-ZZZZ-ZZZZ'], ['getVisitByCode', 'V-ZZZZ-ZZZZ-ZZZZ-ZZZZ'], ['getPaymentSession', 'P-ZZZZ-ZZZZ-ZZZZ-ZZZZ']]) {
        const out = await op(visitor, `query($c: String!) { ${q}(code: $c) }`, { c: code }).catch((e: Error) => (/NOT_FOUND/.test(e.message) ? null : Promise.reject(e)))
        expect(out ?? null).toBeNull()
      }
      // The right code works, so the nulls above are not a broken query.
      const order = await prisma.order.findUnique({ where: { id: a.orderId } })
      expect((await op(visitor, `query($c: String!) { getOrderByCode(code: $c) }`, { c: order!.publicCode }))?.number).toBe(order!.number)
    })
  })

  describe('16. states derived from the clock', () => {
    it('a quote reads expired once its date passes and cannot be accepted', async () => {
      const lead = await requestQuote()
      const q = await sendQuoteFor(ids.sales, lead.leadId)
      const row = await prisma.quote.findUnique({ where: { id: q.quoteId } })
      const later = new Date(row!.validUntil!.getTime() + DAY)
      expect(quoteEffectiveStatus(row!, new Date())).toBe('sent')
      expect(quoteEffectiveStatus(row!, later)).toBe('expired')
      await prisma.quote.update({ where: { id: q.quoteId }, data: { validUntil: new Date(Date.now() - 1000) } })
      await expect(acceptFor(q.code!, lead.who.name)).rejects.toThrow(/EXPIRED/)
    })

    it('an instalment reads due, then overdue; the plan in arrears, then defaulted', async () => {
      const o = await confirmedOrder(ids, { plan: true })
      const order = await prisma.order.findUnique({ where: { id: o.orderId } })
      const plan = await prisma.paymentPlan.findUnique({ where: { id: order!.planId! }, include: { installments: { orderBy: { sequence: 'asc' } } } })
      const settings = await prisma.companySettings.findFirst()
      const grace = settings!.instalmentGraceDays
      const dflt = settings!.defaultAfterDays
      const next = plan!.installments.find(i => !['paid', 'waived', 'cancelled'].includes(i.status) && i.dueDate)!
      const due = next.dueDate!.getTime()
      expect(installmentEffectiveStatus(next, new Date(due - DAY), grace)).toBe('scheduled')
      expect(installmentEffectiveStatus(next, new Date(due + 1000), grace)).toBe('due')
      expect(installmentEffectiveStatus(next, new Date(due + (grace + 1) * DAY + 1000), grace)).toBe('overdue')
      expect(planEffectiveStatus(plan!, plan!.installments, new Date(due - DAY), grace, dflt)).toBe('active')
      expect(planEffectiveStatus(plan!, plan!.installments, new Date(due + (grace + 1) * DAY + 1000), grace, dflt)).toBe('in_arrears')
      expect(planEffectiveStatus(plan!, plan!.installments, new Date(due + (dflt + 1) * DAY), grace, dflt)).toBe('defaulted')
      // The dashboard and the customer read the same: move the due date back and read the order view.
      await prisma.installment.update({ where: { id: next.id }, data: { dueDate: new Date(Date.now() - (grace + 2) * DAY) } })
      const view = await op(await as(null), `query($c: String!) { getOrderByCode(code: $c) }`, { c: order!.publicCode })
      expect(view.plan.status).toBe('in_arrears')
      expect(view.plan.installments.find((i: any) => i.id === next.id).status).toBe('overdue')
    })

    it('a service plan reads grace, then lapsed, and then gives no parts discount', async () => {
      const s = await commissionedSystem(ids)
      const systemId = s.system.id
      const plan = await prisma.servicePlan.findFirst({ where: { partsDiscountPercent: { gt: 0 } } }) ?? await prisma.servicePlan.findFirst()
      const sub = await op(await as(ids.care), `mutation($p: ID!, $s: ID!, $k: String!) { staffSubscribeToPlan(planId: $p, systemId: $s, idempotencyKey: $k) }`, { p: plan!.id, s: systemId, k: key('sub') })
      await payByReference(sub.sessionCode, ids.finance)
      const row = await prisma.servicePlanSubscription.findUnique({ where: { id: sub.subscriptionId } })
      expect(row?.status).toBe('active')
      const end = row!.currentPeriodEnd!.getTime()
      expect(subscriptionEffectiveStatus(row!, new Date(end + DAY))).toBe('grace')
      expect(subscriptionEffectiveStatus(row!, new Date(end + 31 * DAY))).toBe('lapsed')
      expect(subscriptionGivesBenefits('grace')).toBe(false)
      expect(subscriptionGivesBenefits('lapsed')).toBe(false)
      // Lapsed in the database's clock: the cart prices parts at full price for this customer.
      const part = await prisma.product.findFirst({ where: { type: { not: 'digester_kit' }, sellOnline: true, isPublished: true }, orderBy: { priceAmount: 'desc' } })
      const priceFor = async () => {
        const cart = await newCart(prisma as never, { kind: 'user', userId: 'x', name: s.who.name, customerId: s.customerId, discountLimitPercent: 0, permissions: new Set() } as never)
        await addToCart(prisma as never, cart.cartId, part!.id, 1)
        const { priceCart } = await import('../../features/keystone/services/carts')
        return priceCart(prisma as never, cart.cartId)
      }
      const live = await priceFor()
      if (Number((plan as any).partsDiscountPercent ?? 0) > 0) expect(live.discountAmount).toBeGreaterThan(0)
      await prisma.servicePlanSubscription.update({ where: { id: row!.id }, data: { currentPeriodEnd: new Date(Date.now() - 31 * DAY) } })
      const lapsed = await priceFor()
      expect(lapsed.discountAmount).toBe(0)
    })

    it('follow-up tasks are created once at commissioning; commissioning twice does not duplicate them', async () => {
      const s = await commissionedSystem(ids)
      const systemId = s.system.id
      const before = await prisma.visit.count({ where: { systemId, type: 'follow_up' } })
      expect(before).toBeGreaterThan(0)
      const { commission, commissionInput } = await import('../helpers/flow')
      await expect(commission(ids.techs[0], await commissionInput(ids.techs[0], s.visitId, s.who.name))).rejects.toThrow(/INVALID_TRANSITION|GUARD_FAILED|already/)
      expect(await prisma.visit.count({ where: { systemId, type: 'follow_up' } })).toBe(before)
      expect(await prisma.installedSystem.count({ where: { installation: { id: s.installationId } } })).toBe(1)
    })
  })

  describe('18. the seed', () => {
    it('runs twice without duplicates and has none of the banned words', async () => {
      const { seedActivity } = await import('../../features/keystone/services/activity')
      const { onboardCompany: again } = await import('../helpers/company')
      const count = async () => {
        const out: Record<string, number> = {}
        for (const m of ['product', 'role', 'user', 'branch', 'serviceArea', 'paymentPlanTemplate', 'servicePlan', 'checklistTemplate', 'troubleshootingGuide', 'lead', 'customer', 'order']) out[m] = await (prisma as any)[m].count()
        return out
      }
      await again(prisma)
      await seedActivity(prisma as never, 'US')
      const first = await count()
      await again(prisma, { reset: false })
      await seedActivity(prisma as never, 'US')
      expect(await count()).toEqual(first)
      expect(first.lead).toBeGreaterThan(0)

      // Every text column of every table, read through the database.
      const columns = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
        SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND data_type IN ('text', 'character varying', 'jsonb') AND table_name NOT LIKE '\\_%'`
      const banned = /\b(demo|sample|test|mock|sandbox)\b/i
      const hits: string[] = []
      for (const c of columns) {
        const rows = await prisma.$queryRawUnsafe<{ v: string }[]>(`SELECT "${c.column_name}"::text AS v FROM "${c.table_name}" WHERE "${c.column_name}"::text ~* '\\m(demo|sample|test|mock|sandbox)\\M' LIMIT 3`)
        for (const r of rows) if (banned.test(r.v)) hits.push(`${c.table_name}.${c.column_name}: ${r.v.slice(0, 80)}`)
      }
      expect(hits).toEqual([])
    })
  })
})

void reference
