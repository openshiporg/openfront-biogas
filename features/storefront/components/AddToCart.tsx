'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { addToCartAction } from '../lib/actions'
import { FormError } from './client'

export function AddToCart({ productId, disabled, max }: { productId: string; disabled?: boolean; max: number }) {
  const [qty, setQty] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState(false)
  const [pending, start] = useTransition()
  const router = useRouter()
  const limit = Math.max(1, Math.min(99, max))
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="qty" className="sf-label">Quantity</label>
          <input id="qty" type="number" min={1} max={limit} value={qty} onChange={e => setQty(Math.max(1, Math.min(limit, Number(e.target.value) || 1)))} className="sf-input w-24" />
        </div>
        <button
          type="button"
          className="sf-btn"
          disabled={disabled || pending}
          onClick={() =>
            start(async () => {
              setError(null)
              setAdded(false)
              const r = await addToCartAction(productId, qty)
              if (!r.ok) return setError(r.error)
              setAdded(true)
              router.refresh()
            })
          }
        >
          {pending ? 'Adding…' : disabled ? 'Out of stock' : 'Add to cart'}
        </button>
      </div>
      <FormError error={error} />
      {added && <p role="status" className="font-bold text-[var(--good)]">Added. <Link href="/cart" className="text-[var(--clay)] underline">Go to cart</Link></p>}
    </div>
  )
}
