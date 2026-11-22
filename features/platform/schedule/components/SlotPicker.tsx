'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { runCommand, runQuery } from '../../actions/commands';
import { inputClass } from '../../components/CommandForm';
import { pillClass } from '../../components/ActionButton';

type Slot = { date: string; slotIndex: number; windowStart: string; windowEnd: string; technicianIds: string[] };
type Tech = { id: string; name: string };

/**
 * Book or move a visit into a free slot. Free slots come from staffVisitSlots (a slot is free for a technician when
 * they have no visit in it and are not off that day); booking takes the slot under a unique key, so two dispatchers
 * cannot give one technician the same slot.
 */
export function SlotPicker({ visitId, expectedVersion, create, from, techs, timezone, branchId, submit = 'Book', paths }: {
  visitId?: string; expectedVersion?: number; create?: Record<string, unknown>; from: string; techs: Tech[]; timezone: string; branchId?: string | null; submit?: string; paths: string[];
}) {
  const router = useRouter();
  const [slots, setSlots] = React.useState<Slot[] | null>(null);
  const [choice, setChoice] = React.useState('');
  const [tech, setTech] = React.useState('');
  const [second, setSecond] = React.useState('');
  const [error, setError] = React.useState('');
  const [done, setDone] = React.useState('');
  const [pending, start] = React.useTransition();
  const key = React.useRef<{ key: string; body: string } | null>(null);
  const names = new Map(techs.map(t => [t.id, t.name]));
  const order = (id: string) => { const i = techs.findIndex(t => t.id === id); return i < 0 ? techs.length : i; };
  const fmt = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  const day = (d: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${d}T00:00:00Z`));

  function load() {
    setError('');
    start(async () => {
      const r = await runQuery('staffVisitSlots', { from, days: 14, ...(branchId ? { branchId } : {}) });
      if (!r.ok) { setError(r.error); return; }
      setSlots(((r.data as Slot[]) ?? []).filter(s => s.technicianIds.length));
    });
  }

  const slot = slots?.find(s => `${s.date}|${s.slotIndex}` === choice);
  function book() {
    if (!slot || !tech) { setError('Pick a slot and a technician.'); return; }
    const input = { ...(visitId ? { visitId, expectedVersion } : create), date: slot.date, slotIndex: slot.slotIndex, technicianIds: [tech, ...(second && second !== tech ? [second] : [])] };
    const body = JSON.stringify(input);
    if (key.current?.body !== body) key.current = { key: `scheduleVisit:${crypto.randomUUID()}`, body };
    const k = key.current.key;
    setError(''); setDone('');
    start(async () => {
      const r = await runCommand('scheduleVisit', { input }, k, paths);
      if (!r.ok) { setError(r.error); if (/slot|CAPACITY/i.test(r.error)) load(); return; }
      key.current = null; setDone('Booked'); setSlots(null); setChoice(''); router.refresh();
    });
  }

  if (!slots) return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={load} disabled={pending} className={cn(pillClass, 'border')}>{pending ? 'Working' : `${submit}…`}</button>
      {error ? <span role="alert" className="text-xs text-red-600">{error}</span> : null}
      {done ? <span className="text-xs text-emerald-600">{done}</span> : null}
    </div>
  );
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-72">Free slot
        <select value={choice} onChange={e => { setChoice(e.target.value); setTech(''); setSecond(''); }} className={inputClass}>
          <option value="">Pick…</option>
          {slots.map(s => <option key={`${s.date}|${s.slotIndex}`} value={`${s.date}|${s.slotIndex}`}>{day(s.date)} {fmt(s.windowStart)}–{fmt(s.windowEnd)} · {s.technicianIds.length} free</option>)}
        </select>
      </label>
      {slot ? (
        <>
          <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-48">Technician
            <select value={tech} onChange={e => setTech(e.target.value)} className={inputClass}>
              <option value="">Pick…</option>
              {[...slot.technicianIds].sort((a, b) => order(a) - order(b)).map(id => <option key={id} value={id}>{names.get(id) ?? id}</option>)}
            </select>
          </label>
          <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-48">Second (optional)
            <select value={second} onChange={e => setSecond(e.target.value)} className={inputClass}>
              <option value="">None</option>
              {slot.technicianIds.filter(id => id !== tech).map(id => <option key={id} value={id}>{names.get(id) ?? id}</option>)}
            </select>
          </label>
        </>
      ) : null}
      <button type="button" onClick={book} disabled={pending} className={cn(pillClass, 'border')}>{pending ? 'Working' : submit}</button>
      <button type="button" onClick={() => setSlots(null)} className="h-8 px-2 text-sm text-muted-foreground hover:underline">Close</button>
      {!slots.length ? <span className="text-xs text-muted-foreground">No free slots in the next 14 days.</span> : null}
      {error ? <span role="alert" className="w-full break-words text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
