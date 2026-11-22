import bcrypt from 'bcryptjs'
import type { Tx } from '../lib/db'
import type { UnitOfWork } from '../lib/unitOfWork'
import { DomainError, Codes } from '../lib/errors'
import { auditChange } from '../lib/cas'
import { requirePermission, type Actor } from '../lib/actor'
import { nextNumber, publicCode, randomToken } from '../lib/sequence'
import { PRESETS, type CountryCode, type Preset } from '../../platform/onboarding/lib/presets'
import { CHECKLISTS, FAQS, GUIDES, ROLES, STAFF, STORIES } from '../../platform/onboarding/lib/content'
import { permissionNames } from '../access'
import { str } from './util'

/**
 * First-run onboarding (section 9). Five answers pick a preset; the reference data (company, branches,
 * catalogue, stock, plans, checklists, content, roles, staff) is upserted by natural keys, so running
 * twice creates nothing new. The first month of work is loaded once, through the same services the
 * dashboard uses (seed/activity.ts), and only when the company has no leads yet.
 */
export type OnboardingAnswers = { companyName?: string; country: CountryCode; sells?: string[]; instalments?: boolean; paymentMethods?: string[]; withActivity?: boolean }

const counter = () => {
  const created: Record<string, number> = {}
  return { created, add: (k: string, n = 1) => (created[k] = (created[k] ?? 0) + n) }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
const prefixedEmail = (first: string, last: string, domain: string) => `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '') + `@${domain}`

export async function seedReference(uow: UnitOfWork, actor: Actor, answers: OnboardingAnswers) {
  requirePermission(actor, 'canManageOnboarding')
  const preset = PRESETS[answers.country]
  if (!preset) throw new DomainError(Codes.INVALID_INPUT, 'Pick a country.')
  const tx = uow.tx
  const c = counter()
  const sells = new Set(answers.sells?.length ? answers.sells : ['home', 'farm', 'institution', 'parts'])
  const company = { ...preset.company, name: str(answers.companyName, 120) || preset.company.name }

  // Company settings (singleton id 1).
  const existing = await tx.companySettings.findFirst()
  const instructions = Object.fromEntries(Object.entries(preset.paymentInstructions))
  const settingsData = {
    name: company.name, legalName: company.legalName, country: preset.country, currencyCode: company.currencyCode, timezone: company.timezone, units: company.units, phone: company.phone, whatsappNumber: company.whatsappNumber, email: company.email, address: company.address,
    taxRatePercent: company.taxRatePercent, taxLabel: company.taxLabel, taxInclusive: company.taxInclusive, surveyFeeAmount: company.surveyFeeAmount, referralRewardAmount: company.referralRewardAmount,
    heroText: company.heroText, about: company.about, offlinePaymentInstructions: instructions,
    impactNumbers: [{ label: 'Systems installed', value: '480+' }, { label: 'Still working at 12 months', value: '94%' }, { label: 'Tonnes of CO₂ avoided a year', value: '1,900' }],
    onboardingAnswers: answers as never, onboardedAt: uow.now,
  }
  if (existing) await tx.companySettings.update({ where: { id: existing.id }, data: settingsData })
  else { await tx.companySettings.create({ data: { id: 1, ...settingsData } as never }); c.add('companySettings') }

  // Payment methods.
  const enabled = new Set(answers.paymentMethods?.length ? answers.paymentMethods : ['stripe', 'mobile_money', 'bank_transfer', 'cash'])
  const methods: [string, string, boolean, string][] = [['stripe', 'Card', true, ''], ['mobile_money', preset.country === 'US' ? 'Zelle or Venmo' : preset.country === 'IN' ? 'UPI' : 'Mobile money', false, preset.paymentInstructions.mobile_money], ['bank_transfer', 'Bank transfer', false, preset.paymentInstructions.bank_transfer], ['cash', 'Cash to our staff', false, preset.paymentInstructions.cash]]
  for (const [i, [code, name, online, text]] of methods.entries()) {
    const row = await tx.paymentProvider.findUnique({ where: { code } })
    if (row) await tx.paymentProvider.update({ where: { code }, data: { isEnabled: enabled.has(code), instructions: text, name } })
    else { await tx.paymentProvider.create({ data: { code, name, isOnline: online, isEnabled: enabled.has(code), instructions: text, sortOrder: i, credentialEnv: code === 'stripe' ? { secret: 'STRIPE_SECRET_KEY', publishable: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', webhook: 'STRIPE_WEBHOOK_SECRET' } : {} } }); c.add('paymentMethods') }
  }

  // Branches, service areas, stock locations.
  const branchIds: string[] = []
  for (const b of preset.branches) {
    let branch = await tx.branch.findUnique({ where: { code: b.code } })
    if (!branch) { branch = await tx.branch.create({ data: { code: b.code, name: b.name, address: b.address, phone: b.phone, lat: b.lat, lng: b.lng } }); c.add('branches') }
    branchIds.push(branch.id)
    for (const a of b.areas) {
      const area = await tx.serviceArea.findFirst({ where: { name: a.name } })
      if (!area) { await tx.serviceArea.create({ data: { name: a.name, country: preset.country, region: a.region, postcodes: a.postcodes, deliveryFeeAmount: a.deliveryFeeAmount, installSurchargeAmount: a.installSurchargeAmount, branchId: branch.id } }); c.add('serviceAreas') }
    }
    if (!(await tx.stockLocation.findFirst({ where: { name: `${b.name} store` } }))) { await tx.stockLocation.create({ data: { name: `${b.name} store`, type: 'branch', branchId: branch.id } }); c.add('stockLocations') }
  }
  let warehouse = await tx.stockLocation.findFirst({ where: { type: 'warehouse' } })
  if (!warehouse) { warehouse = await tx.stockLocation.create({ data: { name: 'Main warehouse', type: 'warehouse', branchId: branchIds[0] } }); c.add('stockLocations') }

  // Checklists.
  const templateIds: Record<string, string> = {}
  for (const t of CHECKLISTS) {
    let row = await tx.checklistTemplate.findFirst({ where: { kind: t.kind, name: t.name } })
    if (!row) {
      row = await tx.checklistTemplate.create({ data: { kind: t.kind, name: t.name, isActive: true, items: { create: t.items.map((it, i) => ({ prompt: it.prompt, helpText: it.helpText ?? '', inputType: it.inputType ?? 'yes_no', unit: it.unit ?? '', choices: it.choices ?? [], isRequired: it.isRequired ?? true, sortOrder: i })) } } })
      c.add('checklists')
    }
    templateIds[t.kind] = row.id
  }

  // Catalogue.
  const cat = async (s: string, name: string, sortOrder: number) => {
    const row = await tx.productCategory.findUnique({ where: { slug: s } })
    if (row) return row.id
    c.add('categories')
    return (await tx.productCategory.create({ data: { slug: s, name, sortOrder, isPublished: true } })).id
  }
  const catIds: Record<string, string> = {
    systems: await cat('digester-systems', 'Digester systems', 0), stoves: await cat('stoves', 'Stoves', 1), 'gas-line': await cat('gas-line', 'Gas line and fittings', 2), filters: await cat('filters', 'Filters and media', 3), appliances: await cat('appliances', 'Appliances', 4), spares: await cat('spares', 'Spares and repair', 5),
  }
  const upsertProduct = async (sku: string, data: Record<string, unknown>) => {
    const row = await tx.product.findUnique({ where: { sku } })
    if (row) return row
    c.add('products')
    return tx.product.create({ data: { sku, slug: slug(String(data.name)), currencyCode: company.currencyCode, ...data } as never })
  }
  const partIds: Record<string, string> = {}
  for (const p of preset.parts) {
    if (!sells.has('parts') && !['STV-1', 'STV-2', 'FLT-H2S', 'PIPE-M', 'TRAP-W', 'GAU-PRS', 'VLV-GAS', 'HOSE-ST'].includes(p.sku)) continue
    const row = await upsertProduct(p.sku, { name: p.name, type: p.category === 'appliances' || p.category === 'stoves' ? 'appliance' : p.sku === 'FLT-MED' || p.sku === 'TAPE-PT' ? 'consumable' : 'part', description: `${p.name}. Fits all our systems.`, priceAmount: p.price, unitCostAmount: Math.round(p.price * 0.55), taxable: true, isPublished: true, sellOnline: true, warrantyMonths: p.warranty, categoryId: catIds[p.category] })
    partIds[p.sku] = row.id
  }
  const kits = [...preset.kits.filter(k => (k.m3 <= 4 ? sells.has('home') : sells.has('farm'))), ...(sells.has('institution') ? [preset.institutional] : [])]
  const kitIds: string[] = []
  for (const k of kits) {
    const row = await upsertProduct(k.sku, {
      name: k.name, type: 'digester_kit', description: `${k.name}: a ${k.m3} m³ ${k.tech.replace('_', ' ')} digester. About ${k.gas} m³ of gas a day, ${k.hours} hours of cooking, for up to ${k.people} people.`,
      priceAmount: k.price, installFeeAmount: k.install, taxable: true, isPublished: true, isSerialized: true, sellOnline: k.sellOnline, requiresInstallation: true, requiresSurvey: k.requiresSurvey, warrantyMonths: k.reactorWarranty, categoryId: catIds.systems, unitCostAmount: Math.round(k.price * 0.6),
    })
    kitIds.push(row.id)
    if (!(await tx.digesterSpec.findUnique({ where: { productId: row.id } }))) {
      await tx.digesterSpec.create({ data: { productId: row.id, isPublished: true, capacityM3: String(k.m3), technology: k.tech, feedstockTypes: k.cattle ? ['cattle', 'pig', 'poultry', 'kitchen'] : ['kitchen'], minDailyFeedKg: String(k.feedMin), maxDailyFeedKg: String(k.feedMax), dailyGasM3: String(k.gas), cookingHoursPerDay: String(k.hours), servesPeople: k.people, minAnimals: k.cattle ? { cattle: k.cattle, pigs: k.cattle * 3, poultry: k.cattle * 40 } : {}, footprintLengthM: String(Math.round(Math.sqrt(k.m3) * 20) / 10 + 1), footprintWidthM: String(Math.round(Math.sqrt(k.m3) * 10) / 10 + 0.5), waterPerDayL: String(k.feedMin), reactorWarrantyMonths: k.reactorWarranty, partsWarrantyMonths: 12, installHours: String(Math.max(6, k.m3)), surveyKind: k.surveyKind, preInstallTemplateId: templateIds.pre_install, installTemplateId: templateIds.install } })
      // Bill of materials: the kit ships with a stove, filter, trap, valve and 10 m of pipe.
      const bom: [string, number][] = [[k.m3 >= 8 ? 'STV-2' : 'STV-1', 1], ['FLT-H2S', 1], ['TRAP-W', 1], ['VLV-GAS', 1], ['PIPE-M', k.m3 >= 15 ? 30 : 10], ['GAU-PRS', 1]]
      for (const [sku, q] of bom) if (partIds[sku]) await tx.kitComponent.create({ data: { kitId: row.id, componentId: partIds[sku], quantity: q, isPublished: true } })
      await tx.product.update({ where: { id: row.id }, data: { fitsParts: { connect: Object.values(partIds).map(id => ({ id })) } } })
      // The reactor itself is a stock item.
      const reactor = await upsertProduct(`${k.sku}-R`, { name: `${k.name} reactor`, type: 'part', description: 'Reactor body, supplied as part of the kit.', priceAmount: Math.round(k.price * 0.6), taxable: true, isPublished: false, sellOnline: false, isSerialized: false, categoryId: catIds.systems })
      await tx.kitComponent.create({ data: { kitId: row.id, componentId: reactor.id, quantity: 1, isPublished: true } })
      partIds[`${k.sku}-R`] = reactor.id
    }
  }
  // Stock: warehouse and each branch.
  const locations = await tx.stockLocation.findMany({ where: { type: { in: ['warehouse', 'branch'] } } })
  for (const [sku, id] of Object.entries(partIds)) {
    const part = preset.parts.find(p => p.sku === sku)
    const qty = part ? part.stock : 12
    for (const loc of locations) {
      const lvl = await tx.stockLevel.findUnique({ where: { productId_locationId: { productId: id, locationId: loc.id } } })
      if (lvl) continue
      const onHand = loc.type === 'warehouse' ? qty : Math.ceil(qty / 4)
      await tx.stockLevel.create({ data: { productId: id, locationId: loc.id, onHand, reserved: 0, reorderPoint: Math.ceil(onHand / 5) } })
      await tx.stockMovement.create({ data: { type: 'receipt', quantity: onHand, productId: id, locationId: loc.id, refType: 'Onboarding', refId: 'opening', reason: 'Opening stock' } })
      c.add('stockLevels')
    }
  }
  // Serial numbers for kits in the warehouse.
  for (const [i, id] of kitIds.entries()) {
    const have = await tx.serializedUnit.count({ where: { productId: id } })
    const rows = Array.from({ length: Math.max(0, 6 - have) }, (_, k) => ({ serialNumber: `${kits[i].sku}-${String(2600 + have + k + 1).padStart(5, '0')}`, status: 'in_stock', productId: id, locationId: warehouse!.id }))
    if (rows.length) { await tx.serializedUnit.createMany({ data: rows, skipDuplicates: true }); c.add('serials', rows.length) }
  }

  // Plans.
  const plans = answers.instalments === false ? preset.planFromMonthly.slice(0, 1) : preset.planFromMonthly
  for (const [i, p] of plans.entries()) {
    if (await tx.paymentPlanTemplate.findFirst({ where: { name: p.label } })) continue
    await tx.paymentPlanTemplate.create({ data: { name: p.label, kind: p.count ? 'instalments' : 'full', depositPercent: p.depositPercent, instalmentCount: p.count, frequency: 'monthly', planFeePercent: p.feePercent, minOrderAmount: 0, isActive: true, sortOrder: i } })
    c.add('planTemplates')
  }
  if (sells.has('institution') && !(await tx.paymentPlanTemplate.findFirst({ where: { kind: 'milestones' } }))) {
    await tx.paymentPlanTemplate.create({ data: { name: 'Institutional 40 / 40 / 20', kind: 'milestones', depositPercent: '40', instalmentCount: 0, frequency: 'monthly', planFeePercent: '0', milestones: [{ label: 'On order', percent: '40', trigger: 'on_order' }, { label: 'On delivery', percent: '40', trigger: 'on_delivery' }, { label: 'On commissioning', percent: '20', trigger: 'on_commissioning' }], sortOrder: 9 } })
    c.add('planTemplates')
  }
  for (const s of preset.servicePlans) {
    if (await tx.servicePlan.findUnique({ where: { slug: s.slug } })) continue
    await tx.servicePlan.create({ data: { slug: s.slug, name: s.name, description: s.items.join('. ') + '.', priceAmount: s.price, currencyCode: company.currencyCode, billing: 'yearly', visitsPerYear: s.visits, partsDiscountPercent: s.discount, priorityResponse: s.priority, includedItems: s.items, isPublished: true } })
    c.add('servicePlans')
  }
  for (const p of preset.incentives) {
    if (await tx.incentiveProgram.findFirst({ where: { name: p.name } })) continue
    await tx.incentiveProgram.create({ data: { name: p.name, country: preset.country, kind: p.kind, amountType: p.amountType, amountValue: p.amountValue, capacityTable: p.capacityTable ?? [], capAmount: p.capAmount ?? null, treatment: p.treatment, requiredDocuments: p.requiredDocuments, isActive: true, infoUrl: p.infoUrl } })
    c.add('incentives')
  }
  if (!(await tx.commissionRule.findFirst())) { await tx.commissionRule.create({ data: { name: `${preset.commissionPercent}% of order value at commissioning`, type: 'percent_of_order', value: preset.commissionPercent, isActive: true } }); c.add('commissionRules') }
  if (!(await tx.supplier.findFirst())) {
    await tx.supplier.create({ data: { name: 'Prairie Digester Works', contact: 'Order desk', phone: company.phone, email: 'orders@example.com', country: preset.country, leadTimeDays: 21 } })
    await tx.supplier.create({ data: { name: 'Gasline Fittings Co.', contact: 'Sales', phone: company.phone, email: 'sales@example.com', country: preset.country, leadTimeDays: 7 } })
    c.add('suppliers', 2)
  }

  // Content.
  for (const g of GUIDES) {
    if (await tx.troubleshootingGuide.findUnique({ where: { slug: g.slug } })) continue
    await tx.troubleshootingGuide.create({ data: { slug: g.slug, title: g.title, symptomCategory: g.category, steps: [{ type: 'ordered-list', children: g.steps.map(t => ({ type: 'list-item', children: [{ type: 'list-item-content', children: [{ text: t }] }] })) }] as never, stepsText: g.steps.map((t, i) => `${i + 1}. ${t}`).join('\n'), language: 'en', isPublished: true } })
    c.add('guides')
  }
  for (const [i, f] of FAQS.entries()) {
    if (await tx.faq.findFirst({ where: { question: f.question } })) continue
    await tx.faq.create({ data: { ...f, sortOrder: i, isPublished: true } })
    c.add('faqs')
  }
  for (const s of STORIES) {
    if (await tx.story.findUnique({ where: { slug: s.slug } })) continue
    await tx.story.create({ data: { ...s, isPublished: true } })
    c.add('stories')
  }
  for (const k of kits) {
    const title = `${k.name} owner's manual`
    if (await tx.resource.findFirst({ where: { title } })) continue
    const product = await tx.product.findUnique({ where: { sku: k.sku } })
    await tx.resource.create({ data: { title, kind: 'manual', url: `/manuals/${slug(k.name)}`, language: 'en', isPublished: true, products: product ? { connect: [{ id: product.id }] } : undefined } })
    c.add('manuals')
  }

  // Roles and staff.
  const roleIds: Record<string, string> = {}
  for (const r of ROLES) {
    const perms = r.name === 'Owner' ? Object.fromEntries(permissionNames.map(n => [n, true])) : Object.fromEntries(permissionNames.map(n => [n, Boolean(r.perms[n])]))
    const row = await tx.role.findUnique({ where: { name: r.name } })
    roleIds[r.name] = row ? row.id : (await tx.role.create({ data: { name: r.name, discountLimitPercent: r.discount, ...perms } })).id
    if (!row) c.add('roles')
  }
  const people = preset.people
  const staffDomain = company.email.split('@')[1] ?? 'example.com'
  // One shared first password, shown once to the owner in the dialog result; staff change it on sign-in.
  const staffPassword = `${slug(company.name).split('-')[0]}-${randomToken(6)}`
  let staffCreated = 0
  for (const [i, s] of STAFF.entries()) {
    const first = people.first[(i * 3) % people.first.length]
    const last = people.last[(i * 5 + 2) % people.last.length]
    const email = prefixedEmail(first, last, staffDomain)
    if (await tx.user.findUnique({ where: { email } })) continue
    const user = await tx.user.create({ data: { name: `${first} ${last}`, email, phone: `${people.phonePrefix}${String(1000 + i).slice(-4)}`, password: await bcrypt.hash(staffPassword, 10), roleId: roleIds[s.role], branchId: branchIds[i % branchIds.length], onboardingStatus: 'completed' } })
    staffCreated += 1
    if (s.role === 'Technician') await tx.stockLocation.create({ data: { name: `${first}'s van`, type: 'van', technicianId: user.id, branchId: branchIds[i % branchIds.length] } })
  }
  if (staffCreated) c.add('staff', staffCreated)

  auditChange(uow, actor, 'CompanySettings', '1', 'onboarding.reference', { country: preset.country, created: c.created })
  return { created: c.created, staffPassword: staffCreated ? staffPassword : null }
}

export type SeedContext = { preset: Preset; tx: Tx }
export { publicCode, nextNumber }
