'use client';

import * as d3 from 'd3';
import { useEffect, useRef } from 'react';
import { dur } from './shared';

export default function Sparkline({ values, width = 96, height = 28 }: { values: number[]; width?: number; height?: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  // Intro animation plays on first draw only; live data updates redraw instantly.
  const intro = useRef(true);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const t = (ms: number) => (intro.current ? dur(ms) : 0);
    const x = d3
      .scaleLinear()
      .domain([0, values.length - 1])
      .range([2, width - 4]);
    const y = d3
      .scaleLinear()
      .domain([0, Math.max(1, d3.max(values) ?? 0)])
      .range([height - 3, 3]);

    const root = d3.select(svg);
    root.selectAll('*').remove();

    root
      .append('path')
      .datum(values)
      .attr('fill', 'var(--series-1)')
      .attr('fill-opacity', 0.1)
      .attr(
        'd',
        d3
          .area<number>()
          .x((_d, i) => x(i))
          .y0(height - 3)
          .y1((d) => y(d))
          .curve(d3.curveMonotoneX),
      );

    const line = root
      .append('path')
      .datum(values)
      .attr('fill', 'none')
      .attr('stroke', 'var(--series-1)')
      .attr('stroke-width', 1.5)
      .attr('stroke-linecap', 'round')
      .attr(
        'd',
        d3
          .line<number>()
          .x((_d, i) => x(i))
          .y((d) => y(d))
          .curve(d3.curveMonotoneX),
      );

    const len = (line.node() as SVGPathElement).getTotalLength();
    line
      .attr('stroke-dasharray', `${len} ${len}`)
      .attr('stroke-dashoffset', len)
      .transition()
      .duration(t(900))
      .ease(d3.easeCubicOut)
      .attr('stroke-dashoffset', 0);

    root
      .append('circle')
      .attr('cx', x(values.length - 1))
      .attr('cy', y(values[values.length - 1]))
      .attr('r', 2.5)
      .attr('fill', 'var(--series-1)');
    intro.current = false;
  }, [values, width, height]);

  return <svg ref={svgRef} width={width} height={height} aria-hidden className="block overflow-visible" />;
}
