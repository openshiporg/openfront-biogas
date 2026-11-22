import { q } from '../../lib/server'
import { label } from '../../lib/format'
import { Section, Meta, Status, Tabs } from '../../components/ui'
import { RecordForm } from '../../records/RecordForm'
import { SettingsShell, settingsAccess, SETTINGS } from '../components/SettingsShell'

const PATH = `${SETTINGS}/team`
const FLAGS: [string, string][] = [
  ['canAccessDashboard', 'Open the dashboard'], ['canManageLeads', 'Leads'], ['canSeeAllLeads', 'See every lead'], ['canManageQuotes', 'Quotes'], ['canApproveDiscounts', 'Approve discounts'],
  ['canManageOrders', 'Orders'], ['canManageVisits', 'Schedule visits'], ['canDoFieldWork', 'Field work'], ['canManageSystems', 'Systems'], ['canManageTickets', 'Tickets'],
  ['canManagePlans', 'Service plans'], ['canReadPayments', 'See payments'], ['canManagePayments', 'Verify payments'], ['canIssueRefunds', 'Refunds'], ['canManageIncentives', 'Incentives'],
  ['canManageCommissions', 'Commissions'], ['canManageCatalog', 'Catalogue'], ['canManageInventory', 'Stock'], ['canReadReports', 'Reports'], ['canManageSettings', 'Settings'],
  ['canManageUsers', 'Staff and roles'], ['canManageOnboarding', 'First-run setup'],
]

/** P64: staff (add, role, branch, deactivate, set a starting password) and roles (what each may do, discount limit). */
export default async function TeamSettingsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams
  const view = sp.view === 'roles' ? 'roles' : 'staff'
  const { me, allowed } = await settingsAccess(['canManageUsers'])
  if (!allowed) return <SettingsShell active={PATH} title="Team" allowed={false} />
  const d = await q<any>(`{
    users(where: { role: { canAccessDashboard: { equals: true } } }, orderBy: [{ name: asc }]) { id name email phone isActive role { id name } branch { id name } }
    roles(orderBy: [{ name: asc }]) { id name discountLimitPercent usersCount ${FLAGS.map(f => f[0]).join(' ')} }
    branches(orderBy: [{ name: asc }]) { id name }
  }`)
  const roleOpts = d.roles.map((r: any) => ({ value: r.id, label: r.name }))
  const branchOpts = [{ value: '', label: 'No branch' }, ...d.branches.map((b: any) => ({ value: b.id, label: b.name }))]
  return (
    <SettingsShell active={PATH} title="Team" allowed>
      <Tabs active={view} items={[{ key: 'staff', label: 'Staff', href: PATH, count: d.users.length }, { key: 'roles', label: 'Roles', href: `${PATH}?view=roles`, count: d.roles.length }]} />
      {view === 'staff' ? (
        <>
          <Section title="Staff">
            {d.users.map((u: any) => (
              <div key={u.id} className="border-b py-3 last:border-b-0">
                <div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{u.name} <Meta>{u.email} · {u.role?.name ?? 'No role'}{u.branch ? ` · ${u.branch.name}` : ''}{u.id === me.id ? ' · you' : ''}</Meta></span><Status value={u.isActive ? 'active' : 'blocked'} /></div>
                <details><summary className="cursor-pointer text-xs text-muted-foreground">Edit</summary>
                  <RecordForm list="User" id={u.id} submit="Save" paths={[PATH]} className="mt-2" fields={[
                    { name: 'name', label: 'Name', required: true, defaultValue: u.name }, { name: 'email', label: 'Email', kind: 'email', required: true, defaultValue: u.email },
                    { name: 'phone', label: 'Phone', kind: 'tel', width: 'sm', defaultValue: u.phone },
                    { name: 'role', label: 'Role', kind: 'select', width: 'md', defaultValue: u.role?.id, options: roleOpts },
                    { name: 'branch', label: 'Branch', kind: 'select', width: 'md', defaultValue: u.branch?.id ?? '', options: branchOpts },
                    { name: 'password', label: 'New password (blank keeps it)', kind: 'password', width: 'md' },
                    { name: 'isActive', label: 'Can sign in', kind: 'checkbox', defaultValue: u.isActive },
                  ]} />
                </details>
              </div>
            ))}
          </Section>
          <Section title="Add a staff member">
            <RecordForm list="User" submit="Add staff member" paths={[PATH]} fields={[
              { name: 'name', label: 'Name', required: true }, { name: 'email', label: 'Email', kind: 'email', required: true }, { name: 'phone', label: 'Phone', kind: 'tel', width: 'sm' },
              { name: 'role', label: 'Role', kind: 'select', width: 'md', options: roleOpts }, { name: 'branch', label: 'Branch', kind: 'select', width: 'md', options: branchOpts },
              { name: 'password', label: 'Starting password (10+ characters)', kind: 'password', width: 'md', required: true },
            ]} />
            <Meta>Give them the starting password in person; they can change it from “Forgot password” on the sign-in page.</Meta>
          </Section>
        </>
      ) : (
        <Section title="Roles">
          {d.roles.map((r: any) => (
            <div key={r.id} className="border-b py-3 last:border-b-0">
              <div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{r.name} <Meta>{r.usersCount} people · discount limit {r.discountLimitPercent}%</Meta></span></div>
              <Meta>{FLAGS.filter(f => r[f[0]]).map(f => f[1]).join(', ') || 'No dashboard access (customer accounts)'}</Meta>
              <details><summary className="cursor-pointer text-xs text-muted-foreground">Edit</summary>
                <RecordForm list="Role" id={r.id} submit="Save role" paths={[PATH]} className="mt-2" fields={[
                  { name: 'name', label: 'Name', required: true, defaultValue: r.name },
                  { name: 'discountLimitPercent', label: 'Discount limit %', kind: 'number', width: 'sm', defaultValue: String(r.discountLimitPercent ?? 0) },
                  { name: 'flags', label: 'May', kind: 'multi', defaultValue: FLAGS.filter(f => r[f[0]]).map(f => f[0]), options: FLAGS.map(([value, l]) => ({ value, label: l })) },
                ]} />
              </details>
            </div>
          ))}
          <Meta>Add a role</Meta>
          <RecordForm list="Role" submit="Add role" paths={[`${PATH}`]} fields={[
            { name: 'name', label: 'Name', required: true }, { name: 'discountLimitPercent', label: 'Discount limit %', kind: 'number', width: 'sm', defaultValue: '0' },
            { name: 'flags', label: 'May', kind: 'multi', defaultValue: ['canAccessDashboard'], options: FLAGS.map(([value, l]) => ({ value, label: l })) },
          ]} />
        </Section>
      )}
    </SettingsShell>
  )
}
