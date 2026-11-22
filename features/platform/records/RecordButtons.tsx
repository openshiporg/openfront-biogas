'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { pillClass } from '../components/ActionButton';
import { inputClass } from '../components/CommandForm';
import { deleteRecord, saveRecord, uploadProductImage } from './actions';

/** One-tap save of fixed values on a plain record (publish, unpublish). */
export function SaveButton({ list, id, data, children, paths, confirm }: { list: string; id: string | null; data: Record<string, unknown>; children: React.ReactNode; paths?: string[]; confirm?: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState('');
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" disabled={pending} className={cn(pillClass, 'border')} onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        setError('');
        start(async () => { const r = await saveRecord(list, id, data, paths); if (!r.ok) setError(r.error); else router.refresh(); });
      }}>{pending ? 'Working' : children}</button>
      {error ? <span role="alert" className="text-xs text-red-600">{error}</span> : null}
    </span>
  );
}

export function RemoveButton({ list, id, children, paths }: { list: string; id: string; children: React.ReactNode; paths?: string[] }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState('');
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" disabled={pending} className="text-xs text-muted-foreground underline" onClick={() => {
        setError('');
        start(async () => { const r = await deleteRecord(list, id, paths); if (!r.ok) setError(r.error); else router.refresh(); });
      }}>{pending ? 'Removing' : children}</button>
      {error ? <span role="alert" className="text-xs text-red-600">{error}</span> : null}
    </span>
  );
}

export function ProductImageUpload({ productId }: { productId: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState('');
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
      e.preventDefault();
      const target = e.currentTarget;
      const data = new FormData(target);
      setError('');
      start(async () => { const r = await uploadProductImage(data); if (!r.ok) setError(r.error); else { target.reset(); router.refresh(); } });
    }}>
      <input type="hidden" name="productId" value={productId} />
      <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-64">Photo<input name="file" type="file" accept="image/*" required className={cn(inputClass, 'py-1.5')} /></label>
      <button type="submit" disabled={pending} className={cn(pillClass, 'border')}>{pending ? 'Uploading' : 'Upload photo'}</button>
      {error ? <span role="alert" className="w-full text-xs text-red-600">{error}</span> : null}
    </form>
  );
}
