'use server';

import { revalidatePath } from 'next/cache';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

/** Reuse the Media upload path, but prove that this staff member can read this visit first. */
export async function attachVisitPhoto(form: FormData) {
  const visitId = String(form.get('visitId') ?? '');
  const caption = String(form.get('caption') ?? '').trim().slice(0, 200);
  const file = form.get('photo');
  if (!visitId) return { ok: false as const, error: 'Pick a visit.' };
  if (!(file instanceof File) || !file.size) return { ok: false as const, error: 'Choose a photo.' };
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return { ok: false as const, error: 'Use a JPEG, PNG or WebP photo.' };
  // Stay inside Next's default server-action request limit, including multipart overhead.
  if (file.size > 750 * 1024) return { ok: false as const, error: 'Choose a photo under 750 KB.' };
  const scope = await keystoneClient<{ visit: { id: string; technicians: { id: string }[] } | null; authenticatedItem: { id: string; role: { canManageVisits: boolean; canDoFieldWork: boolean } | null } | null }>(
    `query($id: ID!) { visit(where: { id: $id }) { id technicians { id } } authenticatedItem { ... on User { id role { canManageVisits canDoFieldWork } } } }`, { id: visitId },
  );
  if (!scope.success) return { ok: false as const, error: scope.error || 'Could not read the visit.' };
  const me = scope.data?.authenticatedItem;
  const visit = scope.data?.visit;
  if (!visit || !me || !(me.role?.canManageVisits || (me.role?.canDoFieldWork && visit.technicians.some(t => t.id === me.id)))) {
    return { ok: false as const, error: 'Only this visit’s crew or a dispatcher can attach a photo.' };
  }
  const result = await keystoneClient(`mutation($data: MediaCreateInput!) { createMedia(data: $data) { id } }`, {
    data: { kind: 'photo', caption: caption || file.name, image: { upload: file }, visit: { connect: { id: visitId } } },
  });
  if (!result.success) return { ok: false as const, error: result.error || 'Could not attach the photo.' };
  revalidatePath(`/dashboard/platform/field/${visitId}`);
  return { ok: true as const };
}
