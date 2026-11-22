import type { UnitOfWork } from '../lib/unitOfWork'
import { DomainError, Codes } from '../lib/errors'
import { lockRow, transition } from '../lib/cas'
import { addMonths, subscriptionEffectiveStatus } from '../lib/time'
import type { Actor } from '../lib/actor'
import { nextNumber } from '../lib/sequence'

/**
 * Service plan subscriptions (W9, 4.11). Paying starts or renews a period; `renewal_due`, `grace` and
 * `lapsed` are read from the period end. Each period books its maintenance visits as requested visits.
 */
export const periodMonths = (billing: string) => (billing === 'monthly' ? 1 : 12)

export async function activateSubscription(uow: UnitOfWork, actor: Actor, subscriptionId: string, available: number) {
  const tx = uow.tx
  const sub = await lockRow<any>(tx, 'ServicePlanSubscription', subscriptionId)
  if (available < sub.priceAmount) return 0
  const effective = subscriptionEffectiveStatus(sub, uow.now)
  const months = periodMonths(sub.billing)
  // A renewal before the end extends from the end; after lapse it starts again today.
  const from = sub.currentPeriodEnd && ['active', 'renewal_due', 'grace'].includes(effective) ? new Date(sub.currentPeriodEnd) : uow.now
  const to = addMonths(from, months)
  await transition(uow, {
    model: 'ServicePlanSubscription', id: sub.id, from: ['pending_payment', 'active', 'renewal_due', 'grace', 'lapsed'], to: 'active', actor, action: sub.status === 'pending_payment' ? 'subscription.started' : 'subscription.renewed',
    data: { startedAt: sub.startedAt ?? uow.now, currentPeriodStart: from, currentPeriodEnd: to, visitsUsed: 0 },
  })
  const plan = await tx.servicePlan.findUnique({ where: { id: sub.planId } })
  const system = sub.systemId ? await tx.installedSystem.findUnique({ where: { id: sub.systemId } }) : null
  // Maintenance visits are booked a year at a time: at the start and on each anniversary (monthly plans
  // too), spread evenly over the year, as requested visits for the dispatcher to place.
  const started = sub.startedAt ? new Date(sub.startedAt) : from
  const monthsIn = Math.round((from.getTime() - started.getTime()) / (30.44 * 86_400_000))
  const bookYear = months === 12 || monthsIn % 12 === 0
  const count = plan && bookYear ? plan.visitsPerYear ?? 0 : 0
  const yearEnd = addMonths(from, 12)
  for (let i = 0; i < count; i++) {
    const due = new Date(from.getTime() + ((yearEnd.getTime() - from.getTime()) * (i + 1)) / (count + 1))
    await tx.visit.create({ data: { number: await nextNumber(tx, 'V'), type: 'maintenance', status: 'requested', dueAt: due, customerId: sub.customerId, siteId: system?.siteId ?? null, systemId: sub.systemId, subscriptionId: sub.id } })
  }
  return sub.priceAmount
}

/**
 * Pro-rata refund (4.11): unused whole months of the paid period, less visits already done at list
 * price, never below zero.
 */
export function proRataRefund(sub: { priceAmount: number; billing: string; currentPeriodStart: Date | null; currentPeriodEnd: Date | null; visitsUsed: number }, visitListPrice: number, now: Date) {
  if (!sub.currentPeriodStart || !sub.currentPeriodEnd) return 0
  const months = periodMonths(sub.billing)
  let used = 0
  while (used < months && addMonths(new Date(sub.currentPeriodStart), used).getTime() <= now.getTime()) used += 1
  const unused = Math.max(0, months - used)
  const value = Math.floor((sub.priceAmount * unused) / months)
  return Math.max(0, value - sub.visitsUsed * visitListPrice)
}

export function assertSellable(plan: { isPublished: boolean } | null) {
  if (!plan || !plan.isPublished) throw new DomainError(Codes.NOT_FOUND, 'Service plan not found.')
}
