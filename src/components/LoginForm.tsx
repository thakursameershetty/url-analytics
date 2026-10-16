'use client';

import { useSearchParams } from 'next/navigation';
import { motion, useAnimationControls } from 'motion/react';
import { ArrowRight, Lock } from 'lucide-react';
import { useState } from 'react';

export default function LoginForm() {
  const next = useSearchParams().get('next');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shake = useAnimationControls();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    }).catch(() => null);
    if (res?.ok) {
      // Only follow same-site paths.
      window.location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
      return;
    }
    const body = await res?.json().catch(() => null);
    setBusy(false);
    setError(body?.error ?? 'Could not sign in');
    setPassword('');
    shake.start({ x: [0, -8, 7, -5, 3, 0], transition: { duration: 0.42 } });
  }

  return (
    <div className="mx-auto mt-16 max-w-md text-center sm:mt-24">
      <motion.span
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 22 }}
        className="mx-auto grid size-14 place-items-center rounded-full bg-[var(--field)] text-ink-2 shadow-[var(--raise)]"
      >
        <Lock className="size-6" />
      </motion.span>
      <h1 className="mt-5 text-3xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-2 text-sm text-ink-2">Enter the admin password to manage links and see analytics.</p>

      <motion.form animate={shake} onSubmit={submit} className="composer mt-8 py-1.5! pl-6!">
        <input
          type="password"
          className="composer-input"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          autoFocus
          required
          aria-label="Password"
        />
        <button type="submit" className="btn-primary h-12 px-6" disabled={busy || !password}>
          {busy ? 'Checking…' : 'Sign in'} <ArrowRight className="nudge size-4" />
        </button>
      </motion.form>
      {error && <p className="mt-3 text-sm text-critical">{error}</p>}
    </div>
  );
}
