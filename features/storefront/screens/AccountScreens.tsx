import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getViewer } from '../lib/data/session'
import { getStore } from '../lib/data/store'
import { getOrder, mine } from '../lib/data/codes'
import { date, money, statusText, word } from '../lib/format'
import { Empty, Notice, PageHead, Rows, Section, Status } from '../components/ui'
import { ChangePasswordForm, RegisterForm, ResetRedeemForm, ResetRequestForm, SignInForm } from '../components/AuthForms'
import { BuyPlan, PayPlan, ProfileForm } from '../components/AccountForms'
import { PrepList } from '../components/PrepList'
import { QuoteAccept } from '../components/QuoteAccept'
import { OrderView } from './CodeScreens'
import { AccountNav } from '../components/AccountNav'
import { signOutAction } from '../lib/actions'

const when = (iso: string | null, tz: string) => (iso ? new Intl.DateTimeFormat('en', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: tz }).format(new Date(iso)) : '')

/* ------------------------------------------------------------------ S19 */

export async function SignInScreen({ next, created }: { next?: string; created?: boolean }) {
  const viewer = await getViewer()
  if (viewer) redirect(viewer.isStaff ? '/dashboard' : next && next.startsWith('/') && !next.startsWith('//') ? next : '/account')
  return (
    <>
      <PageHead title="Sign in" intro="See your quotes, orders, payments, systems and problem reports." />
      <Section className="max-w-[560px]">{created && <div className="mb-4"><Notice title="Your account is ready">Sign in with the email and password you just chose.</Notice></div>}<SignInForm next={next} /></Section>
    </>
  )
}

export async function RegisterScreen() {
  const viewer = await getViewer()
  if (viewer) redirect(viewer.isStaff ? '/dashboard' : '/account')
  return (
    <>
      <PageHead title="Create an account" intro="Follow your installation, pay instalments and report problems in one place." />
      <Section className="max-w-[560px]"><RegisterForm /></Section>
    </>
  )
}

export async function ResetPasswordScreen({ email, token }: { email?: string; token?: string }) {
  const store = await getStore()
  const canEmail = Boolean(process.env.SMTP_HOST)
  return (
    <>
      <PageHead title={token ? 'Choose a new password' : 'Reset your password'} />
      <Section className="max-w-[560px] space-y-4">
        {token && email ? <ResetRedeemForm email={email} token={token} /> : canEmail ? <ResetRequestForm /> : (
          <Notice title="Call us to reset your password">We can set a new password for you{store.phone ? <> on <a href={`tel:${store.phone.replace(/[^\d+]/g, '')}`} className="font-bold underline">{store.phone}</a></> : null}.</Notice>
        )}
      </Section>
    </>
  )
}

/* ------------------------------------------------------------------ account shell */

async function customerOrSignIn(path: string) {
  const viewer = await getViewer()
  if (!viewer) redirect(`/sign-in?next=${encodeURIComponent(path)}`)
  if (viewer.isStaff && !viewer.customerId) redirect('/dashboard')
  return viewer
}

export async function AccountLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer()
  return (
    <>
      <div className="border-b border-[var(--line)] bg-[var(--cream-2)]">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 px-4 pt-6 sm:px-6">
          <p className="text-[1.7rem] font-extrabold text-[var(--forest)] [font-family:var(--font-sf-head)]">{viewer ? `Hello, ${viewer.name.split(' ')[0] || 'there'}` : 'Your account'}</p>
          {viewer && <form action={signOutAction}><button className="min-h-11 font-bold text-[var(--clay)] underline">Sign out</button></form>}
        </div>
        <div className="mx-auto max-w-[1240px] px-4 sm:px-6"><AccountNav /></div>
      </div>
      {children}
    </>
  )
}

function Failed({ error }: { error: string }) {
  return <Section><Notice tone="bad" title="We could not load this">{error}</Notice></Section>
}

/* ------------------------------------------------------------------ S20 overview */

export async function AccountHomeScreen() {
  await customerOrSignIn('/account')
  const [r, store, ord] = await Promise.all([mine<any>('myOverview'), getStore(), mine<any>('myOrders')])
  if (!r.ok) return <Failed error={r.error} />
  const o = r.data
  const tz = store.timezone
  // Orders with money still owed and no instalment plan already listed under Payments due.
  const planned = new Set(o.paymentsDue.map((i: any) => i.order?.number).filter(Boolean))
  const toPay = (ord.ok ? ord.data.orders : []).filter((x: any) => x.balanceAmount > 0 && !['cancelled', 'refunded', 'draft'].includes(x.status) && !planned.has(x.number))
  const nothing = !o.nextVisits.length && !o.paymentsDue.length && !o.toGetReady.length && !o.openQuotes.length && !toPay.length
  return (
    <Section className="space-y-8">
      <h1 className="text-[1.8rem] font-extrabold">What’s next</h1>
      {nothing && <Empty title="Nothing needs you right now" action={{ href: '/get-a-quote', label: 'Get a quote' }}>Your systems, orders and reports are in the tabs above.</Empty>}
      <div className="grid gap-6 lg:grid-cols-2">
        {o.openQuotes.length > 0 && (
          <div className="sf-card p-6">
            <h2 className="text-xl font-bold">Quotes waiting for you</h2>
            <ul className="mt-3 divide-y divide-[var(--line)]">{o.openQuotes.map((q: any) => (
              <li key={q.code} className="flex flex-wrap items-center justify-between gap-2 py-3"><span><strong>{q.number}</strong> · {money(q.totalAmount, q.currencyCode)}{q.validUntil ? <span className="block text-sm text-[var(--muted)]">Valid until {date(q.validUntil, tz)}</span> : null}</span><Link href={`/quote/${q.code}`} className="sf-btn sf-btn-sm">Open</Link></li>
            ))}</ul>
          </div>
        )}
        {toPay.length > 0 && (
          <div className="sf-card p-6">
            <h2 className="text-xl font-bold">Orders to pay</h2>
            <ul className="mt-3 divide-y divide-[var(--line)]">{toPay.map((x: any) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span><strong>{x.number}</strong> · {money(x.balanceAmount, x.currencyCode)} to pay<span className="block text-sm text-[var(--muted)]">Placed {date(x.createdAt, tz)}</span></span>
                <Link href={`/account/orders/${x.id}`} className="sf-btn sf-btn-ghost !min-h-10">See and pay</Link>
              </li>
            ))}</ul>
          </div>
        )}
        {o.paymentsDue.length > 0 && (
          <div className="sf-card p-6">
            <h2 className="text-xl font-bold">Payments due</h2>
            <ul className="mt-3 divide-y divide-[var(--line)]">{o.paymentsDue.map((i: any) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><span>{i.label}{i.order ? ` · order ${i.order.number}` : ''}<span className="block text-sm text-[var(--muted)]">{i.dueDate ? `Due ${date(i.dueDate, tz)}` : ''}</span></span><span className="flex items-center gap-3"><strong>{money(i.amount - i.paidAmount, store.currencyCode)}</strong><Status value={i.status} /></span></li>
            ))}</ul>
            <Link href="/account/payments" className="sf-btn mt-3">Pay now</Link>
          </div>
        )}
        {o.nextVisits.length > 0 && (
          <div className="sf-card p-6">
            <h2 className="text-xl font-bold">Coming visits</h2>
            <ul className="mt-3 divide-y divide-[var(--line)]">{o.nextVisits.map((v: any) => (
              <li key={v.number} className="flex flex-wrap items-center justify-between gap-2 py-3"><span><strong>{word(v.type)}</strong><span className="block text-sm">{when(v.windowStart, tz)}</span></span>{v.publicCode ? <Link href={`/visit/${v.publicCode}`} className="font-bold text-[var(--clay)] underline">Details</Link> : <Status value={v.status} />}</li>
            ))}</ul>
          </div>
        )}
        {o.toGetReady.map((g: any) => (
          <div key={g.installationNumber} className="sf-card p-6">
            <h2 className="text-xl font-bold">Get ready for your installation</h2>
            <p className="text-[var(--muted)]">{g.orderNumber ? `Order ${g.orderNumber} · ` : ''}{statusText(g.status)}</p>
            {g.tasks.length ? <PrepList tasks={g.tasks} editable path="/account" /> : <p className="mt-2">All done. We will be in touch to book the day.</p>}
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/account/systems" className="sf-panel block p-5 hover:underline"><span className="text-3xl font-extrabold text-[var(--forest)]">{o.systemCount}</span><span className="block">system{o.systemCount === 1 ? '' : 's'}</span></Link>
        <Link href="/account/support" className="sf-panel block p-5 hover:underline"><span className="text-3xl font-extrabold text-[var(--forest)]">{o.openTicketCount}</span><span className="block">open problem report{o.openTicketCount === 1 ? '' : 's'}</span></Link>
        <div className="sf-panel p-5">
          {o.customer?.referralCode ? <><span className="block text-sm">Your referral code</span><span className="font-mono text-2xl font-extrabold text-[var(--clay)]">{o.customer.referralCode}</span><span className="block text-sm">Share it with friends who ask us for a quote.</span></> : <span>Customer {o.customer?.number}</span>}
          {o.customer?.storeCreditAmount > 0 && <span className="mt-2 block font-bold">Credit: {money(o.customer.storeCreditAmount, o.customer.currencyCode)}</span>}
        </div>
      </div>
    </Section>
  )
}

/* ------------------------------------------------------------------ S21 orders and quotes */

export async function AccountOrdersScreen() {
  await customerOrSignIn('/account/orders')
  const [r, store] = await Promise.all([mine<any>('myOrders'), getStore()])
  if (!r.ok) return <Failed error={r.error} />
  const { orders, quotes } = r.data
  return (
    <Section className="space-y-10">
      <div>
        <h1 className="text-[1.8rem] font-extrabold">Orders</h1>
        {orders.length === 0 ? <div className="mt-4"><Empty title="No orders yet" action={{ href: '/shop', label: 'Go to the shop' }} /></div> : (
          <ul className="mt-4 grid gap-3">{orders.map((o: any) => (
            <li key={o.id}><Link href={`/account/orders/${o.id}`} className="sf-card flex flex-wrap items-center justify-between gap-3 p-5 hover:ring-1 hover:ring-[var(--clay)]">
              <span><strong className="text-[var(--forest)]">{o.number}</strong><span className="block text-sm text-[var(--muted)]">{date(o.createdAt, store.timezone)}{o.fulfilment ? ` · ${word(o.fulfilment)}` : ''}</span></span>
              <span className="flex items-center gap-4"><span className="text-right">{money(o.totalAmount, o.currencyCode)}{o.balanceAmount > 0 ? <span className="block text-sm text-[var(--clay)]">{money(o.balanceAmount, o.currencyCode)} to pay</span> : null}</span><Status value={o.status} /></span>
            </Link></li>
          ))}</ul>
        )}
      </div>
      <div>
        <h2 className="text-[1.5rem] font-extrabold">Quotes</h2>
        {quotes.length === 0 ? <p className="mt-2 text-[var(--muted)]">No quotes yet. <Link href="/get-a-quote" className="font-bold text-[var(--clay)] underline">Ask for one</Link>.</p> : (
          <ul className="mt-4 grid gap-3">{quotes.map((q: any) => (
            <li key={q.code}><Link href={`/quote/${q.code}`} className="sf-card flex flex-wrap items-center justify-between gap-3 p-5 hover:ring-1 hover:ring-[var(--clay)]">
              <span><strong className="text-[var(--forest)]">{q.number}</strong>{q.version > 1 ? ` v${q.version}` : ''}<span className="block text-sm text-[var(--muted)]">{q.kind === 'service' ? 'Repair' : 'System'} · {date(q.createdAt, store.timezone)}</span></span>
              <span className="flex items-center gap-4">{money(q.totalAmount, q.currencyCode)}<Status value={q.status} /></span>
            </Link></li>
          ))}</ul>
        )}
      </div>
    </Section>
  )
}

export async function AccountOrderScreen({ id }: { id: string }) {
  await customerOrSignIn(`/account/orders/${id}`)
  const [r, store] = await Promise.all([mine<any>('myOrder', { id }), getStore()])
  if (!r.ok) return <Failed error={r.error} />
  if (!r.data) notFound()
  const o = r.data
  return (
    <Section className="space-y-6">
      <div className="flex flex-wrap items-center gap-3"><h1 className="text-[1.8rem] font-extrabold">Order {o.number}</h1><Status value={o.status} /></div>
      <OrderView o={o} tz={store.timezone} prepEditable backHref={`/account/orders/${id}`} />
    </Section>
  )
}

/* ------------------------------------------------------------------ S22 payments */

export async function AccountPaymentsScreen() {
  await customerOrSignIn('/account/payments')
  const [r, store] = await Promise.all([mine<any>('myPayments'), getStore()])
  if (!r.ok) return <Failed error={r.error} />
  const { plans, payments, storeCreditAmount } = r.data
  const tz = store.timezone
  return (
    <Section className="space-y-10">
      <h1 className="text-[1.8rem] font-extrabold">Payments</h1>
      {storeCreditAmount > 0 && <Notice tone="good" title={`You have ${money(storeCreditAmount, store.currencyCode)} credit`}>We take it off your next order or instalment.</Notice>}
      {plans.length === 0 ? <Empty title="No payment plans">When you buy a system in instalments, the schedule shows here.</Empty> : plans.map((p: any) => {
        const open = p.installments.filter((i: any) => !['paid', 'waived', 'cancelled'].includes(i.status) && i.amount > i.paidAmount).map((i: any) => ({ id: i.id, label: i.label, left: i.amount - i.paidAmount }))
        return (
          <div key={p.id} className="sf-card space-y-4 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold">Payment plan{p.order ? <> for order <Link href={`/order/${p.order.code}`} className="text-[var(--clay)] underline">{p.order.number}</Link></> : null}</h2>
              <Status value={p.status} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sf-panel px-4 py-3"><p className="text-sm">Total</p><p className="text-xl font-bold text-[var(--forest)]">{money(p.totalAmount, p.currencyCode)}</p></div>
              <div className="sf-panel px-4 py-3"><p className="text-sm">Paid</p><p className="text-xl font-bold text-[var(--forest)]">{money(p.paidAmount, p.currencyCode)}</p></div>
              <div className="sf-panel px-4 py-3"><p className="text-sm">Left</p><p className="text-xl font-bold text-[var(--clay)]">{money(p.balanceAmount, p.currencyCode)}</p></div>
            </div>
            <table className="w-full text-[0.95rem]">
              <caption className="sr-only">Schedule</caption>
              <thead className="text-left text-[var(--muted)]"><tr><th className="py-2 font-semibold">Payment</th><th className="hidden py-2 font-semibold sm:table-cell">Due</th><th className="py-2 text-right font-semibold">Amount</th><th className="py-2 text-right font-semibold">Status</th></tr></thead>
              <tbody className="divide-y divide-[var(--line)]">{p.installments.map((i: any) => (
                <tr key={i.id}><td className="py-2 pr-2">{i.label}<span className="block text-sm text-[var(--muted)] sm:hidden">{i.dueDate ? date(i.dueDate, tz) : i.trigger ? statusText(i.trigger) : ''}</span></td><td className="hidden py-2 sm:table-cell">{i.dueDate ? date(i.dueDate, tz) : i.trigger ? statusText(i.trigger) : ''}</td><td className="py-2 text-right">{money(i.amount, p.currencyCode)}{i.paidAmount > 0 && i.paidAmount < i.amount ? <span className="block text-sm text-[var(--muted)]">{money(i.paidAmount, p.currencyCode)} paid</span> : null}</td><td className="py-2 text-right"><Status value={i.status} /></td></tr>
              ))}</tbody>
            </table>
            {['active', 'in_arrears', 'defaulted', 'pending'].includes(p.status) && <PayPlan planId={p.id} currencyCode={p.currencyCode} open={open} balance={p.balanceAmount} />}
          </div>
        )
      })}
      <div>
        <h2 className="text-[1.5rem] font-extrabold">History</h2>
        {payments.length === 0 ? <p className="mt-2 text-[var(--muted)]">No payments yet.</p> : (
          <>
          <ul className="sf-card mt-4 divide-y divide-[var(--line)] px-5 sm:hidden">{payments.map((p: any, i: number) => (
            <li key={i} className="flex justify-between gap-3 py-3 text-[0.95rem]">
              <span>{p.order?.number ?? ''} · {word(p.method)}<span className="block text-sm text-[var(--muted)]">{date(p.createdAt, tz)}{p.reference ? <> · <span className="font-mono">{p.reference}</span></> : null}{p.receiptNumber ? <> · Receipt {p.receiptNumber}</> : null}</span></span>
              <span className="text-right">{money(p.amount, p.currencyCode)}<br /><Status value={p.status} /></span>
            </li>
          ))}</ul>
          <div className="sf-card mt-4 hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[560px] text-[0.95rem]">
              <caption className="sr-only">Payment history</caption>
              <thead className="bg-[var(--sage)] text-left text-[var(--forest)]"><tr><th className="px-4 py-2">Date</th><th className="px-4 py-2">For</th><th className="px-4 py-2">How</th><th className="px-4 py-2">Receipt</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2 text-right">Status</th></tr></thead>
              <tbody className="divide-y divide-[var(--line)]">{payments.map((p: any, i: number) => (
                <tr key={i}><td className="px-4 py-2">{date(p.createdAt, tz)}</td><td className="px-4 py-2">{p.order?.number ?? ''}</td><td className="px-4 py-2">{word(p.method)}{p.reference ? <span className="block font-mono text-xs text-[var(--muted)]">{p.reference}</span> : null}</td><td className="px-4 py-2">{p.receiptNumber ?? ''}</td><td className="px-4 py-2 text-right">{money(p.amount, p.currencyCode)}{p.refundedAmount ? <span className="block text-xs text-[var(--muted)]">{money(p.refundedAmount, p.currencyCode)} refunded</span> : null}</td><td className="px-4 py-2 text-right"><Status value={p.status} /></td></tr>
              ))}</tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </Section>
  )
}

/* ------------------------------------------------------------------ S23 systems */

export async function AccountSystemsScreen() {
  await customerOrSignIn('/account/systems')
  const [r, store] = await Promise.all([mine<any[]>('mySystems'), getStore()])
  if (!r.ok) return <Failed error={r.error} />
  const systems = r.data ?? []
  return (
    <Section className="space-y-6">
      <h1 className="text-[1.8rem] font-extrabold">Your systems</h1>
      {systems.length === 0 ? <Empty title="No systems yet" action={{ href: '/get-a-quote', label: 'Get a quote' }}>Once we install your digester it shows here, with its warranty and service plan.</Empty> : (
        <ul className="grid gap-4 md:grid-cols-2">{systems.map((s: any) => (
          <li key={s.id}><Link href={`/account/systems/${s.id}`} className="sf-card block p-6 hover:ring-1 hover:ring-[var(--clay)]">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xl font-bold text-[var(--forest)]">{s.model || 'System'}</span><Status value={s.status} /></div>
            <p className="text-[var(--muted)]">{s.number}{s.site?.label ? ` · ${s.site.label}` : ''}</p>
            <p className="mt-2">{s.servicePlan ? <>Service plan: <strong>{s.servicePlan.name}</strong> <Status value={s.servicePlan.status} /></> : 'No service plan'}</p>
            {s.nextCheckDueAt && <p className="text-sm">Next check-up due {date(s.nextCheckDueAt, store.timezone)}</p>}
          </Link></li>
        ))}</ul>
      )}
    </Section>
  )
}

export async function AccountSystemScreen({ id }: { id: string }) {
  await customerOrSignIn(`/account/systems/${id}`)
  const [r, store] = await Promise.all([mine<any>('mySystem', { id }), getStore()])
  if (!r.ok) return <Failed error={r.error} />
  const s = r.data
  if (!s) notFound()
  const tz = store.timezone
  const plan = s.servicePlan
  const renewable = !plan || ['lapsed', 'grace', 'renewal_due', 'cancelled'].includes(plan.status)
  return (
    <Section className="space-y-8">
      <div className="flex flex-wrap items-center gap-3"><h1 className="text-[1.8rem] font-extrabold">{s.model || 'Your system'}</h1><Status value={s.status} /></div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="sf-card p-6">
          <Rows rows={[
            ['System number', s.number],
            ['Sticker code', s.code ?? ''],
            ['Serial number', s.serialNumber ?? ''],
            ['Installed', s.installedAt ? date(s.installedAt, tz) : ''],
            ['Handed over', s.commissionedAt ? date(s.commissionedAt, tz) : ''],
            ['Last check-up', s.lastCheckedAt ? date(s.lastCheckedAt, tz) : ''],
            ['Next check-up due', s.nextCheckDueAt ? date(s.nextCheckDueAt, tz) : ''],
          ]} />
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/support" className="sf-btn sf-btn-sm">Report a problem</Link>
            {s.productSlug && <Link href={`/shop?fits=${s.productSlug}`} className="sf-btn sf-btn-ghost sf-btn-sm">Parts for this system</Link>}
          </div>
        </div>
        <div className="sf-card p-6">
          <h2 className="text-xl font-bold">Warranty</h2>
          {s.warranties.length === 0 ? <p className="mt-2 text-[var(--muted)]">No warranty recorded yet.</p> : (
            <ul className="mt-3 divide-y divide-[var(--line)]">{s.warranties.map((w: any) => (
              <li key={w.component} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{word(w.component)}</span><span className="flex items-center gap-2 text-[0.95rem]">{w.endsAt ? `until ${date(w.endsAt, tz)}` : ''}<Status value={w.isVoid ? 'cancelled' : w.active ? 'active' : 'expired'} label={w.isVoid ? 'Void' : w.active ? 'Covered' : 'Ended'} /></span></li>
            ))}</ul>
          )}
        </div>
      </div>
      <div className="sf-card space-y-4 p-6">
        <h2 className="text-xl font-bold">Service plan</h2>
        {plan && (
          <div className="flex flex-wrap items-center gap-3">
            <strong className="text-lg text-[var(--forest)]">{plan.name}</strong><Status value={plan.status} />
            {plan.currentPeriodEnd && <span>{['lapsed', 'grace'].includes(plan.status) ? 'Ended' : 'Renews'} {date(plan.currentPeriodEnd, tz)}</span>}
            {plan.visitsPerYear > 0 && <span className="text-[var(--muted)]">{plan.visitsUsed} of {plan.visitsPerYear} visits used</span>}
          </div>
        )}
        {renewable && (s.availablePlans?.length ? <BuyPlan systemId={s.id} plans={s.availablePlans} /> : <p className="text-[var(--muted)]">Call us to add a service plan.</p>)}
      </div>
      {(s.visits?.length > 0 || s.tickets?.length > 0) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {s.visits?.length > 0 && <div className="sf-card p-6"><h2 className="text-xl font-bold">Visits</h2><ul className="mt-3 divide-y divide-[var(--line)]">{s.visits.map((v: any) => <li key={v.number} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{word(v.type)}<span className="block text-sm text-[var(--muted)]">{v.windowStart ? when(v.windowStart, tz) : v.dueAt ? `Due ${date(v.dueAt, tz)}` : ''}</span></span><span className="flex items-center gap-2"><Status value={v.status} />{v.publicCode && <Link href={`/visit/${v.publicCode}`} className="text-sm font-bold text-[var(--clay)] underline">Details</Link>}</span></li>)}</ul></div>}
          {s.tickets?.length > 0 && <div className="sf-card p-6"><h2 className="text-xl font-bold">Problem reports</h2><ul className="mt-3 divide-y divide-[var(--line)]">{s.tickets.map((t: any) => <li key={t.id}><Link href={`/account/support/${t.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 hover:underline"><span>{t.number} · {word(t.category)}</span><Status value={t.status} /></Link></li>)}</ul></div>}
        </div>
      )}
    </Section>
  )
}

/* ------------------------------------------------------------------ S24 problem reports */

export async function AccountTicketsScreen() {
  await customerOrSignIn('/account/support')
  const [r, store] = await Promise.all([mine<any[]>('myTickets'), getStore()])
  if (!r.ok) return <Failed error={r.error} />
  const list = r.data ?? []
  return (
    <Section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-[1.8rem] font-extrabold">Problem reports</h1><Link href="/support" className="sf-btn sf-btn-sm">Report a problem</Link></div>
      {list.length === 0 ? <Empty title="No reports">If something is wrong with your system, tell us and we will call you back.</Empty> : (
        <ul className="grid gap-3">{list.map((t: any) => (
          <li key={t.id}><Link href={`/account/support/${t.id}`} className="sf-card flex flex-wrap items-center justify-between gap-3 p-5 hover:ring-1 hover:ring-[var(--clay)]">
            <span><strong className="text-[var(--forest)]">{t.number}</strong> · {word(t.category)}<span className="block text-sm text-[var(--muted)]">{t.system?.number ? `${t.system.number} · ` : ''}Reported {date(t.createdAt, store.timezone)}{t.nextVisitAt ? ` · visit ${when(t.nextVisitAt, store.timezone)}` : ''}</span></span>
            <Status value={t.status} />
          </Link></li>
        ))}</ul>
      )}
    </Section>
  )
}

export async function AccountTicketScreen({ id }: { id: string }) {
  await customerOrSignIn(`/account/support/${id}`)
  const [r, store] = await Promise.all([mine<any>('myTicket', { id }), getStore()])
  if (!r.ok) return <Failed error={r.error} />
  const t = r.data
  if (!t) notFound()
  const tz = store.timezone
  const q = t.repairQuote
  return (
    <Section className="space-y-8">
      <div className="flex flex-wrap items-center gap-3"><h1 className="text-[1.8rem] font-extrabold">Report {t.number}</h1><Status value={t.status} /></div>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          {t.payLinks.length > 0 && (
            <div className="sf-card space-y-3 p-6">{t.payLinks.map((p: any) => <div key={p.code} className="flex flex-wrap items-center justify-between gap-3"><span>To pay: <strong>{money(p.amount, store.currencyCode)}</strong></span><Link href={`/pay/${p.code}`} className="sf-btn sf-btn-sm">Pay now</Link></div>)}</div>
          )}
          {q && (
            <div className="space-y-3">
              <h2 className="text-xl font-bold">Repair quote {q.number}</h2>
              {q.canAccept && <p>This repair is not covered by your warranty. Approve it to book the work.</p>}
              {q.status === 'accepted' && <Notice tone="good" title="You approved this repair" />}
              <QuoteAccept code={q.code} currencyCode={q.currencyCode} options={q.options} canAccept={q.canAccept} service ticketId={t.id} />
            </div>
          )}
          <div className="sf-card p-6">
            <h2 className="text-xl font-bold">What happened</h2>
            <p className="mt-2 whitespace-pre-line">{t.description}</p>
            {t.events.length > 0 && (
              <ol className="mt-5 space-y-3 border-l-2 border-[var(--sage-2)] pl-5">{t.events.map((e: any, i: number) => (
                <li key={i}><p className="text-sm text-[var(--muted)]">{when(e.at, tz)}</p><p>{e.body || statusText(e.type)}</p></li>
              ))}</ol>
            )}
            {t.resolution && <p className="mt-4 rounded-[12px] bg-[var(--sage)] px-4 py-3"><strong>How we fixed it:</strong> {t.resolution}</p>}
          </div>
        </div>
        <aside className="space-y-6">
          <div className="sf-card p-6">
            <Rows rows={[
              ['Problem', word(t.category)],
              ['System', t.system ? `${t.system.model || ''} ${t.system.number}`.trim() : ''],
              ['Reported', date(t.createdAt, tz)],
              ['Warranty', t.warrantyDecision ? statusText(t.warrantyDecision) : ''],
              ['Fixed', t.resolvedAt ? date(t.resolvedAt, tz) : ''],
            ]} />
          </div>
          {t.visits.length > 0 && <div className="sf-card p-6"><h2 className="text-lg font-bold">Visits</h2><ul className="mt-2 space-y-2">{t.visits.map((v: any) => <li key={v.number} className="flex flex-wrap items-center justify-between gap-2"><span>{when(v.windowStart, tz) || word(v.type)}</span>{v.publicCode ? <Link href={`/visit/${v.publicCode}`} className="text-sm font-bold text-[var(--clay)] underline">Details</Link> : <Status value={v.status} />}</li>)}</ul></div>}
        </aside>
      </div>
    </Section>
  )
}

/* ------------------------------------------------------------------ S25 profile */

export async function AccountProfileScreen() {
  await customerOrSignIn('/account/profile')
  const r = await mine<any>('myProfile')
  if (!r.ok) return <Failed error={r.error} />
  const p = r.data
  if (!p) notFound()
  return (
    <Section className="grid max-w-[1000px] gap-8 lg:grid-cols-[1.6fr_1fr]">
      <div className="sf-card p-6">
        <h1 className="mb-4 text-[1.6rem] font-extrabold">Your details</h1>
        <ProfileForm p={p} />
      </div>
      <div className="sf-card h-fit p-6">
        <h2 className="mb-3 text-xl font-bold">Password</h2>
        <ChangePasswordForm />
        <p className="sf-help mt-4">Customer number {p.number}</p>
      </div>
    </Section>
  )
}
