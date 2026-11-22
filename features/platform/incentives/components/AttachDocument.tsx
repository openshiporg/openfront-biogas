'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { pillClass } from '../../components/ActionButton';
import { inputClass } from '../../components/CommandForm';
import { attachIncentiveDocument } from '../actions/attach';

/** Upload one document to an incentive application; the label defaults to the document the programme asks for next. */
export function AttachDocument({ applicationId, missing }: { applicationId: string; missing: string[] }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState('');
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const target = e.currentTarget;
        const data = new FormData(target);
        setError('');
        start(async () => {
          const r = await attachIncentiveDocument(data);
          if (!r.ok) { setError(r.error); return; }
          target.reset(); router.refresh();
        });
      }}
    >
      <input type="hidden" name="applicationId" value={applicationId} />
      <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-56">
        Document
        {missing.length ? (
          <select name="caption" className={inputClass} defaultValue={missing[0]}>
            {missing.map(m => <option key={m} value={m}>{m}</option>)}
            <option value="">Other (file name)</option>
          </select>
        ) : <input name="caption" className={inputClass} placeholder="What it is" autoComplete="off" />}
      </label>
      <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-64">
        File
        <input name="file" type="file" required accept="application/pdf,image/*,.doc,.docx" className={cn(inputClass, 'py-1.5')} />
      </label>
      <button type="submit" disabled={pending} className={cn(pillClass, 'border')}>{pending ? 'Uploading' : 'Attach'}</button>
      {error ? <span role="alert" className="w-full text-xs text-red-600">{error}</span> : null}
    </form>
  );
}
