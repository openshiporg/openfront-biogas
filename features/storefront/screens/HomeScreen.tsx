import Link from 'next/link'
import { getFaqs, getPlanTemplates, getStore, getStories, getSystems, fromMonthly } from '../lib/data/store'
import { money, num } from '../lib/format'
import { Arrow, Check, IconBin, IconFlame, IconHands, IconLeaf, IconLeafSmall, IconMedal, IconPeople, IconSprout, StepInstall, StepService, StepSurvey, StepTeach } from '../components/Art'
import { Faqs } from '../components/Faqs'

const STEPS = [
  { art: StepSurvey, title: 'Survey your site', body: 'We visit, look at your animals, kitchen waste and space, and size the right system for you.' },
  { art: StepInstall, title: 'Install the digester', body: 'Our own team builds and connects it, then lights the first flame with you.' },
  { art: StepTeach, title: 'Teach you to run it', body: 'Hands-on training for the family: feeding, the gas valve, the slurry and what to watch for.' },
  { art: StepService, title: 'Keep it running', body: 'Check-ups, parts and repairs from people who know your system, for as long as you own it.' },
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

  return (
    <>
      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-[var(--forest)]">
        <img src="/storefront/hero.jpg" alt="" className="absolute inset-0 -z-10 h-full w-full object-cover object-[70%_50%]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#0d240f]/90 via-[#0d240f]/60 to-transparent" />
        <div className="mx-auto flex min-h-[480px] max-w-[1240px] flex-col justify-center px-4 py-14 sm:px-6 lg:min-h-[540px]">
          <div className="max-w-[36rem] text-white">
            <h1 className="text-[2.4rem] font-extrabold leading-[1.02] !text-white sm:text-[3.2rem] lg:text-[3.6rem]">Turn your waste into clean cooking gas</h1>
            <p className="mt-5 text-lg leading-snug text-[#eef0e4] sm:text-xl">{store.heroText || `A complete biogas system for your home, farm or kitchen, from ${name === 'We' ? 'a team' : name} that stays with you after the install.`}</p>
            <ul className="mt-6 space-y-2 text-lg">
              {['We survey your site', 'We install your digester', 'We teach you to run it', 'We service it for years'].map(t => (
                <li key={t} className="flex items-center gap-3"><Check className="h-6 w-6 shrink-0" />{t}</li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/get-a-quote" className="sf-btn !min-h-[52px] !px-7 text-lg">Get a free quote <Arrow /></Link>
              <Link href="/calculator" className="sf-btn sf-btn-white !min-h-[52px]">Size my system</Link>
            </div>
            {lowest && (
              <p className="mt-5 text-[0.95rem] text-[#dfe6cc]">
                Systems from <strong className="text-white">{money(lowest.priceAmount, lowest.currencyCode, { whole: true })}</strong>
                {monthly ? <> or <strong className="text-white">{money(monthly, lowest.currencyCode, { whole: true })} a month</strong></> : null}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-[1240px] px-4 pb-10 pt-12 sm:px-6" aria-labelledby="how">
        <h2 id="how" className="sf-rule text-center text-[1.7rem] font-extrabold sm:text-[2rem]"><span>A complete, worry-free biogas system</span></h2>
        <ol className="mt-10 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative">
              <div className="mx-auto flex h-[132px] w-full max-w-[220px] items-center justify-center overflow-hidden rounded-[48%_52%_46%_54%/58%_56%_44%_42%] bg-[var(--sage)]"><s.art /></div>
              {i < STEPS.length - 1 && <Arrow className="absolute -right-5 top-14 hidden h-6 w-6 text-[var(--forest)] lg:block" />}
              <h3 className="mt-5 text-xl font-bold">{i + 1}. {s.title}</h3>
              <p className="mt-2 leading-snug">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

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
          <dl className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            {store.impactNumbers.map(n => (
              <div key={n.label} className="sf-card px-5 py-4 text-center">
                <dt className="text-sm text-[var(--muted)]">{n.label}</dt>
                <dd className="font-[family-name:var(--font-sf-head)] text-3xl font-extrabold text-[var(--clay)]">{n.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {/* Systems */}
      {systems.length > 0 && (
        <section className="mx-auto max-w-[1240px] px-4 pt-14 sm:px-6" aria-labelledby="systems">
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
                    <img src={s.imageUrl || (s.spec?.feedstockTypes.includes('kitchen') && !s.spec?.feedstockTypes.includes('manure') ? '/storefront/system-home.jpg' : Number(s.spec?.capacityM3 ?? 0) >= 8 ? '/storefront/system-farm.jpg' : '/storefront/system-home.jpg')} alt="" className="aspect-[3/2] w-full object-cover" />
                    <div className="p-5">
                      <h3 className="text-xl font-bold group-hover:text-[var(--clay)]">{s.name}</h3>
                      {s.spec && <p className="mt-1 text-[0.95rem] text-[var(--muted)]">{[s.spec.capacityM3 && `${num(s.spec.capacityM3)} m³`, s.spec.dailyGasM3 && `${num(s.spec.dailyGasM3, 2)} m³ gas a day`, s.spec.servesPeople && `cooks for ${s.spec.servesPeople}`].filter(Boolean).join(' · ')}</p>}
                      <p className="mt-3 font-bold text-[var(--forest)]">{money(s.priceAmount, s.currencyCode, { whole: true })}{m ? <span className="font-normal text-[var(--muted)]"> · or {money(m, s.currencyCode, { whole: true })} a month</span> : null}</p>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

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
      <section className="relative mt-14 overflow-hidden bg-[var(--band)] px-4 py-12 text-center text-white sm:px-6">
        <div className="pointer-events-none absolute -left-10 -top-10 h-48 w-48 rounded-full bg-[#c96a3f]/50 blur-2xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-12 right-0 h-56 w-56 rounded-full bg-[#8e3a17]/50 blur-2xl" aria-hidden="true" />
        <h2 className="relative text-[1.8rem] font-extrabold !text-white sm:text-[2.2rem]">Ready to cook with your own gas?</h2>
        <p className="relative mx-auto mt-2 max-w-2xl text-lg text-[#fbe9df]">
          Tell us about your home or farm. We reply with a quote{store.surveyFeeAmount > 0 ? `, and can book a site survey (${money(store.surveyFeeAmount, store.currencyCode, { whole: true })}, taken off your system)` : ' and a free site survey'}.
        </p>
        <Link href="/get-a-quote" className="sf-btn sf-btn-white relative mt-6 !min-h-[52px] !px-8 text-lg">Get a free quote <Arrow /></Link>
      </section>
    </>
  )
}
