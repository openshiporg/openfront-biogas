'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { pillClass } from '../components/ActionButton';
import { inputClass, type FormField } from '../components/CommandForm';
import { toMinor } from '../lib/format';
import { saveRecord } from './actions';

export type RecordField = FormField | { name: string; label: string; kind: 'checkbox'; defaultValue?: boolean } | { name: string; label: string; kind: 'multi'; options: { value: string; label: string }[]; defaultValue?: string[] } | { name: string; label: string; kind: 'textarea'; defaultValue?: string; required?: boolean; placeholder?: string };

const WIDTH = { sm: 'sm:w-36', md: 'sm:w-56', lg: 'sm:w-80' };

/** Create or edit one plain record (a supplier, a product, a setting). Money is typed in major units and saved in minor units. */
export function RecordForm({ list, id = null, fields, fixed = {}, submit, paths, resetOnSave, className }: {
  list: string; id?: string | null; fields: RecordField[]; fixed?: Record<string, unknown>; submit: string; paths?: string[]; resetOnSave?: boolean; className?: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState('');
  const [done, setDone] = React.useState('');
  return (
    <form
      className={cn('flex flex-wrap items-end gap-2', className)}
      onSubmit={(e) => {
        e.preventDefault();
        const target = e.currentTarget;
        const form = new FormData(target);
        const data: Record<string, unknown> = { ...fixed };
        for (const f of fields) {
          if (f.kind === 'checkbox') { data[f.name] = form.get(f.name) === 'on'; continue; }
          if (f.kind === 'multi') { data[f.name] = form.getAll(f.name).map(String); continue; }
          const raw = String(form.get(f.name) ?? '').trim();
          if (f.kind === 'money') {
            if (!raw) { data[f.name] = ''; continue; }
            const n = toMinor(raw);
            if (n === null) { setError(`${f.label}: enter an amount.`); return; }
            data[f.name] = n;
          } else data[f.name] = raw;
        }
        setError(''); setDone('');
        start(async () => {
          const r = await saveRecord(list, id, data, paths);
          if (!r.ok) { setError(r.error); return; }
          if (resetOnSave ?? !id) target.reset();
          setDone('Saved'); router.refresh();
        });
      }}
    >
      {fields.map((f) => {
        if (f.kind === 'hidden') return <input key={f.name} type="hidden" name={f.name} defaultValue={f.defaultValue} />;
        if (f.kind === 'checkbox') return (
          <label key={f.name} className="flex h-9 items-center gap-2 text-sm"><input type="checkbox" name={f.name} defaultChecked={f.defaultValue} className="size-4" />{f.label}</label>
        );
        if (f.kind === 'multi') return (
          <fieldset key={f.name} className="flex w-full flex-col gap-1 text-xs text-muted-foreground">
            <legend className="mb-1">{f.label}</legend>
            <span className="flex flex-wrap gap-x-4 gap-y-1">
              {f.options.map((o) => <label key={o.value} className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" name={f.name} value={o.value} defaultChecked={f.defaultValue?.includes(o.value)} className="size-4" />{o.label}</label>)}
            </span>
          </fieldset>
        );
        if (f.kind === 'textarea') return (
          <label key={f.name} className="flex w-full flex-col gap-1 text-xs text-muted-foreground">
            {f.label}
            <textarea name={f.name} defaultValue={f.defaultValue} required={f.required} placeholder={f.placeholder} rows={3} className={cn(inputClass, 'h-auto py-2')} />
          </label>
        );
        const w = 'width' in f && f.width ? WIDTH[f.width] : WIDTH.md;
        return (
          <label key={f.name} className={cn('flex w-full flex-col gap-1 text-xs text-muted-foreground', w)}>
            {f.label}
            {f.kind === 'select' ? (
              <select name={f.name} required={f.required} defaultValue={f.defaultValue} className={inputClass}>
                {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input name={f.name} type={f.kind === 'money' ? 'text' : f.kind ?? 'text'} inputMode={f.kind === 'money' ? 'decimal' : undefined} step={f.kind === 'number' ? 'any' : undefined} required={f.required} placeholder={f.placeholder} defaultValue={f.defaultValue} className={inputClass} autoComplete="off" />
            )}
          </label>
        );
      })}
      <button type="submit" disabled={pending} className={cn(pillClass, 'border')}>{pending ? 'Saving' : submit}</button>
      {error ? <span role="alert" className="w-full break-words text-xs text-red-600">{error}</span> : null}
      {done && !error ? <span className="w-full text-xs text-emerald-600">{done}</span> : null}
    </form>
  );
}
