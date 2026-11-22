'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { createTicketAction } from '../lib/actions'
import { Field, FormError, useKey } from './client'

const CATEGORIES = [
  ['no_gas', 'No gas'],
  ['low_pressure', 'Weak flame or low pressure'],
  ['smell', 'Gas smell'],
  ['leak', 'Leak'],
  ['stove_fault', 'Stove or lamp not working'],
  ['slurry_overflow', 'Slurry overflowing'],
  ['other', 'Something else'],
] as const

/** S18: report a problem, signed in (pick the system) or by the code on the system's sticker. */
export function TicketForm({ systems, signedIn, phone, initialCode }: { systems: { id: string; label: string }[]; signedIn: boolean; phone: string; initialCode?: string }) {
  const [key, renew] = useKey()
  const [category, setCategory] = useState<string>('no_gas')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ number: string; id: string | null } | null>(null)
  const [pending, start] = useTransition()

  if (done) {
    return (
      <div className="sf-card space-y-3 p-6" role="status">
        <h2 className="text-2xl font-extrabold">We have your report</h2>
        <p className="text-lg">Your reference is <strong className="text-[var(--clay)]">{done.number}</strong>. Our team will call you back.</p>
        {done.id ? <Link href={`/account/support/${done.id}`} className="sf-btn">Follow this report</Link> : <p>Keep the reference handy if you call us.</p>}
      </div>
    )
  }

  return (
    <form
      className="sf-card space-y-5 p-6"
      noValidate
      onSubmit={e => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        const g = (k: string) => String(fd.get(k) ?? '').trim()
        const input: Record<string, unknown> = { category, description: g('description'), callbackPhone: g('callbackPhone'), severity: ['smell', 'leak'].includes(category) ? 'urgent' : undefined }
        if (signedIn && systems.length) input.systemId = g('systemId')
        else input.systemCode = g('systemCode')
        if (!input.description) return setError('Tell us what is happening.')
        if (!signedIn && !input.systemCode) return setError('Enter the code on your system’s sticker, or sign in.')
        start(async () => {
          setError(null)
          const r = await createTicketAction(input, key)
          if (!r.ok) return setError(r.error)
          setDone(r.data as { number: string; id: string | null })
          renew()
        })
      }}
    >
      {['smell', 'leak'].includes(category) && (
        <p role="alert" className="rounded-[12px] border border-[#e7b6a8] bg-[#fbeae5] px-4 py-3 font-semibold text-[#8f2a15]">If you smell gas: turn off the gas valve, put out any flame, open doors and windows and keep away from the digester.{phone ? <> Call us now on <a className="underline" href={`tel:${phone.replace(/[^\d+]/g, '')}`}>{phone}</a>.</> : null}</p>
      )}
      {signedIn && systems.length > 0 ? (
        <Field label="Which system?" htmlFor="systemId">
          <select id="systemId" name="systemId" className="sf-input">{systems.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        </Field>
      ) : (
        <Field label="Code on your system’s sticker" htmlFor="systemCode" help={signedIn ? undefined : 'Or sign in to pick your system'}>
          <input id="systemCode" name="systemCode" className="sf-input font-mono uppercase" defaultValue={initialCode} autoComplete="off" />
        </Field>
      )}
      <fieldset>
        <legend className="sf-label">What is wrong?</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(([v, l]) => (
            <label key={v} className={`flex min-h-11 cursor-pointer items-center rounded-full border px-4 font-semibold ${category === v ? 'border-[var(--forest)] bg-[var(--forest)] text-white' : 'border-[var(--line)] bg-white'}`}>
              <input type="radio" name="category" className="sr-only" checked={category === v} onChange={() => setCategory(v)} />{l}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Tell us more" htmlFor="description" help="When it started, what you have tried"><textarea id="description" name="description" className="sf-input" rows={4} /></Field>
      <Field label="Phone to call you back on" htmlFor="callbackPhone"><input id="callbackPhone" name="callbackPhone" type="tel" className="sf-input" autoComplete="tel" /></Field>
      <FormError error={error} />
      <button className="sf-btn" disabled={pending}>{pending ? 'Sending…' : 'Send report'}</button>
    </form>
  )
}
