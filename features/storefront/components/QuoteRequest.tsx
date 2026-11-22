'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { bookSurveyAction, checkAreaAction, submitQuoteRequestAction } from '../lib/actions'
import { minorFromMajor, money } from '../lib/format'
import { Arrow, Check } from './Art'
import { Field, FormError, useKey } from './client'
import { SlotPicker } from './SlotPicker'

type Survey = { visitCode: string; windowStart: string; windowEnd: string; sessionCode: string | null; feeAmount: number } | null
type Done = { leadNumber: string; leadCode: string; served: boolean; areaName: string | null; survey: Survey }

const when = (iso: string, tz: string) => new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: tz }).format(new Date(iso))

export function QuoteRequest(props: { country: string; currencyCode: string; timeZone: string; surveyFeeAmount: number; phone: string; initial: { interest?: string; system?: string; assessment?: string; referral?: string }; viewer: { name: string; email: string; phone: string } | null }) {
  const { initial, viewer } = props
  const [key, renew] = useKey()
  const [slotKey] = useKey()
  const [interest, setInterest] = useState(['home', 'farm', 'institution'].includes(initial.interest ?? '') ? initial.interest! : 'home')
  const [area, setArea] = useState({ postcode: '', region: '', city: '' })
  const [served, setServed] = useState<null | { served: boolean; name?: string }>(null)
  const [slot, setSlot] = useState<{ date: string; slotIndex: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Done | null>(null)
  const [pending, start] = useTransition()

  // Tell the visitor at once whether we work where they are (S5).
  useEffect(() => {
    if (!area.postcode.trim() && !area.region.trim()) return setServed(null)
    const t = setTimeout(async () => {
      const r = await checkAreaAction({ postcode: area.postcode.trim() || undefined, region: area.region.trim() || undefined, country: props.country })
      if (r.ok) setServed({ served: Boolean(r.data?.served), name: r.data?.area?.name })
    }, 450)
    return () => clearTimeout(t)
  }, [area.postcode, area.region, props.country])

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const g = (k: string) => String(fd.get(k) ?? '').trim()
    const input = {
      interest,
      name: g('name'), phone: g('phone'), email: g('email'), organisationName: g('organisationName'),
      preferredContact: g('preferredContact') || 'call', contactConsent: fd.get('contactConsent') === 'on',
      addressLine: g('addressLine'), city: area.city, region: area.region, postcode: area.postcode, country: props.country, directions: g('directions'),
      siteType: interest === 'farm' ? 'farm' : interest === 'institution' ? g('siteType') || 'school' : 'home',
      animals: { cattle: Number(g('cattle') || 0), pigs: Number(g('pigs') || 0), poultry: Number(g('poultry') || 0) },
      kitchenWasteKgPerDay: g('kitchen') ? Number(g('kitchen')) : undefined,
      peopleServed: g('people') ? Number(g('people')) : undefined,
      monthlyFuelSpendAmount: g('fuel') ? minorFromMajor(g('fuel'), props.currencyCode) : 0,
      message: [initial.system ? `Interested in: ${initial.system}` : '', g('message')].filter(Boolean).join('\n'),
      referralCode: g('referralCode'),
      assessmentId: initial.assessment || null,
      survey: slot ?? undefined,
    }
    if (!input.name || (!input.phone && !input.email)) return setError('Enter your name and a phone number or email so we can reach you.')
    start(async () => {
      setError(null)
      const r = await submitQuoteRequestAction(input, key)
      if (!r.ok) return setError(r.error)
      setDone(r.data as Done)
      renew()
    })
  }

  if (done) return <Thanks done={done} {...props} slotKey={slotKey} area={area} />

  const showAnimals = interest !== 'institution'
  return (
    <form onSubmit={submit} className="space-y-8" noValidate>
      <fieldset className="sf-card space-y-4 p-6">
        <legend className="float-left mb-2 text-xl font-bold text-[var(--forest)]">1. What is it for?</legend>
        <div className="clear-left flex flex-wrap gap-2">
          {[['home', 'My home'], ['farm', 'My farm'], ['institution', 'A school, hotel, hospital or kitchen']].map(([v, l]) => (
            <label key={v} className={`flex min-h-11 cursor-pointer items-center rounded-full border px-4 font-semibold ${interest === v ? 'border-[var(--forest)] bg-[var(--forest)] text-white' : 'border-[var(--line)] bg-white'}`}>
              <input type="radio" name="interest" className="sr-only" checked={interest === v} onChange={() => setInterest(v)} />{l}
            </label>
          ))}
        </div>
        {interest === 'institution' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name of the organisation" htmlFor="organisationName"><input id="organisationName" name="organisationName" className="sf-input" autoComplete="organization" /></Field>
            <Field label="Type of place" htmlFor="siteType">
              <select id="siteType" name="siteType" className="sf-input" defaultValue="school">
                <option value="school">School</option><option value="hotel">Hotel</option><option value="hospital">Hospital or clinic</option><option value="restaurant">Restaurant or canteen</option><option value="other">Something else</option>
              </select>
            </Field>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          {showAnimals && <>
            <Field label="Cattle" htmlFor="cattle"><input id="cattle" name="cattle" type="number" min={0} className="sf-input" /></Field>
            <Field label="Pigs" htmlFor="pigs"><input id="pigs" name="pigs" type="number" min={0} className="sf-input" /></Field>
            <Field label="Poultry" htmlFor="poultry"><input id="poultry" name="poultry" type="number" min={0} className="sf-input" /></Field>
          </>}
          <Field label="Kitchen waste (kg a day)" htmlFor="kitchen"><input id="kitchen" name="kitchen" type="number" min={0} step="0.5" className="sf-input" /></Field>
          <Field label="People cooked for" htmlFor="people"><input id="people" name="people" type="number" min={0} className="sf-input" /></Field>
          <Field label={`Monthly fuel spend (${props.currencyCode})`} htmlFor="fuel"><input id="fuel" name="fuel" type="number" min={0} step="0.01" className="sf-input" /></Field>
        </div>
        {initial.assessment && <p className="flex items-center gap-2 text-[var(--good)]"><Check className="h-5 w-5" />Your calculator results are attached.</p>}
      </fieldset>

      <fieldset className="sf-card space-y-4 p-6">
        <legend className="float-left mb-2 text-xl font-bold text-[var(--forest)]">2. Where is it?</legend>
        <div className="clear-left grid gap-4 sm:grid-cols-2">
          <Field label="Address or farm name" htmlFor="addressLine"><input id="addressLine" name="addressLine" className="sf-input" autoComplete="street-address" /></Field>
          <Field label="Town or village" htmlFor="city"><input id="city" value={area.city} onChange={e => setArea(a => ({ ...a, city: e.target.value }))} className="sf-input" autoComplete="address-level2" /></Field>
          <Field label="Region or district" htmlFor="region"><input id="region" value={area.region} onChange={e => setArea(a => ({ ...a, region: e.target.value }))} className="sf-input" autoComplete="address-level1" /></Field>
          <Field label="Postcode" htmlFor="postcode" help="If you have one"><input id="postcode" value={area.postcode} onChange={e => setArea(a => ({ ...a, postcode: e.target.value }))} className="sf-input" autoComplete="postal-code" /></Field>
        </div>
        <Field label="How to find you" htmlFor="directions" help="Landmarks help our team"><textarea id="directions" name="directions" className="sf-input" rows={2} /></Field>
        {served && (served.served
          ? <p role="status" className="flex items-center gap-2 font-bold text-[var(--good)]"><Check className="h-5 w-5" />We work in {served.name || 'your area'}.</p>
          : <p role="status" className="rounded-[12px] bg-[#fbf0e9] px-4 py-3 text-[#8a3412]">We don’t cover that area yet. Send your request anyway and we will tell you if we can come{props.phone ? <>, or call <a className="font-bold underline" href={`tel:${props.phone.replace(/[^\d+]/g, '')}`}>{props.phone}</a></> : null}.</p>)}
      </fieldset>

      <fieldset className="sf-card space-y-4 p-6">
        <legend className="float-left mb-2 text-xl font-bold text-[var(--forest)]">3. A site survey (optional)</legend>
        <p className="clear-left">Pick a time for us to visit and measure up{props.surveyFeeAmount > 0 ? `. The survey costs ${money(props.surveyFeeAmount, props.currencyCode)}, which comes off your system if you go ahead` : ''}. Or leave it and we will call you.</p>
        {served?.served === false ? <p className="text-[var(--muted)]">Online booking opens when you are in an area we cover.</p> : (area.region || area.postcode) ? <SlotPicker value={slot} onChange={setSlot} area={{ postcode: area.postcode || undefined, region: area.region || undefined, country: props.country }} timeZone={props.timeZone} /> : <p className="text-[var(--muted)]">Fill in your region or postcode above to see open times.</p>}
      </fieldset>

      <fieldset className="sf-card space-y-4 p-6">
        <legend className="float-left mb-2 text-xl font-bold text-[var(--forest)]">4. Your details</legend>
        <div className="clear-left grid gap-4 sm:grid-cols-2">
          <Field label="Your name" htmlFor="name"><input id="name" name="name" required className="sf-input" autoComplete="name" defaultValue={viewer?.name} /></Field>
          <Field label="Phone" htmlFor="phone"><input id="phone" name="phone" type="tel" className="sf-input" autoComplete="tel" defaultValue={viewer?.phone} /></Field>
          <Field label="Email" htmlFor="email" help="For your quote and receipts"><input id="email" name="email" type="email" className="sf-input" autoComplete="email" defaultValue={viewer?.email} /></Field>
          <Field label="Best way to reach you" htmlFor="preferredContact">
            <select id="preferredContact" name="preferredContact" className="sf-input" defaultValue="call"><option value="call">Phone call</option><option value="whatsapp">WhatsApp</option><option value="sms">Text message</option><option value="email">Email</option></select>
          </Field>
          <Field label="Referral code" htmlFor="referralCode" help="If a customer of ours sent you"><input id="referralCode" name="referralCode" className="sf-input uppercase" defaultValue={initial.referral} /></Field>
        </div>
        <Field label="Anything else we should know?" htmlFor="message"><textarea id="message" name="message" className="sf-input" rows={3} /></Field>
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" name="contactConsent" className="h-5 w-5 accent-[var(--clay)]" /> You can contact me about offers and service reminders</label>
      </fieldset>

      <FormError error={error} />
      <button className="sf-btn !min-h-[52px] w-full text-lg sm:w-auto" disabled={pending}>{pending ? 'Sending…' : slot ? 'Send and book my survey' : 'Send my request'} <Arrow /></button>
    </form>
  )
}

function Thanks({ done, timeZone, surveyFeeAmount, currencyCode, slotKey, area, country }: { done: Done; timeZone: string; surveyFeeAmount: number; currencyCode: string; slotKey: string; area: { postcode: string; region: string }; country: string }) {
  const [survey, setSurvey] = useState<Survey>(done.survey)
  const [slot, setSlot] = useState<{ date: string; slotIndex: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  // The form was long; bring the confirmation to the top of the screen.
  const top = useRef<HTMLDivElement>(null)
  useEffect(() => { top.current?.scrollIntoView({ block: 'start' }); top.current?.focus() }, [])
  return (
    <div ref={top} tabIndex={-1} className="scroll-mt-24 space-y-6 outline-none" role="status">
      <div className="sf-card p-6">
        <h2 className="text-2xl font-extrabold">Thank you, we have your request</h2>
        <p className="mt-2 text-lg">Your reference is <strong className="text-[var(--clay)]">{done.leadNumber}</strong>. {done.served ? `Our ${done.areaName ?? ''} team will be in touch shortly.` : 'We will let you know whether we can reach you.'}</p>
      </div>
      {survey ? (
        <div className="sf-card space-y-3 p-6">
          <h3 className="text-xl font-bold">Your site survey is booked</h3>
          <p>{when(survey.windowStart, timeZone)}</p>
          <div className="flex flex-wrap gap-3">
            {survey.sessionCode && survey.feeAmount > 0 && <Link href={`/pay/${survey.sessionCode}`} className="sf-btn">Pay the survey fee ({money(survey.feeAmount, currencyCode)})</Link>}
            <Link href={`/visit/${survey.visitCode}`} className="sf-btn sf-btn-ghost">See or change the visit</Link>
          </div>
          <p className="sf-help">Keep this page’s link, or the one in your confirmation, to change the time.</p>
        </div>
      ) : done.served ? (
        <div className="sf-card space-y-4 p-6">
          <h3 className="text-xl font-bold">Book your site survey now</h3>
          {surveyFeeAmount > 0 && <p>The survey costs {money(surveyFeeAmount, currencyCode)}, taken off your system if you go ahead.</p>}
          <SlotPicker value={slot} onChange={setSlot} area={{ postcode: area.postcode || undefined, region: area.region || undefined, country }} timeZone={timeZone} />
          <FormError error={error} />
          {slot && <button
            type="button"
            className="sf-btn"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null)
                const r = await bookSurveyAction(done.leadCode, slot!.date, slot!.slotIndex, slotKey)
                if (!r.ok) return setError(r.error)
                setSurvey(r.data as Survey)
              })
            }
          >
            {pending ? 'Booking…' : 'Book this time'}
          </button>}
        </div>
      ) : null}
      <p><Link href="/" className="font-bold text-[var(--clay)] hover:underline">Back to the home page</Link></p>
    </div>
  )
}
