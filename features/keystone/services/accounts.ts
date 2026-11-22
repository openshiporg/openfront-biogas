import bcrypt from 'bcryptjs'
import type { Tx } from '../lib/db'
import type { UnitOfWork } from '../lib/unitOfWork'
import { DomainError, Codes } from '../lib/errors'
import { auditChange } from '../lib/cas'
import type { Actor } from '../lib/actor'
import { nextNumber, publicCode } from '../lib/sequence'
import { getSettings } from './settings'
import { normEmail, normPhone, str } from './util'

/**
 * Customer sign-up (S19). A new User with no role (so no dashboard), linked to a Customer. An existing
 * Customer found by email or phone is linked only when the caller also holds the public code of one of
 * that customer's quotes, orders, visits or systems: a phone number alone is not proof of who you are.
 */
export const ACCOUNT_EXISTS = 'An account with this email already exists. Sign in.'
export const NEED_CODE = 'We already have your details from an earlier enquiry or order. To link this account, enter the code on your quote, receipt or system sticker.'

export const NEED_PRIVATE_CODE = 'To link this account, enter the code on your quote or order receipt, or use the email or phone number we have on file.'

/** Whose record the code is, and whether it was sent privately (quote, order) or can be seen by others (visit, system sticker). */
export async function codeHolder(tx: Tx, code: string): Promise<{ customerId: string; private: boolean } | null> {
  const c = str(code, 40).toUpperCase()
  if (!c) return null
  const [q, o, v, s] = await Promise.all([
    tx.quote.findUnique({ where: { publicCode: c }, select: { customerId: true } }),
    tx.order.findUnique({ where: { publicCode: c }, select: { customerId: true } }),
    tx.visit.findUnique({ where: { publicCode: c }, select: { customerId: true } }),
    tx.installedSystem.findUnique({ where: { publicCode: c }, select: { customerId: true } }),
  ])
  const privateOwner = q?.customerId ?? o?.customerId
  if (privateOwner) return { customerId: privateOwner, private: true }
  const seenOwner = v?.customerId ?? s?.customerId
  return seenOwner ? { customerId: seenOwner, private: false } : null
}

export async function codeOwner(tx: Tx, code: string) {
  return (await codeHolder(tx, code))?.customerId ?? null
}

export async function registerCustomer(uow: UnitOfWork, actor: Actor, raw: { name?: string; email?: string; phone?: string; password?: string; code?: string }) {
  const tx = uow.tx
  const name = str(raw.name, 200)
  const email = normEmail(raw.email)
  const phone = normPhone(raw.phone)
  const password = typeof raw.password === 'string' ? raw.password : ''
  if (name.length < 2) throw new DomainError(Codes.INVALID_INPUT, 'Enter your name.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new DomainError(Codes.INVALID_INPUT, 'Enter a valid email address.')
  if (password.length < 8) throw new DomainError(Codes.INVALID_INPUT, 'Use a password of at least 8 characters.')
  if (password.length > 200) throw new DomainError(Codes.INVALID_INPUT, 'That password is too long.')
  const existingUser = await tx.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } })
  if (existingUser) throw new DomainError(Codes.GUARD_FAILED, ACCOUNT_EXISTS)

  const matches = await tx.customer.findMany({ where: { OR: [{ email }, ...(phone ? [{ phone }] : [])] }, select: { id: true, userId: true } })
  const holder = raw.code ? await codeHolder(tx, raw.code) : null
  let customerId: string
  let codeOnly = false
  if (matches.length) {
    const match = holder ? matches.find(m => m.id === holder.customerId) : undefined
    if (!match) throw new DomainError(Codes.GUARD_FAILED, NEED_CODE)
    if (match.userId) throw new DomainError(Codes.GUARD_FAILED, ACCOUNT_EXISTS)
    customerId = match.id
    // The customer's email becomes the login email they just proved.
    await tx.customer.update({ where: { id: customerId }, data: { email, ...(phone ? { phone } : {}) } })
  } else if (holder) {
    // Nothing on file under this email or phone. Only a code sent privately (quote, order) proves who they
    // are; a visit code or the sticker on the digester can be read by anyone passing. The customer's email
    // and phone on file stay as they are: the login email lives on the User.
    if (!holder.private) throw new DomainError(Codes.GUARD_FAILED, NEED_PRIVATE_CODE)
    const owner = await tx.customer.findUnique({ where: { id: holder.customerId }, select: { id: true, userId: true } })
    if (!owner) throw new DomainError(Codes.GUARD_FAILED, NEED_PRIVATE_CODE)
    if (owner.userId) throw new DomainError(Codes.GUARD_FAILED, ACCOUNT_EXISTS)
    customerId = owner.id
    codeOnly = true
  } else {
    const settings = await getSettings(tx)
    const created = await tx.customer.create({
      data: { number: await nextNumber(tx, 'C'), name, email, phone, type: 'household', currencyCode: settings.currencyCode, referralCode: publicCode('R', 2).replace(/-/g, '').slice(0, 9), contactConsent: false },
    })
    customerId = created.id
  }
  const user = await tx.user.create({ data: { name, email, phone, password: await bcrypt.hash(password, 10), isActive: true, roleId: null, customer: { connect: { id: customerId } } } })
  auditChange(uow, actor, 'User', user.id, matches.length || codeOnly ? 'customer.account_linked' : 'customer.registered', { customerId, ...(codeOnly ? { linkedBy: 'code', loginEmail: email } : {}) })
  return { customerId }
}
