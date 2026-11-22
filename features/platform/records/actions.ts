'use server';

import { revalidatePath } from 'next/cache';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

type Kind = 'text' | 'int' | 'money' | 'bool' | 'decimal' | 'json' | 'date' | 'relation' | 'relations';

/**
 * Plain records the dashboard edits directly (suppliers, products, settings, content). None of these is a status: status
 * changes always go through the named staff operations in actions/commands.ts. Each list names the fields a screen may
 * write and how a form value turns into a GraphQL value; Keystone's list access rules still decide who may write.
 */
const LISTS: Record<string, { create: string; update: string; input: string; fields: Record<string, Kind> }> = {
  Product: { create: 'createProduct', update: 'updateProduct', input: 'Product', fields: {
    name: 'text', slug: 'text', sku: 'text', type: 'text', description: 'text', imageUrl: 'text', priceAmount: 'money', compareAtAmount: 'money', taxable: 'bool',
    isPublished: 'bool', isSerialized: 'bool', sellOnline: 'bool', requiresInstallation: 'bool', requiresSurvey: 'bool', installFeeAmount: 'money',
    weightKg: 'decimal', warrantyMonths: 'int', unitCostAmount: 'money', category: 'relation', compatibleWith: 'relations',
  } },
  DigesterSpec: { create: 'createDigesterSpec', update: 'updateDigesterSpec', input: 'DigesterSpec', fields: {
    product: 'relation', capacityM3: 'decimal', technology: 'text', feedstockTypes: 'json', minDailyFeedKg: 'decimal', maxDailyFeedKg: 'decimal', dailyGasM3: 'decimal',
    cookingHoursPerDay: 'decimal', servesPeople: 'int', footprintLengthM: 'decimal', footprintWidthM: 'decimal', waterPerDayL: 'decimal',
    reactorWarrantyMonths: 'int', partsWarrantyMonths: 'int', installHours: 'decimal', surveyKind: 'text', isPublished: 'bool',
  } },
  KitComponent: { create: 'createKitComponent', update: 'updateKitComponent', input: 'KitComponent', fields: { kit: 'relation', component: 'relation', quantity: 'int', isPublished: 'bool' } },
  Supplier: { create: 'createSupplier', update: 'updateSupplier', input: 'Supplier', fields: { name: 'text', contact: 'text', phone: 'text', email: 'text', country: 'text', leadTimeDays: 'int' } },
};

function value(kind: Kind, raw: unknown): unknown {
  if (raw === undefined) return undefined;
  const s = typeof raw === 'string' ? raw.trim() : raw;
  switch (kind) {
    case 'text': return String(s ?? '');
    case 'int': return s === '' || s === null ? null : Math.trunc(Number(s));
    case 'money': return s === '' || s === null ? null : Number(s);
    case 'bool': return s === true || s === 'true' || s === 'on' || s === 'yes';
    case 'decimal': return s === '' || s === null ? null : String(s);
    case 'json': return typeof s === 'string' ? (s ? JSON.parse(s) : null) : s;
    case 'date': return s ? new Date(String(s)).toISOString() : null;
    case 'relation': return s ? { connect: { id: String(s) } } : undefined;
    case 'relations': return { set: (Array.isArray(s) ? s : String(s ?? '').split(',')).map(x => String(x).trim()).filter(Boolean).map(id => ({ id })) };
  }
}

/** Remove one plain record the list allows deleting (a kit line). */
const DELETABLE: Record<string, string> = { KitComponent: 'deleteKitComponent' };
export async function deleteRecord(list: string, id: string, paths: string[] = []) {
  const op = DELETABLE[list];
  if (!op) return { ok: false as const, error: 'This record is not removed here.' };
  const res = await keystoneClient(`mutation Del($id: ID!) { ${op}(where: { id: $id }) { id } }`, { id });
  if (!res.success) return { ok: false as const, error: res.error || 'Could not remove.' };
  for (const p of paths) revalidatePath(p);
  return { ok: true as const };
}

/** Upload a product photo (Product.image). */
export async function uploadProductImage(form: FormData) {
  const id = String(form.get('productId') ?? '');
  const file = form.get('file');
  if (!id || !(file instanceof File) || !file.size) return { ok: false as const, error: 'Choose a photo.' };
  if (file.size > 10 * 1024 * 1024) return { ok: false as const, error: 'The photo is over 10 MB.' };
  const res = await keystoneClient(`mutation Img($id: ID!, $data: ProductUpdateInput!) { updateProduct(where: { id: $id }, data: $data) { id } }`, { id, data: { image: { upload: file } } });
  if (!res.success) return { ok: false as const, error: res.error || 'Could not upload.' };
  revalidatePath('/dashboard/platform/catalogue');
  return { ok: true as const };
}

export async function saveRecord(list: string, id: string | null, data: Record<string, unknown>, paths: string[] = []) {
  const spec = LISTS[list];
  if (!spec) return { ok: false as const, error: 'Unknown record' };
  const out: Record<string, unknown> = {};
  try {
    for (const [k, v] of Object.entries(data)) {
      const kind = spec.fields[k];
      if (!kind) continue;
      const val = value(kind, v);
      if (val === undefined) continue;
      if (kind === 'int' && val !== null && !Number.isFinite(val as number)) return { ok: false as const, error: `${k}: enter a whole number.` };
      out[k] = val;
    }
  } catch {
    return { ok: false as const, error: 'A field has the wrong format.' };
  }
  const res = id
    ? await keystoneClient(`mutation Save($id: ID!, $data: ${spec.input}UpdateInput!) { r: ${spec.update}(where: { id: $id }, data: $data) { id } }`, { id, data: out })
    : await keystoneClient(`mutation Save($data: ${spec.input}CreateInput!) { r: ${spec.create}(data: $data) { id } }`, { data: out });
  if (!res.success) return { ok: false as const, error: res.error || 'Could not save.' };
  for (const p of paths) revalidatePath(p);
  return { ok: true as const, id: (res.data as any)?.r?.id as string };
}
