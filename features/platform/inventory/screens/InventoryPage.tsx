import Link from 'next/link'
import { q, company, viewer } from '../../lib/server'
import { label, money, when } from '../../lib/format'
import { Page, Row, Section, Status, Tabs, Meta, Empty, Stat } from '../../components/ui'
import { CommandForm } from '../../components/CommandForm'
import { ActionButton } from '../../components/ActionButton'

const PATH = '/dashboard/platform/inventory'
const VIEWS = [
  { key: 'stock', label: 'Stock by location' },
  { key: 'low', label: 'Low stock' },
  { key: 'serials', label: 'Serial numbers' },
  { key: 'moves', label: 'Movements' },
] as const

/**
 * P53 stock by location with count, adjust and transfer; the low-stock list (on hand less reserved at or under the reorder
 * point); P55 serial numbers and where each unit is. Every change goes through adjustStock, transferStock or moveSerial,
 * which write a stock movement and an audit row.
 */
export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ view?: string; location?: string; serial?: string }> }) {
  const sp = await searchParams
  const view = VIEWS.find(v => v.key === sp.view) ?? VIEWS[0]
  const [co, me] = await Promise.all([company(), viewer()])
  if (!me.can('canManageInventory')) {
    return <Page title="Inventory"><Empty>Your role cannot see stock. Ask the owner for inventory access.</Empty></Page>
  }
  const d = await q<any>(`{
    stockLocations(where: { isActive: { equals: true } }, orderBy: [{ name: asc }]) { id name type technician { name } branch { name } }
    stockLevels(take: 2000) { id onHand reserved reorderPoint product { id name sku type isSerialized unitCostAmount } location { id name } }
    serializedUnits(orderBy: [{ updatedAt: desc }], take: 500) {
      id serialNumber status updatedAt product { name } location { id name } order { id number } installedSystem { id number customer { name } }
    }
    stockMovements(orderBy: [{ createdAt: desc }], take: 80) { id type quantity reason refType createdAt product { name } location { name } user { name } }
    products(where: { type: { not: { equals: "service" } } }, orderBy: [{ name: asc }]) { id name sku }
  }`)
  const locations: any[] = d.stockLocations
  const loc = locations.find(l => l.id === sp.location) ?? null
  const levels: any[] = d.stockLevels.filter((l: any) => l.product && l.location && (!loc || l.location.id === loc.id))
  levels.sort((a, b) => a.location.name.localeCompare(b.location.name) || a.product.name.localeCompare(b.product.name))
  const free = (l: any) => l.onHand - l.reserved
  const low = levels.filter(l => l.reorderPoint > 0 && free(l) <= l.reorderPoint)
  const value = levels.reduce((t, l) => t + l.onHand * (l.product.unitCostAmount ?? 0), 0)
  const serialQuery = (sp.serial ?? '').trim().toLowerCase()
  const serials: any[] = d.serializedUnits.filter((s: any) => (!loc || s.location?.id === loc.id) && (!serialQuery || s.serialNumber.toLowerCase().includes(serialQuery)))
  const locOptions = locations.map(l => ({ value: l.id, label: l.name }))
  const qs = (k: string) => `${PATH}?view=${k}${loc ? `&location=${loc.id}` : ''}`

  return (
    <Page title="Inventory">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat name="Locations" value={locations.length} />
        <Stat name="Low stock" value={low.length} />
        <Stat name="Units in stock with a serial" value={d.serializedUnits.filter((s: any) => s.status === 'in_stock').length} />
        <Stat name={loc ? `Stock value at ${loc.name}` : 'Stock value at cost'} value={money(value, co.currencyCode)} />
      </div>
      <Tabs active={view.key} items={VIEWS.map(v => ({ key: v.key, label: v.label, href: qs(v.key), count: v.key === 'low' ? low.length : undefined }))} />
      <div className="flex flex-wrap gap-3 text-sm">
        <Link href={`${PATH}?view=${view.key}`} className={!loc ? 'font-medium underline' : 'text-muted-foreground hover:underline'}>Every location</Link>
        {locations.map(l => <Link key={l.id} href={`${PATH}?view=${view.key}&location=${l.id}`} className={loc?.id === l.id ? 'font-medium underline' : 'text-muted-foreground hover:underline'}>{l.name}</Link>)}
      </div>

      {view.key === 'stock' || view.key === 'low' ? (
        <Section title={`${view.key === 'low' ? 'At or under the reorder point' : 'On hand'} · ${(view.key === 'low' ? low : levels).length}`}>
          {(view.key === 'low' ? low : levels).length ? (view.key === 'low' ? low : levels).map(l => (
            <div key={l.id} className="space-y-2 border-b py-3 last:border-b-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span><span className="font-medium">{l.product.name}</span> <Meta>{l.product.sku} · {l.location.name}</Meta></span>
                <span className="font-mono text-sm">
                  {l.onHand} on hand · {l.reserved} reserved · <span className={free(l) <= l.reorderPoint && l.reorderPoint > 0 ? 'text-red-600' : ''}>{free(l)} free</span>
                  {l.reorderPoint ? ` · reorder at ${l.reorderPoint}` : ''}
                </span>
              </div>
              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground">Count, adjust or transfer</summary>
                <div className="mt-2 space-y-2">
                  <CommandForm op="adjustStock" submit="Save count" fixed={{ productId: l.product.id, locationId: l.location.id }} paths={[PATH]}
                    fields={[{ name: 'countedQuantity', label: 'Counted on the shelf', kind: 'number', width: 'sm', required: true }, { name: 'reason', label: 'Reason', width: 'md', defaultValue: 'Stock count' }]} />
                  <CommandForm op="adjustStock" submit="Adjust" fixed={{ productId: l.product.id, locationId: l.location.id }} paths={[PATH]}
                    fields={[{ name: 'delta', label: 'Change (+ or -)', kind: 'number', width: 'sm', required: true }, { name: 'reason', label: 'Reason (damaged, found, written off)', width: 'lg', required: true }]} />
                  <CommandForm op="transferStock" submit="Transfer" fixed={{ productId: l.product.id, fromLocationId: l.location.id }} paths={[PATH]}
                    fields={[
                      { name: 'toLocationId', label: 'To', kind: 'select', width: 'md', options: locOptions.filter(o => o.value !== l.location.id) },
                      { name: 'quantity', label: 'Quantity', kind: 'number', width: 'sm', required: true },
                      { name: 'reason', label: 'Note', width: 'md' },
                    ]} />
                </div>
              </details>
            </div>
          )) : <Empty>{view.key === 'low' ? 'Nothing is under its reorder point.' : 'No stock recorded here yet. Receive a purchase order under Purchasing.'}</Empty>}
          {view.key === 'low' && low.length ? <p><Meta>Order more under <Link className="underline" href="/dashboard/platform/purchasing">Purchasing</Link>.</Meta></p> : null}
        </Section>
      ) : null}

      {view.key === 'serials' ? (
        <Section title={`Serial numbers · ${serials.length}`}>
          <form className="flex flex-wrap items-end gap-2" action={PATH}>
            <input type="hidden" name="view" value="serials" />
            {loc ? <input type="hidden" name="location" value={loc.id} /> : null}
            <input name="serial" defaultValue={sp.serial ?? ''} placeholder="Find a serial number" className="h-9 w-full rounded-md border bg-background px-3 text-sm sm:w-64" />
            <button className="h-9 rounded-md border px-3 text-sm">Find</button>
          </form>
          {serials.length ? serials.map(s => (
            <Row key={s.id}>
              <span className="space-y-0.5">
                <span className="block font-mono text-sm font-medium">{s.serialNumber}</span>
                <Meta>
                  {s.product?.name ?? ''}{s.location ? ` · ${s.location.name}` : ''}
                  {s.order ? <> · order <Link className="underline" href={`/dashboard/platform/orders/${s.order.id}`}>{s.order.number}</Link></> : null}
                  {s.installedSystem ? <> · system <Link className="underline" href={`/dashboard/platform/systems/${s.installedSystem.id}`}>{s.installedSystem.number}</Link> at {s.installedSystem.customer?.name ?? ''}</> : null}
                  {` · since ${when(s.updatedAt, co.timezone, 'date')}`}
                </Meta>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <Status value={s.status} />
                {s.status !== 'installed' && !s.order ? (
                  <>
                    <CommandForm op="moveSerial" submit="Move" fixed={{ serialNumber: s.serialNumber }} paths={[PATH]}
                      fields={[{ name: 'locationId', label: 'To', kind: 'select', width: 'sm', options: locOptions.filter(o => o.value !== s.location?.id) }]} />
                    {s.status !== 'scrapped' ? <ActionButton op="moveSerial" vars={{ serialNumber: s.serialNumber, status: 'scrapped' }} paths={[PATH]} ask="Why is this unit scrapped?">Scrap</ActionButton> : null}
                    {s.status !== 'in_stock' ? <ActionButton op="moveSerial" vars={{ serialNumber: s.serialNumber, status: 'in_stock' }} paths={[PATH]} ask="Why is it back in stock?">Back in stock</ActionButton> : null}
                  </>
                ) : null}
              </span>
            </Row>
          )) : <Empty>No serial numbers match.</Empty>}
        </Section>
      ) : null}

      {view.key === 'moves' ? (
        <Section title="Latest stock movements">
          {d.stockMovements.length ? d.stockMovements.map((m: any) => (
            <Row key={m.id}>
              <span>{label(m.type)} · {m.quantity < 0 ? m.quantity : ['pick', 'consume', 'transfer_out'].includes(m.type) ? `-${m.quantity}` : ['reserve', 'release'].includes(m.type) ? m.quantity : `+${m.quantity}`} {m.product?.name ?? ''}</span>
              <Meta>{m.location?.name ?? ''}{m.reason ? ` · ${m.reason}` : ''}{m.refType ? ` · ${label(m.refType)}` : ''}{m.user ? ` · ${m.user.name}` : ''} · {when(m.createdAt, co.timezone)}</Meta>
            </Row>
          )) : <Empty>No movements yet.</Empty>}
        </Section>
      ) : null}
    </Page>
  )
}
