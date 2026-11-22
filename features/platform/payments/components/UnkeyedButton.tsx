'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { runUnkeyed } from '../../actions/commands';
import { pillClass } from '../../components/ActionButton';

/** Runs a read-back operation that is safe to repeat (no idempotency key needed) and shows what it found. */
export function UnkeyedButton({ op, vars, children, paths }: { op: string; vars: Record<string, unknown>; children: React.ReactNode; paths?: string[] }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" disabled={pending} className={cn(pillClass, 'border')} onClick={() => {
        setMsg(null);
        start(async () => {
          const r = await runUnkeyed(op, vars, paths);
          if (!r.ok) setMsg({ ok: false, text: r.error });
          else { const s = (r.data as any)?.status; setMsg({ ok: true, text: s ? `Stripe says: ${String(s).replace(/_/g, ' ')}` : 'Read' }); router.refresh(); }
        });
      }}>{pending ? 'Reading' : children}</button>
      {msg ? <span role={msg.ok ? undefined : 'alert'} className={cn('text-xs', msg.ok ? 'text-emerald-600' : 'text-red-600')}>{msg.text}</span> : null}
    </span>
  );
}
