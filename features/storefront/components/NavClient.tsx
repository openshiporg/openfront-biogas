'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { telHref } from '../lib/format'
import { IconClose, IconMenu, IconPhone } from './Art'

type Item = { href: string; label: string }

const isActive = (path: string, href: string) => path === href || path.startsWith(`${href}/`) || (href === '/shop' && path.startsWith('/shop'))

export function NavLinks({ items }: { items: Item[] }) {
  const path = usePathname() || '/'
  return (
    <ul className="flex items-center gap-1 xl:gap-3">
      {items.map(i => {
        const on = isActive(path, i.href)
        return (
          <li key={i.href}>
            <Link href={i.href} aria-current={on ? 'page' : undefined} className={`relative flex h-11 items-center px-2.5 text-[0.98rem] font-semibold text-[var(--forest)] hover:text-[var(--clay)] ${on ? 'after:absolute after:bottom-1.5 after:left-2.5 after:right-2.5 after:h-[3px] after:rounded-full after:bg-[var(--clay)]' : ''}`}>
              {i.label}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

export function MobileMenu({ items, phone }: { items: Item[]; phone: string }) {
  const [open, setOpen] = useState(false)
  const path = usePathname()
  useEffect(() => setOpen(false), [path])
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])
  return (
    <div className="lg:hidden">
      <button type="button" onClick={() => setOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--forest)] hover:bg-[var(--sage)]" aria-label="Open the menu" aria-expanded={open}>
        <IconMenu />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[var(--cream)]" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="flex h-[72px] items-center justify-end px-4">
            <button type="button" onClick={() => setOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--forest)] hover:bg-[var(--sage)]" aria-label="Close the menu">
              <IconClose />
            </button>
          </div>
          <nav aria-label="Mobile" className="flex-1 overflow-y-auto px-6">
            <ul className="divide-y divide-[var(--line)]">
              {items.map(i => (
                <li key={i.href}>
                  <Link href={i.href} className={`flex min-h-14 items-center text-xl font-bold ${isActive(path || '', i.href) ? 'text-[var(--clay)]' : 'text-[var(--forest)]'}`}>{i.label}</Link>
                </li>
              ))}
            </ul>
            <div className="mt-8 space-y-3 pb-10">
              <Link href="/get-a-quote" className="sf-btn w-full">Get a quote</Link>
              {phone && <a href={telHref(phone)} className="sf-btn sf-btn-ghost w-full"><IconPhone /> Call {phone}</a>}
            </div>
          </nav>
        </div>
      )}
    </div>
  )
}
