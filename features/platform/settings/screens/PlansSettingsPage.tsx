import { q } from '../../lib/server'
import { label, money } from '../../lib/format'
import { Section, Meta, Status } from '../../components/ui'
import { RecordForm } from '../../records/RecordForm'
import { SettingsShell, settingsAccess, SETTINGS } from '../components/SettingsShell'

const PATH = `${SETTINGS}/plans`
const m = (v: number | null | undefined) => (v === null || v === undefined ? '' : (v / 100).toFixed(2))
const t = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const Edit = ({ children }: { children: React.ReactNode }) => <details><summary className="cursor-pointer text-xs text-muted-foreground">Edit</summary><div className="mt-2">{children}</div></details>
const Add = ({ what, children }: { what: string; children: React.ReactNode }) => <details><summary className="cursor-pointer text-xs text-muted-foreground">Add {what}</summary><div className="mt-2">{children}</div></details>

/** P61: payment plan templates (offered on quotes), service plans (sold to owners), incentive programmes and commission rules. */
export default async function PlansSettingsPage() {
  const { allowed } = await settingsAccess(['canManageSettings'])
  if (!allowed) return <SettingsShell active={PATH} title="Plans and programmes" allowed={false} />
  const d = await q<any>(`{
    paymentPlanTemplates(orderBy: [{ sortOrder: asc }]) { id name kind depositPercent instalmentCount frequency planFeePercent minOrderAmount isActive sortOrder }
    servicePlans(orderBy: [{ priceAmount: asc }]) { id name slug description priceAmount currencyCode billing visitsPerYear partsDiscountPercent priorityResponse includedItems isPublished subscriptionsCount }
    incentivePrograms(orderBy: [{ name: asc }]) { id name country kind amountType amountValue capAmount treatment requiredDocuments isActive infoUrl applicationsCount }
    commissionRules(orderBy: [{ name: asc }]) { id name type value isActive }
    companySettings { currencyCode }
  }`)
  const cur = d.companySettings?.currencyCode ?? 'USD'
  const tplFields = (x: any = {}) => [
    { name: 'name', label: 'Name', required: true, defaultValue: x.name },
    { name: 'kind', label: 'Kind', kind: 'select' as const, width: 'sm' as const, defaultValue: x.kind ?? 'instalments', options: ['full', 'instalments', 'milestones'].map(v => ({ value: v, label: label(v) })) },
    { name: 'depositPercent', label: 'Deposit %', kind: 'number' as const, width: 'sm' as const, defaultValue: t(x.depositPercent ?? '30') },
    { name: 'instalmentCount', label: 'Instalments', kind: 'number' as const, width: 'sm' as const, defaultValue: t(x.instalmentCount ?? 6) },
    { name: 'frequency', label: 'Every', kind: 'select' as const, width: 'sm' as const, defaultValue: x.frequency ?? 'monthly', options: [{ value: 'monthly', label: 'Month' }, { value: 'weekly', label: 'Week' }] },
    { name: 'planFeePercent', label: 'Plan fee %', kind: 'number' as const, width: 'sm' as const, defaultValue: t(x.planFeePercent ?? '0') },
    { name: 'minOrderAmount', label: 'Only on orders from', kind: 'money' as const, width: 'sm' as const, defaultValue: m(x.minOrderAmount) },
    { name: 'sortOrder', label: 'Order', kind: 'number' as const, width: 'sm' as const, defaultValue: t(x.sortOrder ?? 0) },
    { name: 'isActive', label: 'Offered', kind: 'checkbox' as const, defaultValue: x.isActive ?? true },
  ]
  const spFields = (x: any = {}) => [
    { name: 'name', label: 'Name', required: true, defaultValue: x.name }, { name: 'slug', label: 'Web address name', required: true, defaultValue: x.slug },
    { name: 'priceAmount', label: 'Price', kind: 'money' as const, width: 'sm' as const, required: true, defaultValue: m(x.priceAmount) },
    { name: 'billing', label: 'Billed', kind: 'select' as const, width: 'sm' as const, defaultValue: x.billing ?? 'yearly', options: [{ value: 'yearly', label: 'Yearly' }, { value: 'monthly', label: 'Monthly' }] },
    { name: 'visitsPerYear', label: 'Visits a year', kind: 'number' as const, width: 'sm' as const, defaultValue: t(x.visitsPerYear ?? 1) },
    { name: 'partsDiscountPercent', label: 'Parts discount %', kind: 'number' as const, width: 'sm' as const, defaultValue: t(x.partsDiscountPercent ?? '0') },
    { name: 'includedItems', label: 'What is included (JSON list of lines)', width: 'lg' as const, defaultValue: JSON.stringify(x.includedItems ?? []) },
    { name: 'description', label: 'Description', kind: 'textarea' as const, defaultValue: x.description },
    { name: 'priorityResponse', label: 'Priority response', kind: 'checkbox' as const, defaultValue: x.priorityResponse ?? false },
    { name: 'isPublished', label: 'On the storefront', kind: 'checkbox' as const, defaultValue: x.isPublished ?? false },
  ]
  const ipFields = (x: any = {}) => [
    { name: 'name', label: 'Name', required: true, defaultValue: x.name }, { name: 'country', label: 'Country', width: 'sm' as const, defaultValue: x.country },
    { name: 'kind', label: 'Kind', kind: 'select' as const, width: 'sm' as const, defaultValue: x.kind ?? 'subsidy', options: ['subsidy', 'grant', 'carbon_discount', 'promo'].map(v => ({ value: v, label: label(v) })) },
    { name: 'amountType', label: 'Amount is', kind: 'select' as const, width: 'sm' as const, defaultValue: x.amountType ?? 'fixed', options: [{ value: 'fixed', label: 'Fixed (in cents)' }, { value: 'percent', label: 'Percent of price' }, { value: 'by_capacity', label: 'By digester size' }] },
    { name: 'amountValue', label: 'Value', width: 'sm' as const, defaultValue: x.amountValue ?? '0' },
    { name: 'capAmount', label: 'Cap', kind: 'money' as const, width: 'sm' as const, defaultValue: m(x.capAmount) },
    { name: 'treatment', label: 'How it is paid', kind: 'select' as const, width: 'md' as const, defaultValue: x.treatment ?? 'off_price_now', options: [{ value: 'off_price_now', label: 'Off the price now' }, { value: 'paid_to_customer_later', label: 'Paid to the customer later' }] },
    { name: 'requiredDocuments', label: 'Documents asked (JSON list)', width: 'lg' as const, defaultValue: JSON.stringify(x.requiredDocuments ?? []) },
    { name: 'infoUrl', label: 'Programme web page', width: 'lg' as const, defaultValue: x.infoUrl },
    { name: 'isActive', label: 'Open for applications', kind: 'checkbox' as const, defaultValue: x.isActive ?? true },
  ]
  const crFields = (x: any = {}) => [
    { name: 'name', label: 'Name', required: true, defaultValue: x.name },
    { name: 'type', label: 'Type', kind: 'select' as const, width: 'md' as const, defaultValue: x.type ?? 'percent_of_order', options: [{ value: 'percent_of_order', label: 'Percent of the order' }, { value: 'fixed_per_system', label: 'Fixed per system (cents)' }] },
    { name: 'value', label: 'Value', width: 'sm' as const, defaultValue: x.value ?? '0' },
    { name: 'isActive', label: 'In use', kind: 'checkbox' as const, defaultValue: x.isActive ?? true },
  ]
  return (
    <SettingsShell active={PATH} title="Plans and programmes" allowed>
      <Section title="Payment plans offered on quotes">
        {d.paymentPlanTemplates.map((x: any) => (
          <div key={x.id} className="border-b py-3 last:border-b-0">
            <div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{x.name} <Meta>{label(x.kind)} · {x.depositPercent}% down · {x.instalmentCount} × {x.frequency} · fee {x.planFeePercent}%{x.minOrderAmount ? ` · from ${money(x.minOrderAmount, cur)}` : ''}</Meta></span><Status value={x.isActive ? 'active' : 'paused'} /></div>
            <Edit><RecordForm list="PaymentPlanTemplate" id={x.id} submit="Save" paths={[PATH]} fields={tplFields(x)} /></Edit>
          </div>
        ))}
        <Add what="a plan"><RecordForm list="PaymentPlanTemplate" submit="Add plan" paths={[PATH]} fields={tplFields()} /></Add>
      </Section>
      <Section title="Service plans">
        {d.servicePlans.map((x: any) => (
          <div key={x.id} className="border-b py-3 last:border-b-0">
            <div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{x.name} <Meta>{money(x.priceAmount, x.currencyCode)} {x.billing} · {x.visitsPerYear} visits · {x.subscriptionsCount} subscribers</Meta></span><Status value={x.isPublished ? 'published' : 'draft'} /></div>
            <Edit><RecordForm list="ServicePlan" id={x.id} submit="Save" paths={[PATH]} fields={spFields(x)} /></Edit>
          </div>
        ))}
        <Add what="a service plan"><RecordForm list="ServicePlan" submit="Add service plan" paths={[PATH]} fields={spFields()} /></Add>
      </Section>
      <Section title="Incentive programmes">
        {d.incentivePrograms.map((x: any) => (
          <div key={x.id} className="border-b py-3 last:border-b-0">
            <div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{x.name} <Meta>{label(x.kind)} · {x.amountType === 'percent' ? `${x.amountValue}%` : x.amountType === 'fixed' ? money(Number(x.amountValue), cur) : 'by size'}{x.capAmount ? ` up to ${money(x.capAmount, cur)}` : ''} · {x.applicationsCount} applications</Meta></span><Status value={x.isActive ? 'active' : 'paused'} /></div>
            <Edit><RecordForm list="IncentiveProgram" id={x.id} submit="Save" paths={[PATH]} fields={ipFields(x)} /></Edit>
          </div>
        ))}
        <Add what="a programme"><RecordForm list="IncentiveProgram" submit="Add programme" paths={[PATH]} fields={ipFields()} /></Add>
      </Section>
      <Section title="Commission rules">
        {d.commissionRules.map((x: any) => (
          <div key={x.id} className="border-b py-3 last:border-b-0">
            <div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{x.name} <Meta>{x.type === 'percent_of_order' ? `${x.value}% of the order` : `${money(Number(x.value), cur)} a system`}</Meta></span><Status value={x.isActive ? 'active' : 'paused'} /></div>
            <Edit><RecordForm list="CommissionRule" id={x.id} submit="Save" paths={[PATH]} fields={crFields(x)} /></Edit>
          </div>
        ))}
        <Add what="a rule"><RecordForm list="CommissionRule" submit="Add rule" paths={[PATH]} fields={crFields()} /></Add>
      </Section>
    </SettingsShell>
  )
}
