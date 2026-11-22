import type { Faq } from '../lib/data/store'

/** Questions as native disclosure widgets: keyboard and screen-reader friendly with no script. */
export function Faqs({ items }: { items: Faq[] }) {
  return (
    <div className="mt-6 divide-y divide-[var(--line)] rounded-[20px] border border-[var(--line)] bg-[#fffdf8]">
      {items.map(f => (
        <details key={f.id} className="group px-5">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 font-bold text-[var(--forest)]">
            {f.question}
            <span className="text-2xl leading-none text-[var(--clay)] transition group-open:rotate-45" aria-hidden="true">+</span>
          </summary>
          <div className="sf-prose pb-4">{f.answer.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div>
        </details>
      ))}
    </div>
  )
}
