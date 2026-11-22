'use client';

import { CommandForm, type FormField } from '../../components/CommandForm';

/** One fulfilment step that needs typing: serial numbers on pick, carrier and tracking on ship. */
export function FulfilStep({ orderId, version, step, submit, fields, paths }: { orderId: string; version: number; step: string; submit: string; fields: FormField[]; paths: string[] }) {
  return (
    <CommandForm op="fulfilOrder" submit={submit} fields={fields} paths={paths}
      shape={v => ({ input: {
        orderId, step, expectedVersion: version,
        ...(v.serials ? { serialNumbers: v.serials.split(/[\s,]+/).filter(Boolean) } : {}),
        ...(v.carrier ? { carrier: v.carrier } : {}), ...(v.trackingNumber ? { trackingNumber: v.trackingNumber } : {}),
      } })} />
  );
}
