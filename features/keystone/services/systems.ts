import type { UnitOfWork } from '../lib/unitOfWork'
import { DomainError, Codes } from '../lib/errors'
import { auditChange, lockRow, transition } from '../lib/cas'
import { actorUserId, requirePermission, systemActor, type Actor } from '../lib/actor'
import { nextNumber, publicCode } from '../lib/sequence'
import { addDays, addMonths } from '../lib/time'
import { percentOf } from '../lib/money'
import { getSettings } from './settings'
import { triggerMilestones } from './money'
import { freeSlots } from './scheduling'
import { dec, oneOf, str } from './util'

/**
 * Installation (4.7), commissioning (W6.4–6.5) and the installed base (4.8, W7). Commissioning happens
 * once per installation: the CAS on the installation and the unique Installation.system link make a
 * second call fail, so systems, warranties and follow-ups are never duplicated.
 */
const MOVES: Record<string, { from: string[]; to: string; reason?: boolean }> = {
  ready: { from: ['awaiting_site_prep'], to: 'ready_to_schedule' },
  hold: { from: ['awaiting_site_prep', 'ready_to_schedule', 'scheduled', 'in_progress', 'installed'], to: 'on_hold', reason: true },
  resume: { from: ['on_hold'], to: '' },
  cancel: { from: ['awaiting_site_prep', 'ready_to_schedule', 'scheduled', 'on_hold'], to: 'cancelled', reason: true },
}

export async function transitionInstallation(uow: UnitOfWork, actor: Actor, input: { installationId: string; action: string; reason?: string; expectedVersion?: number | null }) {
  requirePermission(actor, 'canManageVisits', 'canManageOrders')
  const tx = uow.tx
  const move = MOVES[input.action]
  if (!move) throw new DomainError(Codes.INVALID_INPUT, 'Unknown installation move.')
  const reason = str(input.reason, 500)
  if (move.reason && !reason) throw new DomainError(Codes.INVALID_INPUT, 'Give a reason.')
  const inst = await tx.installation.findUnique({ where: { id: input.installationId }, include: { prepTasks: true } })
  if (!inst) throw new DomainError(Codes.NOT_FOUND, 'Installation not found.')
  if (input.action === 'ready') {
    const open = inst.prepTasks.filter(t => t.isRequired && t.status === 'pending')
    // P20: ready with required items undone needs an override reason (W5.3).
    if (open.length && !reason) throw new DomainError(Codes.GUARD_FAILED, `${open.length} required get-ready item(s) are not done. Override with a reason.`, { problems: open.map(t => t.prompt) })
    return transition(uow, { model: 'Installation', id: inst.id, from: move.from, to: move.to, expectedVersion: input.expectedVersion, actor, action: open.length ? 'installation.ready_override' : 'installation.ready', reason, data: open.length ? { overrideReason: reason } : {} })
  }
  if (input.action === 'resume') {
    const back = inst.heldFrom || 'ready_to_schedule'
    return transition(uow, { model: 'Installation', id: inst.id, from: move.from, to: back, expectedVersion: input.expectedVersion, actor, action: 'installation.resumed', data: { holdReason: '', heldFrom: '' } })
  }
  const out = await transition<any>(uow, { model: 'Installation', id: inst.id, from: move.from, to: move.to, expectedVersion: input.expectedVersion, actor, action: `installation.${move.to}`, reason, data: move.to === 'on_hold' ? { holdReason: reason, heldFrom: inst.status } : {} })
  if (move.to === 'cancelled' || move.to === 'on_hold') {
    // Booked install visits come off the schedule.
    const visits = await tx.visit.findMany({ where: { installationId: inst.id, status: { in: ['scheduled', 'rescheduled', 'requested'] } } })
    for (const v of visits) {
      await transition(uow, { model: 'Visit', id: v.id, from: [v.status], to: 'cancelled', actor, action: 'visit.cancelled', reason: `Installation ${move.to === 'on_hold' ? 'on hold' : 'cancelled'}: ${reason}`, data: { cancelReason: reason, cancelledBy: 'company' } })
      await freeSlots(tx, v.id)
    }
  }
  return out
}

/** Tick, waive or reopen a get-ready item (staff P20 or the customer S21). Ticking the last required one makes it ready. */
export async function setPrepTask(uow: UnitOfWork, actor: Actor, input: { taskId: string; status: 'done' | 'pending' | 'waived'; note?: string; by: 'customer' | 'staff' }) {
  const tx = uow.tx
  const task = await tx.sitePrepTask.findUnique({ where: { id: input.taskId }, include: { installation: true } })
  if (!task?.installation) throw new DomainError(Codes.NOT_FOUND, 'Item not found.')
  if (input.by === 'customer') {
    if (actor.kind !== 'user' || !actor.customerId || actor.customerId !== task.installation.customerId) throw new DomainError(Codes.NOT_FOUND, 'Item not found.')
    if (input.status === 'waived') throw new DomainError(Codes.NOT_AUTHORIZED, 'Only staff can waive an item.')
  } else requirePermission(actor, 'canManageVisits', 'canManageOrders')
  if (['commissioned', 'cancelled', 'installed'].includes(task.installation.status)) throw new DomainError(Codes.GUARD_FAILED, 'This installation is past the get-ready stage.')
  const status = oneOf(input.status, ['done', 'pending', 'waived'] as const, 'Status')
  await transition(uow, { model: 'SitePrepTask', id: task.id, from: ['pending', 'done', 'waived'].filter(s => s !== status), to: status, actor, action: `prep.${status}`, reason: str(input.note, 500), data: { doneAt: status === 'pending' ? null : uow.now, doneBy: status === 'pending' ? '' : input.by, note: str(input.note, 500) } })
  const open = await tx.sitePrepTask.count({ where: { installationId: task.installation.id, isRequired: true, status: 'pending' } })
  const inst = task.installation
  if (!open && inst.status === 'awaiting_site_prep') await transition(uow, { model: 'Installation', id: inst.id, from: ['awaiting_site_prep'], to: 'ready_to_schedule', actor: systemActor('site-prep'), action: 'installation.ready' })
  if (open && inst.status === 'ready_to_schedule' && !inst.overrideReason) await transition(uow, { model: 'Installation', id: inst.id, from: ['ready_to_schedule'], to: 'awaiting_site_prep', actor: systemActor('site-prep'), action: 'installation.awaiting_site_prep' })
  return tx.sitePrepTask.findUnique({ where: { id: task.id } })
}

export type CommissionInput = {
  visitId: string
  signedName: string
  signature: string
  training: { traineeName: string; relationToOwner?: string; topics: string[]; language?: string }[]
  serialNumber?: string
  answers?: { itemId: string; value: unknown }[]
  notes?: string
  reading?: { working?: boolean; pressureKpa?: string; cookingHours?: string }
  expectedVersion?: number | null
}

/** P29: commissioning visit completed with training and signature → InstalledSystem, warranties, follow-ups. */
export async function commissionSystem(uow: UnitOfWork, actor: Actor, input: CommissionInput) {
  requirePermission(actor, 'canDoFieldWork', 'canManageVisits')
  const tx = uow.tx
  const settings = await getSettings(tx)
  const visit = await lockRow<any>(tx, 'Visit', input.visitId)
  if (actor.kind === 'user' && !actor.permissions.has('canManageVisits')) {
    const onCrew = await tx.visit.count({ where: { id: visit.id, technicians: { some: { id: actor.userId } } } })
    if (!onCrew) throw new DomainError(Codes.NOT_AUTHORIZED, 'You are not on this visit.')
  }
  if (!['commissioning', 'install'].includes(visit.type) || !visit.installationId) throw new DomainError(Codes.GUARD_FAILED, 'Commissioning is done on an install or commissioning visit.')
  const training = (input.training ?? []).filter(t => str(t.traineeName, 120))
  if (!training.length || training.some(t => !Array.isArray(t.topics) || !t.topics.length)) throw new DomainError(Codes.GUARD_FAILED, 'Record who was trained and on which topics.')
  const signedName = str(input.signedName, 120)
  const signature = str(input.signature, 200_000)
  if (!signedName || signature.length < 20) throw new DomainError(Codes.GUARD_FAILED, 'The customer must sign.')
  const inst = await lockRow<any>(tx, 'Installation', visit.installationId)
  if (inst.status === 'commissioned' || inst.systemId) throw new DomainError(Codes.INVALID_TRANSITION, 'This system is already commissioned.', { currentStatus: 'commissioned' })
  // An install visit can commission the same day: it moves the installation to installed first.
  const { checklistFor } = await import('./visits')
  const template = await checklistFor(tx, { type: 'commissioning', siteId: visit.siteId, installationId: null })
  const byId = new Map((input.answers ?? []).map(a => [a.itemId, a.value]))
  const items = (template?.items ?? []).map(i => ({ itemId: i.id, prompt: i.prompt, isRequired: i.isRequired, value: byId.get(i.id) ?? null }))
  const missing = items.filter(i => i.isRequired && (i.value === null || i.value === ''))
  if (missing.length) throw new DomainError(Codes.GUARD_FAILED, `Answer the required items: ${missing.slice(0, 5).map(m => m.prompt).join('; ')}.`, { problems: missing.map(m => m.prompt) })
  await transition(uow, { model: 'Visit', id: visit.id, from: ['on_site'], to: 'completed', expectedVersion: input.expectedVersion, actor, action: 'visit.completed', data: { outcome: 'commissioned', checkOutAt: uow.now, signedName, customerSignature: signature, notes: str(input.notes, 4000), checklistAnswers: { templateId: template?.id ?? null, items } as never } })
  if (['scheduled', 'in_progress'].includes(inst.status)) await transition(uow, { model: 'Installation', id: inst.id, from: [inst.status], to: 'installed', actor, action: 'installation.installed' })
  const order = inst.orderId ? await tx.order.findUnique({ where: { id: inst.orderId }, include: { lines: true } }) : null
  const product = inst.productId ? await tx.product.findUnique({ where: { id: inst.productId }, include: { digesterSpec: true } }) : null
  let unit = order ? await tx.serializedUnit.findFirst({ where: { orderId: order.id, productId: inst.productId ?? undefined, installedSystem: null } }) : null
  if (input.serialNumber) {
    unit = await tx.serializedUnit.findUnique({ where: { serialNumber: str(input.serialNumber, 80) }, include: { installedSystem: true } }) as any
    if (!unit || (unit as any).installedSystem) throw new DomainError(Codes.INVALID_INPUT, 'That serial number is unknown or already installed.')
  }
  const system = await tx.installedSystem.create({
    data: { number: await nextNumber(tx, 'SYS'), publicCode: publicCode('S'), status: 'commissioned', installedAt: uow.now, commissionedAt: uow.now, lastCheckedAt: uow.now, lastCheckResult: 'working', customerId: inst.customerId, siteId: inst.siteId, productId: inst.productId, serializedUnitId: unit?.id ?? null, orderId: order?.id ?? null },
  })
  if (unit) await tx.serializedUnit.update({ where: { id: unit.id }, data: { status: 'installed' } })
  await transition(uow, { model: 'Installation', id: inst.id, from: ['installed'], to: 'commissioned', actor, action: 'installation.commissioned', data: { systemId: system.id } })
  await tx.visit.update({ where: { id: visit.id }, data: { systemId: system.id } })
  for (const t of training) await tx.trainingRecord.create({ data: { traineeName: str(t.traineeName, 120), relationToOwner: str(t.relationToOwner, 80), topics: t.topics.map(x => str(x, 80)).filter(Boolean), language: str(t.language, 10) || 'en', at: uow.now, visitId: visit.id, systemId: system.id } })
  // Warranties from the model's spec and the appliance lines.
  const spec = product?.digesterSpec
  const reactor = spec?.reactorWarrantyMonths ?? product?.warrantyMonths ?? 12
  const parts = spec?.partsWarrantyMonths ?? 12
  const appliances = Math.max(parts, ...(order?.lines ?? []).filter(l => l.kind === 'product' && l.productId !== inst.productId).map(l => l.warrantyMonths || 0))
  const rows: [string, number][] = [['reactor', reactor], ['gas_line', parts], ['appliances', appliances], ['workmanship', 12]]
  for (const [component, months] of rows) await tx.warrantyCoverage.create({ data: { component, startsAt: uow.now, endsAt: addMonths(uow.now, months), terms: `${months} months from commissioning`, systemId: system.id } })
  // Follow-ups created once, now (W7.1): no background job involved.
  const days = settings.followUpScheduleDays
  for (const d of days) await tx.visit.create({ data: { number: await nextNumber(tx, 'V'), type: 'follow_up', status: 'requested', dueAt: addDays(uow.now, d), publicCode: publicCode('V'), customerId: inst.customerId, siteId: inst.siteId, systemId: system.id, notes: d <= 7 ? 'Check-up call' : d >= 365 ? 'Yearly functionality check' : `Day ${d} check` } })
  await tx.installedSystem.update({ where: { id: system.id }, data: { nextCheckDueAt: addDays(uow.now, days[0] ?? 7) } })
  if (input.reading) await recordReading(uow, actor, { ...input.reading, systemId: system.id, visitId: visit.id, source: 'technician', working: input.reading.working ?? true })
  if (order) {
    await triggerMilestones(uow, order.id, 'on_commissioning')
    if (['installed', 'delivered', 'out_for_install', 'confirmed', 'preparing', 'ready'].includes(order.status)) await transition(uow, { model: 'Order', id: order.id, from: [order.status], to: 'completed', actor: systemActor('commissioning'), action: 'order.completed', data: { completedAt: uow.now } })
    await accrueCommission(uow, order)
    // Referral qualifies when the referred person's system is commissioned (W13).
    if (order.referralId) {
      const r = await tx.referral.findUnique({ where: { id: order.referralId } })
      if (r?.status === 'pending') await transition(uow, { model: 'Referral', id: r.id, from: ['pending'], to: 'qualified', actor: systemActor('commissioning'), action: 'referral.qualified', data: { qualifiedAt: uow.now } })
    } else {
      const lead = order.quoteId ? await tx.lead.findFirst({ where: { quotes: { some: { id: order.quoteId } } }, select: { referralId: true } }) : null
      if (lead?.referralId) {
        const r = await tx.referral.findUnique({ where: { id: lead.referralId } })
        if (r?.status === 'pending') {
          await tx.order.update({ where: { id: order.id }, data: { referralId: r.id } })
          await transition(uow, { model: 'Referral', id: r.id, from: ['pending'], to: 'qualified', actor: systemActor('commissioning'), action: 'referral.qualified', data: { qualifiedAt: uow.now } })
        }
      }
    }
    // Grants paid to the customer later can be filed now.
    await tx.incentiveApplication.updateMany({ where: { orderId: order.id, status: 'draft', treatment: 'paid_to_customer_later' }, data: { notes: 'Ready to file: system commissioned' } })
  }
  auditChange(uow, actor, 'InstalledSystem', system.id, 'system.commissioned', { number: system.number, installationId: inst.id }, { toStatus: 'commissioned' })
  uow.emit('system.commissioned', 'InstalledSystem', system.id, { number: system.number, publicCode: system.publicCode, orderId: order?.id ?? null })
  return system
}

/** W15: commission accrues at commissioning by the first active rule. */
async function accrueCommission(uow: UnitOfWork, order: { id: string; salesAgentId: string | null; totalAmount: number; currencyCode: string }) {
  if (!order.salesAgentId) return
  const tx = uow.tx
  const exists = await tx.commission.count({ where: { orderId: order.id } })
  if (exists) return
  const rule = await tx.commissionRule.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } })
  if (!rule) return
  const amount = rule.type === 'percent_of_order' ? percentOf(order.totalAmount, rule.value) : Math.max(0, Number.parseInt(rule.value, 10) || 0)
  if (amount <= 0) return
  const row = await tx.commission.create({ data: { status: 'accrued', basisAmount: order.totalAmount, amount, currencyCode: order.currencyCode, rule: { id: rule.id, name: rule.name, type: rule.type, value: rule.value }, agentId: order.salesAgentId, orderId: order.id } })
  auditChange(uow, systemActor('commissioning'), 'Commission', row.id, 'commission.accrued', { amount }, { toStatus: 'accrued' })
}

export type ReadingInput = { systemId: string; visitId?: string | null; source?: string; working?: boolean; cookingHours?: string; pressureKpa?: string; feedKg?: string; waterL?: string; slurryUsed?: boolean; problem?: string; at?: string }

/** P35 / W7.2: a reading sets the system's functionality; "not working" opens a ticket. */
export async function recordReading(uow: UnitOfWork, actor: Actor, input: ReadingInput) {
  const tx = uow.tx
  const system = await lockRow<any>(tx, 'InstalledSystem', input.systemId)
  const source = oneOf(input.source ?? 'call', ['customer', 'technician', 'call', 'meter'] as const, 'Source')
  const working = input.working !== false
  const at = input.at ? new Date(input.at) : uow.now
  const reading = await tx.systemReading.create({
    data: { systemId: system.id, visitId: input.visitId ?? null, source, working, at, cookingHours: input.cookingHours ? dec(input.cookingHours, 'Cooking hours') : null, pressureKpa: input.pressureKpa ? dec(input.pressureKpa, 'Pressure') : null, feedKg: input.feedKg ? dec(input.feedKg, 'Feed') : null, waterL: input.waterL ? dec(input.waterL, 'Water') : null, slurryUsed: Boolean(input.slurryUsed), problem: str(input.problem, 1000), recordedById: actorUserId(actor) },
  })
  const low = working && input.cookingHours !== undefined && Number(input.cookingHours) < 1
  const next = !working ? 'not_working' : low ? 'underperforming' : 'active'
  await tx.installedSystem.update({ where: { id: system.id }, data: { lastCheckedAt: at, lastCheckResult: next } })
  if (!['inactive', 'decommissioned'].includes(system.status) && system.status !== next) {
    await transition(uow, { model: 'InstalledSystem', id: system.id, from: [system.status], to: next, actor, action: `system.${next}`, reason: str(input.problem, 300) })
  }
  if (!working) {
    const open = await tx.serviceTicket.count({ where: { systemId: system.id, status: { notIn: ['resolved', 'closed', 'cancelled', 'phone_resolved'] } } })
    if (!open) {
      const { openTicket } = await import('./tickets')
      await openTicket(uow, systemActor('follow-up'), { systemId: system.id, customerId: system.customerId, channel: 'follow_up', category: 'no_gas', description: str(input.problem, 2000) || 'Follow-up found the system not working.' })
    }
  }
  // Next check date: the earliest open follow-up.
  const nextVisit = await tx.visit.findFirst({ where: { systemId: system.id, type: 'follow_up', status: { in: ['requested', 'scheduled'] } }, orderBy: { dueAt: 'asc' } })
  await tx.installedSystem.update({ where: { id: system.id }, data: { nextCheckDueAt: nextVisit?.dueAt ?? nextVisit?.windowStart ?? null } })
  return reading
}

/** Completing the yearly check creates the next one (W7.1). */
export async function scheduleNextYearly(uow: UnitOfWork, visit: { id: string; systemId: string | null; dueAt: Date | null; customerId: string | null; siteId: string | null }) {
  if (!visit.systemId) return
  const tx = uow.tx
  const system = await tx.installedSystem.findUnique({ where: { id: visit.systemId } })
  if (!system?.commissionedAt) return
  const due = visit.dueAt ?? uow.now
  const ageDays = (due.getTime() - system.commissionedAt.getTime()) / 86_400_000
  if (ageDays < 300) return
  const open = await tx.visit.count({ where: { systemId: system.id, type: 'follow_up', status: { in: ['requested', 'scheduled'] }, dueAt: { gt: due } } })
  if (open) return
  await tx.visit.create({ data: { number: await nextNumber(tx, 'V'), type: 'follow_up', status: 'requested', dueAt: addMonths(due, 12), publicCode: publicCode('V'), customerId: visit.customerId, siteId: visit.siteId, systemId: system.id, notes: 'Yearly functionality check' } })
}

/** P36: inactive / decommissioned / back to active, with a reason. */
export async function setSystemStatus(uow: UnitOfWork, actor: Actor, input: { systemId: string; to: string; reason: string; expectedVersion?: number | null }) {
  requirePermission(actor, 'canManageSystems')
  const to = oneOf(input.to, ['inactive', 'decommissioned', 'active'] as const, 'Status')
  const reason = str(input.reason, 500)
  if (!reason) throw new DomainError(Codes.INVALID_INPUT, 'Give a reason.')
  const from = to === 'active' ? ['inactive', 'underperforming', 'not_working', 'commissioned'] : to === 'inactive' ? ['commissioned', 'active', 'underperforming', 'not_working'] : ['commissioned', 'active', 'underperforming', 'not_working', 'inactive']
  return transition(uow, { model: 'InstalledSystem', id: input.systemId, from, to, expectedVersion: input.expectedVersion, actor, action: `system.${to}`, reason, data: { statusReason: reason } })
}

export async function voidWarranty(uow: UnitOfWork, actor: Actor, input: { warrantyId: string; reason: string }) {
  requirePermission(actor, 'canManageSystems')
  const reason = str(input.reason, 500)
  if (!reason) throw new DomainError(Codes.INVALID_INPUT, 'Give a reason.')
  const w = await lockRow<any>(uow.tx, 'WarrantyCoverage', input.warrantyId)
  if (w.isVoid) throw new DomainError(Codes.INVALID_TRANSITION, 'Already void.')
  await uow.tx.warrantyCoverage.update({ where: { id: w.id }, data: { isVoid: true, voidReason: reason, version: { increment: 1 } } })
  auditChange(uow, actor, 'WarrantyCoverage', w.id, 'warranty.voided', { component: w.component }, { reason })
  return uow.tx.warrantyCoverage.findUnique({ where: { id: w.id } })
}

/** Cover for a fault category (W8.3): which component it falls under, and whether that cover is live. */
export const CATEGORY_COMPONENT: Record<string, string> = { no_gas: 'reactor', low_pressure: 'gas_line', smell: 'gas_line', leak: 'gas_line', stove_fault: 'appliances', slurry_overflow: 'reactor', other: 'workmanship' }

export function coverFor(warranties: { component: string; startsAt: Date | null; endsAt: Date | null; isVoid: boolean }[], category: string, now: Date) {
  const component = CATEGORY_COMPONENT[category] ?? 'workmanship'
  const row = warranties.find(w => w.component === component)
  if (!row) return { component, covered: false, reason: 'No warranty on record for this part' }
  if (row.isVoid) return { component, covered: false, reason: 'Warranty voided' }
  if (row.endsAt && row.endsAt.getTime() < now.getTime()) return { component, covered: false, reason: `Warranty ended ${row.endsAt.toISOString().slice(0, 10)}` }
  return { component, covered: true, reason: `Covered until ${row.endsAt?.toISOString().slice(0, 10) ?? 'no end date'}` }
}
