import { calendarDay, checkbox, decimal, integer, json, select, text, timestamp } from '@keystone-6/core/fields'
import { anyOf, has, isSignedIn, permissions, staffOrCustomer, sys, type Permission } from '../access'

const option = (value: string) => ({ label: value.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase()), value })
export const options = (values: readonly string[]) => values.map(option)

/** Read-only to the API: written only by server code. */
export const ro = {
  access: { create: sys, update: sys },
  ui: { createView: { fieldMode: 'hidden' as const }, itemView: { fieldMode: 'read' as const } },
}

/** Money: integer minor units, never negative unless allowed. Field names end in `Amount`. */
export const money = (opts: { readOnly?: boolean; required?: boolean; nullable?: boolean } = {}) =>
  integer({
    ...(opts.nullable ? {} : { defaultValue: 0 }),
    validation: { isRequired: !opts.nullable },
    ...(opts.readOnly ? ro : {}),
  })

export const currency = () =>
  text({ defaultValue: 'USD', validation: { isRequired: true, match: { regex: /^[A-Z]{3}$/, explanation: 'ISO 4217 currency code, e.g. USD' } } })

/** Lifecycle status: changes only through named mutations (section 4). */
export const status = (values: readonly string[], initial = values[0]) =>
  select({ type: 'string', options: options(values), defaultValue: initial, validation: { isRequired: true }, isIndexed: true, ...ro })

/** A plain choice staff may edit. */
export const choice = (values: readonly string[], initial: string | null = values[0]) =>
  select({ type: 'string', options: options(values), ...(initial !== null ? { defaultValue: initial, validation: { isRequired: true } } : { db: { isNullable: true } }) })

/** Compare-and-set version. Bumped only by server code. */
export const version = () => integer({ defaultValue: 0, validation: { isRequired: true }, ...ro })

/** Human number (L-000012) or public code: unique, server-written. */
export const serverKey = () => text({ isIndexed: 'unique', db: { isNullable: true }, ...ro })
export const serverText = () => text({ ...ro })
export const serverTime = () => timestamp({ ...ro })
export const serverDay = () => calendarDay({ ...ro })
export const serverInt = (defaultValue = 0) => integer({ defaultValue, validation: { isRequired: true }, ...ro })
export const serverJson = () => json({ ...ro })
export const serverBool = (defaultValue = false) => checkbox({ defaultValue, ...ro })

/** Quantities (kg, m³, metres, kPa): numeric(12,3). Not money. */
export const qty = () => decimal({ precision: 12, scale: 3, db: { isNullable: true } })
export const percent = (defaultValue = '0') => decimal({ precision: 6, scale: 2, defaultValue, validation: { isRequired: true } })
export const geo = () => decimal({ precision: 9, scale: 6, db: { isNullable: true } })

type Read = Permission | Permission[] | 'public' | 'signedIn'
const readRule = (read: Read) =>
  read === 'public' ? () => true : read === 'signedIn' ? isSignedIn : Array.isArray(read) ? anyOf(...read) : permissions[read]
const writeRule = (write: Permission | Permission[]) => (Array.isArray(write) ? anyOf(...write) : permissions[write])

/** Governed: readable with `read`; every write goes through a custom mutation. */
export const governed = (read: Read) => ({ operation: { query: readRule(read), create: sys, update: sys, delete: sys } })

/** Reference data edited directly by holders of `write`. Delete only where nothing refers to it (Prisma refuses otherwise). */
export const managed = (read: Read, write: Permission | Permission[], opts: { delete?: boolean } = {}) => ({
  operation: { query: readRule(read), create: writeRule(write), update: writeRule(write), delete: opts.delete === false ? sys : writeRule(write) },
})

/** Published storefront content: guests read published rows; staff with `write` see and edit all. */
export const published = (write: Permission | Permission[], flag = 'isPublished') => ({
  operation: { query: () => true, create: writeRule(write), update: writeRule(write), delete: writeRule(write) },
  filter: {
    query: ({ session }: { session?: any }) =>
      (Array.isArray(write) ? write : [write]).some(p => has(session, p)) || has(session, 'canAccessDashboard') ? true : ({ [flag]: { equals: true } } as never),
  },
})

export const serverOnly = { operation: { query: sys, create: sys, update: sys, delete: sys } }

export { staffOrCustomer }

/** Prisma composite unique keys and other schema additions Keystone can't express per field. */
export const compositeUniques: Record<string, string[]> = {
  StockLevel: ['@@unique([productId, locationId])'],
  VisitSlotUsage: ['@@unique([technicianId, date, slotIndex])'],
}
