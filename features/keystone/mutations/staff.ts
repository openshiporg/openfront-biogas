import { DomainError, Codes } from '../lib/errors'
import { requirePermission } from '../lib/actor'
import { op, run, staff, type Ctx } from './ctx'
import * as leads from '../services/leads'
import * as quotes from '../services/quotes'
import * as visits from '../services/visits'
import * as systems from '../services/systems'
import * as tickets from '../services/tickets'
import * as payments from '../services/payments'
import * as orders from '../services/orders'
import * as back from '../services/backoffice'
import { openSlots } from '../services/scheduling'
import { sizeSystem } from '../services/sizing'
import { cancellationRefund } from '../services/orders'
import { getSettings } from '../services/settings'
import { str } from '../services/util'
import { addToCart, completeCart, newCart, priceCart, setCartFulfilment } from '../services/carts'
import { collectOnSite, startSession } from '../services/money-links'

const graphql = String.raw

/**
 * Staff operations (5.9 staff, plus what the platform pages need). Each checks its permission in the
 * service and runs as one idempotent command with audit rows in the same transaction.
 */
export const staffTypeDefs = graphql`
  type Query {
    staffVisitSlots(from: String!, days: Int, branchId: ID, technicianId: ID): JSON
    cancellationPreview(orderId: ID!, byCompany: Boolean, kitReturned: Boolean): JSON
    staffCart(cartId: ID!): JSON
    visitChecklist(visitId: ID!, kind: String): JSON
  }
  type Mutation {
    addLead(input: JSON!, idempotencyKey: String!): JSON
    transitionLead(leadId: ID!, to: String!, reason: String, expectedVersion: Int, idempotencyKey: String!): JSON
    assignLead(leadId: ID!, userId: ID!, expectedVersion: Int, idempotencyKey: String!): JSON
    staffSizeSystem(leadId: ID, input: JSON!): JSON
    logContact(input: JSON!, idempotencyKey: String!): JSON

    saveQuoteDraft(input: JSON!, idempotencyKey: String!): JSON
    sendQuote(quoteId: ID!, expectedVersion: Int, idempotencyKey: String!): JSON
    approveQuote(quoteId: ID!, expectedVersion: Int, idempotencyKey: String!): JSON
    reviseQuote(quoteId: ID!, idempotencyKey: String!): JSON
    cancelQuote(quoteId: ID!, reason: String, expectedVersion: Int, idempotencyKey: String!): JSON
    staffAcceptQuote(quoteId: ID!, optionId: ID!, planOfferId: ID, signedName: String!, idempotencyKey: String!): JSON

    scheduleVisit(input: JSON!, idempotencyKey: String!): JSON
    assignVisit(visitId: ID!, technicianIds: [ID!]!, expectedVersion: Int, idempotencyKey: String!): JSON
    cancelVisit(visitId: ID!, reason: String!, expectedVersion: Int, idempotencyKey: String!): JSON
    startVisitTravel(visitId: ID!, expectedVersion: Int, idempotencyKey: String!): JSON
    checkInVisit(visitId: ID!, lat: String, lng: String, expectedVersion: Int, idempotencyKey: String!): JSON
    saveVisitChecklist(visitId: ID!, answers: JSON!, idempotencyKey: String!): JSON
    logPartUsage(visitId: ID!, productId: ID!, quantity: Int!, locationId: ID, chargeable: Boolean, idempotencyKey: String!): JSON
    completeVisit(input: JSON!, idempotencyKey: String!): JSON
    addTechnicianTimeOff(technicianId: ID!, date: String!, reason: String, idempotencyKey: String!): JSON
    removeTechnicianTimeOff(id: ID!, idempotencyKey: String!): JSON

    transitionInstallation(installationId: ID!, action: String!, reason: String, expectedVersion: Int, idempotencyKey: String!): JSON
    setSitePrepTask(taskId: ID!, status: String!, note: String, idempotencyKey: String!): JSON
    commissionSystem(input: JSON!, idempotencyKey: String!): JSON
    submitReading(input: JSON!, idempotencyKey: String!): JSON
    setSystemStatus(systemId: ID!, to: String!, reason: String!, expectedVersion: Int, idempotencyKey: String!): JSON
    voidWarranty(warrantyId: ID!, reason: String!, idempotencyKey: String!): JSON

    staffCreateTicket(input: JSON!, idempotencyKey: String!): JSON
    transitionTicket(input: JSON!, idempotencyKey: String!): JSON
    addTicketNote(ticketId: ID!, body: String!, isCustomerVisible: Boolean, idempotencyKey: String!): JSON

    createPayLink(input: JSON!, idempotencyKey: String!): JSON
    recordOfflinePayment(sessionCode: String!, provider: String!, reference: String!, payerPhone: String, idempotencyKey: String!): JSON
    collectOnSite(visitId: ID!, provider: String!, reference: String!, payerPhone: String, amount: Int, idempotencyKey: String!): JSON
    verifyOfflinePayment(paymentId: ID!, expectedVersion: Int, idempotencyKey: String!): JSON
    rejectOfflinePayment(paymentId: ID!, reason: String!, expectedVersion: Int, idempotencyKey: String!): JSON
    reconcilePaymentSession(sessionId: ID!): JSON
    reconcileRefund(refundId: ID!): JSON
    refundPayment(paymentId: ID!, amount: Int!, reason: String!, payoutReference: String, idempotencyKey: String!): JSON
    applyStoreCredit(orderId: ID!, amount: Int!, idempotencyKey: String!): JSON

    cancelOrder(input: JSON!, idempotencyKey: String!): JSON
    fulfilOrder(input: JSON!, idempotencyKey: String!): JSON
    proposeOrderChange(input: JSON!, idempotencyKey: String!): JSON
    decideOrderChange(changeId: ID!, approve: Boolean!, reason: String, expectedVersion: Int, idempotencyKey: String!): JSON
    returnOrderLines(input: JSON!, idempotencyKey: String!): JSON
    issueInvoice(orderId: ID!, installmentId: ID, dueDays: Int, idempotencyKey: String!): JSON
    voidInvoice(invoiceId: ID!, reason: String!, expectedVersion: Int, idempotencyKey: String!): JSON
    staffStartCart(customerId: ID): JSON
    staffAddToCart(cartId: ID!, productId: ID!, quantity: Int!): JSON
    staffSetCartFulfilment(cartId: ID!, input: JSON!): JSON
    staffCompleteCart(cartId: ID!, idempotencyKey: String!): JSON

    waiveInstallment(installmentId: ID!, reason: String!, expectedVersion: Int, idempotencyKey: String!): JSON
    reschedulePlan(planId: ID!, shiftDays: Int, shiftMonths: Int, reason: String!, expectedVersion: Int, idempotencyKey: String!): JSON
    staffInstallmentLink(planId: ID!, installmentIds: [ID!], payoff: Boolean, idempotencyKey: String!): JSON

    staffSubscribeToPlan(planId: ID!, systemId: ID!, idempotencyKey: String!): JSON
    renewSubscription(subscriptionId: ID!, idempotencyKey: String!): JSON
    cancelSubscription(subscriptionId: ID!, reason: String!, visitListPriceAmount: Int, payoutReference: String, expectedVersion: Int, idempotencyKey: String!): JSON

    savePurchaseOrder(input: JSON!, idempotencyKey: String!): JSON
    transitionPurchaseOrder(purchaseOrderId: ID!, action: String!, reason: String, expectedVersion: Int, idempotencyKey: String!): JSON
    receivePurchaseOrder(purchaseOrderId: ID!, lines: JSON!, locationId: ID, expectedVersion: Int, idempotencyKey: String!): JSON
    adjustStock(productId: ID!, locationId: ID!, delta: Int, countedQuantity: Int, reason: String!, idempotencyKey: String!): JSON
    transferStock(productId: ID!, fromLocationId: ID!, toLocationId: ID!, quantity: Int!, reason: String, idempotencyKey: String!): JSON
    moveSerial(serialNumber: String!, locationId: ID, status: String, reason: String, idempotencyKey: String!): JSON

    openIncentiveApplication(programId: ID!, customerId: ID!, orderId: ID, amount: Int, notes: String, idempotencyKey: String!): JSON
    transitionIncentiveApplication(applicationId: ID!, action: String!, reference: String, reason: String, rejectionHandling: String, expectedVersion: Int, idempotencyKey: String!): JSON
    approveCommission(commissionId: ID!, action: String, reason: String, expectedVersion: Int, idempotencyKey: String!): JSON
    grantReferralReward(referralId: ID!, action: String, rewardKind: String, reason: String, expectedVersion: Int, idempotencyKey: String!): JSON
  }
`

type K = { idempotencyKey: string }
/** Resolver for a keyed staff command whose service takes (uow, actor, args). */
const cmd = <A extends K>(name: string, fn: (uow: any, actor: any, args: A) => Promise<unknown>) =>
  op(async (_r, a: A, c: Ctx) => {
    const actor = staff(c)
    return run(c, name, actor, a, uow => fn(uow, actor, a))
  })

export const staffResolvers = {
  Query: {
    staffVisitSlots: op(async (_r, a: { from: string; days?: number; branchId?: string; technicianId?: string }, c) => {
      requirePermission(staff(c), 'canManageVisits')
      return openSlots(c.prisma, { from: a.from, days: a.days ?? 7, branchId: a.branchId, technicianId: a.technicianId })
    }),
    cancellationPreview: op(async (_r, a: { orderId: string; byCompany?: boolean; kitReturned?: boolean }, c) => {
      requirePermission(staff(c), 'canManageOrders')
      const order = await c.prisma.order.findUnique({ where: { id: a.orderId }, include: { lines: true } })
      if (!order) throw new DomainError(Codes.NOT_FOUND, 'Order not found.')
      return cancellationRefund(order, await getSettings(c.prisma), new Date(), { byCompany: Boolean(a.byCompany), kitReturned: Boolean(a.kitReturned) })
    }),
    // The checklist the server enforces for this visit (P26), and the commissioning one an install visit can also complete.
    visitChecklist: op(async (_r, a: { visitId: string; kind?: string }, c) => {
      const actor = staff(c)
      requirePermission(actor, 'canDoFieldWork', 'canManageVisits')
      if (actor.kind !== 'user') throw new DomainError(Codes.NOT_AUTHORIZED, 'Sign in.')
      const visit = await c.prisma.visit.findFirst({ where: { id: a.visitId, ...(actor.permissions.has('canManageVisits') ? {} : { technicians: { some: { id: actor.userId } } }) }, select: { type: true, siteId: true, installationId: true } })
      if (!visit) throw new DomainError(Codes.NOT_FOUND, 'Visit not found.')
      const t = await visits.checklistFor(c.prisma, a.kind === 'commissioning' ? { type: 'commissioning', siteId: visit.siteId, installationId: null } : visit)
      return t ? { id: t.id, name: t.name, kind: t.kind, items: t.items.map(i => ({ id: i.id, prompt: i.prompt, helpText: i.helpText, inputType: i.inputType, choices: i.choices, unit: i.unit, isRequired: i.isRequired })) } : null
    }),
    staffCart: op(async (_r, a: { cartId: string }, c) => {
      requirePermission(staff(c), 'canManageOrders')
      return priceCart(c.prisma, a.cartId)
    }),
  },
  Mutation: {
    addLead: cmd('addLead', async (uow, actor, a: K & { input: any }) => {
      requirePermission(actor, 'canManageLeads')
      const source = str(a.input?.source, 20) || 'phone'
      const input = leads.parseLeadInput(a.input, source)
      const { lead } = await leads.createLeadCore(uow, actor, input)
      return { id: lead.id, number: lead.number }
    }),
    transitionLead: cmd('transitionLead', (uow, actor, a: K & { leadId: string; to: string; reason?: string; expectedVersion?: number }) => leads.transitionLead(uow, actor, a)),
    assignLead: cmd('assignLead', (uow, actor, a: K & { leadId: string; userId: string; expectedVersion?: number }) => leads.assignLead(uow, actor, a)),
    staffSizeSystem: op(async (_r, a: { leadId?: string; input: unknown }, c) => {
      const actor = staff(c)
      requirePermission(actor, 'canManageLeads', 'canManageQuotes')
      const result = await sizeSystem(c.prisma, a.input)
      const lead = a.leadId ? await c.prisma.lead.findUnique({ where: { id: a.leadId } }) : null
      await c.prisma.sizingAssessment.update({ where: { id: result.assessmentId }, data: { source: 'staff', leadId: lead?.id ?? null, siteId: lead?.siteId ?? null } })
      return result
    }),
    logContact: cmd('logContact', (uow, actor, a: K & { input: any }) => leads.logContact(uow, actor, a.input ?? {})),

    saveQuoteDraft: cmd('saveQuoteDraft', (uow, actor, a: K & { input: any }) => quotes.saveQuoteDraft(uow, actor, a.input ?? {})),
    sendQuote: cmd('sendQuote', (uow, actor, a: K & { quoteId: string; expectedVersion?: number }) => quotes.sendQuote(uow, actor, a)),
    approveQuote: cmd('approveQuote', (uow, actor, a: K & { quoteId: string; expectedVersion?: number }) => quotes.approveQuote(uow, actor, a)),
    reviseQuote: cmd('reviseQuote', (uow, actor, a: K & { quoteId: string }) => quotes.reviseQuote(uow, actor, a)),
    cancelQuote: cmd('cancelQuote', (uow, actor, a: K & { quoteId: string; reason?: string; expectedVersion?: number }) => quotes.cancelQuote(uow, actor, a)),
    staffAcceptQuote: cmd('staffAcceptQuote', async (uow, actor, a: K & { quoteId: string; optionId: string; planOfferId?: string; signedName: string }) => {
      requirePermission(actor, 'canManageQuotes', 'canManageTickets')
      const q = await uow.tx.quote.findUnique({ where: { id: a.quoteId }, select: { publicCode: true } })
      if (!q?.publicCode) throw new DomainError(Codes.NOT_FOUND, 'Quote not found.')
      return quotes.acceptQuote(uow, actor, { code: q.publicCode, optionId: a.optionId, planOfferId: a.planOfferId, signedName: a.signedName, ip: 'staff' })
    }),

    scheduleVisit: cmd('scheduleVisit', (uow, actor, a: K & { input: any }) => visits.scheduleVisit(uow, actor, a.input ?? {})),
    assignVisit: cmd('assignVisit', (uow, actor, a: K & { visitId: string; technicianIds: string[]; expectedVersion?: number }) => visits.assignVisit(uow, actor, a)),
    cancelVisit: cmd('cancelVisit', (uow, actor, a: K & { visitId: string; reason: string; expectedVersion?: number }) => visits.staffCancelVisit(uow, actor, a)),
    startVisitTravel: cmd('startVisitTravel', (uow, actor, a: K & { visitId: string; expectedVersion?: number }) => visits.startTravel(uow, actor, a)),
    checkInVisit: cmd('checkInVisit', (uow, actor, a: K & { visitId: string; lat?: string; lng?: string; expectedVersion?: number }) => visits.checkInVisit(uow, actor, a)),
    saveVisitChecklist: cmd('saveVisitChecklist', (uow, actor, a: K & { visitId: string; answers: any }) => visits.saveChecklist(uow, actor, { visitId: a.visitId, answers: Array.isArray(a.answers) ? a.answers : [] })),
    logPartUsage: cmd('logPartUsage', (uow, actor, a: K & { visitId: string; productId: string; quantity: number; locationId?: string; chargeable?: boolean }) => visits.logPartUsage(uow, actor, a)),
    completeVisit: cmd('completeVisit', (uow, actor, a: K & { input: any }) => visits.completeVisit(uow, actor, a.input ?? {})),
    addTechnicianTimeOff: cmd('addTechnicianTimeOff', (uow, actor, a: K & { technicianId: string; date: string; reason?: string }) => visits.addTimeOff(uow, actor, a)),
    removeTechnicianTimeOff: cmd('removeTechnicianTimeOff', (uow, actor, a: K & { id: string }) => visits.removeTimeOff(uow, actor, a)),

    transitionInstallation: cmd('transitionInstallation', (uow, actor, a: K & { installationId: string; action: string; reason?: string; expectedVersion?: number }) => systems.transitionInstallation(uow, actor, a)),
    setSitePrepTask: cmd('setSitePrepTask', (uow, actor, a: K & { taskId: string; status: any; note?: string }) => systems.setPrepTask(uow, actor, { ...a, by: 'staff' })),
    commissionSystem: cmd('commissionSystem', (uow, actor, a: K & { input: any }) => systems.commissionSystem(uow, actor, a.input ?? {})),
    submitReading: cmd('submitReading', async (uow, actor, a: K & { input: any }) => {
      requirePermission(actor, 'canManageSystems', 'canDoFieldWork', 'canManageTickets')
      return systems.recordReading(uow, actor, a.input ?? {})
    }),
    setSystemStatus: cmd('setSystemStatus', (uow, actor, a: K & { systemId: string; to: string; reason: string; expectedVersion?: number }) => systems.setSystemStatus(uow, actor, a)),
    voidWarranty: cmd('voidWarranty', (uow, actor, a: K & { warrantyId: string; reason: string }) => systems.voidWarranty(uow, actor, a)),

    staffCreateTicket: cmd('staffCreateTicket', async (uow, actor, a: K & { input: any }) => {
      requirePermission(actor, 'canManageTickets')
      const i = a.input ?? {}
      return tickets.openTicket(uow, actor, { systemId: i.systemId ?? null, customerId: i.customerId ?? null, channel: 'phone', category: i.category, description: i.description, callbackPhone: i.callbackPhone, severity: i.severity })
    }),
    transitionTicket: cmd('transitionTicket', (uow, actor, a: K & { input: any }) => tickets.transitionTicket(uow, actor, a.input ?? {})),
    addTicketNote: cmd('addTicketNote', (uow, actor, a: K & { ticketId: string; body: string; isCustomerVisible?: boolean }) => tickets.addTicketNote(uow, actor, a)),

    createPayLink: cmd('createPayLink', async (uow, actor, a: K & { input: any }) => {
      requirePermission(actor, 'canManagePayments', 'canManageOrders', 'canManageVisits', 'canManageTickets')
      return startSession(uow, actor, a.input ?? {})
    }),
    collectOnSite: cmd('collectOnSite', (uow, actor, a: K & { visitId: string; provider: string; reference: string; payerPhone?: string; amount?: number }) => collectOnSite(uow, actor, a)),
    recordOfflinePayment: cmd('recordOfflinePayment', async (uow, actor, a: K & { sessionCode: string; provider: string; reference: string; payerPhone?: string }) => {
      requirePermission(actor, 'canManagePayments', 'canDoFieldWork')
      const s = await payments.sessionByCode(uow.tx, a.sessionCode)
      const code = payments.providerCode(a.provider)
      // Finance records and verifies in one step; a technician's collection waits for finance.
      if (actor.permissions?.has?.('canManagePayments')) return payments.recordAndVerify(uow, actor, { sessionId: s.id, code, reference: a.reference, payerPhone: a.payerPhone })
      return payments.submitOffline(uow, actor, { sessionId: s.id, code, reference: a.reference, payerPhone: a.payerPhone, collectedByStaff: true })
    }),
    verifyOfflinePayment: cmd('verifyOfflinePayment', async (uow, actor, a: K & { paymentId: string; expectedVersion?: number }) => {
      requirePermission(actor, 'canManagePayments')
      return payments.verifyOffline(uow, actor, a.paymentId, a.expectedVersion)
    }),
    rejectOfflinePayment: cmd('rejectOfflinePayment', async (uow, actor, a: K & { paymentId: string; reason: string; expectedVersion?: number }) => {
      requirePermission(actor, 'canManagePayments')
      return payments.rejectOffline(uow, actor, a.paymentId, a.reason, a.expectedVersion)
    }),
    reconcilePaymentSession: op(async (_r, a: { sessionId: string }, c) => {
      requirePermission(staff(c), 'canManagePayments')
      return payments.reconcileSession(c.prisma, a.sessionId)
    }),
    reconcileRefund: op(async (_r, a: { refundId: string }, c) => {
      requirePermission(staff(c), 'canIssueRefunds', 'canManagePayments')
      return payments.reconcileRefund(c.prisma, a.refundId)
    }),
    refundPayment: cmd('refundPayment', async (uow, actor, a: K & { paymentId: string; amount: number; reason: string; payoutReference?: string }) => {
      requirePermission(actor, 'canIssueRefunds')
      if (!str(a.reason, 500)) throw new DomainError(Codes.INVALID_INPUT, 'Give a reason.')
      return payments.refund(uow, actor, a)
    }),
    applyStoreCredit: cmd('applyStoreCredit', (uow, actor, a: K & { orderId: string; amount: number }) => back.applyStoreCredit(uow, actor, a)),

    cancelOrder: cmd('cancelOrder', (uow, actor, a: K & { input: any }) => orders.cancelOrder(uow, actor, { ...(a.input ?? {}), idempotencyKey: a.idempotencyKey })),
    fulfilOrder: cmd('fulfilOrder', (uow, actor, a: K & { input: any }) => orders.fulfilOrder(uow, actor, a.input ?? {})),
    proposeOrderChange: cmd('proposeOrderChange', (uow, actor, a: K & { input: any }) => orders.proposeOrderChange(uow, actor, a.input ?? {})),
    decideOrderChange: cmd('decideOrderChange', (uow, actor, a: K & { changeId: string; approve: boolean; reason?: string; expectedVersion?: number }) => orders.decideOrderChange(uow, actor, a)),
    returnOrderLines: cmd('returnOrderLines', (uow, actor, a: K & { input: any }) => orders.returnOrderLines(uow, actor, { ...(a.input ?? {}), idempotencyKey: a.idempotencyKey })),
    issueInvoice: cmd('issueInvoice', (uow, actor, a: K & { orderId: string; installmentId?: string; dueDays?: number }) => orders.issueInvoice(uow, actor, a)),
    voidInvoice: cmd('voidInvoice', (uow, actor, a: K & { invoiceId: string; reason: string; expectedVersion?: number }) => orders.voidInvoice(uow, actor, a)),
    staffStartCart: op(async (_r, a: { customerId?: string }, c) => {
      const actor = staff(c)
      requirePermission(actor, 'canManageOrders')
      const { cartId } = await newCart(c.prisma, actor)
      if (a.customerId) {
        const cu = await c.prisma.customer.findUnique({ where: { id: a.customerId } })
        if (!cu) throw new DomainError(Codes.NOT_FOUND, 'Customer not found.')
        await c.prisma.cart.update({ where: { id: cartId }, data: { customerId: cu.id, name: cu.name, phone: cu.phone, email: cu.email } })
      }
      return priceCart(c.prisma, cartId)
    }),
    staffAddToCart: op(async (_r, a: { cartId: string; productId: string; quantity: number }, c) => {
      requirePermission(staff(c), 'canManageOrders')
      await addToCart(c.prisma, a.cartId, a.productId, a.quantity).catch(async e => {
        // Staff may sell a kit without the online survey rule (they have surveyed or chose not to).
        if (e instanceof DomainError && e.code === Codes.GUARD_FAILED) {
          const p = await c.prisma.product.findUnique({ where: { id: a.productId } })
          if (!p) throw e
          await c.prisma.cartLine.create({ data: { cartId: a.cartId, productId: p.id, quantity: a.quantity, unitAmount: p.priceAmount } })
          return
        }
        throw e
      })
      return priceCart(c.prisma, a.cartId)
    }),
    staffSetCartFulfilment: op(async (_r, a: { cartId: string; input: any }, c) => {
      requirePermission(staff(c), 'canManageOrders')
      await setCartFulfilment(c.prisma, a.cartId, a.input ?? {})
      return priceCart(c.prisma, a.cartId)
    }),
    staffCompleteCart: cmd('staffCompleteCart', async (uow, actor, a: K & { cartId: string }) => {
      requirePermission(actor, 'canManageOrders')
      const cart = await uow.tx.cart.findUnique({ where: { id: a.cartId } })
      if (!cart) throw new DomainError(Codes.NOT_FOUND, 'Cart not found.')
      const asCustomer = cart.customerId ? { ...actor, customerId: cart.customerId } : actor
      const out = await completeCart(uow, asCustomer, a.cartId)
      await uow.tx.order.update({ where: { id: out.orderId }, data: { channel: 'staff', salesAgentId: actor.userId } })
      return out
    }),

    waiveInstallment: cmd('waiveInstallment', (uow, actor, a: K & { installmentId: string; reason: string; expectedVersion?: number }) => back.waiveInstallment(uow, actor, a)),
    reschedulePlan: cmd('reschedulePlan', (uow, actor, a: K & { planId: string; shiftDays?: number; shiftMonths?: number; reason: string; expectedVersion?: number }) => back.reschedulePlan(uow, actor, a)),
    staffInstallmentLink: cmd('staffInstallmentLink', async (uow, actor, a: K & { planId: string; installmentIds?: string[]; payoff?: boolean }) => {
      requirePermission(actor, 'canManagePlans', 'canManagePayments')
      return back.installmentSession(uow, actor, { planId: a.planId, installmentIds: a.installmentIds ?? undefined, payoff: Boolean(a.payoff) })
    }),

    staffSubscribeToPlan: cmd('staffSubscribeToPlan', async (uow, actor, a: K & { planId: string; systemId: string }) => {
      requirePermission(actor, 'canManagePlans', 'canManageSystems')
      return back.subscribeToPlan(uow, actor, a)
    }),
    renewSubscription: cmd('renewSubscription', (uow, actor, a: K & { subscriptionId: string }) => back.renewSubscription(uow, actor, a)),
    cancelSubscription: cmd('cancelSubscription', (uow, actor, a: K & { subscriptionId: string; reason: string; visitListPriceAmount?: number; payoutReference?: string; expectedVersion?: number }) => back.cancelSubscription(uow, actor, a)),

    savePurchaseOrder: cmd('savePurchaseOrder', (uow, actor, a: K & { input: any }) => back.savePurchaseOrder(uow, actor, a.input ?? {})),
    transitionPurchaseOrder: cmd('transitionPurchaseOrder', (uow, actor, a: K & { purchaseOrderId: string; action: any; reason?: string; expectedVersion?: number }) => back.transitionPurchaseOrder(uow, actor, a)),
    receivePurchaseOrder: cmd('receivePurchaseOrder', (uow, actor, a: K & { purchaseOrderId: string; lines: any; locationId?: string; expectedVersion?: number }) => back.receivePurchaseOrder(uow, actor, { ...a, lines: Array.isArray(a.lines) ? a.lines : [] })),
    adjustStock: cmd('adjustStock', (uow, actor, a: K & { productId: string; locationId: string; delta?: number; countedQuantity?: number; reason: string }) => back.adjustStock(uow, actor, a)),
    transferStock: cmd('transferStock', (uow, actor, a: K & { productId: string; fromLocationId: string; toLocationId: string; quantity: number; reason?: string }) => back.transferStock(uow, actor, a)),
    moveSerial: cmd('moveSerial', (uow, actor, a: K & { serialNumber: string; locationId?: string; status?: string; reason?: string }) => back.moveSerial(uow, actor, a)),

    openIncentiveApplication: cmd('openIncentiveApplication', (uow, actor, a: K & { programId: string; customerId: string; orderId?: string; amount?: number; notes?: string }) => back.openIncentiveApplication(uow, actor, a)),
    transitionIncentiveApplication: cmd('transitionIncentiveApplication', (uow, actor, a: K & { applicationId: string; action: string; reference?: string; reason?: string; rejectionHandling?: any; expectedVersion?: number }) => back.transitionIncentiveApplication(uow, actor, a)),
    approveCommission: cmd('approveCommission', (uow, actor, a: K & { commissionId: string; action?: any; reason?: string; expectedVersion?: number }) => back.approveCommission(uow, actor, a)),
    grantReferralReward: cmd('grantReferralReward', (uow, actor, a: K & { referralId: string; action?: any; rewardKind?: any; reason?: string; expectedVersion?: number }) => back.grantReferralReward(uow, actor, a)),
  },
}
