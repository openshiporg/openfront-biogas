import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTestDatabase, testPrisma } from '../helpers/db'
import { onboardCompany } from '../helpers/company'
import { permissionNames, type Permission } from '../../features/keystone/access'
import type { Actor } from '../../features/keystone/lib/actor'
import { UnitOfWork } from '../../features/keystone/lib/unitOfWork'
import { transitionLead } from '../../features/keystone/services/leads'
import { cancelQuote, approveQuote } from '../../features/keystone/services/quotes'
import { fulfilOrder } from '../../features/keystone/services/orders'
import { transitionInstallation, setSystemStatus } from '../../features/keystone/services/systems'
import { transitionTicket } from '../../features/keystone/services/tickets'
import { startTravel, checkInVisit, staffCancelVisit, completeVisit } from '../../features/keystone/services/visits'
import { transitionPurchaseOrder, transitionIncentiveApplication, approveCommission, grantReferralReward } from '../../features/keystone/services/backoffice'

type Move = { action: string; from: string[]; args?: Record<string, unknown> }
type Matrix = {
  name: string; delegate: string; states: string[]; permissions: Permission[]; moves: Move[]
  call: (uow: UnitOfWork, actor: Actor, id: string, move: Move) => Promise<unknown>
}
const prisma = hasTestDatabase ? testPrisma(2) : (null as never)
let actors: { role: string; actor: Actor & { kind: 'user' } }[] = []

// These are the public manual moves. Booking, acceptance, payment capture, commissioning and their
// side-effect transitions are exercised through their complete workflows in sale and money-care.
const matrices: Matrix[] = [
  { name: 'lead', delegate: 'lead', states: ['new', 'contacted', 'survey_scheduled', 'surveyed', 'quoted', 'won', 'lost', 'unqualified'], permissions: ['canManageLeads'], moves: [
    { action: 'contacted', from: ['new'] }, { action: 'new', from: ['lost'] },
    ...['lost', 'unqualified'].map(action => ({ action, from: ['new', 'contacted', 'survey_scheduled', 'surveyed', 'quoted'] })),
  ], call: (u, a, id, m) => transitionLead(u, a, { leadId: id, to: m.action, reason: 'Customer called' }) },
  { name: 'quote cancellation', delegate: 'quote', states: ['draft', 'pending_approval', 'approved', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'superseded', 'cancelled'], permissions: ['canManageQuotes', 'canManageTickets'], moves: [{ action: 'cancel', from: ['draft', 'pending_approval', 'approved'] }], call: (u, a, id) => cancelQuote(u, a, { quoteId: id, reason: 'Customer called' }) },
  { name: 'quote approval', delegate: 'quote', states: ['draft', 'pending_approval', 'approved', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'superseded', 'cancelled'], permissions: ['canApproveDiscounts'], moves: [{ action: 'approve', from: ['pending_approval'] }], call: (u, a, id) => approveQuote(u, a, { quoteId: id }) },
  { name: 'order fulfilment', delegate: 'order', states: ['pending_payment', 'confirmed', 'preparing', 'ready', 'shipped', 'out_for_install', 'delivered', 'installed', 'completed', 'closed', 'cancelled'], permissions: ['canManageOrders', 'canManageInventory'], moves: [
    { action: 'pick', from: ['confirmed'] }, { action: 'pack', from: ['preparing'] },
    { action: 'ship', from: ['ready'], args: { fulfilment: 'delivery' } },
    { action: 'out_for_install', from: ['ready'], args: { fulfilment: 'install' } },
    { action: 'handover', from: ['ready'], args: { fulfilment: 'pickup' } },
    { action: 'deliver', from: ['shipped', 'out_for_install'] },
    { action: 'complete', from: ['delivered'], args: { fulfilment: 'delivery' } },
    { action: 'close', from: ['completed'] },
  ], call: (u, a, id, m) => fulfilOrder(u, a, { orderId: id, step: m.action }) },
  { name: 'installation', delegate: 'installation', states: ['awaiting_site_prep', 'ready_to_schedule', 'scheduled', 'in_progress', 'installed', 'commissioned', 'on_hold', 'cancelled'], permissions: ['canManageVisits', 'canManageOrders'], moves: [
    { action: 'ready', from: ['awaiting_site_prep'] },
    { action: 'hold', from: ['awaiting_site_prep', 'ready_to_schedule', 'scheduled', 'in_progress', 'installed'] },
    { action: 'resume', from: ['on_hold'] },
    { action: 'cancel', from: ['awaiting_site_prep', 'ready_to_schedule', 'scheduled', 'on_hold'] },
  ], call: (u, a, id, m) => transitionInstallation(u, a, { installationId: id, action: m.action, reason: 'Site unavailable' }) },
  { name: 'system', delegate: 'installedSystem', states: ['commissioned', 'active', 'underperforming', 'not_working', 'inactive', 'decommissioned'], permissions: ['canManageSystems'], moves: [
    { action: 'active', from: ['inactive', 'underperforming', 'not_working', 'commissioned'] },
    { action: 'inactive', from: ['commissioned', 'active', 'underperforming', 'not_working'] },
    { action: 'decommissioned', from: ['commissioned', 'active', 'underperforming', 'not_working', 'inactive'] },
  ], call: (u, a, id, m) => setSystemStatus(u, a, { systemId: id, to: m.action, reason: 'Customer moved' }) },
  { name: 'ticket', delegate: 'serviceTicket', states: ['open', 'triaged', 'phone_resolved', 'visit_scheduled', 'in_progress', 'awaiting_customer_approval', 'resolved', 'closed', 'reopened', 'cancelled'], permissions: ['canManageTickets'], moves: [
    { action: 'triage', from: ['open', 'reopened'] }, { action: 'phone_resolved', from: ['open', 'triaged', 'reopened'] },
    { action: 'start', from: ['triaged', 'visit_scheduled', 'awaiting_customer_approval', 'reopened'] },
    { action: 'resolve', from: ['in_progress', 'visit_scheduled', 'triaged'] }, { action: 'reopen', from: ['resolved', 'phone_resolved'] },
    { action: 'close', from: ['resolved', 'phone_resolved'] }, { action: 'cancel', from: ['open', 'triaged', 'visit_scheduled', 'awaiting_customer_approval', 'reopened'] },
  ], call: (u, a, id, m) => transitionTicket(u, a, { ticketId: id, action: m.action, reason: 'Customer confirmed the repair' }) },
  { name: 'visit', delegate: 'visit', states: ['requested', 'scheduled', 'rescheduled', 'en_route', 'on_site', 'completed', 'cancelled', 'no_access'], permissions: ['canDoFieldWork', 'canManageVisits'], moves: [
    { action: 'travel', from: ['scheduled'] }, { action: 'check_in', from: ['scheduled', 'en_route'] },
    { action: 'no_access', from: ['scheduled', 'en_route', 'on_site'] },
  ], call: (u, a, id, m) => m.action === 'travel' ? startTravel(u, a, { visitId: id }) : m.action === 'check_in' ? checkInVisit(u, a, { visitId: id }) : completeVisit(u, a, { visitId: id, outcome: 'no_access', reason: 'Nobody home' }) },
  { name: 'visit cancellation', delegate: 'visit', states: ['requested', 'scheduled', 'rescheduled', 'en_route', 'on_site', 'completed', 'cancelled', 'no_access'], permissions: ['canManageVisits'], moves: [{ action: 'cancel', from: ['requested', 'scheduled', 'rescheduled', 'no_access', 'en_route'] }], call: (u, a, id) => staffCancelVisit(u, a, { visitId: id, reason: 'Customer called' }) },
  { name: 'purchase order', delegate: 'purchaseOrder', states: ['draft', 'sent', 'partially_received', 'received', 'closed', 'cancelled'], permissions: ['canManageInventory'], moves: [
    { action: 'send', from: ['draft'] }, { action: 'close', from: ['partially_received', 'received'] }, { action: 'cancel', from: ['draft', 'sent'] },
  ], call: (u, a, id, m) => transitionPurchaseOrder(u, a, { purchaseOrderId: id, action: m.action as 'send' | 'close' | 'cancel', reason: 'Supplier called' }) },
  { name: 'incentive', delegate: 'incentiveApplication', states: ['draft', 'submitted', 'approved', 'paid', 'rejected', 'withdrawn'], permissions: ['canManageIncentives'], moves: [
    { action: 'submit', from: ['draft'] }, { action: 'approve', from: ['submitted'] }, { action: 'reject', from: ['submitted'] }, { action: 'mark_paid', from: ['approved'] }, { action: 'withdraw', from: ['draft', 'submitted'] },
  ], call: (u, a, id, m) => transitionIncentiveApplication(u, a, { applicationId: id, action: m.action, reason: 'Programme decision', rejectionHandling: 'absorb' }) },
  { name: 'commission', delegate: 'commission', states: ['accrued', 'approved', 'paid', 'clawed_back'], permissions: ['canManageCommissions'], moves: [
    { action: 'approve', from: ['accrued'] }, { action: 'mark_paid', from: ['approved'] }, { action: 'claw_back', from: ['accrued', 'approved', 'paid'] },
  ], call: (u, a, id, m) => approveCommission(u, a, { commissionId: id, action: m.action as 'approve' | 'mark_paid' | 'claw_back', reason: 'Order returned' }) },
  { name: 'referral', delegate: 'referral', states: ['pending', 'qualified', 'approved', 'rewarded', 'void'], permissions: ['canManageCommissions', 'canManagePayments'], moves: [
    { action: 'approve', from: ['qualified'] }, { action: 'grant', from: ['approved', 'qualified'] }, { action: 'void', from: ['pending', 'qualified', 'approved'] },
  ], call: (u, a, id, m) => grantReferralReward(u, a, { referralId: id, action: m.action as 'approve' | 'grant' | 'void', reason: 'Customer called' }) },
]

// Rejected operations are rolled back even if a regression performs writes before returning success.
const ROLLBACK = new Error('matrix rollback')
async function attempt(matrix: Matrix, actor: Actor, id: string, move: Move) {
  let error: unknown
  await prisma.$transaction(async tx => {
    try { await matrix.call(new UnitOfWork(tx, new Date()), actor, id, move) } catch (e) { error = e }
    throw ROLLBACK
  }).catch(e => { if (e !== ROLLBACK) throw e })
  return error as { code?: string; message?: string } | undefined
}

describe.skipIf(!hasTestDatabase)('§11.15 named manual transition rejection matrices', () => {
  beforeAll(async () => {
    await onboardCompany(prisma)
    const users = await prisma.user.findMany({ include: { role: true }, orderBy: { email: 'asc' } })
    const seen = new Set<string>()
    for (const u of users) {
      if (!u.role || seen.has(u.role.name)) continue
      seen.add(u.role.name)
      const role = u.role as unknown as Record<string, unknown>
      actors.push({ role: u.role.name, actor: { kind: 'user', userId: u.id, name: u.name, customerId: null, discountLimitPercent: Number(role.discountLimitPercent ?? 0), permissions: new Set(permissionNames.filter(p => role[p] === true)) } })
    }
    // CLI seed adds Owner separately; onboarding itself has seven normal staff roles.
    expect(actors.length).toBeGreaterThanOrEqual(7)
  }, 300_000)
  afterAll(async () => prisma?.$disconnect())

  for (const matrix of matrices) it(`${matrix.name}: rejects illegal moves for every role and legal moves without permission`, async () => {
    const delegate = (prisma as any)[matrix.delegate]
    const data: Record<string, unknown> = {}
    if (['lead', 'quote', 'order', 'installation', 'installedSystem', 'serviceTicket', 'visit', 'purchaseOrder'].includes(matrix.delegate)) data.number = `M-${matrix.delegate}-${Date.now()}`
    if (matrix.delegate === 'quote') data.version = 1
    if (matrix.delegate === 'referral') {
      const c = await prisma.customer.create({ data: { number: `C-M-${Date.now()}`, name: 'Marta Lindgren', currencyCode: 'USD' } })
      data.referrerId = c.id
      data.rewardAmount = 1500
    }
    const row = await delegate.create({ data })
    let checked = 0
    for (const move of matrix.moves) for (const state of matrix.states) {
      await delegate.update({ where: { id: row.id }, data: { status: state, ...move.args } })
      for (const { role, actor } of actors) {
        const allowedRole = matrix.permissions.some(p => actor.permissions.has(p))
        const allowedState = move.from.includes(state)
        if (allowedRole && allowedState) continue // happy paths live in the workflow suites
        // Give an agent ownership and a technician crew membership, so a scope denial cannot hide a state regression.
        if (matrix.delegate === 'lead') await prisma.lead.update({ where: { id: row.id }, data: { assignedToId: actor.userId } })
        if (matrix.delegate === 'visit') await prisma.visit.update({ where: { id: row.id }, data: { technicians: { set: [{ id: actor.userId }] } } })
        const error = await attempt(matrix, actor, row.id, move)
        const context = `${matrix.name}/${state}/${move.action}/${role}`
        expect(error, context).toBeDefined()
        expect(error?.code, context).toBe(allowedRole ? 'INVALID_TRANSITION' : 'NOT_AUTHORIZED')
        expect((await delegate.findUnique({ where: { id: row.id } })).status, context).toBe(state)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(0)
  }, 900_000)
})
