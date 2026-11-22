import Link from 'next/link'
import { getStore } from '../lib/data/store'
import { telHref } from '../lib/format'

/* The storefront's own not-found page: a mistyped code or an old link, in plain words. */
export async function NotFoundScreen() {
  const store = await getStore()
  return (
    <div className="mx-auto max-w-[720px] px-4 py-20 text-center sm:px-6">
      <p className="font-bold text-[var(--clay)]">Not found</p>
      <h1 className="mt-2 text-[2rem] font-extrabold leading-tight sm:text-[2.5rem]">We could not find that page</h1>
      <p className="mx-auto mt-4 max-w-lg text-lg">
        If you followed a link from a quote, receipt or message, check that the code was copied in full.
        {store.phone ? <> Or call us on <a href={telHref(store.phone)} className="font-bold text-[var(--clay)] underline">{store.phone}</a> and we will look it up.</> : null}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className="sf-btn">Go to the home page</Link>
        <Link href="/get-a-quote" className="sf-btn sf-btn-ghost">Get a quote</Link>
      </div>
    </div>
  )
}
