'use client';

import { animate, useInView } from 'motion/react';
import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../charts/shared';

// Module-level so it's a stable reference (an inline default would restart the effect every render).
const formatInteger = (n: number) => Math.round(n).toLocaleString('en');

/** A number that counts from its previous value (0 on first view) to `value`. */
export default function CountUp({
  value,
  format = formatInteger,
  duration = 0.9,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);
  const counted = useRef(false);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    const el = ref.current;
    if (!el || !inView) return;
    if (prefersReducedMotion()) {
      el.textContent = format(value);
      from.current = value;
      return;
    }
    // A live increase gets a little "bump" so the eye catches it.
    if (counted.current && value > from.current) {
      animate(el, { scale: [1, 1.18, 1] }, { duration: 0.45, ease: 'easeOut' });
    }
    counted.current = true;
    const controls = animate(from.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (n) => {
        el.textContent = format(n);
      },
    });
    from.current = value;
    return () => controls.stop();
  }, [value, inView, duration, format]);

  return (
    <span ref={ref} className={className} style={{ display: 'inline-block', transformOrigin: 'left center' }}>
      {format(0)}
    </span>
  );
}
