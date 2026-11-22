'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { completePaymentAction, initiatePaymentAction, submitOfflinePaymentAction } from '../lib/actions'
import { money } from '../lib/format'
import { FormError, useKey } from './client'

export type Method = { code: string; label: string; kind: 'card' | 'reference'; customerCanSubmit: boolean; instructions: string; publishableKey: string }

declare global {
  interface Window { Stripe?: any }
}

function loadStripe(): Promise<any> {
  if (window.Stripe) return Promise.resolve(window.Stripe)
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-stripe]')
    const s = existing ?? document.createElement('script')
    s.addEventListener('load', () => resolve(window.Stripe))
    s.addEventListener('error', () => reject(new Error('Card payments could not load. Check your connection and try again.')))
    if (!existing) {
      s.src = 'https://js.stripe.com/v3'
      s.async = true
      s.dataset.stripe = '1'
      document.head.appendChild(s)
    }
  })
}

/**
 * Pay one payment session (S12, S13, S14): card through Stripe's Payment Element (confirmed by
 * webhook or read-back, never by the browser alone), or mobile money and bank transfer by entering
 * the reference, which staff then verify.
 */
export function PayPanel({ code, amount, currencyCode, methods, email }: { code: string; amount: number; currencyCode: string; methods: Method[]; email?: string }) {
  const usable = methods.filter(m => m.customerCanSubmit)
  const [pick, setPick] = useState(usable[0]?.code ?? '')
  const method = usable.find(m => m.code === pick)
  if (!usable.length) {
    return (
      <div className="sf-card p-5">
        <p className="font-bold text-[var(--forest)]">How to pay</p>
        {methods.map(m => m.instructions ? <p key={m.code} className="mt-2 whitespace-pre-line"><strong>{m.label}:</strong> {m.instructions}</p> : null)}
        <p className="mt-2">Pay at any branch and our team will record it. Give them the reference <strong>{code}</strong>.</p>
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="sf-label">Pay by</legend>
        <div className="flex flex-wrap gap-2">
          {usable.map(m => (
            <label key={m.code} className={`flex min-h-11 cursor-pointer items-center rounded-full border px-4 font-semibold ${pick === m.code ? 'border-[var(--forest)] bg-[var(--forest)] text-white' : 'border-[var(--line)] bg-white'}`}>
              <input type="radio" name="method" className="sr-only" checked={pick === m.code} onChange={() => setPick(m.code)} />{m.label}
            </label>
          ))}
        </div>
      </fieldset>
      {method?.kind === 'card' ? <CardPay key={code} code={code} amount={amount} currencyCode={currencyCode} email={email} /> : method ? <ReferencePay key={method.code} code={code} method={method} amount={amount} currencyCode={currencyCode} /> : null}
      {methods.some(m => !m.customerCanSubmit && m.instructions) && (
        <p className="sf-help">{methods.filter(m => !m.customerCanSubmit && m.instructions).map(m => `${m.label}: ${m.instructions}`).join(' · ')}</p>
      )}
    </div>
  )
}

function CardPay({ code, amount, currencyCode, email }: { code: string; amount: number; currencyCode: string; email?: string }) {
  const mount = useRef<HTMLDivElement>(null)
  const ref = useRef<{ stripe: any; elements: any } | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  useEffect(() => {
    let live = true
    ;(async () => {
      const r = await initiatePaymentAction(code, 'stripe', email)
      if (!live) return
      if (!r.ok) return setError(r.error)
      if (!r.data?.clientSecret || !r.data?.publishableKey) return setError('Card payments are not available right now. Choose another way to pay.')
      try {
        const Stripe = await loadStripe()
        if (!live || !mount.current) return
        const stripe = Stripe(r.data.publishableKey)
        const elements = stripe.elements({ clientSecret: r.data.clientSecret, appearance: { theme: 'stripe', variables: { colorPrimary: '#b04418', borderRadius: '12px', fontFamily: 'system-ui, sans-serif' } } })
        const el = elements.create('payment')
        el.mount(mount.current)
        el.on('ready', () => live && setReady(true))
        ref.current = { stripe, elements }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Card payments could not load.')
      }
    })()
    return () => {
      live = false
    }
  }, [code, email])

  async function pay() {
    if (!ref.current) return
    setBusy(true)
    setError(null)
    const { stripe, elements } = ref.current
    const res = await stripe.confirmPayment({ elements, confirmParams: { return_url: `${window.location.origin}/pay/${code}?back=1` }, redirect: 'if_required' })
    if (res.error) {
      setBusy(false)
      return setError(res.error.message || 'Your card was not charged. Try again or use another card.')
    }
    // The card went through at Stripe; ask our server to read it back so the record updates now.
    await completePaymentAction(code)
    setBusy(false)
    router.push(`/pay/${code}`)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div ref={mount} className="min-h-[120px] rounded-[14px] border border-[var(--line)] bg-white p-4" />
      {!ready && !error && <p className="text-[var(--muted)]" role="status">Loading secure card form…</p>}
      <FormError error={error} />
      <button type="button" className="sf-btn w-full sm:w-auto" disabled={!ready || busy} onClick={pay}>{busy ? 'Paying…' : `Pay ${money(amount, currencyCode)}`}</button>
    </div>
  )
}

function ReferencePay({ code, method, amount, currencyCode }: { code: string; method: Method; amount: number; currencyCode: string }) {
  const [key, renew] = useKey()
  const [ref, setRef] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [sent, setSent] = useState<string | null>(null)
  const router = useRouter()
  // Once sent, the form gives way to the waiting status so nobody sends the same payment twice.
  if (sent) {
    return (
      <div className="rounded-[14px] bg-[var(--sage)] p-4" role="status">
        <p className="font-bold text-[var(--forest)]">We have your reference <span className="font-mono">{sent}</span></p>
        <p className="mt-1">We are checking the {money(amount, currencyCode)} {method.label} payment and will confirm it, usually the same working day.</p>
      </div>
    )
  }
  return (
    <form
      className="space-y-4"
      onSubmit={e => {
        e.preventDefault()
        if (!ref.trim()) return setError('Enter the reference from your payment.')
        start(async () => {
          setError(null)
          const r = await submitOfflinePaymentAction({ code, provider: method.code, reference: ref.trim(), payerPhone: phone.trim() || undefined, idempotencyKey: key })
          if (!r.ok) return setError(r.error)
          renew()
          setSent(ref.trim())
          router.push(`/pay/${code}`)
          router.refresh()
        })
      }}
    >
      <div className="rounded-[14px] bg-[var(--sage)] p-4">
        <p className="font-bold text-[var(--forest)]">Send {money(amount, currencyCode)} by {method.label}</p>
        {method.instructions ? <p className="mt-1 whitespace-pre-line">{method.instructions}</p> : null}
        <p className="mt-2">Use <strong className="font-mono">{code}</strong> as the payment reference if you can.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="ref" className="sf-label">{method.code === 'bank_transfer' ? 'Transfer reference' : 'Transaction ID or reference'}</label>
          <input id="ref" value={ref} onChange={e => setRef(e.target.value)} className="sf-input font-mono" autoComplete="off" />
        </div>
        {method.code === 'mobile_money' && (
          <div>
            <label htmlFor="payer" className="sf-label">Phone you paid from <span className="font-normal text-[var(--muted)]">(optional)</span></label>
            <input id="payer" type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="sf-input" autoComplete="tel" />
          </div>
        )}
      </div>
      <FormError error={error} />
      <button className="sf-btn w-full sm:w-auto" disabled={pending}>{pending ? 'Sending…' : 'I have paid: send the reference'}</button>
      <p className="sf-help">We check the payment and confirm it, usually the same working day.</p>
    </form>
  )
}
