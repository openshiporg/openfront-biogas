'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cancelVisitAction, rescheduleVisitAction } from '../lib/actions'
import { FormError, useKey } from './client'
import { SlotPicker } from './SlotPicker'

/** S16: move or cancel a visit by its code. The server applies the cut-off and any fee rule. */
export function VisitChange({ code, timeZone, warning }: { code: string; timeZone: string; warning: string | null }) {
  const [mode, setMode] = useState<'none' | 'move' | 'cancel'>('none')
  const [slot, setSlot] = useState<{ date: string; slotIndex: number } | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [mkey] = useKey()
  const [ckey] = useKey()
  const [pending, start] = useTransition()
  const router = useRouter()
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <button type="button" className={`sf-btn ${mode === 'move' ? '' : 'sf-btn-ghost'}`} onClick={() => setMode(mode === 'move' ? 'none' : 'move')} aria-expanded={mode === 'move'}>Change the time</button>
        <button type="button" className={`sf-btn ${mode === 'cancel' ? '' : 'sf-btn-ghost'}`} onClick={() => setMode(mode === 'cancel' ? 'none' : 'cancel')} aria-expanded={mode === 'cancel'}>Cancel the visit</button>
      </div>
      {warning && mode !== 'none' && <p className="rounded-[12px] bg-[#fbf0e9] px-4 py-3 text-[#8a3412]">{warning}</p>}
      {mode === 'move' && (
        <div className="space-y-4">
          <SlotPicker value={slot} onChange={setSlot} timeZone={timeZone} />
          <button
            type="button"
            className="sf-btn"
            disabled={!slot || pending}
            onClick={() =>
              start(async () => {
                setError(null)
                const r = await rescheduleVisitAction(code, slot!.date, slot!.slotIndex, mkey)
                if (!r.ok) return setError(r.error)
                setMode('none')
                router.refresh()
              })
            }
          >
            {pending ? 'Moving…' : 'Move to this time'}
          </button>
        </div>
      )}
      {mode === 'cancel' && (
        <div className="space-y-3">
          <label htmlFor="why" className="sf-label">Reason (optional)</label>
          <textarea id="why" value={reason} onChange={e => setReason(e.target.value)} className="sf-input" rows={2} />
          <button
            type="button"
            className="sf-btn"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null)
                const r = await cancelVisitAction(code, reason.trim(), ckey)
                if (!r.ok) return setError(r.error)
                setMode('none')
                router.refresh()
              })
            }
          >
            {pending ? 'Cancelling…' : 'Yes, cancel it'}
          </button>
        </div>
      )}
      <FormError error={error} />
    </div>
  )
}
