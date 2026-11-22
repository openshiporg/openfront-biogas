import { toJsonValue } from './canonical'
import { type Db } from './db'
import { principalKey, type Actor } from './actor'
import { claimReceipt, writeReceipt } from './idempotency'
import { runInTransaction, type UnitOfWork } from './unitOfWork'
import { deliverWebhookEvents } from '../../webhooks/outbound'

export type CommandSpec = { name: string; actor: Actor; idempotencyKey: string; params: unknown; now?: Date }
export type CommandResult<T> = { replay: boolean; value: T }

const RETRYABLE = /deadlock detected|could not serialize|P2034|40P01|40001/i

/**
 * One idempotent business operation in one transaction. Deadlocks re-run the whole transaction. Webhook
 * deliveries recorded in the transaction are sent after it commits.
 */
export async function command<T>(db: Db, spec: CommandSpec, work: (uow: UnitOfWork) => Promise<T>): Promise<CommandResult<T>> {
  const principal = principalKey(spec.actor)
  for (let attempt = 1; ; attempt += 1) {
    try {
      const committed = await runInTransaction(db, async uow => {
        const receipt = await claimReceipt(uow.tx, { key: spec.idempotencyKey, operation: spec.name, principal, params: spec.params })
        if (receipt.replay) return { replay: true, value: receipt.result as T }
        const value = toJsonValue<T>(await work(uow))
        await writeReceipt(uow.tx, { key: spec.idempotencyKey, operation: spec.name, principal, params: spec.params, result: value, now: uow.now })
        return { replay: false, value }
      }, { now: spec.now })
      await runAfterCommit(db, committed)
      return committed.value
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const code = (error as { code?: string })?.code ?? ''
      if (attempt < 4 && (RETRYABLE.test(message) || RETRYABLE.test(code))) continue
      throw error
    }
  }
}

/** A transaction with audit and webhooks but no receipt (reads that log, and public lookups with side effects like `viewedAt`). */
export async function unkeyed<T>(db: Db, work: (uow: UnitOfWork) => Promise<T>, now?: Date): Promise<T> {
  const committed = await runInTransaction(db, work, { now })
  await runAfterCommit(db, committed)
  return committed.value
}

/** Post-commit work never undoes the committed change; failures leave a row the reconcile queue shows. */
async function runAfterCommit(db: Db, committed: { webhookEventIds: string[]; afterCommit: ((db: Db) => Promise<unknown>)[] }) {
  for (const fn of committed.afterCommit) {
    try {
      await fn(db)
    } catch (error) {
      console.error('After-commit step failed:', error instanceof Error ? error.message.slice(0, 200) : 'unknown')
    }
  }
  if (committed.webhookEventIds.length) await deliverWebhookEvents(db, committed.webhookEventIds)
}
