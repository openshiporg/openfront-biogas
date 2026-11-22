import Link from 'next/link'
import { notFound } from 'next/navigation'
import { fromMonthly, getPart, getPlanTemplates, getServicePlans, getShop, getStore, getSystem, getSystems, type Product } from '../lib/data/store'
import { money, months, num, word } from '../lib/format'
import { Arrow, Check } from '../components/Art'
import { Empty, PageHead, Section } from '../components/ui'
import { AddToCart } from '../components/AddToCart'

/**
 * Our photographs stand in only when the company has not uploaded one for the item. Each system gets
 * its own picture (by technology and size, then spread by its place in the list) so two cards side by
 * side never show the same photo.
 */
const BY_TECH: Record<string, string[]> = {
  prefab_bag: ['/storefront/system-bag.jpg', '/storefront/system-bag-2.jpg'],
  prefab_tube: ['/storefront/system-tube.jpg', '/storefront/system-farm.jpg'],
  prefab_tank: ['/storefront/system-farm.jpg', '/storefront/system-tube.jpg'],
  fixed_dome: ['/storefront/system-home.jpg', '/storefront/system-farm.jpg'],
  floating_drum: ['/storefront/system-home.jpg', '/storefront/system-farm.jpg'],
  container: ['/storefront/system-container.jpg'],
}
export function systemImages(list: Product[]) {
  const used = new Set<string>()
  const out = new Map<string, string>()
  for (const p of list) {
    if (p.imageUrl) { out.set(p.id, p.imageUrl); continue }
    const pool = BY_TECH[p.spec?.technology ?? ''] ?? ['/storefront/system-home.jpg', '/storefront/system-farm.jpg']
    const pick = pool.find(x => !used.has(x)) ?? pool[0]
    used.add(pick)
    out.set(p.id, pick)
  }
  return out
}
export function systemImage(p: Product, all?: Product[]) {
  return systemImages(all ?? [p]).get(p.id) ?? '/storefront/system-home.jpg'
}
const partImage = (p: Product) => p.imageUrl || (p.type === 'appliance' ? '/storefront/parts.jpg' : null)

const specLine = (p: Product) =>
  p.spec ? [p.spec.capacityM3 && `${num(p.spec.capacityM3)} m³`, p.spec.dailyGasM3 && `${num(p.spec.dailyGasM3, 2)} m³ gas a day`, p.spec.servesPeople && `cooks for ${p.spec.servesPeople}`].filter(Boolean).join(' · ') : ''

/* ------------------------------------------------------------------ S2 systems */

export async function SystemsScreen() {
  const [systems, templates] = await Promise.all([getSystems(), getPlanTemplates()])
  const pics = systemImages(systems)
  return (
    <>
      <PageHead title="Biogas systems" intro="Every system is sized at a site survey, installed by our team and comes with training and a written warranty. Compare them side by side." />
      <Section>
        {systems.length === 0 ? (
          <Empty title="Our systems are being added" action={{ href: '/get-a-quote', label: 'Ask us for a quote' }}>Tell us about your home or farm and we will recommend a system.</Empty>
        ) : (
          <>
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {systems.map(s => {
                const m = fromMonthly(s.priceAmount, templates)
                const img = pics.get(s.id)
                return (
                  <li key={s.id}>
                    <Link href={`/systems/${s.slug}`} className="sf-card group block h-full overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg">
                      <img src={img} alt="" className="aspect-[16/10] w-full object-cover" />
                      <div className="p-5">
                        <h2 className="text-xl font-bold group-hover:text-[var(--clay)]">{s.name}</h2>
                        <p className="mt-1 text-[0.95rem] text-[var(--muted)]">{specLine(s)}</p>
                        <p className="mt-3 font-bold text-[var(--forest)]">{money(s.priceAmount, s.currencyCode, { whole: true })}{m ? <span className="font-normal text-[var(--muted)]"> · or {money(m, s.currencyCode)} a month</span> : null}</p>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>

            <h2 className="mt-14 text-[1.6rem] font-extrabold">Side by side</h2>
            <div className="mt-4 overflow-x-auto rounded-[20px] border border-[var(--line)] bg-[#fffdf8]">
              <table className="w-full min-w-[720px] text-left text-[0.95rem]">
                <caption className="sr-only">Systems compared</caption>
                <thead className="bg-[var(--sage)] text-[var(--forest)]">
                  <tr>
                    <th scope="col" className="px-4 py-3">System</th>
                    <th scope="col" className="px-4 py-3">Size</th>
                    <th scope="col" className="px-4 py-3">Gas a day</th>
                    <th scope="col" className="px-4 py-3">Daily feed</th>
                    <th scope="col" className="px-4 py-3">Takes</th>
                    <th scope="col" className="px-4 py-3">Warranty</th>
                    <th scope="col" className="px-4 py-3 text-right">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {systems.map(s => (
                    <tr key={s.id}>
                      <th scope="row" className="px-4 py-3"><Link href={`/systems/${s.slug}`} className="font-bold text-[var(--forest)] hover:text-[var(--clay)] hover:underline">{s.name}</Link><div className="text-sm font-normal text-[var(--muted)]">{word(s.spec?.technology)}</div></th>
                      <td className="px-4 py-3">{s.spec?.capacityM3 ? `${num(s.spec.capacityM3)} m³` : '—'}</td>
                      <td className="px-4 py-3">{s.spec?.dailyGasM3 ? `${num(s.spec.dailyGasM3, 2)} m³` : '—'}{s.spec?.cookingHoursPerDay ? <div className="text-sm text-[var(--muted)]">about {num(s.spec.cookingHoursPerDay)} h cooking</div> : null}</td>
                      <td className="px-4 py-3">{s.spec?.minDailyFeedKg || s.spec?.maxDailyFeedKg ? `${num(s.spec?.minDailyFeedKg)}–${num(s.spec?.maxDailyFeedKg)} kg` : '—'}</td>
                      <td className="px-4 py-3">{s.spec?.feedstockTypes.map(word).join(', ') || '—'}</td>
                      <td className="px-4 py-3">{months(s.spec?.reactorWarrantyMonths ?? s.warrantyMonths) || '—'}</td>
                      <td className="px-4 py-3 text-right font-bold text-[var(--forest)]">{money(s.priceAmount, s.currencyCode, { whole: true })}{s.installFeeAmount ? <div className="text-sm font-normal text-[var(--muted)]">+ {money(s.installFeeAmount, s.currencyCode, { whole: true })} install</div> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-6 flex flex-wrap items-center gap-3">Not sure which?<Link href="/calculator" className="sf-btn sf-btn-ghost sf-btn-sm">Size my system</Link></p>
          </>
        )}
      </Section>
    </>
  )
}

/* ------------------------------------------------------------------ S3 one system */

export async function SystemScreen({ slug }: { slug: string }) {
  const [s, templates, store] = await Promise.all([getSystem(slug), getPlanTemplates(), getStore()])
  if (!s) notFound()
  const m = fromMonthly(s.priceAmount, templates)
  const sp = s.spec
  const img = systemImages(await getSystems()).get(s.id) ?? systemImage(s)
  const rows: [string, string][] = sp
    ? ([
        ['Type', word(sp.technology)],
        ['Digester size', sp.capacityM3 ? `${num(sp.capacityM3)} m³` : ''],
        ['Gas a day', sp.dailyGasM3 ? `${num(sp.dailyGasM3, 2)} m³` : ''],
        ['Cooking time a day', sp.cookingHoursPerDay ? `about ${num(sp.cookingHoursPerDay)} hours on one burner` : ''],
        ['Cooks for', sp.servesPeople ? `${sp.servesPeople} people` : ''],
        ['Daily feed', sp.minDailyFeedKg || sp.maxDailyFeedKg ? `${num(sp.minDailyFeedKg)}–${num(sp.maxDailyFeedKg)} kg` : ''],
        ['Takes', sp.feedstockTypes.map(word).join(', ')],
        ['Water a day', sp.waterPerDayL ? `${num(sp.waterPerDayL)} litres` : ''],
        ['Space needed', sp.footprintLengthM && sp.footprintWidthM ? `${num(sp.footprintLengthM)} m × ${num(sp.footprintWidthM)} m` : ''],
        ['Installed in', sp.installHours ? `about ${num(sp.installHours)} hours` : ''],
      ] as [string, string][]).filter(([, v]) => v)
    : []
  return (
    <>
      <PageHead title={s.name} crumbs={[{ href: '/', label: 'Home' }, { href: '/systems', label: 'Systems' }]} />
      <Section>
        <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <img src={img} alt="" className="aspect-[3/2] w-full rounded-[20px] object-cover" />
            {s.description && <div className="sf-prose mt-6">{s.description.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div>}
          </div>
          <div className="space-y-6">
            <div className="sf-card p-6">
              <p className="font-[family-name:var(--font-sf-head)] text-3xl font-extrabold text-[var(--forest)]">{money(s.priceAmount, s.currencyCode)}</p>
              {s.installFeeAmount > 0 && <p className="mt-1">plus {money(s.installFeeAmount, s.currencyCode)} installation</p>}
              {m && <p className="mt-2 text-lg text-[var(--clay)]">or from <strong>{money(m, s.currencyCode)} a month</strong> on a payment plan</p>}
              <ul className="mt-4 space-y-2">
                {sp?.reactorWarrantyMonths ? <li className="flex gap-2"><Check className="h-5 w-5 shrink-0" />{months(sp.reactorWarrantyMonths)} warranty on the digester</li> : null}
                {sp?.partsWarrantyMonths ? <li className="flex gap-2"><Check className="h-5 w-5 shrink-0" />{months(sp.partsWarrantyMonths)} on the stove and fittings</li> : null}
                {!sp?.reactorWarrantyMonths && s.warrantyMonths ? <li className="flex gap-2"><Check className="h-5 w-5 shrink-0" />{months(s.warrantyMonths)} warranty</li> : null}
                <li className="flex gap-2"><Check className="h-5 w-5 shrink-0" />Installed and handed over by our team, with training</li>
              </ul>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href={`/get-a-quote?system=${encodeURIComponent(s.slug)}`} className="sf-btn">Get a quote for this <Arrow /></Link>
                <Link href="/calculator" className="sf-btn sf-btn-ghost">Size my system</Link>
              </div>
              <p className="sf-help mt-4">The final price depends on your site; we confirm it after a survey{store.quoteValidDays ? ` and hold your quote for ${store.quoteValidDays} days` : ''}.</p>
            </div>
            {rows.length > 0 && (
              <div className="sf-card p-6">
                <h2 className="text-xl font-bold">Specifications</h2>
                <dl className="mt-3 divide-y divide-[var(--line)]">
                  {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-2.5"><dt className="text-[var(--muted)]">{k}</dt><dd className="text-right font-semibold text-[var(--forest)]">{v}</dd></div>)}
                </dl>
              </div>
            )}
          </div>
        </div>

        {s.components.length > 0 && (
          <section className="mt-12" aria-labelledby="kit">
            <h2 id="kit" className="text-[1.6rem] font-extrabold">What is in the kit</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {s.components.map((c, i) => (
                <li key={i} className="sf-panel flex items-center gap-3 px-4 py-3"><Check className="h-5 w-5 shrink-0" /><span><strong>{c.quantity} ×</strong> {c.slug ? <Link href={`/shop/p/${c.slug}`} className="hover:underline">{c.name}</Link> : c.name}</span></li>
              ))}
            </ul>
          </section>
        )}

        {s.resources.length > 0 && (
          <section className="mt-12" aria-labelledby="docs">
            <h2 id="docs" className="text-[1.6rem] font-extrabold">Manuals and guides</h2>
            <ul className="mt-4 space-y-2">
              {s.resources.filter(r => r.url).map(r => (
                <li key={r.id}><a href={r.url!} target="_blank" rel="noreferrer" className="flex min-h-11 items-center gap-2 font-bold text-[var(--clay)] hover:underline">{r.title}<span className="font-normal text-[var(--muted)]">({word(r.kind)}{r.language ? `, ${r.language.toUpperCase()}` : ''})</span></a></li>
              ))}
            </ul>
          </section>
        )}

        {s.fitsParts.length > 0 && (
          <section className="mt-12" aria-labelledby="fits">
            <h2 id="fits" className="text-[1.6rem] font-extrabold">Parts and appliances for this system</h2>
            <ProductGrid products={s.fitsParts} />
          </section>
        )}
      </Section>
    </>
  )
}

/* ------------------------------------------------------------------ S8 shop */

function ProductGrid({ products }: { products: Product[] }) {
  return (
    <ul className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {products.map(p => {
        const img = partImage(p)
        return (
          <li key={p.id}>
            <Link href={`/shop/p/${p.slug}`} className="sf-card group flex h-full flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg">
              {img ? <img src={img} alt="" className="aspect-square w-full object-cover" /> : <div className="flex aspect-square w-full items-center justify-center bg-[var(--sage)] px-4 text-center font-[family-name:var(--font-sf-head)] text-lg font-bold text-[var(--forest)]">{p.name}</div>}
              <div className="flex flex-1 flex-col p-4">
                <h3 className="font-bold leading-snug group-hover:text-[var(--clay)]">{p.name}</h3>
                {p.category && <p className="text-sm text-[var(--muted)]">{p.category.name}</p>}
                <p className="mt-auto pt-2 font-bold text-[var(--forest)]">{money(p.priceAmount, p.currencyCode)}{p.compareAtAmount && p.compareAtAmount > p.priceAmount ? <s className="ml-2 font-normal text-[var(--muted)]">{money(p.compareAtAmount, p.currencyCode)}</s> : null}</p>
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

export async function ShopScreen({ category, fits }: { category?: string; fits?: string }) {
  const [{ products, categories }, systems] = await Promise.all([getShop(), getSystems()])
  const list = products.filter(p => (!category || p.category?.slug === category) && (!fits || p.fitsSlugs.includes(fits)))
  const href = (c?: string, f?: string) => {
    const q = new URLSearchParams()
    if (c) q.set('category', c)
    if (f) q.set('fits', f)
    const s = q.toString()
    return s ? `/shop?${s}` : '/shop'
  }
  const chip = (active: boolean) => `sf-chip min-h-10 border px-4 text-[0.9rem] ${active ? 'border-[var(--forest)] bg-[var(--forest)] text-white' : 'border-[var(--line)] bg-[#fffdf8] text-[var(--forest)] hover:border-[var(--forest)]'}`
  return (
    <>
      <PageHead title="Parts and appliances" intro="Stoves, lamps, fittings and spare parts for your system. Delivered, or ready to collect at a branch." />
      <Section>
        {products.length === 0 ? (
          <Empty title="The shop is being stocked">Call us for any part you need and we will sort it out.</Empty>
        ) : (
          <>
            {categories.length > 0 && (
              <nav aria-label="Categories" className="flex flex-wrap gap-2">
                <Link href={href(undefined, fits)} className={chip(!category)} aria-current={!category ? 'page' : undefined}>Everything</Link>
                {categories.map(c => <Link key={c.id} href={href(c.slug, fits)} className={chip(category === c.slug)} aria-current={category === c.slug ? 'page' : undefined}>{c.name}</Link>)}
              </nav>
            )}
            {systems.length > 0 && (
              <form action="/shop" className="mt-4 flex flex-wrap items-end gap-3">
                {category && <input type="hidden" name="category" value={category} />}
                <div>
                  <label htmlFor="fits" className="sf-label">Fits my system</label>
                  <select id="fits" name="fits" defaultValue={fits ?? ''} className="sf-input min-w-[16rem]">
                    <option value="">Any system</option>
                    {systems.map(s => <option key={s.id} value={s.slug}>{s.name}</option>)}
                  </select>
                </div>
                <button className="sf-btn sf-btn-ghost sf-btn-sm" type="submit">Show</button>
              </form>
            )}
            {list.length === 0 ? <div className="mt-8"><Empty title="Nothing matches" action={{ href: '/shop', label: 'Show everything' }} /></div> : <ProductGrid products={list} />}
          </>
        )}
      </Section>
    </>
  )
}

/* ------------------------------------------------------------------ S9 one part */

export async function PartScreen({ slug }: { slug: string }) {
  const p = await getPart(slug)
  if (!p) notFound()
  const img = partImage(p)
  const out = p.inStock !== null && p.inStock <= 0
  return (
    <>
      <PageHead title={p.name} crumbs={[{ href: '/', label: 'Home' }, { href: '/shop', label: 'Shop' }, ...(p.category ? [{ href: `/shop?category=${p.category.slug}`, label: p.category.name }] : [])]} />
      <Section>
        <div className="grid gap-10 md:grid-cols-2">
          {img ? <img src={img} alt="" className="aspect-square w-full rounded-[20px] object-cover" /> : <div className="flex aspect-square w-full items-center justify-center rounded-[20px] bg-[var(--sage)] p-8 text-center font-[family-name:var(--font-sf-head)] text-2xl font-bold text-[var(--forest)]">{p.name}</div>}
          <div className="space-y-5">
            <p className="font-[family-name:var(--font-sf-head)] text-3xl font-extrabold text-[var(--forest)]">{money(p.priceAmount, p.currencyCode)}{p.compareAtAmount && p.compareAtAmount > p.priceAmount ? <s className="ml-3 text-xl font-normal text-[var(--muted)]">{money(p.compareAtAmount, p.currencyCode)}</s> : null}</p>
            <p className={`font-bold ${out ? 'text-[var(--bad)]' : 'text-[var(--good)]'}`}>{p.inStock === null ? 'Available to order' : out ? 'Out of stock' : p.inStock <= 5 ? `Only ${p.inStock} left` : 'In stock'}</p>
            {p.sku && <p className="text-sm text-[var(--muted)]">Part number {p.sku}</p>}
            {p.warrantyMonths > 0 && <p className="flex gap-2"><Check className="h-5 w-5 shrink-0" />{months(p.warrantyMonths)} warranty</p>}
            {p.requiresSurvey ? (
              <Link href="/get-a-quote" className="sf-btn">Ask for a quote</Link>
            ) : p.sellOnline ? (
              <AddToCart productId={p.id} disabled={out} max={p.inStock ?? 99} />
            ) : (
              <p>Call us to order this item.</p>
            )}
            {p.fits.length > 0 && (
              <div>
                <h2 className="text-lg font-bold">Fits</h2>
                <ul className="mt-2 flex flex-wrap gap-2">{p.fits.map(f => <li key={f.slug}><Link href={`/systems/${f.slug}`} className="sf-chip min-h-9 bg-[var(--sage)] px-3 text-[var(--forest)] hover:underline">{f.name}</Link></li>)}</ul>
              </div>
            )}
            {p.description && <div className="sf-prose">{p.description.split(/\n{2,}/).map((x, i) => <p key={i}>{x}</p>)}</div>}
          </div>
        </div>
      </Section>
    </>
  )
}

/* ------------------------------------------------------------------ S17 service plans */

export async function ServicePlansScreen() {
  const plans = await getServicePlans()
  return (
    <>
      <PageHead title="Service plans" intro="Regular check-ups keep your gas flowing and your warranty in good shape. Add a plan to any system you own from your account." />
      <Section>
        {plans.length === 0 ? (
          <Empty title="Service plans are being set up" action={{ href: '/support', label: 'Ask for a service visit' }}>You can still book a repair or check-up any time.</Empty>
        ) : (
          <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {plans.map((p, i) => (
              <li key={p.id} className={`sf-card flex flex-col p-6 ${i === Math.floor(plans.length / 2) && plans.length > 2 ? 'ring-2 ring-[var(--clay)]' : ''}`}>
                <h2 className="text-2xl font-bold">{p.name}</h2>
                <p className="mt-2 font-[family-name:var(--font-sf-head)] text-3xl font-extrabold text-[var(--clay)]">{money(p.priceAmount, p.currencyCode)} <span className="text-base font-normal text-[var(--muted)]">{word(p.billing)}</span></p>
                {p.description && <p className="mt-3">{p.description}</p>}
                <ul className="mt-4 flex-1 space-y-2">
                  {p.visitsPerYear > 0 && <li className="flex gap-2"><Check className="h-5 w-5 shrink-0" />{p.visitsPerYear} check-up visit{p.visitsPerYear === 1 ? '' : 's'} a year</li>}
                  {Number(p.partsDiscountPercent) > 0 && <li className="flex gap-2"><Check className="h-5 w-5 shrink-0" />{num(p.partsDiscountPercent)}% off parts</li>}
                  {p.priorityResponse && <li className="flex gap-2"><Check className="h-5 w-5 shrink-0" />Priority response when something goes wrong</li>}
                  {p.includedItems.map(x => <li key={x} className="flex gap-2"><Check className="h-5 w-5 shrink-0" />{x}</li>)}
                </ul>
                <Link href="/account/systems" className="sf-btn mt-6">Add to my system</Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-8">Don’t have a system with us yet? <Link href="/get-a-quote" className="font-bold text-[var(--clay)] hover:underline">Get a quote</Link>.</p>
      </Section>
    </>
  )
}
