'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';

const LINKS = [
  ['/', 'Links'],
  ['/analytics', 'Analytics'],
  ['/heatmaps', 'Heatmaps'],
  ['/sites', 'Sites'],
] as const;

export default function NavLinks({ showSignOut }: { showSignOut: boolean }) {
  const pathname = usePathname();
  if (pathname === '/login') return null;
  return (
    <div className="flex items-center gap-1 text-sm">
      {LINKS.map(([href, label]) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`rounded-full px-3.5 py-1.5 transition hover:bg-surface-2 hover:text-ink ${active ? 'bg-surface-2 text-ink' : 'text-ink-2'}`}
          >
            {label}
          </Link>
        );
      })}
      {showSignOut && (
        <button
          type="button"
          className="btn-ghost ml-1"
          aria-label="Sign out"
          title="Sign out"
          onClick={async () => {
            await fetch('/api/auth/logout', { method: 'POST' });
            // Full reload on purpose: drops any dashboard data held in the client router cache.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.href = '/login';
          }}
        >
          <LogOut className="size-4" />
        </button>
      )}
    </div>
  );
}
