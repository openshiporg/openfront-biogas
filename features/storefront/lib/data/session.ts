import 'server-only'
import { cache } from 'react'
import { gqlOrNull } from './client'

export type Viewer = { id: string; name: string; email: string; phone: string; isStaff: boolean; customerId: string | null } | null

/** Who is looking: a signed-in customer, staff, or nobody. */
export const getViewer = cache(async (): Promise<Viewer> => {
  const r = await gqlOrNull<{ authenticatedItem: any }>('{ authenticatedItem { ... on User { id name email phone isActive customer { id } role { canAccessDashboard } } } }')
  const u = r?.authenticatedItem
  if (!u || u.isActive === false) return null
  return { id: u.id, name: u.name ?? '', email: u.email ?? '', phone: u.phone ?? '', isStaff: Boolean(u.role?.canAccessDashboard), customerId: u.customer?.id ?? null }
})
