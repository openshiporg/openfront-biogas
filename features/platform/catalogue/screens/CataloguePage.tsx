import Link from 'next/link'
import { q, company, viewer } from '../../lib/server'
import { label, money } from '../../lib/format'
import { Page, Row, Section, Status, Tabs, Meta, Empty, Stat } from '../../components/ui'
import { RecordForm } from '../../records/RecordForm'
import { SaveButton } from '../../records/RecordButtons'

const PATH = '/dashboard/platform/catalogue'
const TYPES = ['digester_kit', 'appliance', 'part', 'consumable', 'service']

/** P52: products by type with price, stock and published state; publish or hide in one tap; add a product. Detail at catalogue/[id]. */
export default async function CataloguePage({ searchParams }: { searchParams: Promise<{ type?: string; show?: string }> }) {
  const sp = await searchParams
  const [co, me] = await Promise.all([company(), viewer()])
  if (!me.can('canManageCatalog')) {
    return <Page title="Catalogue"><Empty>Your role cannot edit the catalogue. Ask the owner for catalogue access.</Empty></Page>
  }
  const d = await q<any>(`{
    products(orderBy: [{ name: asc }], take: 500) {
      id name sku type priceAmount currencyCode isPublished sellOnline availableQuantity imageUrl image { url }
      category { name } digesterSpec { capacityM3 } kitComponentsCount fitsPartsCount
    }
    productCategories(orderBy: [{ name: asc }]) { id name }
  }`)
  const all: any[] = d.products
  const type = TYPES.includes(sp.type ?? '') ? sp.type! : 'all'
  let list = type === 'all' ? all : all.filter(p => p.type === type)
  if (sp.show === 'hidden') list = list.filter(p => !p.isPublished)
  const count = (t: string) => t === 'all' ? all.length : all.filter(p => p.type === t).length

  return (
    <Page title="Catalogue">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat name="Products" value={all.length} />
        <Stat name="On the storefront" value={all.filter(p => p.isPublished && p.sellOnline).length} />
        <Stat name="Hidden" value={all.filter(p => !p.isPublished).length} />
        <Stat name="Out of stock" value={all.filter(p => p.type !== 'service' && p.availableQuantity !== null && p.availableQuantity <= 0).length} />
      </div>
      <Tabs active={type} items={[{ key: 'all', label: 'All', href: PATH, count: count('all') }, ...TYPES.map(t => ({ key: t, label: label(t), href: `${PATH}?type=${t}`, count: count(t) }))]} />
      <div className="text-sm">
        <Link href={`${PATH}?type=${type}${sp.show === 'hidden' ? '' : '&show=hidden'}`} className="text-muted-foreground underline">{sp.show === 'hidden' ? 'Show all' : 'Only hidden'}</Link>
      </div>
      <Section title={`${list.length} products`}>
        {list.length ? list.map(p => (
          <Row key={p.id}>
            <Link href={`${PATH}/${p.id}`} className="flex min-w-0 items-center gap-3 hover:underline">
              {p.image?.url || p.imageUrl ? <img src={p.image?.url || p.imageUrl} alt="" className="size-10 shrink-0 rounded object-cover" /> : <span className="size-10 shrink-0 rounded bg-muted" />}
              <span className="min-w-0 space-y-0.5">
                <span className="block font-medium">{p.name}</span>
                <Meta>{p.sku} · {label(p.type)}{p.category ? ` · ${p.category.name}` : ''}{p.digesterSpec?.capacityM3 ? ` · ${p.digesterSpec.capacityM3} m³` : ''}{p.kitComponentsCount ? ` · ${p.kitComponentsCount} kit items` : ''}{p.fitsPartsCount ? ` · ${p.fitsPartsCount} parts fit` : ''}</Meta>
              </span>
            </Link>
            <span className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-sm">{money(p.priceAmount, p.currencyCode)}</span>
              {p.type !== 'service' ? <Meta>{p.availableQuantity ?? 0} free</Meta> : null}
              <Status value={p.isPublished ? 'published' : 'draft'} />
              <SaveButton list="Product" id={p.id} data={{ isPublished: !p.isPublished }} paths={[PATH]}>{p.isPublished ? 'Hide' : 'Publish'}</SaveButton>
            </span>
          </Row>
        )) : <Empty>No products here.</Empty>}
      </Section>
      <Section title="Add a product">
        <RecordForm list="Product" submit="Add product" paths={[PATH]} fields={[
          { name: 'name', label: 'Name', required: true, width: 'lg' },
          { name: 'sku', label: 'SKU', required: true, width: 'sm' },
          { name: 'slug', label: 'Web address name', required: true, width: 'md', placeholder: 'homebag-4' },
          { name: 'type', label: 'Type', kind: 'select', width: 'sm', options: TYPES.map(t => ({ value: t, label: label(t) })) },
          { name: 'category', label: 'Category', kind: 'select', width: 'md', options: [{ value: '', label: 'None' }, ...d.productCategories.map((c: any) => ({ value: c.id, label: c.name }))] },
          { name: 'priceAmount', label: `Price (${co.currencyCode})`, kind: 'money', width: 'sm', required: true },
        ]} />
        <Meta>New products start hidden. Open one to add its specs, kit contents, what fits it and a photo, then publish.</Meta>
      </Section>
    </Page>
  )
}
