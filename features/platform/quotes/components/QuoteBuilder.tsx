'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { runCommand } from '../../actions/commands';
import { inputClass } from '../../components/CommandForm';
import { pillClass } from '../../components/ActionButton';
import { label, money, toMinor } from '../../lib/format';

export type Product = { id: string; name: string; sku: string; type: string; priceAmount: number };
export type Template = { id: string; name: string; kind: string };
type Line = { kind: 'product' | 'labour' | 'fee' | 'delivery' | 'discount'; productId?: string; description?: string; quantity: string; amount?: string };
type Option = { label: string; description: string; isRecommended: boolean; lines: Line[]; planTemplateIds: string[] };

const blank = (templates: Template[]): Option => ({ label: '', description: '', isRecommended: false, lines: [], planTemplateIds: templates.map(t => t.id) });

/**
 * P7: a quote with up to three options. Product prices, install fees, tax, incentive lines and plan
 * offers are worked out by the server from the catalogue; this screen only sends products, quantities,
 * any extra labour, fee or discount lines, and which payment plans to offer.
 */
export function QuoteBuilder({ products, templates, currencyCode, target, initial }: {
  products: Product[]; templates: Template[]; currencyCode: string;
  target: { leadId?: string; customerId?: string; ticketId?: string; quoteId?: string; kind: 'sale' | 'service' };
  initial?: { notes: string; terms: string; options: Option[] };
}) {
  const router = useRouter();
  const [options, setOptions] = React.useState<Option[]>(initial?.options.length ? initial.options : [{ ...blank(templates), isRecommended: true }]);
  const [notes, setNotes] = React.useState(initial?.notes ?? '');
  const [terms, setTerms] = React.useState(initial?.terms ?? 'Includes delivery, installation, commissioning and training.');
  const [error, setError] = React.useState('');
  const [pending, start] = React.useTransition();
  const key = React.useRef<{ key: string; body: string } | null>(null);
  const byId = new Map(products.map(p => [p.id, p]));

  const set = (i: number, patch: Partial<Option>) => setOptions(os => os.map((o, j) => (j === i ? { ...o, ...patch } : patch.isRecommended ? { ...o, isRecommended: false } : o)));
  const setLine = (i: number, k: number, patch: Partial<Line>) => set(i, { lines: options[i].lines.map((l, j) => (j === k ? { ...l, ...patch } : l)) });

  function save() {
    setError('');
    let bad = '';
    const payload = options.map((o, i) => ({
      label: o.label.trim() || `Option ${i + 1}`, description: o.description.trim() || undefined, isRecommended: o.isRecommended, planTemplateIds: o.planTemplateIds,
      lines: o.lines.map(l => {
        const quantity = Number(l.quantity || '1');
        if (!Number.isInteger(quantity) || quantity < 1) bad = 'Quantities are whole numbers from 1.';
        if (l.kind === 'product') return { kind: 'product', productId: l.productId, quantity };
        const minor = toMinor(l.amount ?? '');
        if (minor === null || minor <= 0) bad = `Enter an amount for “${l.description || label(l.kind)}”.`;
        if (!(l.description ?? '').trim()) bad = 'Every labour, fee or discount line needs a description.';
        return { kind: l.kind, description: (l.description ?? '').trim(), quantity, unitAmount: l.kind === 'discount' ? -(minor ?? 0) : minor };
      }),
    }));
    if (payload.some(o => !o.lines.length)) bad = 'Each option needs at least one line.';
    if (bad) { setError(bad); return; }
    const variables = { input: { ...target, notes, terms, options: payload } };
    const body = JSON.stringify(variables);
    if (key.current?.body !== body) key.current = { key: `saveQuoteDraft:${crypto.randomUUID()}`, body };
    const idempotencyKey = key.current.key;
    start(async () => {
      const r = await runCommand('saveQuoteDraft', variables, idempotencyKey, ['/dashboard/platform/quotes']);
      if (!r.ok) { setError(r.error); return; }
      key.current = null;
      const id = (r.data as { id: string }).id;
      if (target.quoteId === id) router.refresh(); else router.push(`/dashboard/platform/quotes/${id}`);
    });
  }

  return (
    <div className="space-y-4">
      {options.map((o, i) => (
        <div key={i} className="space-y-3 rounded-lg border p-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-56">Option {i + 1} name
              <input value={o.label} onChange={e => set(i, { label: e.target.value })} placeholder="HomeBag 4 with double stove" className={inputClass} />
            </label>
            <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-80">What the customer reads
              <input value={o.description} onChange={e => set(i, { description: e.target.value })} className={inputClass} />
            </label>
            <label className="flex items-center gap-2 text-sm"><input type="radio" name="recommended" checked={o.isRecommended} onChange={() => set(i, { isRecommended: true })} /> Recommended</label>
            {options.length > 1 ? <button type="button" onClick={() => setOptions(os => os.filter((_, j) => j !== i))} className="h-8 px-2 text-sm text-muted-foreground hover:underline">Remove option</button> : null}
          </div>
          <ul className="divide-y rounded-md border">
            {o.lines.map((l, k) => (
              <li key={k} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                {l.kind === 'product' ? (
                  <span className="min-w-0 flex-1 basis-48 break-words">{byId.get(l.productId ?? '')?.name} <span className="text-xs text-muted-foreground">{money(byId.get(l.productId ?? '')?.priceAmount, currencyCode)}</span></span>
                ) : (
                  <>
                    <span className="text-xs text-muted-foreground">{label(l.kind)}</span>
                    <input aria-label="Description" value={l.description ?? ''} onChange={e => setLine(i, k, { description: e.target.value })} placeholder="Description" className={cn(inputClass, 'h-8 flex-1 basis-40')} />
                    <input aria-label="Amount" value={l.amount ?? ''} onChange={e => setLine(i, k, { amount: e.target.value })} placeholder="0.00" inputMode="decimal" className={cn(inputClass, 'h-8 w-24')} />
                  </>
                )}
                <input aria-label="Quantity" value={l.quantity} onChange={e => setLine(i, k, { quantity: e.target.value })} inputMode="numeric" className={cn(inputClass, 'h-8 w-16')} />
                <button type="button" onClick={() => set(i, { lines: o.lines.filter((_, j) => j !== k) })} className="h-8 px-2 text-sm text-muted-foreground hover:underline">Remove</button>
              </li>
            ))}
            {!o.lines.length ? <li className="px-3 py-2 text-sm text-muted-foreground">No lines yet.</li> : null}
          </ul>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-80">Add from the catalogue
              <select value="" onChange={e => { if (e.target.value) set(i, { lines: [...o.lines, { kind: 'product', productId: e.target.value, quantity: '1' }] }); }} className={inputClass}>
                <option value="">Pick a product…</option>
                {['digester_kit', 'appliance', 'part', 'consumable', 'service'].map(t => {
                  const list = products.filter(p => p.type === t);
                  return list.length ? <optgroup key={t} label={label(t)}>{list.map(p => <option key={p.id} value={p.id}>{p.name} · {money(p.priceAmount, currencyCode)}</option>)}</optgroup> : null;
                })}
                {(() => { const rest = products.filter(p => !['digester_kit', 'appliance', 'part', 'consumable', 'service'].includes(p.type)); return rest.length ? <optgroup label="Other">{rest.map(p => <option key={p.id} value={p.id}>{p.name} · {money(p.priceAmount, currencyCode)}</option>)}</optgroup> : null; })()}
              </select>
            </label>
            {(['labour', 'fee', 'delivery', 'discount'] as const).map(kind => (
              <button key={kind} type="button" onClick={() => set(i, { lines: [...o.lines, { kind, description: '', quantity: '1', amount: '' }] })} className={cn(pillClass, 'border')}>+ {label(kind)}</button>
            ))}
          </div>
          {templates.length ? (
            <fieldset className="flex flex-wrap gap-3 text-sm">
              <legend className="mb-1 text-xs text-muted-foreground">Payment plans offered</legend>
              {templates.map(t => (
                <label key={t.id} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={o.planTemplateIds.includes(t.id)} onChange={e => set(i, { planTemplateIds: e.target.checked ? [...o.planTemplateIds, t.id] : o.planTemplateIds.filter(x => x !== t.id) })} />
                  {t.name}
                </label>
              ))}
            </fieldset>
          ) : null}
        </div>
      ))}
      {options.length < 3 ? <button type="button" onClick={() => setOptions(os => [...os, blank(templates)])} className={cn(pillClass, 'border')}>+ Add an option</button> : null}
      <div className="flex flex-wrap gap-2">
        <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-96">Notes for the customer<textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={cn(inputClass, 'h-auto py-2')} /></label>
        <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-96">Terms<textarea value={terms} onChange={e => setTerms(e.target.value)} rows={2} className={cn(inputClass, 'h-auto py-2')} /></label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={pending} onClick={save} className={cn(pillClass, 'border')}>{pending ? 'Working' : 'Save draft'}</button>
        <span className="text-xs text-muted-foreground">Prices, install fees, tax, incentives and plan amounts are worked out when you save.</span>
        {error ? <span role="alert" className="w-full break-words text-xs text-red-600">{error}</span> : null}
      </div>
    </div>
  );
}
