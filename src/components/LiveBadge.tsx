'use client';

import type { LiveStatus } from './useLive';

const LABEL: Record<LiveStatus, string> = {
  live: 'Live',
  connecting: 'Connecting…',
  offline: 'Offline',
};

/** Status pill: green pulsing dot when the live stream is connected. Always paired with a label. */
export default function LiveBadge({ status, pulse }: { status: LiveStatus; pulse?: number }) {
  const color = status === 'live' ? '#0ca30c' : status === 'offline' ? 'var(--critical)' : 'var(--muted)';
  return (
    <span
      className="inline-flex h-7 items-center gap-2 rounded-full border border-line bg-[var(--field)] px-3 text-xs font-medium text-ink-2 shadow-[var(--raise)]"
      title={status === 'live' ? 'Updates appear automatically' : undefined}
    >
      <span className="relative grid size-2 place-items-center">
        {status === 'live' && (
          // Re-keyed on every update so the ring "pings" when new data lands.
          <span key={pulse} className="live-ping absolute inset-0 rounded-full" style={{ background: color }} />
        )}
        <span className="relative size-2 rounded-full" style={{ background: color }} />
      </span>
      {LABEL[status]}
    </span>
  );
}
