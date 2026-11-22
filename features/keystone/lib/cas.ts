import { delegateOf, tableName, type Tx } from './db'
import { DomainError, Codes } from './errors'
import { actorUserId, type Actor } from './actor'
import type { UnitOfWork } from './unitOfWork'

/**
 * The one way a governed status changes (section 4):
 *   lock the row; check the caller's expected version (STALE_STATE) and the from-states
 *   (INVALID_TRANSITION); run the guard; UPDATE … WHERE id AND status AND version, bumping version;
 *   write the audit row in the same transaction.
 */
export type TransitionSpec<Row extends Record<string, unknown>> = {
  model: string
  id: string
  from: readonly string[]
  to: string
  expectedVersion?: number | null
  actor: Actor
  action: string
  reason?: string | null
  data?: Record<string, unknown> | ((row: Row) => Record<string, unknown> | Promise<Record<string, unknown>>)
  guard?: (row: Row) => void | Promise<void>
  /** Column holding the compare-and-set counter (Quote uses casVersion; its `version` is the revision). */
  versionField?: 'version' | 'casVersion'
}

export async function lockRow<Row extends Record<string, unknown>>(tx: Tx, model: string, id: string): Promise<Row> {
  const rows = await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM ${tableName(model)} WHERE id = $1 FOR UPDATE`, id)
  if (!rows.length) throw new DomainError(Codes.NOT_FOUND, `${model} not found.`)
  return (await delegateOf(tx, model).findUnique({ where: { id } })) as Row
}

export const actorLabel = (actor: Actor) => (actor.kind === 'user' ? actor.name ?? '' : actor.kind === 'guest' ? 'customer (by code)' : actor.name)

export async function transition<Row extends Record<string, unknown>>(uow: UnitOfWork, spec: TransitionSpec<Row>): Promise<Row> {
  const row = await lockRow<Row>(uow.tx, spec.model, spec.id)
  const currentStatus = String(row.status)
  const vf = spec.versionField ?? 'version'
  const currentVersion = Number(row[vf])
  if (spec.expectedVersion !== undefined && spec.expectedVersion !== null && spec.expectedVersion !== currentVersion) {
    throw new DomainError(Codes.STALE_STATE, 'This was changed by someone else. Reload and try again.', { currentStatus, currentVersion })
  }
  if (!spec.from.includes(currentStatus)) {
    throw new DomainError(Codes.INVALID_TRANSITION, `Can't move from ${currentStatus.replaceAll('_', ' ')} to ${spec.to.replaceAll('_', ' ')}.`, { currentStatus, currentVersion, to: spec.to })
  }
  if (spec.guard) await spec.guard(row)
  const extra = typeof spec.data === 'function' ? await spec.data(row) : spec.data ?? {}
  const result = await delegateOf(uow.tx, spec.model).updateMany({
    where: { id: spec.id, [vf]: currentVersion, status: currentStatus },
    data: { ...extra, status: spec.to, [vf]: { increment: 1 } },
  })
  if (result.count !== 1) throw new DomainError(Codes.STALE_STATE, 'This was changed by someone else. Reload and try again.', { currentStatus, currentVersion })
  uow.audit({
    action: spec.action,
    entityType: spec.model,
    entityId: spec.id,
    actorUserId: actorUserId(spec.actor),
    actorLabel: actorLabel(spec.actor),
    fromStatus: currentStatus,
    toStatus: spec.to,
    reason: spec.reason ?? null,
    data: extra,
  })
  return (await delegateOf(uow.tx, spec.model).findUnique({ where: { id: spec.id } })) as Row
}

/** Audit a create or a non-status change done by a command. */
export function auditChange(uow: UnitOfWork, actor: Actor, model: string, id: string, action: string, data: unknown = {}, extra: { reason?: string | null; toStatus?: string | null; fromStatus?: string | null } = {}) {
  uow.audit({ action, entityType: model, entityId: id, actorUserId: actorUserId(actor), actorLabel: actorLabel(actor), data, ...extra })
}
