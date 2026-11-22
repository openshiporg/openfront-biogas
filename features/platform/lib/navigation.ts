import {
  Banknote, BarChart3, Boxes, CalendarDays, ClipboardList, Contact, Cpu, CreditCard, FileText, Gauge, Gift, HandCoins, Landmark,
  LucideIcon, Megaphone, Package, Percent, Repeat, Settings, ShoppingCart, Smartphone, Truck, Wrench, Hammer,
} from 'lucide-react'

export interface PlatformNavItem {
  title: string
  href: string
  description: string
  icon: LucideIcon
  group: string
  /** Role permission needed to open the screen; without it the link is hidden and the page says so. */
  requires?: string
}

export interface PlatformNavGroup {
  id: string
  title: string
  icon: LucideIcon
}

/** Dashboard screens of dissertation section 6.2. Each route is a thin wrapper in app/dashboard/(admin)/platform. */
export const platformNavItems: PlatformNavItem[] = [
  { title: 'Today', href: '/platform/home', description: 'Visits, late leads, tickets past target, payments to verify, overdue instalments.', icon: Gauge, group: 'standalone' },
  { title: 'My day', href: '/platform/field', description: 'My visits in order, on the phone.', icon: Smartphone, group: 'standalone', requires: 'canDoFieldWork' },

  { title: 'Leads', href: '/platform/leads', description: 'Leads board by status; late first contacts flagged.', icon: Megaphone, group: 'sales', requires: 'canManageLeads' },
  { title: 'Quotes', href: '/platform/quotes', description: 'Quotes by status, approvals, expired.', icon: FileText, group: 'sales', requires: 'canManageQuotes' },
  { title: 'Customers', href: '/platform/customers', description: 'Sites, contacts, everything they have with us.', icon: Contact, group: 'sales' },
  { title: 'Referrals', href: '/platform/referrals', description: 'Referral rewards and store credit.', icon: Gift, group: 'sales', requires: 'canManageLeads' },
  { title: 'Commissions', href: '/platform/commissions', description: 'Approve, mark paid, claw back.', icon: Percent, group: 'sales', requires: 'canManageCommissions' },

  { title: 'Orders', href: '/platform/orders', description: 'Orders by status; fulfil, change, cancel, return.', icon: ShoppingCart, group: 'orders', requires: 'canManageOrders' },
  { title: 'Installations', href: '/platform/installations', description: 'Installations board by stage.', icon: Hammer, group: 'orders', requires: 'canManageVisits' },
  { title: 'Schedule', href: '/platform/schedule', description: 'Visits by technician; book, assign, move.', icon: CalendarDays, group: 'orders', requires: 'canManageVisits' },

  { title: 'Systems', href: '/platform/systems', description: 'Installed systems, follow-ups due, readings.', icon: Cpu, group: 'service', requires: 'canManageSystems' },
  { title: 'Tickets', href: '/platform/tickets', description: 'Problem reports by status, past target on top.', icon: Wrench, group: 'service', requires: 'canManageTickets' },
  { title: 'Service plans', href: '/platform/service-plans', description: 'Subscribers: sell, renew, cancel.', icon: Repeat, group: 'service', requires: 'canManagePlans' },

  { title: 'Payments', href: '/platform/payments', description: 'Verify references, receipts, refunds, card read-back.', icon: CreditCard, group: 'money', requires: 'canReadPayments' },
  { title: 'Payment plans', href: '/platform/plans', description: 'Due this week, overdue, defaulted; reminders.', icon: HandCoins, group: 'money', requires: 'canReadPayments' },
  { title: 'Incentives', href: '/platform/incentives', description: 'Grant and subsidy applications.', icon: Landmark, group: 'money', requires: 'canManageIncentives' },

  { title: 'Catalogue', href: '/platform/catalogue', description: 'Products, specs, kit contents, prices.', icon: Package, group: 'stock', requires: 'canManageCatalog' },
  { title: 'Inventory', href: '/platform/inventory', description: 'Stock by location, adjust, transfer, serials.', icon: Boxes, group: 'stock', requires: 'canManageInventory' },
  { title: 'Purchasing', href: '/platform/purchasing', description: 'Suppliers and purchase orders.', icon: Truck, group: 'stock', requires: 'canManageInventory' },

  { title: 'Reports', href: '/platform/reports', description: 'Funnel, installs, arrears, stock value, exports.', icon: BarChart3, group: 'admin', requires: 'canReadReports' },
  { title: 'Settings', href: '/platform/settings', description: 'Company, policies, areas, payments, plans, checklists, content, team.', icon: Settings, group: 'admin', requires: 'canManageSettings' },
]

export const platformNavGroups: PlatformNavGroup[] = [
  { id: 'sales', title: 'Sales', icon: Megaphone },
  { id: 'orders', title: 'Orders and installs', icon: ClipboardList },
  { id: 'service', title: 'Service', icon: Wrench },
  { id: 'money', title: 'Money', icon: Banknote },
  { id: 'stock', title: 'Catalogue and stock', icon: Boxes },
  { id: 'admin', title: 'Admin', icon: Settings },
]

export const platformStandaloneItems = platformNavItems.filter(i => i.group === 'standalone')

export function getPlatformNavItemsWithBasePath(basePath: string) {
  return platformNavItems.filter(i => i.group !== 'standalone').map(i => ({ ...i, href: `${basePath}${i.href}` }))
}

/** Settings sub-pages (P58 to P64). */
export const settingsTabs = [
  { href: '/dashboard/platform/settings', label: 'Company' },
  { href: '/dashboard/platform/settings/areas', label: 'Branches and areas' },
  { href: '/dashboard/platform/settings/payments', label: 'Payment methods' },
  { href: '/dashboard/platform/settings/plans', label: 'Plans and programmes' },
  { href: '/dashboard/platform/settings/checklists', label: 'Checklists' },
  { href: '/dashboard/platform/settings/content', label: 'Storefront content' },
  { href: '/dashboard/platform/settings/team', label: 'Team' },
  { href: '/dashboard/platform/settings/webhooks', label: 'Webhooks' },
  { href: '/dashboard/platform/settings/audit', label: 'Audit log' },
]
