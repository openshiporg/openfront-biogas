'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { acceptQuoteAction, acceptServiceQuoteAction, declineQuoteAction } from '../lib/actions'
import { money, word } from '../lib/format'
import { Check } from './Art'
import { FormError, useKey } from './client'

type Offer = { id: string; label: string; depositAmount: number; instalmentAmount: number; instalmentCount: number; frequency: string; planFeeAmount: number; totalAmount: number }
type Option = { id: string; label: string; description: string; isRecommended: boolean; subtotalAmount: number; discountAmount: number; taxAmount: number; totalAmount: number; lines: { id: string; kind: string; description: string; quantity: number; unitAmount: number; totalAmount: number; warrantyMonths: number }[]; planOffers: Offer[] }

/** S6 compare, S7 sign and accept (then pay the deposit) or decline; also S24 repair approval. */
export function QuoteAccept({ code, currencyCode, options, canAccept, service, ticketId }: { code: string; currencyCode: string; options: Option[]; canAccept: boolean; service?: boolean; ticketId?: string }) {
  const first = options.find(o => o.isRecommended) ?? options[0]
  const [optionId, setOptionId] = useState(first?.id ?? '')
  const [offerId, setOfferId] = useState<string>('')
  const [name, setName] = useState('')
  const [agree, setAgree] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [key] = useKey()
  const [dkey] = useKey()
  const [pending, start] = useTransition()
  const router = useRouter()
  const option = options.find(o => o.id === optionId)
  const offer = option?.planOffers.find(p => p.id === offerId) ?? null
  const m = (v: number) => money(v, currencyCode)

  return (
    <div className="space-y-8">
      <div className={`grid gap-5 ${options.length > 1 ? 'lg:grid-cols-2' : ''}`}>
        {options.map(o => {
          const on = o.id === optionId
          return (
            <label key={o.id} className={`sf-card block cursor-pointer p-5 transition ${on ? 'ring-2 ring-[var(--clay)]' : 'hover:ring-1 hover:ring-[var(--line)]'}`}>
              <div className="flex items-start justify-between gap-3">
                <span className="flex items-center gap-3">
                  {canAccept && options.length > 1 && <input type="radio" name="option" className="h-5 w-5 accent-[var(--clay)]" checked={on} onChange={() => { setOptionId(o.id); setOfferId('') }} />}
                  <span className="text-xl font-bold text-[var(--forest)]">{o.label}</span>
                </span>
                {o.isRecommended && <span className="sf-chip bg-[var(--lime)] text-[var(--forest)]">We recommend</span>}
              </div>
              {o.description && <p className="mt-2">{o.description}</p>}
              <table className="mt-4 w-full text-[0.95rem]">
                <caption className="sr-only">What is included in {o.label}</caption>
                <tbody className="divide-y divide-[var(--line)]">
                  {o.lines.map(l => (
                    <tr key={l.id}>
                      <td className="py-2 pr-2">{l.quantity > 1 ? `${l.quantity} × ` : ''}{l.description}{l.warrantyMonths ? <span className="block text-sm text-[var(--muted)]">{l.warrantyMonths}-month warranty</span> : null}</td>
                      <td className="py-2 text-right">{m(l.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <dl className="mt-3 space-y-1 border-t border-[var(--line)] pt-3">
                {o.discountAmount > 0 && <div className="flex justify-between"><dt>Discount</dt><dd>−{m(o.discountAmount)}</dd></div>}
                {o.taxAmount > 0 && <div className="flex justify-between"><dt>Tax</dt><dd>{m(o.taxAmount)}</dd></div>}
                <div className="flex justify-between text-lg font-bold text-[var(--forest)]"><dt>Total</dt><dd>{m(o.totalAmount)}</dd></div>
              </dl>
              {o.planOffers.length > 0 && (
                <ul className="mt-3 space-y-1 text-[0.95rem] text-[var(--muted)]">
                  {o.planOffers.map(p => <li key={p.id}>{p.label}: {m(p.depositAmount)} now, then {p.instalmentCount} × {m(p.instalmentAmount)} {word(p.frequency)}</li>)}
                </ul>
              )}
            </label>
          )
        })}
      </div>

      {canAccept && option && (
        <div className="sf-card space-y-5 p-6">
          <h2 className="text-2xl font-extrabold">Accept {options.length > 1 ? `“${option.label}”` : 'this quote'}</h2>
          {!service && option.planOffers.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="sf-label">How would you like to pay?</legend>
              <label className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-[14px] border px-4 ${!offerId ? 'border-[var(--clay)] bg-[var(--clay-soft)]' : 'border-[var(--line)] bg-white'}`}>
                <input type="radio" name="offer" className="h-5 w-5 accent-[var(--clay)]" checked={!offerId} onChange={() => setOfferId('')} />
                <span><strong>Pay in full</strong>: {m(option.totalAmount)}</span>
              </label>
              {option.planOffers.map(p => (
                <label key={p.id} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-[14px] border px-4 py-2 ${offerId === p.id ? 'border-[var(--clay)] bg-[var(--clay-soft)]' : 'border-[var(--line)] bg-white'}`}>
                  <input type="radio" name="offer" className="h-5 w-5 accent-[var(--clay)]" checked={offerId === p.id} onChange={() => setOfferId(p.id)} />
                  <span><strong>{p.label}</strong>: {m(p.depositAmount)} deposit, then {p.instalmentCount} payments of {m(p.instalmentAmount)} {word(p.frequency)}{p.planFeeAmount > 0 ? ` (plan fee ${m(p.planFeeAmount)}, ${m(p.totalAmount)} in all)` : ''}</span>
                </label>
              ))}
            </fieldset>
          )}
          <div className="max-w-md">
            <label htmlFor="signedName" className="sf-label">Type your full name to sign</label>
            <input id="signedName" value={name} onChange={e => setName(e.target.value)} className="sf-input font-[cursive] text-lg" autoComplete="name" />
          </div>
          <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5 accent-[var(--clay)]" checked={agree} onChange={e => setAgree(e.target.checked)} />I accept this quote and its terms.</label>
          <FormError error={error} />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="sf-btn"
              disabled={pending || !agree || name.trim().length < 2}
              onClick={() =>
                start(async () => {
                  setError(null)
                  const r = service
                    ? await acceptServiceQuoteAction({ code, optionId, signedName: name.trim(), idempotencyKey: key, ticketId: ticketId ?? '' })
                    : await acceptQuoteAction({ code, optionId, planOfferId: offerId || null, signedName: name.trim(), idempotencyKey: key })
                  if (!r.ok) return setError(r.error)
                  const d = r.data as { sessionCode?: string | null; orderCode?: string }
                  if (d?.sessionCode) router.push(`/pay/${d.sessionCode}`)
                  else if (d?.orderCode) router.push(`/order/${d.orderCode}`)
                  else router.refresh()
                })
              }
            >
              {pending ? 'Signing…' : offer ? `Sign and pay the ${m(offer.depositAmount)} deposit` : service ? 'Approve the repair' : 'Sign and accept'}
            </button>
            {!service && <button type="button" className="sf-btn sf-btn-ghost" onClick={() => setDeclining(v => !v)} aria-expanded={declining}>Decline</button>}
          </div>
          {declining && (
            <div className="space-y-3 rounded-[14px] bg-[var(--cream-2)] p-4">
              <label htmlFor="reason" className="sf-label">Can you tell us why? (optional)</label>
              <textarea id="reason" value={reason} onChange={e => setReason(e.target.value)} className="sf-input" rows={2} />
              <button
                type="button"
                className="sf-btn sf-btn-ghost"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    setError(null)
                    const r = await declineQuoteAction(code, reason.trim(), dkey)
                    if (!r.ok) return setError(r.error)
                    router.refresh()
                  })
                }
              >
                Decline this quote
              </button>
            </div>
          )}
          <p className="flex items-center gap-2 text-sm text-[var(--muted)]"><Check className="h-4 w-4" />Your signature, the time and your device are recorded with the quote.</p>
        </div>
      )}
    </div>
  )
}
