'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { CART_COOKIE, SESSION_COOKIE, gql } from './data/client'

/*
 * Every storefront write is one named GraphQL operation run as the visitor. Forms carry their own
 * idempotency key (made once when the form renders) so a double click or a retry never doubles a
 * request, a booking or a payment.
 */

export type Result<T = unknown> = { ok: true; data: T } | { ok: false; error: string; code?: string | null; field?: string | null }

async function call<T>(query: string, variables: Record<string, unknown>, key: string): Promise<Result<T>> {
  const r = await gql<Record<string, T>>(query, variables)
  if (!r.ok) return { ok: false, error: r.error, code: r.code, field: r.field }
  return { ok: true, data: r.data[key] }
}

const secure = process.env.NODE_ENV === 'production'

/* ----------------------------------------------------------------- sizing, leads, survey */

export async function sizeSystemAction(input: Record<string, unknown>) {
  return call<any>('mutation($input: JSON!) { sizeSystem(input: $input) }', { input }, 'sizeSystem')
}

export async function submitQuoteRequestAction(input: Record<string, unknown>, idempotencyKey: string) {
  return call<any>('mutation($input: JSON!, $k: String!) { submitQuoteRequest(input: $input, idempotencyKey: $k) }', { input, k: idempotencyKey }, 'submitQuoteRequest')
}

export async function slotsAction(args: { from?: string; days?: number; postcode?: string; region?: string; country?: string }) {
  return call<any>('query($from: String, $days: Int, $postcode: String, $region: String, $country: String) { availableVisitSlots(from: $from, days: $days, postcode: $postcode, region: $region, country: $country) }', args, 'availableVisitSlots')
}

export async function checkAreaAction(args: { postcode?: string; region?: string; country?: string }) {
  return call<any>('query($postcode: String, $region: String, $country: String) { checkServiceArea(postcode: $postcode, region: $region, country: $country) }', args, 'checkServiceArea')
}

export async function bookSurveyAction(leadCode: string, date: string, slotIndex: number, idempotencyKey: string) {
  return call<any>('mutation($c: String!, $d: String!, $s: Int!, $k: String!) { bookSurveyVisit(leadCode: $c, date: $d, slotIndex: $s, idempotencyKey: $k) }', { c: leadCode, d: date, s: slotIndex, k: idempotencyKey }, 'bookSurveyVisit')
}

/* ----------------------------------------------------------------- quotes */

export async function acceptQuoteAction(a: { code: string; optionId: string; planOfferId: string | null; signedName: string; idempotencyKey: string }) {
  const r = await call<any>('mutation($code: String!, $o: ID!, $p: ID, $n: String!, $k: String!) { acceptQuote(code: $code, optionId: $o, planOfferId: $p, signedName: $n, idempotencyKey: $k) }', { code: a.code, o: a.optionId, p: a.planOfferId, n: a.signedName, k: a.idempotencyKey }, 'acceptQuote')
  if (r.ok) revalidatePath(`/quote/${a.code}`)
  return r
}

export async function declineQuoteAction(code: string, reason: string, idempotencyKey: string) {
  const r = await call<any>('mutation($code: String!, $r: String, $k: String!) { declineQuote(code: $code, reason: $r, idempotencyKey: $k) }', { code, r: reason, k: idempotencyKey }, 'declineQuote')
  if (r.ok) revalidatePath(`/quote/${code}`)
  return r
}

export async function acceptServiceQuoteAction(a: { code: string; optionId: string; signedName: string; idempotencyKey: string; ticketId: string }) {
  const r = await call<any>('mutation($code: String!, $o: ID!, $n: String!, $k: String!) { acceptServiceQuote(code: $code, optionId: $o, signedName: $n, idempotencyKey: $k) }', { code: a.code, o: a.optionId, n: a.signedName, k: a.idempotencyKey }, 'acceptServiceQuote')
  if (r.ok) revalidatePath(`/account/support/${a.ticketId}`)
  return r
}

/* ----------------------------------------------------------------- cart and checkout */

async function keepCartToken(token: string | null | undefined) {
  if (!token) return
  const jar = await cookies()
  jar.set(CART_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 30 * 86400 })
}

export async function addToCartAction(productId: string, quantity: number) {
  const r = await call<any>('mutation($p: ID!, $q: Int!) { addToCart(productId: $p, quantity: $q) }', { p: productId, q: quantity }, 'addToCart')
  if (r.ok) {
    await keepCartToken(r.data?.cartToken)
    revalidatePath('/', 'layout')
  }
  return r
}

export async function updateCartLineAction(lineId: string, quantity: number) {
  const r = await call<any>('mutation($l: ID!, $q: Int!) { updateCartLine(lineId: $l, quantity: $q) }', { l: lineId, q: quantity }, 'updateCartLine')
  if (r.ok) revalidatePath('/', 'layout')
  return r
}

export async function removeCartLineAction(lineId: string) {
  const r = await call<any>('mutation($l: ID!) { removeCartLine(lineId: $l) }', { l: lineId }, 'removeCartLine')
  if (r.ok) revalidatePath('/', 'layout')
  return r
}

export async function setFulfilmentAction(input: Record<string, unknown>) {
  return call<any>('mutation($input: JSON!) { setCartFulfilment(input: $input) }', { input }, 'setCartFulfilment')
}

export async function completeCartAction(idempotencyKey: string) {
  const r = await call<{ orderCode: string; sessionCode: string }>('mutation($k: String!) { completeCart(idempotencyKey: $k) }', { k: idempotencyKey }, 'completeCart')
  if (r.ok) {
    const jar = await cookies()
    jar.delete(CART_COOKIE)
    revalidatePath('/', 'layout')
  }
  return r
}

/* ----------------------------------------------------------------- payments */

export async function initiatePaymentAction(code: string, provider: string, email?: string) {
  return call<any>('mutation($c: String!, $p: String!, $e: String) { initiatePaymentSession(code: $c, provider: $p, email: $e) }', { c: code, p: provider, e: email || null }, 'initiatePaymentSession')
}

export async function completePaymentAction(code: string) {
  const r = await call<any>('mutation($c: String!) { completePaymentSession(code: $c) }', { c: code }, 'completePaymentSession')
  revalidatePath(`/pay/${code}`)
  return r
}

export async function submitOfflinePaymentAction(a: { code: string; provider: string; reference: string; payerPhone?: string; idempotencyKey: string }) {
  const r = await call<any>('mutation($c: String!, $p: String!, $r: String!, $ph: String, $k: String!) { submitOfflinePayment(code: $c, provider: $p, reference: $r, payerPhone: $ph, idempotencyKey: $k) }', { c: a.code, p: a.provider, r: a.reference, ph: a.payerPhone || null, k: a.idempotencyKey }, 'submitOfflinePayment')
  revalidatePath(`/pay/${a.code}`)
  return r
}

export async function payInstallmentAction(a: { planId: string; installmentIds?: string[]; payoff?: boolean; idempotencyKey: string }) {
  return call<{ sessionCode: string; amount: number; currencyCode: string }>('mutation($p: ID!, $i: [ID!], $o: Boolean, $k: String!) { payInstallment(planId: $p, installmentIds: $i, payoff: $o, idempotencyKey: $k) }', { p: a.planId, i: a.installmentIds ?? null, o: Boolean(a.payoff), k: a.idempotencyKey }, 'payInstallment')
}

export async function subscribeToPlanAction(planId: string, systemId: string, idempotencyKey: string) {
  return call<any>('mutation($p: ID!, $s: ID!, $k: String!) { subscribeToPlan(planId: $p, systemId: $s, idempotencyKey: $k) }', { p: planId, s: systemId, k: idempotencyKey }, 'subscribeToPlan')
}

/* ----------------------------------------------------------------- visits, tickets, prep */

export async function rescheduleVisitAction(code: string, date: string, slotIndex: number, idempotencyKey: string) {
  const r = await call<any>('mutation($c: String!, $d: String!, $s: Int!, $k: String!) { rescheduleVisitByCode(code: $c, date: $d, slotIndex: $s, idempotencyKey: $k) }', { c: code, d: date, s: slotIndex, k: idempotencyKey }, 'rescheduleVisitByCode')
  if (r.ok) revalidatePath(`/visit/${code}`)
  return r
}

export async function cancelVisitAction(code: string, reason: string, idempotencyKey: string) {
  const r = await call<any>('mutation($c: String!, $r: String, $k: String!) { cancelVisitByCode(code: $c, reason: $r, idempotencyKey: $k) }', { c: code, r: reason, k: idempotencyKey }, 'cancelVisitByCode')
  if (r.ok) revalidatePath(`/visit/${code}`)
  return r
}

export async function createTicketAction(input: Record<string, unknown>, idempotencyKey: string) {
  return call<any>('mutation($input: JSON!, $k: String!) { createTicket(input: $input, idempotencyKey: $k) }', { input, k: idempotencyKey }, 'createTicket')
}

export async function prepTaskAction(taskId: string, done: boolean, idempotencyKey: string, path: string) {
  const r = await call<any>('mutation($t: ID!, $d: Boolean!, $k: String!) { completeSitePrepTask(taskId: $t, done: $d, idempotencyKey: $k) }', { t: taskId, d: done, k: idempotencyKey }, 'completeSitePrepTask')
  if (r.ok) revalidatePath(path)
  return r
}

export async function updateProfileAction(input: Record<string, unknown>) {
  const r = await call<any>('mutation($input: JSON!) { updateMyProfile(input: $input) }', { input }, 'updateMyProfile')
  if (r.ok) revalidatePath('/account', 'layout')
  return r
}

/* ----------------------------------------------------------------- accounts */

const SIGN_IN_ERROR = 'That email and password do not match. Try again, or reset your password.'

async function startSession(email: string, password: string): Promise<Result<null>> {
  const r = await gql<{ a: { sessionToken?: string; message?: string } | null }>(
    `mutation($e: String!, $p: String!) { a: authenticateUserWithPassword(email: $e, password: $p) {
      ... on UserAuthenticationWithPasswordSuccess { sessionToken }
      ... on UserAuthenticationWithPasswordFailure { message } } }`,
    { e: email, p: password },
  )
  if (!r.ok) return { ok: false, error: r.error }
  const token = r.data.a?.sessionToken
  if (!token) return { ok: false, error: SIGN_IN_ERROR }
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 30 * 86400 })
  return { ok: true, data: null }
}

const safeNext = (v: unknown) => {
  const s = typeof v === 'string' ? v : ''
  return s.startsWith('/') && !s.startsWith('//') ? s : '/account'
}

export async function signInAction(_prev: Result<null> | null, form: FormData): Promise<Result<null>> {
  const email = String(form.get('email') || '').trim()
  const password = String(form.get('password') || '')
  if (!email || !password) return { ok: false, error: 'Enter your email and password.' }
  const r = await startSession(email, password)
  if (!r.ok) return r
  const who = await gql<{ authenticatedItem: { role: { canAccessDashboard: boolean } | null } | null }>('{ authenticatedItem { ... on User { role { canAccessDashboard } } } }')
  if (who.ok && who.data.authenticatedItem?.role?.canAccessDashboard) redirect('/dashboard')
  redirect(safeNext(form.get('next')))
}

export async function registerAction(_prev: Result<null> | null, form: FormData): Promise<Result<null>> {
  const input = {
    name: String(form.get('name') || '').trim(),
    email: String(form.get('email') || '').trim(),
    phone: String(form.get('phone') || '').trim(),
    password: String(form.get('password') || ''),
    code: String(form.get('code') || '').trim() || undefined,
    idempotencyKey: String(form.get('idempotencyKey') || ''),
  }
  if (!input.name || !input.email || input.password.length < 8) return { ok: false, error: 'Enter your name, email and a password of at least 8 characters.' }
  // The server refuses to link an email or phone already on file unless `code` proves it (field: 'code').
  const r = await gql<{ registerCustomer: { customerId: string } | null }>('mutation($input: JSON!) { registerCustomer(input: $input) }', { input })
  if (!r.ok) return { ok: false, error: r.error, code: r.code, field: r.field }
  const s = await startSession(input.email, input.password)
  if (!s.ok) return s
  redirect('/account')
}

export async function requestResetAction(_prev: Result<null> | null, form: FormData): Promise<Result<null>> {
  const email = String(form.get('email') || '').trim()
  if (!email) return { ok: false, error: 'Enter your email.' }
  const r = await gql('mutation($e: String!) { sendUserPasswordResetLink(email: $e) }', { e: email })
  if (!r.ok) return { ok: false, error: r.error }
  return { ok: true, data: null }
}

export async function redeemResetAction(_prev: Result<null> | null, form: FormData): Promise<Result<null>> {
  const email = String(form.get('email') || '').trim()
  const token = String(form.get('token') || '')
  const password = String(form.get('password') || '')
  if (password.length < 8) return { ok: false, error: 'Use at least 8 characters.' }
  const r = await gql<{ redeemUserPasswordResetToken: { code: string } | null }>('mutation($e: String!, $t: String!, $p: String!) { redeemUserPasswordResetToken(email: $e, token: $t, password: $p) { code } }', { e: email, t: token, p: password })
  if (!r.ok) return { ok: false, error: r.error }
  if (r.data.redeemUserPasswordResetToken?.code) return { ok: false, error: 'That reset link has expired or was already used. Ask for a new one.' }
  const s = await startSession(email, password)
  if (!s.ok) return s
  redirect('/account')
}

export async function changePasswordAction(_prev: Result<null> | null, form: FormData): Promise<Result<null>> {
  const password = String(form.get('password') || '')
  if (password.length < 8) return { ok: false, error: 'Use at least 8 characters.' }
  const me = await gql<{ authenticatedItem: { id: string } | null }>('{ authenticatedItem { ... on User { id } } }')
  if (!me.ok || !me.data.authenticatedItem) return { ok: false, error: 'Please sign in again.' }
  const r = await gql('mutation($id: ID!, $p: String!) { updateUser(where: { id: $id }, data: { password: $p }) { id } }', { id: me.data.authenticatedItem.id, p: password })
  if (!r.ok) return { ok: false, error: r.error }
  return { ok: true, data: null }
}

export async function signOutAction() {
  await gql('mutation { endSession }')
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
  redirect('/')
}
