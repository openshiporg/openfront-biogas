'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { completeCartAction, setFulfilmentAction } from '../lib/actions'
import { money } from '../lib/format'
import type { Cart } from '../lib/data/cart'
import { Field, FormError, useKey } from './client'

/**
 * S11: delivery to a served area or pickup at a branch, then one order and one payment link.
 * Prices, delivery and tax always come back from the server; nothing is worked out here.
 */
export function Checkout({ cart: initial, branches, country, viewer }: { cart: Cart; branches: { id: string; name: string; address: string }[]; country: string; viewer: { name: string; email: string; phone: string } | null }) {
  const [cart, setCart] = useState(initial)
  const [how, setHow] = useState<'delivery' | 'pickup'>(initial.fulfilment ?? (branches.length ? 'pickup' : 'delivery'))
  const [branchId, setBranchId] = useState(initial.pickupBranch?.id ?? branches[0]?.id ?? '')
  const [c, setC] = useState({ name: initial.name ?? viewer?.name ?? '', email: initial.email ?? viewer?.email ?? '', phone: initial.phone ?? viewer?.phone ?? '' })
  const [a, setA] = useState({ addressLine: initial.address?.addressLine ?? '', city: initial.address?.city ?? '', region: initial.address?.region ?? '', postcode: initial.address?.postcode ?? '', directions: initial.address?.directions ?? '' })
  const [saved, setSaved] = useState(Boolean(initial.fulfilment && (initial.serviceArea || initial.pickupBranch)))
  const [error, setError] = useState<string | null>(null)
  const [key] = useKey()
  const [pending, start] = useTransition()
  const router = useRouter()
  const m = (v: number) => money(v, cart.currencyCode)
  const dirty = () => setSaved(false)

  function save(then?: () => void) {
    if (!c.name.trim() || (!c.phone.trim() && !c.email.trim())) return setError('Enter your name and a phone number or email.')
    start(async () => {
      setError(null)
      const r = await setFulfilmentAction({ fulfilment: how, pickupBranchId: how === 'pickup' ? branchId : null, address: { ...a, country }, name: c.name.trim(), email: c.email.trim(), phone: c.phone.trim() })
      if (!r.ok) return setError(r.error)
      setCart(r.data as Cart)
      setSaved(true)
      then?.()
    })
  }

  function place() {
    start(async () => {
      setError(null)
      const r = await completeCartAction(key)
      if (!r.ok) return setError(r.error)
      router.push(`/pay/${r.data.sessionCode}`)
    })
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
      <form className="space-y-6" onSubmit={e => { e.preventDefault(); save() }} noValidate>
        <fieldset className="sf-card space-y-4 p-6">
          <legend className="float-left mb-2 text-xl font-bold text-[var(--forest)]">Your details</legend>
          <div className="clear-left grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="co-name"><input id="co-name" className="sf-input" autoComplete="name" value={c.name} onChange={e => { setC({ ...c, name: e.target.value }); dirty() }} /></Field>
            <Field label="Phone" htmlFor="co-phone"><input id="co-phone" type="tel" className="sf-input" autoComplete="tel" value={c.phone} onChange={e => { setC({ ...c, phone: e.target.value }); dirty() }} /></Field>
            <Field label="Email" htmlFor="co-email" help="For your receipt"><input id="co-email" type="email" className="sf-input" autoComplete="email" value={c.email} onChange={e => { setC({ ...c, email: e.target.value }); dirty() }} /></Field>
          </div>
        </fieldset>
        <fieldset className="sf-card space-y-4 p-6">
          <legend className="float-left mb-2 text-xl font-bold text-[var(--forest)]">Delivery or pickup</legend>
          <div className="clear-left flex flex-wrap gap-2">
            {(['delivery', 'pickup'] as const).filter(h => h === 'delivery' || branches.length).map(h => (
              <label key={h} className={`flex min-h-11 cursor-pointer items-center rounded-full border px-4 font-semibold ${how === h ? 'border-[var(--forest)] bg-[var(--forest)] text-white' : 'border-[var(--line)] bg-white'}`}>
                <input type="radio" name="how" className="sr-only" checked={how === h} onChange={() => { setHow(h); dirty() }} />{h === 'delivery' ? 'Deliver to me' : 'I will collect'}
              </label>
            ))}
          </div>
          {how === 'pickup' ? (
            <div className="space-y-2">
              {branches.map(b => (
                <label key={b.id} className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-[14px] border px-4 py-3 ${branchId === b.id ? 'border-[var(--clay)] bg-[var(--clay-soft)]' : 'border-[var(--line)] bg-white'}`}>
                  <input type="radio" name="branch" className="mt-1 h-5 w-5 accent-[var(--clay)]" checked={branchId === b.id} onChange={() => { setBranchId(b.id); dirty() }} />
                  <span><strong>{b.name}</strong>{b.address && <span className="block text-sm text-[var(--muted)]">{b.address}</span>}</span>
                </label>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Address" htmlFor="co-a1"><input id="co-a1" className="sf-input" autoComplete="street-address" value={a.addressLine} onChange={e => { setA({ ...a, addressLine: e.target.value }); dirty() }} /></Field>
              <Field label="Town" htmlFor="co-city"><input id="co-city" className="sf-input" autoComplete="address-level2" value={a.city} onChange={e => { setA({ ...a, city: e.target.value }); dirty() }} /></Field>
              <Field label="Region" htmlFor="co-region"><input id="co-region" className="sf-input" autoComplete="address-level1" value={a.region} onChange={e => { setA({ ...a, region: e.target.value }); dirty() }} /></Field>
              <Field label="Postcode" htmlFor="co-pc"><input id="co-pc" className="sf-input" autoComplete="postal-code" value={a.postcode} onChange={e => { setA({ ...a, postcode: e.target.value }); dirty() }} /></Field>
              <div className="sm:col-span-2"><Field label="Directions" htmlFor="co-dir"><textarea id="co-dir" className="sf-input" rows={2} value={a.directions} onChange={e => { setA({ ...a, directions: e.target.value }); dirty() }} /></Field></div>
            </div>
          )}
          {!saved && <button className="sf-btn sf-btn-ghost" disabled={pending}>{pending ? 'Checking…' : how === 'delivery' ? 'Check delivery and price' : 'Use this branch'}</button>}
          {saved && <p className="font-bold text-[var(--good)]" role="status">{how === 'delivery' ? `We deliver to ${cart.serviceArea?.name ?? 'you'}.` : `Collect from ${cart.pickupBranch?.name ?? 'the branch'}.`}</p>}
        </fieldset>
      </form>

      <aside className="sf-card h-fit space-y-3 p-6">
        <h2 className="text-xl font-bold">Order summary</h2>
        <ul className="space-y-1 text-[0.95rem]">{cart.lines.map(l => <li key={l.id} className="flex justify-between gap-2"><span>{l.quantity} × {l.name}</span><span>{m(l.totalAmount)}</span></li>)}</ul>
        <dl className="space-y-1 border-t border-[var(--line)] pt-3">
          <div className="flex justify-between"><dt>Items</dt><dd>{m(cart.subtotalAmount)}</dd></div>
          {cart.discountAmount > 0 && <div className="flex justify-between text-[var(--good)]"><dt>Service plan discount ({cart.planDiscountPercent}%)</dt><dd>−{m(cart.discountAmount)}</dd></div>}
          <div className="flex justify-between"><dt>Delivery</dt><dd>{saved ? (cart.deliveryAmount ? m(cart.deliveryAmount) : 'Free') : '—'}</dd></div>
          {cart.taxAmount > 0 && <div className="flex justify-between"><dt>Tax</dt><dd>{m(cart.taxAmount)}</dd></div>}
          <div className="flex justify-between text-xl font-bold text-[var(--forest)]"><dt>Total</dt><dd>{m(cart.totalAmount)}</dd></div>
        </dl>
        <FormError error={error} />
        <button type="button" className="sf-btn w-full" disabled={pending} onClick={() => (saved ? place() : save(place))}>{pending ? 'Placing your order…' : `Place order and pay ${m(cart.totalAmount)}`}</button>
        <p className="sf-help">Next you choose how to pay: card, mobile money or bank transfer.</p>
      </aside>
    </div>
  )
}
