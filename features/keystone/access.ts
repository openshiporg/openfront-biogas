/**
 * Roles and permissions (dissertation section 2). Each permission is a boolean on Role. A customer login
 * is a User linked to a Customer with a role that grants none of these; customers read only their own
 * rows (customerFilter) and guests reach single records only by public code through custom queries.
 */
export const permissionNames = [
  'canAccessDashboard',
  'canManageSettings',
  'canManageUsers',
  'canManageOnboarding',
  'canManageCatalog',
  'canManageInventory',
  'canManageLeads',
  'canSeeAllLeads',
  'canManageQuotes',
  'canApproveDiscounts',
  'canManageOrders',
  'canManageVisits',
  'canDoFieldWork',
  'canManageSystems',
  'canManageTickets',
  'canManagePlans',
  'canReadPayments',
  'canManagePayments',
  'canIssueRefunds',
  'canManageIncentives',
  'canManageCommissions',
  'canReadReports',
] as const

export type Permission = (typeof permissionNames)[number]

export type Session = {
  itemId: string
  listKey: string
  data: {
    name: string
    email?: string
    isActive?: boolean
    customer?: { id: string } | null
    role: ({ id: string; name: string; discountLimitPercent?: number | null } & Partial<Record<Permission, boolean>>) | null
  }
}

type AccessArgs = { session?: Session | null }

export function isSignedIn({ session }: AccessArgs) {
  return Boolean(session?.itemId) && session?.data?.isActive !== false
}

export const has = (session: Session | null | undefined, permission: Permission) =>
  Boolean(session?.itemId) && session?.data?.isActive !== false && session?.data?.role?.[permission] === true

export const permissions = Object.fromEntries(
  permissionNames.map(name => [name, ({ session }: AccessArgs) => has(session, name)])
) as Record<Permission, (args: AccessArgs) => boolean>

export const anyOf = (...names: Permission[]) => ({ session }: AccessArgs) => names.some(name => has(session, name))

/** Server code only: generated create/update/delete is closed. */
export const sys = () => false

/** Any staff member (has dashboard access). */
export const isStaff = permissions.canAccessDashboard

/** The signed-in user's own customer id, if this login belongs to a customer. */
export const customerIdOf = (session: Session | null | undefined) => session?.data?.customer?.id ?? null

/**
 * Row filter for customer-facing lists: staff with `read` see all; a signed-in customer sees rows whose
 * `path` leads to their own Customer; everyone else sees nothing.
 */
export function customerFilter(read: Permission | Permission[], path: (customerId: string) => Record<string, unknown>) {
  const names = Array.isArray(read) ? read : [read]
  return ({ session }: AccessArgs) => {
    if (names.some(name => has(session, name))) return true
    const customerId = customerIdOf(session)
    if (!customerId || !isSignedIn({ session })) return false
    return path(customerId) as never
  }
}

/** Customer-facing list readable by its staff permission or by the owning customer. */
export function staffOrCustomer(read: Permission | Permission[], path: (customerId: string) => Record<string, unknown>) {
  const names = Array.isArray(read) ? read : [read]
  return {
    operation: {
      query: ({ session }: AccessArgs) => names.some(name => has(session, name)) || Boolean(customerIdOf(session)),
      create: sys,
      update: sys,
      delete: sys,
    },
    filter: { query: customerFilter(names, path) },
  }
}

export const rules = {
  canReadPeople: ({ session }: AccessArgs) => {
    if (!session) return false
    if (has(session, 'canManageUsers') || has(session, 'canAccessDashboard')) return true
    return { id: { equals: session.itemId } }
  },
  canUpdatePeople: ({ session }: AccessArgs) => {
    if (!session) return false
    if (has(session, 'canManageUsers')) return true
    return { id: { equals: session.itemId } }
  },
}

/** The legacy starter names some shared code still reads. */
export const legacy = {
  canManagePeople: permissions.canManageUsers,
  canManageRoles: permissions.canManageUsers,
}
