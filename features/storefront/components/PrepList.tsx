'use client'

import { useState, useTransition } from 'react'
import { prepTaskAction } from '../lib/actions'
import { Check } from './Art'

type Task = { id: string; prompt: string; helpText?: string | null; isRequired: boolean; status?: string }

/** The get-ready checklist (S21). Signed-in owners tick items; each tick is one completeSitePrepTask. */
export function PrepList({ tasks, editable, path }: { tasks: Task[]; editable: boolean; path: string }) {
  const [state, setState] = useState<Record<string, boolean>>(() => Object.fromEntries(tasks.map(t => [t.id, t.status === 'done'])))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [, start] = useTransition()
  return (
    <>
      <ul className="mt-3 space-y-2">
        {tasks.map(t => {
          const done = state[t.id]
          return (
            <li key={t.id} className="rounded-[12px] border border-[var(--line)] bg-white px-4 py-3">
              <label className={`flex items-start gap-3 ${editable ? 'cursor-pointer' : ''}`}>
                {editable ? (
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 shrink-0 accent-[var(--leaf)]"
                    checked={done}
                    disabled={busy === t.id}
                    onChange={e => {
                      const next = e.target.checked
                      setBusy(t.id)
                      setError(null)
                      start(async () => {
                        const key = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${t.id}-${Date.now()}`
                        const r = await prepTaskAction(t.id, next, key, path)
                        setBusy(null)
                        if (!r.ok) return setError(r.error)
                        setState(s => ({ ...s, [t.id]: next }))
                      })
                    }}
                  />
                ) : done ? <Check className="mt-0.5 h-5 w-5 shrink-0" /> : <span className="mt-1 h-5 w-5 shrink-0 rounded border-2 border-[var(--line)]" aria-hidden="true" />}
                <span>
                  <span className={`font-semibold ${done ? 'text-[var(--muted)] line-through' : 'text-[var(--forest)]'}`}>{t.prompt}</span>
                  {!t.isRequired && <span className="text-sm text-[var(--muted)]"> (optional)</span>}
                  {t.helpText && <span className="block text-sm text-[var(--muted)]">{t.helpText}</span>}
                  {!editable && <span className="sr-only">{done ? 'done' : 'not done yet'}</span>}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
      {error && <p role="alert" className="mt-2 text-[#8f2a15]">{error}</p>}
    </>
  )
}
