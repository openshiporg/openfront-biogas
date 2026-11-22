'use server';

import { revalidatePath } from 'next/cache';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

/**
 * The only custom operations the dashboard screens can call: the staff operations of
 * features/keystone/mutations/staff.ts, with their argument types. Keyed commands take an idempotency
 * key that the client makes once per intent and reuses on retry, so a lost response never acts twice.
 */
const OPS: Record<string, Record<string, string>> = {
  addLead: { input: 'JSON!' },
  runBiogasOnboarding: { answers: 'JSON!' },
  transitionLead: { leadId: 'ID!', to: 'String!', reason: 'String', expectedVersion: 'Int' },
  assignLead: { leadId: 'ID!', userId: 'ID!', expectedVersion: 'Int' },
  logContact: { input: 'JSON!' },
  saveQuoteDraft: { input: 'JSON!' },
  sendQuote: { quoteId: 'ID!', expectedVersion: 'Int' },
  approveQuote: { quoteId: 'ID!', expectedVersion: 'Int' },
  reviseQuote: { quoteId: 'ID!' },
  cancelQuote: { quoteId: 'ID!', reason: 'String', expectedVersion: 'Int' },
  staffAcceptQuote: { quoteId: 'ID!', optionId: 'ID!', planOfferId: 'ID', signedName: 'String!' },
  scheduleVisit: { input: 'JSON!' },
  assignVisit: { visitId: 'ID!', technicianIds: '[ID!]!', expectedVersion: 'Int' },
  cancelVisit: { visitId: 'ID!', reason: 'String!', expectedVersion: 'Int' },
  startVisitTravel: { visitId: 'ID!', expectedVersion: 'Int' },
  checkInVisit: { visitId: 'ID!', lat: 'String', lng: 'String', expectedVersion: 'Int' },
  saveVisitChecklist: { visitId: 'ID!', answers: 'JSON!' },
  logPartUsage: { visitId: 'ID!', productId: 'ID!', quantity: 'Int!', locationId: 'ID', chargeable: 'Boolean' },
  completeVisit: { input: 'JSON!' },
  addTechnicianTimeOff: { technicianId: 'ID!', date: 'String!', reason: 'String' },
  removeTechnicianTimeOff: { id: 'ID!' },
  transitionInstallation: { installationId: 'ID!', action: 'String!', reason: 'String', expectedVersion: 'Int' },
  setSitePrepTask: { taskId: 'ID!', status: 'String!', note: 'String' },
  commissionSystem: { input: 'JSON!' },
  submitReading: { input: 'JSON!' },
  setSystemStatus: { systemId: 'ID!', to: 'String!', reason: 'String!', expectedVersion: 'Int' },
  voidWarranty: { warrantyId: 'ID!', reason: 'String!' },
  staffCreateTicket: { input: 'JSON!' },
  transitionTicket: { input: 'JSON!' },
  addTicketNote: { ticketId: 'ID!', body: 'String!', isCustomerVisible: 'Boolean' },
  createPayLink: { input: 'JSON!' },
  recordOfflinePayment: { sessionCode: 'String!', provider: 'String!', reference: 'String!', payerPhone: 'String' },
  collectOnSite: { visitId: 'ID!', provider: 'String!', reference: 'String!', payerPhone: 'String', amount: 'Int' },
  verifyOfflinePayment: { paymentId: 'ID!', expectedVersion: 'Int' },
  rejectOfflinePayment: { paymentId: 'ID!', reason: 'String!', expectedVersion: 'Int' },
  refundPayment: { paymentId: 'ID!', amount: 'Int!', reason: 'String!', payoutReference: 'String' },
  applyStoreCredit: { orderId: 'ID!', amount: 'Int!' },
  cancelOrder: { input: 'JSON!' },
  fulfilOrder: { input: 'JSON!' },
  proposeOrderChange: { input: 'JSON!' },
  decideOrderChange: { changeId: 'ID!', approve: 'Boolean!', reason: 'String', expectedVersion: 'Int' },
  returnOrderLines: { input: 'JSON!' },
  issueInvoice: { orderId: 'ID!', installmentId: 'ID', dueDays: 'Int' },
  voidInvoice: { invoiceId: 'ID!', reason: 'String!', expectedVersion: 'Int' },
  staffCompleteCart: { cartId: 'ID!' },
  waiveInstallment: { installmentId: 'ID!', reason: 'String!', expectedVersion: 'Int' },
  reschedulePlan: { planId: 'ID!', shiftDays: 'Int', shiftMonths: 'Int', reason: 'String!', expectedVersion: 'Int' },
  staffInstallmentLink: { planId: 'ID!', installmentIds: '[ID!]', payoff: 'Boolean' },
  staffSubscribeToPlan: { planId: 'ID!', systemId: 'ID!' },
  renewSubscription: { subscriptionId: 'ID!' },
  cancelSubscription: { subscriptionId: 'ID!', reason: 'String!', visitListPriceAmount: 'Int', payoutReference: 'String', expectedVersion: 'Int' },
  savePurchaseOrder: { input: 'JSON!' },
  transitionPurchaseOrder: { purchaseOrderId: 'ID!', action: 'String!', reason: 'String', expectedVersion: 'Int' },
  receivePurchaseOrder: { purchaseOrderId: 'ID!', lines: 'JSON!', locationId: 'ID', expectedVersion: 'Int' },
  adjustStock: { productId: 'ID!', locationId: 'ID!', delta: 'Int', countedQuantity: 'Int', reason: 'String!' },
  transferStock: { productId: 'ID!', fromLocationId: 'ID!', toLocationId: 'ID!', quantity: 'Int!', reason: 'String' },
  moveSerial: { serialNumber: 'String!', locationId: 'ID', status: 'String', reason: 'String' },
  openIncentiveApplication: { programId: 'ID!', customerId: 'ID!', orderId: 'ID', amount: 'Int', notes: 'String' },
  transitionIncentiveApplication: { applicationId: 'ID!', action: 'String!', reference: 'String', reason: 'String', rejectionHandling: 'String', expectedVersion: 'Int' },
  approveCommission: { commissionId: 'ID!', action: 'String', reason: 'String', expectedVersion: 'Int' },
  grantReferralReward: { referralId: 'ID!', action: 'String', rewardKind: 'String', reason: 'String', expectedVersion: 'Int' },
};

/** Staff operations without a key (carts are rebuilt freely; reconcile and sizing only read back). */
const UNKEYED: Record<string, Record<string, string>> = {
  staffSizeSystem: { leadId: 'ID', input: 'JSON!' },
  reconcilePaymentSession: { sessionId: 'ID!' },
  reconcileRefund: { refundId: 'ID!' },
  staffStartCart: { customerId: 'ID' },
  staffAddToCart: { cartId: 'ID!', productId: 'ID!', quantity: 'Int!' },
  staffSetCartFulfilment: { cartId: 'ID!', input: 'JSON!' },
};

/** Domain reads the interactive screens call from the browser. */
const READS: Record<string, Record<string, string>> = {
  staffVisitSlots: { from: 'String!', days: 'Int', branchId: 'ID', technicianId: 'ID' },
  cancellationPreview: { orderId: 'ID!', byCompany: 'Boolean', kitReturned: 'Boolean' },
  staffCart: { cartId: 'ID!' },
};

function pick(spec: Record<string, string>, variables: Record<string, unknown>) {
  const keys = Object.keys(variables).filter((k) => k in spec && variables[k] !== undefined && variables[k] !== '');
  return {
    decl: keys.map((k) => `$${k}: ${spec[k]}`),
    args: keys.map((k) => `${k}: $${k}`),
    // Form fields arrive as text; an Int argument typed as digits is sent as a number.
    vars: Object.fromEntries(keys.map((k) => [k, /^Int!?$/.test(spec[k]) && typeof variables[k] === 'string' && /^-?\d{1,9}$/.test(variables[k] as string) ? Number(variables[k]) : variables[k]])) as Record<string, unknown>,
  };
}

export async function runQuery(op: string, variables: Record<string, unknown>) {
  const spec = READS[op];
  if (!spec) return { ok: false as const, error: 'Unknown lookup' };
  const { decl, args, vars } = pick(spec, variables);
  const res = await keystoneClient(`query Read${decl.length ? `(${decl.join(', ')})` : ''} { ${op}${args.length ? `(${args.join(', ')})` : ''} }`, vars);
  if (!res.success) return { ok: false as const, error: res.error || 'Lookup failed' };
  return { ok: true as const, data: (res.data as Record<string, unknown>)?.[op] };
}

export async function runUnkeyed(op: string, variables: Record<string, unknown>, paths: string[] = []) {
  const spec = UNKEYED[op];
  if (!spec) return { ok: false as const, error: 'Unknown action' };
  const { decl, args, vars } = pick(spec, variables);
  const res = await keystoneClient(`mutation Run(${decl.join(', ')}) { ${op}(${args.join(', ')}) }`, vars);
  if (!res.success) return { ok: false as const, error: res.error || 'Action failed' };
  for (const p of paths) revalidatePath(p);
  return { ok: true as const, data: (res.data as Record<string, unknown>)?.[op] };
}

const KEY = /^[A-Za-z0-9._:-]{8,200}$/;

export async function runCommand(op: string, variables: Record<string, unknown>, idempotencyKey: string, paths: string[] = []) {
  const spec = OPS[op];
  if (!spec) return { ok: false as const, error: 'Unknown action' };
  if (!KEY.test(idempotencyKey)) return { ok: false as const, error: 'Missing request key. Reload the page and try again.' };
  const picked = pick(spec, variables);
  const decl = [...picked.decl, '$idempotencyKey: String!'];
  const args = [...picked.args, 'idempotencyKey: $idempotencyKey'];
  const res = await keystoneClient(`mutation Run(${decl.join(', ')}) { ${op}(${args.join(', ')}) }`, { ...picked.vars, idempotencyKey });
  if (!res.success) return { ok: false as const, error: res.error || 'Action failed' };
  for (const p of paths) revalidatePath(p);
  return { ok: true as const, data: (res.data as Record<string, unknown>)?.[op] };
}
