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
