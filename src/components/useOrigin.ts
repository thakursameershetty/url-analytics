'use client';

import { useSyncExternalStore } from 'react';

const noop = () => () => {};

/**
 * The base URL short links are served from. Set NEXT_PUBLIC_SHORT_BASE_URL when
 * the app runs behind a different public domain than the one in the address bar.
 */
export function useOrigin() {
  return useSyncExternalStore(
    noop,
    () => process.env.NEXT_PUBLIC_SHORT_BASE_URL || window.location.origin,
    () => process.env.NEXT_PUBLIC_SHORT_BASE_URL || '',
  );
}
