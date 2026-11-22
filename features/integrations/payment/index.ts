import { stripeConfigured } from './stripe'

/**
 * Payment methods (section 7). The `PaymentProvider.code` seam: card through Stripe when its key is set;
 * mobile money, bank transfer and cash are recorded by reference and verified by staff, and they work
 * with no settings at all. Paystack, Razorpay and JazzCash are each one adapter file later.
 */
export const PROVIDER_CODES = ['stripe', 'mobile_money', 'bank_transfer', 'cash'] as const
export type ProviderCode = (typeof PROVIDER_CODES)[number]

export type ProviderInfo = { code: ProviderCode; settlement: 'processor' | 'offline'; method: 'card' | 'mobile_money' | 'bank_transfer' | 'cash'; label: string; available: () => boolean; customerCanSubmit: boolean; sessionMinutes: number }

export const PROVIDERS: Record<ProviderCode, ProviderInfo> = {
  stripe: { code: 'stripe', settlement: 'processor', method: 'card', label: 'Card', available: stripeConfigured, customerCanSubmit: false, sessionMinutes: 30 },
  mobile_money: { code: 'mobile_money', settlement: 'offline', method: 'mobile_money', label: 'Mobile money', available: () => true, customerCanSubmit: true, sessionMinutes: 3 * 24 * 60 },
  bank_transfer: { code: 'bank_transfer', settlement: 'offline', method: 'bank_transfer', label: 'Bank transfer', available: () => true, customerCanSubmit: true, sessionMinutes: 3 * 24 * 60 },
  // Cash is handed to staff, who record it; a customer cannot "submit" cash online.
  cash: { code: 'cash', settlement: 'offline', method: 'cash', label: 'Cash to our staff', available: () => true, customerCanSubmit: false, sessionMinutes: 3 * 24 * 60 },
}

export const isProviderCode = (code: unknown): code is ProviderCode => typeof code === 'string' && (PROVIDER_CODES as readonly string[]).includes(code)

/** Normalised reference for the (provider, reference) unique key: M-Pesa codes are case-insensitive. */
export const referenceKey = (code: ProviderCode, reference: string) => `${code}:${reference.trim().toUpperCase().replace(/[\s-]+/g, '')}`
