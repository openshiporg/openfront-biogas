import { q } from '../../lib/server'
import { Section, Meta } from '../../components/ui'
import { RecordForm } from '../../records/RecordForm'
import { SettingsShell, settingsAccess } from '../components/SettingsShell'

const PATH = '/dashboard/platform/settings'
const t = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const m = (v: number | null | undefined) => ((v ?? 0) / 100).toFixed(2)

/** P58: company, tax and policies. Every policy the services read (cooling-off, restocking, survey fee, grace days, follow-up days) is set here. */
export default async function CompanySettingsPage() {
  const { allowed } = await settingsAccess()
  if (!allowed) return <SettingsShell active={PATH} title="Settings" allowed={false} />
    const d = await q<any>(`{ companySettings { id name legalName country currencyCode timezone units phone whatsappNumber email address taxRatePercent taxLabel taxInclusive
      quoteValidDays coolingOffDays restockingFeePercent surveyFeeAmount surveyRequiredByDefault visitCancelCutoffHours slotsPerTechnicianPerDay leadResponseWorkingDays
      serviceResponseTargetDays instalmentGraceDays defaultAfterDays payBeforeServiceWork keepFeeOnLateCancel returnWindowDays referralRewardAmount waivePlanFeeOnPayoff
      commissionClawbackDays incentiveRejectionPolicy followUpScheduleDays heroText about } }`)
    const s = d.companySettings
    if (!s) return <SettingsShell active={PATH} title="Settings" allowed><Meta>Run first-time setup from the dashboard home to create the company.</Meta></SettingsShell>
    const id = s.id
    return (
      <SettingsShell active={PATH} title="Settings" allowed>
        <Section title="Company">
          <RecordForm list="CompanySettings" id={id} submit="Save company" paths={[PATH]} fields={[
            { name: 'name', label: 'Trading name', required: true, defaultValue: s.name }, { name: 'legalName', label: 'Legal name', defaultValue: s.legalName },
            { name: 'phone', label: 'Phone', kind: 'tel', width: 'sm', defaultValue: s.phone }, { name: 'whatsappNumber', label: 'WhatsApp', kind: 'tel', width: 'sm', defaultValue: s.whatsappNumber },
            { name: 'email', label: 'Email', kind: 'email', defaultValue: s.email },
            { name: 'country', label: 'Country', kind: 'select', width: 'sm', defaultValue: s.country, options: ['US', 'KE', 'IN', 'PK', 'other'].map(v => ({ value: v, label: v === 'other' ? 'Other' : v })) },
            { name: 'timezone', label: 'Time zone', width: 'md', defaultValue: s.timezone },
            { name: 'units', label: 'Units', kind: 'select', width: 'sm', defaultValue: s.units, options: [{ value: 'imperial', label: 'Imperial' }, { value: 'metric', label: 'Metric' }] },
            { name: 'address', label: 'Address', kind: 'textarea', defaultValue: s.address },
          ]} />
          <Meta>Currency {s.currencyCode} is fixed at setup, since every amount is stored in it.</Meta>
        </Section>
        <Section title="Tax">
          <RecordForm list="CompanySettings" id={id} submit="Save tax" paths={[PATH]} fields={[
            { name: 'taxLabel', label: 'Tax name', width: 'md', defaultValue: s.taxLabel }, { name: 'taxRatePercent', label: 'Rate %', kind: 'number', width: 'sm', defaultValue: t(s.taxRatePercent) },
            { name: 'taxInclusive', label: 'Prices include tax', kind: 'checkbox', defaultValue: s.taxInclusive },
          ]} />
        </Section>
        <Section title="Sales and orders">
          <RecordForm list="CompanySettings" id={id} submit="Save sales policies" paths={[PATH]} fields={[
            { name: 'quoteValidDays', label: 'Quote valid days', kind: 'number', width: 'sm', defaultValue: t(s.quoteValidDays) },
            { name: 'coolingOffDays', label: 'Cooling-off days', kind: 'number', width: 'sm', defaultValue: t(s.coolingOffDays) },
            { name: 'restockingFeePercent', label: 'Restocking fee %', kind: 'number', width: 'sm', defaultValue: t(s.restockingFeePercent) },
            { name: 'returnWindowDays', label: 'Return window days', kind: 'number', width: 'sm', defaultValue: t(s.returnWindowDays) },
            { name: 'surveyFeeAmount', label: 'Survey fee', kind: 'money', width: 'sm', defaultValue: m(s.surveyFeeAmount) },
            { name: 'leadResponseWorkingDays', label: 'First contact within (working days)', kind: 'number', width: 'md', defaultValue: t(s.leadResponseWorkingDays) },
            { name: 'referralRewardAmount', label: 'Referral reward', kind: 'money', width: 'sm', defaultValue: m(s.referralRewardAmount) },
            { name: 'commissionClawbackDays', label: 'Commission claw-back days', kind: 'number', width: 'sm', defaultValue: t(s.commissionClawbackDays) },
            { name: 'incentiveRejectionPolicy', label: 'If an incentive is rejected', kind: 'select', width: 'lg', defaultValue: s.incentiveRejectionPolicy, options: [{ value: 'absorb', label: 'The company absorbs it' }, { value: 'add_final_instalment', label: 'Add it to the customer\u2019s plan as a final instalment' }] },
            { name: 'surveyRequiredByDefault', label: 'Survey before every install', kind: 'checkbox', defaultValue: s.surveyRequiredByDefault },
          ]} />
        </Section>
        <Section title="Visits and service">
          <RecordForm list="CompanySettings" id={id} submit="Save visit policies" paths={[PATH]} fields={[
            { name: 'slotsPerTechnicianPerDay', label: 'Visit slots per technician a day', kind: 'number', width: 'md', defaultValue: t(s.slotsPerTechnicianPerDay) },
            { name: 'visitCancelCutoffHours', label: 'Free cancel up to (hours before)', kind: 'number', width: 'md', defaultValue: t(s.visitCancelCutoffHours) },
            { name: 'serviceResponseTargetDays', label: 'Ticket response target (days)', kind: 'number', width: 'md', defaultValue: t(s.serviceResponseTargetDays) },
            { name: 'followUpScheduleDays', label: 'Follow-ups after commissioning (days, JSON list)', width: 'md', defaultValue: JSON.stringify(s.followUpScheduleDays ?? [7, 30, 90, 365]) },
            { name: 'keepFeeOnLateCancel', label: 'Keep the visit fee on a late cancel', kind: 'checkbox', defaultValue: s.keepFeeOnLateCancel },
            { name: 'payBeforeServiceWork', label: 'Paid repairs are paid before the visit', kind: 'checkbox', defaultValue: s.payBeforeServiceWork },
          ]} />
        </Section>
        <Section title="Payment plans">
          <RecordForm list="CompanySettings" id={id} submit="Save plan policies" paths={[PATH]} fields={[
            { name: 'instalmentGraceDays', label: 'Grace days before overdue', kind: 'number', width: 'md', defaultValue: t(s.instalmentGraceDays) },
            { name: 'defaultAfterDays', label: 'Defaulted after (days overdue)', kind: 'number', width: 'md', defaultValue: t(s.defaultAfterDays) },
            { name: 'waivePlanFeeOnPayoff', label: 'Waive the plan fee on early payoff', kind: 'checkbox', defaultValue: s.waivePlanFeeOnPayoff },
          ]} />
        </Section>
        <Section title="Storefront words">
          <RecordForm list="CompanySettings" id={id} submit="Save storefront words" paths={[PATH, '/']} fields={[
            { name: 'heroText', label: 'Home page headline', kind: 'textarea', defaultValue: s.heroText },
            { name: 'about', label: 'About us', kind: 'textarea', defaultValue: s.about },
          ]} />
        </Section>
      </SettingsShell>
    )
}
