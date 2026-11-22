import type { Tx } from '../lib/db'
import { DomainError, Codes } from '../lib/errors'
import { dateOnly, localDay, plusDays, slotWindow } from '../lib/time'
import { getSettings } from './settings'

/**
 * Visit slots (4.2, C16). Each technician has `slotsPerTechnicianPerDay` slots a day. Booking takes a
 * VisitSlotUsage row under the unique key (technician, date, slotIndex): two bookings cannot take one
 * slot, whatever the timing. A technician is bookable when they hold canDoFieldWork, are active, are
 * not off that day and (if the visit has a branch) belong to it.
 */
export async function technicians(tx: Tx, branchId?: string | null) {
  const users = await tx.user.findMany({
    where: { isActive: true, role: { canDoFieldWork: true }, ...(branchId ? { OR: [{ branchId }, { branchId: null }] } : {}) },
    select: { id: true, name: true, branchId: true },
    orderBy: { name: 'asc' },
  })
  return users
}

export async function openSlots(tx: Tx, input: { from: string; days: number; branchId?: string | null; technicianId?: string | null }) {
  const settings = await getSettings(tx)
  const days = Math.min(Math.max(input.days, 1), 31)
  const techs = (await technicians(tx, input.branchId)).filter(t => !input.technicianId || t.id === input.technicianId)
  const end = plusDays(input.from, days - 1)
  const [used, off] = await Promise.all([
    tx.visitSlotUsage.findMany({ where: { date: { gte: dateOnly(input.from), lte: dateOnly(end) }, technicianId: { in: techs.map(t => t.id) } }, select: { technicianId: true, date: true, slotIndex: true } }),
    tx.technicianTimeOff.findMany({ where: { date: { gte: dateOnly(input.from), lte: dateOnly(end) }, technicianId: { in: techs.map(t => t.id) } }, select: { technicianId: true, date: true } }),
  ])
  const taken = new Set(used.map(u => `${u.technicianId}|${u.date.toISOString().slice(0, 10)}|${u.slotIndex}`))
  const away = new Set(off.map(o => `${o.technicianId}|${o.date.toISOString().slice(0, 10)}`))
  const now = new Date()
  const out: { date: string; slotIndex: number; windowStart: string; windowEnd: string; technicianIds: string[] }[] = []
  for (let d = 0; d < days; d++) {
    const day = plusDays(input.from, d)
    const weekday = dateOnly(day).getUTCDay()
    if (weekday === 0) continue // Sundays closed.
    for (let s = 0; s < settings.slotsPerTechnicianPerDay; s++) {
      const w = slotWindow(day, s, settings.slotsPerTechnicianPerDay, settings.timezone)
      if (w.windowStart.getTime() <= now.getTime()) continue
      const free = techs.filter(t => !away.has(`${t.id}|${day}`) && !taken.has(`${t.id}|${day}|${s}`)).map(t => t.id)
      if (free.length) out.push({ date: day, slotIndex: s, windowStart: w.windowStart.toISOString(), windowEnd: w.windowEnd.toISOString(), technicianIds: free })
    }
  }
  return out
}

/** Takes one slot for each technician on the visit. Throws CAPACITY_FULL when any is already taken. */
export async function takeSlots(tx: Tx, visitId: string, date: string, slotIndex: number, technicianIds: string[]) {
  const settings = await getSettings(tx)
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= settings.slotsPerTechnicianPerDay) throw new DomainError(Codes.INVALID_INPUT, 'That time slot does not exist.')
  const day = dateOnly(date)
  for (const technicianId of [...new Set(technicianIds)].sort()) {
    const offDay = await tx.technicianTimeOff.findFirst({ where: { technicianId, date: day }, select: { id: true } })
    if (offDay) throw new DomainError(Codes.CAPACITY_FULL, 'That technician is off that day.')
    try {
      // A savepoint keeps the transaction usable if the unique key refuses the row.
      await tx.$executeRaw`SAVEPOINT slot`
      await tx.visitSlotUsage.create({ data: { visitId, technicianId, date: day, slotIndex } })
      await tx.$executeRaw`RELEASE SAVEPOINT slot`
    } catch (error) {
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT slot`
      if ((error as { code?: string }).code === 'P2002') throw new DomainError(Codes.CAPACITY_FULL, 'That slot was just taken. Pick another time.')
      throw error
    }
  }
  return slotWindow(date, slotIndex, settings.slotsPerTechnicianPerDay, settings.timezone)
}

export const freeSlots = (tx: Tx, visitId: string) => tx.visitSlotUsage.deleteMany({ where: { visitId } })

/** First free slot on or after `from` for any eligible technician (used by public booking with no slot chosen). */
export async function firstFree(tx: Tx, from: string, branchId?: string | null) {
  const slots = await openSlots(tx, { from, days: 14, branchId })
  return slots[0] ?? null
}

export const todayLocal = async (tx: Tx) => localDay(new Date(), (await getSettings(tx)).timezone)
