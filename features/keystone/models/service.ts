import { list, graphql } from '@keystone-6/core'
import { checkbox, integer, json, relationship, text, timestamp, virtual, file } from '@keystone-6/core/fields'
import { document } from '@keystone-6/fields-document'
import { anyOf, has, staffOrCustomer, sys } from '../access'
import { choice, currency, governed, managed, money, percent, published, qty, ro, serverBool, serverJson, serverKey, serverText, serverTime, status, version } from './fields'
import { trackingFields } from './trackingFields'
import { subscriptionEffectiveStatus, ticketEffectiveStatus, ticketPastTarget } from '../lib/time'

const byCustomer = (id: string) => ({ customer: { id: { equals: id } } })
const SYSTEM_STAFF = ['canManageSystems', 'canManageTickets', 'canManageVisits', 'canDoFieldWork', 'canManagePlans'] as const

export const SYSTEM_STATUSES = ['commissioned', 'active', 'underperforming', 'not_working', 'inactive', 'decommissioned'] as const

export const InstalledSystem = list({
  access: staffOrCustomer([...SYSTEM_STAFF], byCustomer),
  ui: { labelField: 'number', listView: { initialColumns: ['number', 'status', 'customer', 'product', 'commissionedAt', 'nextCheckDueAt'] } },
  fields: {
    number: serverKey(),
    publicCode: serverKey(),
    status: status(SYSTEM_STATUSES),
    version: version(),
    statusReason: serverText(),
    installedAt: serverTime(),
    commissionedAt: serverTime(),
    lastCheckedAt: serverTime(),
    lastCheckResult: serverText(),
    nextCheckDueAt: serverTime(),
    notes: serverText(),
    customer: relationship({ ref: 'Customer.systems', ...ro }),
    site: relationship({ ref: 'Site', ...ro }),
    product: relationship({ ref: 'Product', ...ro }),
    serializedUnit: relationship({ ref: 'SerializedUnit.installedSystem', ...ro }),
    order: relationship({ ref: 'Order.systems', ...ro }),
    installation: relationship({ ref: 'Installation.system', ...ro }),
    warranties: relationship({ ref: 'WarrantyCoverage.system', many: true, ...ro }),
    readings: relationship({ ref: 'SystemReading.system', many: true, ...ro }),
    tickets: relationship({ ref: 'ServiceTicket.system', many: true, ...ro }),
    subscriptions: relationship({ ref: 'ServicePlanSubscription.system', many: true, ...ro }),
    visits: relationship({ ref: 'Visit.system', many: true, ...ro }),
    training: relationship({ ref: 'TrainingRecord.system', many: true, ...ro }),
    ...trackingFields,
  },
})

export const WarrantyCoverage = list({
  access: staffOrCustomer([...SYSTEM_STAFF], id => ({ system: byCustomer(id) })),
  fields: {
    component: status(['reactor', 'appliances', 'gas_line', 'workmanship']),
    version: version(),
    startsAt: serverTime(),
    endsAt: serverTime(),
    terms: serverText(),
    isVoid: serverBool(),
    voidReason: serverText(),
    system: relationship({ ref: 'InstalledSystem.warranties', ...ro }),
    ...trackingFields,
  },
})

export const SystemReading = list({
  access: staffOrCustomer([...SYSTEM_STAFF, 'canReadReports'], id => ({ system: byCustomer(id) })),
  fields: {
    at: serverTime(),
    source: status(['customer', 'technician', 'call', 'meter']),
    working: serverBool(true),
    cookingHours: qty(),
    pressureKpa: qty(),
    feedKg: qty(),
    waterL: qty(),
    slurryUsed: serverBool(),
    problem: serverText(),
    system: relationship({ ref: 'InstalledSystem.readings', ...ro }),
    visit: relationship({ ref: 'Visit.readings', ...ro }),
    recordedBy: relationship({ ref: 'User', ...ro }),
    ...trackingFields,
  },
})

export const TICKET_STATUSES = ['open', 'triaged', 'phone_resolved', 'visit_scheduled', 'in_progress', 'awaiting_customer_approval', 'resolved', 'reopened', 'closed', 'cancelled'] as const
export const TICKET_CATEGORIES = ['no_gas', 'low_pressure', 'smell', 'leak', 'stove_fault', 'slurry_overflow', 'other'] as const

export const ServiceTicket = list({
  access: staffOrCustomer(['canManageTickets', 'canManageSystems', 'canManageVisits', 'canDoFieldWork'], byCustomer),
  ui: { labelField: 'number', listView: { initialColumns: ['number', 'status', 'category', 'customer', 'responseDueAt'] } },
  fields: {
    number: serverKey(),
    status: status(TICKET_STATUSES),
    version: version(),
    effectiveStatus: virtual({ field: graphql.field({ type: graphql.String, resolve: item => ticketEffectiveStatus(item as never, new Date()) }) }),
    pastTarget: virtual({ field: graphql.field({ type: graphql.Boolean, resolve: item => ticketPastTarget(item as never, new Date()) }) }),
    channel: status(['portal', 'public_form', 'phone', 'follow_up']),
    category: status(TICKET_CATEGORIES),
    severity: status(['normal', 'urgent']),
    description: serverText(),
    callbackPhone: serverText(),
    responseDueAt: serverTime(),
    firstResponseAt: serverTime(),
    resolvedAt: serverTime(),
    closedAt: serverTime(),
    resolution: serverText(),
    warrantyDecision: status(['pending', 'covered', 'not_covered', 'goodwill']),
    warrantyNote: serverText(),
    supplierClaim: serverBool(),
    partReplaced: serverText(),
    customerConfirmed: serverBool(),
    system: relationship({ ref: 'InstalledSystem.tickets', ...ro }),
    customer: relationship({ ref: 'Customer.tickets', ...ro }),
    assignedTo: relationship({ ref: 'User', ...ro }),
    visits: relationship({ ref: 'Visit.ticket', many: true, ...ro }),
    quotes: relationship({ ref: 'Quote.ticket', many: true, ...ro }),
    events: relationship({ ref: 'TicketEvent.ticket', many: true, ...ro }),
    media: relationship({ ref: 'Media.ticket', many: true }),
    ...trackingFields,
  },
})

export const TicketEvent = list({
  access: {
    operation: { query: ({ session }) => has(session, 'canManageTickets') || has(session, 'canDoFieldWork') || Boolean(session?.data?.customer?.id), create: sys, update: sys, delete: sys },
    filter: {
      query: ({ session }) => (has(session, 'canManageTickets') || has(session, 'canDoFieldWork') ? true : session?.data?.customer?.id ? { isCustomerVisible: { equals: true }, ticket: byCustomer(session.data.customer.id) } : false),
    },
  },
  fields: {
    type: status(['note', 'status', 'call', 'customer_message']),
    body: serverText(),
    isCustomerVisible: serverBool(),
    ticket: relationship({ ref: 'ServiceTicket.events', ...ro }),
    user: relationship({ ref: 'User', ...ro }),
    ...trackingFields,
  },
})

export const ServicePlan = list({
  access: published('canManagePlans'),
  fields: {
    name: text({ validation: { isRequired: true } }),
    slug: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    description: text({ ui: { displayMode: 'textarea' } }),
    priceAmount: money(),
    currencyCode: currency(),
    billing: choice(['yearly', 'monthly'], 'yearly'),
    visitsPerYear: integer({ defaultValue: 1 }),
    partsDiscountPercent: percent('0'),
    priorityResponse: checkbox({ defaultValue: false }),
    includedItems: json({ defaultValue: [] }),
    isPublished: checkbox({ defaultValue: true }),
    subscriptions: relationship({ ref: 'ServicePlanSubscription.plan', many: true, ...ro }),
    ...trackingFields,
  },
})

export const ServicePlanSubscription = list({
  access: staffOrCustomer(['canManagePlans', 'canManageSystems', 'canReadPayments'], byCustomer),
  fields: {
    status: status(['pending_payment', 'active', 'renewal_due', 'grace', 'lapsed', 'cancelled']),
    version: version(),
    effectiveStatus: virtual({ field: graphql.field({ type: graphql.String, resolve: item => subscriptionEffectiveStatus(item as never, new Date()) }) }),
    priceAmount: money({ readOnly: true }),
    currencyCode: currency(),
    billing: serverText(),
    startedAt: serverTime(),
    currentPeriodStart: serverTime(),
    currentPeriodEnd: serverTime(),
    visitsUsed: integer({ defaultValue: 0, ...ro }),
    autoRenew: serverBool(true),
    cancelledAt: serverTime(),
    cancelReason: serverText(),
    refundAmount: money({ readOnly: true }),
    plan: relationship({ ref: 'ServicePlan.subscriptions', ...ro }),
    system: relationship({ ref: 'InstalledSystem.subscriptions', ...ro }),
    customer: relationship({ ref: 'Customer.subscriptions', ...ro }),
    sessions: relationship({ ref: 'PaymentSession.subscription', many: true, ...ro }),
    visits: relationship({ ref: 'Visit.subscription', many: true, ...ro }),
    ...trackingFields,
  },
})

export const TroubleshootingGuide = list({
  access: published(['canManageTickets', 'canManageSettings']),
  fields: {
    title: text({ validation: { isRequired: true } }),
    slug: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    symptomCategory: choice(TICKET_CATEGORIES, 'other'),
    steps: document({ formatting: true, links: true, dividers: true }),
    stepsText: text({ ui: { displayMode: 'textarea', description: 'Plain steps, one per line (used on phones and in the ticket triage panel)' } }),
    appliesTo: relationship({ ref: 'Product.guides', many: true }),
    language: text({ defaultValue: 'en' }),
    isPublished: checkbox({ defaultValue: true }),
    ...trackingFields,
  },
})

export const Resource = list({
  access: published(['canManageCatalog', 'canManageSettings']),
  fields: {
    title: text({ validation: { isRequired: true } }),
    kind: choice(['manual', 'video', 'guide'], 'manual'),
    file: file({ storage: 'biogas_files' }),
    url: text(),
    language: text({ defaultValue: 'en' }),
    isPublished: checkbox({ defaultValue: true }),
    products: relationship({ ref: 'Product.resources', many: true }),
    ...trackingFields,
  },
})

export const Referral = list({
  access: staffOrCustomer(['canManageCommissions', 'canManageLeads', 'canReadPayments'], id => ({ referrer: { id: { equals: id } } })),
  fields: {
    code: serverText(),
    status: status(['pending', 'qualified', 'approved', 'rewarded', 'void']),
    version: version(),
    rewardAmount: money({ readOnly: true }),
    currencyCode: currency(),
    rewardKind: serverText(),
    qualifiedAt: serverTime(),
    rewardedAt: serverTime(),
    voidReason: serverText(),
    referrer: relationship({ ref: 'Customer.referralsMade', ...ro }),
    lead: relationship({ ref: 'Lead.referral', ...ro }),
    order: relationship({ ref: 'Order.referral', ...ro }),
    ...trackingFields,
  },
})

export const Commission = list({
  access: {
    operation: { query: ({ session }) => has(session, 'canManageCommissions') || has(session, 'canManageLeads'), create: sys, update: sys, delete: sys },
    // An agent sees their own commission (section 2).
    filter: { query: ({ session }) => (has(session, 'canManageCommissions') ? true : { agent: { id: { equals: session?.itemId ?? '' } } }) },
  },
  fields: {
    status: status(['accrued', 'approved', 'paid', 'clawed_back']),
    version: version(),
    basisAmount: money({ readOnly: true }),
    amount: money({ readOnly: true }),
    currencyCode: currency(),
    rule: serverJson(),
    approvedAt: serverTime(),
    paidAt: serverTime(),
    clawedBackAt: serverTime(),
    agent: relationship({ ref: 'User.commissions', ...ro }),
    order: relationship({ ref: 'Order.commissions', ...ro }),
    ...trackingFields,
  },
})

export const CommissionRule = list({
  access: managed(['canManageCommissions', 'canManageSettings'], ['canManageCommissions', 'canManageSettings']),
  fields: {
    name: text({ validation: { isRequired: true } }),
    type: choice(['percent_of_order', 'fixed_per_system'], 'percent_of_order'),
    /** percent ("3.5") or minor units ("5000"). */
    value: text({ defaultValue: '0', validation: { isRequired: true } }),
    isActive: checkbox({ defaultValue: true }),
    ...trackingFields,
  },
})

export const Story = list({
  access: published('canManageSettings'),
  fields: {
    title: text({ validation: { isRequired: true } }),
    slug: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    customerName: text(),
    location: text(),
    body: text({ ui: { displayMode: 'textarea' } }),
    imageUrl: text(),
    savingsText: text(),
    isPublished: checkbox({ defaultValue: true }),
    ...trackingFields,
  },
})

export const Faq = list({
  access: published('canManageSettings'),
  fields: {
    question: text({ validation: { isRequired: true } }),
    answer: text({ ui: { displayMode: 'textarea' }, validation: { isRequired: true } }),
    category: text({ defaultValue: 'general' }),
    sortOrder: integer({ defaultValue: 0 }),
    isPublished: checkbox({ defaultValue: true }),
    ...trackingFields,
  },
})

export { anyOf, sys, governed, serverBool, timestamp, serverJson }
