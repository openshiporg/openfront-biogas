import type { Tx } from '../lib/db'
import type { UnitOfWork } from '../lib/unitOfWork'
import { DomainError, Codes } from '../lib/errors'
import { auditChange, transition } from '../lib/cas'
import { actorUserId, requirePermission, systemActor, type Actor } from '../lib/actor'
import { nextNumber, publicCode } from '../lib/sequence'
import { addWorkingDays } from '../lib/time'
import { getSettings } from './settings'
import { normEmail, normPhone, oneOf, req, str } from './util'

/** W1: enquiry to lead. Every source makes the same lead; it is routed by service area and rotation. */
export const LEAD_SOURCES = ['website', 'phone', 'walk_in', 'field_agent', 'referral', 'dealer', 'import', 'event'] as const
export const INTERESTS = ['home', 'farm', 'institution', 'parts', 'service'] as const
const OPEN = ['new', 'contacted', 'survey_scheduled', 'surveyed', 'quoted']

/** A postcode matches an area by prefix; otherwise region (and country) must match. */
export async function matchArea(tx: Tx, where: { postcode?: string; region?: string; country?: string }) {
  const areas = await tx.serviceArea.findMany({ where: { isActive: true }, include: { branch: { select: { id: true, name: true, isActive: true } } } })
  const pc = (where.postcode ?? '').replace(/\s+/g, '').toUpperCase()
  const region = (where.region ?? '').trim().toLowerCase()
  const byPostcode = pc
    ? areas
        .map(a => ({ a, len: Math.max(0, ...((Array.isArray(a.postcodes) ? a.postcodes : []) as string[]).map(p => String(p).replace(/\s+/g, '').toUpperCase()).filter(p => p && pc.startsWith(p)).map(p => p.length)) }))
        .filter(x => x.len > 0)
        .sort((x, y) => y.len - x.len)[0]?.a
    : undefined
  const byRegion = !byPostcode && region ? areas.find(a => a.region.trim().toLowerCase() === region || a.name.trim().toLowerCase() === region) : undefined
  return byPostcode ?? byRegion ?? null
}

/** Next agent in rotation in the branch (least recently assigned first). */
export async function nextAgent(tx: Tx, branchId: string | null) {
  const agents = await tx.user.findMany({
    where: { isActive: true, role: { canManageLeads: true, canSeeAllLeads: false }, ...(branchId ? { branchId } : {}) },
    orderBy: [{ lastLeadAssignedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
    select: { id: true },
    take: 1,
  })
  if (agents[0]) return agents[0].id
  // Nobody in rotation there: any lead manager.
  const any = await tx.user.findFirst({ where: { isActive: true, role: { canManageLeads: true } }, orderBy: [{ lastLeadAssignedAt: { sort: 'asc', nulls: 'first' } }], select: { id: true } })
  return any?.id ?? null
}

const referralCodeFor = () => publicCode('R', 2).replace(/-/g, '').slice(0, 9)

export type ContactInput = { name: string; phone?: string; email?: string; type?: string; organisationName?: string; preferredLanguage?: string; preferredContact?: string; contactConsent?: boolean }

/** Same phone or email is the same customer. */
export async function findOrCreateCustomer(uow: UnitOfWork, actor: Actor, input: ContactInput) {
  const tx = uow.tx
  const phone = normPhone(input.phone)
  const email = normEmail(input.email)
  if (!phone && !email) throw new DomainError(Codes.INVALID_INPUT, 'A phone number or email is needed so we can reach you.')
  const existing = await tx.customer.findFirst({ where: { OR: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])] }, orderBy: { createdAt: 'asc' } })
  if (existing) {
    if (input.contactConsent && !existing.contactConsent) await tx.customer.update({ where: { id: existing.id }, data: { contactConsent: true, consentAt: uow.now } })
    return existing
  }
  const settings = await getSettings(tx)
  const customer = await tx.customer.create({
    data: {
      number: await nextNumber(tx, 'C'),
      name: req(input.name, 'Name', 200),
      type: ['household', 'farm', 'institution'].includes(String(input.type)) ? String(input.type) : 'household',
      organisationName: str(input.organisationName, 200),
      phone,
      email,
      preferredLanguage: str(input.preferredLanguage, 10) || 'en',
      preferredContact: ['call', 'sms', 'whatsapp', 'email'].includes(String(input.preferredContact)) ? String(input.preferredContact) : 'whatsapp',
      contactConsent: Boolean(input.contactConsent),
      consentAt: input.contactConsent ? uow.now : null,
      currencyCode: settings.currencyCode,
      referralCode: referralCodeFor(),
    },
  })
  auditChange(uow, actor, 'Customer', customer.id, 'customer.created', { number: customer.number })
  return customer
}

export type SiteInput = { label?: string; addressLine?: string; city?: string; region?: string; country?: string; postcode?: string; lat?: string; lng?: string; directions?: string; siteType?: string; animals?: Record<string, number>; kitchenWasteKgPerDay?: string; peopleServed?: number; waterSource?: string; monthlyFuelSpendAmount?: number; currentFuels?: string[] }

export async function createSite(tx: Tx, customerId: string, input: SiteInput, serviceAreaId: string | null) {
  const animals = Object.fromEntries(Object.entries(input.animals ?? {}).filter(([k]) => ['cattle', 'pigs', 'poultry', 'other'].includes(k)).map(([k, v]) => [k, Math.max(0, Math.floor(Number(v) || 0))]))
  return tx.site.create({
    data: {
      customerId,
      serviceAreaId,
      label: str(input.label, 80) || 'Home',
      addressLine: str(input.addressLine, 300),
      city: str(input.city, 120),
      region: str(input.region, 120),
      country: str(input.country, 60),
      postcode: str(input.postcode, 20),
      lat: input.lat ? String(input.lat) : null,
      lng: input.lng ? String(input.lng) : null,
      directions: str(input.directions, 1000),
      siteType: ['home', 'farm', 'school', 'hotel', 'hospital', 'restaurant', 'other'].includes(String(input.siteType)) ? String(input.siteType) : 'home',
      animals,
      kitchenWasteKgPerDay: input.kitchenWasteKgPerDay ? String(input.kitchenWasteKgPerDay) : null,
      peopleServed: input.peopleServed ? Math.floor(Number(input.peopleServed)) : null,
      waterSource: str(input.waterSource, 120),
      monthlyFuelSpendAmount: Math.max(0, Math.floor(Number(input.monthlyFuelSpendAmount) || 0)),
      currentFuels: Array.isArray(input.currentFuels) ? input.currentFuels.map(f => str(f, 40)).filter(Boolean) : [],
    },
  })
}

export type LeadInput = {
  contact: ContactInput
  site: SiteInput
  source: (typeof LEAD_SOURCES)[number]
  interest: (typeof INTERESTS)[number]
  message?: string
  assessmentId?: string | null
  referralCode?: string | null
  referrerCustomerId?: string | null
  utm?: Record<string, string>
  assignedToId?: string | null
}

export async function createLeadCore(uow: UnitOfWork, actor: Actor, input: LeadInput) {
  const tx = uow.tx
  const settings = await getSettings(tx)
  const area = await matchArea(tx, input.site)
  const customer = await findOrCreateCustomer(uow, actor, input.contact)
  const site = await createSite(tx, customer.id, input.site, area?.id ?? null)
  const branchId = area?.branchId ?? null
  const assignedToId = input.assignedToId ?? (await nextAgent(tx, branchId))
  if (assignedToId) await tx.user.update({ where: { id: assignedToId }, data: { lastLeadAssignedAt: uow.now } })
  const lead = await tx.lead.create({
    data: {
      number: await nextNumber(tx, 'L'),
      status: 'new',
      source: input.source,
      interest: input.interest,
      message: str(input.message, 4000),
      firstResponseDueAt: addWorkingDays(uow.now, settings.leadResponseWorkingDays),
      utm: input.utm ?? {},
      customerId: customer.id,
      siteId: site.id,
      branchId,
      assignedToId,
    },
  })
  if (input.assessmentId) {
    const a = await tx.sizingAssessment.findUnique({ where: { id: input.assessmentId }, select: { leadId: true } })
    if (a && !a.leadId) await tx.sizingAssessment.update({ where: { id: input.assessmentId }, data: { leadId: lead.id, siteId: site.id } })
  }
  // A referral code typed in the form, or a referrer picked by staff, ties the lead to a Referral (W1.2, W13).
  const code = str(input.referralCode, 20).toUpperCase().replace(/[^0-9A-Z]/g, '')
  const referrer = input.referrerCustomerId ? await tx.customer.findUnique({ where: { id: input.referrerCustomerId } }) : code ? await tx.customer.findUnique({ where: { referralCode: code } }) : null
  if (referrer && referrer.id !== customer.id) {
    const referral = await tx.referral.create({ data: { code: referrer.referralCode ?? code, status: 'pending', referrerId: referrer.id, currencyCode: settings.currencyCode, rewardAmount: settings.referralRewardAmount } })
    await tx.lead.update({ where: { id: lead.id }, data: { referralId: referral.id } })
    auditChange(uow, actor, 'Referral', referral.id, 'referral.created', { leadId: lead.id }, { toStatus: 'pending' })
  }
  auditChange(uow, actor, 'Lead', lead.id, 'lead.created', { source: input.source, number: lead.number }, { toStatus: 'new' })
  uow.emit('lead.created', 'Lead', lead.id, { number: lead.number, source: input.source, interest: input.interest, served: Boolean(area) })
  return { lead, customer, site, area }
}

export function parseLeadInput(raw: any, source: string): LeadInput {
  const r = raw ?? {}
  return {
    contact: { name: req(r.name, 'Name', 200), phone: r.phone, email: r.email, type: r.customerType ?? (r.interest === 'institution' ? 'institution' : r.interest === 'farm' ? 'farm' : 'household'), organisationName: r.organisationName, preferredLanguage: r.preferredLanguage, preferredContact: r.preferredContact, contactConsent: Boolean(r.contactConsent) },
    site: { addressLine: r.addressLine, city: r.city, region: r.region, country: r.country, postcode: r.postcode, lat: r.lat, lng: r.lng, directions: r.directions, siteType: r.siteType, animals: r.animals, kitchenWasteKgPerDay: r.kitchenWasteKgPerDay, peopleServed: r.peopleServed, monthlyFuelSpendAmount: r.monthlyFuelSpendAmount, currentFuels: r.currentFuels, waterSource: r.waterSource },
    source: oneOf(source, LEAD_SOURCES, 'Source'),
    interest: oneOf(r.interest ?? 'home', INTERESTS, 'Interest'),
    message: r.message,
    assessmentId: r.assessmentId ?? null,
    referralCode: r.referralCode ?? null,
    referrerCustomerId: r.referrerCustomerId ?? null,
    utm: r.utm && typeof r.utm === 'object' ? Object.fromEntries(Object.entries(r.utm).slice(0, 10).map(([k, v]) => [String(k).slice(0, 40), String(v).slice(0, 200)])) : {},
    assignedToId: r.assignedToId ?? null,
  }
}

/** Manual lead moves (4.1). The other moves happen as side effects of visits, quotes and orders. */
export async function transitionLead(uow: UnitOfWork, actor: Actor, input: { leadId: string; to: string; reason?: string; expectedVersion?: number | null }) {
  requirePermission(actor, 'canManageLeads')
  const to = oneOf(input.to, ['contacted', 'lost', 'unqualified', 'new'] as const, 'Move')
  const reason = str(input.reason, 500)
  const from = to === 'contacted' ? ['new'] : to === 'new' ? ['lost'] : OPEN
  if ((to === 'lost' || to === 'unqualified') && !reason) throw new DomainError(Codes.INVALID_INPUT, 'Give a reason.')
  await scopeLead(uow.tx, actor, input.leadId)
  const lead = await transition<any>(uow, {
    model: 'Lead', id: input.leadId, from, to, expectedVersion: input.expectedVersion, actor, action: `lead.${to}`, reason,
    data: row => (to === 'contacted' ? { firstContactAt: row.firstContactAt ?? uow.now } : to === 'new' ? { lostReason: '' } : { lostReason: reason }),
  })
  if (to === 'contacted') await uow.tx.leadActivity.create({ data: { type: 'status', summary: 'First contact made', outcome: reason, leadId: lead.id, userId: actorUserId(actor) } })
  return lead
}

/** An agent without canSeeAllLeads only acts on their own leads. */
export async function scopeLead(tx: Tx, actor: Actor, leadId: string) {
  const lead = await tx.lead.findUnique({ where: { id: leadId }, select: { id: true, assignedToId: true } })
  if (!lead) throw new DomainError(Codes.NOT_FOUND, 'Lead not found.')
  if (actor.kind === 'user' && !actor.permissions.has('canSeeAllLeads') && lead.assignedToId !== actor.userId) throw new DomainError(Codes.NOT_AUTHORIZED, 'This lead is assigned to someone else.')
  return lead
}

export async function assignLead(uow: UnitOfWork, actor: Actor, input: { leadId: string; userId: string; expectedVersion?: number | null }) {
  requirePermission(actor, 'canSeeAllLeads')
  const user = await uow.tx.user.findUnique({ where: { id: input.userId }, include: { role: true } })
  if (!user?.isActive || !user.role?.canManageLeads) throw new DomainError(Codes.INVALID_INPUT, 'Pick an active sales agent.')
  const lead = await uow.tx.lead.findUnique({ where: { id: input.leadId } })
  if (!lead) throw new DomainError(Codes.NOT_FOUND, 'Lead not found.')
  if (input.expectedVersion !== undefined && input.expectedVersion !== null && input.expectedVersion !== lead.version) throw new DomainError(Codes.STALE_STATE, 'This was changed by someone else. Reload and try again.')
  const res = await uow.tx.lead.updateMany({ where: { id: lead.id, version: lead.version }, data: { assignedToId: user.id, version: { increment: 1 } } })
  if (res.count !== 1) throw new DomainError(Codes.STALE_STATE, 'This was changed by someone else. Reload and try again.')
  await uow.tx.user.update({ where: { id: user.id }, data: { lastLeadAssignedAt: uow.now } })
  auditChange(uow, actor, 'Lead', lead.id, 'lead.assigned', { from: lead.assignedToId, to: user.id })
  return uow.tx.lead.findUnique({ where: { id: lead.id } })
}

/**
 * The system sends nothing (section 7): staff tap a wa.me / sms: / tel: / mailto: link and we log that
 * they reached out. On a lead it is also a LeadActivity, and the first one sets firstContactAt. On an
 * instalment it marks it reminded (W11.1).
 */
export async function logContact(uow: UnitOfWork, actor: Actor, input: { customerId?: string | null; channel: string; purpose: string; note?: string; relatedType?: string; relatedId?: string }) {
  requirePermission(actor, 'canAccessDashboard')
  const channel = oneOf(input.channel, ['call', 'sms', 'whatsapp', 'email', 'in_person'] as const, 'Channel')
  const purpose = oneOf(input.purpose, ['quote_link', 'visit_date', 'payment_reminder', 'follow_up', 'pay_link', 'other'] as const, 'Purpose')
  const relatedType = str(input.relatedType, 40)
  const relatedId = str(input.relatedId, 60)
  let customerId = input.customerId ?? null
  if (relatedType === 'Lead' && relatedId) {
    const lead = await scopeLead(uow.tx, actor, relatedId)
    const row = await uow.tx.lead.findUnique({ where: { id: lead.id } })
    customerId = customerId ?? row?.customerId ?? null
    await uow.tx.leadActivity.create({ data: { type: channel === 'in_person' ? 'visit' : channel, summary: str(input.note, 1000) || `${channel} (${purpose.replace('_', ' ')})`, leadId: lead.id, userId: actorUserId(actor) } })
    if (row && !row.firstContactAt) await uow.tx.lead.update({ where: { id: row.id }, data: { firstContactAt: uow.now } })
  }
  if (relatedType === 'Installment' && relatedId) {
    const inst = await uow.tx.installment.findUnique({ where: { id: relatedId }, include: { plan: { select: { customerId: true } } } })
    if (inst) {
      await uow.tx.installment.update({ where: { id: inst.id }, data: { remindedAt: uow.now } })
      customerId = customerId ?? inst.plan?.customerId ?? null
    }
  }
  if (relatedType === 'ServiceTicket' && relatedId) {
    await uow.tx.ticketEvent.create({ data: { type: 'call', body: str(input.note, 2000) || `${channel} with the customer`, ticketId: relatedId, userId: actorUserId(actor) } })
    const t = await uow.tx.serviceTicket.findUnique({ where: { id: relatedId } })
    if (t && !t.firstResponseAt) await uow.tx.serviceTicket.update({ where: { id: t.id }, data: { firstResponseAt: uow.now } })
  }
  const row = await uow.tx.contactLog.create({ data: { channel, purpose, note: str(input.note, 2000), customerId, userId: actorUserId(actor), relatedType, relatedId, at: uow.now } })
  auditChange(uow, actor, 'ContactLog', row.id, 'contact.logged', { channel, purpose, relatedType, relatedId })
  return row
}

export { systemActor }
