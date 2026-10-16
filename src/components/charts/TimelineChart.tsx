'use client';

import * as d3 from 'd3';
import { useEffect, useId, useMemo, useRef } from 'react';
import type { VisitEvent } from '@/lib/types';
import { createTooltip, dur, escapeHtml, integer, useWidth } from './shared';

export interface TimelineSeries {
  /** Index into the stats response's `links` array (the 3rd element of each event). */
  index: number;
  label: string;
  color: string;
}

interface Props {
  events: VisitEvent[];
  start: Date;
  end: Date;
  hourly: boolean;
  /** Two or more series switch the chart to "compare" mode: one line per link. */
  series?: TimelineSeries[];
  height?: number;
}

interface Bucket {
  t: Date;
  all: number;
  qr: number;
  by: Map<number, number>;
}

interface LineSpec {
  label: string;
  color: string;
  get: (b: Bucket) => number;
  area: boolean;
}

export default function TimelineChart({ events, start, end, hourly, series, height = 260 }: Props) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  // Intro animation plays on first draw only; live data updates redraw instantly.
  const intro = useRef(true);
  const clipId = `clip${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const seriesKey = JSON.stringify(series ?? []);

  // Bucket in the viewer's local timezone so "Tuesday" means their Tuesday.
  const buckets = useMemo<Bucket[]>(() => {
    const interval = hourly ? d3.timeHour : d3.timeDay;
    const ticks = interval.range(interval.floor(start), interval.offset(interval.floor(end), 1));
    const byKey = new Map<number, Bucket>(ticks.map((t) => [+t, { t, all: 0, qr: 0, by: new Map() }]));
    for (const [ts, qr, linkIndex] of events) {
      const b = byKey.get(+interval.floor(new Date(ts)));
      if (!b) continue;
      b.all += 1;
      if (qr) b.qr += 1;
      b.by.set(linkIndex, (b.by.get(linkIndex) ?? 0) + 1);
    }
    return [...byKey.values()];
  }, [events, start, end, hourly]);

  const lines = useMemo<LineSpec[]>(() => {
    const parsed: TimelineSeries[] = JSON.parse(seriesKey);
    if (parsed.length > 1) {
      return parsed.map((sr) => ({ label: sr.label, color: sr.color, get: (b: Bucket) => b.by.get(sr.index) ?? 0, area: false }));
    }
    return [
      { label: 'All clicks', color: 'var(--series-1)', get: (b: Bucket) => b.all, area: true },
      { label: 'QR scans', color: 'var(--series-2)', get: (b: Bucket) => b.qr, area: false },
    ];
  }, [seriesKey]);

  useEffect(() => {
    const svg = svgRef.current;
    const wrap = wrapRef.current;
    if (!svg || !wrap || width === 0 || buckets.length === 0) return;
    const t = (ms: number) => (intro.current ? dur(ms) : 0);

    const m = { top: 12, right: 16, bottom: 28, left: 40 };
    const iw = width - m.left - m.right;
    const ih = height - m.top - m.bottom;

    const x = d3
      .scaleTime()
      .domain([buckets[0].t, buckets[buckets.length - 1].t])
      .range([0, iw]);
    const yMax = d3.max(lines, (l) => d3.max(buckets, l.get)) ?? 0;
    const y = d3
      .scaleLinear()
      .domain([0, Math.max(4, yMax)])
      .nice()
      .range([ih, 0]);

    const root = d3.select(svg).attr('width', width).attr('height', height);
    root.selectAll('*').remove();

    root
      .append('defs')
      .append('clipPath')
      .attr('id', clipId)
      .append('rect')
      .attr('x', 0)
      .attr('y', -4)
      .attr('height', ih + 8)
      .attr('width', 0)
      .transition()
      .duration(t(1100))
      .ease(d3.easeCubicOut)
      .attr('width', iw + 8);

    const g = root.append('g').attr('transform', `translate(${m.left},${m.top})`);

    g.append('g')
      .attr('class', 'chart-grid')
      .call(d3.axisLeft(y).ticks(4).tickSize(-iw).tickFormat(() => ''));

    const xTicks = Math.max(2, Math.min(8, Math.floor(iw / 90)));
    g.append('g')
      .attr('class', 'chart-axis')
      .attr('transform', `translate(0,${ih})`)
      .call(
        d3
          .axisBottom<Date>(x)
          .ticks(xTicks)
          .tickSizeOuter(0)
          .tickFormat(hourly ? d3.timeFormat('%-I %p') : d3.timeFormat('%b %-d')),
      );

    g.append('g')
      .attr('class', 'chart-axis')
      .call(d3.axisLeft(y).ticks(4).tickSize(0).tickPadding(8).tickFormat(d3.format('~s')))
      .call((a) => a.select('.domain').remove());

    const curve = d3.curveMonotoneX;
    const plot = g.append('g').attr('clip-path', `url(#${clipId})`);

    for (const l of lines.filter((l) => l.area)) {
      plot
        .append('path')
        .datum(buckets)
        .attr('fill', l.color)
        .attr('fill-opacity', 0.1)
        .attr(
          'd',
          d3
            .area<Bucket>()
            .x((d) => x(d.t))
            .y0(ih)
            .y1((d) => y(l.get(d)))
            .curve(curve),
        );
    }

    // Draw in reverse so the first series sits on top.
    for (const l of [...lines].reverse()) {
      plot
        .append('path')
        .datum(buckets)
        .attr('fill', 'none')
        .attr('stroke', l.color)
        .attr('stroke-width', 2)
        .attr('stroke-linejoin', 'round')
        .attr('stroke-linecap', 'round')
        .attr(
          'd',
          d3
            .line<Bucket>()
            .x((d) => x(d.t))
            .y((d) => y(l.get(d)))
            .curve(curve),
        );
    }

    // End markers: the headline series normally, every series when comparing.
    const last = buckets[buckets.length - 1];
    const compare = lines.length > 2 || !lines[0].area;
    for (const l of compare ? lines : lines.slice(0, 1)) {
      g.append('circle')
        .attr('cx', x(last.t))
        .attr('cy', y(l.get(last)))
        .attr('r', 0)
        .attr('fill', l.color)
        .attr('stroke', 'var(--surface)')
        .attr('stroke-width', 2)
        .transition()
        .delay(t(1000))
        .duration(t(250))
        .attr('r', 4);
    }

    // Crosshair + tooltip.
    const tip = createTooltip(wrap);
    const hover = g.append('g').style('display', 'none');
    hover
      .append('line')
      .attr('y1', 0)
      .attr('y2', ih)
      .attr('stroke', 'var(--axis)')
      .attr('stroke-width', 1);
    const dots = lines.map((l) =>
      hover
        .append('circle')
        .attr('r', 4)
        .attr('fill', l.color)
        .attr('stroke', 'var(--surface)')
        .attr('stroke-width', 2),
    );

    const fmt = hourly ? d3.timeFormat('%a %b %-d, %-I %p') : d3.timeFormat('%a, %b %-d %Y');
    const bisect = d3.bisector<Bucket, Date>((d) => d.t).center;

    g.append('rect')
      .attr('width', iw)
      .attr('height', ih)
      .attr('fill', 'transparent')
      .on('pointermove', (event: PointerEvent) => {
        const [mx] = d3.pointer(event);
        const d = buckets[bisect(buckets, x.invert(mx))];
        const cx = x(d.t);
        hover.style('display', null);
        hover.select('line').attr('x1', cx).attr('x2', cx);
        lines.forEach((l, i) => dots[i].attr('cx', cx).attr('cy', y(l.get(d))));
        const rows = lines
          .map((l) => ({ l, v: l.get(d) }))
          .map(
            ({ l, v }) =>
              `<div style="display:flex;align-items:center;gap:6px;margin-top:3px"><span style="width:8px;height:8px;border-radius:9px;background:${l.color}"></span>${escapeHtml(l.label)} <b style="margin-left:auto;padding-left:12px">${integer.format(v)}</b></div>`,
          )
          .join('');
        tip.show(
          `<div style="color:var(--muted)">${fmt(d.t)}</div>${rows}`,
          cx + m.left,
          y(d3.max(lines, (l) => l.get(d)) ?? 0) + m.top,
        );
      })
      .on('pointerleave', () => {
        hover.style('display', 'none');
        tip.hide();
      });
    intro.current = false;
  }, [buckets, lines, width, height, hourly, clipId, wrapRef]);

  return (
    <div ref={wrapRef} className="relative w-full" style={{ height }}>
      <svg ref={svgRef} role="img" aria-label="Clicks over time" className="block overflow-visible" />
    </div>
  );
}
