/**
 * A real company for the state-machine suites: the empty test schema, then the same onboarding
 * (`seedReference`, United States preset, Juniper Biogas) the dashboard runs. Actors are built from
 * the roles and staff onboarding created, exactly as `actorFromSession` builds them from a cookie.
 */
import type { PrismaClient } from '@prisma/client'
import { command } from '../../features/keystone/lib/command'
import { permissionNames, type Permission } from '../../features/keystone/access'
import { systemActor, type Actor } from '../../features/keystone/lib/actor'
import type { UnitOfWork } from '../../features/keystone/lib/unitOfWork'
import { seedReference, type OnboardingAnswers } from '../../features/keystone/services/onboarding'
import { resetDatabase, uniqueKey } from './db'

export const US_ANSWERS: OnboardingAnswers = { country: 'US', companyName: 'Juniper Biogas', sells: ['home', 'farm', 'institution', 'parts'], instalments: true, paymentMethods: ['stripe', 'mobile_money', 'bank_transfer', 'cash'] }

export async function onboardCompany(prisma: PrismaClient, opts: { reset?: boolean } = {}) {
  if (opts.reset !== false) await resetDatabase(prisma)
  const actor = systemActor('onboarding')
  return command(prisma, { name: 'runBiogasOnboarding', actor, idempotencyKey: uniqueKey('onboard'), params: US_ANSWERS, timeoutMs: 300_000 }, uow => seedReference(uow, actor, US_ANSWERS))
}

/** The actor for the first seeded user holding `roleName`, with that role's real permissions. */
export async function staff(prisma: PrismaClient, roleName: string): Promise<Actor & { kind: 'user' }> {
  const user = await prisma.user.findFirst({ where: { role: { name: roleName } }, include: { role: true }, orderBy: { email: 'asc' } })
  if (!user?.role) throw new Error(`Onboarding made no ${roleName}.`)
  const role = user.role as unknown as Record<string, unknown>
  return {
    kind: 'user', userId: user.id, name: user.name, customerId: null,
    discountLimitPercent: Number(role.discountLimitPercent ?? 0),
    permissions: new Set<Permission>(permissionNames.filter(name => role[name] === true)),
  }
}

/** Every staff user that has `roleName`. */
export async function staffAll(prisma: PrismaClient, roleName: string) {
  const users = await prisma.user.findMany({ where: { role: { name: roleName } }, select: { id: true }, orderBy: { email: 'asc' } })
  return Promise.all(users.map(async u => ({ ...(await staff(prisma, roleName)), userId: u.id })))
}

/** A customer login: a User with no role, linked to a Customer. */
export async function customerLogin(prisma: PrismaClient, name: string, phone: string): Promise<Actor & { kind: 'user' }> {
  const email = `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@juniper-customers.com`
  const customer = await prisma.customer.create({ data: { number: `C-${phone.slice(-6)}`, name, email, phone, currencyCode: 'USD' } })
  const user = await prisma.user.create({ data: { name, email, password: 'x'.repeat(60), customer: { connect: { id: customer.id } } } as never })
  return { kind: 'user', userId: user.id, name, customerId: customer.id, discountLimitPercent: 0, permissions: new Set() }
}

export const guest = (key = uniqueKey('guest')): Actor => ({ kind: 'guest', key })

/** Run one service as a keyed command, as the GraphQL resolvers do. */
export function run<T>(prisma: PrismaClient, name: string, actor: Actor, params: unknown, work: (uow: UnitOfWork) => Promise<T>, opts: { key?: string; now?: Date } = {}) {
  return command(prisma, { name, actor, idempotencyKey: opts.key ?? uniqueKey(name), params, now: opts.now }, work).then(r => r.value)
}

/** Settles a list of promises and returns how many fulfilled and the rejection messages. */
export async function race(promises: Promise<unknown>[]) {
  const out = await Promise.allSettled(promises)
  return {
    won: out.filter(o => o.status === 'fulfilled').length,
    errors: out.filter((o): o is PromiseRejectedResult => o.status === 'rejected').map(o => String(o.reason?.message ?? o.reason)),
    values: out.filter((o): o is PromiseFulfilledResult<unknown> => o.status === 'fulfilled').map(o => o.value),
  }
}
