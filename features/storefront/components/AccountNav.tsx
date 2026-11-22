'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/account', label: 'Overview' },
  { href: '/account/orders', label: 'Orders and quotes' },
  { href: '/account/payments', label: 'Payments' },
  { href: '/account/systems', label: 'Systems' },
  { href: '/account/support', label: 'Problem reports' },
  { href: '/account/profile', label: 'Profile' },
]

export function AccountNav() {
  const path = usePathname() ?? ''
  return (
    <nav aria-label="Account" className="-mb-px mt-4 grid grid-cols-3 sm:flex sm:gap-1 sm:overflow-x-auto">
      {TABS.map(t => {
        const on = t.href === '/account' ? path === '/account' : path.startsWith(t.href)
        return (
          <Link key={t.href} href={t.href} aria-current={on ? 'page' : undefined} className={`flex min-h-12 shrink-0 items-center justify-center border-b-[3px] px-2 text-center text-[0.95rem] leading-tight font-semibold sm:justify-start sm:px-4 sm:text-base ${on ? 'border-[var(--clay)] text-[var(--forest)]' : 'border-transparent text-[var(--muted)] hover:text-[var(--forest)]'}`}>
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
