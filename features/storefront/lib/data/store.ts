import 'server-only'
import { cache } from 'react'
import { gqlOrNull } from './client'

/*
 * What the company set up: name, contact details, currency, branches, the published catalogue,
 * stories, questions, service plans and payment plan templates. Read through the public list API
 * (access rules already hide anything unpublished).
 */

export type Store = {
  name: string
  tagline: string
  about: string
  heroText: string
  impactNumbers: { label: string; value: string }[]
  country: string
  currencyCode: string
  timezone: string
  units: string
  phone: string
  whatsappNumber: string
  email: string
  address: string
  logoUrl: string | null
  surveyFeeAmount: number
  surveyRequiredByDefault: boolean
  quoteValidDays: number
  returnWindowDays: number
  taxLabel: string
  taxInclusive: boolean
  configured: boolean
  branches: { id: string; name: string; address: string; phone: string }[]
}

const SETTINGS = `
  companySettings {
    name legalName country currencyCode timezone units phone whatsappNumber email address
    logo { url } heroText impactNumbers about surveyFeeAmount surveyRequiredByDefault quoteValidDays returnWindowDays taxLabel taxInclusive onboardedAt
  }
  branches(where: { isActive: { equals: true } }, orderBy: [{ name: asc }]) { id name address phone }
`

export const getStore = cache(async (): Promise<Store> => {
  const r = await gqlOrNull<{ companySettings: any; branches: any[] | null }>(`{ ${SETTINGS} }`)
  const s = r?.companySettings
  const branches = (r?.branches ?? []).map(b => ({ id: b.id, name: b.name ?? '', address: b.address ?? '', phone: b.phone ?? '' }))
  return {
    name: s?.name || s?.legalName || '',
    tagline: '',
    about: s?.about ?? '',
    heroText: s?.heroText ?? '',
    impactNumbers: (Array.isArray(s?.impactNumbers) ? s.impactNumbers : []).map((x: any) => ({ label: String(x?.label ?? ''), value: String(x?.value ?? '') })).filter((x: { label: string; value: string }) => x.label && x.value).slice(0, 4),
    country: s?.country ?? 'US',
    currencyCode: s?.currencyCode || 'USD',
    timezone: s?.timezone || 'UTC',
    units: s?.units || 'metric',
    phone: s?.phone || branches.find(b => b.phone)?.phone || '',
    whatsappNumber: s?.whatsappNumber ?? '',
    email: s?.email ?? '',
    address: s?.address ?? '',
    logoUrl: s?.logo?.url ?? null,
    surveyFeeAmount: Number(s?.surveyFeeAmount ?? 0),
    surveyRequiredByDefault: s?.surveyRequiredByDefault !== false,
    quoteValidDays: Number(s?.quoteValidDays ?? 30),
    returnWindowDays: Number(s?.returnWindowDays ?? 30),
    taxLabel: s?.taxLabel || 'Tax',
    taxInclusive: Boolean(s?.taxInclusive),
    configured: Boolean(s?.onboardedAt || s?.name),
    branches,
  }
})

export type Spec = {
  capacityM3: string | null
  technology: string
  feedstockTypes: string[]
  minDailyFeedKg: string | null
  maxDailyFeedKg: string | null
  dailyGasM3: string | null
  cookingHoursPerDay: string | null
  servesPeople: number | null
  footprintLengthM: string | null
  footprintWidthM: string | null
  waterPerDayL: string | null
  reactorWarrantyMonths: number | null
  partsWarrantyMonths: number | null
  installHours: string | null
}

export type Product = {
  id: string
  name: string
  slug: string
  sku: string
  type: string
  description: string
  imageUrl: string | null
  priceAmount: number
  compareAtAmount: number | null
  currencyCode: string
  requiresInstallation: boolean
  requiresSurvey: boolean
  installFeeAmount: number
  warrantyMonths: number
  sellOnline: boolean
  category: { id: string; name: string; slug: string } | null
  spec: Spec | null
}

const PRODUCT_FIELDS = `
  id name slug sku type description imageUrl image { url } priceAmount compareAtAmount currencyCode
  requiresInstallation requiresSurvey installFeeAmount warrantyMonths sellOnline
  category { id name slug }
  digesterSpec {
    capacityM3 technology feedstockTypes minDailyFeedKg maxDailyFeedKg dailyGasM3 cookingHoursPerDay servesPeople
    footprintLengthM footprintWidthM waterPerDayL reactorWarrantyMonths partsWarrantyMonths installHours
  }
`

function toProduct(p: any): Product {
  const s = p.digesterSpec
  return {
    id: p.id, name: p.name ?? '', slug: p.slug ?? '', sku: p.sku ?? '', type: p.type ?? 'part', description: p.description ?? '',
    imageUrl: p.image?.url || p.imageUrl || null,
    priceAmount: Number(p.priceAmount ?? 0), compareAtAmount: p.compareAtAmount ?? null, currencyCode: p.currencyCode || 'USD',
    requiresInstallation: Boolean(p.requiresInstallation), requiresSurvey: Boolean(p.requiresSurvey), installFeeAmount: Number(p.installFeeAmount ?? 0),
    warrantyMonths: Number(p.warrantyMonths ?? 0), sellOnline: p.sellOnline !== false,
    category: p.category ? { id: p.category.id, name: p.category.name ?? '', slug: p.category.slug ?? '' } : null,
    spec: s
      ? {
          capacityM3: s.capacityM3, technology: s.technology ?? '', feedstockTypes: Array.isArray(s.feedstockTypes) ? s.feedstockTypes : [],
          minDailyFeedKg: s.minDailyFeedKg, maxDailyFeedKg: s.maxDailyFeedKg, dailyGasM3: s.dailyGasM3, cookingHoursPerDay: s.cookingHoursPerDay,
          servesPeople: s.servesPeople ?? null, footprintLengthM: s.footprintLengthM, footprintWidthM: s.footprintWidthM, waterPerDayL: s.waterPerDayL,
          reactorWarrantyMonths: s.reactorWarrantyMonths ?? null, partsWarrantyMonths: s.partsWarrantyMonths ?? null, installHours: s.installHours,
        }
      : null,
  }
}

/** Published digester systems, smallest first. */
export const getSystems = cache(async (): Promise<Product[]> => {
  const r = await gqlOrNull<{ products: any[] }>(`{ products(where: { type: { equals: "digester_kit" }, isPublished: { equals: true } }, orderBy: [{ priceAmount: asc }]) { ${PRODUCT_FIELDS} } }`)
  return (r?.products ?? []).map(toProduct).sort((a, b) => Number(a.spec?.capacityM3 ?? 0) - Number(b.spec?.capacityM3 ?? 0) || a.priceAmount - b.priceAmount)
})

export type SystemDetail = Product & {
  components: { quantity: number; name: string; slug: string; type: string }[]
  resources: { id: string; title: string; kind: string; url: string | null; language: string }[]
  fitsParts: Product[]
}

export const getSystem = cache(async (slug: string): Promise<SystemDetail | null> => {
  const r = await gqlOrNull<{ products: any[] }>(
    `query($slug: String!) { products(where: { slug: { equals: $slug }, type: { equals: "digester_kit" }, isPublished: { equals: true } }, take: 1) {
      ${PRODUCT_FIELDS}
      kitComponents { quantity component { name slug type isPublished } }
      resources(where: { isPublished: { equals: true } }) { id title kind url file { url } language }
      fitsParts(where: { isPublished: { equals: true } }, take: 8) { ${PRODUCT_FIELDS} }
    } }`,
    { slug },
  )
  const p = r?.products?.[0]
  if (!p) return null
  return {
    ...toProduct(p),
    components: (p.kitComponents ?? []).filter((k: any) => k.component).map((k: any) => ({ quantity: k.quantity ?? 1, name: k.component.name, slug: k.component.isPublished ? k.component.slug : '', type: k.component.type })),
    resources: (p.resources ?? []).map((x: any) => ({ id: x.id, title: x.title ?? '', kind: x.kind ?? 'manual', url: x.file?.url || x.url || null, language: x.language ?? '' })),
    fitsParts: (p.fitsParts ?? []).map(toProduct),
  }
})

export type Category = { id: string; name: string; slug: string; description: string }

export const getShop = cache(async (): Promise<{ products: Product[]; categories: Category[] }> => {
  const r = await gqlOrNull<{ products: any[]; productCategories: any[] }>(`{
    products(where: { type: { in: ["appliance", "part", "consumable"] }, isPublished: { equals: true }, sellOnline: { equals: true } }, orderBy: [{ name: asc }]) {
      ${PRODUCT_FIELDS} compatibleWith(where: { isPublished: { equals: true } }) { id slug name }
    }
    productCategories(orderBy: [{ sortOrder: asc }, { name: asc }]) { id name slug description }
  }`)
  const products = (r?.products ?? []).map(p => ({ ...toProduct(p), fits: (p.compatibleWith ?? []).map((k: any) => k.slug) }))
  const used = new Set(products.map(p => p.category?.id).filter(Boolean))
  return { products, categories: (r?.productCategories ?? []).filter(c => used.has(c.id)).map(c => ({ id: c.id, name: c.name, slug: c.slug, description: c.description ?? '' })) }
})

export type Part = Product & { fits: { name: string; slug: string }[]; inStock: number | null }

export const getPart = cache(async (slug: string): Promise<Part | null> => {
  const r = await gqlOrNull<{ products: any[] }>(
    `query($slug: String!) { products(where: { slug: { equals: $slug }, type: { in: ["appliance", "part", "consumable"] }, isPublished: { equals: true } }, take: 1) {
      ${PRODUCT_FIELDS}
      compatibleWith(where: { isPublished: { equals: true } }) { name slug }
      stockLevels { onHand reserved }
    } }`,
    { slug },
  )
  const p = r?.products?.[0]
  if (!p) return null
  const levels = Array.isArray(p.stockLevels) ? p.stockLevels : null
  return {
    ...toProduct(p),
    fits: (p.compatibleWith ?? []).map((k: any) => ({ name: k.name, slug: k.slug })),
    inStock: levels ? levels.reduce((s: number, l: any) => s + Math.max(0, Number(l.onHand ?? 0) - Number(l.reserved ?? 0)), 0) : null,
  }
})

export type Story = { id: string; title: string; customerName: string; location: string; body: string; imageUrl: string | null; savingsText: string }

export const getStories = cache(async (): Promise<Story[]> => {
  const r = await gqlOrNull<{ stories: any[] }>('{ stories(where: { isPublished: { equals: true } }, orderBy: [{ createdAt: desc }], take: 6) { id title customerName location body imageUrl savingsText } }')
  return (r?.stories ?? []).map(s => ({ id: s.id, title: s.title ?? '', customerName: s.customerName ?? '', location: s.location ?? '', body: s.body ?? '', imageUrl: s.imageUrl ?? null, savingsText: s.savingsText ?? '' }))
})

export type Faq = { id: string; question: string; answer: string; category: string }

export const getFaqs = cache(async (): Promise<Faq[]> => {
  const r = await gqlOrNull<{ faqs: any[] }>('{ faqs(where: { isPublished: { equals: true } }, orderBy: [{ sortOrder: asc }]) { id question answer category } }')
  return (r?.faqs ?? []).map(f => ({ id: f.id, question: f.question ?? '', answer: f.answer ?? '', category: f.category ?? '' }))
})

export type ServicePlan = { id: string; name: string; slug: string; description: string; priceAmount: number; currencyCode: string; billing: string; visitsPerYear: number; partsDiscountPercent: string; priorityResponse: boolean; includedItems: string[] }

export const getServicePlans = cache(async (): Promise<ServicePlan[]> => {
  const r = await gqlOrNull<{ servicePlans: any[] }>('{ servicePlans(where: { isPublished: { equals: true } }, orderBy: [{ priceAmount: asc }]) { id name slug description priceAmount currencyCode billing visitsPerYear partsDiscountPercent priorityResponse includedItems } }')
  return (r?.servicePlans ?? []).map(p => ({
    id: p.id, name: p.name ?? '', slug: p.slug ?? '', description: p.description ?? '', priceAmount: Number(p.priceAmount ?? 0), currencyCode: p.currencyCode || 'USD',
    billing: p.billing ?? 'yearly', visitsPerYear: Number(p.visitsPerYear ?? 0), partsDiscountPercent: String(p.partsDiscountPercent ?? '0'), priorityResponse: Boolean(p.priorityResponse),
    includedItems: Array.isArray(p.includedItems) ? p.includedItems.map((x: unknown) => (typeof x === 'string' ? x : (x as any)?.label ?? '')).filter(Boolean) : [],
  }))
})

export type PlanTemplate = { id: string; name: string; kind: string; depositPercent: string; instalmentCount: number; frequency: string; planFeePercent: string; minOrderAmount: number }

export const getPlanTemplates = cache(async (): Promise<PlanTemplate[]> => {
  const r = await gqlOrNull<{ paymentPlanTemplates: any[] }>('{ paymentPlanTemplates(where: { isActive: { equals: true } }, orderBy: [{ sortOrder: asc }]) { id name kind depositPercent instalmentCount frequency planFeePercent minOrderAmount } }')
  return (r?.paymentPlanTemplates ?? []).map(t => ({ id: t.id, name: t.name ?? '', kind: t.kind ?? 'instalments', depositPercent: String(t.depositPercent ?? '0'), instalmentCount: Number(t.instalmentCount ?? 0), frequency: t.frequency ?? 'monthly', planFeePercent: String(t.planFeePercent ?? '0'), minOrderAmount: Number(t.minOrderAmount ?? 0) }))
})

/**
 * "From X a month" for a price: the lowest monthly instalment any active monthly template gives,
 * worked out the way the quote's plan offer does it (deposit off, plan fee on the financed part,
 * split evenly, rounded up). Null when no monthly plan applies.
 */
export function fromMonthly(price: number, templates: PlanTemplate[]) {
  const pct = (total: number, p: string) => Math.floor((total * Math.round(Number(p) * 100)) / 10000)
  let best: number | null = null
  for (const t of templates) {
    if (t.kind !== 'instalments' || t.frequency !== 'monthly' || t.instalmentCount <= 0 || price < t.minOrderAmount) continue
    const deposit = pct(price, t.depositPercent)
    const financed = price - deposit
    const each = Math.ceil((financed + pct(financed, t.planFeePercent)) / t.instalmentCount)
    if (best === null || each < best) best = each
  }
  return best
}
