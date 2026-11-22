import { list } from '@keystone-6/core'
import { allOperations, denyAll } from '@keystone-6/core/access'
import { checkbox, file, image, integer, json, password, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { anyOf, has, isSignedIn, permissionNames, permissions, rules, sys } from '../access'
import { choice, currency, geo, governed, managed, money, options, percent, ro, serverOnly } from './fields'
import { trackingFields } from './trackingFields'

const self = ({ session, item }: any) => session?.itemId === item?.id

export const User = list({
  access: {
    operation: {
      ...allOperations(isSignedIn),
      // Customer accounts are made by the registration operation; staff accounts by people managers.
      create: args => permissions.canManageUsers(args),
      delete: permissions.canManageUsers,
    },
    filter: { query: rules.canReadPeople, update: rules.canUpdatePeople },
  },
  ui: { listView: { initialColumns: ['name', 'email', 'role', 'branch', 'isActive'] } },
  fields: {
    name: text({ validation: { isRequired: true } }),
    email: text({ isFilterable: false, isOrderable: false, isIndexed: 'unique', validation: { isRequired: true } }),
    password: password({
      access: { read: denyAll, update: ({ session, item }) => permissions.canManageUsers({ session }) || session?.itemId === item.id },
      validation: { isRequired: true },
    }),
    phone: text(),
    preferredLanguage: text({ defaultValue: 'en' }),
    isActive: checkbox({ defaultValue: true, access: { create: permissions.canManageUsers, update: permissions.canManageUsers } }),
    onboardingStatus: select({
      options: options(['not_started', 'in_progress', 'completed', 'dismissed']),
      defaultValue: 'not_started',
      access: { update: ({ session, item }) => permissions.canManageUsers({ session }) || self({ session, item }) },
    }),
    role: relationship({ ref: 'Role.users', access: { create: permissions.canManageUsers, update: permissions.canManageUsers } }),
    branch: relationship({ ref: 'Branch.users', access: { create: permissions.canManageUsers, update: permissions.canManageUsers } }),
    customer: relationship({ ref: 'Customer.user', access: { create: permissions.canManageUsers, update: permissions.canManageUsers } }),
    lastLeadAssignedAt: timestamp({ ...ro }),
    assignedLeads: relationship({ ref: 'Lead.assignedTo', many: true, ...ro }),
    visits: relationship({ ref: 'Visit.technicians', many: true, ...ro }),
    timeOff: relationship({ ref: 'TechnicianTimeOff.technician', many: true, ...ro }),
    commissions: relationship({ ref: 'Commission.agent', many: true, ...ro }),
    van: relationship({ ref: 'StockLocation.technician', ...ro }),
    ...trackingFields,
  },
})

const roleFlags = Object.fromEntries(permissionNames.map(name => [name, checkbox({ defaultValue: false })]))

export const Role = list({
  access: { operation: { ...allOperations(permissions.canManageUsers), query: isSignedIn } },
  ui: { listView: { initialColumns: ['name', 'users'] } },
  fields: {
    name: text({ validation: { isRequired: true }, isIndexed: 'unique' }),
    ...roleFlags,
    /** Largest discount (percent of the option subtotal) this role may give without approval. */
    discountLimitPercent: percent('0'),
    users: relationship({ ref: 'User.role', many: true, ui: { itemView: { fieldMode: 'read' } } }),
    ...trackingFields,
  },
})

export const CompanySettings = list({
  isSingleton: true,
  access: managed('public', 'canManageSettings', { delete: false }),
  graphql: { plural: 'CompanySettingsList' },
  fields: {
    name: text({ validation: { isRequired: true }, defaultValue: 'Biogas company' }),
    legalName: text(),
    logo: image({ storage: 'biogas_images' }),
    country: choice(['US', 'KE', 'IN', 'PK', 'other'], 'US'),
    currencyCode: currency(),
    timezone: text({ defaultValue: 'America/Chicago' }),
    units: choice(['metric', 'imperial'], 'metric'),
    phone: text(),
    whatsappNumber: text(),
    email: text(),
    address: text({ ui: { displayMode: 'textarea' } }),
    taxRatePercent: percent('0'),
    taxLabel: text({ defaultValue: 'Sales tax' }),
    taxInclusive: checkbox({ defaultValue: false }),
    quoteValidDays: integer({ defaultValue: 30, validation: { isRequired: true, min: 1 } }),
    coolingOffDays: integer({ defaultValue: 3, validation: { isRequired: true, min: 0 } }),
    restockingFeePercent: percent('10'),
    surveyFeeAmount: money(),
    surveyRequiredByDefault: checkbox({ defaultValue: true }),
    visitCancelCutoffHours: integer({ defaultValue: 24, validation: { isRequired: true, min: 0 } }),
    slotsPerTechnicianPerDay: integer({ defaultValue: 4, validation: { isRequired: true, min: 1, max: 8 } }),
    leadResponseWorkingDays: integer({ defaultValue: 1, validation: { isRequired: true, min: 0 } }),
    serviceResponseTargetDays: integer({ defaultValue: 5, validation: { isRequired: true, min: 1 } }),
    instalmentGraceDays: integer({ defaultValue: 5, validation: { isRequired: true, min: 0 } }),
    defaultAfterDays: integer({ defaultValue: 60, validation: { isRequired: true, min: 1 } }),
    payBeforeServiceWork: checkbox({ defaultValue: false }),
    keepFeeOnLateCancel: checkbox({ defaultValue: true }),
    returnWindowDays: integer({ defaultValue: 30, validation: { isRequired: true, min: 0 } }),
    referralRewardAmount: money(),
    waivePlanFeeOnPayoff: checkbox({ defaultValue: true }),
    commissionClawbackDays: integer({ defaultValue: 90, validation: { isRequired: true, min: 0 } }),
    incentiveRejectionPolicy: choice(['absorb', 'add_final_instalment'], 'absorb'),
    followUpScheduleDays: json({ defaultValue: [7, 30, 90, 365] }),
    offlinePaymentInstructions: json({ defaultValue: {} }),
    heroText: text({ ui: { displayMode: 'textarea' } }),
    about: text({ ui: { displayMode: 'textarea' } }),
    impactNumbers: json({ defaultValue: [] }),
    onboardingAnswers: json({ ...ro }),
    onboardedAt: timestamp({ ...ro }),
    ...trackingFields,
  },
})

export const Branch = list({
  access: managed('public', 'canManageSettings', { delete: false }),
  ui: { listView: { initialColumns: ['name', 'code', 'phone', 'isActive'] } },
  fields: {
    name: text({ validation: { isRequired: true } }),
    code: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    address: text(),
    lat: geo(),
    lng: geo(),
    phone: text(),
    isActive: checkbox({ defaultValue: true }),
    users: relationship({ ref: 'User.branch', many: true, ui: { itemView: { fieldMode: 'read' } } }),
    serviceAreas: relationship({ ref: 'ServiceArea.branch', many: true }),
    stockLocations: relationship({ ref: 'StockLocation.branch', many: true }),
    ...trackingFields,
  },
})

export const ServiceArea = list({
  access: managed('public', 'canManageSettings'),
  fields: {
    name: text({ validation: { isRequired: true } }),
    country: text(),
    region: text(),
    /** Postcodes or districts this area covers; a postcode matches by prefix. */
    postcodes: json({ defaultValue: [] }),
    deliveryFeeAmount: money(),
    installSurchargeAmount: money(),
    isActive: checkbox({ defaultValue: true }),
    branch: relationship({ ref: 'Branch.serviceAreas' }),
    sites: relationship({ ref: 'Site.serviceArea', many: true, ...ro }),
    ...trackingFields,
  },
})

export const Sequence = list({
  access: serverOnly,
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    key: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    nextValue: integer({ defaultValue: 1, validation: { isRequired: true } }),
    ...trackingFields,
  },
})

export const CommandReceipt = list({
  access: serverOnly,
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    keyHash: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    actorId: text({ validation: { isRequired: true } }),
    operation: text({ validation: { isRequired: true } }),
    requestFingerprint: text({ validation: { isRequired: true } }),
    resultJson: json(),
    ...trackingFields,
  },
})

export const AuditEvent = list({
  access: governed(['canManageSettings', 'canReadReports']),
  ui: { labelField: 'action', listView: { initialColumns: ['createdAt', 'action', 'entityType', 'entityId', 'fromStatus', 'toStatus', 'actor'], initialSort: { field: 'createdAt', direction: 'DESC' } } },
  fields: {
    action: text({ validation: { isRequired: true }, isIndexed: true, ...ro }),
    entityType: text({ validation: { isRequired: true }, isIndexed: true, ...ro }),
    entityId: text({ validation: { isRequired: true }, isIndexed: true, ...ro }),
    actor: relationship({ ref: 'User', ...ro }),
    actorLabel: text({ ...ro }),
    fromStatus: text({ ...ro }),
    toStatus: text({ ...ro }),
    reason: text({ ...ro }),
    dataJson: json({ ...ro }),
    ...trackingFields,
  },
})

export const ContactLog = list({
  access: governed('canAccessDashboard'),
  ui: { listView: { initialColumns: ['at', 'channel', 'purpose', 'customer', 'user'] } },
  fields: {
    channel: select({ type: 'string', options: options(['call', 'sms', 'whatsapp', 'email', 'in_person']), validation: { isRequired: true }, ...ro }),
    purpose: select({ type: 'string', options: options(['quote_link', 'visit_date', 'payment_reminder', 'follow_up', 'pay_link', 'other']), validation: { isRequired: true }, ...ro }),
    note: text({ ...ro }),
    at: timestamp({ defaultValue: { kind: 'now' }, ...ro }),
    customer: relationship({ ref: 'Customer.contactLogs', ...ro }),
    user: relationship({ ref: 'User', ...ro }),
    relatedType: text({ ...ro }),
    relatedId: text({ isIndexed: true, ...ro }),
    ...trackingFields,
  },
})

export const Media = list({
  graphql: { plural: 'MediaItems' },
  access: {
    operation: { query: permissions.canAccessDashboard, create: permissions.canAccessDashboard, update: anyOf('canManageSettings', 'canManageCatalog', 'canDoFieldWork', 'canManageTickets'), delete: anyOf('canManageSettings', 'canManageCatalog') },
  },
  ui: { listView: { initialColumns: ['kind', 'caption', 'takenAt'] } },
  fields: {
    image: image({ storage: 'biogas_images' }),
    file: file({ storage: 'biogas_files' }),
    url: text({ ui: { description: 'Link to a file stored elsewhere (manuals, videos)' } }),
    kind: choice(['photo', 'document', 'signature', 'manual']),
    caption: text(),
    takenAt: timestamp({ defaultValue: { kind: 'now' } }),
    lat: geo(),
    lng: geo(),
    visit: relationship({ ref: 'Visit.media' }),
    site: relationship({ ref: 'Site.media' }),
    ticket: relationship({ ref: 'ServiceTicket.media' }),
    installation: relationship({ ref: 'Installation.media' }),
    product: relationship({ ref: 'Product.media' }),
    incentiveApplication: relationship({ ref: 'IncentiveApplication.media' }),
    sitePrepTask: relationship({ ref: 'SitePrepTask.media' }),
    uploadedBy: relationship({ ref: 'User', ...ro }),
    ...trackingFields,
  },
  hooks: {
    resolveInput: {
      create: ({ resolvedData, context }) => ({ ...resolvedData, uploadedBy: context.session?.itemId ? { connect: { id: context.session.itemId } } : undefined }),
    },
  },
})

export const WebhookEndpoint = list({
  access: managed('canManageSettings', 'canManageSettings'),
  ui: { listView: { initialColumns: ['url', 'isActive', 'events', 'lastTriggered', 'failureCount'] } },
  hooks: {
    resolveInput: async ({ resolvedData, operation }) => {
      const { normalizeWebhookUrl, normalizeWebhookEvents } = await import('../../webhooks/subscriptions')
      const { randomBytes } = await import('node:crypto')
      return {
        ...resolvedData,
        ...(resolvedData.url !== undefined ? { url: normalizeWebhookUrl(resolvedData.url) } : {}),
        ...(resolvedData.events !== undefined ? { events: normalizeWebhookEvents(resolvedData.events) } : {}),
        ...(operation === 'create' && !resolvedData.secret ? { secret: randomBytes(32).toString('hex') } : {}),
      }
    },
  },
  fields: {
    url: text({ validation: { isRequired: true } }),
    events: json({ defaultValue: ['*'] }),
    isActive: checkbox({ defaultValue: true }),
    /** Shown once on the settings page so the receiver can check signatures. */
    secret: text({ access: { read: permissions.canManageSettings, update: sys } }),
    lastTriggered: timestamp({ ...ro }),
    failureCount: integer({ defaultValue: 0, ...ro }),
    webhookEvents: relationship({ ref: 'WebhookEvent.endpoint', many: true, ...ro }),
    ...trackingFields,
  },
})

export const WebhookEvent = list({
  access: governed('canManageSettings'),
  ui: { listView: { initialColumns: ['eventType', 'resourceType', 'delivered', 'deliveryAttempts', 'createdAt'] } },
  fields: {
    eventType: text({ validation: { isRequired: true }, ...ro }),
    resourceType: text({ validation: { isRequired: true }, ...ro }),
    resourceId: text({ validation: { isRequired: true }, ...ro }),
    payload: json({ ...ro }),
    deliveryAttempts: integer({ defaultValue: 0, ...ro }),
    delivered: checkbox({ defaultValue: false, ...ro }),
    responseStatus: integer({ ...ro }),
    responseBody: text({ ...ro }),
    lastAttempt: timestamp({ ...ro }),
    endpoint: relationship({ ref: 'WebhookEndpoint.webhookEvents', ...ro }),
    ...trackingFields,
  },
})

export { has, sys }
