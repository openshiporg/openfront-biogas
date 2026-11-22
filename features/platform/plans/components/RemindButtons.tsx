'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { runCommand } from '../../actions/commands';
import { pillClass } from '../../components/ActionButton';

/** One tap: open WhatsApp, SMS or a call with the reminder written, and log the contact on the instalment. */
export function RemindButtons({ installmentId, customerId, links, path }: {
  installmentId: string; customerId: string | null; path: string;
  links: { whatsapp?: string | null; sms?: string | null; call?: string | null };
}) {
  const router = useRouter();
  const [error, setError] = React.useState('');
  const [done, setDone] = React.useState('');
  function log(channel: string) {
    setError('');
    const key = `logContact:${crypto.randomUUID()}`;
    void runCommand('logContact', { input: { customerId, channel, purpose: 'payment_reminder', relatedType: 'Installment', relatedId: installmentId } }, key, [path]).then(r => {
      if (!r.ok) { setError(r.error); return; }
      setDone(`Reminded by ${channel === 'whatsapp' ? 'WhatsApp' : channel === 'sms' ? 'SMS' : 'phone'}`); router.refresh();
    });
  }
  const btn = (channel: string, href: string | null | undefined, text: string) => href
    ? <a href={href} target={channel === 'call' ? undefined : '_blank'} rel="noreferrer" onClick={() => log(channel)} className={cn(pillClass, 'border')}>{text}</a>
    : null;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {btn('whatsapp', links.whatsapp, 'WhatsApp')}
      {btn('sms', links.sms, 'SMS')}
      {btn('call', links.call, 'Call')}
      {done ? <span className="text-xs text-emerald-600">{done}</span> : null}
      {error ? <span role="alert" className="text-xs text-red-600">{error}</span> : null}
    </span>
  );
}
