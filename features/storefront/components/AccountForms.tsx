'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { payInstallmentAction, subscribeToPlanAction, updateProfileAction } from '../lib/actions'
import { money, word } from '../lib/format'
import { Field, FormError, useKey } from './client'

/* S22: pay one instalment, several, or the whole balance. Opens a pay link for that amount. */

// Language codes as stored on the customer, with the names people know them by.
const LANGUAGES: string[][] = [['en', 'English'], ['es', 'Spanish (Español)'], ['fr', 'French (Français)'], ['pt', 'Portuguese (Português)'], ['sw', 'Swahili (Kiswahili)'], ['hi', 'Hindi (हिन्दी)'], ['vi', 'Vietnamese (Tiếng Việt)'], ['zh', 'Chinese (中文)']]

export function PayPlan({ planId, currencyCode, open, balance }: { planId: string; currencyCode: string; open: { id: string; label: string; left: number }[]; balance: number }) {
  const [picked, setPicked] = useState<string[]>(open[0] ? [open[0].id] : [])
  const [error, setError] = useState<string | null>(null)
  const [key] = useKey()
  const [okey] = useKey()
  const [pending, start] = useTransition()
  const router = useRouter()
  // Payment always covers the oldest unpaid first, so picking is "the first N".
  const total = open.filter(i => picked.includes(i.id)).reduce((s, i) => s + i.left, 0)
  const go = (payoff: boolean) =>
    start(async () => {
      setError(null)
      const r = await payInstallmentAction({ planId, installmentIds: payoff ? undefined : picked, payoff, idempotencyKey: payoff ? okey : key })
      if (!r.ok) return setError(r.error)
      router.push(`/pay/${r.data.sessionCode}`)
    })
  if (!open.length) return null
  return (
    <div className="space-y-3 rounded-[14px] bg-[var(--cream-2)] p-4">
      <fieldset>
        <legend className="sf-label">Pay now</legend>
        <ul className="space-y-1">
          {open.map((i, idx) => (
            <li key={i.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3">
                <input type="checkbox" className="h-5 w-5 accent-[var(--clay)]" checked={picked.includes(i.id)} onChange={e => setPicked(e.target.checked ? open.slice(0, idx + 1).map(x => x.id) : open.slice(0, idx).map(x => x.id))} />
                <span>{i.label}: {money(i.left, currencyCode)}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <FormError error={error} />
      <div className="flex flex-wrap gap-3">
        <button type="button" className="sf-btn" disabled={pending || !picked.length} onClick={() => go(false)}>Pay {money(total, currencyCode)}</button>
        {open.length > 1 && <button type="button" className="sf-btn sf-btn-ghost" disabled={pending} onClick={() => go(true)}>Pay off everything ({money(balance, currencyCode)})</button>}
      </div>
      {open.length > 1 && <p className="sf-help">Paying it all off early waives the rest of the plan fee.</p>}
    </div>
  )
}

/* S23: buy a service plan for one system. */
export function BuyPlan({ systemId, plans }: { systemId: string; plans: { id: string; name: string; priceAmount: number; currencyCode: string; billing: string; visitsPerYear: number }[] }) {
  const [pick, setPick] = useState(plans[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [key] = useKey()
  const [pending, start] = useTransition()
  const router = useRouter()
  if (!plans.length) return null
  return (
    <div className="space-y-3">
      <fieldset className="space-y-2">
        <legend className="sf-label">Choose a plan</legend>
        {plans.map(p => (
          <label key={p.id} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-[14px] border px-4 ${pick === p.id ? 'border-[var(--clay)] bg-[var(--clay-soft)]' : 'border-[var(--line)] bg-white'}`}>
            <input type="radio" name="plan" className="h-5 w-5 accent-[var(--clay)]" checked={pick === p.id} onChange={() => setPick(p.id)} />
            <span><strong>{p.name}</strong>: {money(p.priceAmount, p.currencyCode)} {word(p.billing)}{p.visitsPerYear ? `, ${p.visitsPerYear} visit${p.visitsPerYear === 1 ? '' : 's'} a year` : ''}</span>
          </label>
        ))}
      </fieldset>
      <FormError error={error} />
      <button
        type="button"
        className="sf-btn"
        disabled={pending || !pick}
        onClick={() =>
          start(async () => {
            setError(null)
            const r = await subscribeToPlanAction(pick, systemId, key)
            if (!r.ok) return setError(r.error)
            router.push(`/pay/${r.data.sessionCode}`)
          })
        }
      >
        {pending ? 'Starting…' : 'Buy this plan'}
      </button>
    </div>
  )
}

/* S25 */
export function ProfileForm({ p }: { p: { name: string; phone: string | null; altPhone: string | null; preferredLanguage: string | null; preferredContact: string | null; contactConsent: boolean; email: string | null } }) {
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()
  return (
    <form
      className="space-y-4"
      onSubmit={e => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        const g = (k: string) => String(fd.get(k) ?? '').trim()
        start(async () => {
          setError(null)
          setSaved(false)
          const r = await updateProfileAction({ name: g('name'), phone: g('phone'), altPhone: g('altPhone'), preferredLanguage: g('preferredLanguage'), preferredContact: g('preferredContact'), contactConsent: fd.get('contactConsent') === 'on' })
          if (!r.ok) return setError(r.error)
          setSaved(true)
        })
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="p-name"><input id="p-name" name="name" defaultValue={p.name} className="sf-input" autoComplete="name" /></Field>
        <Field label="Email" htmlFor="p-email" help="Call us to change the email you sign in with"><input id="p-email" value={p.email ?? ''} readOnly className="sf-input bg-[var(--cream-2)]" /></Field>
        <Field label="Phone" htmlFor="p-phone"><input id="p-phone" name="phone" type="tel" defaultValue={p.phone ?? ''} className="sf-input" autoComplete="tel" /></Field>
        <Field label="Other phone" htmlFor="p-alt"><input id="p-alt" name="altPhone" type="tel" defaultValue={p.altPhone ?? ''} className="sf-input" /></Field>
        <Field label="Language" htmlFor="p-lang" help="The language we speak and write to you in">
          <select id="p-lang" name="preferredLanguage" defaultValue={p.preferredLanguage || 'en'} className="sf-input">
            {/* Keep a code saved earlier that isn't in the list, so saving the form doesn't change it. */}
            {[...LANGUAGES, ...(p.preferredLanguage && !LANGUAGES.some(l => l[0] === p.preferredLanguage) ? [[p.preferredLanguage, p.preferredLanguage]] : [])].map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </select>
        </Field>
        <Field label="Best way to reach you" htmlFor="p-contact">
          <select id="p-contact" name="preferredContact" defaultValue={p.preferredContact ?? 'call'} className="sf-input"><option value="call">Phone call</option><option value="whatsapp">WhatsApp</option><option value="sms">Text message</option><option value="email">Email</option></select>
        </Field>
      </div>
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" name="contactConsent" defaultChecked={p.contactConsent} className="h-5 w-5 accent-[var(--clay)]" />You can contact me about offers and service reminders</label>
      <FormError error={error} />
      {saved && <p role="status" className="font-bold text-[var(--good)]">Saved.</p>}
      <button className="sf-btn" disabled={pending}>{pending ? 'Saving…' : 'Save'}</button>
    </form>
  )
}
