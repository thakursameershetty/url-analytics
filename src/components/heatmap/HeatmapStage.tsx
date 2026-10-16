'use client';

import * as d3 from 'd3';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createTooltip, dur, escapeHtml, useWidth } from '../charts/shared';

export type HeatMode = 'clicks' | 'scroll' | 'frustration';

export interface ClickPoint {
  type: string;
  x: number;
  y: number;
  selector: string | null;
  ox: number | null;
  oy: number | null;
}

interface Props {
  snapshotUrl: string | null;
  /** Width/height the page was captured at (document pixels). */
  pageWidth: number;
  pageHeight: number;
  clicks: ClickPoint[];
  scroll: (readonly [number, number])[];
  mode: HeatMode;
  highlight: string | null;
}

// Semantic "heat" ramp (an analogous warm sequence) — always shown with a scale legend.
export const heatColor = (t: number) => d3.interpolateYlOrRd(0.15 + t * 0.85);

/**
 * The page snapshot in a locked-down iframe, scaled to fit, with a D3 overlay
 * drawn in the page's own coordinate space so marks line up with elements.
 */
export default function HeatmapStage({ snapshotUrl, pageWidth, pageHeight, clicks, scroll, mode, highlight }: Props) {
  const [wrapRef, containerW] = useWidth<HTMLDivElement>();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<Document | null>(null);
  const [measuredH, setMeasuredH] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(!snapshotUrl);
  const intro = useRef(true);
  const lastMode = useRef<HeatMode | null>(null);

  const w = pageWidth;
  const h = Math.min(16_000, Math.max(400, measuredH ?? pageHeight));
  const scale = containerW ? Math.min(1, containerW / w) : 1;

  // Resolve each click to the element it hit in *this* snapshot, so a click on a
  // button lands on that button even if the visitor's layout differed slightly.
  const points = useMemo(() => {
    const rects = new Map<string, DOMRect | null>();
    const rectOf = (sel: string) => {
      if (!doc) return null;
      if (!rects.has(sel)) {
        let r: DOMRect | null = null;
        try {
          const el = doc.querySelector(sel);
          if (el) {
            const b = el.getBoundingClientRect();
            if (b.width > 0 && b.height > 0) r = b;
          }
        } catch {}
        rects.set(sel, r);
      }
      return rects.get(sel)!;
    };
    return clicks.map((c) => {
      const r = c.selector ? rectOf(c.selector) : null;
      return r
        ? { ...c, px: r.left + (c.ox ?? 0.5) * r.width, py: r.top + (c.oy ?? 0.5) * r.height }
        : { ...c, px: c.x, py: c.y };
    });
  }, [clicks, doc]);

  function onLoad() {
    const d = iframeRef.current?.contentDocument;
    if (d) {
      setDoc(d);
      setMeasuredH(Math.max(d.documentElement.scrollHeight, d.body?.scrollHeight ?? 0));
    }
    setLoaded(true);
  }

  useEffect(() => {
    const svg = svgRef.current;
    const wrap = wrapRef.current;
    if (!svg || !wrap || !loaded) return;
    // Intro animation on first draw and whenever the view mode changes; live updates redraw instantly.
    if (lastMode.current !== mode) intro.current = true;
    lastMode.current = mode;
    const t = (ms: number) => (intro.current ? dur(ms) : 0);
    const root = d3.select(svg);
    root.selectAll('*').remove();
    const tip = createTooltip(wrap);

    if (mode === 'clicks' && points.length) {
      const density = d3
        .contourDensity<(typeof points)[number]>()
        .x((p) => p.px)
        .y((p) => p.py)
        .size([w, h])
        .cellSize(6)
        .bandwidth(Math.max(10, Math.min(28, w / 60)))
        .thresholds(12)(points);
      const max = d3.max(density, (c) => c.value) ?? 1;
      root
        .append('g')
        .selectAll('path')
        .data(density)
        .join('path')
        .attr('d', d3.geoPath())
        .attr('fill', (c) => heatColor(c.value / max))
        .attr('fill-opacity', 0)
        .attr('stroke', 'none')
        .transition()
        .delay((_c, i) => t(i * 45))
        .duration(t(500))
        .attr('fill-opacity', (c, i) => (i === 0 ? 0.22 : 0.3 + 0.45 * (c.value / max)));
    }

    if (mode === 'frustration') {
      const marks = points.filter((p) => p.type === 'rage' || p.type === 'dead');
      const g = root.append('g');
      const dot = g
        .selectAll('g')
        .data(marks)
        .join('g')
        .attr('transform', (p) => `translate(${p.px},${p.py})`)
        .style('cursor', 'default');
      dot
        .filter((p) => p.type === 'rage')
        .append('circle')
        .attr('class', 'pulse-ring')
        .attr('r', 9)
        .attr('fill', 'none')
        .attr('stroke', '#d03b3b')
        .attr('stroke-width', 2);
      dot
        .append('circle')
        .attr('r', 0)
        .attr('fill', (p) => (p.type === 'rage' ? '#d03b3b' : '#52514e'))
        .attr('stroke', '#ffffff')
        .attr('stroke-width', 2)
        .transition()
        .delay((_p, i) => t(Math.min(i, 40) * 25))
        .duration(t(350))
        .ease(d3.easeBackOut)
        .attr('r', 8);
      dot
        .append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('font-size', 10)
        .attr('font-weight', 700)
        .attr('fill', '#ffffff')
        .attr('pointer-events', 'none')
        .text((p) => (p.type === 'rage' ? '!' : '×'));
      dot
        .on('pointermove', (event: PointerEvent, p) => {
          const [px, py] = d3.pointer(event, wrap);
          tip.show(
            `<b>${p.type === 'rage' ? 'Rage click' : 'Dead click'}</b><br/><span style="color:var(--muted)">${escapeHtml(p.selector ?? 'unknown element')}</span>`,
            px,
            py,
          );
        })
        .on('pointerleave', () => tip.hide());
    }

    if (mode === 'scroll' && scroll.length) {
      // Share of visitors whose deepest scroll reached each depth of the page.
      const reach = scroll.map(([max, docH]) => Math.min(1, max / Math.max(1, docH))).sort(d3.ascending);
      const reachedAt = (depthFrac: number) => 1 - d3.bisectLeft(reach, depthFrac) / reach.length;
      const step = Math.max(8, Math.round(h / 150));
      const bands = d3.range(0, h, step).map((y) => ({ y, pct: reachedAt(y / h) }));
      root
        .append('g')
        .selectAll('rect')
        .data(bands)
        .join('rect')
        .attr('x', 0)
        .attr('y', (b) => b.y)
        .attr('width', w)
        .attr('height', step + 0.5)
        .attr('fill', '#0b0b0b')
        .attr('fill-opacity', 0)
        .transition()
        .duration(t(600))
        .attr('fill-opacity', (b) => (1 - b.pct) * 0.72);

      const markers = [0.75, 0.5, 0.25].map((p) => ({ p, y: d3.quantile(reach, 1 - p)! * h })).filter((m) => m.y > 0);
      const mk = root.append('g').selectAll('g').data(markers).join('g').attr('transform', (m) => `translate(0,${m.y})`);
      mk.append('line').attr('x1', 0).attr('x2', w).attr('stroke', '#ffffff').attr('stroke-width', 2 / scale);
      mk.append('rect')
        .attr('x', 12 / scale)
        .attr('y', -13 / scale)
        .attr('rx', 13 / scale)
        .attr('width', 150 / scale)
        .attr('height', 26 / scale)
        .attr('fill', '#0b0b0b')
        .attr('fill-opacity', 0.85);
      mk.append('text')
        .attr('x', 24 / scale)
        .attr('dy', '0.35em')
        .attr('font-size', 12 / scale)
        .attr('font-weight', 600)
        .attr('fill', '#ffffff')
        .text((m) => `${Math.round(m.p * 100)}% of visitors`);

      root
        .append('rect')
        .attr('width', w)
        .attr('height', h)
        .attr('fill', 'transparent')
        .on('pointermove', (event: PointerEvent) => {
          const [, y] = d3.pointer(event);
          const [px, py] = d3.pointer(event, wrap);
          tip.show(`<b>${Math.round(reachedAt(y / h) * 100)}%</b> of visitors scrolled this far`, px, py);
        })
        .on('pointerleave', () => tip.hide());
    }

    // Outline the element hovered in the "Top elements" list.
    if (highlight && doc) {
      try {
        const el = doc.querySelector(highlight);
        const r = el?.getBoundingClientRect();
        if (r && r.width) {
          root
            .append('rect')
            .attr('x', r.left - 4)
            .attr('y', r.top - 4)
            .attr('width', r.width + 8)
            .attr('height', r.height + 8)
            .attr('rx', 8)
            .attr('fill', 'rgba(42,120,214,0.12)')
            .attr('stroke', '#2a78d6')
            .attr('stroke-width', 2 / scale)
            .attr('pointer-events', 'none');
          const box = scrollRef.current;
          if (box) {
            const top = r.top * scale;
            if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - 80) {
              box.scrollTo({ top: Math.max(0, top - 120), behavior: 'smooth' });
            }
          }
        }
      } catch {}
    }

    intro.current = false;
  }, [points, scroll, mode, w, h, scale, loaded, highlight, doc, wrapRef]);

  return (
    <div ref={wrapRef} className="relative w-full">
      <div
        ref={scrollRef}
        className="relative overflow-y-auto overflow-x-hidden rounded-2xl border border-line bg-white"
        style={{ height: Math.min(h * scale, 760) }}
      >
        <div style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'relative' }}>
          {snapshotUrl ? (
            <iframe
              ref={iframeRef}
              key={snapshotUrl}
              src={snapshotUrl}
              title="Page snapshot"
              // No scripts, no navigation: only same-origin access so we can measure elements.
              sandbox="allow-same-origin"
              onLoad={onLoad}
              scrolling="no"
              style={{ width: w, height: h, border: 0, display: 'block', pointerEvents: 'none' }}
            />
          ) : (
            <div className="grid h-full place-items-start justify-center bg-[#f6f6f3] pt-40 text-center text-[#52514e]" style={{ fontSize: 16 / scale }}>
              <div>
                <p style={{ fontWeight: 600 }}>No copy of this page yet</p>
                <p>It&apos;s captured automatically on the next visit. Marks are placed by recorded position meanwhile.</p>
              </div>
            </div>
          )}
          <svg ref={svgRef} width={w} height={h} className="absolute left-0 top-0" role="img" aria-label="Heatmap overlay" />
        </div>
        {!loaded && <div className="shimmer absolute inset-0" />}
      </div>
    </div>
  );
}
