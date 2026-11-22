'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { runCommand } from '../../actions/commands';
import { inputClass } from '../../components/CommandForm';
import { pillClass } from '../../components/ActionButton';
import { toMinor } from '../../lib/format';

export type Item = { id: string; prompt: string; helpText?: string | null; inputType: string; choices?: string[] | null; unit?: string | null; isRequired: boolean };
type Values = Record<string, string>;

/** One idempotency key per intent: the same body retried reuses its key; a changed body gets a new one. */
function useKeyed(op: string) {
  const ref = React.useRef<{ key: string; body: string } | null>(null);
  return (vars: unknown) => {
    const body = JSON.stringify(vars);
    if (ref.current?.body !== body) ref.current = { key: `${op}:${crypto.randomUUID()}`, body };
    return { key: ref.current.key, clear: () => { ref.current = null; } };
  };
}

function toAnswers(items: Item[], values: Values) {
  return items.filter(i => values[i.id] !== undefined && values[i.id] !== '').map(i => ({
    itemId: i.id,
    value: i.inputType === 'yes_no' ? values[i.id] === 'yes' : i.inputType === 'number' ? Number(values[i.id]) : values[i.id],
  }));
}

function ItemInput({ item, value, onChange }: { item: Item; value: string; onChange: (v: string) => void }) {
  if (item.inputType === 'yes_no') return (
    <div className="flex gap-2">
      {['yes', 'no'].map(v => (
        <button key={v} type="button" onClick={() => onChange(v)} className={cn(pillClass, 'h-10 min-w-16 border', value === v && 'bg-foreground text-background')}>{v === 'yes' ? 'Yes' : 'No'}</button>
      ))}
    </div>
  );
  if (item.inputType === 'choice') return (
    <div className="flex flex-wrap gap-2">
      {(item.choices ?? []).map(c => (
        <button key={c} type="button" onClick={() => onChange(c)} className={cn(pillClass, 'h-10 border', value === c && 'bg-foreground text-background')}>{c}</button>
      ))}
    </div>
  );
  if (item.inputType === 'number') return <div className="flex items-center gap-2"><input value={value} onChange={e => onChange(e.target.value)} inputMode="decimal" className={cn(inputClass, 'h-10 w-32')} />{item.unit ? <span className="text-sm text-muted-foreground">{item.unit}</span> : null}</div>;
  if (item.inputType === 'photo') return <input value={value} onChange={e => onChange(e.target.value)} placeholder="What the photo shows (attach photos under Photos)" className={cn(inputClass, 'h-10')} />;
  return <input value={value} onChange={e => onChange(e.target.value)} className={cn(inputClass, 'h-10')} />;
}

/** P26 the checklist for this visit type; saved as you go, required items are enforced when the visit is completed. */
export function Checklist({ visitId, items, initial, path, editable, onValues }: { visitId: string; items: Item[]; initial: Values; path: string; editable: boolean; onValues?: (v: Values) => void }) {
  const router = useRouter();
  const [values, setValues] = React.useState<Values>(initial);
  const [error, setError] = React.useState('');
  const [saved, setSaved] = React.useState('');
  const [pending, start] = React.useTransition();
  const keyed = useKeyed('saveVisitChecklist');
  const set = (id: string, v: string) => { const next = { ...values, [id]: v }; setValues(next); onValues?.(next); setSaved(''); };
  function save() {
    const vars = { visitId, answers: toAnswers(items, values) };
    const k = keyed(vars);
    setError('');
    start(async () => {
      const r = await runCommand('saveVisitChecklist', vars, k.key, [path]);
      if (!r.ok) { setError(r.error); return; }
      k.clear(); setSaved('Saved'); router.refresh();
    });
  }
  const left = items.filter(i => i.isRequired && !values[i.id]).length;
  return (
    <div className="space-y-3">
      <ol className="space-y-3">
        {items.map((i, n) => (
          <li key={i.id} className="space-y-1.5 border-b pb-3 last:border-b-0">
            <p className="text-sm">{n + 1}. {i.prompt}{i.isRequired ? <span className="text-red-600"> *</span> : null}</p>
            {i.helpText ? <p className="text-xs text-muted-foreground">{i.helpText}</p> : null}
            {editable ? <ItemInput item={i} value={values[i.id] ?? ''} onChange={v => set(i.id, v)} /> : <p className="text-sm font-medium">{values[i.id] || '—'}</p>}
          </li>
        ))}
      </ol>
      {editable ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={pending} onClick={save} className={cn(pillClass, 'h-10 border')}>{pending ? 'Working' : 'Save checklist'}</button>
          <span className="text-xs text-muted-foreground">{left ? `${left} required item(s) left` : 'All required items answered'}</span>
          {saved ? <span className="text-xs text-emerald-600">{saved}</span> : null}
          {error ? <span role="alert" className="w-full break-words text-xs text-red-600">{error}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/** A finger signature on a canvas, sent as a PNG data URL. */
export function SignaturePad({ onChange }: { onChange: (dataUrl: string) => void }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const drawing = React.useRef(false);
  const inked = React.useRef(false);
  React.useEffect(() => {
    const c = ref.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.clientWidth * ratio; c.height = c.clientHeight * ratio;
    const ctx = c.getContext('2d')!;
    ctx.scale(ratio, ratio); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
  }, []);
  const at = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const; };
  return (
    <div className="space-y-1">
      <canvas ref={ref} aria-label="Customer signature" className="h-40 w-full touch-none rounded-md border bg-white"
        onPointerDown={e => { drawing.current = true; ref.current!.setPointerCapture(e.pointerId); const ctx = ref.current!.getContext('2d')!; const [x, y] = at(e); ctx.beginPath(); ctx.moveTo(x, y); }}
        onPointerMove={e => { if (!drawing.current) return; const ctx = ref.current!.getContext('2d')!; const [x, y] = at(e); ctx.lineTo(x, y); ctx.stroke(); inked.current = true; }}
        onPointerUp={() => { drawing.current = false; if (inked.current) onChange(ref.current!.toDataURL('image/png')); }} />
      <button type="button" className="text-xs text-muted-foreground underline" onClick={() => { const c = ref.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); inked.current = false; onChange(''); }}>Clear</button>
    </div>
  );
}

const TOPICS = ['Daily feeding', 'Lighting the stove', 'Draining the water trap', 'Using the slurry', 'What to do if you smell gas', 'Who to call for help'];

/**
 * P27 complete a visit (survey result, reading on a follow-up, notes, signature) or P29 commission the system
 * (serial, training, signature) on an install or commissioning visit.
 */
export function CompleteVisit({ visitId, version, type, items, initial, commissionItems, path, customerName, serials, products, commission }: {
  visitId: string; version: number; type: string; items: Item[]; initial: Values; commissionItems: Item[]; path: string; customerName: string;
  serials: string[]; products: { id: string; name: string }[]; commission: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = React.useState<'complete' | 'commission'>(commission ? 'commission' : 'complete');
  const [f, setF] = React.useState<Values>({ signedName: customerName, serialNumber: serials[0] ?? '', traineeName: customerName, feasibility: 'feasible', working: 'yes' });
  const [topics, setTopics] = React.useState<string[]>(TOPICS.slice(0, 5));
  const [signature, setSignature] = React.useState('');
  const [error, setError] = React.useState('');
  const [pending, start] = React.useTransition();
  const keyedC = useKeyed('completeVisit');
  const keyedS = useKeyed('commissionSystem');
  const set = (k: string, v: string) => setF(x => ({ ...x, [k]: v }));
  // Completing uses the checklist saved above; commissioning answers its own checklist here.
  const [checks, setChecks] = React.useState<Values>(type === 'commissioning' ? initial : {});
  const field = (k: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-56">{label}<input value={f[k] ?? ''} onChange={e => set(k, e.target.value)} className={cn(inputClass, 'h-10')} {...props} /></label>
  );

  function submit() {
    setError('');
    let op: string; let vars: Record<string, unknown>; let k: ReturnType<ReturnType<typeof useKeyed>>;
    if (mode === 'commission') {
      if (!signature) { setError('The customer signs in the box.'); return; }
      if (!topics.length) { setError('Tick the topics you trained on.'); return; }
      vars = { input: { visitId, expectedVersion: version, answers: toAnswers(commissionItems, checks), signedName: f.signedName, signature, serialNumber: f.serialNumber || undefined, notes: f.notes,
        training: [{ traineeName: f.traineeName, relationToOwner: f.relation || undefined, topics }],
        reading: { working: f.working === 'yes', pressureKpa: f.pressureKpa || undefined, cookingHours: f.cookingHours || undefined } } };
      op = 'commissionSystem'; k = keyedS(vars);
    } else {
      const input: Record<string, unknown> = { visitId, expectedVersion: version, outcome: 'completed', notes: f.notes, signedName: f.signedName || undefined, signature: signature || undefined };
      if (type === 'survey') input.survey = { feasibility: f.feasibility, measuredFeedKgPerDay: f.feed || undefined, waterOk: f.waterOk === 'yes', spaceOk: f.spaceOk === 'yes', soilType: f.soilType, pipeRunM: f.pipeRunM || undefined, pumpNeeded: f.pumpNeeded === 'yes', recommendedProductId: f.recommendedProductId || undefined, notes: f.surveyNotes };
      if (['follow_up', 'maintenance', 'service'].includes(type)) input.reading = { working: f.working === 'yes', pressureKpa: f.pressureKpa || undefined, cookingHours: f.cookingHours || undefined, problem: f.problem || undefined };
      vars = { input }; op = 'completeVisit'; k = keyedC(vars);
    }
    start(async () => {
      const r = await runCommand(op, vars, k.key, [path, '/dashboard/platform/field', '/dashboard/platform/schedule']);
      if (!r.ok) { setError(r.error); return; }
      k.clear(); router.refresh();
    });
  }
  const yesNo = (k: string, label: string) => (
    <div className="flex flex-col gap-1 text-xs text-muted-foreground">{label}
      <div className="flex gap-2">{['yes', 'no'].map(v => <button key={v} type="button" onClick={() => set(k, v)} className={cn(pillClass, 'h-10 min-w-16 border', f[k] === v && 'bg-foreground text-background')}>{v === 'yes' ? 'Yes' : 'No'}</button>)}</div>
    </div>
  );

  return (
    <div className="space-y-3">
      {commission && type === 'install' ? (
        <div className="flex gap-2 text-sm">
          <button type="button" onClick={() => setMode('commission')} className={cn(pillClass, 'border', mode === 'commission' && 'bg-foreground text-background')}>Commission now</button>
          <button type="button" onClick={() => setMode('complete')} className={cn(pillClass, 'border', mode === 'complete' && 'bg-foreground text-background')}>Installed, commission later</button>
        </div>
      ) : null}
      {type === 'survey' && mode === 'complete' ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-56">Result
            <select value={f.feasibility} onChange={e => set('feasibility', e.target.value)} className={cn(inputClass, 'h-10')}>
              <option value="feasible">Feasible</option><option value="feasible_with_work">Feasible with extra work</option><option value="not_feasible">Not feasible</option>
            </select>
          </label>
          {field('feed', 'Feed measured (kg a day)', { inputMode: 'decimal' })}
          {field('soilType', 'Soil')}
          {field('pipeRunM', 'Gas pipe run (m)', { inputMode: 'decimal' })}
          {yesNo('waterOk', 'Water close by')}{yesNo('spaceOk', 'Space for the digester')}{yesNo('pumpNeeded', 'Pump needed')}
          <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-72">Recommend
            <select value={f.recommendedProductId ?? ''} onChange={e => set('recommendedProductId', e.target.value)} className={cn(inputClass, 'h-10')}>
              <option value="">—</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          {field('surveyNotes', 'Survey notes')}
        </div>
      ) : null}
      {mode === 'commission' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-56">Serial number
              {serials.length ? (
                <select value={f.serialNumber} onChange={e => set('serialNumber', e.target.value)} className={cn(inputClass, 'h-10')}>{serials.map(s => <option key={s} value={s}>{s}</option>)}</select>
              ) : <input value={f.serialNumber} onChange={e => set('serialNumber', e.target.value)} className={cn(inputClass, 'h-10')} />}
            </label>
            {field('traineeName', 'Who was trained')}
            {field('relation', 'Relation to the owner')}
          </div>
          {commissionItems.length ? (
            <ol className="space-y-3">
              {commissionItems.map((i, n) => (
                <li key={i.id} className="space-y-1.5">
                  <p className="text-sm">{n + 1}. {i.prompt}{i.isRequired ? <span className="text-red-600"> *</span> : null}</p>
                  <ItemInput item={i} value={checks[i.id] ?? ''} onChange={v => setChecks(x => ({ ...x, [i.id]: v }))} />
                </li>
              ))}
            </ol>
          ) : null}
          <fieldset className="flex flex-wrap gap-3 text-sm">
            <legend className="mb-1 text-xs text-muted-foreground">Trained on</legend>
            {TOPICS.map(t => <label key={t} className="flex items-center gap-1.5"><input type="checkbox" checked={topics.includes(t)} onChange={e => setTopics(x => e.target.checked ? [...x, t] : x.filter(y => y !== t))} />{t}</label>)}
          </fieldset>
        </div>
      ) : null}
      {mode === 'commission' || ['follow_up', 'maintenance', 'service'].includes(type) ? (
        <div className="flex flex-wrap items-end gap-3">
          {yesNo('working', 'Gas working')}
          {field('pressureKpa', 'Pressure (kPa)', { inputMode: 'decimal' })}
          {field('cookingHours', 'Cooking hours a day', { inputMode: 'decimal' })}
          {mode === 'complete' ? field('problem', 'Problem found') : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        {field('notes', 'Notes')}
        {field('signedName', 'Customer name')}
      </div>
      <div className="max-w-md"><SignaturePad onChange={setSignature} /></div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={pending} onClick={submit} className={cn(pillClass, 'h-10 border bg-foreground px-4 text-background')}>{pending ? 'Working' : mode === 'commission' ? 'Commission and hand over' : 'Complete visit'}</button>
        {error ? <span role="alert" className="w-full break-words text-xs text-red-600">{error}</span> : null}
      </div>
    </div>
  );
}

/** P30 take a payment on site: cash, mobile money or bank transfer, up to what is owed; finance verifies it. */
export function TakePayment({ visitId, owed, currency, path }: { visitId: string; owed: string; currency: string; path: string }) {
  const router = useRouter();
  const [f, setF] = React.useState<Values>({ provider: 'cash', reference: '', amount: '', payerPhone: '' });
  const [error, setError] = React.useState('');
  const [done, setDone] = React.useState('');
  const [pending, start] = React.useTransition();
  const keyed = useKeyed('collectOnSite');
  function submit() {
    const amount = f.amount ? toMinor(f.amount) : null;
    if (f.amount && (amount === null || amount <= 0)) { setError('Enter the amount, for example 50.00.'); return; }
    const vars = { visitId, provider: f.provider, reference: f.reference.trim(), payerPhone: f.payerPhone || undefined, ...(amount ? { amount } : {}) };
    const k = keyed(vars);
    setError(''); setDone('');
    start(async () => {
      const r = await runCommand('collectOnSite', vars, k.key, [path, '/dashboard/platform/payments']);
      if (!r.ok) { setError(r.error); return; }
      k.clear(); setDone('Recorded. Finance verifies it against the cash or statement.'); setF(x => ({ ...x, reference: '', amount: '' })); router.refresh();
    });
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-44">Method
        <select value={f.provider} onChange={e => setF(x => ({ ...x, provider: e.target.value }))} className={cn(inputClass, 'h-10')}>
          <option value="cash">Cash</option><option value="mobile_money">Mobile money</option><option value="bank_transfer">Bank transfer</option>
        </select>
      </label>
      <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-56">{f.provider === 'cash' ? 'Receipt book number' : 'Transaction reference'}
        <input value={f.reference} onChange={e => setF(x => ({ ...x, reference: e.target.value }))} className={cn(inputClass, 'h-10')} />
      </label>
      <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-40">Amount ({currency})
        <input value={f.amount} onChange={e => setF(x => ({ ...x, amount: e.target.value }))} placeholder={owed} inputMode="decimal" className={cn(inputClass, 'h-10')} />
      </label>
      {f.provider !== 'cash' ? (
        <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-44">Payer phone
          <input value={f.payerPhone} onChange={e => setF(x => ({ ...x, payerPhone: e.target.value }))} inputMode="tel" className={cn(inputClass, 'h-10')} />
        </label>
      ) : null}
      <button type="button" disabled={pending} onClick={submit} className={cn(pillClass, 'h-10 border')}>{pending ? 'Working' : 'Record payment'}</button>
      {error ? <span role="alert" className="w-full break-words text-xs text-red-600">{error}</span> : null}
      {done ? <span className="w-full text-xs text-emerald-600">{done}</span> : null}
    </div>
  );
}
