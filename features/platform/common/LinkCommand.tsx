'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { runCommand } from '../actions/commands';
import { pillClass } from '../components/ActionButton';
import { inputClass } from '../components/CommandForm';
import { money } from '../lib/format';

/**
 * Runs a named command that answers with a pay link ({ sessionCode, amount, currencyCode }) and shows the
 * link to copy or share. Optional select fields go into the variables. One idempotency key per intent.
 */
export function LinkCommand({ op, vars, children, selects = [], base = '', paths, className }: {
  op: string; vars: Record<string, unknown>; children: React.ReactNode; base?: string; paths?: string[]; className?: string;
  selects?: { name: string; label: string; options: { value: string; label: string }[] }[];
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState('');
  const [link, setLink] = React.useState<{ url: string; amount?: number; currencyCode?: string } | null>(null);
  const [picked, setPicked] = React.useState<Record<string, string>>(() => Object.fromEntries(selects.map(s => [s.name, s.options[0]?.value ?? ''])));
  const key = React.useRef<{ key: string; body: string } | null>(null);
  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1">
      <span className="inline-flex max-w-full flex-wrap items-center gap-1">
        {selects.map(s => (
          <select key={s.name} aria-label={s.label} value={picked[s.name]} onChange={e => setPicked(p => ({ ...p, [s.name]: e.target.value }))} className={cn(inputClass, 'h-8 w-auto')}>
            {s.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ))}
        <button
          type="button"
          disabled={pending || selects.some(s => !picked[s.name])}
          className={cn(pillClass, 'border', className)}
          onClick={() => {
            const variables = { ...vars, ...picked };
            const body = JSON.stringify(variables);
            if (key.current?.body !== body) key.current = { key: `${op}:${crypto.randomUUID()}`, body };
            const idempotencyKey = key.current.key;
            setError('');
            start(async () => {
              const r = await runCommand(op, variables, idempotencyKey, paths);
              if (!r.ok) { setError(r.error); return; }
              key.current = null;
              const d = r.data as any;
              if (d?.sessionCode) setLink({ url: `${base || window.location.origin}/pay/${d.sessionCode}`, amount: d.amount, currencyCode: d.currencyCode });
              router.refresh();
            });
          }}
        >
          {pending ? 'Working' : children}
        </button>
      </span>
      {link ? (
        <span className="flex max-w-full flex-wrap items-center gap-2 text-xs">
          <span>Pay link{link.amount !== undefined ? ` for ${money(link.amount, link.currencyCode)}` : ''}:</span>
          <a href={link.url} target="_blank" rel="noreferrer" className="break-all font-mono underline">{link.url}</a>
          <button type="button" className="underline" onClick={() => navigator.clipboard?.writeText(link.url)}>Copy</button>
        </span>
      ) : null}
      {error ? <span role="alert" className="max-w-xs break-words text-xs text-red-600">{error}</span> : null}
    </span>
  );
}
