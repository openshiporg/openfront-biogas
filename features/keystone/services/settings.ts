import type { Tx } from '../lib/db'

/** Company settings with working defaults, so nothing depends on onboarding having run. */
export const DEFAULT_SETTINGS = {
  name: 'Biogas company', country: 'US', currencyCode: 'USD', timezone: 'America/Chicago', units: 'metric',
  phone: '', whatsappNumber: '', email: '', address: '',
  taxRatePercent: '0', taxLabel: 'Sales tax', taxInclusive: false,
  quoteValidDays: 30, coolingOffDays: 3, restockingFeePercent: '10', surveyFeeAmount: 0, surveyRequiredByDefault: true,
  visitCancelCutoffHours: 24, slotsPerTechnicianPerDay: 4, leadResponseWorkingDays: 1, serviceResponseTargetDays: 5,
  instalmentGraceDays: 5, defaultAfterDays: 60, payBeforeServiceWork: false, keepFeeOnLateCancel: true, returnWindowDays: 30,
  referralRewardAmount: 0, waivePlanFeeOnPayoff: true, commissionClawbackDays: 90, incentiveRejectionPolicy: 'absorb',
  followUpScheduleDays: [7, 30, 90, 365] as number[], offlinePaymentInstructions: {} as Record<string, string>,
}

export type Settings = typeof DEFAULT_SETTINGS & { id?: number }

export async function getSettings(tx: Tx): Promise<Settings> {
  const row = await tx.companySettings.findFirst()
  if (!row) return { ...DEFAULT_SETTINGS }
  const days = Array.isArray(row.followUpScheduleDays) ? (row.followUpScheduleDays as unknown[]).map(Number).filter(n => Number.isInteger(n) && n > 0) : []
  return {
    ...DEFAULT_SETTINGS,
    ...(row as unknown as Settings),
    taxRatePercent: String(row.taxRatePercent ?? '0'),
    restockingFeePercent: String(row.restockingFeePercent ?? '10'),
    followUpScheduleDays: days.length ? days.sort((a, b) => a - b) : DEFAULT_SETTINGS.followUpScheduleDays,
    offlinePaymentInstructions: (row.offlinePaymentInstructions as Record<string, string>) ?? {},
  }
}
