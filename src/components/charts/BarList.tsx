'use client';

import * as d3 from 'd3';
import { useEffect, useMemo, useRef } from 'react';
import type { CountRow } from '@/lib/types';
import { createTooltip, dur, escapeHtml, integer, pct, useWidth } from './shared';

interface Props {
  rows: CountRow[];
  total: number;
  limit?: number;
  /** Optional per-row prefix (flag emoji, favicon…), rendered as text. */
  prefix?: (row: CountRow) => string;
  label?: string;
}

const ROW_H = 30;
const BAR_H = 8;

/**
 * Horizontal bars with labels above each bar. Single series, so every bar is
 * slot 1 — length carries the value, not colour.
 */
export default function BarList({ rows, total, limit = 7, prefix, label = 'Clicks' }: Props) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);

  // Fold the tail into "Other" rather than listing everything.
  const data = useMemo(() => {
    const shown = rows.slice(0, limit);
    const rest = rows.slice(limit).reduce((s, r) => s + r.count, 0);
    return rest > 0 ? [...shown, { key: 'Other', count: rest }] : shown;
  }, [rows, limit]);
  const height = Math.max(1, data.length) * (ROW_H + 10);

  useEffect(() => {
    const svg = svgRef.current;
    const wrap = wrapRef.current;
    if (!svg || !wrap || width === 0) return;

    const x = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => d.count) ?? 1])
      .range([0, width]);

    const root = d3.select(svg).attr('width', width).attr('height', height);
    const tip = createTooltip(wrap);

    const rowsSel = root
      .selectAll<SVGGElement, CountRow>('g.row')
      .data(data, (d) => d.key)
      .join(
        (enter) => {
          const r = enter.append('g').attr('class', 'row');
          r.append('text').attr('class', 'lbl').attr('y', 12).attr('font-size', 13).attr('fill', 'var(--ink)');
          r.append('text')
            .attr('class', 'val tabular')
            .attr('y', 12)
            .attr('text-anchor', 'end')
            .attr('font-size', 12)
            .attr('fill', 'var(--ink-2)');
          r.append('rect')
            .attr('class', 'track')
            .attr('y', 20)
            .attr('height', BAR_H)
            .attr('rx', 4)
            .attr('fill', 'var(--surface-2)');
          r.append('rect')
            .attr('class', 'bar')
            .attr('y', 20)
            .attr('height', BAR_H)
            .attr('rx', 4)
            .attr('width', 0)
            .attr('fill', 'var(--series-1)');
          r.append('rect').attr('class', 'hit').attr('height', ROW_H + 8).attr('y', -2).attr('fill', 'transparent');
          return r;
        },
        (update) => update,
        (exit) => exit.transition().duration(dur(200)).style('opacity', 0).remove(),
      );

    rowsSel
      .transition()
      .duration(dur(500))
      .attr('transform', (_d, i) => `translate(0,${i * (ROW_H + 10)})`);

    rowsSel
      .select<SVGTextElement>('text.lbl')
      .text((d) => `${prefix ? prefix(d) + '  ' : ''}${d.key}`);
    rowsSel
      .select<SVGTextElement>('text.val')
      .attr('x', width)
      .text((d) => `${integer.format(d.count)} · ${pct(d.count, total)}`);
    rowsSel.select('rect.track').attr('width', width);
    rowsSel.select('rect.hit').attr('width', width);
    rowsSel
      .select('rect.bar')
      .transition()
      .delay((_d, i) => dur(i * 60))
      .duration(dur(800))
      .ease(d3.easeCubicOut)
      .attr('width', (d) => Math.max(BAR_H, x(d.count)));

    rowsSel
      .on('pointermove', (event: PointerEvent, d) => {
        const [px, py] = d3.pointer(event, wrap);
        tip.show(
          `<b>${escapeHtml(d.key)}</b><br/>${label}: ${integer.format(d.count)}<br/><span style="color:var(--muted)">${pct(d.count, total)} of total</span>`,
          px,
          py,
        );
        d3.select(event.currentTarget as SVGGElement).select('rect.bar').attr('fill-opacity', 0.8);
      })
      .on('pointerleave', (event: PointerEvent) => {
        tip.hide();
        d3.select(event.currentTarget as SVGGElement).select('rect.bar').attr('fill-opacity', 1);
      });
  }, [data, width, height, total, prefix, label, wrapRef]);

  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted">No data yet</p>;
  }

  return (
    <div ref={wrapRef} className="relative w-full" style={{ height }}>
      <svg ref={svgRef} role="img" aria-label={data.map((d) => `${d.key}: ${d.count}`).join(', ')} className="block overflow-visible" />
    </div>
  );
}
