'use client';

import { useEffect, useRef, useState } from 'react';

/** Tracks an element's content width so charts can redraw responsively. */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setWidth(Math.floor(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Animation duration that collapses to 0 when the user asked for less motion. */
export function dur(ms: number) {
  return prefersReducedMotion() ? 0 : ms;
}

/** A single HTML tooltip living inside a chart's (position: relative) container. */
export function createTooltip(container: HTMLElement) {
  let el = container.querySelector<HTMLDivElement>(':scope > .chart-tooltip');
  if (!el) {
    el = document.createElement('div');
    el.className = 'chart-tooltip';
    el.setAttribute('role', 'status');
    container.appendChild(el);
  }
  const tip = el;
  return {
    show(html: string, x: number, y: number) {
      tip.innerHTML = html;
      tip.dataset.show = 'true';
      const cw = container.clientWidth;
      const tw = tip.offsetWidth;
      const th = tip.offsetHeight;
      // Prefer above-right of the pointer, flip when it would overflow.
      let left = x + 12;
      if (left + tw > cw) left = x - tw - 12;
      let top = y - th - 12;
      if (top < 0) top = y + 16;
      tip.style.left = `${Math.max(0, left)}px`;
      tip.style.top = `${top}px`;
    },
    hide() {
      tip.dataset.show = 'false';
    },
  };
}

export const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
export const integer = new Intl.NumberFormat('en');

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function pct(part: number, whole: number) {
  if (!whole) return '0%';
  const p = (part / whole) * 100;
  return `${p < 1 && p > 0 ? p.toFixed(1) : Math.round(p)}%`;
}
