'use client';

import { CommandForm } from '../../components/CommandForm';

/** Propose a change to a confirmed order: add catalogue items (bigger model, extra stove) and/or a priced line (credit for the smaller model). */
export function ChangeForm({ orderId, products, paths }: { orderId: string; products: { value: string; label: string }[]; paths: string[] }) {
  return (
    <CommandForm op="proposeOrderChange" submit="Propose change" paths={paths}
      fields={[
        { name: 'description', label: 'What changes', required: true, width: 'lg', placeholder: 'Upgrade to HomeBag 6 and add a second stove' },
        { name: 'productId', label: 'Add item', kind: 'select', width: 'lg', options: [{ value: '', label: '(none)' }, ...products] },
        { name: 'quantity', label: 'Quantity', kind: 'number', width: 'sm', defaultValue: '1' },
        { name: 'lineText', label: 'Priced line (optional)', width: 'md', placeholder: 'Credit for HomeBag 4' },
        { name: 'lineAmount', label: 'Amount (minus for a credit)', kind: 'money', width: 'sm' },
      ]}
      shape={(v) => {
        const x = v as Record<string, any>;
        return { input: {
          orderId, description: x.description,
          add: x.productId ? [{ productId: x.productId, quantity: Number(x.quantity) || 1 }] : [],
          lines: x.lineText && x.lineAmount !== '' && x.lineAmount !== undefined ? [{ description: x.lineText, amount: Number(x.lineAmount) }] : [],
        } };
      }} />
  );
}
