import Link from 'next/link'
import { q, company, viewer } from '../../lib/server'
import { label, money } from '../../lib/format'
import { Page, Row, Section, Status, Meta, Empty } from '../../components/ui'
import { RecordForm } from '../../records/RecordForm'
import { RemoveButton, SaveButton, ProductImageUpload } from '../../records/RecordButtons'

const TYPES = ['digester_kit', 'appliance', 'part', 'consumable', 'service']
const TECH = ['prefab_bag', 'prefab_tube', 'prefab_tank', 'fixed_dome', 'floating_drum', 'container']
const FEED = ['cattle', 'pigs', 'poultry', 'goats', 'food_waste', 'human_waste']
const txt = (v: unknown) => (v === null || v === undefined ? '' : String(v))

/** P52: one product. Details and prices, digester specs (size, gas, feed, footprint, warranties), kit contents, what parts fit it, photo, publish. */
export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [co, me] = await Promise.all([company(), viewer()])
  if (!me.can('canManageCatalog')) return <Page title="Product"><Empty>Your role cannot edit the catalogue.</Empty></Page>
  const d = await q<any>(`query($id: ID!) {
    product(where: { id: $id }) {
      id name slug sku type description imageUrl image { url } priceAmount compareAtAmount currencyCode taxable isPublished isSerialized sellOnline
      requiresInstallation requiresSurvey installFeeAmount weightKg warrantyMonths unitCostAmount availableQuantity category { id }
      digesterSpec { id capacityM3 technology feedstockTypes minDailyFeedKg maxDailyFeedKg dailyGasM3 cookingHoursPerDay servesPeople footprintLengthM footprintWidthM waterPerDayL reactorWarrantyMonths partsWarrantyMonths installHours surveyKind }
      kitComponents { id quantity component { id name sku } }
      fitsParts { id name sku } compatibleWith { id name sku }
    }
    productCategories(orderBy: [{ name: asc }]) { id name }
    products(orderBy: [{ name: asc }], take: 500) { id name sku type }
  }`, { id })
  const p = d.product
  if (!p) return <Page title="Product" crumbs={[{ label: 'Catalogue', href: '/dashboard/platform/catalogue' }]}><Empty>Product not found.</Empty></Page>
  const path = `/dashboard/platform/catalogue/${p.id}`
  const paths = [path, '/dashboard/platform/catalogue']
  const s = p.digesterSpec
  const parts = d.products.filter((x: any) => x.id !== p.id && x.type !== 'digester_kit' && x.type !== 'service')
  const kits = d.products.filter((x: any) => x.type === 'digester_kit')
  const yes = (v: boolean) => v

  return (
    <Page title={p.name} crumbs={[{ label: 'Catalogue', href: '/dashboard/platform/catalogue' }]}>
      <div className="flex flex-wrap items-center gap-3">
        <Status value={p.isPublished ? 'published' : 'draft'} />
        <span className="font-mono text-sm">{money(p.priceAmount, p.currencyCode)}</span>
        {p.type !== 'service' ? <Meta>{p.availableQuantity ?? 0} free to sell · <Link className="underline" href="/dashboard/platform/inventory">stock</Link></Meta> : null}
        <SaveButton list="Product" id={p.id} data={{ isPublished: !p.isPublished }} paths={paths}>{p.isPublished ? 'Hide from the storefront' : 'Publish'}</SaveButton>
        {p.isPublished ? <a className="text-xs underline" href={p.type === 'digester_kit' ? `/systems/${p.slug}` : `/shop/p/${p.slug}`} target="_blank" rel="noreferrer">View on the storefront</a> : null}
      </div>

      <Section title="Details and price">
        <RecordForm list="Product" id={p.id} submit="Save details" paths={paths} fields={[
          { name: 'name', label: 'Name', required: true, width: 'lg', defaultValue: p.name },
          { name: 'sku', label: 'SKU', required: true, width: 'sm', defaultValue: p.sku },
          { name: 'slug', label: 'Web address name', required: true, defaultValue: p.slug },
          { name: 'type', label: 'Type', kind: 'select', width: 'sm', defaultValue: p.type, options: TYPES.map(t => ({ value: t, label: label(t) })) },
          { name: 'category', label: 'Category', kind: 'select', defaultValue: p.category?.id ?? '', options: [{ value: '', label: 'None' }, ...d.productCategories.map((c: any) => ({ value: c.id, label: c.name }))] },
          { name: 'priceAmount', label: 'Price', kind: 'money', width: 'sm', required: true, defaultValue: (p.priceAmount / 100).toFixed(2) },
          { name: 'compareAtAmount', label: 'Was (optional)', kind: 'money', width: 'sm', defaultValue: p.compareAtAmount ? (p.compareAtAmount / 100).toFixed(2) : '' },
          { name: 'unitCostAmount', label: 'Our cost', kind: 'money', width: 'sm', defaultValue: p.unitCostAmount ? (p.unitCostAmount / 100).toFixed(2) : '' },
          { name: 'installFeeAmount', label: 'Install fee', kind: 'money', width: 'sm', defaultValue: (p.installFeeAmount / 100).toFixed(2) },
          { name: 'warrantyMonths', label: 'Warranty months', kind: 'number', width: 'sm', defaultValue: txt(p.warrantyMonths) },
          { name: 'weightKg', label: 'Weight kg', kind: 'number', width: 'sm', defaultValue: txt(p.weightKg) },
          { name: 'imageUrl', label: 'Photo web address (if not uploaded)', width: 'lg', defaultValue: p.imageUrl },
          { name: 'description', label: 'Description', kind: 'textarea', defaultValue: p.description },
          { name: 'sellOnline', label: 'Sold on the storefront', kind: 'checkbox', defaultValue: yes(p.sellOnline) },
          { name: 'taxable', label: 'Taxable', kind: 'checkbox', defaultValue: yes(p.taxable) },
          { name: 'isSerialized', label: 'Has serial numbers', kind: 'checkbox', defaultValue: yes(p.isSerialized) },
          { name: 'requiresInstallation', label: 'Needs installing', kind: 'checkbox', defaultValue: yes(p.requiresInstallation) },
          { name: 'requiresSurvey', label: 'Needs a site survey first', kind: 'checkbox', defaultValue: yes(p.requiresSurvey) },
        ]} />
      </Section>

      <Section title="Photo">
        {p.image?.url || p.imageUrl ? <img src={p.image?.url || p.imageUrl} alt={p.name} className="h-40 rounded object-cover" /> : <Meta>No photo yet.</Meta>}
        <ProductImageUpload productId={p.id} />
      </Section>

      {p.type === 'digester_kit' ? (
        <Section title="Digester specs">
          <RecordForm list="DigesterSpec" id={s?.id ?? null} fixed={s ? {} : { product: p.id }} submit={s ? 'Save specs' : 'Add specs'} paths={paths} resetOnSave={false} fields={[
            { name: 'capacityM3', label: 'Size m³', kind: 'number', width: 'sm', required: true, defaultValue: txt(s?.capacityM3) },
            { name: 'technology', label: 'Type', kind: 'select', width: 'md', defaultValue: s?.technology ?? 'prefab_bag', options: TECH.map(t => ({ value: t, label: label(t) })) },
            { name: 'dailyGasM3', label: 'Gas a day m³', kind: 'number', width: 'sm', defaultValue: txt(s?.dailyGasM3) },
            { name: 'cookingHoursPerDay', label: 'Cooking hours a day', kind: 'number', width: 'sm', defaultValue: txt(s?.cookingHoursPerDay) },
            { name: 'servesPeople', label: 'Serves people', kind: 'number', width: 'sm', defaultValue: txt(s?.servesPeople) },
            { name: 'minDailyFeedKg', label: 'Feed a day, min kg', kind: 'number', width: 'sm', defaultValue: txt(s?.minDailyFeedKg) },
            { name: 'maxDailyFeedKg', label: 'Feed a day, max kg', kind: 'number', width: 'sm', defaultValue: txt(s?.maxDailyFeedKg) },
            { name: 'waterPerDayL', label: 'Water a day L', kind: 'number', width: 'sm', defaultValue: txt(s?.waterPerDayL) },
            { name: 'footprintLengthM', label: 'Footprint length m', kind: 'number', width: 'sm', defaultValue: txt(s?.footprintLengthM) },
            { name: 'footprintWidthM', label: 'Footprint width m', kind: 'number', width: 'sm', defaultValue: txt(s?.footprintWidthM) },
            { name: 'installHours', label: 'Install hours', kind: 'number', width: 'sm', defaultValue: txt(s?.installHours) },
            { name: 'reactorWarrantyMonths', label: 'Reactor warranty months', kind: 'number', width: 'sm', defaultValue: txt(s?.reactorWarrantyMonths ?? 60) },
            { name: 'partsWarrantyMonths', label: 'Parts warranty months', kind: 'number', width: 'sm', defaultValue: txt(s?.partsWarrantyMonths ?? 12) },
            { name: 'surveyKind', label: 'Survey', kind: 'select', width: 'md', defaultValue: s?.surveyKind ?? 'survey_farm', options: [{ value: 'survey_farm', label: 'Farm or home' }, { value: 'survey_kitchen', label: 'Institutional kitchen' }] },
            { name: 'feedstockTypes', label: `Feed it takes (JSON list: ${FEED.join(', ')})`, width: 'lg', defaultValue: JSON.stringify(s?.feedstockTypes ?? ['cattle']) },
          ]} />
        </Section>
      ) : null}

      {p.type === 'digester_kit' ? (
        <Section title="Kit contents">
          {p.kitComponents.map((k: any) => (
            <Row key={k.id}><span>{k.quantity} × {k.component?.name ?? ''} <Meta>{k.component?.sku}</Meta></span><RemoveButton list="KitComponent" id={k.id} paths={paths}>Remove</RemoveButton></Row>
          ))}
          {!p.kitComponents.length ? <Empty>No contents listed. Stock is reserved per kit item, so list what goes in the box.</Empty> : null}
          <RecordForm list="KitComponent" fixed={{ kit: p.id }} submit="Add to kit" paths={paths} fields={[
            { name: 'component', label: 'Item', kind: 'select', width: 'lg', options: parts.map((x: any) => ({ value: x.id, label: `${x.name} (${x.sku})` })) },
            { name: 'quantity', label: 'Quantity', kind: 'number', width: 'sm', defaultValue: '1' },
          ]} />
        </Section>
      ) : null}

      <Section title={p.type === 'digester_kit' ? 'Parts that fit this kit' : 'Kits this part fits'}>
        {(p.type === 'digester_kit' ? p.fitsParts : p.compatibleWith).map((x: any) => <Row key={x.id}><Link className="hover:underline" href={`/dashboard/platform/catalogue/${x.id}`}>{x.name}</Link><Meta>{x.sku}</Meta></Row>)}
        {p.type !== 'digester_kit' ? (
          <RecordForm list="Product" id={p.id} submit="Save what it fits" paths={paths} resetOnSave={false} fields={[
            { name: 'compatibleWith', label: 'Kits', kind: 'multi', defaultValue: p.compatibleWith.map((x: any) => x.id), options: kits.map((x: any) => ({ value: x.id, label: x.name })) },
          ]} />
        ) : <Meta>Set this from each part&apos;s page.</Meta>}
      </Section>
    </Page>
  )
}
