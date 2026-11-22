'use client'

import React, { useRef, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { runOnboarding, type OnboardingAnswersInput } from '../actions/onboarding'

type Step = 'ask' | 'running' | 'done'

const COUNTRIES = [
  { code: 'US', label: 'United States', name: 'Juniper Biogas', note: 'USD, card and bank transfer, REAP grant' },
  { code: 'KE', label: 'Kenya', name: '', note: 'KES, M-Pesa reference, carbon-finance discount' },
  { code: 'IN', label: 'India', name: '', note: 'INR, UPI reference, central biogas subsidy' },
  { code: 'PK', label: 'Pakistan', name: '', note: 'PKR, JazzCash or bank reference' },
] as const

const SELLS = [
  { id: 'home', label: 'Home kits' },
  { id: 'farm', label: 'Farm systems' },
  { id: 'institution', label: 'Institutional systems' },
  { id: 'parts', label: 'Parts and appliances' },
]

const METHODS = [
  { id: 'stripe', label: 'Card (Stripe)' },
  { id: 'mobile_money', label: 'Mobile money' },
  { id: 'bank_transfer', label: 'Bank transfer' },
  { id: 'cash', label: 'Cash' },
]

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter(x => x !== id) : [...list, id])
const words = (k: string) => k.replace(/([A-Z])/g, ' $1').toLowerCase()

function Choice({ checked, onChange, children }: { checked: boolean; onChange: () => void; children: React.ReactNode }) {
  return (
    <label className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${checked ? 'border-primary bg-primary/5' : ''}`}>
      <input type="checkbox" className="h-4 w-4" checked={checked} onChange={onChange} />
      {children}
    </label>
  )
}

/** First-run setup (dissertation section 9): five answers, then the real `runBiogasOnboarding` mutation. */
export default function OnboardingDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [step, setStep] = useState<Step>('ask')
  const [error, setError] = useState<string | null>(null)
  const [answers, setAnswers] = useState<OnboardingAnswersInput>({ companyName: 'Juniper Biogas', country: 'US', sells: SELLS.map(s => s.id), instalments: true, paymentMethods: METHODS.map(m => m.id) })
  const [result, setResult] = useState<{ created: Record<string, number>; staffPassword: string | null; customerLogin: { email: string; password: string } | null } | null>(null)
  const key = useRef(`onboarding-${crypto.randomUUID()}`)

  if (!isOpen) return null

  const run = async () => {
    if (step === 'running') return
    if (!answers.sells.length) return setError('Pick at least one thing you sell.')
    if (!answers.paymentMethods.length) return setError('Pick at least one way customers pay you.')
    setError(null)
    setStep('running')
    const r = await runOnboarding(answers, key.current).catch((e: unknown) => ({ success: false as const, error: e instanceof Error ? e.message : 'Setup did not finish.' }))
    if (!r.success) {
      setError(r.error)
      setStep('ask')
      return
    }
    setResult(r)
    setStep('done')
  }

  const set = (patch: Partial<OnboardingAnswersInput>) => setAnswers(a => ({ ...a, ...patch }))

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && step !== 'running' && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b px-4 py-4 sm:px-6">
          <DialogTitle>Set up your company</DialogTitle>
          <DialogDescription>
            Five questions. We then load your catalogue, branches, plans, checklists, staff logins and a first month of work for your country. Loading again keeps what is there and adds nothing twice.
          </DialogDescription>
        </DialogHeader>

        {step !== 'done' ? (
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
            <div className="space-y-1.5">
              <Label htmlFor="ob-name">Company name</Label>
              <Input id="ob-name" value={answers.companyName} maxLength={120} onChange={e => set({ companyName: e.target.value })} disabled={step === 'running'} />
            </div>
            <div className="space-y-1.5">
              <Label>Country</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {COUNTRIES.map(c => (
                  <label key={c.code} className={`flex cursor-pointer flex-col rounded-md border px-3 py-2 text-sm ${answers.country === c.code ? 'border-primary bg-primary/5' : ''}`}>
                    <span className="flex items-center gap-2">
                      <input type="radio" name="ob-country" checked={answers.country === c.code} onChange={() => set({ country: c.code, companyName: c.name && (!answers.companyName || answers.companyName === 'Juniper Biogas') ? c.name : answers.companyName })} disabled={step === 'running'} />
                      <span className="font-medium">{c.label}</span>
                    </span>
                    <span className="pl-6 text-xs text-muted-foreground">{c.note}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>What you sell</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {SELLS.map(s => <Choice key={s.id} checked={answers.sells.includes(s.id)} onChange={() => set({ sells: toggle(answers.sells, s.id) })}>{s.label}</Choice>)}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Do you sell on instalments?</Label>
              <div className="flex gap-2">
                <Choice checked={answers.instalments} onChange={() => set({ instalments: true })}>Yes</Choice>
                <Choice checked={!answers.instalments} onChange={() => set({ instalments: false })}>No, paid in full</Choice>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>How customers pay you</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {METHODS.map(m => <Choice key={m.id} checked={answers.paymentMethods.includes(m.id)} onChange={() => set({ paymentMethods: toggle(answers.paymentMethods, m.id) })}>{m.label}</Choice>)}
              </div>
              <p className="text-xs text-muted-foreground">Mobile money, bank and cash payments are recorded by reference and checked by your finance staff. They need no keys.</p>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm sm:p-6">
            <p>
              Loaded {Object.entries(result?.created ?? {}).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${words(k)}`).join(', ') || 'nothing new: your company was already set up'}.
            </p>
            {result?.staffPassword ? (
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="font-medium">Staff first password: <code className="select-all">{result.staffPassword}</code></p>
                <p className="text-muted-foreground">Every staff login uses it until they change it. It is shown once; copy it now. Staff emails are on the Team page.</p>
              </div>
            ) : null}
            {result?.customerLogin ? (
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="font-medium">Customer login: <code className="select-all">{result.customerLogin.email}</code> / <code className="select-all">{result.customerLogin.password}</code></p>
                <p className="text-muted-foreground">Sign in on the storefront to see a system, a payment plan, a ticket and a quote from the customer side.</p>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-4">
              <Link href="/dashboard/platform/home" className="font-medium underline underline-offset-4" onClick={onClose}>Today</Link>
              <Link href="/dashboard/platform/leads" className="font-medium underline underline-offset-4" onClick={onClose}>Leads</Link>
              <Link href="/dashboard/platform/quotes" className="font-medium underline underline-offset-4" onClick={onClose}>Quotes</Link>
              <Link href="/dashboard/platform/settings" className="font-medium underline underline-offset-4" onClick={onClose}>Settings</Link>
            </div>
          </div>
        )}

        {error ? <p className="break-words border-t px-4 py-3 text-sm text-red-600 sm:px-6">{error} Anything already saved is reused when you try again.</p> : null}
        <div className="flex shrink-0 gap-2 border-t p-4">
          {step === 'done' ? (
            <DialogClose asChild><Button className="flex-1">Close</Button></DialogClose>
          ) : (
            <>
              <DialogClose asChild><Button variant="ghost" disabled={step === 'running'} className="flex-1">Cancel</Button></DialogClose>
              {step === 'running'
                ? <Button disabled className="flex-1"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading, this takes a few minutes</Button>
                : <Button onClick={run} className="flex-1">{error ? 'Try again' : `Set up ${answers.companyName || 'my company'}`}</Button>}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
