import { TRANSACTION_OPTIONS, type Db, type Tx } from './db'
import { toJsonValue } from './canonical'

export type AuditInput = {
  action: string
  entityType: string
  entityId: string
  actorUserId?: string | null
  actorLabel?: string | null
  fromStatus?: string | null
  toStatus?: string | null
  reason?: string | null
  data?: unknown
}

export type WebhookIntent = { eventType: string; resourceType: string; resourceId: string; data: Record<string, unknown> }

/**
 * One business transaction: state changes, audit rows and webhook delivery records commit together or
 * not at all. No network I/O happens inside; webhooks are delivered after commit.
 */
export class UnitOfWork {
  readonly audits: AuditInput[] = []
  readonly webhooks: WebhookIntent[] = []
  /** Network work (Stripe calls) that must run only after this transaction commits. */
  readonly afterCommit: ((db: Db) => Promise<unknown>)[] = []
  constructor(readonly tx: Tx, readonly now: Date) {}
  audit(event: AuditInput) {
    this.audits.push(event)
  }
  after(fn: (db: Db) => Promise<unknown>) {
    this.afterCommit.push(fn)
  }
  emit(eventType: string, resourceType: string, resourceId: string, data: Record<string, unknown> = {}) {
    this.webhooks.push({ eventType, resourceType, resourceId, data })
  }
}

export type Committed<T> = { value: T; webhookEventIds: string[]; afterCommit: ((db: Db) => Promise<unknown>)[] }

export async function runInTransaction<T>(db: Db, work: (uow: UnitOfWork) => Promise<T>, options: { now?: Date; timeoutMs?: number } = {}): Promise<Committed<T>> {
  return db.$transaction(async tx => {
    const uow = new UnitOfWork(tx, options.now ?? new Date())
    const value = await work(uow)
    if (uow.audits.length) {
      await tx.auditEvent.createMany({
        data: uow.audits.map(a => ({
          action: a.action,
          entityType: a.entityType,
          entityId: a.entityId,
          actorId: a.actorUserId ?? null,
          actorLabel: a.actorLabel ?? '',
          fromStatus: a.fromStatus ?? '',
          toStatus: a.toStatus ?? '',
          reason: a.reason ?? '',
          dataJson: toJsonValue(a.data ?? {}) as never,
          createdAt: uow.now,
        })),
      })
    }
    const { recordWebhookEvents } = await import('../../webhooks/outbound')
    const webhookEventIds = await recordWebhookEvents(tx, uow.webhooks, uow.now)
    return { value, webhookEventIds, afterCommit: uow.afterCommit }
  }, options.timeoutMs ? { ...TRANSACTION_OPTIONS, timeout: options.timeoutMs } : TRANSACTION_OPTIONS)
}
