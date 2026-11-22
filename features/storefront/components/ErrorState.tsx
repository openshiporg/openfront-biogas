'use client'

import Link from 'next/link'
import { useEffect } from 'react'

/* Shown when a page could not load its data. Plain words, a retry, and a way out. */
export function ErrorState({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(JSON.stringify({ component: 'storefront-page', digest: error.digest ?? null }))
  }, [error])
  return (
    <div className="mx-auto max-w-[720px] px-4 py-20 text-center sm:px-6" role="alert">
      <p className="font-bold text-[var(--clay)]">Something went wrong</p>
      <h1 className="mt-2 text-[2rem] font-extrabold leading-tight sm:text-[2.5rem]">This page did not load</h1>
      <p className="mx-auto mt-4 max-w-lg text-lg">It is on our side, not yours. Try again in a moment. If it keeps happening, call us and we will help over the phone.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="sf-btn">Try again</button>
        <Link href="/" className="sf-btn sf-btn-ghost">Go to the home page</Link>
      </div>
    </div>
  )
}
