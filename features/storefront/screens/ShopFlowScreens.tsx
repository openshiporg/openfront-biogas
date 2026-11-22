import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCart } from '../lib/data/cart'
import { getFaqs, getStore } from '../lib/data/store'
import { getViewer } from '../lib/data/session'
import { mine } from '../lib/data/codes'
import { money, telHref, whatsappHref } from '../lib/format'
import { Empty, PageHead, Section } from '../components/ui'
import { CartLines } from '../components/CartLines'
import { Checkout } from '../components/Checkout'
import { TicketForm } from '../components/TicketForm'
import { Faqs } from '../components/Faqs'
import { IconChat, IconPhone } from '../components/Art'

/* S10 */
export async function CartScreen() {
  const cart = await getCart()
  if (!cart || cart.lines.length === 0) {
    return (
      <>
        <PageHead title="Your cart" />
        <Section><Empty title="Your cart is empty" action={{ href: '/shop', label: 'Go to the shop' }}>Looking for a full system? <Link href="/get-a-quote" className="font-bold text-[var(--clay)] underline">Ask for a quote</Link>.</Empty></Section>
      </>
    )
  }
  const short = cart.lines.some(l => l.available < l.quantity)
  return (
    <>
      <PageHead title="Your cart" />
      <Section className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <div className="sf-card px-6 py-2"><CartLines lines={cart.lines} currencyCode={cart.currencyCode} /></div>
        <aside className="sf-card h-fit space-y-3 p-6">
          <dl className="space-y-1">
            <div className="flex justify-between"><dt>Items ({cart.count})</dt><dd>{money(cart.subtotalAmount, cart.currencyCode)}</dd></div>
            {cart.discountAmount > 0 && <div className="flex justify-between text-[var(--good)]"><dt>Service plan discount</dt><dd>−{money(cart.discountAmount, cart.currencyCode)}</dd></div>}
            <div className="flex justify-between text-sm text-[var(--muted)]"><dt>Delivery</dt><dd>Worked out at checkout</dd></div>
          </dl>
          {short ? <p className="font-bold text-[var(--bad)]">Lower the quantities marked above to continue.</p> : <Link href="/checkout" className="sf-btn w-full">Checkout</Link>}
          <Link href="/shop" className="block text-center font-bold text-[var(--clay)] underline">Keep shopping</Link>
        </aside>
      </Section>
    </>
  )
}

/* S11 */
export async function CheckoutScreen() {
  const [cart, store, viewer] = await Promise.all([getCart(), getStore(), getViewer()])
  if (!cart || cart.lines.length === 0) redirect('/cart')
  return (
    <>
      <PageHead title="Checkout" crumbs={[{ href: '/cart', label: 'Cart' }]} />
      <Section>
        <Checkout cart={cart} branches={store.branches.map(b => ({ id: b.id, name: b.name, address: b.address }))} country={store.country} viewer={viewer && !viewer.isStaff ? { name: viewer.name, email: viewer.email, phone: viewer.phone } : null} />
      </Section>
    </>
  )
}

/* S18 */
export async function SupportScreen({ code }: { code?: string }) {
  const [store, viewer, faqs] = await Promise.all([getStore(), getViewer(), getFaqs()])
  const signedIn = Boolean(viewer?.customerId)
  const systems = signedIn ? await mine<any[]>('mySystems') : null
  const list = systems?.ok ? (systems.data ?? []).map((s: any) => ({ id: s.id ?? '', label: `${s.model || 'System'} · ${s.number}` })).filter((s: { id: string }) => s.id) : []
  return (
    <>
      <PageHead title="Report a problem" intro="Tell us what is wrong and we will call you back. Use the code on the sticker on your digester, or sign in to pick your system." />
      <Section className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <TicketForm systems={list} signedIn={signedIn} phone={store.phone} initialCode={code} />
        <aside className="space-y-5">
          <div className="sf-panel space-y-3 p-6">
            <h2 className="text-xl font-bold">Urgent?</h2>
            {store.phone && <a href={telHref(store.phone)} className="flex min-h-11 items-center gap-3 font-bold text-[var(--forest)] hover:underline"><IconPhone className="h-5 w-5" />Call {store.phone}</a>}
            {store.whatsappNumber && <a href={whatsappHref(store.whatsappNumber)} target="_blank" rel="noreferrer" className="flex min-h-11 items-center gap-3 font-bold text-[var(--forest)] hover:underline"><IconChat className="h-5 w-5" />WhatsApp {store.whatsappNumber}</a>}
            {!signedIn && <p><Link href="/sign-in?next=/support" className="font-bold text-[var(--clay)] underline">Sign in</Link> to see your systems and past reports.</p>}
            {signedIn && <p><Link href="/account/support" className="font-bold text-[var(--clay)] underline">Your reports</Link></p>}
          </div>
          {faqs.length > 0 && <div><h2 className="text-xl font-bold">Common questions</h2><Faqs items={faqs.slice(0, 6)} /></div>}
        </aside>
      </Section>
    </>
  )
}
