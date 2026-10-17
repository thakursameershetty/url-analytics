'use client';

import * as d3 from 'd3';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  /** Visitor's viewport the page was captured at. */
  pageWidth: number;
  viewportHeight: number;
  /** Full document height (fallback when there's no snapshot to measure). */
  pageHeight: number;
  clicks: ClickPoint[];
  scroll: (readonly [number, number])[];
  mode: HeatMode;
  highlight: string | null;
}

interface Placed extends ClickPoint {
  px: number;
  py: number;
  /** Lives in a position:fixed element — drawn in viewport space, doesn't scroll. */
  fixed: boolean;
}

// Semantic "heat" ramp (an analogous warm sequence) — always shown with a scale legend.
export const heatColor = (t: number) => d3.interpolateYlOrRd(0.15 + t * 0.85);

function isFixed(el: Element | null, win: Window) {
  for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
    if (win.getComputedStyle(e).position === 'fixed') return true;
  }
  return false;
}

/**
 * The page snapshot rendered at the visitor's real viewport size (so `100vh`,
 * fixed headers and full-screen sections look right) and scrolled like a real
 * browser. The D3 overlay has two layers: one in document coordinates that moves
 * with the scroll, and one for fixed elements that stays put.
 */
export default function HeatmapStage({ snapshotUrl, pageWidth, viewportHeight, pageHeight, clicks, scroll, mode, highlight }: Props) {
  const [wrapRef, containerW] = useWidth<HTMLDivElement>();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const docSvgRef = useRef<SVGSVGElement>(null);
  const fixedSvgRef = useRef<SVGSVGElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const manualY = useRef(0);
  const [doc, setDoc] = useState<Document | null>(null);
  const [measuredH, setMeasuredH] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(!snapshotUrl);
  const intro = useRef(true);
  const lastMode = useRef<HeatMode | null>(null);

  const w = pageWidth;
  const vh = Math.max(300, viewportHeight);
  const h = Math.min(30_000, Math.max(vh, measuredH ?? pageHeight));
  const scale = containerW ? Math.min(1, containerW / w) : 1;
  const frameH = vh * scale;

  const win = () => doc?.defaultView ?? null;
  const currentY = () => win()?.scrollY ?? manualY.current;

  // Keep the document layer and the scroll rail in step with the page's scroll position.
  const sync = useCallback(() => {
    const y = doc?.defaultView?.scrollY ?? manualY.current;
    if (docSvgRef.current) docSvgRef.current.style.transform = `translateY(${-y}px)`;
    if (thumbRef.current) {
      const ratio = vh / h;
      thumbRef.current.style.height = `${Math.max(24, ratio * frameH)}px`;
      thumbRef.current.style.transform = `translateY(${(y / h) * frameH}px)`;
      thumbRef.current.style.display = ratio >= 1 ? 'none' : 'block';
    }
  }, [doc, vh, h, frameH]);

  const scrollTo = useCallback(
    (y: number, smooth = false) => {
      const max = Math.max(0, h - vh);
      const target = Math.min(max, Math.max(0, y));
      const w = doc?.defaultView;
      if (w) w.scrollTo({ top: target, behavior: smooth ? 'smooth' : 'auto' });
      else {
        manualY.current = target;
        sync();
      }
    },
    [doc, h, vh, sync],
  );

  useEffect(() => {
    const w = doc?.defaultView;
    if (!w) return;
    w.addEventListener('scroll', sync, { passive: true });
    sync();
    return () => w.removeEventListener('scroll', sync);
  }, [doc, sync]);

  useEffect(() => {
    sync();
  }, [sync, frameH]);

  // Wheel over the overlay scrolls the page underneath (the overlay sits on top for tooltips).
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      scrollTo(currentY() + e.deltaY / scale);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  // Resolve each click to the element it hit in *this* snapshot.
  const points = useMemo<Placed[]>(() => {
    const w = doc?.defaultView;
    const cache = new Map<string, { r: DOMRect; fixed: boolean } | null>();
    const lookup = (sel: string) => {
      if (!doc || !w) return null;
      if (!cache.has(sel)) {
        let hit: { r: DOMRect; fixed: boolean } | null = null;
        try {
          const el = doc.querySelector(sel);
          if (el) {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) hit = { r, fixed: isFixed(el, w) };
          }
        } catch {}
        cache.set(sel, hit);
      }
      return cache.get(sel)!;
    };
    const y0 = w?.scrollY ?? 0;
    return clicks.map((c) => {
      const hit = c.selector ? lookup(c.selector) : null;
      if (!hit) return { ...c, px: c.x, py: c.y, fixed: false };
      const px = hit.r.left + (c.ox ?? 0.5) * hit.r.width;
      const vy = hit.r.top + (c.oy ?? 0.5) * hit.r.height;
      return hit.fixed ? { ...c, px, py: vy, fixed: true } : { ...c, px, py: vy + y0, fixed: false };
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
    const docSvg = docSvgRef.current;
    const fixedSvg = fixedSvgRef.current;
    const wrap = wrapRef.current;
    if (!docSvg || !fixedSvg || !wrap || !loaded) return;
    // Intro animation on first draw and whenever the view mode changes; live updates redraw instantly.
    if (lastMode.current !== mode) intro.current = true;
    lastMode.current = mode;
    const t = (ms: number) => (intro.current ? dur(ms) : 0);
    const docLayer = d3.select(docSvg);
    const fixedLayer = d3.select(fixedSvg);
    docLayer.selectAll('*').remove();
    fixedLayer.selectAll('*').remove();
    const tip = createTooltip(wrap);

    if (mode === 'clicks') {
      const drawDensity = (layer: d3.Selection<SVGSVGElement, unknown, null, undefined>, pts: Placed[], height: number) => {
        if (!pts.length) return;
        const density = d3
          .contourDensity<Placed>()
          .x((p) => p.px)
          .y((p) => p.py)
          .size([w, height])
          .cellSize(6)
          .bandwidth(Math.max(10, Math.min(28, w / 60)))
          .thresholds(12)(pts);
        const max = d3.max(density, (c) => c.value) ?? 1;
        layer
          .append('g')
          .selectAll('path')
          .data(density)
          .join('path')
          .attr('d', d3.geoPath())
          .attr('fill', (c) => heatColor(c.value / max))
          .attr('fill-opacity', 0)
          .transition()
          .delay((_c, i) => t(i * 45))
          .duration(t(500))
          .attr('fill-opacity', (c, i) => (i === 0 ? 0.22 : 0.3 + 0.45 * (c.value / max)));
      };
      drawDensity(docLayer, points.filter((p) => !p.fixed), h);
      drawDensity(fixedLayer, points.filter((p) => p.fixed), vh);
    }

    if (mode === 'frustration') {
      const marks = points.filter((p) => p.type === 'rage' || p.type === 'dead');
      for (const [layer, pts] of [
        [docLayer, marks.filter((p) => !p.fixed)],
        [fixedLayer, marks.filter((p) => p.fixed)],
      ] as const) {
        const dot = layer
          .append('g')
          .selectAll('g')
          .data(pts)
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
    }

    if (mode === 'scroll' && scroll.length) {
      // Share of visitors whose deepest scroll reached each depth of the page.
      const reach = scroll.map(([max, docH]) => Math.min(1, max / Math.max(1, docH))).sort(d3.ascending);
      const reachedAt = (depthFrac: number) => 1 - d3.bisectLeft(reach, depthFrac) / reach.length;
      const step = Math.max(8, Math.round(h / 200));
      const bands = d3.range(0, h, step).map((y) => ({ y, pct: reachedAt(y / h) }));
      docLayer
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

      const markers = [
        ...[0.75, 0.5, 0.25].map((p) => ({ label: `${Math.round(p * 100)}% of visitors`, y: d3.quantile(reach, 1 - p)! * h })),
        { label: 'Average fold', y: vh },
      ].filter((m) => m.y > 0 && m.y < h);
      const mk = docLayer.append('g').selectAll('g').data(markers).join('g').attr('transform', (m) => `translate(0,${m.y})`);
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
        .text((m) => m.label);

      docLayer
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

    // Outline the element hovered in the "Most-clicked elements" list, and bring it into view.
    if (highlight && doc?.defaultView) {
      try {
        const el = doc.querySelector(highlight);
        const r = el?.getBoundingClientRect();
        if (el && r && r.width) {
          const fixed = isFixed(el, doc.defaultView);
          const y = fixed ? r.top : r.top + doc.defaultView.scrollY;
          (fixed ? fixedLayer : docLayer)
            .append('rect')
            .attr('x', r.left - 4)
            .attr('y', y - 4)
            .attr('width', r.width + 8)
            .attr('height', r.height + 8)
            .attr('rx', 8)
            .attr('fill', 'rgba(42,120,214,0.12)')
            .attr('stroke', '#2a78d6')
            .attr('stroke-width', 2 / scale)
            .attr('pointer-events', 'none');
          if (!fixed && (r.top < 0 || r.bottom > vh)) scrollTo(y - vh * 0.3, true);
        }
      } catch {}
    }

    intro.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, scroll, mode, w, h, vh, scale, loaded, highlight, doc, wrapRef]);

  // Drag the rail thumb to scroll.
  function onRailPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const rail = e.currentTarget;
    const rect = rail.getBoundingClientRect();
    const move = (clientY: number) => scrollTo(((clientY - rect.top) / rect.height) * h - vh / 2);
    move(e.clientY);
    rail.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => move(ev.clientY);
    const onUp = () => {
      rail.removeEventListener('pointermove', onMove);
      rail.removeEventListener('pointerup', onUp);
    };
    rail.addEventListener('pointermove', onMove);
    rail.addEventListener('pointerup', onUp);
  }

  return (
    <div ref={wrapRef} className="relative w-full">
      <div className="mx-auto flex gap-2" style={{ width: Math.min(containerW || w, w * scale + 14) }}>
        <div
          className="relative flex-1 overflow-hidden rounded-2xl border border-line bg-white"
          style={{ height: frameH }}
        >
          <div style={{ width: w, height: vh, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'relative' }}>
            {snapshotUrl ? (
              <iframe
                ref={iframeRef}
                key={snapshotUrl}
                src={snapshotUrl}
                title="Page snapshot"
                // No scripts, no navigation: only same-origin access so we can measure elements.
                sandbox="allow-same-origin"
                onLoad={onLoad}
                style={{ width: w, height: vh, border: 0, display: 'block', pointerEvents: 'none' }}
              />
            ) : (
              <div className="grid h-full place-items-center bg-[#f6f6f3] text-center text-[#52514e]" style={{ fontSize: 16 / scale }}>
                <div>
                  <p style={{ fontWeight: 600 }}>No copy of this page yet</p>
                  <p>It&apos;s captured on the next visit. Marks are placed by recorded position meanwhile.</p>
                </div>
              </div>
            )}
            <div
              ref={overlayRef}
              className="absolute inset-0 overflow-hidden outline-none"
              tabIndex={0}
              aria-label="Page heatmap — use arrow keys or Page Up/Down to scroll"
              onKeyDown={(e) => {
                const step = { ArrowDown: 80, ArrowUp: -80, PageDown: vh * 0.9, PageUp: -vh * 0.9, ' ': vh * 0.9 }[e.key];
                if (step) {
                  e.preventDefault();
                  scrollTo(currentY() + step);
                } else if (e.key === 'Home' || e.key === 'End') {
                  e.preventDefault();
                  scrollTo(e.key === 'Home' ? 0 : h);
                }
              }}
            >
              <svg ref={docSvgRef} width={w} height={h} className="absolute left-0 top-0 will-change-transform" role="img" aria-label="Heatmap overlay" />
              <svg ref={fixedSvgRef} width={w} height={vh} className="pointer-events-none absolute left-0 top-0 [&_g]:pointer-events-auto" aria-hidden />
            </div>
          </div>
          {!loaded && <div className="shimmer absolute inset-0" />}
        </div>
        {/* Scroll rail: shows where you are on the page; drag or click to move. */}
        <div
          className="relative w-1.5 shrink-0 cursor-pointer rounded-full bg-surface-2"
          style={{ height: frameH }}
          onPointerDown={onRailPointerDown}
          aria-hidden
        >
          <div ref={thumbRef} className="absolute left-0 top-0 w-full rounded-full bg-[var(--muted)]" />
        </div>
      </div>
    </div>
  );
}
