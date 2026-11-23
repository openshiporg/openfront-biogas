'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { attachVisitPhoto } from '../actions/photos';
import { inputClass } from '../../components/CommandForm';

/** Resize camera images before sending them through the same Media path used by documents. */
async function cameraPhoto(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not prepare this photo.');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not prepare this photo.')), 'image/jpeg', 0.75));
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } finally { bitmap.close(); }
}

export function VisitPhotos({ visitId }: { visitId: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState('');
  return <form className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end" onSubmit={event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setError('');
    start(async () => {
      try {
        const file = data.get('photo');
        if (!(file instanceof File) || !file.size) throw new Error('Choose a photo.');
        if (file.size > 25 * 1024 * 1024) throw new Error('Choose a photo under 25 MB.');
        data.set('photo', await cameraPhoto(file));
        const result = await attachVisitPhoto(data);
        if (!result.ok) { setError(result.error); return; }
        form.reset(); router.refresh();
      } catch (e) { setError(e instanceof Error ? e.message : 'Could not upload the photo.'); }
    });
  }}>
    <input type="hidden" name="visitId" value={visitId} />
    <label className="flex flex-col gap-1 text-xs">What the photo shows<input name="caption" className={inputClass} maxLength={200} /></label>
    <label className="flex min-w-0 flex-col gap-1 text-xs">Photo<input type="file" name="photo" accept="image/jpeg,image/png,image/webp" capture="environment" required className="max-w-full text-sm" /></label>
    <button type="submit" disabled={pending} className="h-10 rounded-md border px-3 text-sm disabled:opacity-50">{pending ? 'Uploading…' : 'Attach photo'}</button>
    {error ? <p role="alert" className="w-full text-sm text-red-600">{error}</p> : null}
  </form>;
}
