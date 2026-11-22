/**
 * The main action of dissertation section 10, end to end over the public GraphQL endpoint, as the
 * people who really do each step: a visitor, the sales agent, the dispatcher, a technician, finance and
 * the customer (signed in after registering with their order code). Nothing is written to the database
 * directly. It is run against a deployment that has been through onboarding:
 *
 *   BIOGAS_URL=https://<site> BIOGAS_STAFF_PASSWORD=<first staff password> npx tsx scripts/main-action.ts
 *
 * Optional: BIOGAS_STAFF_DOMAIN (default juniperbiogas.com). Card payment runs when the site has Stripe
 * keys (it confirms with Stripe's test card 4242 through Stripe's API using STRIPE_SECRET_KEY, the
 * same keys the site uses); without keys the reference path is the payment path, as on the live site.
 * Each run creates new records with fresh idempotency keys and prints their numbers and codes.
 */
import { randomUUID } from 'node:crypto'

const BASE = (process.env.BIOGAS_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const PASSWORD = process.env.BIOGAS_STAFF_PASSWORD ?? ''
const DOMAIN = process.env.BIOGAS_STAFF_DOMAIN ?? 'juniperbiogas.com'
if (!PASSWORD) throw new Error('Set BIOGAS_STAFF_PASSWORD to the first staff password printed by onboarding.')

const key = (what: string) => `${what}:${randomUUID()}`
const report: { step: string; detail: string }[] = []
const note = (step: string, detail: string) => { report.push({ step, detail }); console.log(`✓ ${step}: ${detail}`) }

class Client {
  cookie = ''
  headers: Record<string, string> = {}
  constructor(public who: string) {}
  async gql<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(`${BASE}/api/graphql`, { method: 'POST', headers: { 'content-type': 'application/json', ...(this.cookie ? { cookie: this.cookie } : {}), ...this.headers }, body: JSON.stringify({ query, variables }) })
    const set = res.headers.getSetCookie?.() ?? []
    for (const c of set) {
      const [pair] = c.split(';')
      const name = pair.split('=')[0]
      const rest = this.cookie.split('; ').filter(x => x && !x.startsWith(`${name}=`))
      this.cookie = [...rest, pair].join('; ')
    }
    const body: any = await res.json().catch(() => ({ errors: [{ message: `HTTP ${res.status}` }] }))
    if (body.errors?.length) throw new Error(`${this.who}: ${body.errors.map((e: any) => `${e.message} [${e.extensions?.code ?? ''}]`).join('; ')}`)
    return body.data as T
  }
  async signIn(email: string, password: string) {
    const d = await this.gql(`mutation($e: String!, $p: String!) { authenticateUserWithPassword(email: $e, password: $p) { ... on UserAuthenticationWithPasswordSuccess { item { id } } ... on UserAuthenticationWithPasswordFailure { message } } }`, { e: email, p: password })
    const r = d.authenticateUserWithPassword
    if (!r?.item) throw new Error(`${this.who}: sign-in failed for ${email}: ${r?.message ?? ''}`)
    return r.item.id as string
  }
}

const one = async <T>(c: Client, field: string, query: string, vars: Record<string, unknown> = {}) => (await c.gql<Record<string, T>>(query, vars))[field]

async function main() {
  const visitor = new Client('visitor')
  const sales = new Client('sales agent')
  const dispatcher = new Client('dispatcher')
  const finance = new Client('finance')
  const care = new Client('customer care')
  const tech = new Client('technician')
  const salesId = await sales.signIn(`grace.alvarez@${DOMAIN}`, PASSWORD)
  await dispatcher.signIn(`tom.brooks@${DOMAIN}`, PASSWORD)
  await finance.signIn(`ben.carter@${DOMAIN}`, PASSWORD)
  await care.signIn(`david.whitfield@${DOMAIN}`, PASSWORD)
  const techId = await tech.signIn(`hannah.lindqvist@${DOMAIN}`, PASSWORD)
  const info: any = await one(visitor, 'storefrontInfo', `{ storefrontInfo }`)
  const card = Boolean(info.cardPayments) && Boolean(process.env.STRIPE_SECRET_KEY)
  const stamp = Date.now().toString(36).slice(-5)

  // 1. Visitor: size, ask for a quote, book a survey.
  const sized: any = await one(visitor, 'sizeSystem', `mutation($i: JSON!) { sizeSystem(input: $i) }`, { i: { cattle: 3, people: 5, monthlyFuelSpendAmount: 6500, interest: 'home' } })
  note('1a size a system', `${sized.estimatedGasM3} m³ a day, recommends ${sized.recommended?.name ?? 'nothing'}`)
  const slots: any = await one(visitor, 'availableVisitSlots', `query($p: String) { availableVisitSlots(days: 14, postcode: $p, region: "Texas", country: "US") }`, { p: '78610' })
  const slot = slots.slots.find((s: any) => s.free > 0)
  if (!slot) throw new Error('No free survey slot in the next 14 days.')
  const email = `main.action.${stamp}@example.net`
  const asked: any = await one(visitor, 'submitQuoteRequest', `mutation($i: JSON!, $k: String!) { submitQuoteRequest(input: $i, idempotencyKey: $k) }`, {
    k: key('quote-request'),
    i: { name: `Rosa Main ${stamp}`, email, phone: '+15125550188', customerType: 'household', interest: 'home', addressLine: '410 Ranch Rd', city: 'Buda', region: 'Texas', country: 'US', postcode: '78610', siteType: 'home', animals: { cattle: 3 }, peopleServed: 5, monthlyFuelSpendAmount: 6500, assessmentId: sized.assessmentId, contactConsent: true, survey: { date: slot.date, slotIndex: slot.slotIndex } },
  })
  if (!asked.survey?.visitCode) throw new Error('The survey was not booked.')
  note('1b ask for a quote and book a survey', `lead ${asked.leadNumber}, survey /visit/${asked.survey.visitCode} on ${slot.date}`)

  // 2. Staff: complete the survey, send a quote with two options and an instalment plan.
  const leadRow: any = (await sales.gql(`query($n: String!) { leads(where: { number: { equals: $n } }) { id version customer { id } } }`, { n: asked.leadNumber })).leads[0]
  const visitRow: any = (await dispatcher.gql(`query($c: String!) { visits(where: { publicCode: { equals: $c } }) { id version technicians { id } } }`, { c: asked.survey.visitCode })).visits[0]
  await dispatcher.gql(`mutation($v: ID!, $t: [ID!]!, $k: String!) { assignVisit(visitId: $v, technicianIds: $t, idempotencyKey: $k) }`, { v: visitRow.id, t: [techId], k: key('assign-survey') })
  await tech.gql(`mutation($v: ID!, $k: String!) { checkInVisit(visitId: $v, lat: "30.0852", lng: "-97.8403", idempotencyKey: $k) }`, { v: visitRow.id, k: key('checkin-survey') })
  const surveyItems: any[] = (await tech.gql(`{ checklistTemplates(where: { kind: { equals: "survey_farm" } }) { items { id inputType isRequired } } }`)).checklistTemplates[0]?.items ?? []
  const answer = (i: any) => ({ itemId: i.id, value: i.inputType === 'number' ? 4 : i.inputType === 'yes_no' ? true : i.inputType === 'choice' ? 'Loam' : 'Family of five' })
  const kits: any[] = (await sales.gql(`{ products(where: { type: { equals: "digester_kit" } }, orderBy: { priceAmount: asc }) { id name priceAmount } }`)).products
  await tech.gql(`mutation($i: JSON!, $k: String!) { completeVisit(input: $i, idempotencyKey: $k) }`, { k: key('complete-survey'), i: { visitId: visitRow.id, answers: surveyItems.filter(i => i.isRequired).map(answer), notes: 'Level ground, water close by.', survey: { feasibility: 'feasible', waterOk: true, spaceOk: true, soilType: 'Loam', floodRisk: 'None', pipeRunM: '14', pumpNeeded: false, extraWork: [], recommendedProductId: kits[0].id } } })
  note('2a survey completed', `visit ${asked.survey.visitCode} by the technician`)
  const templates: any[] = (await sales.gql(`{ paymentPlanTemplates(where: { isActive: { equals: true } }) { id kind instalmentCount } }`)).paymentPlanTemplates
  const planIds = templates.filter(t => t.kind === 'full' || t.kind === 'instalments').map(t => t.id)
  const stove: any = (await sales.gql(`{ products(where: { sku: { equals: "STV-2" } }) { id } }`)).products[0]
  const draft: any = await one(sales, 'saveQuoteDraft', `mutation($i: JSON!, $k: String!) { saveQuoteDraft(input: $i, idempotencyKey: $k) }`, {
    k: key('quote-draft'),
    i: { leadId: leadRow.id, kind: 'sale', terms: 'Includes delivery, installation and commissioning.', options: [
      { label: kits[0].name, isRecommended: true, lines: [{ kind: 'product', productId: kits[0].id, quantity: 1 }], planTemplateIds: planIds },
      { label: `${kits[1].name} with double stove`, lines: [{ kind: 'product', productId: kits[1].id, quantity: 1 }, ...(stove ? [{ kind: 'product', productId: stove.id, quantity: 1 }] : [])], planTemplateIds: planIds },
    ] },
  })
  const sent: any = await one(sales, 'sendQuote', `mutation($q: ID!, $k: String!) { sendQuote(quoteId: $q, idempotencyKey: $k) }`, { q: draft.id, k: key('send-quote') })
  const quoteCode = sent.publicCode ?? sent.code ?? (await sales.gql(`query($id: ID!) { quote(where: { id: $id }) { publicCode number } }`, { id: draft.id })).quote.publicCode
  const quoteNumber = (await sales.gql(`query($id: ID!) { quote(where: { id: $id }) { number } }`, { id: draft.id })).quote.number
  note('2b quote sent', `${quoteNumber}, two options with plans, /quote/${quoteCode}`)

  // 3. Customer: open the quote, pick an option and an instalment plan, sign, pay the deposit.
  const q: any = await one(visitor, 'getQuoteByCode', `query($c: String!) { getQuoteByCode(code: $c) }`, { c: quoteCode })
  const option = q.options.find((o: any) => o.isRecommended) ?? q.options[0]
  const offer = option.planOffers.find((p: any) => p.instalmentCount === 8) ?? option.planOffers.find((p: any) => p.instalmentCount > 0)
  const accepted: any = await one(visitor, 'acceptQuote', `mutation($c: String!, $o: ID!, $p: ID, $s: String!, $k: String!) { acceptQuote(code: $c, optionId: $o, planOfferId: $p, signedName: $s, idempotencyKey: $k) }`, { c: quoteCode, o: option.id, p: offer?.id ?? null, s: `Rosa Main ${stamp}`, k: key('accept') })
  note('3a quote accepted and signed', `order ${accepted.orderNumber} /order/${accepted.orderCode}, ${offer?.label ?? 'paid in full'}`)
  let depositPaidBy = ''
  if (card) {
    const started: any = await one(visitor, 'initiatePaymentSession', `mutation($c: String!) { initiatePaymentSession(code: $c, provider: "stripe", email: "${email}") }`, { c: accepted.sessionCode })
    const pi = String(started.clientSecret).split('_secret_')[0]
    const r = await fetch(`https://api.stripe.com/v1/payment_intents/${pi}/confirm`, { method: 'POST', headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' }, body: 'payment_method=pm_card_visa&return_url=' + encodeURIComponent(`${BASE}/pay/${accepted.sessionCode}`) })
    if (!r.ok) throw new Error(`Stripe confirm failed: HTTP ${r.status}`)
    const done: any = await one(visitor, 'completePaymentSession', `mutation($c: String!) { completePaymentSession(code: $c) }`, { c: accepted.sessionCode })
    if (done.status !== 'captured') throw new Error(`Card deposit reads ${done.status}`)
    depositPaidBy = 'card 4242'
  } else {
    const ref = `BT${Date.now().toString().slice(-8)}`
    const sub: any = await one(visitor, 'submitOfflinePayment', `mutation($c: String!, $r: String!, $k: String!) { submitOfflinePayment(code: $c, provider: "bank_transfer", reference: $r, idempotencyKey: $k) }`, { c: accepted.sessionCode, r: ref, k: key('deposit-ref') })
    await finance.gql(`mutation($p: ID!, $k: String!) { verifyOfflinePayment(paymentId: $p, idempotencyKey: $k) }`, { p: sub.paymentId, k: key('verify-deposit') })
    depositPaidBy = `bank reference ${ref}, verified by finance`
  }
  const afterDeposit: any = await one(visitor, 'getOrderByCode', `query($c: String!) { getOrderByCode(code: $c) }`, { c: accepted.orderCode })
  if (afterDeposit.status !== 'confirmed') throw new Error(`Order reads ${afterDeposit.status} after the deposit`)
  note('3b deposit paid', `${accepted.amount} ${accepted.currencyCode} minor units by ${depositPaidBy}; order confirmed`)

  // The customer registers with their order code and signs in.
  const customer = new Client('customer')
  const custPassword = `main-${randomUUID().slice(0, 12)}`
  await customer.gql(`mutation($i: JSON!) { registerCustomer(input: $i) }`, { i: { name: `Rosa Main ${stamp}`, email, password: custPassword, code: accepted.orderCode, idempotencyKey: key('register') } })
  await customer.signIn(email, custPassword)
  // The order pages (S15 by code, S21 in the account) render every order the customer has.
  const listed: any = await one(customer, 'myOrders', `{ myOrders }`)
  if (!listed.orders.some((o: any) => o.publicCode === accepted.orderCode)) throw new Error('The new order is missing from myOrders.')
  for (const o of listed.orders) {
    const byId: any = await one(customer, 'myOrder', `query($id: ID!) { myOrder(id: $id) }`, { id: o.id })
    const byCode: any = await one(visitor, 'getOrderByCode', `query($c: String!) { getOrderByCode(code: $c) }`, { c: o.publicCode })
    if (!byId?.lines?.length || byCode?.number !== o.number) throw new Error(`Order ${o.number} does not render by id and by code.`)
  }
  note('3c order pages', `${listed.orders.length} order(s) render by id (myOrder) and by code (getOrderByCode)`)

  // 4. Staff: site prep, schedule and complete the install, commission with training and signature.
  const order: any = await one(customer, 'myOrder', `query($id: ID!) { myOrder(id: $id) }`, { id: afterDeposit.id })
  const inst = order.installation
  if (!inst) throw new Error('The order has no installation.')
  const instRow: any = (await dispatcher.gql(`query($n: String!) { installations(where: { number: { equals: $n } }) { id status } }`, { n: inst.number })).installations[0]
  const [firstTask, ...rest] = inst.prepTasks
  if (firstTask) await customer.gql(`mutation($t: ID!, $k: String!) { completeSitePrepTask(taskId: $t, done: true, note: "Done", idempotencyKey: $k) }`, { t: firstTask.id, k: key('prep-customer') })
  for (const t of rest) await dispatcher.gql(`mutation($t: ID!, $k: String!) { setSitePrepTask(taskId: $t, status: "done", note: "Confirmed by phone", idempotencyKey: $k) }`, { t: t.id, k: key('prep-staff') })
  note('4a site prep ticked', `${inst.number}: ${inst.prepTasks.length} items (first by the customer)`)
  const serial: any = (await dispatcher.gql(`query($p: ID!) { serializedUnits(where: { product: { id: { equals: $p } }, status: { equals: "in_stock" } }, take: 1) { serialNumber } }`, { p: kits[0].id })).serializedUnits[0]
  for (const step of ['pick', 'pack', 'out_for_install']) await dispatcher.gql(`mutation($i: JSON!, $k: String!) { fulfilOrder(input: $i, idempotencyKey: $k) }`, { k: key(`fulfil-${step}`), i: { orderId: afterDeposit.id, step, ...(step === 'pick' && serial ? { serialNumbers: [serial.serialNumber] } : {}) } })
  const staffSlots: any[] = await one(dispatcher, 'staffVisitSlots', `query($f: String!) { staffVisitSlots(from: $f, days: 14, technicianId: "${techId}") }`, { f: new Date().toISOString().slice(0, 10) })
  const installSlot = staffSlots.find((s: any) => s.technicianIds?.includes(techId)) ?? staffSlots[0]
  const installVisit: any = await one(dispatcher, 'scheduleVisit', `mutation($i: JSON!, $k: String!) { scheduleVisit(input: $i, idempotencyKey: $k) }`, { k: key('schedule-install'), i: { type: 'install', date: installSlot.date, slotIndex: installSlot.slotIndex, technicianIds: [techId], installationId: instRow.id } })
  note('4b install scheduled', `visit ${installVisit.number} on ${installSlot.date}, serial ${serial?.serialNumber ?? 'none'}`)
  await tech.gql(`mutation($v: ID!, $k: String!) { checkInVisit(visitId: $v, lat: "30.0852", lng: "-97.8403", idempotencyKey: $k) }`, { v: installVisit.id, k: key('checkin-install') })
  const comm: any[] = (await tech.gql(`{ checklistTemplates(where: { kind: { equals: "commissioning" } }) { items { id inputType } } }`)).checklistTemplates[0]?.items ?? []
  const system: any = await one(tech, 'commissionSystem', `mutation($i: JSON!, $k: String!) { commissionSystem(input: $i, idempotencyKey: $k) }`, { k: key('commission'), i: {
    visitId: installVisit.id, signedName: `Rosa Main ${stamp}`, signature: `data:image/png;base64,${Buffer.from(`signature ${stamp} drawn on the technician phone`).toString('base64')}`,
    training: [{ traineeName: `Rosa Main ${stamp}`, relationToOwner: 'Owner', topics: ['Daily feeding', 'Lighting the stove', 'Draining the water trap', 'What to do if you smell gas'], language: 'en' }],
    answers: comm.map(i => ({ itemId: i.id, value: i.inputType === 'number' ? 1.2 : i.inputType === 'yes_no' ? true : 'ok' })), reading: { working: true, pressureKpa: '1.2', cookingHours: '3' },
  } })
  note('4c commissioned', `system ${system.number ?? system.systemNumber ?? system.id}, trained and signed`)

  // 5. Customer: system and warranty, pay an instalment (card or reference), report a problem, see it resolved.
  const mine: any[] = await one(customer, 'mySystems', `{ mySystems }`)
  const sys = mine[0]
  if (!sys?.warranties?.length && !sys?.warranty?.length) throw new Error('The system shows no warranty.')
  note('5a my system', `${sys.number}, ${(sys.warranties ?? sys.warranty).length} warranty cover(s), sticker /system/${sys.publicCode ?? sys.code}`)
  const pays: any = await one(customer, 'myPayments', `{ myPayments }`)
  const plan = pays.plans[0]
  if (!plan) throw new Error('No payment plan.')
  const due = plan.installments.find((i: any) => i.sequence > 0 && i.paidAmount < i.amount)
  const link: any = await one(customer, 'payInstallment', `mutation($p: ID!, $i: [ID!], $k: String!) { payInstallment(planId: $p, installmentIds: $i, idempotencyKey: $k) }`, { p: plan.id, i: [due.id], k: key('pay-instalment') })
  const sessionCode = link.sessionCode ?? link.code ?? link.publicCode
  const iref = `MM${Date.now().toString().slice(-9)}`
  const isub: any = await one(customer, 'submitOfflinePayment', `mutation($c: String!, $r: String!, $k: String!) { submitOfflinePayment(code: $c, provider: "mobile_money", reference: $r, idempotencyKey: $k) }`, { c: sessionCode, r: iref, k: key('instalment-ref') })
  await finance.gql(`mutation($p: ID!, $k: String!) { verifyOfflinePayment(paymentId: $p, idempotencyKey: $k) }`, { p: isub.paymentId, k: key('verify-instalment') })
  const after: any = await one(customer, 'myPayments', `{ myPayments }`)
  const paidRow = after.plans.find((p: any) => p.id === plan.id).installments.find((i: any) => i.id === due.id)
  if (paidRow.paidAmount < paidRow.amount) throw new Error('The instalment is not paid after verification.')
  note('5b instalment paid', `${due.label ?? `#${due.sequence}`} ${due.amount} minor units by reference ${iref}, verified; /pay/${sessionCode}`)
  const ticket: any = await one(customer, 'createTicket', `mutation($i: JSON!, $k: String!) { createTicket(input: $i, idempotencyKey: $k) }`, { k: key('ticket'), i: { systemId: sys.id, category: 'low_pressure', description: 'The flame is weak in the evenings.' } })
  const tRow: any = (await care.gql(`query($n: String!) { serviceTickets(where: { number: { equals: $n } }) { id } }`, { n: ticket.number })).serviceTickets[0]
  await care.gql(`mutation($i: JSON!, $k: String!) { transitionTicket(input: $i, idempotencyKey: $k) }`, { k: key('triage'), i: { ticketId: tRow.id, action: 'triage' } })
  await care.gql(`mutation($i: JSON!, $k: String!) { transitionTicket(input: $i, idempotencyKey: $k) }`, { k: key('warranty'), i: { ticketId: tRow.id, action: 'warranty', warrantyDecision: 'covered', reason: 'Inside the gas-line warranty' } })
  await care.gql(`mutation($i: JSON!, $k: String!) { transitionTicket(input: $i, idempotencyKey: $k) }`, { k: key('resolve-phone'), i: { ticketId: tRow.id, action: 'phone_resolved', reason: 'Water trap was full; drained it with the customer on the phone.', customerConfirmed: true } })
  const myTickets: any[] = await one(customer, 'myTickets', `{ myTickets }`)
  const seen = myTickets.find((t: any) => t.number === ticket.number)
  if (!seen || !['phone_resolved', 'resolved', 'closed'].includes(seen.status)) throw new Error(`The customer sees ticket ${ticket.number} as ${seen?.status}`)
  note('5c problem reported and resolved', `ticket ${ticket.number} reads ${seen.status} in the account`)

  // 6. Visitor: buy a part in the shop and pay.
  const shopper = new Client('shopper')
  const part: any = (await shopper.gql(`{ products(where: { sku: { equals: "FLT-MED" } }) { id name priceAmount } }`)).products[0]
  await shopper.gql(`mutation($p: ID!) { addToCart(productId: $p, quantity: 2) }`, { p: part.id })
  await shopper.gql(`mutation($i: JSON!) { setCartFulfilment(input: $i) }`, { i: { fulfilment: 'delivery', address: { addressLine: '88 Mill St', city: 'Kyle', region: 'Texas', country: 'US', postcode: '78640' }, name: `Sam Shop ${stamp}`, email: `shop.${stamp}@example.net`, phone: '+15125550133' } })
  const bought: any = await one(shopper, 'completeCart', `mutation($k: String!) { completeCart(idempotencyKey: $k) }`, { k: key('checkout') })
  const sref = `BT${Date.now().toString().slice(-7)}9`
  const ssub: any = await one(shopper, 'submitOfflinePayment', `mutation($c: String!, $r: String!, $k: String!) { submitOfflinePayment(code: $c, provider: "bank_transfer", reference: $r, idempotencyKey: $k) }`, { c: bought.sessionCode, r: sref, k: key('shop-ref') })
  await finance.gql(`mutation($p: ID!, $k: String!) { verifyOfflinePayment(paymentId: $p, idempotencyKey: $k) }`, { p: ssub.paymentId, k: key('verify-shop') })
  const shopOrder: any = await one(shopper, 'getOrderByCode', `query($c: String!) { getOrderByCode(code: $c) }`, { c: bought.orderCode })
  if (shopOrder.status !== 'confirmed') throw new Error(`Shop order reads ${shopOrder.status}`)
  note('6 part bought and paid', `order ${bought.orderNumber} /order/${bought.orderCode}, ${bought.amount} minor units, confirmed`)

  void salesId
  console.log(`\nMain action complete on ${BASE}:`)
  for (const r of report) console.log(`  ${r.step.padEnd(36)} ${r.detail}`)
}

main().catch(e => { console.error(`✗ ${e instanceof Error ? e.message : String(e)}`); process.exit(1) })
