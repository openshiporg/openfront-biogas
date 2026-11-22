import Link from 'next/link'
import { statusText, statusTone, type Tone } from '../lib/format'

const TONE: Record<Tone, string> = {
  good: 'bg-[#e3ecd0] text-[#2f5a17]',
  wait: 'bg-[#f6e3d8] text-[#8a3412]',
  bad: 'bg-[#f7dcd5] text-[#8f2a15]',
  plain: 'bg-[#ece8de] text-[#4f4d45]',
}

export function Status({ value, label }: { value: string | null | undefined; label?: string }) {
  return <span className={`sf-chip ${TONE[statusTone(value)]}`}>{label ?? statusText(value)}</span>
}

export function PageHead({ title, intro, crumbs, children }: { title: string; intro?: React.ReactNode; crumbs?: { href: string; label: string }[]; children?: React.ReactNode }) {
  return (
    <div className="border-b border-[var(--line)] bg-[var(--cream-2)]">
      <div className="mx-auto max-w-[1240px] px-4 pb-8 pt-8 sm:px-6">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-3 text-sm text-[var(--muted)]">
            {crumbs.map((c, i) => (
              <span key={c.href}>
                <Link href={c.href} className="hover:text-[var(--clay)] hover:underline">{c.label}</Link>
                {i < crumbs.length - 1 ? <span aria-hidden="true"> / </span> : null}
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-[2rem] font-extrabold leading-tight sm:text-[2.5rem]">{title}</h1>
        {intro && <div className="mt-2 max-w-3xl text-lg">{intro}</div>}
        {children}
      </div>
    </div>
  )
}

export function Section({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto max-w-[1240px] px-4 py-10 sm:px-6 ${className}`}>{children}</div>
}

export function Notice({ tone = 'plain', title, children }: { tone?: 'plain' | 'good' | 'bad' | 'wait'; title?: string; children?: React.ReactNode }) {
  const cls = tone === 'good' ? 'border-[#bcd29a] bg-[#eef4e2]' : tone === 'bad' ? 'border-[#e7b6a8] bg-[#fbeae5]' : tone === 'wait' ? 'border-[#ecc6b2] bg-[#fbf0e9]' : 'border-[var(--line)] bg-[#fffdf8]'
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={`rounded-[16px] border px-5 py-4 ${cls}`}>
      {title && <p className="font-bold text-[var(--forest)]">{title}</p>}
      {children && <div className={title ? 'mt-1' : ''}>{children}</div>}
    </div>
  )
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: { href: string; label: string } }) {
  return (
    <div className="sf-card px-6 py-10 text-center">
      <p className="text-xl font-bold text-[var(--forest)]">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-lg">{children}</div>}
      {action && <Link href={action.href} className="sf-btn mt-5">{action.label}</Link>}
    </div>
  )
}

export function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="divide-y divide-[var(--line)]">
      {rows.filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 py-2.5">
          <dt className="text-[var(--muted)]">{k}</dt>
          <dd className="text-right font-semibold text-[var(--forest)]">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/* Shown while a page reads its data: the page's shape in soft blocks, no spinner wall. */
export function LoadingState() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="border-b border-[var(--line)] bg-[var(--cream-2)]">
        <div className="mx-auto max-w-[1240px] animate-pulse px-4 pb-8 pt-8 sm:px-6">
          <div className="h-10 w-2/3 max-w-md rounded-full bg-[var(--sage)]" />
          <div className="mt-4 h-5 w-full max-w-xl rounded-full bg-[var(--sage)]" />
        </div>
      </div>
      <div className="mx-auto grid max-w-[1240px] animate-pulse gap-5 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
        {[0, 1, 2].map(i => <div key={i} className="h-56 rounded-[20px] bg-[var(--sage)]" />)}
      </div>
    </div>
  )
}
