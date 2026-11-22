import { list } from '@keystone-6/core'
import { checkbox, integer, json, relationship, text, timestamp } from '@keystone-6/core/fields'
import { anyOf, has, staffOrCustomer, sys } from '../access'
import { choice, currency, geo, governed, managed, money, percent, qty, ro, serverBool, serverJson, serverKey, serverText, serverTime, status, version } from './fields'
import { trackingFields } from './trackingFields'

const own = (path: (id: string) => Record<string, unknown>) => path
const CUSTOMER_STAFF = ['canManageLeads', 'canManageQuotes', 'canManageOrders', 'canManageTickets', 'canManageVisits', 'canReadPayments', 'canManageSystems', 'canDoFieldWork'] as const

export const Customer = list({
  access: {
    operation: {
      query: ({ session }) => CUSTOMER_STAFF.some(p => has(session, p)) || Boolean(session?.data?.customer?.id),
      create: anyOf('canManageLeads', 'canManageOrders', 'canManageTickets'),
      // Customers edit their profile through updateMyProfile (S25); staff edit here.
      update: anyOf('canManageLeads', 'canManageOrders', 'canManageTickets'),
      delete: sys,
    },
    filter: {
      query: ({ session }) => (CUSTOMER_STAFF.some(p => has(session, p)) ? true : session?.data?.customer?.id ? { id: { equals: session.data.customer.id } } : false),
    },
  },
  ui: { listView: { initialColumns: ['number', 'name', 'type', 'phone', 'email'] } },
  fields: {
    number: serverKey(),
    type: choice(['household', 'farm', 'institution'], 'household'),
    name: text({ validation: { isRequired: true } }),
    organisationName: text(),
    phone: text(),
    altPhone: text(),
    email: text(),
    preferredLanguage: text({ defaultValue: 'en' }),
    preferredContact: choice(['call', 'sms', 'whatsapp', 'email'], 'whatsapp'),
    contactConsent: checkbox({ defaultValue: false }),
    consentAt: timestamp(),
    storeCreditAmount: money({ readOnly: true }),
    currencyCode: currency(),
    notes: text({ ui: { displayMode: 'textarea' } }),
    referralCode: serverKey(),
    user: relationship({ ref: 'User.customer', ...ro }),
    contacts: relationship({ ref: 'CustomerContact.customer', many: true }),
    sites: relationship({ ref: 'Site.customer', many: true }),
    leads: relationship({ ref: 'Lead.customer', many: true, ...ro }),
    quotes: relationship({ ref: 'Quote.customer', many: true, ...ro }),
    orders: relationship({ ref: 'Order.customer', many: true, ...ro }),
    systems: relationship({ ref: 'InstalledSystem.customer', many: true, ...ro }),
    tickets: relationship({ ref: 'ServiceTicket.customer', many: true, ...ro }),
    payments: relationship({ ref: 'Payment.customer', many: true, ...ro }),
    plans: relationship({ ref: 'PaymentPlan.customer', many: true, ...ro }),
    subscriptions: relationship({ ref: 'ServicePlanSubscription.customer', many: true, ...ro }),
    referralsMade: relationship({ ref: 'Referral.referrer', many: true, ...ro }),
    contactLogs: relationship({ ref: 'ContactLog.customer', many: true, ...ro }),
    ...trackingFields,
  },
})

export const CustomerContact = list({
  access: {
    ...staffOrCustomer([...CUSTOMER_STAFF], own(id => ({ customer: { id: { equals: id } } }))),
    operation: { ...staffOrCustomer([...CUSTOMER_STAFF], own(id => ({ customer: { id: { equals: id } } }))).operation, create: anyOf('canManageLeads', 'canManageOrders'), update: anyOf('canManageLeads', 'canManageOrders'), delete: anyOf('canManageLeads', 'canManageOrders') },
  },
  fields: {
    name: text({ validation: { isRequired: true } }),
    role: text(),
    phone: text(),
    email: text(),
    isPrimary: checkbox({ defaultValue: false }),
    customer: relationship({ ref: 'Customer.contacts' }),
    ...trackingFields,
  },
})

export const Site = list({
  access: {
    operation: { ...staffOrCustomer([...CUSTOMER_STAFF], id => ({ customer: { id: { equals: id } } })).operation, create: anyOf('canManageLeads', 'canManageOrders', 'canManageVisits'), update: anyOf('canManageLeads', 'canManageOrders', 'canManageVisits', 'canDoFieldWork') },
    filter: staffOrCustomer([...CUSTOMER_STAFF], id => ({ customer: { id: { equals: id } } })).filter,
  },
  fields: {
    label: text({ defaultValue: 'Home' }),
    addressLine: text(),
    city: text(),
    region: text(),
    country: text(),
    postcode: text(),
    lat: geo(),
    lng: geo(),
    directions: text({ ui: { displayMode: 'textarea' } }),
    siteType: choice(['home', 'farm', 'school', 'hotel', 'hospital', 'restaurant', 'other'], 'home'),
    animals: json({ defaultValue: {} }),
    kitchenWasteKgPerDay: qty(),
    peopleServed: integer(),
    waterSource: text(),
    waterDistanceM: qty(),
    currentFuels: json({ defaultValue: [] }),
    monthlyFuelSpendAmount: money(),
    kitchenDistanceM: qty(),
    customer: relationship({ ref: 'Customer.sites' }),
    serviceArea: relationship({ ref: 'ServiceArea.sites' }),
    media: relationship({ ref: 'Media.site', many: true }),
    ...trackingFields,
  },
})

export const SizingAssessment = list({
  access: {
    ...staffOrCustomer(['canManageLeads', 'canManageQuotes'], id => ({ lead: { customer: { id: { equals: id } } } })),
  },
  fields: {
    inputs: serverJson(),
    dailyFeedKg: qty(),
    estimatedGasM3: qty(),
    cookingHours: qty(),
    fuelSavedAmountPerMonth: money({ readOnly: true }),
    paybackMonths: integer({ ...ro }),
    source: status(['public', 'staff']),
    resultJson: serverJson(),
    recommendedProduct: relationship({ ref: 'Product', ...ro }),
    lead: relationship({ ref: 'Lead.assessments', ...ro }),
    site: relationship({ ref: 'Site', ...ro }),
    ...trackingFields,
  },
})

export const LEAD_STATUSES = ['new', 'contacted', 'survey_scheduled', 'surveyed', 'quoted', 'won', 'lost', 'unqualified'] as const

export const Lead = list({
  access: {
    operation: { query: anyOf('canManageLeads', 'canSeeAllLeads', 'canManageQuotes', 'canManageVisits'), create: sys, update: anyOf('canManageLeads'), delete: sys },
    // An agent without canSeeAllLeads sees the leads assigned to them (section 2).
    filter: {
      query: ({ session }) =>
        has(session, 'canSeeAllLeads') || has(session, 'canManageVisits') || has(session, 'canManageQuotes') ? true : { assignedTo: { id: { equals: session?.itemId ?? '' } } },
      update: ({ session }) => (has(session, 'canSeeAllLeads') ? true : { assignedTo: { id: { equals: session?.itemId ?? '' } } }),
    },
  },
  ui: { labelField: 'number', listView: { initialColumns: ['number', 'status', 'customer', 'source', 'interest', 'assignedTo'] } },
  fields: {
    number: serverKey(),
    status: status(LEAD_STATUSES),
    version: version(),
    source: choice(['website', 'phone', 'walk_in', 'field_agent', 'referral', 'dealer', 'import', 'event'], 'website'),
    interest: choice(['home', 'farm', 'institution', 'parts', 'service'], 'home'),
    message: text({ ui: { displayMode: 'textarea' } }),
    firstResponseDueAt: serverTime(),
    firstContactAt: serverTime(),
    lostReason: serverText(),
    utm: json({ defaultValue: {} }),
    customer: relationship({ ref: 'Customer.leads', ...ro }),
    site: relationship({ ref: 'Site', ...ro }),
    assignedTo: relationship({ ref: 'User.assignedLeads', ...ro }),
    branch: relationship({ ref: 'Branch', ...ro }),
    referral: relationship({ ref: 'Referral.lead', ...ro }),
    assessments: relationship({ ref: 'SizingAssessment.lead', many: true, ...ro }),
    activities: relationship({ ref: 'LeadActivity.lead', many: true, ...ro }),
    quotes: relationship({ ref: 'Quote.lead', many: true, ...ro }),
    visits: relationship({ ref: 'Visit.lead', many: true, ...ro }),
    ...trackingFields,
  },
})

export const LeadActivity = list({
  access: governed(['canManageLeads', 'canSeeAllLeads']),
  fields: {
    type: status(['call', 'sms', 'whatsapp', 'email', 'visit', 'note', 'status']),
    summary: serverText(),
    outcome: serverText(),
    at: timestamp({ defaultValue: { kind: 'now' }, ...ro }),
    lead: relationship({ ref: 'Lead.activities', ...ro }),
    user: relationship({ ref: 'User', ...ro }),
    ...trackingFields,
  },
})

export const QUOTE_STATUSES = ['draft', 'pending_approval', 'approved', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'superseded', 'cancelled'] as const
const quoteOwn = (id: string) => ({ customer: { id: { equals: id } } })

export const Quote = list({
  access: {
    operation: {
      query: ({ session }) => has(session, 'canManageQuotes') || has(session, 'canManageTickets') || has(session, 'canManageLeads') || Boolean(session?.data?.customer?.id),
      create: sys,
      update: sys,
      delete: sys,
    },
    filter: {
      query: ({ session }) =>
        has(session, 'canManageQuotes') || has(session, 'canManageTickets') || has(session, 'canManageLeads')
          ? true
          : session?.data?.customer?.id
            ? { ...quoteOwn(session.data.customer.id), status: { notIn: ['draft', 'pending_approval', 'approved', 'cancelled'] } }
            : false,
    },
  },
  ui: { labelField: 'number', listView: { initialColumns: ['number', 'version', 'status', 'customer', 'totalAmount', 'validUntil'] } },
  fields: {
    number: text({ isIndexed: true, ...ro }),
    version: integer({ defaultValue: 1, validation: { isRequired: true }, ...ro }),
    casVersion: integer({ defaultValue: 0, validation: { isRequired: true }, ...ro }),
    kind: status(['sale', 'service']),
    status: status(QUOTE_STATUSES),
    publicCode: serverKey(),
    validUntil: serverTime(),
    notes: serverText(),
    terms: serverText(),
    currencyCode: currency(),
    subtotalAmount: money({ readOnly: true }),
    discountAmount: money({ readOnly: true }),
    taxAmount: money({ readOnly: true }),
    totalAmount: money({ readOnly: true }),
    signedName: serverText(),
    signedAt: serverTime(),
    signedIp: text({ access: { read: anyOf('canManageQuotes'), create: sys, update: sys }, ui: { itemView: { fieldMode: 'read' } } }),
    sentAt: serverTime(),
    viewedAt: serverTime(),
    declinedReason: serverText(),
    isLatest: serverBool(true),
    /** `${lead}:${kind}` while this is the latest version, else null: one latest quote per lead and kind (5.8). */
    latestKey: serverKey(),
    lead: relationship({ ref: 'Lead.quotes', ...ro }),
    customer: relationship({ ref: 'Customer.quotes', ...ro }),
    site: relationship({ ref: 'Site', ...ro }),
    preparedBy: relationship({ ref: 'User', ...ro }),
    approvedBy: relationship({ ref: 'User', ...ro }),
    options: relationship({ ref: 'QuoteOption.quote', many: true, ...ro }),
    acceptedOption: relationship({ ref: 'QuoteOption', ...ro }),
    acceptedPlanOffer: relationship({ ref: 'QuotePlanOffer', ...ro }),
    order: relationship({ ref: 'Order.quote', ...ro }),
    ticket: relationship({ ref: 'ServiceTicket.quotes', ...ro }),
    previous: relationship({ ref: 'Quote', ...ro }),
    ...trackingFields,
  },
})

const viaQuote = (id: string) => ({ quote: quoteOwn(id) })
export const QuoteOption = list({
  access: staffOrCustomer(['canManageQuotes', 'canManageTickets'], viaQuote),
  fields: {
    label: serverText(),
    description: serverText(),
    sortOrder: integer({ defaultValue: 0, ...ro }),
    isRecommended: serverBool(),
    subtotalAmount: money({ readOnly: true }),
    discountAmount: money({ readOnly: true }),
    taxAmount: money({ readOnly: true }),
    totalAmount: money({ readOnly: true }),
    quote: relationship({ ref: 'Quote.options', ...ro }),
    lines: relationship({ ref: 'QuoteLine.option', many: true, ...ro }),
    planOffers: relationship({ ref: 'QuotePlanOffer.option', many: true, ...ro }),
    ...trackingFields,
  },
})

export const QuoteLine = list({
  access: staffOrCustomer(['canManageQuotes', 'canManageTickets'], id => ({ option: viaQuote(id) })),
  fields: {
    kind: status(['product', 'labour', 'delivery', 'discount', 'incentive', 'fee']),
    description: serverText(),
    quantity: integer({ defaultValue: 1, ...ro }),
    unitAmount: money({ readOnly: true }),
    taxAmount: money({ readOnly: true }),
    totalAmount: money({ readOnly: true }),
    snapshot: serverJson(),
    option: relationship({ ref: 'QuoteOption.lines', ...ro }),
    product: relationship({ ref: 'Product', ...ro }),
    incentiveProgram: relationship({ ref: 'IncentiveProgram', ...ro }),
    ...trackingFields,
  },
})

export const PaymentPlanTemplate = list({
  access: managed('public', 'canManagePlans', { delete: false }),
  fields: {
    name: text({ validation: { isRequired: true } }),
    kind: choice(['full', 'instalments', 'milestones'], 'instalments'),
    depositPercent: percent('20'),
    instalmentCount: integer({ defaultValue: 0, validation: { isRequired: true, min: 0, max: 60 } }),
    frequency: choice(['weekly', 'monthly'], 'monthly'),
    planFeePercent: percent('0'),
    minOrderAmount: money(),
    /** For milestones: [{ label, percent, trigger: on_order | on_delivery | on_commissioning }]. */
    milestones: json({ defaultValue: [] }),
    isActive: checkbox({ defaultValue: true }),
    sortOrder: integer({ defaultValue: 0 }),
    ...trackingFields,
  },
})

export const QuotePlanOffer = list({
  access: staffOrCustomer(['canManageQuotes', 'canManageTickets'], id => ({ option: viaQuote(id) })),
  fields: {
    label: serverText(),
    depositAmount: money({ readOnly: true }),
    instalmentAmount: money({ readOnly: true }),
    instalmentCount: integer({ defaultValue: 0, ...ro }),
    frequency: serverText(),
    planFeeAmount: money({ readOnly: true }),
    totalAmount: money({ readOnly: true }),
    schedule: serverJson(),
    option: relationship({ ref: 'QuoteOption.planOffers', ...ro }),
    template: relationship({ ref: 'PaymentPlanTemplate', ...ro }),
    ...trackingFields,
  },
})

export const IncentiveProgram = list({
  access: managed('public', 'canManageIncentives', { delete: false }),
  fields: {
    name: text({ validation: { isRequired: true } }),
    country: text(),
    kind: choice(['subsidy', 'grant', 'carbon_discount', 'promo'], 'subsidy'),
    amountType: choice(['fixed', 'percent', 'by_capacity'], 'fixed'),
    /** fixed: minor units; percent: e.g. "25"; by_capacity: [{ maxM3, amount }]. */
    amountValue: text({ defaultValue: '0' }),
    capacityTable: json({ defaultValue: [] }),
    capAmount: money({ nullable: true }),
    treatment: choice(['off_price_now', 'paid_to_customer_later'], 'off_price_now'),
    requiredDocuments: json({ defaultValue: [] }),
    isActive: checkbox({ defaultValue: true }),
    infoUrl: text(),
    applications: relationship({ ref: 'IncentiveApplication.program', many: true, ...ro }),
    ...trackingFields,
  },
})

export const IncentiveApplication = list({
  access: staffOrCustomer(['canManageIncentives', 'canManageOrders'], id => ({ customer: { id: { equals: id } } })),
  ui: { listView: { initialColumns: ['program', 'status', 'customer', 'amount', 'reference'] } },
  fields: {
    status: status(['draft', 'submitted', 'approved', 'paid', 'rejected', 'withdrawn']),
    version: version(),
    amount: money({ readOnly: true }),
    currencyCode: currency(),
    treatment: serverText(),
    reference: serverText(),
    submittedAt: serverTime(),
    decidedAt: serverTime(),
    paidAt: serverTime(),
    notes: serverText(),
    rejectionHandling: serverText(),
    program: relationship({ ref: 'IncentiveProgram.applications', ...ro }),
    order: relationship({ ref: 'Order.incentiveApplications', ...ro }),
    customer: relationship({ ref: 'Customer', ...ro }),
    media: relationship({ ref: 'Media.incentiveApplication', many: true }),
    ...trackingFields,
  },
})

export { qty }
