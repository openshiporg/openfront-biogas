/**
 * The main action as building blocks, through the real GraphQL operations and as the people who do
 * each step (the same calls scripts/main-action.ts makes over HTTP). Each helper returns the ids the
 * next step needs. People and places are invented but plausible.
 */
import { as, key, op, gql } from './keystone'

let n = 0
const FIRST = ['Rosa', 'Daniel', 'Amira', 'Walter', 'Priya', 'Lucas', 'Hana', 'Owen', 'Marta', 'Felix', 'Nadia', 'Colin', 'Imani', 'Victor', 'Leah', 'Jonah']
const LAST = ['Alvarado', 'Becker', 'Okonjo', 'Huang', 'Lindgren', 'Moreau', 'Patel', 'Quinn', 'Sorensen', 'Tanaka', 'Vance', 'Whitaker']
export function person() {
  n += 1
  const first = FIRST[n % FIRST.length]
  const last = LAST[(n * 7) % LAST.length]
  const tail = `${Date.now() % 10000}`.padStart(4, '0')
  return { name: `${first} ${last}`, email: `${first}.${last}.${n}${tail}`.toLowerCase() + '@hillcountrymail.com', phone: `+1512${String(300 + (n % 600)).padStart(3, '0')}${tail}` }
}

export type Ids = Record<string, string>

export async function staffIds(prismaLike: any) {
  const by = async (role: string) => (await prismaLike.user.findMany({ where: { role: { name: role } }, orderBy: { email: 'asc' }, select: { id: true } })).map((u: any) => u.id as string)
  return {
    owner: (await by('Owner'))[0] as string | undefined,
    sales: (await by('Sales agent'))[0],
    manager: (await by('Sales manager'))[0],
    dispatcher: (await by('Dispatcher'))[0],
    techs: await by('Technician'),
    care: (await by('Customer care'))[0],
    store: (await by('Storekeeper'))[0],
    finance: (await by('Finance'))[0],
  }
}

/** A visitor asks for a quote (S2). */
export async function requestQuote(who = person()) {
  const visitor = await as(null)
  const asked = await op(visitor, `mutation($i: JSON!, $k: String!) { submitQuoteRequest(input: $i, idempotencyKey: $k) }`, {
    k: key('quote-request'),
    i: { name: who.name, email: who.email, phone: who.phone, customerType: 'household', interest: 'home', addressLine: '410 Ranch Rd', city: 'Buda', region: 'Texas', country: 'US', postcode: '78610', siteType: 'home', animals: { cattle: 3 }, peopleServed: 5, monthlyFuelSpendAmount: 6500, contactConsent: true },
  })
  const ctx = await as(null)
  const lead = await ctx.prisma.lead.findFirst({ where: { number: asked.leadNumber } })
  return { who, leadId: lead.id as string, leadNumber: asked.leadNumber as string, customerId: lead.customerId as string }
}

/** The sales agent drafts and sends a two-option quote with the company's plans. */
export async function sendQuoteFor(salesId: string, leadId: string, opts: { discountPercent?: number } = {}) {
  const sales = await as(salesId)
  const kits = await sales.prisma.product.findMany({ where: { type: 'digester_kit' }, orderBy: { priceAmount: 'asc' }, take: 2 })
  const templates = await sales.prisma.paymentPlanTemplate.findMany({ where: { isActive: true } })
  const planIds = templates.filter((t: any) => t.kind === 'full' || t.kind === 'instalments').map((t: any) => t.id)
  const discount = opts.discountPercent ? [{ kind: 'discount', description: 'Spring discount', quantity: 1, unitAmount: -Math.round(kits[0].priceAmount * opts.discountPercent / 100) }] : []
  const draft = await op(sales, `mutation($i: JSON!, $k: String!) { saveQuoteDraft(input: $i, idempotencyKey: $k) }`, {
    k: key('draft'),
    i: { leadId, kind: 'sale', terms: 'Includes delivery, installation and commissioning.', options: [
      { label: kits[0].name, isRecommended: true, lines: [{ kind: 'product', productId: kits[0].id, quantity: 1 }, ...discount], planTemplateIds: planIds },
      { label: kits[1].name, lines: [{ kind: 'product', productId: kits[1].id, quantity: 1 }], planTemplateIds: planIds },
    ] },
  })
  if (opts.discountPercent) return { quoteId: draft.id as string, code: null as string | null, kits }
  await op(sales, `mutation($q: ID!, $k: String!) { sendQuote(quoteId: $q, idempotencyKey: $k) }`, { q: draft.id, k: key('send') })
  const quote = await sales.prisma.quote.findUnique({ where: { id: draft.id } })
  return { quoteId: draft.id as string, code: quote.publicCode as string, kits }
}

/** The customer opens the quote and accepts an option (with an instalment plan when `plan`). */
export async function acceptFor(code: string, signedName: string, opts: { plan?: boolean; idempotencyKey?: string } = {}) {
  const visitor = await as(null)
  const q = await op(visitor, `query($c: String!) { getQuoteByCode(code: $c) }`, { c: code })
  const option = q.options.find((o: any) => o.isRecommended) ?? q.options[0]
  const offer = opts.plan ? option.planOffers.find((p: any) => p.instalmentCount > 0) : null
  return op(visitor, `mutation($c: String!, $o: ID!, $p: ID, $s: String!, $k: String!) { acceptQuote(code: $c, optionId: $o, planOfferId: $p, signedName: $s, idempotencyKey: $k) }`,
    { c: code, o: option.id, p: offer?.id ?? null, s: signedName, k: opts.idempotencyKey ?? key('accept') })
}

let refN = 0
export const reference = (prefix = 'BT') => `${prefix}${Date.now().toString().slice(-7)}${(refN += 1).toString().padStart(3, '0')}`

/** The customer pays a session by bank reference; finance verifies it. */
export async function payByReference(sessionCode: string, financeId: string, provider = 'bank_transfer') {
  const visitor = await as(null)
  const sub = await op(visitor, `mutation($c: String!, $p: String!, $r: String!, $k: String!) { submitOfflinePayment(code: $c, provider: $p, reference: $r, idempotencyKey: $k) }`,
    { c: sessionCode, p: provider, r: reference(provider === 'mobile_money' ? 'MM' : 'BT'), k: key('submit') })
  const finance = await as(financeId)
  await op(finance, `mutation($p: ID!, $k: String!) { verifyOfflinePayment(paymentId: $p, idempotencyKey: $k) }`, { p: sub.paymentId, k: key('verify') })
  return sub.paymentId as string
}

/** Lead → sent quote → accepted → deposit verified: a confirmed order. */
export async function confirmedOrder(ids: Awaited<ReturnType<typeof staffIds>>, opts: { plan?: boolean } = {}) {
  const lead = await requestQuote()
  const q = await sendQuoteFor(ids.sales, lead.leadId)
  const accepted = await acceptFor(q.code!, lead.who.name, opts)
  const paymentId = await payByReference(accepted.sessionCode, ids.finance)
  return { ...lead, ...q, ...accepted, depositPaymentId: paymentId }
}

/** Every site-prep item ticked by staff, so the installation can be scheduled. */
export async function prepDone(dispatcherId: string, orderId: string) {
  const d = await as(dispatcherId)
  const inst = await d.prisma.installation.findFirst({ where: { orderId }, include: { prepTasks: true } })
  for (const t of inst.prepTasks) await op(d, `mutation($t: ID!, $k: String!) { setSitePrepTask(taskId: $t, status: "done", note: "Confirmed by phone", idempotencyKey: $k) }`, { t: t.id, k: key('prep') })
  return inst.id as string
}

/** A free slot for the technician in the next two weeks. */
export async function freeSlot(dispatcherId: string, techId: string) {
  const d = await as(dispatcherId)
  const from = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  const slots: any[] = await op(d, `query($f: String!, $t: ID) { staffVisitSlots(from: $f, days: 14, technicianId: $t) }`, { f: from, t: techId })
  const slot = slots.find(s => s.technicianIds?.includes(techId))
  if (!slot) throw new Error('No free slot for the technician.')
  return slot as { date: string; slotIndex: number }
}

/** Install visit scheduled and checked in; returns the visit id. */
export async function installVisitOnSite(ids: Awaited<ReturnType<typeof staffIds>>, installationId: string) {
  const tech = ids.techs[0]
  const slot = await freeSlot(ids.dispatcher, tech)
  const d = await as(ids.dispatcher)
  const v = await op(d, `mutation($i: JSON!, $k: String!) { scheduleVisit(input: $i, idempotencyKey: $k) }`, { k: key('schedule'), i: { type: 'install', date: slot.date, slotIndex: slot.slotIndex, technicianIds: [tech], installationId } })
  const t = await as(tech)
  await op(t, `mutation($v: ID!, $k: String!) { checkInVisit(visitId: $v, lat: "30.0852", lng: "-97.8403", idempotencyKey: $k) }`, { v: v.id, k: key('checkin') })
  return v.id as string
}

export async function commissionInput(techId: string, visitId: string, signedName: string, opts: { training?: boolean; signature?: boolean } = {}) {
  const t = await as(techId)
  const comm = (await t.prisma.checklistTemplate.findFirst({ where: { kind: 'commissioning' }, include: { items: true } }))?.items ?? []
  return {
    visitId, signedName,
    ...(opts.signature === false ? {} : { signature: `data:image/png;base64,${Buffer.from(`signed by ${signedName}`).toString('base64')}` }),
    training: opts.training === false ? [] : [{ traineeName: signedName, relationToOwner: 'Owner', topics: ['Daily feeding', 'Lighting the stove', 'Draining the water trap', 'What to do if you smell gas'], language: 'en' }],
    answers: comm.map((i: any) => ({ itemId: i.id, value: i.inputType === 'number' ? 1.2 : i.inputType === 'yes_no' ? true : 'ok' })),
    reading: { working: true, pressureKpa: '1.2', cookingHours: '3' },
  }
}

export async function commission(techId: string, input: unknown, idempotencyKey = key('commission')) {
  const t = await as(techId)
  return op(t, `mutation($i: JSON!, $k: String!) { commissionSystem(input: $i, idempotencyKey: $k) }`, { i: input, k: idempotencyKey })
}

/** An installed, commissioned system for a fresh customer. */
export async function commissionedSystem(ids: Awaited<ReturnType<typeof staffIds>>, opts: { plan?: boolean } = {}) {
  const order = await confirmedOrder(ids, opts)
  const installationId = await prepDone(ids.dispatcher, order.orderId)
  const visitId = await installVisitOnSite(ids, installationId)
  const system = await commission(ids.techs[0], await commissionInput(ids.techs[0], visitId, order.who.name))
  return { ...order, installationId, visitId, system }
}

export { gql, op, as, key }
