import Link from 'next/link'
import { getFaqs, getPlanTemplates, getStore, getStories, getSystems, fromMonthly } from '../lib/data/store'
import { money, num } from '../lib/format'
import { Arrow, Check, IconBin, IconFlame, IconHands, IconLeaf, IconLeafSmall, IconMedal, IconPeople, IconSprout } from '../components/Art'
import { Faqs } from '../components/Faqs'
import { systemImages } from './CatalogScreens'

const STEPS = [
  { art: '/storefront/step-1.jpg', title: 'Survey your site', body: 'We visit, look at your animals, kitchen waste and space, and size the right system for you.' },
  { art: '/storefront/step-2.jpg', title: 'Install the digester', body: 'Our own team builds and connects it, then lights the first flame with you.' },
  { art: '/storefront/step-3.jpg', title: 'Teach you to run it', body: 'Hands-on training for the family: feeding, the gas valve, the slurry and what to watch for.' },
  { art: '/storefront/step-4.jpg', title: 'Keep it running', body: 'Check-ups, parts and repairs from people who know your system, for as long as you own it.' },
]

const BENEFITS = [
  { icon: IconFlame, text: 'Clean cooking gas, every day' },
  { icon: IconSprout, text: 'Rich slurry fertiliser for your fields' },
  { icon: IconBin, text: 'Manure and food waste put to use' },
  { icon: IconLeaf, text: 'Less firewood, charcoal and LPG to buy' },
]

export async function HomeScreen() {
  const [store, systems, stories, faqs, templates] = await Promise.all([getStore(), getSystems(), getStories(), getFaqs(), getPlanTemplates()])
  const lowest = systems.length ? systems.reduce((a, b) => (a.priceAmount <= b.priceAmount ? a : b)) : null
  const monthly = lowest ? fromMonthly(lowest.priceAmount, templates) : null
  const name = store.name || 'We'
  const pics = systemImages(systems.slice(0, 3))

  return (
    <>
      {/* Hero: on a phone the photo sits on top and the words below it on forest green, so no face is ever under text. */}
      <section className="relative isolate overflow-hidden bg-[var(--forest)]">
        <img src="/storefront/hero.jpg" alt="" className="h-[220px] w-full object-cover object-[78%_40%] sm:absolute sm:inset-y-0 sm:right-0 sm:-z-10 sm:h-full sm:w-[72%] sm:object-[100%_45%] lg:w-[70%]" />
        <div className="absolute inset-0 -z-10 hidden bg-gradient-to-r from-[#0f2a12] from-[30%] via-[#0f2a12]/80 via-[40%] to-transparent to-[52%] sm:block" />
        <div className="mx-auto flex max-w-[1240px] flex-col justify-center px-4 pb-9 pt-6 sm:min-h-[460px] sm:px-6 sm:py-10 lg:min-h-[500px]">
          <div className="text-white sm:max-w-[46%] lg:max-w-[40%]">
            <h1 className="text-[2.1rem] font-extrabold leading-[1.04] !text-white sm:text-[2.6rem] lg:w-max lg:text-[3rem]">Turn your waste into <br className="hidden lg:inline" />clean cooking gas</h1>
            <p className="mt-4 text-[1.05rem] leading-snug text-[#eef0e4] sm:text-lg">{store.heroText || `A complete biogas system for your home, farm or kitchen, from ${name === 'We' ? 'a team' : name} that stays with you after the install.`}</p>
            <ul className="mt-5 space-y-1.5 text-[1.05rem] sm:text-lg">
              {['We survey your site', 'We install your digester', 'We teach you to run it', 'We service it for years'].map(t => (
                <li key={t} className="flex items-center gap-3"><Check className="h-6 w-6 shrink-0" />{t}</li>
              ))}
            </ul>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/get-a-quote" className="sf-btn !min-h-[52px] !px-7 text-lg">Get a quote <Arrow /></Link>
              {store.configured && store.surveyFeeAmount === 0 && (
                <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/40 bg-white/10 px-3.5 text-[0.95rem] font-semibold text-white"><Check className="h-5 w-5 shrink-0" />Free site survey</span>
              )}
            </div>
            {lowest && !store.heroText && (
              <p className="mt-5 text-[0.95rem] text-[#dfe6cc]">
                Systems from <strong className="text-white">{money(lowest.priceAmount, lowest.currencyCode, { whole: true })}</strong>
                {monthly ? <> or <strong className="text-white">{money(monthly, lowest.currencyCode)} a month</strong></> : null}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-[1240px] px-4 pb-10 pt-12 sm:px-6" aria-labelledby="how">
        <h2 id="how" className="sf-rule text-center text-[1.7rem] font-extrabold sm:text-[2rem]"><span>A complete, worry-free biogas solution</span></h2>
        <ol className="mt-8 grid gap-6 sm:mt-10 sm:grid-cols-2 sm:gap-10 lg:grid-cols-4 lg:gap-6">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative grid grid-cols-[120px_1fr] items-center gap-4 sm:block">
              <div className="relative mx-auto h-[96px] w-full max-w-[230px] sm:h-[150px]">
                <div className="absolute inset-x-0 bottom-0 top-5 rounded-[48%_52%_46%_54%/58%_56%_44%_42%] bg-[var(--sage)]" aria-hidden="true" />
                <img src={s.art} alt="" className="relative mx-auto h-full w-auto object-contain mix-blend-multiply [mask-image:radial-gradient(ellipse_at_center,#000_58%,transparent_74%)]" />
              </div>
              {i < STEPS.length - 1 && <Arrow className="absolute -right-5 top-14 hidden h-6 w-6 text-[var(--forest)] lg:block" />}
              <div>
                <h3 className="text-lg font-bold sm:mt-5 sm:text-xl">{i + 1}. {s.title}</h3>
                <p className="mt-1 leading-snug sm:mt-2">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Systems */}
      {systems.length > 0 && (
        <section className="mx-auto max-w-[1240px] px-4 pb-12 pt-4 sm:px-6" aria-labelledby="systems">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="systems" className="text-[1.8rem] font-extrabold">Our systems</h2>
            <Link href="/systems" className="flex min-h-11 items-center gap-2 font-bold text-[var(--clay)] hover:underline">Compare all systems <Arrow className="h-4 w-4" /></Link>
          </div>
          <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {systems.slice(0, 3).map(s => {
              const m = fromMonthly(s.priceAmount, templates)
              return (
                <li key={s.id}>
                  <Link href={`/systems/${s.slug}`} className="sf-card group block h-full overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg">
                    <img src={pics.get(s.id)} alt="" className="aspect-[16/10] w-full object-cover" />
                    <div className="p-5">
                      <h3 className="text-xl font-bold group-hover:text-[var(--clay)]">{s.name}</h3>
                      {s.spec && <p className="mt-1 text-[0.95rem] text-[var(--muted)]">{[s.spec.capacityM3 && `${num(s.spec.capacityM3)} m³`, s.spec.dailyGasM3 && `${num(s.spec.dailyGasM3, 2)} m³ gas a day`, s.spec.servesPeople && `cooks for ${s.spec.servesPeople}`].filter(Boolean).join(' · ')}</p>}
                      <p className="mt-3 font-bold text-[var(--forest)]">{money(s.priceAmount, s.currencyCode, { whole: true })}{m ? <span className="font-normal text-[var(--muted)]"> · or {money(m, s.currencyCode)} a month</span> : null}</p>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Benefits */}
      <section className="mx-auto max-w-[1240px] px-4 sm:px-6" aria-labelledby="benefits">
        <div className="sf-panel grid gap-6 px-6 py-7 md:grid-cols-[auto_1fr] md:items-center md:px-10">
          <h2 id="benefits" className="text-[1.6rem] font-extrabold leading-tight md:max-w-[14rem] md:border-r md:border-[#cdd5b8] md:pr-8">Real benefits for your home and land</h2>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {BENEFITS.map(b => (
              <li key={b.text} className="flex items-center gap-3 text-[0.98rem] leading-snug text-[var(--forest)]"><b.icon className="h-11 w-11 shrink-0" />{b.text}</li>
            ))}
          </ul>
        </div>
        {store.impactNumbers.length > 0 && (
          <dl className={`mt-6 grid gap-3 sm:gap-4 ${['', 'grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-2 md:grid-cols-4'][store.impactNumbers.length]}`}>
            {store.impactNumbers.map(n => (
              <div key={n.label} className="sf-card flex flex-col-reverse justify-end px-2 py-4 text-center sm:px-5">
                <dt className="text-[0.8rem] leading-tight text-[var(--muted)] sm:text-sm">{n.label}</dt>
                <dd className="font-[family-name:var(--font-sf-head)] text-2xl font-extrabold text-[var(--clay)] sm:text-3xl">{n.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {/* About */}
      <section className="mx-auto grid max-w-[1240px] gap-8 px-4 pt-14 sm:px-6 lg:grid-cols-[1.1fr_1fr_0.9fr] lg:items-center" aria-labelledby="about">
        <img src="/storefront/team.jpg" alt="" className="aspect-[16/10] w-full rounded-[20px] object-cover" />
        <div>
          <h2 id="about" className="text-[1.8rem] font-extrabold leading-tight">A local team that stays with you</h2>
          <div className="sf-prose mt-3">
            {(store.about || `${name === 'We' ? 'We' : name} survey, install and service biogas systems ourselves. When something needs a look, you call people who know your system.`).split(/\n{2,}/).slice(0, 2).map((p, i) => <p key={i}>{p}</p>)}
          </div>
        </div>
        <ul className="space-y-5 lg:border-l lg:border-[var(--line)] lg:pl-8">
          {[
            { icon: IconPeople, text: 'Our own installers, not subcontractors' },
            { icon: IconMedal, text: 'Written warranty on every system' },
            { icon: IconHands, text: 'Service plans and spare parts on hand' },
            { icon: IconLeafSmall, text: 'Pay in full or in instalments' },
          ].map(x => (
            <li key={x.text} className="flex items-center gap-4 text-[var(--forest)]"><x.icon className="h-8 w-8 shrink-0" />{x.text}</li>
          ))}
        </ul>
      </section>

      {/* Stories */}
      {stories.length > 0 && (
        <section className="mx-auto grid max-w-[1240px] gap-6 px-4 pt-14 sm:px-6 lg:grid-cols-[13rem_1fr] lg:items-center" aria-labelledby="stories">
          <h2 id="stories" className="text-[1.8rem] font-extrabold leading-tight lg:border-r lg:border-[#d9b9a4] lg:pr-6">What our customers say</h2>
          <ul className="grid gap-5 md:grid-cols-3">
            {stories.slice(0, 3).map(s => (
              <li key={s.id} className="flex flex-col rounded-[16px] bg-[var(--card)] p-5">
                {s.title && <p className="font-bold text-[var(--forest)]">{s.title}</p>}
                <blockquote className="mt-1 flex-1 leading-snug">“{s.body.length > 240 ? `${s.body.slice(0, 237).trimEnd()}…` : s.body}”</blockquote>
                {s.savingsText && <p className="mt-3 text-sm font-bold text-[var(--leaf)]">{s.savingsText}</p>}
                <p className="mt-3 text-sm text-[var(--muted)]">— {s.customerName}{s.location ? `, ${s.location}` : ''}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Questions */}
      {faqs.length > 0 && (
        <section className="mx-auto max-w-[900px] px-4 pt-14 sm:px-6" aria-labelledby="faq">
          <h2 id="faq" className="text-center text-[1.8rem] font-extrabold">Common questions</h2>
          <Faqs items={faqs.slice(0, 8)} />
        </section>
      )}

      {/* Closing band */}
      <section className="relative mt-14 overflow-hidden bg-[var(--band)] px-4 py-10 text-center text-white sm:px-6">
        <div className="pointer-events-none absolute -left-10 -top-10 h-48 w-48 rounded-full bg-[#c96a3f]/50 blur-2xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-12 right-0 h-56 w-56 rounded-full bg-[#8e3a17]/50 blur-2xl" aria-hidden="true" />
        <h2 className="relative text-[1.8rem] font-extrabold !text-white sm:text-[2.2rem]">Ready to cook with your own gas?</h2>
        <p className="relative mx-auto mt-2 max-w-2xl text-lg text-[#fbe9df]">
          Tell us about your home or farm. We reply with a quote{store.surveyFeeAmount > 0 ? `, and can book a site survey (${money(store.surveyFeeAmount, store.currencyCode, { whole: true })}, taken off your system)` : store.configured ? ' and a free site survey' : ''}.
        </p>
        <Link href="/get-a-quote" className="sf-btn sf-btn-white relative mt-6 !min-h-[52px] !px-8 text-lg">Get a quote <Arrow /></Link>
      </section>
    </>
  )
}
