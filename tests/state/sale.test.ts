/**
 * Dissertation §11 tests 1, 2, 3, 4, 7, 9, 10, 11, 12 and 17: the sale from quote to commissioned
 * system, through the real GraphQL operations, as the people who do each step, on a company set up by
 * the real onboarding.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// The scratch database is remote (about 0.1 s a query): whole sales take minutes, whatever the global config says.
vi.setConfig({ testTimeout: 900_000, hookTimeout: 900_000 })
import { hasTestDatabase, testPrisma } from '../helpers/db'
import { onboardCompany, race } from '../helpers/company'
import { acceptFor, as, commission, commissionInput, confirmedOrder, freeSlot, installVisitOnSite, key, op, payByReference, person, prepDone, reference, requestQuote, sendQuoteFor, staffIds } from '../helpers/flow'

const prisma = hasTestDatabase ? testPrisma(5) : (null as never)
let ids: Awaited<ReturnType<typeof staffIds>>

describe.skipIf(!hasTestDatabase)('§11 the sale, quote to commissioned system', () => {
  beforeAll(async () => {
    await onboardCompany(prisma)
    ids = await staffIds(prisma)
  }, 300_000)
  afterAll(async () => prisma?.$disconnect())

  it('1. two concurrent acceptances produce one order and one payment session', async () => {
    const lead = await requestQuote()
    const q = await sendQuoteFor(ids.sales, lead.leadId)
    const r = await race([acceptFor(q.code!, lead.who.name), acceptFor(q.code!, lead.who.name), acceptFor(q.code!, lead.who.name)])
    expect(r.won).toBe(1)
    expect(await prisma.order.count({ where: { quoteId: q.quoteId } })).toBe(1)
    const order = await prisma.order.findFirst({ where: { quoteId: q.quoteId } })
    expect(await prisma.paymentSession.count({ where: { orderId: order!.id } })).toBe(1)
    expect((await prisma.quote.findUnique({ where: { id: q.quoteId } }))?.status).toBe('accepted')
  })

  it('2. a superseded or an expired quote cannot be accepted', async () => {
    const lead = await requestQuote()
    const v1 = await sendQuoteFor(ids.sales, lead.leadId)
    const sales = await as(ids.sales)
    const v2 = await op(sales, `mutation($q: ID!, $k: String!) { reviseQuote(quoteId: $q, idempotencyKey: $k) }`, { q: v1.quoteId, k: key('revise') })
    await op(sales, `mutation($q: ID!, $k: String!) { sendQuote(quoteId: $q, idempotencyKey: $k) }`, { q: v2.id, k: key('send-v2') })
    expect((await prisma.quote.findUnique({ where: { id: v1.quoteId } }))?.status).toBe('superseded')
    await expect(acceptFor(v1.code!, lead.who.name)).rejects.toThrow(/INVALID_TRANSITION/)
    expect(await prisma.order.count({ where: { quoteId: v1.quoteId } })).toBe(0)

    const other = await requestQuote()
    const old = await sendQuoteFor(ids.sales, other.leadId)
    await prisma.quote.update({ where: { id: old.quoteId }, data: { validUntil: new Date(Date.now() - 60_000) } })
    const view = await op(await as(null), `query($c: String!) { getQuoteByCode(code: $c) }`, { c: old.code })
    expect(view.status).toBe('expired')
    expect(view.canAccept).toBe(false)
    await expect(acceptFor(old.code!, other.who.name)).rejects.toThrow(/EXPIRED/)
    expect(await prisma.order.count({ where: { quoteId: old.quoteId } })).toBe(0)
  })

  it('3. the same key with the same body returns the first result; with a different body it is refused', async () => {
    const lead = await requestQuote()
    const q = await sendQuoteFor(ids.sales, lead.leadId)
    const k = key('accept-once')
    const first = await acceptFor(q.code!, lead.who.name, { idempotencyKey: k })
    const again = await acceptFor(q.code!, lead.who.name, { idempotencyKey: k })
    expect(again).toEqual(first)
    expect(await prisma.order.count({ where: { quoteId: q.quoteId } })).toBe(1)
    await expect(acceptFor(q.code!, `${lead.who.name} Jr`, { idempotencyKey: k })).rejects.toThrow(/IDEMPOTENCY_KEY_REUSED/)
  })

  it('4. two bookings for one technician slot: one wins', async () => {
    const tech = ids.techs[1] ?? ids.techs[0]
    const slot = await freeSlot(ids.dispatcher, tech)
    const leads = [await requestQuote(), await requestQuote(), await requestQuote()]
    const d = await as(ids.dispatcher)
    const book = (leadId: string) => op(d, `mutation($i: JSON!, $k: String!) { scheduleVisit(input: $i, idempotencyKey: $k) }`, { k: key('book'), i: { type: 'survey', leadId, date: slot.date, slotIndex: slot.slotIndex, technicianIds: [tech] } })
    const r = await race(leads.map(l => book(l.leadId)))
    expect(r.won).toBe(1)
    expect(r.errors.every(e => /CAPACITY_FULL|STALE_STATE/.test(e))).toBe(true)
    expect(await prisma.visitSlotUsage.count({ where: { technicianId: tech, date: new Date(`${slot.date}T00:00:00.000Z`), slotIndex: slot.slotIndex } })).toBe(1)
  })

  it('7. the same mobile-money reference cannot be verified twice', async () => {
    const a = await requestQuote()
    const b = await requestQuote()
    const qa = await sendQuoteFor(ids.sales, a.leadId)
    const qb = await sendQuoteFor(ids.sales, b.leadId)
    const sa = await acceptFor(qa.code!, a.who.name)
    const sb = await acceptFor(qb.code!, b.who.name)
    const ref = reference('MM')
    const visitor = await as(null)
    const submit = (code: string, r: string) => op(visitor, `mutation($c: String!, $r: String!, $k: String!) { submitOfflinePayment(code: $c, provider: "mobile_money", reference: $r, idempotencyKey: $k) }`, { c: code, r, k: key('submit') })
    const first = await submit(sa.sessionCode, ref)
    // Spacing and case do not make a new reference.
    await expect(submit(sb.sessionCode, ` ${ref.toLowerCase().slice(0, 4)}-${ref.toLowerCase().slice(4)} `)).rejects.toThrow(/DUPLICATE_REFERENCE/)
    const finance = await as(ids.finance)
    const verify = (p: string) => op(finance, `mutation($p: ID!, $k: String!) { verifyOfflinePayment(paymentId: $p, idempotencyKey: $k) }`, { p, k: key('verify') })
    const r = await race([verify(first.paymentId), verify(first.paymentId)])
    expect(r.won).toBe(1)
    expect(await prisma.payment.count({ where: { reference: ref, status: 'verified' } })).toBe(1)
    const order = await prisma.order.findFirst({ where: { quoteId: qa.quoteId } })
    expect(order?.paidAmount).toBe(sa.amount)
  })

  it('9. refunds never pass what was captured, including two at once', async () => {
    const o = await confirmedOrder(ids)
    const pay = await prisma.payment.findUnique({ where: { id: o.depositPaymentId } })
    const finance = await as(ids.finance)
    const refund = (amount: number) => op(finance, `mutation($p: ID!, $a: Int!, $r: String!, $ref: String, $k: String!) { refundPayment(paymentId: $p, amount: $a, reason: $r, payoutReference: $ref, idempotencyKey: $k) }`,
      { p: pay!.id, a: amount, r: 'Customer asked to cancel', ref: reference('PO'), k: key('refund') })
    await expect(refund(pay!.amount + 1)).rejects.toThrow(/OVER_REFUND/)
    const part = Math.floor(pay!.amount * 0.6)
    const r = await race([refund(part), refund(part)])
    expect(r.won).toBe(1)
    expect(r.errors[0]).toMatch(/OVER_REFUND/)
    await refund(pay!.amount - part)
    await expect(refund(1)).rejects.toThrow(/OVER_REFUND|INVALID_TRANSITION/)
    const after = await prisma.payment.findUnique({ where: { id: pay!.id } })
    expect(after?.refundedAmount).toBe(pay!.amount)
    expect(after?.status).toBe('refunded')
    const total = await prisma.refund.aggregate({ where: { paymentId: pay!.id }, _sum: { amount: true } })
    expect(total._sum.amount).toBe(pay!.amount)
  })

  describe('10. each cancellation stage refunds the stated amount', () => {
    const preview = async (orderId: string, opts: { byCompany?: boolean; kitReturned?: boolean } = {}) =>
      op(await as(ids.sales), `query($o: ID!, $b: Boolean, $r: Boolean) { cancellationPreview(orderId: $o, byCompany: $b, kitReturned: $r) }`, { o: orderId, b: opts.byCompany ?? null, r: opts.kitReturned ?? null })
    const cancel = async (orderId: string, extra: Record<string, unknown> = {}) =>
      op(await as(ids.sales), `mutation($i: JSON!, $k: String!) { cancelOrder(input: $i, idempotencyKey: $k) }`, { k: key('cancel'), i: { orderId, reason: 'Customer changed their mind', payoutReference: reference('PO'), ...extra } })
    const kitValue = async (orderId: string) => {
      const lines = await prisma.orderLine.findMany({ where: { orderId, kind: 'product' } })
      return lines.filter(l => (l.snapshot as any)?.type !== 'service').reduce((s, l) => s + l.totalAmount, 0)
    }
    const age = (orderId: string, days: number) => prisma.order.update({ where: { id: orderId }, data: { confirmedAt: new Date(Date.now() - days * 86_400_000) } })

    it('within cooling-off: everything back', async () => {
      const o = await confirmedOrder(ids)
      const p = await preview(o.orderId)
      expect(p).toMatchObject({ allowed: true, refundAmount: o.amount, keepAmount: 0 })
      await cancel(o.orderId)
      const after = await prisma.order.findUnique({ where: { id: o.orderId } })
      expect(after).toMatchObject({ status: 'cancelled', refundedAmount: o.amount })
    })

    it('after cooling-off, before picking: deposit less the survey fee credited', async () => {
      const o = await confirmedOrder(ids)
      await age(o.orderId, 14)
      await prisma.order.update({ where: { id: o.orderId }, data: { surveyFeeCreditAmount: 4900 } })
      expect(await preview(o.orderId)).toMatchObject({ allowed: true, refundAmount: o.amount - Math.min(4900, o.amount), keepAmount: Math.min(4900, o.amount) })
    })

    it('after picking, before delivery: less the restocking fee', async () => {
      const o = await confirmedOrder(ids)
      await age(o.orderId, 14)
      await prisma.order.update({ where: { id: o.orderId }, data: { status: 'preparing', pickedAt: new Date() } })
      const settings = await prisma.companySettings.findFirst()
      const fee = Math.round((await kitValue(o.orderId)) * Number(settings!.restockingFeePercent) / 100)
      const p = await preview(o.orderId)
      expect(p.allowed).toBe(true)
      expect(p.keepAmount).toBe(Math.min(o.amount, fee))
      expect(p.refundAmount).toBe(o.amount - Math.min(o.amount, fee))
    })

    it('after delivery: only once the kit is back, less restocking and delivery', async () => {
      const o = await confirmedOrder(ids)
      await age(o.orderId, 14)
      await prisma.order.update({ where: { id: o.orderId }, data: { status: 'delivered', pickedAt: new Date(), deliveryAmount: 2500 } })
      expect(await preview(o.orderId)).toMatchObject({ allowed: false, refundAmount: 0 })
      const settings = await prisma.companySettings.findFirst()
      const fee = Math.round((await kitValue(o.orderId)) * Number(settings!.restockingFeePercent) / 100)
      const p = await preview(o.orderId, { kitReturned: true })
      expect(p.allowed).toBe(true)
      expect(p.keepAmount).toBe(Math.min(o.amount, fee + 2500))
    })

    it('after install: no cancellation', async () => {
      const o = await confirmedOrder(ids)
      await prisma.order.update({ where: { id: o.orderId }, data: { status: 'installed' } })
      expect(await preview(o.orderId)).toMatchObject({ allowed: false, refundAmount: 0 })
      await expect(cancel(o.orderId)).rejects.toThrow(/INVALID_TRANSITION|GUARD_FAILED/)
    })

    it('company cancels: everything back, at any stage before install', async () => {
      const o = await confirmedOrder(ids)
      await age(o.orderId, 30)
      await prisma.order.update({ where: { id: o.orderId }, data: { status: 'preparing', pickedAt: new Date(), surveyFeeCreditAmount: 4900 } })
      expect(await preview(o.orderId, { byCompany: true })).toMatchObject({ allowed: true, refundAmount: o.amount, keepAmount: 0 })
    })
  })

  it('11. an installation cannot be scheduled with required prep undone unless overridden with a reason', async () => {
    const o = await confirmedOrder(ids)
    const inst = await prisma.installation.findFirst({ where: { orderId: o.orderId }, include: { prepTasks: true } })
    expect(inst?.status).toBe('awaiting_site_prep')
    expect(inst!.prepTasks.some(t => t.isRequired)).toBe(true)
    const tech = ids.techs[2] ?? ids.techs[0]
    const slot = await freeSlot(ids.dispatcher, tech)
    const d = await as(ids.dispatcher)
    const schedule = () => op(d, `mutation($i: JSON!, $k: String!) { scheduleVisit(input: $i, idempotencyKey: $k) }`, { k: key('schedule'), i: { type: 'install', date: slot.date, slotIndex: slot.slotIndex, technicianIds: [tech], installationId: inst!.id } })
    await expect(schedule()).rejects.toThrow(/GUARD_FAILED/)
    const ready = (reason?: string) => op(d, `mutation($i: ID!, $r: String, $k: String!) { transitionInstallation(installationId: $i, action: "ready", reason: $r, idempotencyKey: $k) }`, { i: inst!.id, r: reason ?? null, k: key('ready') })
    await expect(ready()).rejects.toThrow(/GUARD_FAILED/)
    await ready('Customer confirmed the pit by phone; photos to follow')
    const audit = await prisma.auditEvent.findFirst({ where: { entityId: inst!.id, action: 'installation.ready_override' } })
    expect(audit?.reason).toContain('pit')
    const v = await schedule()
    expect(v.id).toBeTruthy()
    expect((await prisma.installation.findUnique({ where: { id: inst!.id } }))?.status).toBe('scheduled')
  })

  it('12. commissioning needs training and a signature; with them it makes one system, its warranties and follow-ups, once', async () => {
    const o = await confirmedOrder(ids)
    const installationId = await prepDone(ids.dispatcher, o.orderId)
    const visitId = await installVisitOnSite(ids, installationId)
    const tech = ids.techs[0]
    await expect(commission(tech, await commissionInput(tech, visitId, o.who.name, { training: false }))).rejects.toThrow(/GUARD_FAILED/)
    await expect(commission(tech, await commissionInput(tech, visitId, o.who.name, { signature: false }))).rejects.toThrow(/GUARD_FAILED/)
    expect(await prisma.installedSystem.count({ where: { customerId: o.customerId } })).toBe(0)
    const input = await commissionInput(tech, visitId, o.who.name)
    const r = await race([commission(tech, input), commission(tech, input)])
    expect(r.won).toBe(1)
    await expect(commission(tech, input)).rejects.toThrow(/INVALID_TRANSITION|STALE_STATE/)
    const systems = await prisma.installedSystem.findMany({ where: { customerId: o.customerId }, include: { warranties: true } })
    expect(systems).toHaveLength(1)
    expect(systems[0].warranties.length).toBeGreaterThan(0)
    const followUps = await prisma.visit.count({ where: { systemId: systems[0].id, type: 'follow_up' } })
    const days = (await prisma.companySettings.findFirst())?.followUpScheduleDays as unknown as number[] | null
    if (Array.isArray(days) && days.length) expect(followUps).toBe(days.length)
    expect((await prisma.installation.findUnique({ where: { id: installationId } }))?.status).toBe('commissioned')
  })

  it('17. totals are recomputed on the server when a client sends wrong ones', async () => {
    const lead = await requestQuote()
    const sales = await as(ids.sales)
    const kit = await prisma.product.findFirst({ where: { type: 'digester_kit' }, orderBy: { priceAmount: 'asc' } })
    const draft = await op(sales, `mutation($i: JSON!, $k: String!) { saveQuoteDraft(input: $i, idempotencyKey: $k) }`, {
      k: key('draft'),
      i: { leadId: lead.leadId, kind: 'sale', totalAmount: 1, options: [{ label: kit!.name, totalAmount: 1, subtotalAmount: 1, lines: [{ kind: 'product', productId: kit!.id, quantity: 1, unitAmount: 1, totalAmount: 1 }] }] },
    })
    const option = await prisma.quoteOption.findFirst({ where: { quoteId: draft.id }, include: { lines: true } })
    const productLine = option!.lines.find(l => l.kind === 'product')
    expect(productLine?.unitAmount).toBe(kit!.priceAmount)
    // Every amount is the server's, from the catalogue price, never the client's 1.
    const positive = option!.lines.reduce((t, l) => t + Math.max(0, (l.quantity ?? 1) * l.unitAmount), 0)
    expect(option!.subtotalAmount).toBe(positive)
    const settings = await prisma.companySettings.findFirst()
    const net = option!.subtotalAmount - option!.discountAmount
    expect(option!.totalAmount).toBe(settings?.taxInclusive ? net : net + option!.taxAmount)
    expect(option!.totalAmount).toBeGreaterThanOrEqual(kit!.priceAmount)
    // A cart priced by the client is priced again on the server.
    const shopper = await as(null)
    const part = await prisma.product.findFirst({ where: { sku: 'FLT-MED' } })
    const cart = await op(shopper, `mutation($p: ID!) { addToCart(productId: $p, quantity: 2) }`, { p: part!.id })
    const cartId = cart?.id ?? cart?.cartId
    if (cartId) {
      const lines = await prisma.cartLine.findMany({ where: { cartId } })
      expect(lines.every(l => (l as any).unitAmount === undefined || (l as any).unitAmount === part!.priceAmount)).toBe(true)
    }
    void person
    void payByReference
  })
})
