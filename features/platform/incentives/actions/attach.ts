'use server';

import { revalidatePath } from 'next/cache';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

const MAX_BYTES = 15 * 1024 * 1024;

/**
 * P49: attach a document (signed quote, proof of producer status, land title) to an incentive application.
 * It creates a Media row linked to the application through the signed-in staff session; no status changes here.
 */
export async function attachIncentiveDocument(form: FormData) {
  const applicationId = String(form.get('applicationId') ?? '');
  const caption = String(form.get('caption') ?? '').trim().slice(0, 200);
  const file = form.get('file');
  if (!applicationId) return { ok: false as const, error: 'Pick an application.' };
  if (!(file instanceof File) || !file.size) return { ok: false as const, error: 'Choose a file to attach.' };
  if (file.size > MAX_BYTES) return { ok: false as const, error: 'The file is over 15 MB.' };
  const res = await keystoneClient(
    `mutation Attach($data: MediaCreateInput!) { createMedia(data: $data) { id } }`,
    { data: { kind: 'document', caption: caption || file.name, file: { upload: file }, incentiveApplication: { connect: { id: applicationId } } } },
  );
  if (!res.success) return { ok: false as const, error: res.error || 'Could not attach the file.' };
  revalidatePath('/dashboard/platform/incentives');
  return { ok: true as const };
}
