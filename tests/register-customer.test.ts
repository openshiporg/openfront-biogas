import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from './helpers/db'
import { command } from '../features/keystone/lib/command'
import { registerCustomer, NEED_CODE, NEED_PRIVATE_CODE, ACCOUNT_EXISTS } from '../features/keystone/services/accounts'

const prisma = hasTestDatabase ? testPrisma() : (null as never)
const guest = { kind: 'guest', key: 'register' } as const
const register = (input: Record<string, string>) =>
  command(prisma, { name: 'registerCustomer', actor: guest, idempotencyKey: uniqueKey('reg'), params: input }, uow => registerCustomer(uow, guest, input)).then(r => r.value)

describe.skipIf(!hasTestDatabase)('registerCustomer (S19): linking to an existing customer needs their code', () => {
  let ana: { id: string }
  let other: { id: string }
  let cleo: { id: string }
  let dan: { id: string }
  beforeAll(async () => {
    await resetDatabase(prisma)
    ana = await prisma.customer.create({ data: { number: 'C-FIX-A', name: 'Ana Reyes', email: 'ana@example.net', phone: '+15125550101', currencyCode: 'USD' } })
    other = await prisma.customer.create({ data: { number: 'C-FIX-B', name: 'Ben Carter', email: 'ben@example.net', phone: '+15125550102', currencyCode: 'USD' } })
    await prisma.order.create({ data: { number: 'O-FIX-A', status: 'pending_payment', channel: 'shop', publicCode: 'O-ANA1-ANA1-ANA1-ANA1', currencyCode: 'USD', fulfilment: 'delivery', customerId: ana.id } })
    await prisma.order.create({ data: { number: 'O-FIX-B', status: 'pending_payment', channel: 'shop', publicCode: 'O-BEN1-BEN1-BEN1-BEN1', currencyCode: 'USD', fulfilment: 'delivery', customerId: other.id } })
    cleo = await prisma.customer.create({ data: { number: 'C-FIX-C', name: 'Cleo Ramos', email: 'cleo@example.net', phone: '+15125550103', currencyCode: 'USD' } })
    await prisma.quote.create({ data: { number: 'Q-FIX-C', publicCode: 'Q-CLE1-CLE1-CLE1-CLE1', status: 'sent', kind: 'sale', currencyCode: 'USD', customerId: cleo.id } })
    dan = await prisma.customer.create({ data: { number: 'C-FIX-D', name: 'Dan Ortiz', email: 'dan@example.net', phone: '+15125550104', currencyCode: 'USD' } })
    await prisma.installedSystem.create({ data: { number: 'SYS-FIX-D', publicCode: 'S-DAN1-DAN1-DAN1-DAN1', customerId: dan.id } })
  })
  afterAll(async () => prisma?.$disconnect())

  it('refuses a phone match without a code, and links nothing', async () => {
    await expect(register({ name: 'Ana Reyes', email: 'someone@example.net', phone: '+1 512 555 0101', password: 'correct horse 1' })).rejects.toThrow(NEED_CODE)
    expect(await prisma.user.count()).toBe(0)
  })

  it("refuses another customer's code", async () => {
    await expect(register({ name: 'Ana Reyes', email: 'ana@example.net', password: 'correct horse 1', code: 'O-BEN1-BEN1-BEN1-BEN1' })).rejects.toThrow(NEED_CODE)
    expect(await prisma.user.count()).toBe(0)
  })

  it('links with the right code, as a login with no dashboard role', async () => {
    const out = await register({ name: 'Ana Reyes', email: 'ana@example.net', password: 'correct horse 1', code: 'o-ana1-ana1-ana1-ana1' })
    expect(out.customerId).toBe(ana.id)
    const user = await prisma.user.findFirst({ where: { email: 'ana@example.net' }, include: { customer: true } })
    expect(user?.roleId).toBeNull()
    expect(user?.customer?.id).toBe(ana.id)
    await expect(register({ name: 'Ana', email: 'ana@example.net', password: 'another pass 2' })).rejects.toThrow(ACCOUNT_EXISTS)
  })

  it('links by a quote code alone when the email and phone are new, leaving the contact details on file as they were', async () => {
    const out = await register({ name: 'Cleo R', email: 'cleo.new@example.net', phone: '+15125550177', password: 'correct horse 1', code: 'Q-CLE1-CLE1-CLE1-CLE1' })
    expect(out.customerId).toBe(cleo.id)
    const cu = await prisma.customer.findUnique({ where: { id: cleo.id }, include: { user: true } })
    expect(cu?.email).toBe('cleo@example.net')
    expect(cu?.phone).toBe('+15125550103')
    expect(cu?.user?.email).toBe('cleo.new@example.net')
    const audit = await prisma.auditEvent.findFirst({ where: { entityId: cu!.user!.id } })
    expect(audit?.action).toBe('customer.account_linked')
    await expect(register({ name: 'Cleo R', email: 'cleo.third@example.net', password: 'correct horse 1', code: 'Q-CLE1-CLE1-CLE1-CLE1' })).rejects.toThrow(ACCOUNT_EXISTS)
  })

  it('refuses a system sticker code alone, and links nothing', async () => {
    const before = await prisma.user.count()
    await expect(register({ name: 'Neighbour', email: 'passing.by@example.net', password: 'correct horse 1', code: 'S-DAN1-DAN1-DAN1-DAN1' })).rejects.toThrow(NEED_PRIVATE_CODE)
    expect(await prisma.user.count()).toBe(before)
    expect((await prisma.customer.findUnique({ where: { id: dan.id } }))?.email).toBe('dan@example.net')
  })

  it('still links with a system code when the email on file matches', async () => {
    const out = await register({ name: 'Dan Ortiz', email: 'dan@example.net', password: 'correct horse 1', code: 'S-DAN1-DAN1-DAN1-DAN1' })
    expect(out.customerId).toBe(dan.id)
  })

  it('creates a new customer when nothing matches', async () => {
    const out = await register({ name: 'Carla Diaz', email: 'carla@example.net', phone: '+15125550199', password: 'correct horse 1' })
    const cu = await prisma.customer.findUnique({ where: { id: out.customerId } })
    expect(cu?.email).toBe('carla@example.net')
  })
})
