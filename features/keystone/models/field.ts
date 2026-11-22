import { list } from '@keystone-6/core'
import { calendarDay, checkbox, integer, json, relationship, text, timestamp } from '@keystone-6/core/fields'
import { anyOf, has, staffOrCustomer, sys } from '../access'
import { choice, managed, money, qty, ro, serverBool, serverDay, serverJson, serverKey, serverText, serverTime, status, version, geo, serverInt } from './fields'
import { trackingFields } from './trackingFields'

const byCustomer = (id: string) => ({ customer: { id: { equals: id } } })

export const CHECKLIST_KINDS = ['survey_farm', 'survey_kitchen', 'pre_install', 'install', 'commissioning', 'follow_up', 'service', 'delivery', 'maintenance'] as const

export const ChecklistTemplate = list({
  access: managed('canAccessDashboard', 'canManageSettings'),
  fields: {
    name: text({ validation: { isRequired: true } }),
    kind: choice(CHECKLIST_KINDS, 'survey_farm'),
    isActive: checkbox({ defaultValue: true }),
    items: relationship({ ref: 'ChecklistItem.template', many: true }),
    ...trackingFields,
  },
})

export const ChecklistItem = list({
  access: managed('canAccessDashboard', 'canManageSettings'),
  fields: {
    prompt: text({ validation: { isRequired: true } }),
    helpText: text(),
    inputType: choice(['yes_no', 'number', 'text', 'choice', 'photo'], 'yes_no'),
    choices: json({ defaultValue: [] }),
    unit: text(),
    isRequired: checkbox({ defaultValue: true }),
    sortOrder: integer({ defaultValue: 0 }),
    template: relationship({ ref: 'ChecklistTemplate.items' }),
    ...trackingFields,
  },
})

export const VISIT_TYPES = ['survey', 'delivery', 'install', 'commissioning', 'follow_up', 'service', 'maintenance'] as const
export const VISIT_STATUSES = ['requested', 'scheduled', 'rescheduled', 'en_route', 'on_site', 'completed', 'cancelled', 'no_access'] as const

export const Visit = list({
  access: {
    operation: {
      query: ({ session }) => has(session, 'canManageVisits') || has(session, 'canDoFieldWork') || has(session, 'canManageTickets') || has(session, 'canManageSystems') || has(session, 'canManageOrders') || Boolean(session?.data?.customer?.id),
      create: sys,
      update: sys,
      delete: sys,
    },
    filter: {
      query: ({ session }) => {
        if (has(session, 'canManageVisits') || has(session, 'canManageTickets') || has(session, 'canManageSystems') || has(session, 'canManageOrders')) return true
        if (has(session, 'canDoFieldWork')) return { technicians: { some: { id: { equals: session!.itemId } } } }
        const c = session?.data?.customer?.id
        return c ? byCustomer(c) : false
      },
    },
  },
  ui: { labelField: 'number', listView: { initialColumns: ['number', 'type', 'status', 'scheduledDate', 'slotIndex', 'customer'] } },
  fields: {
    number: serverKey(),
    type: status(VISIT_TYPES),
    status: status(VISIT_STATUSES),
    version: version(),
    scheduledDate: serverDay(),
    slotIndex: integer({ ...ro }),
    windowStart: serverTime(),
    windowEnd: serverTime(),
    checkInAt: serverTime(),
    checkInLat: geo(),
    checkInLng: geo(),
    checkOutAt: serverTime(),
    checklistAnswers: serverJson(),
    outcome: serverText(),
    notes: serverText(),
    customerSignature: text({ access: { read: anyOf('canManageVisits', 'canDoFieldWork', 'canManageSystems'), create: sys, update: sys }, ui: { itemView: { fieldMode: 'read' } } }),
    signedName: serverText(),
    publicCode: serverKey(),
    cancelReason: serverText(),
    cancelledBy: serverText(),
    feeAmount: money({ readOnly: true }),
    feePaid: serverBool(),
    dueAt: serverTime(),
    customer: relationship({ ref: 'Customer', ...ro }),
    site: relationship({ ref: 'Site', ...ro }),
    lead: relationship({ ref: 'Lead.visits', ...ro }),
    installation: relationship({ ref: 'Installation.visits', ...ro }),
    ticket: relationship({ ref: 'ServiceTicket.visits', ...ro }),
    system: relationship({ ref: 'InstalledSystem.visits', ...ro }),
    subscription: relationship({ ref: 'ServicePlanSubscription.visits', ...ro }),
    branch: relationship({ ref: 'Branch', ...ro }),
    technicians: relationship({ ref: 'User.visits', many: true, ...ro }),
    slotUsages: relationship({ ref: 'VisitSlotUsage.visit', many: true, ...ro }),
    media: relationship({ ref: 'Media.visit', many: true }),
    partsUsed: relationship({ ref: 'PartUsage.visit', many: true, ...ro }),
    survey: relationship({ ref: 'SiteSurvey.visit', ...ro }),
    training: relationship({ ref: 'TrainingRecord.visit', many: true, ...ro }),
    readings: relationship({ ref: 'SystemReading.visit', many: true, ...ro }),
    ...trackingFields,
  },
})

export const VisitSlotUsage = list({
  db: { extendPrismaSchema: (schema: string) => schema.replace(/\}\s*$/, '  @@unique([technicianId, date, slotIndex])\n}') },
  access: governed(),
  fields: {
    date: calendarDay({ validation: { isRequired: true }, ...ro }),
    slotIndex: integer({ validation: { isRequired: true }, ...ro }),
    technician: relationship({ ref: 'User', ...ro }),
    visit: relationship({ ref: 'Visit.slotUsages', ...ro }),
    ...trackingFields,
  },
})
function governed() {
  return { operation: { query: anyOf('canManageVisits', 'canDoFieldWork'), create: sys, update: sys, delete: sys } }
}

export const TechnicianTimeOff = list({
  access: managed(['canManageVisits', 'canDoFieldWork'], 'canManageVisits'),
  fields: {
    date: calendarDay({ validation: { isRequired: true } }),
    reason: text(),
    technician: relationship({ ref: 'User.timeOff' }),
    ...trackingFields,
  },
})

export const SiteSurvey = list({
  access: staffOrCustomer(['canManageVisits', 'canDoFieldWork', 'canManageQuotes', 'canManageLeads'], id => ({ site: byCustomer(id) })),
  fields: {
    feasibility: status(['feasible', 'feasible_with_work', 'not_feasible']),
    measuredFeedKgPerDay: qty(),
    waterOk: serverBool(),
    spaceOk: serverBool(),
    soilType: serverText(),
    floodRisk: serverText(),
    pipeRunM: qty(),
    pumpNeeded: serverBool(),
    extraWork: serverJson(),
    notes: serverText(),
    visit: relationship({ ref: 'Visit.survey', ...ro }),
    site: relationship({ ref: 'Site', ...ro }),
    recommendedProduct: relationship({ ref: 'Product', ...ro }),
    ...trackingFields,
  },
})

export const INSTALLATION_STATUSES = ['awaiting_site_prep', 'ready_to_schedule', 'scheduled', 'in_progress', 'installed', 'commissioned', 'on_hold', 'cancelled'] as const

export const Installation = list({
  access: staffOrCustomer(['canManageVisits', 'canManageOrders', 'canDoFieldWork', 'canManageSystems'], byCustomer),
  ui: { labelField: 'number', listView: { initialColumns: ['number', 'status', 'customer', 'targetDate'] } },
  fields: {
    number: serverKey(),
    status: status(INSTALLATION_STATUSES),
    version: version(),
    targetDate: serverDay(),
    holdReason: serverText(),
    heldFrom: serverText(),
    overrideReason: serverText(),
    order: relationship({ ref: 'Order.installation', ...ro }),
    site: relationship({ ref: 'Site', ...ro }),
    customer: relationship({ ref: 'Customer', ...ro }),
    product: relationship({ ref: 'Product', ...ro }),
    prepTasks: relationship({ ref: 'SitePrepTask.installation', many: true, ...ro }),
    visits: relationship({ ref: 'Visit.installation', many: true, ...ro }),
    system: relationship({ ref: 'InstalledSystem.installation', ...ro }),
    media: relationship({ ref: 'Media.installation', many: true }),
    ...trackingFields,
  },
})

export const SitePrepTask = list({
  access: staffOrCustomer(['canManageVisits', 'canManageOrders', 'canDoFieldWork'], id => ({ installation: byCustomer(id) })),
  fields: {
    prompt: serverText(),
    helpText: serverText(),
    sortOrder: serverInt(0),
    isRequired: serverBool(true),
    status: status(['pending', 'done', 'waived']),
    version: version(),
    doneAt: serverTime(),
    doneBy: serverText(),
    note: serverText(),
    installation: relationship({ ref: 'Installation.prepTasks', ...ro }),
    media: relationship({ ref: 'Media.sitePrepTask', many: true }),
    ...trackingFields,
  },
})

export const TrainingRecord = list({
  access: staffOrCustomer(['canManageVisits', 'canDoFieldWork', 'canManageSystems'], id => ({ system: byCustomer(id) })),
  fields: {
    traineeName: serverText(),
    relationToOwner: serverText(),
    topics: serverJson(),
    language: serverText(),
    at: serverTime(),
    visit: relationship({ ref: 'Visit.training', ...ro }),
    system: relationship({ ref: 'InstalledSystem.training', ...ro }),
    ...trackingFields,
  },
})

export const PartUsage = list({
  access: { operation: { query: anyOf('canManageVisits', 'canDoFieldWork', 'canManageInventory', 'canManageTickets'), create: sys, update: sys, delete: sys } },
  fields: {
    quantity: serverInt(1),
    unitAmount: money({ readOnly: true }),
    chargeable: serverBool(),
    visit: relationship({ ref: 'Visit.partsUsed', ...ro }),
    product: relationship({ ref: 'Product', ...ro }),
    fromLocation: relationship({ ref: 'StockLocation', ...ro }),
    ...trackingFields,
  },
})

export { timestamp }
