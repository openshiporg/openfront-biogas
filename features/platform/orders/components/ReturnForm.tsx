'use client';

import { CommandForm, rowValues } from '../../components/CommandForm';

/** Take delivered parts back into a stock location and refund them (returnOrderLines). */
export function ReturnForm({ orderId, lines, locations, paths }: { orderId: string; lines: { id: string; name: string; left: number }[]; locations: { value: string; label: string }[]; paths: string[] }) {
  return (
    <CommandForm op="returnOrderLines" submit="Take back and refund" paths={paths}
      fields={[
        ...lines.flatMap((l, i) => [
          { name: `lines.${i}.orderLineId`, label: '', kind: 'hidden' as const, defaultValue: l.id },
          { name: `lines.${i}.quantity`, label: `${l.name} (up to ${l.left})`, kind: 'number' as const, width: 'md' as const },
        ]),
        { name: 'locationId', label: 'Back into', kind: 'select', width: 'md', options: locations },
        { name: 'reason', label: 'Reason', required: true, width: 'lg' },
        { name: 'payoutReference', label: 'Payout reference (cash or bank)', width: 'md' },
      ]}
      shape={(v) => {
        const x = v as Record<string, any>;
        const picked = rowValues({ lines: { count: lines.length, fields: ['orderLineId', 'quantity'], requires: 'quantity' } }, Object.fromEntries(Object.entries(x).map(([k, val]) => [k, String(val ?? '')])));
        return { input: { orderId, locationId: x.locationId, reason: x.reason, payoutReference: x.payoutReference || undefined, lines: picked.lines.map(r => ({ orderLineId: r.orderLineId, quantity: Number(r.quantity) })) } };
      }} />
  );
}
