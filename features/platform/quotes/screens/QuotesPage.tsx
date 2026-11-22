import Link from 'next/link'
import { q, company, viewer, requestTime } from '../../lib/server'
import { money, when } from '../../lib/format'
import { Page, Row, Section, Status, Tabs, Meta, Empty } from '../../components/ui'
import { ActionButton } from '../../components/ActionButton'

const VIEWS = [
  { key: 'open', label: 'Open', status: ['draft', 'approved', 'sent', 'viewed'] },
  { key: 'approval', label: 'Needs approval', status: ['pending_approval'] },
  { key: 'expired', label: 'Expired', status: ['sent', 'viewed', 'expired'] },
  { key: 'accepted', label: 'Accepted', status: ['accepted'] },
  { key: 'closed', label: 'Declined and cancelled', status: ['declined', 'cancelled', 'superseded'] },
]

/** P10 quotes by status with expired ones shown (validUntil passed reads expired); P8 the approval tab. */
export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams
  const view = VIEWS.find(v => v.key === sp.view) ?? VIEWS[0]
  const [co, me] = await Promise.all([company(), viewer()])
  const nowIso = new Date(requestTime()).toISOString()
  const where: any = { status: { in: view.status }, isLatest: { equals: true } }
  if (view.key === 'expired') where.OR = [{ status: { equals: 'expired' } }, { validUntil: { lt: nowIso } }]
  if (view.key === 'open') where.OR = [{ validUntil: null }, { validUntil: { gte: nowIso } }, { status: { in: ['draft', 'approved'] } }]
  const d = await q<any>(`query($w: QuoteWhereInput!) {
    quotes(where: $w, orderBy: [{ createdAt: desc }], take: 200) { id number version kind status casVersion validUntil totalAmount currencyCode sentAt customer { name } lead { number } preparedBy { name } }
    approval: quotesCount(where: { status: { equals: "pending_approval" } })
  }`, { w: where })
  const expired = (x: any) => x.status === 'expired' || (['sent', 'viewed'].includes(x.status) && x.validUntil && x.validUntil < nowIso)
  return (
    <Page title="Quotes">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs active={view.key} items={VIEWS.map(v => ({ key: v.key, label: v.label, href: `/dashboard/platform/quotes?view=${v.key}`, count: v.key === 'approval' ? d.approval : undefined }))} />
        {me.can('canManageQuotes') ? <Link href="/dashboard/platform/quotes/new" className="rounded-md border px-3 py-1.5 text-sm font-medium">New quote</Link> : null}
      </div>
      <Section title={view.label}>
        {d.quotes.length ? d.quotes.map((x: any) => (
          <Row key={x.id}>
            <Link href={`/dashboard/platform/quotes/${x.id}`} className="hover:underline">{x.number}{x.version > 1 ? ` v${x.version}` : ''} · {x.customer?.name ?? ''}{x.lead ? ` · ${x.lead.number}` : ''}{x.kind === 'service' ? ' · repair' : ''}</Link>
            <Meta>from {money(x.totalAmount, x.currencyCode)} · {x.preparedBy?.name ?? ''}{x.sentAt ? ` · sent ${when(x.sentAt, co.timezone)}` : ''}{x.validUntil ? ` · valid to ${when(x.validUntil, co.timezone, 'date')}` : ''}</Meta>
            <span className="flex items-center gap-2">
              <Status value={expired(x) ? 'expired' : x.status} />
              {view.key === 'approval' && me.can('canApproveDiscounts') ? <ActionButton op="approveQuote" vars={{ quoteId: x.id, expectedVersion: x.casVersion }} paths={['/dashboard/platform/quotes']} className="border">Approve discount</ActionButton> : null}
            </span>
          </Row>
        )) : <Empty>No quotes here.</Empty>}
      </Section>
    </Page>
  )
}
