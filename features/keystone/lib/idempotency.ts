import { payloadHash, sha256, toJsonValue } from './canonical'
import { advisoryLock, type Tx } from './db'
import { DomainError, Codes } from './errors'

/**
 * Command receipts (section 4): the key is stored hashed with a fingerprint of the request. Same key and
 * same body returns the first result; same key with a different body or principal is refused. The receipt
 * commits with the command's effects, so a crash leaves neither.
 */
export const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,200}$/

export function assertIdempotencyKey(key: unknown): asserts key is string {
  if (typeof key !== 'string' || !key.trim()) throw new DomainError(Codes.IDEMPOTENCY_KEY_REQUIRED, 'An idempotency key is required.')
  if (!IDEMPOTENCY_KEY.test(key)) throw new DomainError(Codes.INVALID_INPUT, 'The idempotency key must be 8 to 200 letters, digits or . _ : -')
}

export const keyHash = (key: string) => sha256(`receipt:${key}`)

export type Receipt = { replay: true; result: unknown } | { replay: false }

export async function claimReceipt(tx: Tx, input: { key: string; operation: string; principal: string; params: unknown }): Promise<Receipt> {
  assertIdempotencyKey(input.key)
  const hash = keyHash(input.key)
  await advisoryLock(tx, `receipt:${hash}`)
  const existing = await tx.commandReceipt.findUnique({ where: { keyHash: hash } })
  if (!existing) return { replay: false }
  const fingerprint = payloadHash({ operation: input.operation, params: input.params })
  if (existing.operation !== input.operation || existing.actorId !== input.principal || existing.requestFingerprint !== fingerprint) {
    throw new DomainError(Codes.IDEMPOTENCY_KEY_REUSED, 'This request key was already used for a different request.')
  }
  return { replay: true, result: existing.resultJson }
}

export async function writeReceipt(tx: Tx, input: { key: string; operation: string; principal: string; params: unknown; result: unknown; now: Date }) {
  await tx.commandReceipt.create({
    data: {
      keyHash: keyHash(input.key),
      actorId: input.principal,
      operation: input.operation,
      requestFingerprint: payloadHash({ operation: input.operation, params: input.params }),
      resultJson: toJsonValue(input.result) as never,
      createdAt: input.now,
    },
  })
}
