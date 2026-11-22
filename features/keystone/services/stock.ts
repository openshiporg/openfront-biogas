import type { Tx } from '../lib/db'
import { DomainError, Codes } from '../lib/errors'

/**
 * Stock (section 4.14). Movements are append-only; `onHand` and `reserved` change only together with a
 * movement in the same transaction, on a level row locked FOR UPDATE, guarded by reserved <= onHand (and
 * by a database CHECK as the backstop). The last unit cannot be sold twice.
 */
export type MovementType = 'receipt' | 'reserve' | 'release' | 'pick' | 'consume' | 'transfer_out' | 'transfer_in' | 'return' | 'adjust'
export type Ref = { refType: string; refId: string; userId?: string | null; reason?: string; unitCostAmount?: number }

export async function lockLevel(tx: Tx, productId: string, locationId: string) {
  await tx.stockLevel.upsert({ where: { productId_locationId: { productId, locationId } }, create: { productId, locationId }, update: {} })
  const rows = await tx.$queryRaw<{ id: string; onHand: number; reserved: number }[]>`SELECT id, "onHand", reserved FROM "StockLevel" WHERE product = ${productId} AND location = ${locationId} FOR UPDATE`
  return rows[0]
}

async function move(tx: Tx, type: MovementType, productId: string, locationId: string, quantity: number, change: { onHand?: number; reserved?: number }, ref: Ref) {
  if (!Number.isSafeInteger(quantity) || quantity === 0) throw new DomainError(Codes.INVALID_INPUT, 'Quantity must be a whole number other than zero.')
  const level = await lockLevel(tx, productId, locationId)
  const onHand = level.onHand + (change.onHand ?? 0)
  const reserved = level.reserved + (change.reserved ?? 0)
  if (onHand < 0 || reserved < 0 || reserved > onHand) {
    const product = await tx.product.findUnique({ where: { id: productId }, select: { name: true } })
    throw new DomainError(Codes.OUT_OF_STOCK, `Not enough ${product?.name ?? 'stock'} at this location (on hand ${level.onHand}, reserved ${level.reserved}).`, { field: productId })
  }
  await tx.stockLevel.update({ where: { id: level.id }, data: { onHand, reserved } })
  await tx.stockMovement.create({
    data: { type, quantity, productId, locationId, userId: ref.userId ?? null, refType: ref.refType, refId: ref.refId, reason: ref.reason ?? '', unitCostAmount: ref.unitCostAmount ?? 0 },
  })
  return { onHand, reserved }
}

export const receive = (tx: Tx, p: string, l: string, q: number, ref: Ref) => move(tx, 'receipt', p, l, q, { onHand: q }, ref)
export const reserve = (tx: Tx, p: string, l: string, q: number, ref: Ref) => move(tx, 'reserve', p, l, q, { reserved: q }, ref)
export const release = (tx: Tx, p: string, l: string, q: number, ref: Ref) => move(tx, 'release', p, l, q, { reserved: -q }, ref)
/** Picking reserved stock for an order: it leaves the shelf and the reservation together. */
export const pickReserved = (tx: Tx, p: string, l: string, q: number, ref: Ref) => move(tx, 'pick', p, l, q, { onHand: -q, reserved: -q }, ref)
export const pickUnreserved = (tx: Tx, p: string, l: string, q: number, ref: Ref) => move(tx, 'pick', p, l, q, { onHand: -q }, ref)
export const consume = (tx: Tx, p: string, l: string, q: number, ref: Ref) => move(tx, 'consume', p, l, q, { onHand: -q }, ref)
export const returnToStock = (tx: Tx, p: string, l: string, q: number, ref: Ref) => move(tx, 'return', p, l, q, { onHand: q }, ref)
export const adjust = (tx: Tx, p: string, l: string, delta: number, ref: Ref) => move(tx, 'adjust', p, l, delta, { onHand: delta }, ref)

export async function transfer(tx: Tx, productId: string, fromId: string, toId: string, quantity: number, ref: Ref) {
  if (fromId === toId) throw new DomainError(Codes.INVALID_INPUT, 'Pick two different locations.')
  // Lock in a fixed order so two opposite transfers can't deadlock.
  const [a, b] = fromId < toId ? [fromId, toId] : [toId, fromId]
  await lockLevel(tx, productId, a)
  await lockLevel(tx, productId, b)
  await move(tx, 'transfer_out', productId, fromId, quantity, { onHand: -quantity }, ref)
  await move(tx, 'transfer_in', productId, toId, quantity, { onHand: quantity }, ref)
}

/** What one unit of a product takes from stock: a kit with a bill of materials takes its components. */
export async function stockUnits(tx: Tx, productId: string, quantity: number) {
  const product = await tx.product.findUnique({ where: { id: productId }, select: { id: true, type: true, kitComponents: { select: { quantity: true, componentId: true } } } })
  if (!product || product.type === 'service') return []
  if (product.kitComponents.length) return product.kitComponents.filter(c => c.componentId).map(c => ({ productId: c.componentId!, quantity: c.quantity * quantity }))
  return [{ productId, quantity }]
}

export type Reservation = { productId: string; locationId: string; quantity: number }

/** Stock locations to draw from, best first: the branch's own, then warehouses. Vans are never sold from. */
export async function sourceLocations(tx: Tx, branchId?: string | null) {
  const locations = await tx.stockLocation.findMany({ where: { isActive: true, type: { in: ['warehouse', 'branch'] } }, select: { id: true, branchId: true, type: true, name: true } })
  return locations.sort((x, y) => Number(y.branchId === branchId) - Number(x.branchId === branchId) || Number(y.type === 'warehouse') - Number(x.type === 'warehouse') || x.name.localeCompare(y.name))
}

/** Reserve each unit at one location that has it all available. Throws OUT_OF_STOCK if none does. */
export async function reserveLines(tx: Tx, lines: { productId: string; quantity: number }[], branchId: string | null | undefined, ref: Ref): Promise<Reservation[]> {
  const needs = new Map<string, number>()
  for (const line of lines) for (const unit of await stockUnits(tx, line.productId, line.quantity)) needs.set(unit.productId, (needs.get(unit.productId) ?? 0) + unit.quantity)
  const locations = await sourceLocations(tx, branchId)
  const out: Reservation[] = []
  // Sorted product order: concurrent checkouts lock rows in the same order.
  for (const [productId, quantity] of [...needs.entries()].sort(([x], [y]) => (x < y ? -1 : 1))) {
    let done = false
    for (const location of locations) {
      const level = await lockLevel(tx, productId, location.id)
      if (level.onHand - level.reserved >= quantity) {
        await reserve(tx, productId, location.id, quantity, ref)
        out.push({ productId, locationId: location.id, quantity })
        done = true
        break
      }
    }
    if (!done) {
      const product = await tx.product.findUnique({ where: { id: productId }, select: { name: true } })
      throw new DomainError(Codes.OUT_OF_STOCK, `${product?.name ?? 'An item'} is out of stock.`, { field: productId })
    }
  }
  return out
}

export async function releaseReservations(tx: Tx, reservations: Reservation[], ref: Ref) {
  for (const r of reservations) await release(tx, r.productId, r.locationId, r.quantity, ref)
}

export async function availableQuantity(tx: Tx, productId: string) {
  const levels = await tx.stockLevel.findMany({ where: { productId, location: { isActive: true, type: { in: ['warehouse', 'branch'] } } }, select: { onHand: true, reserved: true } })
  return levels.reduce((sum, l) => sum + Math.max(0, l.onHand - l.reserved), 0)
}
