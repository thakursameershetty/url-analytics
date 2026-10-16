'use client';

import * as d3 from 'd3';
import { useEffect, useRef, useState } from 'react';
import { feature } from 'topojson-client';
import type { FeatureCollection, Geometry } from 'geojson';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { GeoPoint } from '@/lib/types';
import { createTooltip, dur, escapeHtml, integer, pct, useWidth } from './shared';

let worldPromise: Promise<FeatureCollection<Geometry>> | null = null;
function loadWorld() {
  worldPromise ??= fetch('/api/geo/world')
    .then((r) => r.json())
    .then((topo: Topology<{ countries: GeometryCollection }>) => {
      const fc = feature(topo, topo.objects.countries) as FeatureCollection<Geometry>;
      // Antarctica eats a fifth of the canvas and never has visitors.
      fc.features = fc.features.filter((f) => f.id !== '010');
      return fc;
    });
  return worldPromise;
}

export default function WorldMap({ points, total }: { points: GeoPoint[]; total: number }) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  // Intro animation plays on first draw only; live data updates redraw instantly.
  const intro = useRef(true);
  const [world, setWorld] = useState<FeatureCollection<Geometry> | null>(null);
  const height = Math.max(220, Math.round(width * 0.47));

  useEffect(() => {
    loadWorld().then(setWorld).catch(() => setWorld(null));
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    const wrap = wrapRef.current;
    if (!svg || !wrap || !world || width === 0) return;
    const t = (ms: number) => (intro.current ? dur(ms) : 0);

    const projection = d3.geoNaturalEarth1().fitExtent(
      [
        [4, 4],
        [width - 4, height - 4],
      ],
      world,
    );
    const path = d3.geoPath(projection);

    const root = d3.select(svg).attr('width', width).attr('height', height);
    root.selectAll('*').remove();
    const zoomLayer = root.append('g');

    zoomLayer
      .append('path')
      .datum(d3.geoGraticule10())
      .attr('d', path)
      .attr('fill', 'none')
      .attr('stroke', 'var(--grid)')
      .attr('stroke-width', 0.5);

    zoomLayer
      .append('g')
      .selectAll('path')
      .data(world.features)
      .join('path')
      .attr('d', path)
      .attr('fill', 'var(--land)')
      .attr('stroke', 'var(--land-stroke)')
      .attr('stroke-width', 0.6)
      .attr('opacity', 0)
      .transition()
      .duration(t(600))
      .attr('opacity', 1);

    const maxCount = d3.max(points, (p) => p.count) ?? 1;
    const radius = d3
      .scaleSqrt()
      .domain([0, maxCount])
      .range([0, Math.max(10, Math.min(28, width / 30))]);
    const sorted = [...points].sort((a, b) => b.count - a.count);
    const topKeys = new Set(sorted.slice(0, 3).map((p) => `${p.lat},${p.lon}`));

    const bubbles = zoomLayer
      .append('g')
      .selectAll<SVGGElement, GeoPoint>('g')
      // Draw biggest first so small cities stay hoverable on top.
      .data(sorted)
      .join('g')
      .attr('transform', (p) => {
        const xy = projection([p.lon, p.lat]) ?? [0, 0];
        return `translate(${xy[0]},${xy[1]})`;
      });

    // Pulse rings on the busiest locations.
    bubbles
      .filter((p) => topKeys.has(`${p.lat},${p.lon}`))
      .append('circle')
      .attr('class', 'pulse-ring')
      .attr('r', (p) => Math.max(3, radius(p.count) * 0.6))
      .attr('fill', 'none')
      .attr('stroke', 'var(--series-1)')
      .attr('stroke-width', 1.5)
      .style('animation-delay', (_p, i) => `${i * 0.6}s`);

    bubbles
      .append('circle')
      .attr('class', 'dot')
      .attr('r', 0)
      .attr('fill', 'var(--series-1)')
      .attr('fill-opacity', 0.55)
      .attr('stroke', 'var(--surface)')
      .attr('stroke-width', 1.5)
      .transition()
      .delay((_p, i) => t(400 + i * 25))
      .duration(t(700))
      .ease(d3.easeBackOut.overshoot(1.6))
      .attr('r', (p) => Math.max(4, radius(p.count)));

    const tip = createTooltip(wrap);
    bubbles
      .on('pointermove', (event: PointerEvent, p) => {
        const [px, py] = d3.pointer(event, wrap);
        tip.show(
          `<b>${escapeHtml(p.city)}</b><br/><span style="color:var(--muted)">${escapeHtml(p.country)}</span><br/>${integer.format(p.count)} clicks · ${pct(p.count, total)}`,
          px,
          py,
        );
        d3.select(event.currentTarget as SVGGElement).select('circle.dot').attr('fill-opacity', 0.85);
      })
      .on('pointerleave', (event: PointerEvent) => {
        tip.hide();
        d3.select(event.currentTarget as SVGGElement).select('circle.dot').attr('fill-opacity', 0.55);
      });

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 8])
      .translateExtent([
        [0, 0],
        [width, height],
      ])
      .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        zoomLayer.attr('transform', event.transform.toString());
        // Keep bubble strokes and sizes visually constant while zoomed.
        const k = event.transform.k;
        zoomLayer.selectAll<SVGCircleElement, GeoPoint>('circle.dot').attr('transform', `scale(${1 / Math.sqrt(k)})`);
      });
    root.call(zoom).on('dblclick.zoom', null);
    root.on('dblclick', () => root.transition().duration(dur(500)).call(zoom.transform, d3.zoomIdentity));
    intro.current = false;
  }, [world, points, width, height, total, wrapRef]);

  return (
    <div ref={wrapRef} className="relative w-full cursor-grab active:cursor-grabbing" style={{ height }}>
      {!world && <div className="absolute inset-0 animate-pulse rounded-xl bg-surface-2" />}
      <svg ref={svgRef} role="img" aria-label="Map of click locations" className="block" />
    </div>
  );
}
