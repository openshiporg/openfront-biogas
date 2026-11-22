'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { sizeSystemAction } from '../lib/actions'
import { minorFromMajor, money, num } from '../lib/format'
import { Arrow } from './Art'
import { FormError } from './client'

type Result = {
  assessmentId: string
  dailyFeedKg: number
  estimatedGasM3: number
  cookingHours: number
  coversPercent: number
  fuelSavedAmountPerMonth: number
  paybackMonths: number | null
  recommended: { name: string; slug: string; priceAmount: number; installFeeAmount: number; currencyCode: string; capacityM3: string; dailyGasM3: string } | null
  note: string
}

export function Calculator({ currencyCode }: { currencyCode: string }) {
  const [interest, setInterest] = useState<'home' | 'farm' | 'institution'>('home')
  const [f, setF] = useState({ cattle: '', pigs: '', poultry: '', kitchen: '', people: '', fuel: '' })
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF(s => ({ ...s, [k]: e.target.value }))
  const n = (v: string) => (v.trim() === '' ? 0 : Number(v))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    start(async () => {
      setError(null)
      const r = await sizeSystemAction({ interest, cattle: n(f.cattle), pigs: n(f.pigs), poultry: n(f.poultry), kitchenWasteKgPerDay: n(f.kitchen), people: n(f.people), monthlyFuelSpendAmount: minorFromMajor(f.fuel || '0', currencyCode) })
      if (!r.ok) return setError(r.error)
      setResult(r.data as Result)
    })
  }

  const field = (k: keyof typeof f, label: string, help: string, step = '1') => (
    <div>
      <label htmlFor={`c-${k}`} className="sf-label">{label}</label>
      <input id={`c-${k}`} type="number" inputMode="decimal" min={0} step={step} value={f[k]} onChange={set(k)} className="sf-input" />
      <p className="sf-help">{help}</p>
    </div>
  )

  const quoteHref = result ? `/get-a-quote?assessment=${encodeURIComponent(result.assessmentId)}&interest=${interest}${result.recommended ? `&system=${encodeURIComponent(result.recommended.slug)}` : ''}` : '/get-a-quote'

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
      <form onSubmit={submit} className="sf-card space-y-5 p-6" noValidate>
        <fieldset>
          <legend className="sf-label">This is for</legend>
          <div className="flex flex-wrap gap-2">
            {(['home', 'farm', 'institution'] as const).map(i => (
              <label key={i} className={`flex min-h-11 cursor-pointer items-center rounded-full border px-4 font-semibold ${interest === i ? 'border-[var(--forest)] bg-[var(--forest)] text-white' : 'border-[var(--line)] bg-white'}`}>
                <input type="radio" name="interest" className="sr-only" checked={interest === i} onChange={() => setInterest(i)} />
                {i === 'home' ? 'My home' : i === 'farm' ? 'My farm' : 'A school, hotel or kitchen'}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-3">
          {field('cattle', 'Cattle', 'Cows kept in a pen at night')}
          {field('pigs', 'Pigs', 'Adult pigs')}
          {field('poultry', 'Poultry', 'Chickens or ducks')}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {field('kitchen', 'Kitchen waste (kg a day)', 'Food scraps and peels', '0.5')}
          {field('people', 'People cooking for', 'Everyone who eats at home')}
        </div>
        {field('fuel', `Spent on cooking fuel each month (${currencyCode})`, 'Firewood, charcoal, LPG or kerosene', '0.01')}
        <FormError error={error} />
        <button className="sf-btn w-full sm:w-auto" disabled={pending}>{pending ? 'Working it out…' : 'Size my system'}</button>
      </form>

      <div aria-live="polite">
        {!result ? (
          <div className="sf-panel flex h-full flex-col justify-center p-8">
            <h2 className="text-2xl font-extrabold">What you will see</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5">
              <li>How much gas your waste can make each day</li>
              <li>How many hours of cooking that gives you</li>
              <li>The system that fits, and its price</li>
              <li>What you could save on fuel, and when it pays for itself</li>
            </ul>
          </div>
        ) : (
          <div className="sf-card space-y-5 p-6">
            <h2 className="text-2xl font-extrabold">Your estimate</h2>
            <dl className="grid grid-cols-2 gap-3">
              {[
                ['Feed a day', `${num(result.dailyFeedKg)} kg`],
                ['Gas a day', `${num(result.estimatedGasM3, 2)} m³`],
                ['Cooking time', `about ${num(result.cookingHours)} h a day`],
                ['Covers your cooking', `${result.coversPercent}%`],
              ].map(([k, v]) => (
                <div key={k} className="rounded-[14px] bg-[var(--sage)] px-4 py-3"><dt className="text-sm">{k}</dt><dd className="font-[family-name:var(--font-sf-head)] text-2xl font-extrabold text-[var(--forest)]">{v}</dd></div>
              ))}
            </dl>
            {result.fuelSavedAmountPerMonth > 0 && (
              <p className="text-lg">You could save about <strong className="text-[var(--clay)]">{money(result.fuelSavedAmountPerMonth, result.recommended?.currencyCode ?? currencyCode, { whole: true })} a month</strong> on fuel{result.paybackMonths ? <>, so the system pays for itself in about <strong>{result.paybackMonths} months</strong></> : null}.</p>
            )}
            {result.recommended ? (
              <div className="rounded-[14px] border border-[var(--line)] p-4">
                <p className="text-sm text-[var(--muted)]">The system that fits</p>
                <p className="text-xl font-bold text-[var(--forest)]"><Link href={`/systems/${result.recommended.slug}`} className="hover:underline">{result.recommended.name}</Link></p>
                <p>{num(result.recommended.capacityM3)} m³ · {money(result.recommended.priceAmount + result.recommended.installFeeAmount, result.recommended.currencyCode, { whole: true })} installed</p>
              </div>
            ) : (
              <p>{result.note}</p>
            )}
            <Link href={quoteHref} className="sf-btn">Get a quote with these numbers <Arrow /></Link>
            <p className="sf-help">An estimate from standard figures for small digesters. We confirm the size at your site survey.</p>
          </div>
        )}
      </div>
    </div>
  )
}
