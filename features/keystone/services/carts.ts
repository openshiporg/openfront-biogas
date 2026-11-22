import type { Tx } from '../lib/db'
import type { UnitOfWork } from '../lib/unitOfWork'
import { DomainError, Codes } from '../lib/errors'
import { sha256 } from '../lib/canonical'
import { randomToken } from '../lib/sequence'
import { actorUserId, type Actor } from '../lib/actor'
import { addDays } from '../lib/time'
import { getSettings } from './settings'
import { priceLines } from './pricing'
import { availableQuantity } from './stock'
import { findOrCreateCustomer, matchArea } from './leads'
import { createOrderFromLines } from './orders'
import { openSession } from './money'
import { int, normEmail, normPhone, oneOf, req, str } from './util'
import { subscriptionEffectiveStatus, subscriptionGivesBenefits } from '../lib/time'
import { percentOf } from '../lib/money'

/**
 * Cart and checkout (W10, C13; E-commerce's boundary). A guest cart is reached by an opaque token kept
 * in an httpOnly cookie; only its hash is stored. Prices are read from the catalogue every time; a
 * client never sends a price. Stock is checked at checkout and reserved when the order is paid.
 */
export const hashToken = (token: string) => sha256(`cart:${token}`)

export async function cartByToken(tx: Tx, token: string | null | undefined) {
  if (!token || token.length < 20) return null
  const cart = await tx.cart.findUnique({ where: { tokenHash: hashToken(token) }, include: { lines: { include: { product: true }, orderBy: { createdAt: 'asc' } } } })
  return cart && cart.status === 'active' ? cart : null
}

export async function newCart(tx: Tx, actor: Actor) {
  const settings = await getSettings(tx)
  const token = randomToken(24)
  const cart = await tx.cart.create({ data: { tokenHash: hashToken(token), status: 'active', fulfilment: 'delivery', currencyCode: settings.currencyCode, expiresAt: addDays(new Date(), 30), customerId: actor.kind === 'user' ? actor.customerId : null, createdById: actor.kind === 'user' && !actor.customerId ? actor.userId : null } })
  return { token, cartId: cart.id }
}

/** Members of an active service plan get its parts discount (W9.3). */
async function planDiscountPercent(tx: Tx, customerId: string | null) {
  if (!customerId) return '0'
  const subs = await tx.servicePlanSubscription.findMany({ where: { customerId, status: { in: ['active'] } }, include: { plan: true } })
  const now = new Date()
  const live = subs.filter(s => subscriptionGivesBenefits(subscriptionEffectiveStatus(s, now)))
  return live.reduce((best, s) => (Number(s.plan?.partsDiscountPercent ?? 0) > Number(best) ? String(s.plan?.partsDiscountPercent ?? 0) : best), '0')
}

export async function priceCart(tx: Tx, cartId: string) {
  const settings = await getSettings(tx)
  const cart = await tx.cart.findUnique({ where: { id: cartId }, include: { lines: { include: { product: true }, orderBy: { createdAt: 'asc' } }, serviceArea: true, pickupBranch: true } })
  if (!cart) throw new DomainError(Codes.NOT_FOUND, 'Cart not found.')
  const lines = cart.lines.filter(l => l.product && l.product.isPublished && l.product.sellOnline)
  const items = lines.map(l => ({ kind: 'product', quantity: l.quantity ?? 1, unitAmount: l.product!.priceAmount, taxable: l.product!.taxable, lineId: l.id, product: l.product! }))
  const pct = await planDiscountPercent(tx, cart.customerId)
  const partsValue = items.filter(i => i.product.type !== 'digester_kit').reduce((s, i) => s + i.quantity * i.unitAmount, 0)
  const discount = Number(pct) > 0 ? percentOf(partsValue, pct) : 0
  const delivery = cart.fulfilment === 'delivery' && items.length ? cart.serviceArea?.deliveryFeeAmount ?? 0 : 0
  const priced = priceLines([...items, ...(discount > 0 ? [{ kind: 'discount', quantity: 1, unitAmount: -discount, taxable: false }] : []), ...(delivery > 0 ? [{ kind: 'delivery', quantity: 1, unitAmount: delivery, taxable: true }] : [])], settings)
  const stock = await Promise.all(items.map(async i => ({ lineId: i.lineId, available: await availableQuantity(tx, i.product.id) })))
  return {
    id: cart.id,
    fulfilment: cart.fulfilment,
    currencyCode: settings.currencyCode,
    serviceArea: cart.serviceArea ? { id: cart.serviceArea.id, name: cart.serviceArea.name } : null,
    pickupBranch: cart.pickupBranch ? { id: cart.pickupBranch.id, name: cart.pickupBranch.name, address: cart.pickupBranch.address } : null,
    address: cart.address ?? {},
    name: cart.name, email: cart.email, phone: cart.phone,
    lines: items.map((i, idx) => ({ id: i.lineId, productId: i.product.id, name: i.product.name, slug: i.product.slug, imageUrl: i.product.imageUrl, quantity: i.quantity, unitAmount: i.unitAmount, totalAmount: priced.lines[idx].totalAmount, available: stock[idx].available })),
    planDiscountPercent: pct,
    discountAmount: priced.discountAmount,
    deliveryAmount: delivery,
    subtotalAmount: priced.subtotalAmount - delivery,
    taxAmount: priced.taxAmount,
    totalAmount: priced.totalAmount,
    count: items.reduce((s, i) => s + i.quantity, 0),
  }
}

export async function addToCart(tx: Tx, cartId: string, productId: string, quantity: number) {
  const product = await tx.product.findUnique({ where: { id: productId } })
  if (!product || !product.isPublished || !product.sellOnline) throw new DomainError(Codes.NOT_FOUND, 'That item is not for sale online.')
  if (product.requiresSurvey) throw new DomainError(Codes.GUARD_FAILED, 'This system needs a site survey first. Ask for a quote.')
  const q = int(quantity, 'Quantity', { min: 1, max: 99 })
  const existing = await tx.cartLine.findFirst({ where: { cartId, productId } })
  if (existing) await tx.cartLine.update({ where: { id: existing.id }, data: { quantity: Math.min(99, (existing.quantity ?? 0) + q), unitAmount: product.priceAmount } })
  else {
    if ((await tx.cartLine.count({ where: { cartId } })) >= 50) throw new DomainError(Codes.INVALID_INPUT, 'A cart holds at most 50 different items.')
    await tx.cartLine.create({ data: { cartId, productId, quantity: q, unitAmount: product.priceAmount } })
  }
}

export async function updateCartLine(tx: Tx, cartId: string, lineId: string, quantity: number) {
  const line = await tx.cartLine.findFirst({ where: { id: lineId, cartId } })
  if (!line) throw new DomainError(Codes.NOT_FOUND, 'Line not found.')
  const q = int(quantity, 'Quantity', { min: 0, max: 99 })
  if (q === 0) await tx.cartLine.delete({ where: { id: line.id } })
  else await tx.cartLine.update({ where: { id: line.id }, data: { quantity: q } })
}

export async function removeCartLine(tx: Tx, cartId: string, lineId: string) {
  await tx.cartLine.deleteMany({ where: { id: lineId, cartId } })
}

export async function setCartFulfilment(tx: Tx, cartId: string, input: { fulfilment: string; pickupBranchId?: string | null; address?: Record<string, string>; name?: string; email?: string; phone?: string }) {
  const fulfilment = oneOf(input.fulfilment, ['delivery', 'pickup'] as const, 'Delivery or pickup')
  const address = Object.fromEntries(['addressLine', 'city', 'region', 'country', 'postcode', 'directions'].map(k => [k, str(input.address?.[k], 300)]))
  let serviceAreaId: string | null = null
  let pickupBranchId: string | null = null
  if (fulfilment === 'delivery') {
    const area = await matchArea(tx, address)
    if (!area) throw new DomainError(Codes.OUT_OF_AREA, 'We do not deliver to that address yet. Pick up at a branch, or call us.')
    serviceAreaId = area.id
  } else {
    const branch = input.pickupBranchId ? await tx.branch.findUnique({ where: { id: input.pickupBranchId } }) : null
    if (!branch?.isActive) throw new DomainError(Codes.INVALID_INPUT, 'Pick a branch to collect from.')
    pickupBranchId = branch.id
  }
  await tx.cart.update({ where: { id: cartId }, data: { fulfilment, address, serviceAreaId, pickupBranchId, name: str(input.name, 200), email: normEmail(input.email), phone: normPhone(input.phone) } })
}

/**
 * Checkout: one order from the cart's current prices, a session for the full amount. Stock is checked
 * now (so a customer is told before paying) and reserved when the money is real (4.4).
 */
export async function completeCart(uow: UnitOfWork, actor: Actor, cartId: string, keyHash?: string) {
  const tx = uow.tx
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Cart" WHERE id = ${cartId} FOR UPDATE`
  if (!rows.length) throw new DomainError(Codes.NOT_FOUND, 'Cart not found.')
  const cart = await tx.cart.findUnique({ where: { id: cartId } })
  if (cart?.status !== 'active') throw new DomainError(Codes.INVALID_TRANSITION, 'This cart has already been checked out.', { currentStatus: cart?.status })
  const priced = await priceCart(tx, cartId)
  if (!priced.lines.length) throw new DomainError(Codes.INVALID_INPUT, 'Your cart is empty.')
  for (const l of priced.lines) if (l.available < l.quantity) throw new DomainError(Codes.OUT_OF_STOCK, `Only ${l.available} ${l.name} left.`, { field: l.productId })
  if (cart.fulfilment === 'delivery' && !cart.serviceAreaId) throw new DomainError(Codes.INVALID_INPUT, 'Add a delivery address.')
  if (cart.fulfilment === 'pickup' && !cart.pickupBranchId) throw new DomainError(Codes.INVALID_INPUT, 'Pick a branch to collect from.')
  const customer = actor.kind === 'user' && actor.customerId
    ? await tx.customer.findUnique({ where: { id: actor.customerId } })
    : await findOrCreateCustomer(uow, actor, { name: req(cart.name, 'Name', 200), phone: cart.phone, email: cart.email })
  const products = await tx.product.findMany({ where: { id: { in: priced.lines.map(l => l.productId) } } })
  const byId = new Map(products.map(p => [p.id, p]))
  const lines = priced.lines.map(l => {
    const p = byId.get(l.productId)!
    return { kind: 'product', productId: p.id, name: p.name, sku: p.sku, quantity: l.quantity, unitAmount: p.priceAmount, taxable: p.taxable, warrantyMonths: p.warrantyMonths ?? 0, requiresInstallation: false, snapshot: { name: p.name, sku: p.sku, priceAmount: p.priceAmount, warrantyMonths: p.warrantyMonths ?? 0, type: p.type } }
  })
  if (priced.discountAmount > 0) lines.push({ kind: 'discount', productId: null as never, name: `Service plan discount (${priced.planDiscountPercent}%)`, sku: '', quantity: 1, unitAmount: -priced.discountAmount, taxable: false, warrantyMonths: 0, requiresInstallation: false, snapshot: {} as never })
  const area = cart.serviceAreaId ? await tx.serviceArea.findUnique({ where: { id: cart.serviceAreaId } }) : null
  const channel = actor.kind === 'user' && !actor.customerId && actor.permissions.has('canAccessDashboard') ? 'staff' : 'shop'
  const order = await createOrderFromLines(uow, actor, {
    channel, lines, customerId: customer!.id, branchId: cart.pickupBranchId ?? area?.branchId ?? null, salesAgentId: channel === 'staff' ? actorUserId(actor) : null,
    fulfilment: cart.fulfilment as 'delivery' | 'pickup', deliveryAmount: priced.deliveryAmount, shippingAddress: { ...(cart.address as object), name: cart.name, phone: cart.phone },
  })
  if (priced.totalAmount !== order.totalAmount) throw new DomainError(Codes.STALE_STATE, 'Prices changed while you were checking out. Review your cart.')
  await tx.cart.update({ where: { id: cartId }, data: { status: 'converted', orderId: order.id, tokenHash: null } })
  const session = await openSession(uow, { code: 'bank_transfer', amount: order.totalAmount, currencyCode: order.currencyCode, purpose: 'full', description: `Order ${order.number}`, target: { orderId: order.id, customerId: order.customerId }, keyHash: keyHash ?? null })
  await tx.paymentSession.update({ where: { id: session.id }, data: { providerId: null } })
  return { orderId: order.id, orderNumber: order.number, orderCode: order.publicCode, sessionCode: session.publicCode, amount: order.totalAmount, currencyCode: order.currencyCode }
}
