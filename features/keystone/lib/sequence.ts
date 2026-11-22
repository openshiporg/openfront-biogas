import { randomBytes } from 'node:crypto'
import { advisoryLock, type Tx } from './db'

/** Human numbers for staff (L-000012, Q-000004, O-…, T-…, SYS-…): gap-free within committed transactions. */
export async function nextNumber(tx: Tx, prefix: string, width = 6) {
  if (!/^[A-Z]{1,4}$/.test(prefix)) throw new Error('Number prefix must be 1-4 capital letters')
  await advisoryLock(tx, `sequence:${prefix}`)
  const row = await tx.sequence.upsert({ where: { key: prefix }, create: { key: prefix, nextValue: 2 }, update: { nextValue: { increment: 1 } } })
  return `${prefix}-${String(row.nextValue - 1).padStart(width, '0')}`
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** Random, unguessable code for customer links (80 bits): Q-7K2Q-9MXD-… */
export function publicCode(prefix: string, groups = 4) {
  const bytes = randomBytes(groups * 4)
  const chars = Array.from(bytes, byte => CROCKFORD[byte % 32])
  const parts = Array.from({ length: groups }, (_, i) => chars.slice(i * 4, i * 4 + 4).join(''))
  return `${prefix}-${parts.join('-')}`
}

export const randomToken = (bytes = 24) => randomBytes(bytes).toString('base64url')
