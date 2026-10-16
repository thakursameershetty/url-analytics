'use client';

import * as d3 from 'd3';
import { useEffect, useRef } from 'react';
import type { CountRow } from '@/lib/types';
import { createTooltip, dur, escapeHtml, integer, pct } from './shared';

// Colour follows the entity, so "Mobile" is the same orange on every page and filter.
const DEVICE_SLOT: Record<string, number> = { Desktop: 1, Mobile: 2, Tablet: 3, Other: 4, Unknown: 4 };
export const deviceColor = (key: string) => `var(--series-${DEVICE_SLOT[key] ?? 4})`;

const SIZE = 180;

interface ArcDatum extends d3.PieArcDatum<CountRow> {
  _prev?: { startAngle: number; endAngle: number };
}

export default function DonutChart({ rows, total }: { rows: CountRow[]; total: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    const wrap = wrapRef.current;
    if (!svg || !wrap) return;

    const r = SIZE / 2;
    const arc = d3
      .arc<d3.PieArcDatum<CountRow>>()
      .innerRadius(r * 0.68)
      .outerRadius(r)
      .cornerRadius(3)
      .padAngle(rows.length > 1 ? 0.025 : 0);
    const pie = d3
      .pie<CountRow>()
      .sort(null)
      .value((d) => d.count);

    const root = d3.select(svg);
    let g = root.select<SVGGElement>('g.arcs');
    if (g.empty()) g = root.append('g').attr('class', 'arcs').attr('transform', `translate(${r},${r})`);

    const tip = createTooltip(wrap);

    g.selectAll<SVGPathElement, ArcDatum>('path')
      .data(pie(rows) as ArcDatum[], (d) => d.data.key)
      .join(
        (enter) =>
          enter
            .append('path')
            .attr('fill', (d) => deviceColor(d.data.key))
            .each(function (d) {
              (this as unknown as { _prev: ArcDatum['_prev'] })._prev = {
                startAngle: d.startAngle,
                endAngle: d.startAngle,
              };
            }),
        (update) => update,
        (exit) => exit.remove(),
      )
      .on('pointermove', (event: PointerEvent, d) => {
        const [px, py] = d3.pointer(event, wrap);
        tip.show(
          `<b>${escapeHtml(d.data.key)}</b><br/>${integer.format(d.data.count)} clicks · ${pct(d.data.count, total)}`,
          px,
          py,
        );
      })
      .on('pointerleave', () => tip.hide())
      .transition()
      .duration(dur(900))
      .ease(d3.easeCubicInOut)
      .attrTween('d', function (d) {
        const self = this as unknown as { _prev: ArcDatum['_prev'] };
        const i = d3.interpolate(self._prev ?? { startAngle: 0, endAngle: 0 }, {
          startAngle: d.startAngle,
          endAngle: d.endAngle,
        });
        self._prev = { startAngle: d.startAngle, endAngle: d.endAngle };
        return (t) => arc({ ...d, ...i(t) }) ?? '';
      });
  }, [rows, total]);

  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted">No data yet</p>;

  return (
    <div className="flex flex-col items-center gap-5">
      <div ref={wrapRef} className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg ref={svgRef} width={SIZE} height={SIZE} role="img" aria-label="Clicks by device" />
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="text-2xl font-semibold">{integer.format(total)}</div>
            <div className="text-xs text-muted">clicks</div>
          </div>
        </div>
      </div>
      <ul className="w-full space-y-2 text-sm">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: deviceColor(r.key) }} />
            <span className="text-ink">{r.key}</span>
            <span className="tabular ml-auto text-ink-2">{integer.format(r.count)}</span>
            <span className="tabular w-11 text-right text-muted">{pct(r.count, total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
