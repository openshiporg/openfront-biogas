'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { runCommand, runUnkeyed } from '../../actions/commands';
import { pillClass } from '../../components/ActionButton';
import { inputClass } from '../../components/CommandForm';
import { money } from '../../lib/format';

type Opt = { value: string; label: string };

/**
 * P13: an order for a walk-in or phone customer. The staff cart operations price it the same way checkout does (tax,
 * delivery fee for the address's service area, plan discount); completing it makes the order and a pay link, and the
 * payment is taken on the order page (cash, bank or mobile-money reference, or the link sent to the customer).
 */
export function StaffCart({ customers, products, branches, base }: { customers: Opt[]; products: Opt[]; branches: Opt[]; base: string }) {
  const router = useRouter();
  const [cart, setCart] = React.useState<any>(null);
  const [error, setError] = React.useState('');
  const [pending, start] = React.useTransition();
  const [customerId, setCustomerId] = React.useState('');
  const [productId, setProductId] = React.useState(products[0]?.value ?? '');
  const [qty, setQty] = React.useState('1');
  const [mode, setMode] = React.useState<'pickup' | 'delivery'>('pickup');
  const key = React.useRef<string | null>(null);

  const call = (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, then?: (d: any) => void) => {
    setError('');
    start(async () => { const r = await fn(); if (!r.ok) setError(r.error ?? 'Failed'); else (then ?? setCart)(r.data); });
  };

  if (!cart) return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-80">Customer
        <select value={customerId} onChange={e => setCustomerId(e.target.value)} className={inputClass}>
          <option value="">Walk-in, no account yet (name below)</option>
          {customers.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </label>
      <button type="button" disabled={pending} className={cn(pillClass, 'border')} onClick={() => call(() => runUnkeyed('staffStartCart', { customerId: customerId || null }))}>{pending ? 'Working' : 'Start order'}</button>
      {error ? <span role="alert" className="w-full text-xs text-red-600">{error}</span> : null}
    </div>
  );

  const cur = cart.currencyCode;
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        {cart.lines.map((l: any) => (
          <div key={l.id} className="flex flex-wrap justify-between gap-2 border-b py-2 text-sm">
            <span>{l.quantity} × {l.name}{l.available !== null && l.available < l.quantity ? <span className="text-red-600"> · only {l.available} free</span> : null}</span>
            <span className="font-mono">{money(l.totalAmount, cur)}</span>
          </div>
        ))}
        {!cart.lines.length ? <p className="text-sm text-muted-foreground">No items yet.</p> : null}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-80">Product
          <select value={productId} onChange={e => setProductId(e.target.value)} className={inputClass}>{products.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select>
        </label>
        <label className="flex w-24 flex-col gap-1 text-xs text-muted-foreground">Quantity<input value={qty} onChange={e => setQty(e.target.value)} inputMode="numeric" className={inputClass} /></label>
        <button type="button" disabled={pending || !productId} className={cn(pillClass, 'border')} onClick={() => call(() => runUnkeyed('staffAddToCart', { cartId: cart.id, productId, quantity: Math.max(1, Number(qty) || 1) }))}>Add</button>
      </div>

      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
        const input = mode === 'pickup'
          ? { fulfilment: 'pickup', pickupBranchId: f.pickupBranchId, name: f.name, phone: f.phone, email: f.email }
          : { fulfilment: 'delivery', name: f.name, phone: f.phone, email: f.email, address: { addressLine: f.addressLine, city: f.city, region: f.region, postcode: f.postcode, country: f.country } };
        call(() => runUnkeyed('staffSetCartFulfilment', { cartId: cart.id, input }));
      }}>
        <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-36">How
          <select value={mode} onChange={e => setMode(e.target.value as any)} className={inputClass}><option value="pickup">Collects</option><option value="delivery">Delivery</option></select>
        </label>
        <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-56">Name<input name="name" defaultValue={cart.name ?? ''} required className={inputClass} /></label>
        <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-40">Phone<input name="phone" type="tel" defaultValue={cart.phone ?? ''} className={inputClass} /></label>
        <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-56">Email<input name="email" type="email" defaultValue={cart.email ?? ''} className={inputClass} /></label>
        {mode === 'pickup' ? (
          <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-56">Branch<select name="pickupBranchId" className={inputClass}>{branches.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}</select></label>
        ) : (
          <>
            <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-80">Address<input name="addressLine" required defaultValue={cart.address?.addressLine ?? ''} className={inputClass} /></label>
            <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-36">City<input name="city" defaultValue={cart.address?.city ?? ''} className={inputClass} /></label>
            <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-24">State<input name="region" defaultValue={cart.address?.region ?? ''} className={inputClass} /></label>
            <label className="flex w-full flex-col gap-1 text-xs text-muted-foreground sm:w-28">Postcode<input name="postcode" required defaultValue={cart.address?.postcode ?? ''} className={inputClass} /></label>
            <input type="hidden" name="country" value="US" />
          </>
        )}
        <button type="submit" disabled={pending} className={cn(pillClass, 'border')}>Set {mode === 'pickup' ? 'collection' : 'delivery'}</button>
      </form>

      <div className="space-y-1 text-sm">
        <div className="flex justify-between"><span>Subtotal</span><span className="font-mono">{money(cart.subtotalAmount, cur)}</span></div>
        {cart.discountAmount ? <div className="flex justify-between"><span>Service plan discount</span><span className="font-mono">-{money(cart.discountAmount, cur)}</span></div> : null}
        {cart.deliveryAmount ? <div className="flex justify-between"><span>Delivery{cart.serviceArea ? ` (${cart.serviceArea.name})` : ''}</span><span className="font-mono">{money(cart.deliveryAmount, cur)}</span></div> : null}
        <div className="flex justify-between"><span>Tax</span><span className="font-mono">{money(cart.taxAmount, cur)}</span></div>
        <div className="flex justify-between font-medium"><span>Total</span><span className="font-mono">{money(cart.totalAmount, cur)}</span></div>
        <p className="text-xs text-muted-foreground">{cart.pickupBranch ? `Collects at ${cart.pickupBranch.name}` : cart.serviceArea ? `Delivery to ${cart.serviceArea.name}` : 'Set collection or delivery before placing the order.'}</p>
      </div>

      <button type="button" disabled={pending || !cart.lines.length || (!cart.pickupBranch && !cart.serviceArea)} className={cn(pillClass, 'border')} onClick={() => {
        key.current = key.current ?? `staffCompleteCart:${crypto.randomUUID()}`;
        const k = key.current;
        call(() => runCommand('staffCompleteCart', { cartId: cart.id }, k, ['/dashboard/platform/orders']), (d: any) => { router.push(`/dashboard/platform/orders/${d.orderId}`); });
      }}>{pending ? 'Working' : `Place order for ${money(cart.totalAmount, cur)}`}</button>
      {error ? <p role="alert" className="text-xs text-red-600">{error}</p> : null}
      <p className="text-xs text-muted-foreground">Next, on the order page: take cash or a reference, or send the pay link ({base || 'this site'}/pay/…).</p>
    </div>
  );
}
