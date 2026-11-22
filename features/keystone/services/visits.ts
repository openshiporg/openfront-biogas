import type { Tx } from '../lib/db'
import type { UnitOfWork } from '../lib/unitOfWork'
import { DomainError, Codes } from '../lib/errors'
import { auditChange, lockRow, transition } from '../lib/cas'
import { actorUserId, requirePermission, systemActor, type Actor } from '../lib/actor'
import { nextNumber, publicCode } from '../lib/sequence'
import { getSettings } from './settings'
import { freeSlots, takeSlots } from './scheduling'
import { openSession } from './money'
import { consume } from './stock'
import { dec, int, oneOf, str } from './util'

/**
 * Visits (4.2): booking takes slot rows under the unique key; check-in records time and GPS; completion
 * needs the checklist's required answers (and a signature for commissioning). Each visit type moves its
 * parent: survey → lead surveyed, install → installation installed, service → ticket in progress.
 */
export const VISIT_TYPES = ['survey', 'delivery', 'install', 'commissioning', 'follow_up', 'service', 'maintenance'] as const
const OPEN = ['requested', 'scheduled', 'rescheduled', 'en_route', 'on_site', 'no_access']
const CHECKLIST_FOR: Record<string, string> = { survey: 'survey_farm', delivery: 'delivery', install: 'install', commissioning: 'commissioning', follow_up: 'follow_up', service: 'service', maintenance: 'maintenance' }

/** Technicians on a visit are only ones with canDoFieldWork. */
async function checkCrew(tx: Tx, ids: string[]) {
  const crew = [...new Set(ids)]
  if (!crew.length) throw new DomainError(Codes.INVALID_INPUT, 'Assign at least one technician.')
  const users = await tx.user.findMany({ where: { id: { in: crew }, isActive: true, role: { canDoFieldWork: true } }, select: { id: true } })
  if (users.length !== crew.length) throw new DomainError(Codes.INVALID_INPUT, 'Only active field staff can be assigned to a visit.')
  return crew
}

export type ScheduleInput = {
  visitId?: string | null
  type?: string
  date: string
  slotIndex: number
  technicianIds: string[]
  leadId?: string | null
  installationId?: string | null
  ticketId?: string | null
  systemId?: string | null
  customerId?: string | null
  siteId?: string | null
  notes?: string
  feeAmount?: number
  expectedVersion?: number | null
}

/** Book a new visit, or place a requested one, or move a scheduled one (P22). */
export async function scheduleVisit(uow: UnitOfWork, actor: Actor, input: ScheduleInput) {
  requirePermission(actor, 'canManageVisits')
  const tx = uow.tx
  const crew = await checkCrew(tx, input.technicianIds)
  const day = str(input.date, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new DomainError(Codes.INVALID_INPUT, 'Pick a date.')
  const slotIndex = int(input.slotIndex, 'Slot', { min: 0, max: 23 })
  let visit: any
  if (input.visitId) {
    visit = await lockRow<any>(tx, 'Visit', input.visitId)
    if (!['requested', 'scheduled', 'rescheduled', 'no_access'].includes(visit.status)) throw new DomainError(Codes.INVALID_TRANSITION, 'This visit can no longer be moved.', { currentStatus: visit.status })
    await freeSlots(tx, visit.id)
  } else {
    const type = oneOf(input.type, VISIT_TYPES, 'Visit type')
    const ctx = await visitContext(tx, input)
    visit = await tx.visit.create({ data: { number: await nextNumber(tx, 'V'), type, status: 'requested', publicCode: publicCode('V'), feeAmount: type === 'survey' ? Math.max(0, input.feeAmount ?? (await getSettings(tx)).surveyFeeAmount) : 0, notes: str(input.notes, 2000), ...ctx } })
    auditChange(uow, actor, 'Visit', visit.id, 'visit.created', { type }, { toStatus: 'requested' })
  }
  const window = await takeSlots(tx, visit.id, day, slotIndex, crew)
  const moving = ['scheduled', 'no_access'].includes(visit.status)
  const updated = await transition<any>(uow, {
    model: 'Visit', id: visit.id, from: ['requested', 'scheduled', 'rescheduled', 'no_access'], to: 'scheduled', expectedVersion: input.expectedVersion, actor, action: moving ? 'visit.rescheduled' : 'visit.scheduled',
    data: { scheduledDate: new Date(`${day}T00:00:00.000Z`), slotIndex, windowStart: window.windowStart, windowEnd: window.windowEnd, publicCode: visit.publicCode ?? publicCode('V'), technicians: { set: crew.map(id => ({ id })) } },
  })
  await onScheduled(uow, actor, updated)
  uow.emit('visit.scheduled', 'Visit', visit.id, { number: updated.number, type: updated.type, windowStart: window.windowStart.toISOString(), publicCode: updated.publicCode })
  return updated
}

async function visitContext(tx: Tx, input: Pick<ScheduleInput, 'leadId' | 'installationId' | 'ticketId' | 'systemId' | 'customerId' | 'siteId'>) {
  if (input.leadId) {
    const l = await tx.lead.findUnique({ where: { id: input.leadId } })
    if (!l) throw new DomainError(Codes.NOT_FOUND, 'Lead not found.')
    return { leadId: l.id, customerId: l.customerId, siteId: l.siteId, branchId: l.branchId }
  }
  if (input.installationId) {
    const i = await tx.installation.findUnique({ where: { id: input.installationId }, include: { order: true } })
    if (!i) throw new DomainError(Codes.NOT_FOUND, 'Installation not found.')
    return { installationId: i.id, customerId: i.customerId, siteId: i.siteId, branchId: i.order?.branchId ?? null }
  }
  if (input.ticketId) {
    const t = await tx.serviceTicket.findUnique({ where: { id: input.ticketId }, include: { system: true } })
    if (!t) throw new DomainError(Codes.NOT_FOUND, 'Ticket not found.')
    return { ticketId: t.id, customerId: t.customerId, systemId: t.systemId, siteId: t.system?.siteId ?? null }
  }
  if (input.systemId) {
    const s = await tx.installedSystem.findUnique({ where: { id: input.systemId } })
    if (!s) throw new DomainError(Codes.NOT_FOUND, 'System not found.')
    return { systemId: s.id, customerId: s.customerId, siteId: s.siteId }
  }
  if (!input.customerId) throw new DomainError(Codes.INVALID_INPUT, 'A visit belongs to a lead, an installation, a ticket, a system or a customer.')
  return { customerId: input.customerId, siteId: input.siteId ?? null }
}

/** Side effects of a booked visit on its parent. */
async function onScheduled(uow: UnitOfWork, actor: Actor, visit: any) {
  const tx = uow.tx
  const sys = systemActor('visits')
  if (visit.type === 'survey' && visit.leadId) {
    const lead = await tx.lead.findUnique({ where: { id: visit.leadId } })
    if (lead && ['new', 'contacted'].includes(lead.status)) await transition(uow, { model: 'Lead', id: lead.id, from: [lead.status], to: 'survey_scheduled', actor: sys, action: 'lead.survey_scheduled', data: { firstContactAt: lead.firstContactAt ?? uow.now } })
  }
  if (visit.type === 'install' && visit.installationId) {
    const inst = await tx.installation.findUnique({ where: { id: visit.installationId } })
    if (inst?.status === 'awaiting_site_prep' && !inst.overrideReason) throw new DomainError(Codes.GUARD_FAILED, 'The get-ready checklist is not done. Tick the items or override with a reason first.')
    if (inst && ['ready_to_schedule', 'awaiting_site_prep'].includes(inst.status)) await transition(uow, { model: 'Installation', id: inst.id, from: [inst.status], to: 'scheduled', actor, action: 'installation.scheduled', data: { targetDate: visit.scheduledDate } })
  }
  if ((visit.type === 'service' || visit.type === 'maintenance') && visit.ticketId) {
    const t = await tx.serviceTicket.findUnique({ where: { id: visit.ticketId } })
    if (t && ['open', 'triaged', 'reopened'].includes(t.status)) await transition(uow, { model: 'ServiceTicket', id: t.id, from: [t.status], to: 'visit_scheduled', actor, action: 'ticket.visit_scheduled', data: { firstResponseAt: t.firstResponseAt ?? uow.now } })
  }
}

/** Change the crew on a booked visit, keeping its slot (P22 assign). */
export async function assignVisit(uow: UnitOfWork, actor: Actor, input: { visitId: string; technicianIds: string[]; expectedVersion?: number | null }) {
  requirePermission(actor, 'canManageVisits')
  const tx = uow.tx
  const crew = await checkCrew(tx, input.technicianIds)
  const visit = await lockRow<any>(tx, 'Visit', input.visitId)
  if (!OPEN.includes(visit.status)) throw new DomainError(Codes.INVALID_TRANSITION, 'This visit is closed.', { currentStatus: visit.status })
  if (input.expectedVersion !== undefined && input.expectedVersion !== null && input.expectedVersion !== visit.version) throw new DomainError(Codes.STALE_STATE, 'This was changed by someone else. Reload and try again.', { currentVersion: visit.version })
  if (visit.scheduledDate && visit.slotIndex !== null) {
    await freeSlots(tx, visit.id)
    await takeSlots(tx, visit.id, visit.scheduledDate.toISOString().slice(0, 10), visit.slotIndex, crew)
  }
  await tx.visit.update({ where: { id: visit.id }, data: { technicians: { set: crew.map(id => ({ id })) }, version: { increment: 1 } } })
  auditChange(uow, actor, 'Visit', visit.id, 'visit.assigned', { technicianIds: crew })
  return tx.visit.findUnique({ where: { id: visit.id } })
}

const onCrew = async (tx: Tx, actor: Actor, visitId: string) => {
  if (actor.kind !== 'user') return
  if (actor.permissions.has('canManageVisits')) return
  const n = await tx.visit.count({ where: { id: visitId, technicians: { some: { id: actor.userId } } } })
  if (!n) throw new DomainError(Codes.NOT_AUTHORIZED, 'You are not on this visit.')
}

export async function startTravel(uow: UnitOfWork, actor: Actor, input: { visitId: string; expectedVersion?: number | null }) {
  requirePermission(actor, 'canDoFieldWork', 'canManageVisits')
  await onCrew(uow.tx, actor, input.visitId)
  return transition(uow, { model: 'Visit', id: input.visitId, from: ['scheduled'], to: 'en_route', expectedVersion: input.expectedVersion, actor, action: 'visit.en_route' })
}

/** P25: check in with time and location. */
export async function checkInVisit(uow: UnitOfWork, actor: Actor, input: { visitId: string; lat?: string | null; lng?: string | null; expectedVersion?: number | null }) {
  requirePermission(actor, 'canDoFieldWork', 'canManageVisits')
  await onCrew(uow.tx, actor, input.visitId)
  const lat = input.lat ? dec(input.lat, 'Latitude') : null
  const lng = input.lng ? dec(input.lng, 'Longitude') : null
  if (lat !== null && Math.abs(Number(lat)) > 90) throw new DomainError(Codes.INVALID_INPUT, 'Latitude is out of range.')
  if (lng !== null && Math.abs(Number(lng)) > 180) throw new DomainError(Codes.INVALID_INPUT, 'Longitude is out of range.')
  const visit = await transition<any>(uow, { model: 'Visit', id: input.visitId, from: ['scheduled', 'en_route'], to: 'on_site', expectedVersion: input.expectedVersion, actor, action: 'visit.on_site', data: { checkInAt: uow.now, checkInLat: lat, checkInLng: lng } })
  if (visit.installationId && visit.type === 'install') {
    const inst = await uow.tx.installation.findUnique({ where: { id: visit.installationId } })
    if (inst?.status === 'scheduled') await transition(uow, { model: 'Installation', id: inst.id, from: ['scheduled'], to: 'in_progress', actor, action: 'installation.in_progress' })
  }
  if (visit.ticketId) {
    const t = await uow.tx.serviceTicket.findUnique({ where: { id: visit.ticketId } })
    if (t && ['visit_scheduled', 'triaged', 'open', 'reopened'].includes(t.status)) await transition(uow, { model: 'ServiceTicket', id: t.id, from: [t.status], to: 'in_progress', actor, action: 'ticket.in_progress', data: { firstResponseAt: t.firstResponseAt ?? uow.now } })
  }
  return visit
}

export async function checklistFor(tx: Tx, visit: { type: string; siteId: string | null; installationId: string | null }) {
  let kind = CHECKLIST_FOR[visit.type] ?? 'service'
  if (visit.type === 'survey' && visit.siteId) {
    const site = await tx.site.findUnique({ where: { id: visit.siteId } })
    if (site && ['school', 'hotel', 'hospital', 'restaurant'].includes(site.siteType)) kind = 'survey_kitchen'
  }
  if (visit.type === 'install' && visit.installationId) {
    const inst = await tx.installation.findUnique({ where: { id: visit.installationId }, select: { productId: true } })
    const spec = inst?.productId ? await tx.digesterSpec.findUnique({ where: { productId: inst.productId }, include: { installTemplate: { include: { items: { orderBy: { sortOrder: 'asc' } } } } } }) : null
    if (spec?.installTemplate?.isActive) return spec.installTemplate
  }
  return tx.checklistTemplate.findFirst({ where: { kind, isActive: true }, include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { createdAt: 'asc' } })
}

type Answer = { itemId: string; value: unknown }

/** Saves the answers as a snapshot of prompts and answers, and returns any required item left empty. */
async function snapshotAnswers(tx: Tx, visit: any, answers: Answer[]) {
  const template = await checklistFor(tx, visit)
  const byId = new Map((answers ?? []).map(a => [a.itemId, a.value]))
  const items = template?.items ?? []
  const snapshot = items.map(i => ({ itemId: i.id, prompt: i.prompt, inputType: i.inputType, unit: i.unit, isRequired: i.isRequired, value: byId.has(i.id) ? byId.get(i.id) : null }))
  const missing = snapshot.filter(s => s.isRequired && (s.value === null || s.value === undefined || s.value === '')).map(s => s.prompt)
  return { snapshot: { templateId: template?.id ?? null, templateName: template?.name ?? '', items: snapshot }, missing }
}

/** P26: save checklist answers while on site (kept in the visit; not yet completing). */
export async function saveChecklist(uow: UnitOfWork, actor: Actor, input: { visitId: string; answers: Answer[] }) {
  requirePermission(actor, 'canDoFieldWork', 'canManageVisits')
  await onCrew(uow.tx, actor, input.visitId)
  const visit = await lockRow<any>(uow.tx, 'Visit', input.visitId)
  if (!['on_site', 'en_route', 'scheduled'].includes(visit.status)) throw new DomainError(Codes.INVALID_TRANSITION, 'This visit is closed.', { currentStatus: visit.status })
  const { snapshot } = await snapshotAnswers(uow.tx, visit, input.answers)
  await uow.tx.visit.update({ where: { id: visit.id }, data: { checklistAnswers: snapshot as never } })
  return { saved: snapshot.items.length }
}

/** P28: parts from the van; stock goes down in the same transaction. */
export async function logPartUsage(uow: UnitOfWork, actor: Actor, input: { visitId: string; productId: string; quantity: number; locationId?: string | null; chargeable?: boolean }) {
  requirePermission(actor, 'canDoFieldWork', 'canManageVisits')
  const tx = uow.tx
  await onCrew(tx, actor, input.visitId)
  const visit = await tx.visit.findUnique({ where: { id: input.visitId } })
  if (!visit || !['on_site', 'en_route', 'scheduled'].includes(visit.status)) throw new DomainError(Codes.INVALID_TRANSITION, 'Parts are logged on an open visit.')
  const product = await tx.product.findUnique({ where: { id: input.productId } })
  if (!product) throw new DomainError(Codes.NOT_FOUND, 'Part not found.')
  const quantity = int(input.quantity, 'Quantity', { min: 1, max: 1000 })
  const van = input.locationId ? await tx.stockLocation.findUnique({ where: { id: input.locationId } }) : actor.kind === 'user' ? await tx.stockLocation.findFirst({ where: { technicianId: actor.userId, isActive: true } }) : null
  if (!van) throw new DomainError(Codes.INVALID_INPUT, 'Pick the stock location the part came from.')
  await consume(tx, product.id, van.id, quantity, { refType: 'Visit', refId: visit.id, userId: actorUserId(actor), reason: `Used on ${visit.number}` })
  const row = await tx.partUsage.create({ data: { visitId: visit.id, productId: product.id, fromLocationId: van.id, quantity, unitAmount: product.priceAmount, chargeable: input.chargeable ?? false } })
  auditChange(uow, actor, 'PartUsage', row.id, 'visit.part_used', { productId: product.id, quantity, locationId: van.id })
  return row
}

export type SurveyInput = { feasibility: string; measuredFeedKgPerDay?: string; waterOk?: boolean; spaceOk?: boolean; soilType?: string; floodRisk?: string; pipeRunM?: string; pumpNeeded?: boolean; extraWork?: string[]; notes?: string; recommendedProductId?: string | null }

/**
 * P31: complete, or mark nobody home. Completion needs required checklist answers; a survey needs its
 * result; commissioning goes through commissionSystem (training and signature).
 */
export async function completeVisit(uow: UnitOfWork, actor: Actor, input: { visitId: string; outcome?: 'completed' | 'no_access'; answers?: Answer[]; notes?: string; reason?: string; survey?: SurveyInput; signedName?: string; signature?: string; reading?: any; expectedVersion?: number | null }) {
  requirePermission(actor, 'canDoFieldWork', 'canManageVisits')
  const tx = uow.tx
  await onCrew(tx, actor, input.visitId)
  const visit = await lockRow<any>(tx, 'Visit', input.visitId)
  const outcome = input.outcome ?? 'completed'
  if (outcome === 'no_access') {
    const v = await transition<any>(uow, { model: 'Visit', id: visit.id, from: ['scheduled', 'en_route', 'on_site'], to: 'no_access', expectedVersion: input.expectedVersion, actor, action: 'visit.no_access', reason: str(input.notes || input.reason, 500) || 'Nobody home', data: { outcome: 'no_access', notes: str(input.notes || input.reason, 2000), checkOutAt: uow.now } })
    await freeSlots(tx, visit.id)
    return v
  }
  if (visit.type === 'commissioning') throw new DomainError(Codes.GUARD_FAILED, 'Commissioning visits are completed with Commission system (training and signature).')
  const { snapshot, missing } = await snapshotAnswers(tx, visit, input.answers ?? ((visit.checklistAnswers?.items ?? []) as any[]).map((i: any) => ({ itemId: i.itemId, value: i.value })))
  if (missing.length) throw new DomainError(Codes.GUARD_FAILED, `Answer the required items: ${missing.slice(0, 5).join('; ')}.`, { problems: missing })
  if (visit.type === 'survey') {
    if (!input.survey) throw new DomainError(Codes.INVALID_INPUT, 'Record the survey result.')
    const s = input.survey
    const feasibility = oneOf(s.feasibility, ['feasible', 'feasible_with_work', 'not_feasible'] as const, 'Feasibility')
    await tx.siteSurvey.create({ data: { visitId: visit.id, siteId: visit.siteId, feasibility, measuredFeedKgPerDay: s.measuredFeedKgPerDay ? dec(s.measuredFeedKgPerDay, 'Feed') : null, waterOk: Boolean(s.waterOk), spaceOk: Boolean(s.spaceOk), soilType: str(s.soilType, 60), floodRisk: str(s.floodRisk, 60), pipeRunM: s.pipeRunM ? dec(s.pipeRunM, 'Pipe run') : null, pumpNeeded: Boolean(s.pumpNeeded), extraWork: (s.extraWork ?? []).map(w => str(w, 120)).filter(Boolean), notes: str(s.notes, 2000), recommendedProductId: s.recommendedProductId ?? null } })
  }
  const done = await transition<any>(uow, { model: 'Visit', id: visit.id, from: ['on_site'], to: 'completed', expectedVersion: input.expectedVersion, actor, action: 'visit.completed', data: { outcome: 'completed', notes: str(input.notes, 4000), checklistAnswers: snapshot as never, checkOutAt: uow.now, signedName: str(input.signedName, 120), customerSignature: str(input.signature, 200_000) } })
  await onCompleted(uow, actor, done, input)
  uow.emit('visit.completed', 'Visit', visit.id, { number: visit.number, type: visit.type })
  return done
}

async function onCompleted(uow: UnitOfWork, actor: Actor, visit: any, input: { survey?: SurveyInput; reading?: any }) {
  const tx = uow.tx
  const sys = systemActor('visits')
  if (visit.type === 'survey' && visit.leadId) {
    const lead = await tx.lead.findUnique({ where: { id: visit.leadId } })
    if (lead && ['new', 'contacted', 'survey_scheduled'].includes(lead.status)) await transition(uow, { model: 'Lead', id: lead.id, from: [lead.status], to: 'surveyed', actor: sys, action: 'lead.surveyed' })
  }
  if (visit.type === 'install' && visit.installationId) {
    const inst = await tx.installation.findUnique({ where: { id: visit.installationId } })
    if (inst && ['in_progress', 'scheduled'].includes(inst.status)) await transition(uow, { model: 'Installation', id: inst.id, from: [inst.status], to: 'installed', actor, action: 'installation.installed' })
    if (inst?.orderId) {
      const order = await tx.order.findUnique({ where: { id: inst.orderId } })
      if (order && ['confirmed', 'preparing', 'ready', 'out_for_install', 'delivered'].includes(order.status)) await transition(uow, { model: 'Order', id: order.id, from: [order.status], to: 'installed', actor: sys, action: 'order.installed', data: { deliveredAt: order.deliveredAt ?? uow.now } })
    }
  }
  if (visit.type === 'delivery' && visit.installationId) {
    const inst = await tx.installation.findUnique({ where: { id: visit.installationId } })
    if (inst?.orderId) {
      const { triggerMilestones } = await import('./money')
      await triggerMilestones(uow, inst.orderId, 'on_delivery')
    }
  }
  if (['follow_up', 'maintenance', 'service'].includes(visit.type) && visit.systemId && input.reading) {
    const { recordReading } = await import('./systems')
    await recordReading(uow, actor, { ...input.reading, systemId: visit.systemId, visitId: visit.id, source: 'technician' })
  }
  if (visit.type === 'maintenance' && visit.subscriptionId) await tx.servicePlanSubscription.update({ where: { id: visit.subscriptionId }, data: { visitsUsed: { increment: 1 } } })
  if (visit.type === 'follow_up' && visit.systemId) {
    const { scheduleNextYearly } = await import('./systems')
    await scheduleNextYearly(uow, visit)
  }
}

export async function cancelVisit(uow: UnitOfWork, actor: Actor, input: { visitId: string; reason: string; by?: 'company' | 'customer'; expectedVersion?: number | null }) {
  const reason = str(input.reason, 500)
  if (!reason) throw new DomainError(Codes.INVALID_INPUT, 'Give a reason.')
  const v = await transition<any>(uow, { model: 'Visit', id: input.visitId, from: ['requested', 'scheduled', 'rescheduled', 'no_access', 'en_route'], to: 'cancelled', expectedVersion: input.expectedVersion, actor, action: 'visit.cancelled', reason, data: { cancelReason: reason, cancelledBy: input.by ?? 'company' } })
  await freeSlots(uow.tx, v.id)
  if (v.installationId && v.type === 'install') {
    const inst = await uow.tx.installation.findUnique({ where: { id: v.installationId } })
    if (inst?.status === 'scheduled') await transition(uow, { model: 'Installation', id: inst.id, from: ['scheduled'], to: 'ready_to_schedule', actor, action: 'installation.unscheduled', reason })
  }
  return v
}

export async function staffCancelVisit(uow: UnitOfWork, actor: Actor, input: { visitId: string; reason: string; expectedVersion?: number | null }) {
  requirePermission(actor, 'canManageVisits')
  return cancelVisit(uow, actor, { ...input, by: 'company' })
}

export async function addTimeOff(uow: UnitOfWork, actor: Actor, input: { technicianId: string; date: string; reason?: string }) {
  requirePermission(actor, 'canManageVisits')
  const tx = uow.tx
  const date = new Date(`${str(input.date, 10)}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) throw new DomainError(Codes.INVALID_INPUT, 'Pick a date.')
  const booked = await tx.visitSlotUsage.count({ where: { technicianId: input.technicianId, date } })
  if (booked) throw new DomainError(Codes.CAPACITY_FULL, `This technician has ${booked} visit slot(s) that day. Move them first.`)
  const row = await tx.technicianTimeOff.create({ data: { technicianId: input.technicianId, date, reason: str(input.reason, 200) } })
  auditChange(uow, actor, 'TechnicianTimeOff', row.id, 'timeoff.added', { date: input.date })
  return row
}

export async function removeTimeOff(uow: UnitOfWork, actor: Actor, input: { id: string }) {
  requirePermission(actor, 'canManageVisits')
  await uow.tx.technicianTimeOff.delete({ where: { id: input.id } })
  auditChange(uow, actor, 'TechnicianTimeOff', input.id, 'timeoff.removed')
  return { id: input.id }
}

// ---------- Customer by code (S16) ----------

export async function visitByCode(tx: Tx, code: string) {
  const v = await tx.visit.findUnique({ where: { publicCode: code }, include: { technicians: { select: { name: true } }, site: { select: { label: true, city: true, addressLine: true } } } })
  if (!v) return null
  const settings = await getSettings(tx)
  const cutoff = v.windowStart ? v.windowStart.getTime() - settings.visitCancelCutoffHours * 3_600_000 : null
  return { ...v, canChange: ['scheduled', 'rescheduled', 'requested'].includes(v.status) && (cutoff === null || Date.now() < cutoff), cutoffHours: settings.visitCancelCutoffHours, freeChangeUntil: cutoff ? new Date(cutoff) : null }
}

/** Customers reschedule within the cut-off; a late change keeps a paid survey fee (setting). */
export async function rescheduleByCode(uow: UnitOfWork, actor: Actor, input: { code: string; date: string; slotIndex: number }) {
  const tx = uow.tx
  const v = await tx.visit.findUnique({ where: { publicCode: input.code }, include: { technicians: { select: { id: true } } } })
  if (!v) throw new DomainError(Codes.NOT_FOUND, 'Visit not found.')
  const settings = await getSettings(tx)
  if (v.windowStart && uow.now.getTime() > v.windowStart.getTime() - settings.visitCancelCutoffHours * 3_600_000) throw new DomainError(Codes.GUARD_FAILED, `Changes are free up to ${settings.visitCancelCutoffHours} hours before. Call us to move it now.`)
  const { openSlots } = await import('./scheduling')
  const slot = (await openSlots(tx, { from: input.date, days: 1, branchId: v.branchId })).find(s => s.slotIndex === input.slotIndex)
  if (!slot) throw new DomainError(Codes.CAPACITY_FULL, 'That time is no longer free.')
  const keep = v.technicians.map(t => t.id).filter(id => slot.technicianIds.includes(id))
  const crew = keep.length === v.technicians.length && keep.length ? keep : [slot.technicianIds[0]]
  await lockRow(tx, 'Visit', v.id)
  await freeSlots(tx, v.id)
  const window = await takeSlots(tx, v.id, input.date, input.slotIndex, crew)
  const out = await transition<any>(uow, { model: 'Visit', id: v.id, from: ['scheduled', 'rescheduled', 'requested'], to: 'scheduled', actor, action: 'visit.rescheduled', reason: 'Customer moved the visit', data: { scheduledDate: new Date(`${input.date}T00:00:00.000Z`), slotIndex: input.slotIndex, windowStart: window.windowStart, windowEnd: window.windowEnd, technicians: { set: crew.map(id => ({ id })) } } })
  uow.emit('visit.scheduled', 'Visit', v.id, { number: v.number, type: v.type, windowStart: window.windowStart.toISOString(), publicCode: v.publicCode })
  return out
}

export async function cancelByCode(uow: UnitOfWork, actor: Actor, input: { code: string; reason?: string }) {
  const tx = uow.tx
  const v = await tx.visit.findUnique({ where: { publicCode: input.code } })
  if (!v) throw new DomainError(Codes.NOT_FOUND, 'Visit not found.')
  const settings = await getSettings(tx)
  const late = Boolean(v.windowStart && uow.now.getTime() > v.windowStart.getTime() - settings.visitCancelCutoffHours * 3_600_000)
  if (late && !settings.keepFeeOnLateCancel) throw new DomainError(Codes.GUARD_FAILED, 'It is too close to the visit to cancel online. Call us.')
  const out = await cancelVisit(uow, actor, { visitId: v.id, reason: str(input.reason, 500) || 'Cancelled by the customer', by: 'customer' })
  return { ...out, feeKept: late && v.feePaid && v.feeAmount > 0 }
}

/**
 * Public survey booking (S5): a requested visit put in an open slot with the first free technician.
 * A survey fee opens a session the customer pays at booking (W2.2).
 */
export async function bookSurveyForLead(uow: UnitOfWork, actor: Actor, input: { leadId: string; date: string; slotIndex: number }) {
  const tx = uow.tx
  const lead = await tx.lead.findUnique({ where: { id: input.leadId } })
  if (!lead) throw new DomainError(Codes.NOT_FOUND, 'Lead not found.')
  const { openSlots } = await import('./scheduling')
  const slot = (await openSlots(tx, { from: input.date, days: 1, branchId: lead.branchId })).find(s => s.slotIndex === input.slotIndex)
  if (!slot) throw new DomainError(Codes.CAPACITY_FULL, 'That time is no longer free. Pick another.')
  const settings = await getSettings(tx)
  const visit = await tx.visit.create({ data: { number: await nextNumber(tx, 'V'), type: 'survey', status: 'requested', publicCode: publicCode('V'), feeAmount: settings.surveyFeeAmount, leadId: lead.id, customerId: lead.customerId, siteId: lead.siteId, branchId: lead.branchId } })
  auditChange(uow, actor, 'Visit', visit.id, 'visit.created', { type: 'survey', by: 'customer' }, { toStatus: 'requested' })
  const window = await takeSlots(tx, visit.id, input.date, input.slotIndex, [slot.technicianIds[0]])
  const booked = await transition<any>(uow, { model: 'Visit', id: visit.id, from: ['requested'], to: 'scheduled', actor, action: 'visit.scheduled', data: { scheduledDate: new Date(`${input.date}T00:00:00.000Z`), slotIndex: input.slotIndex, windowStart: window.windowStart, windowEnd: window.windowEnd, technicians: { set: [{ id: slot.technicianIds[0] }] } } })
  await onScheduled(uow, systemActor('booking'), booked)
  let sessionCode: string | null = null
  if (settings.surveyFeeAmount > 0) {
    const s = await openSession(uow, { code: 'bank_transfer', amount: settings.surveyFeeAmount, currencyCode: settings.currencyCode, purpose: 'survey_fee', description: `Survey ${visit.number}`, target: { visitId: visit.id, customerId: lead.customerId } })
    await tx.paymentSession.update({ where: { id: s.id }, data: { providerId: null } })
    sessionCode = s.publicCode
  }
  uow.emit('visit.scheduled', 'Visit', visit.id, { number: visit.number, type: 'survey', windowStart: window.windowStart.toISOString(), publicCode: visit.publicCode })
  return { visitCode: booked.publicCode, windowStart: window.windowStart, windowEnd: window.windowEnd, sessionCode, feeAmount: settings.surveyFeeAmount }
}
