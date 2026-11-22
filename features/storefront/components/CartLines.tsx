'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { removeCartLineAction, updateCartLineAction } from '../lib/actions'
import { money } from '../lib/format'
import type { CartLine } from '../lib/data/cart'

export function CartLines({ lines, currencyCode }: { lines: CartLine[]; currencyCode: string }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [, start] = useTransition()
  const router = useRouter()
  const run = (id: string, fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(id)
    setError(null)
    start(async () => {
      const r = await fn()
      setBusy(null)
      if (!r.ok) setError((r as { error: string }).error)
      router.refresh()
    })
  }
  return (
    <div>
      <ul className="divide-y divide-[var(--line)]">
        {lines.map(l => (
          <li key={l.id} className={`flex flex-wrap items-center gap-4 py-4 ${busy === l.id ? 'opacity-60' : ''}`}>
            {l.imageUrl ? <img src={l.imageUrl} alt="" className="h-16 w-16 rounded-[12px] object-cover" /> : <div className="h-16 w-16 rounded-[12px] bg-[var(--sage)]" aria-hidden="true" />}
            <div className="min-w-[10rem] flex-1">
              <Link href={`/shop/p/${l.slug}`} className="font-bold text-[var(--forest)] hover:underline">{l.name}</Link>
              <p className="text-sm text-[var(--muted)]">{money(l.unitAmount, currencyCode)} each</p>
              {l.available < l.quantity && <p className="text-sm font-bold text-[var(--bad)]">{l.available > 0 ? `Only ${l.available} left` : 'Out of stock'}</p>}
            </div>
            <label className="sr-only" htmlFor={`q-${l.id}`}>Quantity of {l.name}</label>
            <select id={`q-${l.id}`} className="sf-input w-20" value={l.quantity} disabled={busy === l.id} onChange={e => run(l.id, () => updateCartLineAction(l.id, Number(e.target.value)))}>
              {Array.from({ length: Math.max(10, l.quantity) }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <p className="w-24 text-right font-bold text-[var(--forest)]">{money(l.totalAmount, currencyCode)}</p>
            <button type="button" className="min-h-11 px-2 text-sm font-bold text-[var(--clay)] underline" disabled={busy === l.id} onClick={() => run(l.id, () => removeCartLineAction(l.id))}>Remove</button>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-2 text-[#8f2a15]">{error}</p>}
    </div>
  )
}
