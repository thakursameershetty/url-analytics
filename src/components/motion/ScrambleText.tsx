'use client';

import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../charts/shared';

const GLYPHS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Text that "decodes" into place: each character cycles through random glyphs
 * and settles left-to-right. Re-runs whenever `text` changes. Writes straight
 * to the DOM so the 60fps shuffle doesn't re-render React.
 */
export default function ScrambleText({
  text,
  duration = 700,
  className,
}: {
  text: string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      // Characters lock in one by one; the rest keep shuffling.
      const locked = Math.floor(progress * text.length);
      let out = text.slice(0, locked);
      for (let i = locked; i < text.length; i++) {
        const ch = text[i];
        out += /[a-zA-Z0-9]/.test(ch) ? GLYPHS[Math.floor(Math.random() * GLYPHS.length)] : ch;
      }
      el.textContent = out;
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      el.textContent = text;
    };
  }, [text, duration]);

  return (
    <span className={className} aria-label={text}>
      <span ref={ref} aria-hidden>
        {text}
      </span>
    </span>
  );
}
