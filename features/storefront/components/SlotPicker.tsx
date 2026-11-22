'use client'

import { useEffect, useState } from 'react'
import { slotsAction } from '../lib/actions'
import { dayLabel } from '../lib/format'

export type Slot = { date: string; slotIndex: number; windowStart: string; windowEnd: string; free: number }

const time = (iso: string, tz: string) => new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(new Date(iso))

/**
 * Open survey or visit times for the next two weeks, read live from availableVisitSlots for the
 * customer's area. The customer picks a time, never a technician.
 */
export function SlotPicker({ value, onChange, area, timeZone }: { value: { date: string; slotIndex: number } | null; onChange: (v: { date: string; slotIndex: number } | null) => void; area?: { postcode?: string; region?: string; country?: string }; timeZone: string }) {
  const [state, setState] = useState<{ loading: boolean; served: boolean; slots: Slot[]; error: string | null }>({ loading: true, served: true, slots: [], error: null })
  const key = JSON.stringify(area ?? {})
  useEffect(() => {
    let live = true
    setState(s => ({ ...s, loading: true, error: null }))
    slotsAction({ days: 14, ...(area ?? {}) }).then(r => {
      if (!live) return
      if (!r.ok) return setState({ loading: false, served: true, slots: [], error: r.error })
      setState({ loading: false, served: r.data?.served !== false, slots: r.data?.slots ?? [], error: null })
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (state.loading) return <p className="text-[var(--muted)]" role="status">Finding open times…</p>
  if (state.error) return <p className="text-[#8f2a15]" role="alert">{state.error}</p>
  if (!state.served) return <p className="text-[var(--muted)]">We don’t book visits in that area online. We will call you to arrange one.</p>
  if (!state.slots.length) return <p className="text-[var(--muted)]">No open times in the next two weeks. We will call you to agree a day.</p>

  const days = Array.from(new Set(state.slots.map(s => s.date)))
  return (
    <fieldset className="space-y-3">
      <legend className="sr-only">Pick a time</legend>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {days.map(d => (
          <div key={d} className="rounded-[14px] border border-[var(--line)] bg-white p-3">
            <p className="font-bold text-[var(--forest)]">{dayLabel(d)}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {state.slots.filter(s => s.date === d).map(s => {
                const on = value?.date === s.date && value.slotIndex === s.slotIndex
                return (
                  <label key={s.slotIndex} className={`flex min-h-11 cursor-pointer items-center rounded-full border px-3 text-[0.92rem] ${on ? 'border-[var(--clay)] bg-[var(--clay)] text-white' : 'border-[var(--line)] hover:border-[var(--clay)]'}`}>
                    <input type="radio" name="slot" className="sr-only" checked={on} onChange={() => onChange({ date: s.date, slotIndex: s.slotIndex })} />
                    {time(s.windowStart, timeZone)}–{time(s.windowEnd, timeZone)}
                  </label>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      {value && <button type="button" className="text-sm font-bold text-[var(--clay)] underline" onClick={() => onChange(null)}>Clear the time</button>}
    </fieldset>
  )
}
