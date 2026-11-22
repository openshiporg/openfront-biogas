import { isSignedIn, permissionNames, type Permission, type Session } from '../access'
import { DomainError, Codes } from './errors'

/**
 * Who is acting: a staff user with their role's permissions, a customer login (its own Customer only),
 * a guest holding a public code, or the server itself (webhooks, onboarding).
 */
export type Actor =
  | { kind: 'user'; userId: string; name?: string; customerId: string | null; discountLimitPercent: number; permissions: ReadonlySet<Permission> }
  | { kind: 'guest'; key: string }
  | { kind: 'system'; name: string }

export function actorFromSession(session: Session | null | undefined): Actor {
  if (!session || !isSignedIn({ session })) throw new DomainError(Codes.NOT_AUTHORIZED, 'Sign in to continue.')
  const role = session.data.role
  const granted = new Set<Permission>(role ? permissionNames.filter(name => role[name] === true) : [])
  return {
    kind: 'user',
    userId: session.itemId,
    name: session.data.name,
    customerId: session.data.customer?.id ?? null,
    discountLimitPercent: Number(role?.discountLimitPercent ?? 0),
    permissions: granted,
  }
}

/** Signed-in actor if there is a session, otherwise a guest keyed by the public code it holds. */
export function actorOrGuest(session: Session | null | undefined, guestKey: string): Actor {
  if (session && isSignedIn({ session })) return actorFromSession(session)
  return { kind: 'guest', key: guestKey }
}

export const systemActor = (name: string): Actor => ({ kind: 'system', name })

export const can = (actor: Actor, permission: Permission) =>
  actor.kind === 'system' || (actor.kind === 'user' && actor.permissions.has(permission))

export const isStaffActor = (actor: Actor) => actor.kind === 'system' || (actor.kind === 'user' && actor.permissions.has('canAccessDashboard'))

export function requirePermission(actor: Actor, ...anyOf: Permission[]) {
  if (actor.kind === 'system') return
  if (actor.kind !== 'user' || !anyOf.some(permission => actor.permissions.has(permission))) {
    throw new DomainError(Codes.NOT_AUTHORIZED, `This needs the ${anyOf.join(' or ')} permission.`)
  }
}

export function requireCustomer(actor: Actor): string {
  if (actor.kind !== 'user' || !actor.customerId) throw new DomainError(Codes.NOT_AUTHORIZED, 'Sign in with your customer account.')
  return actor.customerId
}

export const principalKey = (actor: Actor) =>
  actor.kind === 'user' ? `user:${actor.userId}` : actor.kind === 'guest' ? `guest:${actor.key}` : `system:${actor.name}`

export const actorUserId = (actor: Actor) => (actor.kind === 'user' ? actor.userId : null)
