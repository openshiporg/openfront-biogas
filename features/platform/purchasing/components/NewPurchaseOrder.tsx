'use client';

import { CommandForm, type FormField } from '../../components/CommandForm';

const LINES = 5;

/** Draft a purchase order: supplier, where it is delivered, up to five lines at the supplier's unit cost. */
export function NewPurchaseOrder({ suppliers, locations, products, path }: {
  suppliers: { value: string; label: string }[]; locations: { value: string; label: string }[]; products: { value: string; label: string }[]; path: string;
}) {
  const fields: FormField[] = [
    { name: 'supplierId', label: 'Supplier', kind: 'select', width: 'md', options: suppliers, required: true },
    { name: 'locationId', label: 'Deliver to', kind: 'select', width: 'md', options: locations, required: true },
    { name: 'expectedAt', label: 'Expected', kind: 'date', width: 'sm' },
    { name: 'notes', label: 'Note to the supplier', width: 'lg' },
  ];
  for (let i = 0; i < LINES; i += 1) {
    fields.push(
      { name: `lines.${i}.productId`, label: `Line ${i + 1}`, kind: 'select', width: 'lg', options: [{ value: '', label: i ? '(none)' : 'Pick a product' }, ...products] },
      { name: `lines.${i}.quantity`, label: 'Quantity', kind: 'number', width: 'sm' },
      { name: `lines.${i}.unitCostAmount`, label: 'Unit cost', kind: 'money', width: 'sm' },
    );
  }
  return (
    <CommandForm op="savePurchaseOrder" submit="Save draft" paths={[path]} fields={fields}
      shape={(v) => {
        const values = v as Record<string, unknown>;
        const lines = Array.from({ length: LINES }, (_, i) => ({ productId: values[`lines.${i}.productId`], quantity: values[`lines.${i}.quantity`], unitCostAmount: values[`lines.${i}.unitCostAmount`] ?? 0 }))
          .filter(l => l.productId && l.quantity);
        return { input: { supplierId: values.supplierId, locationId: values.locationId, expectedAt: values.expectedAt || null, notes: values.notes, lines } };
      }} />
  );
}
