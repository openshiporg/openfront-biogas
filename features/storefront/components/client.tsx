'use client'

import { useCallback, useEffect, useState } from 'react'

const make = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

/**
 * One idempotency key per attempt: kept across retries of the same form, renewed after success.
 * Made in the browser after mount, so the server HTML and the hydrated form never disagree.
 */
export function useKey() {
  const [key, setKey] = useState('')
  useEffect(() => setKey(k => k || make()), [])
  const renew = useCallback(() => setKey(make()), [])
  return [key, renew] as const
}

export function FormError({ error }: { error: string | null | undefined }) {
  if (!error) return null
  return <p role="alert" className="rounded-[12px] border border-[#e7b6a8] bg-[#fbeae5] px-4 py-3 text-[#8f2a15]">{error}</p>
}

export function Field({ label, help, error, children, htmlFor }: { label: string; help?: string; error?: string | null; children: React.ReactNode; htmlFor: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="sf-label">{label}</label>
      {children}
      {help && !error && <p className="sf-help">{help}</p>}
      {error && <p className="mt-1 text-sm font-semibold text-[#8f2a15]">{error}</p>}
    </div>
  )
}
