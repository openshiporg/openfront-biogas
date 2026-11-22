import { list } from '@keystone-6/core'
import { checkbox, integer, json, relationship, text, timestamp, virtual, calendarDay } from '@keystone-6/core/fields'
import { graphql } from '@keystone-6/core'
import { anyOf, has, staffOrCustomer, sys } from '../access'
import { currency, governed, managed, money, ro, serverBool, serverJson, serverKey, serverText, serverTime, status, version, serverInt } from './fields'
import { trackingFields } from './trackingFields'

const byCustomer = (id: string) => ({ customer: { id: { equals: id } } })
const ORDER_STAFF = ['canManageOrders', 'canReadPayments', 'canManageVisits', 'canManageInventory'] as const

/** Raw CRUD closed: only cart operations touch carts (builder skill file 13). */
export const Cart = list({
  access: governed('canManageOrders'),
  fields: {
    tokenHash: text({ isIndexed: 'unique', db: { isNullable: true }, access: { read: sys, create: sys, update: sys } }),
    status: status(['active', 'converted', 'abandoned']),
    fulfilment: status(['delivery', 'pickup']),
    address: serverJson(),
    deliveryFeeAmount: money({ readOnly: true }),
    currencyCode: currency(),
    name: serverText(),
    email: serverText(),
    phone: serverText(),
    expiresAt: serverTime(),
    customer: relationship({ ref: 'Customer', ...ro }),
    pickupBranch: relationship({ ref: 'Branch', ...ro }),
    serviceArea: relationship({ ref: 'ServiceArea', ...ro }),
    createdBy: relationship({ ref: 'User', ...ro }),
    lines: relationship({ ref: 'CartLine.cart', many: true, ...ro }),
    order: relationship({ ref: 'Order.cart', ...ro }),
    ...trackingFields,
  },
})

export const CartLine = list({
  access: governed('canManageOrders'),
  fields: {
    quantity: integer({ defaultValue: 1, ...ro }),
    unitAmount: money({ readOnly: true }),
    cart: relationship({ ref: 'Cart.lines', ...ro }),
    product: relationship({ ref: 'Product', ...ro }),
    ...trackingFields,
  },
})

export const ORDER_STATUSES = ['pending_payment', 'confirmed', 'preparing', 'ready', 'shipped', 'out_for_install', 'delivered', 'installed', 'completed', 'closed', 'cancelled'] as const

export const Order = list({
  access: staffOrCustomer([...ORDER_STAFF], byCustomer),
  ui: { labelField: 'number', listView: { initialColumns: ['number', 'status', 'customer', 'channel', 'totalAmount', 'paidAmount'] } },
  hooks: {
    // Totals are always recomputed on the server from lines (5.8); a client-sent total is never stored.
    resolveInput: ({ resolvedData }) => {
      const { subtotalAmount, totalAmount, paidAmount, refundedAmount, taxAmount, discountAmount, ...rest } = resolvedData as Record<string, unknown>
      void subtotalAmount; void totalAmount; void paidAmount; void refundedAmount; void taxAmount; void discountAmount
      return rest as never
    },
  },
  fields: {
    number: serverKey(),
    status: status(ORDER_STATUSES),
    version: version(),
    channel: status(['quote', 'shop', 'staff']),
    publicCode: serverKey(),
    currencyCode: currency(),
    subtotalAmount: money({ readOnly: true }),
    discountAmount: money({ readOnly: true }),
    deliveryAmount: money({ readOnly: true }),
    taxAmount: money({ readOnly: true }),
    totalAmount: money({ readOnly: true }),
    paidAmount: money({ readOnly: true }),
    refundedAmount: money({ readOnly: true }),
    surveyFeeCreditAmount: money({ readOnly: true }),
    balanceAmount: virtual({
      field: graphql.field({ type: graphql.Int, resolve: item => Number((item as any).totalAmount ?? 0) - (Number((item as any).paidAmount ?? 0) - Number((item as any).refundedAmount ?? 0)) }),
    }),
    fulfilment: status(['install', 'delivery', 'pickup', 'service']),
    /** Paid but stock could not be reserved at confirmation (two checkouts for the last unit); picking retries. */
    stockShort: serverBool(),
    /** Stock held for this order: [{ productId, locationId, quantity }]. */
    reservations: serverJson(),
    shippingAddress: serverJson(),
    trackingNumber: serverText(),
    carrier: serverText(),
    cancelReason: serverText(),
    cancelledAt: serverTime(),
    confirmedAt: serverTime(),
    pickedAt: serverTime(),
    deliveredAt: serverTime(),
    completedAt: serverTime(),
    customer: relationship({ ref: 'Customer.orders', ...ro }),
    site: relationship({ ref: 'Site', ...ro }),
    quote: relationship({ ref: 'Quote.order', ...ro }),
    cart: relationship({ ref: 'Cart.order', ...ro }),
    branch: relationship({ ref: 'Branch', ...ro }),
    salesAgent: relationship({ ref: 'User', ...ro }),
    lines: relationship({ ref: 'OrderLine.order', many: true, ...ro }),
    payments: relationship({ ref: 'Payment.order', many: true, ...ro }),
    sessions: relationship({ ref: 'PaymentSession.order', many: true, ...ro }),
    refunds: relationship({ ref: 'Refund.order', many: true, ...ro }),
    plan: relationship({ ref: 'PaymentPlan.order', ...ro }),
    installation: relationship({ ref: 'Installation.order', ...ro }),
    incentiveApplications: relationship({ ref: 'IncentiveApplication.order', many: true, ...ro }),
    changes: relationship({ ref: 'OrderChange.order', many: true, ...ro }),
    invoices: relationship({ ref: 'Invoice.order', many: true, ...ro }),
    serializedUnits: relationship({ ref: 'SerializedUnit.order', many: true, ...ro }),
    commissions: relationship({ ref: 'Commission.order', many: true, ...ro }),
    referral: relationship({ ref: 'Referral.order', ...ro }),
    systems: relationship({ ref: 'InstalledSystem.order', many: true, ...ro }),
    ...trackingFields,
  },
})

/** Line snapshots: never updated or deleted through the API (5.8). */
export const OrderLine = list({
  access: staffOrCustomer([...ORDER_STAFF], id => ({ order: byCustomer(id) })),
  fields: {
    kind: status(['product', 'labour', 'delivery', 'discount', 'incentive', 'fee']),
    name: serverText(),
    sku: serverText(),
    quantity: serverInt(1),
    unitAmount: money({ readOnly: true }),
    taxAmount: money({ readOnly: true }),
    totalAmount: money({ readOnly: true }),
    warrantyMonths: serverInt(0),
    snapshot: serverJson(),
    fulfilledQuantity: serverInt(0),
    returnedQuantity: serverInt(0),
    requiresInstallation: checkbox({ defaultValue: false, ...ro }),
    order: relationship({ ref: 'Order.lines', ...ro }),
    product: relationship({ ref: 'Product', ...ro }),
    ...trackingFields,
  },
})

export const OrderChange = list({
  access: staffOrCustomer(['canManageOrders'], id => ({ order: byCustomer(id) })),
  fields: {
    status: status(['proposed', 'approved', 'rejected', 'applied']),
    version: version(),
    description: serverText(),
    differenceAmount: integer({ defaultValue: 0, ...ro }),
    linesJson: serverJson(),
    order: relationship({ ref: 'Order.changes', ...ro }),
    createdBy: relationship({ ref: 'User', ...ro }),
    ...trackingFields,
  },
})

export const PaymentProvider = list({
  access: {
    operation: { query: () => true, create: anyOf('canManageSettings'), update: anyOf('canManageSettings'), delete: sys },
  },
  fields: {
    name: text({ validation: { isRequired: true } }),
    code: text({ isIndexed: 'unique', validation: { isRequired: true, match: { regex: /^(stripe|mobile_money|bank_transfer|cash)$/, explanation: 'One of stripe, mobile_money, bank_transfer, cash' } } }),
    isEnabled: checkbox({ defaultValue: true }),
    isOnline: checkbox({ defaultValue: false, ...ro }),
    /** Shown to the customer: till number, paybill, UPI id or bank details. */
    instructions: text({ ui: { displayMode: 'textarea' } }),
    /** Names of env vars holding credentials (never the values). */
    credentialEnv: json({ defaultValue: {}, access: { read: anyOf('canManageSettings') } }),
    sortOrder: integer({ defaultValue: 0 }),
    ...trackingFields,
  },
})

const sessionStaffOrOwn = staffOrCustomer(['canReadPayments', 'canManagePayments'], byCustomer)

export const PaymentSession = list({
  access: sessionStaffOrOwn,
  ui: { listView: { initialColumns: ['purpose', 'status', 'amount', 'provider', 'customer', 'expiresAt'] } },
  fields: {
    status: status(['pending', 'authorized', 'captured', 'failed', 'expired', 'cancelled', 'partially_refunded', 'refunded', 'unknown']),
    version: version(),
    publicCode: serverKey(),
    amount: money({ readOnly: true }),
    currencyCode: currency(),
    purpose: status(['deposit', 'full', 'instalment', 'balance', 'payoff', 'survey_fee', 'service', 'plan', 'order_change']),
    description: serverText(),
    providerRef: serverText(),
    clientSecret: text({ access: { read: sys, create: sys, update: sys }, ui: { itemView: { fieldMode: 'hidden' } } }),
    idempotencyKeyHash: text({ isIndexed: 'unique', db: { isNullable: true }, access: { read: sys, create: sys, update: sys }, ui: { itemView: { fieldMode: 'hidden' } } }),
    expiresAt: serverTime(),
    capturedAt: serverTime(),
    lastCheckedAt: serverTime(),
    providerStatus: serverText(),
    provider: relationship({ ref: 'PaymentProvider', ...ro }),
    order: relationship({ ref: 'Order.sessions', ...ro }),
    installments: relationship({ ref: 'Installment.sessions', many: true, ...ro }),
    subscription: relationship({ ref: 'ServicePlanSubscription.sessions', ...ro }),
    ticket: relationship({ ref: 'ServiceTicket', ...ro }),
    quote: relationship({ ref: 'Quote', ...ro }),
    visit: relationship({ ref: 'Visit', ...ro }),
    orderChange: relationship({ ref: 'OrderChange', ...ro }),
    customer: relationship({ ref: 'Customer', ...ro }),
    payments: relationship({ ref: 'Payment.session', many: true, ...ro }),
    ...trackingFields,
  },
})

export const Payment = list({
  access: staffOrCustomer(['canReadPayments', 'canManagePayments'], byCustomer),
  ui: { listView: { initialColumns: ['receiptNumber', 'status', 'method', 'amount', 'reference', 'customer', 'receivedAt'] } },
  fields: {
    status: status(['submitted', 'verified', 'rejected', 'captured', 'partially_refunded', 'refunded', 'unknown']),
    version: version(),
    method: status(['card', 'mobile_money', 'bank_transfer', 'cash', 'store_credit']),
    amount: money({ readOnly: true }),
    currencyCode: currency(),
    reference: serverText(),
    /** provider code + normalised reference; unique so one M-Pesa code can't pay twice (5.8). */
    referenceKey: serverKey(),
    payerPhone: serverText(),
    receivedAt: serverTime(),
    verifiedAt: serverTime(),
    receiptNumber: serverKey(),
    rejectReason: serverText(),
    refundedAmount: money({ readOnly: true }),
    allocatedAmount: money({ readOnly: true }),
    provider: relationship({ ref: 'PaymentProvider', ...ro }),
    session: relationship({ ref: 'PaymentSession.payments', ...ro }),
    order: relationship({ ref: 'Order.payments', ...ro }),
    customer: relationship({ ref: 'Customer.payments', ...ro }),
    verifiedBy: relationship({ ref: 'User', ...ro }),
    collectedBy: relationship({ ref: 'User', ...ro }),
    allocations: relationship({ ref: 'PaymentAllocation.payment', many: true, ...ro }),
    refunds: relationship({ ref: 'Refund.payment', many: true, ...ro }),
    ...trackingFields,
  },
})

export const PaymentAllocation = list({
  access: staffOrCustomer(['canReadPayments'], id => ({ payment: byCustomer(id) })),
  fields: {
    amount: money({ readOnly: true }),
    kind: status(['order', 'installment', 'subscription', 'ticket', 'visit', 'credit', 'order_change']),
    payment: relationship({ ref: 'Payment.allocations', ...ro }),
    order: relationship({ ref: 'Order', ...ro }),
    installment: relationship({ ref: 'Installment.allocations', ...ro }),
    subscription: relationship({ ref: 'ServicePlanSubscription', ...ro }),
    ...trackingFields,
  },
})

export const Refund = list({
  access: staffOrCustomer(['canReadPayments', 'canIssueRefunds'], id => ({ order: byCustomer(id) })),
  fields: {
    status: status(['pending', 'succeeded', 'failed', 'unknown']),
    version: version(),
    amount: money({ readOnly: true }),
    currencyCode: currency(),
    reason: serverText(),
    providerRef: serverText(),
    payoutReference: serverText(),
    payment: relationship({ ref: 'Payment.refunds', ...ro }),
    order: relationship({ ref: 'Order.refunds', ...ro }),
    issuedBy: relationship({ ref: 'User', ...ro }),
    ...trackingFields,
  },
})

export const PaymentWebhookEvent = list({
  access: governed('canManagePayments'),
  fields: {
    providerEventId: serverKey(),
    type: serverText(),
    payloadHash: serverText(),
    status: status(['received', 'processed', 'ignored', 'mismatch', 'failed']),
    processedAt: serverTime(),
    error: serverText(),
    provider: relationship({ ref: 'PaymentProvider', ...ro }),
    ...trackingFields,
  },
})

export const PaymentPlan = list({
  access: staffOrCustomer(['canReadPayments', 'canManagePayments', 'canManageOrders'], byCustomer),
  ui: { listView: { initialColumns: ['order', 'status', 'kind', 'totalAmount', 'paidAmount', 'nextDueAt'] } },
  fields: {
    status: status(['pending', 'active', 'in_arrears', 'defaulted', 'completed', 'settled_early', 'cancelled']),
    version: version(),
    kind: status(['instalments', 'milestones']),
    currencyCode: currency(),
    principalAmount: money({ readOnly: true }),
    planFeeAmount: money({ readOnly: true }),
    depositAmount: money({ readOnly: true }),
    totalAmount: money({ readOnly: true }),
    paidAmount: money({ readOnly: true }),
    startDate: serverTime(),
    frequency: serverText(),
    nextDueAt: serverTime(),
    order: relationship({ ref: 'Order.plan', ...ro }),
    customer: relationship({ ref: 'Customer.plans', ...ro }),
    template: relationship({ ref: 'PaymentPlanTemplate', ...ro }),
    installments: relationship({ ref: 'Installment.plan', many: true, ...ro }),
    ...trackingFields,
  },
})

export const Installment = list({
  access: staffOrCustomer(['canReadPayments', 'canManagePayments', 'canManageOrders'], id => ({ plan: byCustomer(id) })),
  fields: {
    sequence: serverInt(1),
    label: serverText(),
    dueDate: serverTime(),
    amount: money({ readOnly: true }),
    paidAmount: money({ readOnly: true }),
    status: status(['scheduled', 'due', 'partially_paid', 'overdue', 'paid', 'waived', 'cancelled']),
    version: version(),
    paidAt: serverTime(),
    waivedReason: serverText(),
    trigger: status(['date', 'on_order', 'on_delivery', 'on_commissioning']),
    remindedAt: serverTime(),
    plan: relationship({ ref: 'PaymentPlan.installments', ...ro }),
    allocations: relationship({ ref: 'PaymentAllocation.installment', many: true, ...ro }),
    sessions: relationship({ ref: 'PaymentSession.installments', many: true, ...ro }),
    invoice: relationship({ ref: 'Invoice.installment', ...ro }),
    ...trackingFields,
  },
})

export const Invoice = list({
  access: staffOrCustomer(['canReadPayments', 'canManageOrders'], byCustomer),
  fields: {
    number: serverKey(),
    status: status(['issued', 'paid', 'void']),
    version: version(),
    issuedAt: serverTime(),
    dueAt: serverTime(),
    totalAmount: money({ readOnly: true }),
    currencyCode: currency(),
    linesJson: serverJson(),
    order: relationship({ ref: 'Order.invoices', ...ro }),
    customer: relationship({ ref: 'Customer', ...ro }),
    installment: relationship({ ref: 'Installment.invoice', ...ro }),
    ...trackingFields,
  },
})

export { has, managed, json, timestamp, calendarDay }
