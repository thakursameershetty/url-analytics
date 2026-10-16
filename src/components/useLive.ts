'use client';

import { useEffect, useRef, useState } from 'react';

export type LiveStatus = 'connecting' | 'live' | 'offline';

// Shared across hook instances so a reconnect that sees a new version still triggers a refresh.
let lastVersion: string | null = null;

/**
 * Subscribes to /api/live and calls `onChange` whenever links or visits change
 * on the server. Also refreshes when the tab becomes visible again.
 */
export function useLive(onChange: () => void): LiveStatus {
  const callback = useRef(onChange);
  const [status, setStatus] = useState<LiveStatus>('connecting');

  useEffect(() => {
    callback.current = onChange;
  });

  useEffect(() => {
    const es = new EventSource('/api/live');
    es.onopen = () => setStatus('live');
    es.onerror = () => setStatus(es.readyState === EventSource.CLOSED ? 'offline' : 'connecting');
    es.onmessage = (event) => {
      setStatus('live');
      const version = event.data as string;
      if (lastVersion !== null && version !== lastVersion) callback.current();
      lastVersion = version;
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') callback.current();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      es.close();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return status;
}
