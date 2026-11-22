'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { changePasswordAction, redeemResetAction, registerAction, requestResetAction, signInAction, type Result } from '../lib/actions'
import { Field, FormError, useKey } from './client'

export function SignInForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<Result<null> | null, FormData>(signInAction, null)
  return (
    <form action={action} className="sf-card space-y-4 p-6">
      <input type="hidden" name="next" value={next ?? ''} />
      <Field label="Email" htmlFor="email"><input id="email" name="email" type="email" required autoComplete="email" className="sf-input" /></Field>
      <Field label="Password" htmlFor="password"><input id="password" name="password" type="password" required autoComplete="current-password" className="sf-input" /></Field>
      <FormError error={state && !state.ok ? state.error : null} />
      <button className="sf-btn w-full" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
      <p className="flex flex-wrap justify-between gap-2 text-[0.95rem]">
        <Link href="/reset-password" className="font-bold text-[var(--clay)] underline">Forgot your password?</Link>
        <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-bold text-[var(--clay)] underline">Create an account</Link>
      </p>
    </form>
  )
}

export function RegisterForm() {
  const [key] = useKey()
  const [state, action, pending] = useActionState<Result<null> | null, FormData>(registerAction, null)
  const failed = state && !state.ok ? state : null
  // The server asks for the code from a quote, receipt, visit or sticker when it already knows this email or phone.
  const needsCode = Boolean(failed && (failed.field === 'code' || /code on your quote|enter the code/i.test(failed.error)))
  return (
    <form action={action} className="sf-card space-y-4 p-6">
      <input type="hidden" name="idempotencyKey" value={key} />
      <Field label="Your name" htmlFor="name"><input id="name" name="name" required autoComplete="name" className="sf-input" /></Field>
      <Field label="Email" htmlFor="email"><input id="email" name="email" type="email" required autoComplete="email" className="sf-input" /></Field>
      <Field label="Phone" htmlFor="phone"><input id="phone" name="phone" type="tel" autoComplete="tel" className="sf-input" /></Field>
      <Field label="Password" htmlFor="password" help="At least 8 characters"><input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" className="sf-input" /></Field>
      <div className={needsCode ? 'rounded-[14px] border-2 border-[var(--clay)] bg-[var(--clay-soft)] p-3' : ''}>
        <Field label="Code from your quote or receipt" htmlFor="code" help="Only if you have enquired or bought from us before" error={needsCode ? failed!.error : null}>
          <input id="code" name="code" autoComplete="off" className="sf-input font-mono" aria-invalid={needsCode || undefined} autoFocus={needsCode} />
        </Field>
      </div>
      <FormError error={failed && !needsCode ? failed.error : null} />
      <button className="sf-btn w-full" disabled={pending}>{pending ? 'Creating your account…' : 'Create account'}</button>
      <p className="text-[0.95rem]">Already have an account? <Link href="/sign-in" className="font-bold text-[var(--clay)] underline">Sign in</Link></p>
    </form>
  )
}

export function ResetRequestForm() {
  const [state, action, pending] = useActionState<Result<null> | null, FormData>(requestResetAction, null)
  if (state?.ok) return <div className="sf-card p-6" role="status"><p className="text-lg font-bold text-[var(--forest)]">Check your email</p><p className="mt-1">If that address has an account, a reset link is on its way.</p></div>
  return (
    <form action={action} className="sf-card space-y-4 p-6">
      <Field label="Email" htmlFor="email"><input id="email" name="email" type="email" required autoComplete="email" className="sf-input" /></Field>
      <FormError error={state && !state.ok ? state.error : null} />
      <button className="sf-btn w-full" disabled={pending}>{pending ? 'Sending…' : 'Send me a reset link'}</button>
    </form>
  )
}

export function ResetRedeemForm({ email, token }: { email: string; token: string }) {
  const [state, action, pending] = useActionState<Result<null> | null, FormData>(redeemResetAction, null)
  return (
    <form action={action} className="sf-card space-y-4 p-6">
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="token" value={token} />
      <Field label="New password" htmlFor="password" help="At least 8 characters"><input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" className="sf-input" /></Field>
      <FormError error={state && !state.ok ? state.error : null} />
      <button className="sf-btn w-full" disabled={pending}>{pending ? 'Saving…' : 'Set password and sign in'}</button>
    </form>
  )
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<Result<null> | null, FormData>(changePasswordAction, null)
  return (
    <form action={action} className="space-y-4">
      <Field label="New password" htmlFor="newpw" help="At least 8 characters"><input id="newpw" name="password" type="password" minLength={8} required autoComplete="new-password" className="sf-input" /></Field>
      <FormError error={state && !state.ok ? state.error : null} />
      {state?.ok && <p role="status" className="font-bold text-[var(--good)]">Password changed.</p>}
      <button className="sf-btn sf-btn-ghost" disabled={pending}>{pending ? 'Saving…' : 'Change password'}</button>
    </form>
  )
}
