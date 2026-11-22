'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { runQuery, runUnkeyed } from '../../actions/commands';
import { inputClass } from '../../components/CommandForm';
import { pillClass } from '../../components/ActionButton';
import { money } from '../../lib/format';

const field = 'flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-36';

/** P5: size a system for the lead with the same calculator the storefront uses; the result is kept on the lead. */
export function SizeForm({ leadId, currencyCode, path }: { leadId: string; currencyCode: string; path: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState('');
  const [result, setResult] = React.useState<any>(null);
  return (
    <div className="space-y-2">
      <form className="flex flex-wrap items-end gap-2" onSubmit={e => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const v = (k: string) => String(f.get(k) ?? '').trim();
        const input: Record<string, unknown> = { interest: v('interest') || 'home' };
        for (const k of ['cattle', 'pigs', 'poultry', 'kitchenWasteKgPerDay', 'people']) if (v(k)) input[k] = Number(v(k));
        if (v('fuel')) input.monthlyFuelSpendAmount = Math.round(Number(v('fuel')) * 100);
        setError('');
        start(async () => {
          const r = await runUnkeyed('staffSizeSystem', { leadId, input }, [path]);
          if (!r.ok) { setError(r.error); return; }
          setResult(r.data); router.refresh();
        });
      }}>
        <label className={field}>Interest<select name="interest" className={inputClass}><option value="home">Home</option><option value="farm">Farm</option><option value="institution">Institution</option></select></label>
        <label className={field}>Cattle<input name="cattle" inputMode="numeric" className={inputClass} /></label>
        <label className={field}>Pigs<input name="pigs" inputMode="numeric" className={inputClass} /></label>
        <label className={field}>Poultry<input name="poultry" inputMode="numeric" className={inputClass} /></label>
        <label className={field}>Kitchen waste kg/day<input name="kitchenWasteKgPerDay" inputMode="decimal" className={inputClass} /></label>
        <label className={field}>People cooking for<input name="people" inputMode="numeric" className={inputClass} /></label>
        <label className={field}>Fuel spend / month<input name="fuel" inputMode="decimal" placeholder="65.00" className={inputClass} /></label>
        <button type="submit" disabled={pending} className={cn(pillClass, 'border')}>{pending ? 'Working' : 'Size it'}</button>
      </form>
      {error ? <p role="alert" className="text-xs text-red-600">{error}</p> : null}
      {result ? (
        <p className="text-sm">
          {result.estimatedGasM3} m³ gas a day, about {result.cookingHours} h of cooking, covers {result.coversPercent}% of their need.{' '}
          {result.recommended ? <>Recommended: <b>{result.recommended.name}</b> at {money(result.recommended.priceAmount, currencyCode)}{result.paybackMonths ? `, pays back in about ${result.paybackMonths} months` : ''}.</> : result.note}
        </p>
      ) : null}
    </div>
  );
}

/** P6: is this address in one of our service areas? */
export function AreaCheck({ postcode, region, country }: { postcode: string; region: string; country: string }) {
  const [pending, start] = React.useTransition();
  const [answer, setAnswer] = React.useState('');
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={e => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const vars = { postcode: String(f.get('postcode') ?? '').trim(), region: String(f.get('region') ?? '').trim(), country: String(f.get('country') ?? '').trim() };
      start(async () => {
        const r = await runQuery('checkServiceArea', vars);
        if (!r.ok) { setAnswer(r.error); return; }
        const d = r.data as any;
        setAnswer(d?.served ? `In area: ${d.area.name}${d.area.branch ? `, served from ${d.area.branch}` : ''}.` : 'Outside our service areas.');
      });
    }}>
      <label className={field}>Postcode<input name="postcode" defaultValue={postcode} className={inputClass} /></label>
      <label className={field}>Region<input name="region" defaultValue={region} className={inputClass} /></label>
      <label className={field}>Country<input name="country" defaultValue={country} className={inputClass} /></label>
      <button type="submit" disabled={pending} className={cn(pillClass, 'border')}>{pending ? 'Checking' : 'Check area'}</button>
      {answer ? <span className="w-full text-sm">{answer}</span> : null}
    </form>
  );
}
