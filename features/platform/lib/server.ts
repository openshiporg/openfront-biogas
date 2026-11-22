import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'

/** Staff reads go through the signed-in session, so list access rules still apply. */
export async function q<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const r = await keystoneClient<T>(query, variables)
  if (!r.success) throw new Error(r.error)
  return r.data as T
}

/** Company name, currency and time zone for formatting. */
export async function company(): Promise<{ name: string; currencyCode: string; timezone: string; siteUrl: string }> {
  try {
    const d: any = await q(`{ companySettings { name currencyCode timezone } }`)
    const s = d.companySettings ?? {}
    return { name: s.name || 'Biogas company', currencyCode: s.currencyCode || 'USD', timezone: s.timezone || 'America/Chicago', siteUrl: siteUrl() }
  } catch {
    return { name: 'Biogas company', currencyCode: 'USD', timezone: 'America/Chicago', siteUrl: siteUrl() }
  }
}

/** Base URL for links staff share (quote, pay, visit, order). Relative when unset, so links still work in the browser. */
export const siteUrl = () => (process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_SITE_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '')).replace(/\/$/, '')

const ROLE_FLAGS = 'canManageSettings canManageUsers canManageOnboarding canManageCatalog canManageInventory canManageLeads canSeeAllLeads canManageQuotes canApproveDiscounts canManageOrders canManageVisits canDoFieldWork canManageSystems canManageTickets canManagePlans canReadPayments canManagePayments canIssueRefunds canManageIncentives canManageCommissions canReadReports'

/** The signed-in person and their role flags, for deciding which controls a screen shows. */
export async function viewer(): Promise<{ id: string; name: string; can: (permission: string) => boolean }> {
  try {
    const d: any = await q(`{ authenticatedItem { ... on User { id name role { ${ROLE_FLAGS} } } } }`)
    const u = d.authenticatedItem
    const role: Record<string, boolean> = u?.role ?? {}
    return { id: u?.id ?? '', name: u?.name ?? '', can: (permission: string) => role[permission] === true }
  } catch {
    return { id: '', name: '', can: () => false }
  }
}

export const todayIso = (tz = 'America/Chicago', at: Date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
export const plusDays = (date: string, n: number) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
/** The request time, read once per render. */
export const requestTime = () => Date.now()
