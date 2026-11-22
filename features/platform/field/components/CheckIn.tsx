'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { runCommand } from '../../actions/commands';
import { pillClass } from '../../components/ActionButton';

/** P25 check in: takes the phone's location when allowed; without it the check-in is still recorded. */
export function CheckIn({ visitId, version, path }: { visitId: string; version: number; path: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState('');
  const key = React.useRef(`checkInVisit:${crypto.randomUUID()}`);
  function go(lat?: number, lng?: number) {
    start(async () => {
      const r = await runCommand('checkInVisit', { visitId, expectedVersion: version, ...(lat !== undefined ? { lat: lat.toFixed(6), lng: lng!.toFixed(6) } : {}) }, key.current, [path, '/dashboard/platform/field']);
      if (!r.ok) { setError(r.error); return; }
      key.current = `checkInVisit:${crypto.randomUUID()}`; router.refresh();
    });
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" disabled={pending} className={cn(pillClass, 'h-10 border bg-foreground text-background')} onClick={() => {
        setError('');
        if (!('geolocation' in navigator)) return go();
        navigator.geolocation.getCurrentPosition(p => go(p.coords.latitude, p.coords.longitude), () => go(), { timeout: 8000, maximumAge: 60000 });
      }}>{pending ? 'Working' : 'Check in'}</button>
      {error ? <span role="alert" className="text-xs text-red-600">{error}</span> : null}
    </span>
  );
}
