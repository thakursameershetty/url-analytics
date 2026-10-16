'use client';

import * as d3 from 'd3';
import { useEffect, useMemo, useRef } from 'react';
import type { VisitEvent } from '@/lib/types';
import { createTooltip, dur, integer, useWidth } from './shared';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const STEPS = ['--seq-1', '--seq-2', '--seq-3', '--seq-4', '--seq-5', '--seq-6'];

/** Weekday × hour-of-day grid in the viewer's local time. Sequential, one hue. */
export default function Heatmap({ events }: { events: VisitEvent[] }) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  // Intro animation plays on first draw only; live data updates redraw instantly.
  const intro = useRef(true);

  const cells = useMemo(() => {
    const grid = Array.from({ length: 7 * 24 }, (_, i) => ({ day: Math.floor(i / 24), hour: i % 24, count: 0 }));
    for (const [ts] of events) {
      const d = new Date(ts);
      const day = (d.getDay() + 6) % 7; // Monday first
      grid[day * 24 + d.getHours()].count += 1;
    }
    return grid;
  }, [events]);

  const left = 34;
  const top = 18;
  const cell = width ? Math.max(8, Math.floor((width - left) / 24)) : 0;
  const height = top + cell * 7 + 2;

  useEffect(() => {
    const svg = svgRef.current;
    const wrap = wrapRef.current;
    if (!svg || !wrap || cell === 0) return;
    const t = (ms: number) => (intro.current ? dur(ms) : 0);

    const max = d3.max(cells, (c) => c.count) ?? 0;
    const color = d3
      .scaleQuantize<string>()
      .domain([1, Math.max(2, max)])
      .range(STEPS.map((s) => `var(${s})`));

    const root = d3.select(svg).attr('width', width).attr('height', height);
    root.selectAll('*').remove();

    root
      .append('g')
      .selectAll('text')
      .data(DAYS)
      .join('text')
      .attr('x', 0)
      .attr('y', (_d, i) => top + i * cell + cell / 2 + 4)
      .attr('font-size', 11)
      .attr('fill', 'var(--muted)')
      .text((d) => d);

    root
      .append('g')
      .selectAll('text')
      .data([0, 6, 12, 18])
      .join('text')
      .attr('x', (h) => left + h * cell)
      .attr('y', 11)
      .attr('font-size', 11)
      .attr('fill', 'var(--muted)')
      .text((h) => (h === 0 ? '12a' : h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`));

    const tip = createTooltip(wrap);
    const gap = cell > 14 ? 2 : 1;

    root
      .append('g')
      .selectAll('rect')
      .data(cells)
      .join('rect')
      .attr('x', (c) => left + c.hour * cell)
      .attr('y', (c) => top + c.day * cell)
      .attr('width', cell - gap)
      .attr('height', cell - gap)
      .attr('rx', Math.min(4, cell / 4))
      .attr('fill', (c) => (c.count === 0 ? 'var(--seq-0)' : color(c.count)))
      .attr('opacity', 0)
      .on('pointermove', (event: PointerEvent, c) => {
        const [px, py] = d3.pointer(event, wrap);
        const h12 = c.hour % 12 === 0 ? 12 : c.hour % 12;
        tip.show(
          `<b>${DAYS[c.day]} ${h12}:00 ${c.hour < 12 ? 'AM' : 'PM'}</b><br/>${integer.format(c.count)} clicks`,
          px,
          py,
        );
      })
      .on('pointerleave', () => tip.hide())
      .transition()
      // Sweep diagonally from the top-left corner.
      .delay((c) => t((c.hour + c.day) * 22))
      .duration(t(400))
      .attr('opacity', 1);
    intro.current = false;
  }, [cells, width, height, cell, wrapRef]);

  return (
    <div>
      <div ref={wrapRef} className="relative w-full" style={{ height: height || 160 }}>
        <svg ref={svgRef} role="img" aria-label="Clicks by weekday and hour" className="block" />
      </div>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-muted">
        Fewer
        {['--seq-0', ...STEPS].map((s) => (
          <span key={s} className="size-2.5 rounded-sm" style={{ background: `var(${s})` }} />
        ))}
        More
      </div>
    </div>
  );
}
