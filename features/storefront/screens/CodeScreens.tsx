import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getOrder, getPaySession, getQuote, getVisit } from '../lib/data/codes'
import { getStore } from '../lib/data/store'
import { date, money, statusText, word } from '../lib/format'
import { Notice, PageHead, Rows, Section, Status } from '../components/ui'
import { QuoteAccept } from '../components/QuoteAccept'
import { PayPanel } from '../components/PayPanel'
import { VisitChange } from '../components/VisitChange'
import { PrepList } from '../components/PrepList'

const when = (iso: string | null, tz: string) => (iso ? new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz }).format(new Date(iso)) : '')
const hour = (iso: string | null, tz: string) => (iso ? new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(new Date(iso)) : '')

/* ------------------------------------------------------------------ S6, S7 quote */

export async function QuoteScreen({ code }: { code: string }) {
  const [q, store] = await Promise.all([getQuote(code), getStore()])
  if (!q) notFound()
  return (
    <>
      <PageHead title={`Quote ${q.number}${q.version > 1 ? ` (version ${q.version})` : ''}`} intro={q.customerName ? `Prepared for ${q.customerName}` : undefined}>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Status value={q.status} />
          {q.validUntil && q.canAccept && <span>Valid until {date(q.validUntil, store.timezone)}</span>}
          {q.site && <span className="text-[var(--muted)]">{[q.site.addressLine, q.site.city].filter(Boolean).join(', ')}</span>}
        </div>
      </PageHead>
      <Section className="space-y-8">
        {q.status === 'accepted' && (
          <Notice tone="good" title={`Accepted${q.signedName ? ` by ${q.signedName}` : ''}${q.signedAt ? ` on ${date(q.signedAt, store.timezone)}` : ''}`}>
            {q.order ? <>Your order is under way. <Link href={`/order/${q.order.code}`} className="font-bold text-[var(--clay)] underline">See your order and pay</Link>.</> : null}
          </Notice>
        )}
        {q.status === 'declined' && <Notice title="You declined this quote">Changed your mind? <Link href="/get-a-quote" className="font-bold text-[var(--clay)] underline">Ask us for a new one</Link>.</Notice>}
        {q.status === 'expired' && <Notice tone="wait" title="This quote has expired">Prices may have changed. Call us{store.phone ? ` on ${store.phone}` : ''} and we will send a fresh one.</Notice>}
        {q.status === 'superseded' && <Notice tone="wait" title="There is a newer version of this quote">Use the latest link we sent you.</Notice>}
        <QuoteAccept code={q.code} currencyCode={q.currencyCode} options={q.options} canAccept={Boolean(q.canAccept) && q.kind !== 'service'} />
        {q.notes && <div className="sf-card p-6"><h2 className="text-xl font-bold">Notes</h2><p className="mt-2 whitespace-pre-line">{q.notes}</p></div>}
        {q.terms && <details className="sf-card p-6"><summary className="cursor-pointer text-xl font-bold text-[var(--forest)]">Terms</summary><p className="mt-3 whitespace-pre-line text-[0.95rem]">{q.terms}</p></details>}
      </Section>
    </>
  )
}

/* ------------------------------------------------------------------ S12, S13, S14 pay a link */

export async function PayScreen({ code }: { code: string }) {
  const [s, store] = await Promise.all([getPaySession(code), getStore()])
  if (!s) notFound()
  const what = s.description || word(s.purpose)
  return (
    <>
      <PageHead title={s.status === 'captured' ? 'Paid, thank you' : `Pay ${money(s.amount, s.currencyCode)}`} intro={what} />
      <Section className="grid max-w-[1000px] gap-8 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-5">
          {s.status === 'captured' && <Notice tone="good" title="Payment received">{s.payments.find((p: any) => p.receiptNumber)?.receiptNumber ? `Receipt ${s.payments.find((p: any) => p.receiptNumber).receiptNumber}.` : 'We have your payment.'}</Notice>}
          {s.status === 'awaiting_verification' && <Notice tone="wait" title="We have your reference">We are checking the payment and will confirm it, usually the same working day. You can close this page.</Notice>}
          {s.status === 'expired' && <Notice tone="bad" title="This payment link has expired">Ask us for a new one{store.phone ? ` on ${store.phone}` : ''}.</Notice>}
          {['cancelled', 'failed'].includes(s.status) && <Notice tone="bad" title="This payment link is no longer open">Ask us for a new one{store.phone ? ` on ${store.phone}` : ''}.</Notice>}
          {s.payments.some((p: any) => p.status === 'rejected') && s.canPay && <Notice tone="bad" title="We could not match your last payment">{s.payments.find((p: any) => p.status === 'rejected')?.rejectReason || 'Check the reference and try again, or call us.'}</Notice>}
          {s.canPay && <div className="sf-card p-6"><PayPanel code={s.code} amount={s.amount} currencyCode={s.currencyCode} methods={s.methods} /></div>}
        </div>
        <aside className="sf-card h-fit p-6">
          <h2 className="text-xl font-bold">Summary</h2>
          <Rows rows={[
            ['For', what],
            ['Amount', money(s.amount, s.currencyCode)],
            ['Status', <Status key="s" value={s.status} />],
            ['Pay by', s.canPay && s.expiresAt ? date(s.expiresAt, store.timezone, true) : ''],
            ['Order', s.order ? <Link key="o" href={`/order/${s.order.code}`} className="text-[var(--clay)] underline">{s.order.number}</Link> : ''],
            ['Visit', s.visit ? <Link key="v" href={`/visit/${s.visit.code}`} className="text-[var(--clay)] underline">{s.visit.number}</Link> : ''],
            ['Service plan', s.plan?.name ?? ''],
          ]} />
          {s.installments.length > 0 && (
            <ul className="mt-3 space-y-1 text-[0.95rem]">{s.installments.map((i: any) => <li key={i.id} className="flex justify-between"><span>{i.label}{i.dueDate ? `, due ${date(i.dueDate, store.timezone)}` : ''}</span><span>{money(i.amount - i.paidAmount, s.currencyCode)}</span></li>)}</ul>
          )}
          {s.payments.length > 0 && (
            <>
              <h3 className="mt-5 font-bold">Payments</h3>
              <ul className="mt-2 space-y-1 text-[0.95rem]">{s.payments.map((p: any, i: number) => <li key={i} className="flex justify-between gap-2"><span>{s.methods.find((m: any) => m.code === p.method)?.label ?? word(p.method)} {p.reference ? <span className="font-mono text-sm">{p.reference}</span> : null}</span><Status value={p.status} /></li>)}</ul>
            </>
          )}
        </aside>
      </Section>
    </>
  )
}

/* ------------------------------------------------------------------ S15 order by code */

export async function OrderView({ o, tz, prepEditable, backHref }: { o: any; tz: string; prepEditable: boolean; backHref?: string }) {
  const m = (v: number) => money(v, o.currencyCode)
  return (
    <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-6">
        {o.payLinks.length > 0 && (
          <div className="sf-card space-y-3 border-[var(--clay)] p-6">
            <h2 className="text-xl font-bold">To pay</h2>
            {o.payLinks.map((p: any) => (
              <div key={p.code} className="flex flex-wrap items-center justify-between gap-3">
                <span>{word(p.purpose)}: <strong>{m(p.amount)}</strong>{p.expiresAt ? <span className="text-[var(--muted)]"> by {date(p.expiresAt, tz)}</span> : null}</span>
                <Link href={`/pay/${p.code}`} className="sf-btn sf-btn-sm">Pay now</Link>
              </div>
            ))}
          </div>
        )}
        {o.installation && (
          <div className="sf-card space-y-4 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold">Your installation</h2>
              <Status value={o.installation.status} />
            </div>
            {o.installation.targetDate && <p>Planned for {date(o.installation.targetDate, tz)}</p>}
            {o.installation.visits.length > 0 && (
              <ul className="space-y-2">{o.installation.visits.map((v: any) => (
                <li key={v.number} className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] bg-[var(--cream-2)] px-4 py-3">
                  <span><strong>{word(v.type)}</strong>{v.windowStart ? `: ${when(v.windowStart, tz)}` : ''}</span>
                  <span className="flex items-center gap-2"><Status value={v.status} />{v.publicCode && <Link href={`/visit/${v.publicCode}`} className="text-sm font-bold text-[var(--clay)] underline">Details</Link>}</span>
                </li>
              ))}</ul>
            )}
            {o.installation.prepTasks.length > 0 && (
              <div>
                <h3 className="text-lg font-bold">Get your site ready</h3>
                <PrepList tasks={o.installation.prepTasks} editable={prepEditable} path={backHref ?? `/order/${o.code}`} />
                {!prepEditable && <p className="sf-help mt-2"><Link href="/sign-in" className="underline">Sign in</Link> to tick these off.</p>}
              </div>
            )}
          </div>
        )}
        <div className="sf-card p-6">
          <h2 className="text-xl font-bold">Items</h2>
          <table className="mt-3 w-full text-[0.95rem]">
            <caption className="sr-only">Items in order {o.number}</caption>
            <tbody className="divide-y divide-[var(--line)]">
              {o.lines.map((l: any) => <tr key={l.id}><td className="py-2 pr-2">{l.quantity > 1 ? `${l.quantity} × ` : ''}{l.name}{l.warrantyMonths ? <span className="block text-sm text-[var(--muted)]">{l.warrantyMonths}-month warranty</span> : null}</td><td className="py-2 text-right">{m(l.totalAmount)}</td></tr>)}
            </tbody>
          </table>
          <Rows rows={[
            ['Subtotal', m(o.subtotalAmount)],
            ['Discount', o.discountAmount ? `−${m(o.discountAmount)}` : ''],
            ['Survey fee credit', o.surveyFeeCreditAmount ? `−${m(o.surveyFeeCreditAmount)}` : ''],
            ['Delivery', o.deliveryAmount ? m(o.deliveryAmount) : ''],
            ['Tax', o.taxAmount ? m(o.taxAmount) : ''],
            ['Total', m(o.totalAmount)],
            ['Paid', m(o.paidAmount - o.refundedAmount)],
            ['Left to pay', m(Math.max(0, o.balanceAmount))],
          ]} />
        </div>
        {o.plan && (
          <div className="sf-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold">Payment plan</h2><Status value={o.plan.status} /></div>
            <ul className="mt-3 divide-y divide-[var(--line)]">{o.plan.installments.map((i: any) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{i.label}{i.dueDate ? <span className="text-[var(--muted)]">, {date(i.dueDate, tz)}</span> : i.trigger ? <span className="text-[var(--muted)]">, {statusText(i.trigger)}</span> : null}</span><span className="flex items-center gap-3">{m(i.amount)}<Status value={i.status} /></span></li>
            ))}</ul>
          </div>
        )}
      </div>
      <aside className="space-y-6">
        <div className="sf-card p-6">
          <Rows rows={[
            ['Order', o.number],
            ['Placed', date(o.createdAt, tz)],
            ['Status', <Status key="s" value={o.status} />],
            ['How', o.fulfilment ? word(o.fulfilment) : ''],
            ['Branch', o.branch?.name ?? ''],
            ['Tracking', o.trackingNumber ? `${o.carrier ? `${o.carrier} ` : ''}${o.trackingNumber}` : ''],
            ['Quote', o.quote ? <Link key="q" href={`/quote/${o.quote.code}`} className="text-[var(--clay)] underline">{o.quote.number}</Link> : ''],
          ]} />
          {o.cancelReason && <p className="mt-3 text-[var(--bad)]">Cancelled: {o.cancelReason}</p>}
        </div>
        {o.payments.length > 0 && (
          <div className="sf-card p-6">
            <h2 className="text-lg font-bold">Payments and receipts</h2>
            <ul className="mt-2 space-y-2 text-[0.95rem]">{o.payments.map((p: any, i: number) => (
              <li key={i} className="flex flex-wrap justify-between gap-2"><span>{date(p.at, tz)} · {word(p.method)}{p.receiptNumber ? <span className="block text-sm text-[var(--muted)]">Receipt {p.receiptNumber}</span> : null}</span><span className="text-right">{m(p.amount)}<br /><Status value={p.status} /></span></li>
            ))}</ul>
          </div>
        )}
        {o.invoices.length > 0 && (
          <div className="sf-card p-6">
            <h2 className="text-lg font-bold">Invoices</h2>
            <ul className="mt-2 space-y-1 text-[0.95rem]">{o.invoices.map((i: any) => <li key={i.number} className="flex justify-between"><span>{i.number}</span><span>{m(i.totalAmount)}</span></li>)}</ul>
          </div>
        )}
        {o.systems.length > 0 && (
          <div className="sf-card p-6">
            <h2 className="text-lg font-bold">Your system</h2>
            <ul className="mt-2">{o.systems.map((s: any) => <li key={s.id}>{s.number}{s.publicCode ? <span className="text-sm text-[var(--muted)]"> · code {s.publicCode}</span> : null}</li>)}</ul>
            <Link href="/support" className="mt-3 inline-block font-bold text-[var(--clay)] underline">Report a problem</Link>
          </div>
        )}
      </aside>
    </div>
  )
}

export async function OrderScreen({ code }: { code: string }) {
  const [o, store] = await Promise.all([getOrder(code), getStore()])
  if (!o) notFound()
  return (
    <>
      <PageHead title={`Order ${o.number}`}><div className="mt-3"><Status value={o.status} /></div></PageHead>
      <Section><OrderView o={o} tz={store.timezone} prepEditable={false} /></Section>
    </>
  )
}

/* ------------------------------------------------------------------ S16 visit by code */

export async function VisitScreen({ code }: { code: string }) {
  const [v, store] = await Promise.all([getVisit(code), getStore()])
  if (!v) notFound()
  const open = ['scheduled', 'rescheduled', 'requested'].includes(v.status)
  const late = v.freeChangeUntil && new Date(v.freeChangeUntil).getTime() < Date.now()
  const warning = late ? `It is less than ${v.cutoffHours} hours before the visit${v.feeAmount && v.feePaid ? `, so the ${money(v.feeAmount, store.currencyCode)} survey fee may not be refunded` : ''}.` : v.freeChangeUntil ? `You can change or cancel free of charge until ${when(v.freeChangeUntil, store.timezone)}.` : null
  return (
    <>
      <PageHead title={`${word(v.type)} visit`} intro={`Reference ${v.number}`}><div className="mt-3"><Status value={v.status} /></div></PageHead>
      <Section className="grid max-w-[1000px] gap-8 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <div className="sf-card p-6">
            <p className="text-sm text-[var(--muted)]">When</p>
            <p className="text-2xl font-bold text-[var(--forest)]">{v.windowStart ? `${when(v.windowStart, store.timezone)}${v.windowEnd ? `–${hour(v.windowEnd, store.timezone)}` : ''}` : v.date ? date(v.date) : 'We will call you to agree a time'}</p>
            {v.technicians.length > 0 && <p className="mt-2">Coming: {v.technicians.join(', ')}</p>}
            {v.site && <p className="mt-2 text-[var(--muted)]">{[v.site.addressLine, v.site.city].filter(Boolean).join(', ')}</p>}
            {v.status === 'cancelled' && <p className="mt-3 text-[var(--bad)]">Cancelled{v.cancelReason ? `: ${v.cancelReason}` : ''}</p>}
          </div>
          {open && v.canChange && <div className="sf-card p-6"><VisitChange code={v.code} timeZone={store.timezone} warning={warning} /></div>}
          {open && !v.canChange && <Notice title="Need to change this visit?">Call us{store.phone ? ` on ${store.phone}` : ''} and we will sort it out.</Notice>}
        </div>
        <aside className="sf-card h-fit p-6">
          <Rows rows={[
            ['Visit', word(v.type)],
            ['Fee', v.feeAmount ? `${money(v.feeAmount, store.currencyCode)}${v.feePaid ? ' (paid)' : ''}` : ''],
            ['Free changes until', v.freeChangeUntil && open ? when(v.freeChangeUntil, store.timezone) : ''],
          ]} />
        </aside>
      </Section>
    </>
  )
}
