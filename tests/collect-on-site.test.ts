import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from './helpers/db'
import { command } from '../features/keystone/lib/command'
import { collectOnSite } from '../features/keystone/services/money-links'
import type { Actor } from '../features/keystone/lib/actor'

const prisma = hasTestDatabase ? testPrisma() : (null as never)
const field = (userId: string): Actor => ({ kind: 'user', userId, customerId: null, discountLimitPercent: 0, permissions: new Set(['canAccessDashboard', 'canDoFieldWork'] as never) })
const collect = (actor: Actor, input: Record<string, unknown>, idempotencyKey = uniqueKey('collect')) =>
  command(prisma, { name: 'collectOnSite', actor, idempotencyKey, params: input }, uow => collectOnSite(uow, actor, input as never)).then(r => r.value)

describe.skipIf(!hasTestDatabase)('collectOnSite (P30): a technician takes a payment on site', () => {
  let tech: { id: string }
  let other: { id: string }
  let order: { id: string }
  let onSite: { id: string }
  let future: { id: string }
  let cancelled: { id: string }
  beforeAll(async () => {
    await resetDatabase(prisma)
    await prisma.companySettings.create({ data: { id: 1, name: 'Juniper Biogas', currencyCode: 'USD', timezone: 'America/Chicago' } as never })
    tech = await prisma.user.create({ data: { name: 'Hannah Lindqvist', email: 'hannah@juniperbiogas.com', password: 'x'.repeat(60) } })
    other = await prisma.user.create({ data: { name: 'Marcus Kowalski', email: 'marcus@juniperbiogas.com', password: 'x'.repeat(60) } })
    const customer = await prisma.customer.create({ data: { number: 'C-COL-1', name: 'Rosa Main', currencyCode: 'USD' } })
    order = await prisma.order.create({ data: { number: 'O-COL-1', status: 'confirmed', channel: 'quote', publicCode: 'O-COL1-COL1-COL1-COL1', currencyCode: 'USD', fulfilment: 'install', customerId: customer.id, totalAmount: 20000, paidAmount: 12000 } })
    const inst = await prisma.installation.create({ data: { number: 'IN-COL-1', status: 'in_progress', orderId: order.id, customerId: customer.id } })
    const visit = (status: string, extra: Record<string, unknown> = {}) => prisma.visit.create({ data: { number: `V-COL-${status}`, type: 'install', status, installationId: inst.id, customerId: customer.id, technicians: { connect: [{ id: tech.id }] }, ...extra } })
    onSite = await visit('on_site')
    future = await visit('scheduled', { scheduledDate: new Date(Date.now() + 7 * 86_400_000) })
    cancelled = await visit('cancelled')
  })
  afterAll(async () => prisma?.$disconnect())

  it('refuses someone not on the crew', async () => {
    await expect(collect(field(other.id), { visitId: onSite.id, provider: 'cash', reference: 'CASH0001' })).rejects.toThrow('not on this visit')
  })

  it('refuses a future or cancelled visit', async () => {
    await expect(collect(field(tech.id), { visitId: future.id, provider: 'cash', reference: 'CASH0002' })).rejects.toThrow('on site')
    await expect(collect(field(tech.id), { visitId: cancelled.id, provider: 'cash', reference: 'CASH0003' })).rejects.toThrow('on site')
  })

  it('refuses more than is owed', async () => {
    await expect(collect(field(tech.id), { visitId: onSite.id, provider: 'cash', reference: 'CASH0004', amount: 8001 })).rejects.toThrow('still owed')
  })

  it('records part of the balance as submitted cash, collected by the technician, and counts it against what is owed', async () => {
    const key = uniqueKey('collect')
    const out = await collect(field(tech.id), { visitId: onSite.id, provider: 'cash', reference: 'CASH0005', amount: 3000 }, key)
    expect(out).toMatchObject({ status: 'submitted', amount: 3000, purpose: 'balance' })
    const p = await prisma.payment.findUnique({ where: { id: out.paymentId } })
    expect(p).toMatchObject({ status: 'submitted', method: 'cash', collectedById: tech.id, orderId: order.id })
    // The same intent replays; nothing is recorded twice.
    const again = await collect(field(tech.id), { visitId: onSite.id, provider: 'cash', reference: 'CASH0005', amount: 3000 }, key)
    expect(again.paymentId).toBe(out.paymentId)
    expect(await prisma.payment.count()).toBe(1)
    // 8000 owed, 3000 waiting for finance: at most 5000 more.
    await expect(collect(field(tech.id), { visitId: onSite.id, provider: 'mobile_money', reference: 'MM00000006', amount: 5001 })).rejects.toThrow('still owed')
    // The order is not paid until finance verifies.
    expect((await prisma.order.findUnique({ where: { id: order.id } }))?.paidAmount).toBe(12000)
  })

  it('refuses the same reference twice', async () => {
    await expect(collect(field(tech.id), { visitId: onSite.id, provider: 'cash', reference: 'CASH0005', amount: 100 })).rejects.toThrow('already been used')
  })

  it('defaults to the full amount still owed', async () => {
    const out = await collect(field(tech.id), { visitId: onSite.id, provider: 'mobile_money', reference: 'MM00000007' })
    expect(out.amount).toBe(5000)
    await expect(collect(field(tech.id), { visitId: onSite.id, provider: 'cash', reference: 'CASH0008' })).rejects.toThrow('Nothing is owed')
  })
})
