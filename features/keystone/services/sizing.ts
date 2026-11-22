import type { Tx } from '../lib/db'
import { DomainError, Codes } from '../lib/errors'

/**
 * The sizing calculator (W1.1). Fresh-feed and gas-yield figures are the conservative planning values
 * small-digester programmes use (SNV / Hivos field guides): a cow ≈ 10 kg dung/day at ≈ 0.036 m³/kg,
 * a pig ≈ 2 kg at ≈ 0.06, a bird ≈ 0.1 kg at ≈ 0.065, food waste ≈ 0.09 m³/kg. A burner uses about
 * 0.35 m³ an hour; a person cooks with about 0.25 m³ a day.
 */
export const FEED = {
  cattle: { kgPerDay: 10, m3PerKg: 0.036 },
  pigs: { kgPerDay: 2, m3PerKg: 0.06 },
  poultry: { kgPerDay: 0.1, m3PerKg: 0.065 },
  kitchen: { kgPerDay: 1, m3PerKg: 0.09 },
} as const
export const BURNER_M3_PER_HOUR = 0.35
export const COOKING_M3_PER_PERSON = 0.25

export type SizingInput = {
  cattle?: number
  pigs?: number
  poultry?: number
  kitchenWasteKgPerDay?: number
  people?: number
  monthlyFuelSpendAmount?: number
  interest?: 'home' | 'farm' | 'institution'
}

const count = (v: unknown, field: string, max = 100_000) => {
  if (v === undefined || v === null || v === '') return 0
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0 || n > max) throw new DomainError(Codes.INVALID_INPUT, `${field} must be between 0 and ${max}.`)
  return n
}

export function cleanSizingInput(raw: unknown): Required<Omit<SizingInput, 'interest'>> & { interest: string } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const input = {
    cattle: Math.floor(count(r.cattle, 'Cattle')),
    pigs: Math.floor(count(r.pigs, 'Pigs')),
    poultry: Math.floor(count(r.poultry, 'Poultry', 1_000_000)),
    kitchenWasteKgPerDay: Math.round(count(r.kitchenWasteKgPerDay, 'Kitchen waste', 50_000) * 10) / 10,
    people: Math.floor(count(r.people, 'People', 100_000)),
    monthlyFuelSpendAmount: Math.floor(count(r.monthlyFuelSpendAmount, 'Monthly fuel spend', 1_000_000_000)),
    interest: ['home', 'farm', 'institution'].includes(String(r.interest)) ? String(r.interest) : 'home',
  }
  if (!input.cattle && !input.pigs && !input.poultry && !input.kitchenWasteKgPerDay) throw new DomainError(Codes.INVALID_INPUT, 'Tell us about your animals or your kitchen waste.')
  return input
}

/** Pure arithmetic: feed, gas, cooking hours. */
export function gasFrom(input: ReturnType<typeof cleanSizingInput>) {
  const parts = [
    { kind: 'cattle', kg: input.cattle * FEED.cattle.kgPerDay, m3: input.cattle * FEED.cattle.kgPerDay * FEED.cattle.m3PerKg },
    { kind: 'pig', kg: input.pigs * FEED.pigs.kgPerDay, m3: input.pigs * FEED.pigs.kgPerDay * FEED.pigs.m3PerKg },
    { kind: 'poultry', kg: input.poultry * FEED.poultry.kgPerDay, m3: input.poultry * FEED.poultry.kgPerDay * FEED.poultry.m3PerKg },
    { kind: 'kitchen', kg: input.kitchenWasteKgPerDay, m3: input.kitchenWasteKgPerDay * FEED.kitchen.m3PerKg },
  ]
  const dailyFeedKg = Math.round(parts.reduce((s, p) => s + p.kg, 0) * 10) / 10
  const estimatedGasM3 = Math.round(parts.reduce((s, p) => s + p.m3, 0) * 100) / 100
  const cookingHours = Math.round((estimatedGasM3 / BURNER_M3_PER_HOUR) * 10) / 10
  const feedstocks = parts.filter(p => p.kg > 0).map(p => p.kind)
  return { dailyFeedKg, estimatedGasM3, cookingHours, feedstocks }
}

type Spec = { capacityM3: unknown; minDailyFeedKg: unknown; maxDailyFeedKg: unknown; dailyGasM3: unknown; feedstockTypes: unknown; servesPeople: number | null; technology: string }
export type Candidate = { id: string; name: string; slug: string; priceAmount: number; installFeeAmount: number; currencyCode: string; digesterSpec: Spec | null }

/** Smallest published kit whose feed range covers the daily feed and that takes every feedstock. */
export function recommend(candidates: Candidate[], gas: ReturnType<typeof gasFrom>) {
  const ok = candidates.filter(c => {
    const s = c.digesterSpec
    if (!s) return false
    const types = (Array.isArray(s.feedstockTypes) ? s.feedstockTypes : []) as string[]
    const takes = gas.feedstocks.every(f => types.includes(f) || (f === 'pig' && types.includes('pig')) || (f !== 'kitchen' && types.includes('manure')))
    return takes && Number(s.maxDailyFeedKg ?? 0) >= gas.dailyFeedKg
  })
  ok.sort((a, b) => Number(a.digesterSpec!.capacityM3) - Number(b.digesterSpec!.capacityM3))
  return ok.find(c => Number(c.digesterSpec!.minDailyFeedKg ?? 0) <= gas.dailyFeedKg) ?? ok[0] ?? null
}

export async function sizeSystem(tx: Tx, raw: unknown) {
  const input = cleanSizingInput(raw)
  const gas = gasFrom(input)
  const candidates = (await tx.product.findMany({
    where: { type: 'digester_kit', isPublished: true, digesterSpec: { isNot: null } },
    select: { id: true, name: true, slug: true, priceAmount: true, installFeeAmount: true, currencyCode: true, digesterSpec: { select: { capacityM3: true, minDailyFeedKg: true, maxDailyFeedKg: true, dailyGasM3: true, feedstockTypes: true, servesPeople: true, technology: true } } },
  })) as unknown as Candidate[]
  const pick = recommend(candidates, gas)
  const needM3 = input.people ? input.people * COOKING_M3_PER_PERSON : gas.estimatedGasM3
  const coverBps = needM3 > 0 ? Math.min(10000, Math.floor((gas.estimatedGasM3 / needM3) * 10000)) : 10000
  const fuelSavedAmountPerMonth = Math.floor((input.monthlyFuelSpendAmount * coverBps) / 10000)
  const installed = pick ? pick.priceAmount + pick.installFeeAmount : 0
  const paybackMonths = pick && fuelSavedAmountPerMonth > 0 ? Math.ceil(installed / fuelSavedAmountPerMonth) : null
  const result = {
    input,
    ...gas,
    coversPercent: Math.round(coverBps / 100),
    fuelSavedAmountPerMonth,
    paybackMonths,
    recommended: pick ? { id: pick.id, name: pick.name, slug: pick.slug, priceAmount: pick.priceAmount, installFeeAmount: pick.installFeeAmount, currencyCode: pick.currencyCode, capacityM3: String(pick.digesterSpec!.capacityM3), dailyGasM3: String(pick.digesterSpec!.dailyGasM3 ?? '') } : null,
    note: pick ? '' : 'None of our standard systems fits this; we will size one for you after a site survey.',
  }
  const saved = await tx.sizingAssessment.create({
    data: {
      inputs: input,
      dailyFeedKg: String(gas.dailyFeedKg),
      estimatedGasM3: String(gas.estimatedGasM3),
      cookingHours: String(gas.cookingHours),
      fuelSavedAmountPerMonth,
      paybackMonths,
      source: 'public',
      resultJson: result as never,
      recommendedProductId: pick?.id ?? null,
    },
    select: { id: true },
  })
  return { assessmentId: saved.id, ...result }
}
