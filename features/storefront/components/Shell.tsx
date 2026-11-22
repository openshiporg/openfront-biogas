import Link from 'next/link'
import { getStore } from '../lib/data/store'
import { getViewer } from '../lib/data/session'
import { cartCount } from '../lib/data/cart'
import { telHref, whatsappHref } from '../lib/format'
import { IconCart, IconChat, IconMail, IconPhone, IconPin, IconUser, LogoMark } from './Art'
import { MobileMenu, NavLinks } from './NavClient'

export const NAV = [
  { href: '/systems', label: 'Systems' },
  { href: '/calculator', label: 'Calculator' },
  { href: '/shop', label: 'Shop' },
  { href: '/service-plans', label: 'Service plans' },
  { href: '/support', label: 'Support' },
]

export function Brand({ name, logoUrl, light = false }: { name: string; logoUrl: string | null; light?: boolean }) {
  const words = name.trim().split(/\s+/)
  const first = words.length > 1 ? words.slice(0, -1).join(' ') : name
  const last = words.length > 1 ? words[words.length - 1] : ''
  return (
    <span className="flex items-center gap-2.5">
      {logoUrl ? <img src={logoUrl} alt="" className="h-10 w-auto" /> : <LogoMark className="h-9 w-12 shrink-0 sm:h-10 sm:w-14" />}
      <span className={`flex flex-col font-[family-name:var(--font-sf-head)] text-[1.35rem] font-extrabold leading-[0.95] sm:text-[1.6rem] ${light ? 'text-[#f9f7f0]' : ''}`}>
        <span className={light ? '' : 'text-[var(--clay)]'}>{first}</span>
        {last && <span className={light ? '' : 'text-[var(--forest)]'}>{last}</span>}
      </span>
    </span>
  )
}

export async function Header() {
  const [store, viewer, count] = await Promise.all([getStore(), getViewer(), cartCount()])
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--cream)]/95 backdrop-blur">
      <div className="mx-auto flex h-[72px] max-w-[1240px] items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-4" aria-label={`${store.name || 'Home'}: home`}>
          <Brand name={store.name || 'Home'} logoUrl={store.logoUrl} />
        </Link>
        <span className="hidden h-10 w-px bg-[#d9b9a4] xl:block" aria-hidden="true" />
        <span className="hidden max-w-[11rem] text-[0.82rem] italic leading-tight text-[var(--bark)] xl:block">Home and farm biogas, installed and looked after</span>
        <nav aria-label="Main" className="ml-auto hidden lg:block">
          <NavLinks items={NAV} />
        </nav>
        <div className="ml-auto flex items-center gap-1 lg:ml-4">
          <Link href={viewer ? (viewer.isStaff ? '/dashboard' : '/account') : '/sign-in'} className="hidden h-11 w-11 items-center justify-center rounded-full text-[var(--forest)] hover:bg-[var(--sage)] sm:flex" aria-label={viewer ? 'Your account' : 'Sign in'}>
            <IconUser />
          </Link>
          <Link href="/cart" className="relative flex h-11 w-11 items-center justify-center rounded-full text-[var(--forest)] hover:bg-[var(--sage)]" aria-label={count ? `Cart, ${count} item${count === 1 ? '' : 's'}` : 'Cart'}>
            <IconCart />
            {count > 0 && <span className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--clay)] px-1 text-xs font-bold text-white">{count}</span>}
          </Link>
          <Link href="/get-a-quote" className="sf-btn sf-btn-sm ml-2 hidden sm:inline-flex">Get a quote</Link>
          <MobileMenu items={[...NAV, { href: viewer ? (viewer.isStaff ? '/dashboard' : '/account') : '/sign-in', label: viewer ? 'Your account' : 'Sign in' }]} phone={store.phone} />
        </div>
      </div>
    </header>
  )
}

export async function Footer() {
  const store = await getStore()
  const year = new Date().getFullYear()
  return (
    <footer className="bg-[var(--footer)] text-[#e9eddb]">
      <div className="mx-auto grid max-w-[1240px] gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.2fr_1fr_1.2fr] lg:items-start">
        <div className="space-y-4">
          <Brand name={store.name || 'Home'} logoUrl={store.logoUrl} light />
          {store.about && <p className="max-w-sm text-sm italic leading-relaxed text-[#cfd8bf]">{store.about.split(/(?<=\.)\s/)[0]}</p>}
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-1 text-[0.95rem]">
          {[...NAV, { href: '/get-a-quote', label: 'Get a quote' }, { href: '/sign-in', label: 'Sign in' }, { href: '/account', label: 'Your account' }].map(l => (
            <Link key={l.href} href={l.href} className="flex min-h-11 items-center hover:text-white hover:underline">{l.label}</Link>
          ))}
        </nav>
        <div className="space-y-3 text-[0.95rem] lg:border-l lg:border-[#3d5a3a] lg:pl-10">
          {store.phone && <a href={telHref(store.phone)} className="flex min-h-11 items-center gap-3 hover:text-white"><IconPhone /> {store.phone}</a>}
          {store.whatsappNumber && <a href={whatsappHref(store.whatsappNumber)} className="flex min-h-11 items-center gap-3 hover:text-white" target="_blank" rel="noreferrer"><IconChat /> WhatsApp {store.whatsappNumber}</a>}
          {store.email && <a href={`mailto:${store.email}`} className="flex min-h-11 items-center gap-3 break-all hover:text-white"><IconMail /> {store.email}</a>}
          {store.branches.filter(b => b.address).map(b => (
            <p key={b.id} className="flex gap-3"><IconPin className="mt-1 h-4 w-4 shrink-0" /><span><span className="font-bold text-white">{b.name}</span><br />{b.address}{b.phone && b.phone !== store.phone ? <><br /><a href={telHref(b.phone)} className="hover:underline">{b.phone}</a></> : null}</span></p>
          ))}
          {!store.branches.some(b => b.address) && store.address && <p className="flex gap-3"><IconPin className="mt-1 h-4 w-4 shrink-0" />{store.address}</p>}
        </div>
      </div>
      <div className="border-t border-[#2f4a2d]">
        <p className="mx-auto max-w-[1240px] px-4 py-4 text-sm text-[#b7c3a8] sm:px-6">© {year} {store.name}</p>
      </div>
    </footer>
  )
}
