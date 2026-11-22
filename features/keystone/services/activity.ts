import type { Db } from '../lib/db'
import { runInTransaction, type UnitOfWork } from '../lib/unitOfWork'
import { systemActor, type Actor } from '../lib/actor'
import { addDays } from '../lib/time'
import { PRESETS, type CountryCode } from '../../platform/onboarding/lib/presets'
import { createLeadCore, logContact, transitionLead } from './leads'
import { saveQuoteDraft, sendQuote, acceptQuote } from './quotes'
import { scheduleVisit, checkInVisit, completeVisit } from './visits'
import { openSlots } from './scheduling'
import { commissionSystem, setPrepTask, transitionInstallation, recordReading } from './systems'
import { submitOffline, verifyOffline } from './payments'
import { fulfilOrder } from './orders'
import { openTicket, transitionTicket } from './tickets'
import { installmentSession } from './backoffice'
import { getSettings } from './settings'
import { publicCode } from '../lib/sequence'
import bcrypt from 'bcryptjs'

/**
 * The first month of work (section 9), made by the same services staff and customers use, so every
 * record has its audit trail and every number adds up. It runs once: only when there are no leads yet.
 * Each step is its own transaction, so a long seed never holds locks for long.
 */
const ACT: Actor = systemActor('onboarding')

export async function seedActivity(db: Db, country: CountryCode) {
  if ((await db.lead.count()) > 0) return { created: {}, customerLogin: null as null | { email: string; password: string } }
  const preset = PRESETS[country]
  const p = preset.people
  const step = <T>(work: (uow: UnitOfWork) => Promise<T>) => runInTransaction(db, work).then(r => r.value)
  const created: Record<string, number> = {}
  const add = (k: string, n = 1) => (created[k] = (created[k] ?? 0) + n)
  const settings = await getSettings(db as never)
  const kits = await db.product.findMany({ where: { type: 'digester_kit' }, orderBy: { priceAmount: 'asc' }, include: { digesterSpec: true } })
  const templates = await db.paymentPlanTemplate.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } })
  const instalmentTemplates = templates.filter(t => t.kind === 'instalments').map(t => t.id)
  const fullTemplate = templates.find(t => t.kind === 'full')?.id
  const stove = await db.product.findUnique({ where: { sku: 'STV-2' } })
  const incentive = await db.incentiveProgram.findFirst({ where: { isActive: true, treatment: 'off_price_now' } })

  // 14 leads across the towns.
  const leads: { id: string; customerId: string; i: number }[] = []
  for (let i = 0; i < 14; i++) {
    const first = p.first[(i + 1) % p.first.length]
    const last = p.last[(i * 7 + 3) % p.last.length]
    const town = p.towns[i % p.towns.length]
    const postcode = p.postcodes[i % p.postcodes.length]
    const cattle = [2, 4, 8, 1, 3, 6, 12, 2, 5, 3, 1, 4, 10, 2][i]
    const out = await step(uow => createLeadCore(uow, ACT, {
      contact: { name: `${first} ${last}`, phone: `${p.phonePrefix}${String(2000 + i * 37).slice(-4)}`, email: `${first}.${last}${i}@${p.emailDomain}`.toLowerCase(), type: i === 6 ? 'institution' : cattle >= 6 ? 'farm' : 'household', organisationName: i === 6 ? `${town} Secondary School` : '', contactConsent: true },
      site: { addressLine: `${120 + i * 11} ${['Ranch Rd', 'County Rd', 'Mill St', 'Oak Ln'][i % 4]}`, city: town, region: p.region, country: preset.country, postcode, siteType: i === 6 ? 'school' : cattle >= 6 ? 'farm' : 'home', animals: { cattle, pigs: i % 3, poultry: (i % 4) * 10 }, peopleServed: i === 6 ? 300 : 4 + (i % 5), monthlyFuelSpendAmount: Math.round(kits[0].priceAmount / 20) },
      source: (['website', 'phone', 'field_agent', 'website', 'referral', 'walk_in', 'event', 'website', 'dealer', 'phone', 'website', 'website', 'field_agent', 'phone'] as const)[i],
      interest: i === 6 ? 'institution' : cattle >= 6 ? 'farm' : 'home',
      message: i % 3 === 0 ? 'We would like to stop buying cooking fuel.' : '',
    }))
    leads.push({ id: out.lead.id, customerId: out.customer.id, i })
  }
  add('leads', 14)
  // Lost and unqualified, and contacted.
  await step(uow => transitionLead(uow, ACT, { leadId: leads[12].id, to: 'lost', reason: 'Chose LPG for now' }))
  await step(uow => transitionLead(uow, ACT, { leadId: leads[13].id, to: 'unqualified', reason: 'No animals and no kitchen waste' }))
  for (const l of leads.slice(0, 11)) await step(uow => logContact(uow, ACT, { channel: 'call', purpose: 'follow_up', note: 'First call: interested, explained the survey.', relatedType: 'Lead', relatedId: l.id }))
  add('contacts', 11)

  // Survey visits for leads 0-4, completed for 0-3 (5 surveys).
  const today = new Date().toISOString().slice(0, 10)
  const slots = await openSlots(db as never, { from: today, days: 14 })
  const surveyVisits: string[] = []
  for (let k = 0; k < 5 && k < slots.length; k++) {
    const slot = slots[k * 2] ?? slots[k]
    const v = await step(uow => scheduleVisit(uow, ACT, { type: 'survey', date: slot.date, slotIndex: slot.slotIndex, technicianIds: [slot.technicianIds[0]], leadId: leads[k].id }))
    surveyVisits.push(v.id)
  }
  add('surveyVisits', surveyVisits.length)
  const recommended = (k: number) => kits[Math.min(kits.length - 1, [0, 1, 2, 0, 1, 3][k] ?? 0)]
  for (let k = 0; k < 4 && k < surveyVisits.length; k++) {
    await step(uow => checkInVisit(uow, ACT, { visitId: surveyVisits[k] }))
    const template = await db.checklistTemplate.findFirst({ where: { kind: 'survey_farm' }, include: { items: true } })
    const answers = (template?.items ?? []).filter(i => i.isRequired).map(i => ({ itemId: i.id, value: i.inputType === 'number' ? 4 : i.inputType === 'yes_no' ? true : i.inputType === 'choice' ? 'Loam' : 'Family' }))
    await step(uow => completeVisit(uow, ACT, { visitId: surveyVisits[k], answers, notes: 'Good site, water close by.', survey: { feasibility: k === 2 ? 'feasible_with_work' : 'feasible', waterOk: true, spaceOk: true, soilType: 'Loam', floodRisk: 'None', pipeRunM: String(12 + k * 4), pumpNeeded: false, extraWork: k === 2 ? ['Long pipe run'] : [], recommendedProductId: recommended(k).id } }))
  }

  // 6 quotes: leads 0-5. Two options each; instalment offers.
  const quoteIds: string[] = []
  for (let k = 0; k < 6; k++) {
    const kit = recommended(k)
    const bigger = kits[Math.min(kits.length - 1, kits.indexOf(kit) + 1)]
    const options = [
      { label: kit.name, isRecommended: true, lines: [{ kind: 'product', productId: kit.id, quantity: 1 }, ...(incentive && k % 2 === 0 ? [{ kind: 'incentive', incentiveProgramId: incentive.id }] : [])], planTemplateIds: [fullTemplate, ...instalmentTemplates].filter(Boolean) as string[] },
      { label: `${bigger.name} with double stove`, lines: [{ kind: 'product', productId: bigger.id, quantity: 1 }, ...(stove ? [{ kind: 'product', productId: stove.id, quantity: 1 }] : [])], planTemplateIds: [fullTemplate, ...instalmentTemplates].filter(Boolean) as string[] },
    ]
    const q = await step(uow => saveQuoteDraft(uow, ACT, { leadId: leads[k].id, kind: 'sale', options, terms: 'Price includes delivery within our service area, installation and commissioning. Warranty as listed per item.' }))
    await step(uow => sendQuote(uow, ACT, { quoteId: q!.id }))
    quoteIds.push(q!.id)
  }
  add('quotes', quoteIds.length)

  // 5 quote orders: accept quotes 0,1,2,3 (with deposits paid) and leave 4 and 5 awaiting acceptance.
  const orders: { id: string; sessionCode: string | null }[] = []
  for (let k = 0; k < 4; k++) {
    const q = await db.quote.findUnique({ where: { id: quoteIds[k] }, include: { options: { include: { planOffers: true }, orderBy: { sortOrder: 'asc' } } } })
    const option = q!.options[0]
    const offer = option.planOffers.find(o => (o.instalmentCount ?? 0) === 8) ?? option.planOffers.find(o => (o.instalmentCount ?? 0) > 0) ?? option.planOffers[0]
    const r = await step(uow => acceptQuote(uow, { kind: 'guest', key: `quote:${q!.publicCode}` }, { code: q!.publicCode!, optionId: option.id, planOfferId: offer?.id ?? null, signedName: (q as any).signedName || 'Signed in person', ip: 'onboarding' })) as any
    orders.push({ id: r.orderId, sessionCode: r.sessionCode })
  }
  // Deposits: three verified by bank reference, one waiting for verification (mobile money).
  for (let k = 0; k < orders.length; k++) {
    const s = orders[k].sessionCode ? await db.paymentSession.findUnique({ where: { publicCode: orders[k].sessionCode! } }) : null
    if (!s) continue
    const code = k === 3 ? 'mobile_money' : 'bank_transfer'
    const sub = await step(uow => submitOffline(uow, { kind: 'guest', key: `session:${s.publicCode}` }, { sessionId: s.id, code, reference: `${code === 'mobile_money' ? 'MM' : 'BT'}${String(904211 + k * 7919)}` }))
    if (k < 3) await step(uow => verifyOffline(uow, ACT, sub.paymentId))
  }
  add('orders', orders.length)
  add('paymentsVerified', 3)
  add('paymentsToVerify', 1)

  // Installations for orders 0-2: 0 commissioned, 1 ready (prep ticked), 2 awaiting prep.
  const installs = await db.installation.findMany({ where: { orderId: { in: orders.slice(0, 3).map(o => o.id) } }, include: { prepTasks: true } })
  const byOrder = new Map(installs.map(i => [i.orderId, i]))
  for (const k of [0, 1]) {
    const inst = byOrder.get(orders[k].id)
    if (!inst) continue
    for (const t of inst.prepTasks) await step(uow => setPrepTask(uow, ACT, { taskId: t.id, status: 'done', by: 'staff', note: 'Confirmed by phone' }))
  }
  // Order 0: pick, install and commission now.
  const o0 = byOrder.get(orders[0].id)
  if (o0) {
    const serial = await db.serializedUnit.findFirst({ where: { productId: o0.productId ?? undefined, status: 'in_stock' } })
    await step(uow => fulfilOrder(uow, ACT, { orderId: orders[0].id, step: 'pick', serialNumbers: serial ? [serial.serialNumber] : [] }))
    await step(uow => fulfilOrder(uow, ACT, { orderId: orders[0].id, step: 'pack' }))
    await step(uow => fulfilOrder(uow, ACT, { orderId: orders[0].id, step: 'out_for_install' }))
    const slot = (await openSlots(db as never, { from: today, days: 14 }))[0]
    const v = await step(uow => scheduleVisit(uow, ACT, { type: 'install', date: slot.date, slotIndex: slot.slotIndex, technicianIds: [slot.technicianIds[0]], installationId: o0.id }))
    await step(uow => checkInVisit(uow, ACT, { visitId: v.id }))
    const commissioning = await db.checklistTemplate.findFirst({ where: { kind: 'commissioning' }, include: { items: true } })
    await step(uow => commissionSystem(uow, ACT, {
      visitId: v.id, signedName: 'Customer', signature: `data:image/png;base64,${Buffer.from('signature captured on the technician phone').toString('base64')}`,
      training: [{ traineeName: 'Household head', relationToOwner: 'Owner', topics: ['Daily feeding', 'Lighting the stove', 'Draining the water trap', 'What to do if you smell gas'], language: 'en' }],
      answers: (commissioning?.items ?? []).map(i => ({ itemId: i.id, value: i.inputType === 'number' ? 1.2 : true })), reading: { working: true, pressureKpa: '1.2', cookingHours: '3' },
    }))
    add('commissionedSystems')
  }
  // Order 1: ready to schedule; order 2 awaiting prep. Order 3 is pending payment (reference to verify).
  if (byOrder.get(orders[1].id)) add('installationsReady')

  // Three more commissioned systems from earlier in the year (customers who bought before this month).
  const systems: string[] = []
  const firstSys = await db.installedSystem.findFirst({ orderBy: { createdAt: 'asc' } })
  if (firstSys) systems.push(firstSys.id)
  for (let k = 0; k < 3; k++) {
    const l = leads[7 + k]
    const kit = kits[k % kits.length]
    const months = [3, 7, 11][k]
    const at = addDays(new Date(), -months * 30)
    const sys = await step(async uow => {
      const site = await uow.tx.site.findFirst({ where: { customerId: l.customerId } })
      const s = await uow.tx.installedSystem.create({ data: { number: `SYS-${String(9000 + k).padStart(6, '0')}`, publicCode: publicCode('S'), status: k === 2 ? 'underperforming' : 'active', installedAt: at, commissionedAt: at, lastCheckedAt: addDays(at, 30), lastCheckResult: k === 2 ? 'underperforming' : 'active', customerId: l.customerId, siteId: site?.id ?? null, productId: kit.id } })
      for (const [component, m] of [['reactor', kit.digesterSpec?.reactorWarrantyMonths ?? 60], ['gas_line', 12], ['appliances', 12], ['workmanship', 12]] as [string, number][]) await uow.tx.warrantyCoverage.create({ data: { component, startsAt: at, endsAt: addDays(at, m * 30), terms: `${m} months from commissioning`, systemId: s.id } })
      for (const d of settings.followUpScheduleDays) {
        const due = addDays(at, d)
        await uow.tx.visit.create({ data: { number: `V-H${k}${d}`, type: 'follow_up', status: due < new Date() && d < 90 ? 'completed' : 'requested', dueAt: due, publicCode: publicCode('V'), customerId: l.customerId, siteId: site?.id ?? null, systemId: s.id, notes: d <= 7 ? 'Check-up call' : `Day ${d} check` } })
      }
      await uow.tx.trainingRecord.create({ data: { traineeName: 'Household head', relationToOwner: 'Owner', topics: ['Daily feeding', 'Lighting the stove'], language: 'en', at, systemId: s.id } })
      return s
    })
    systems.push(sys.id)
    await step(uow => recordReading(uow, ACT, { systemId: sys.id, source: 'call', working: true, cookingHours: k === 2 ? '0.5' : '3', pressureKpa: k === 2 ? '0.4' : '1.1', problem: k === 2 ? 'Weak flame in the evenings' : '' }))
  }
  add('commissionedSystems', 3)

  // Tickets: one in warranty (open), one awaiting approval of a paid repair, one resolved.
  const sysRows = await db.installedSystem.findMany({ where: { id: { in: systems } } })
  if (sysRows.length >= 3) {
    await step(uow => openTicket(uow, ACT, { systemId: sysRows[1].id, channel: 'phone', category: 'low_pressure', description: 'Flame is weak in the evening.', callbackPhone: '' }))
    const t2 = await step(uow => openTicket(uow, ACT, { systemId: sysRows[2].id, channel: 'portal', category: 'stove_fault', description: 'The stove valve is cracked after it was dropped.' }))
    await step(uow => transitionTicket(uow, ACT, { ticketId: t2.id, action: 'triage' }))
    await step(uow => transitionTicket(uow, ACT, { ticketId: t2.id, action: 'warranty', warrantyDecision: 'not_covered', reason: 'Accidental damage' }))
    const valve = await db.product.findUnique({ where: { sku: 'STV-1' } })
    const sq = await step(uow => saveQuoteDraft(uow, ACT, { ticketId: t2.id, kind: 'service', options: [{ label: 'Replace stove', lines: [...(valve ? [{ kind: 'product', productId: valve.id, quantity: 1 }] : []), { kind: 'labour', description: 'Service call and fitting', unitAmount: Math.round(kits[0].priceAmount / 20), quantity: 1 }] }] }))
    await step(uow => sendQuote(uow, ACT, { quoteId: sq!.id }))
    const t3 = await step(uow => openTicket(uow, ACT, { systemId: sysRows[3]?.id ?? sysRows[0].id, channel: 'phone', category: 'no_gas', description: 'No gas this morning.' }))
    await step(uow => transitionTicket(uow, ACT, { ticketId: t3.id, action: 'warranty', warrantyDecision: 'covered', reason: 'Inside reactor warranty' }))
    await step(uow => transitionTicket(uow, ACT, { ticketId: t3.id, action: 'phone_resolved', reason: 'Water trap was full; drained it with the customer on the phone.', customerConfirmed: true }))
    add('tickets', 3)
  }

  // Payment plans: backdate order 1's plan so one instalment is overdue and one is due this week.
  const plans = await db.paymentPlan.findMany({ where: { order: { id: { in: orders.slice(0, 3).map(o => o.id) } } }, include: { installments: { orderBy: { sequence: 'asc' } } } })
  if (plans[1]) {
    const rows = plans[1].installments.filter(r => r.sequence > 0)
    if (rows[0]) await db.installment.update({ where: { id: rows[0].id }, data: { dueDate: addDays(new Date(), -12), status: 'due' } })
    if (rows[1]) await db.installment.update({ where: { id: rows[1].id }, data: { dueDate: addDays(new Date(), 4) } })
    for (const [n, r] of rows.slice(2).entries()) await db.installment.update({ where: { id: r.id }, data: { dueDate: addDays(new Date(), 34 + n * 30) } })
  }
  if (plans[0]) {
    const rows = plans[0].installments.filter(r => r.sequence > 0)
    if (rows[0]) await db.installment.update({ where: { id: rows[0].id }, data: { dueDate: addDays(new Date(), 2) } })
  }
  add('activePlans', plans.length)

  // A pending instalment link for the overdue one, so the to-remind queue has a pay link.
  if (plans[1]) await step(uow => installmentSession(uow, ACT, { planId: plans[1].id }))

  // Incentive application submitted on order 0 (if one was opened).
  const app = await db.incentiveApplication.findFirst({ where: { status: 'draft' } })
  if (app) {
    await db.incentiveApplication.update({ where: { id: app.id }, data: { status: 'submitted', submittedAt: new Date(), reference: 'APP-2026-0417', version: { increment: 1 } } })
    add('incentiveApplications')
  }
  // One referral qualified: lead 4 was referred by the customer of system 1.
  const referrer = sysRows[1] ? await db.customer.findUnique({ where: { id: sysRows[1].customerId! } }) : null
  if (referrer) {
    const r = await db.referral.create({ data: { code: referrer.referralCode ?? 'R', status: 'qualified', qualifiedAt: new Date(), referrerId: referrer.id, currencyCode: settings.currencyCode, rewardAmount: settings.referralRewardAmount } })
    await db.lead.update({ where: { id: leads[4].id }, data: { referralId: r.id } })
    add('referrals')
  }

  // One customer login that shows a system, a plan, a ticket and a quote: the customer of order 0.
  const o0row = await db.order.findUnique({ where: { id: orders[0].id } })
  let customerLogin: { email: string; password: string } | null = null
  if (o0row?.customerId) {
    const cu = await db.customer.findUnique({ where: { id: o0row.customerId } })
    if (cu && !cu.userId) {
      const password = `${cu.name.split(' ')[0].toLowerCase()}-${Math.random().toString(36).slice(2, 8)}`
      await db.user.create({ data: { name: cu.name, email: cu.email, phone: cu.phone, password: await bcrypt.hash(password, 10), customer: { connect: { id: cu.id } }, onboardingStatus: 'completed' } })
      // Their system has a ticket and a newer quote (a water heater) awaiting their answer.
      const sys = await db.installedSystem.findFirst({ where: { customerId: cu.id } })
      if (sys) await step(uow => openTicket(uow, ACT, { systemId: sys.id, channel: 'portal', category: 'other', description: 'How often should I replace the filter media?' }))
      const heater = await db.product.findUnique({ where: { sku: 'HTR-W' } })
      if (heater) {
        const q = await step(uow => saveQuoteDraft(uow, ACT, { customerId: cu.id, kind: 'sale', options: [{ label: 'Biogas water heater', lines: [{ kind: 'product', productId: heater.id, quantity: 1 }, { kind: 'labour', description: 'Fitting', unitAmount: Math.round(heater.priceAmount / 4), quantity: 1 }], planTemplateIds: fullTemplate ? [fullTemplate] : [] }] }))
        await step(uow => sendQuote(uow, ACT, { quoteId: q!.id }))
      }
      customerLogin = { email: cu.email, password }
      add('customerLogins')
    }
  }
  return { created, customerLogin }
}
