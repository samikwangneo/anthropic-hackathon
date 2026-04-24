import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { Node } from '../types';

export interface ExtendedHierarchyRectangularNode<T> extends d3.HierarchyRectangularNode<T> {
  current?: d3.HierarchyRectangularNode<T>;
  target?: d3.HierarchyRectangularNode<T>;
}

export interface SunburstProps {
  data: Node;
  onHover: (node: Node | null, x: number, y: number) => void;
  onClick: (node: Node, path: string[]) => void;
}

export const Sunburst: React.FC<SunburstProps> = ({ data, onHover, onClick }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!data || !svgRef.current || !wrapperRef.current) return;

    // Clear previous renders
    d3.select(svgRef.current).selectAll('*').remove();

    const width = wrapperRef.current.clientWidth;
    const height = Math.min(width, 800); // Max height to keep it circular
    const radius = width / 6;

    // Colors according to plan
    const colorMap: Record<string, string> = {
      increase: '#14b8a6',
      cut: '#f87171',
      new: '#a855f7',
      repeal: '#f97316',
      neutral: '#9ca3af'
    };

    const color = (d: d3.HierarchyRectangularNode<Node>) => {
      // If no data type provided, fallback to neutral
      return colorMap[d.data.type] || colorMap.neutral;
    };

    let root = d3.hierarchy<Node>(data)
      .sum(d => Math.max(0, d.amount || 0));

    // If total sum is 0 (e.g. executive orders, no amounts), fallback to clause-count sizing
    if (root.value === 0) {
      root = d3.hierarchy<Node>(data).sum(() => 1);
    }

    root.sort((a, b) => (b.value || 0) - (a.value || 0));

    d3.partition<Node>().size([2 * Math.PI, root.height + 1])(root);

    const arc = d3.arc<d3.HierarchyRectangularNode<Node>>()
      .startAngle(d => d.x0)
      .endAngle(d => d.x1)
      .padAngle(d => Math.min((d.x1 - d.x0) / 2, 0.005))
      .padRadius(radius * 1.5)
      .innerRadius(d => d.y0 * radius)
      .outerRadius(d => Math.max(d.y0 * radius, d.y1 * radius - 1));

    const svg = d3.select(svgRef.current)
      .attr('viewBox', [-width / 2, -height / 2, width, height])
      .style('font', '10px sans-serif')
      .style('max-width', '100%')
      .style('height', 'auto');

    let currentFocus = root;

    const path = svg.append('g')
      .selectAll('path')
      .data(root.descendants().slice(1)) // Skip root as it's the center
      .join('path')
      .attr('fill', d => color(d))
      .attr('fill-opacity', d => arcVisible(d.current || d) ? (d.children ? 0.8 : 0.6) : 0)
      .attr('pointer-events', d => arcVisible(d.current || d) ? 'auto' : 'none')
      .attr('d', d => arc(d.current || d) as string)
      .style('transition', 'fill-opacity 0.2s, stroke 0.2s')
      .style('stroke', '#fff')
      .style('stroke-width', '0.5px');

    path.filter(d => !!d.children)
      .style('cursor', 'pointer')
      .on('click', clicked);

    path.filter(d => !d.children)
      .style('cursor', 'pointer')
      .on('click', leafClicked);

    // Hover interactions
    path.on('mousemove', (event, d) => {
      d3.select(event.currentTarget as Element)
        .style('stroke', '#000')
        .style('stroke-width', '2px')
        .attr('fill-opacity', 1);

      updateCenterText(d, true);
      onHover(d.data, event.clientX, event.clientY);
    })
    .on('mouseleave', (event, d) => {
      d3.select(event.currentTarget as Element)
        .style('stroke', '#fff')
        .style('stroke-width', '0.5px')
        .attr('fill-opacity', arcVisible(d.current || d) ? (d.children ? 0.8 : 0.6) : 0);

      updateCenterText(currentFocus);
      onHover(null, 0, 0);
    });

    const format = d3.format(',d');
    path.append('title')
      .text(d => `${d.ancestors().map(d => d.data.name).reverse().join(' › ')}\n${d.value ? format(d.value) : ''}`);

    const label = svg.append('g')
      .attr('pointer-events', 'none')
      .attr('text-anchor', 'middle')
      .style('user-select', 'none')
      .selectAll('text')
      .data(root.descendants().slice(1))
      .join('text')
      .attr('dy', '0.35em')
      .attr('fill-opacity', d => +labelVisible(d.current || d))
      .attr('transform', d => labelTransform(d.current || d))
      .text(d => labelText(d))
      .style('fill', '#0f172a')
      .style('font-weight', '600')
      .style('font-family', 'var(--font-primary)')
      .style('font-size', '11px')
      .style('paint-order', 'stroke')
      .style('stroke', 'rgba(255,255,255,0.55)')
      .style('stroke-width', '3px');

    const parent = svg.append('circle')
      .datum(root)
      .attr('r', radius)
      .attr('fill', 'rgba(255,255,255,0.02)')
      .attr('pointer-events', 'all')
      .style('cursor', 'pointer')
      .on('click', clicked);

    // Center text — three lines: name (top), category/amount badge, plain-language summary.
    const centerName = svg.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-1.6em')
      .style('pointer-events', 'none')
      .style('font-family', 'var(--font-primary)')
      .style('fill', 'rgb(244 244 245)')
      .style('font-size', '14px')
      .style('font-weight', '700');

    const centerBadge = svg.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-0.1em')
      .style('pointer-events', 'none')
      .style('font-family', 'var(--font-secondary)')
      .style('text-transform', 'uppercase')
      .style('letter-spacing', '0.15em')
      .style('font-size', '10px')
      .style('font-weight', '700');

    // Summary wraps onto multiple lines (up to 4).
    const centerSummary = svg.append('g')
      .style('pointer-events', 'none');

    function setSummaryLines(text: string) {
      centerSummary.selectAll('text').remove();
      const lines = wrapLines(text, 28, 4);
      const startDy = 1.3;
      lines.forEach((line, i) => {
        centerSummary.append('text')
          .attr('text-anchor', 'middle')
          .attr('dy', `${startDy + i * 1.15}em`)
          .style('font-family', 'var(--font-secondary)')
          .style('fill', 'rgba(228, 228, 231, 0.75)')
          .style('font-size', '11px')
          .text(line);
      });
    }

    function updateCenterText(
      p: d3.HierarchyRectangularNode<Node>,
      hovering = false,
    ) {
      const name = p.data.name;
      centerName.text(name.length > 32 ? name.slice(0, 32) + '…' : name);

      const total = p.value || 0;
      const hasAmount = p.data.amount !== null && p.data.amount !== undefined;
      const dollarLabel = hasAmount
        ? formatAmount(p.data.amount as number)
        : total > 0
        ? `${format(total)} ${total === 1 ? 'clause' : 'clauses'}`
        : '';

      const typeLabel = p.data.type?.toUpperCase() ?? 'NEUTRAL';
      const typeColor = colorMap[p.data.type] || colorMap.neutral;
      const badgePrefix = hovering ? '◉ ' : '';
      const badgeText = dollarLabel
        ? `${badgePrefix}${typeLabel} · ${dollarLabel}`
        : `${badgePrefix}${typeLabel}`;
      centerBadge.text(badgeText).style('fill', typeColor);

      setSummaryLines(p.data.summary || '');
    }

    updateCenterText(root);

    function arcVisible(d: any) {
      return d.y1 <= 4 && d.y0 >= 1 && d.x1 > d.x0;
    }

    function labelVisible(d: any) {
      return d.y1 <= 4 && d.y0 >= 1 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.03;
    }

    function labelText(d: d3.HierarchyRectangularNode<Node>) {
      // Tighter labels for inner rings, more room for outer rings.
      const angularSpan = d.x1 - d.x0;
      const maxChars = Math.max(8, Math.floor(angularSpan * 24));
      const name = d.data.name;
      return name.length > maxChars ? name.slice(0, maxChars - 1) + '…' : name;
    }

    function labelTransform(d: any) {
      const x = (d.x0 + d.x1) / 2 * 180 / Math.PI;
      const y = (d.y0 + d.y1) / 2 * radius;
      return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
    }

    function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
      const words = text.split(/\s+/).filter(Boolean);
      const lines: string[] = [];
      let current = '';
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length > maxChars && current) {
          lines.push(current);
          current = word;
          if (lines.length === maxLines - 1) break;
        } else {
          current = candidate;
        }
      }
      if (current && lines.length < maxLines) lines.push(current);
      // If there's leftover text we couldn't fit, ellipsize the last line.
      if (lines.length === maxLines) {
        const remaining = words.slice(
          lines.join(' ').split(/\s+/).filter(Boolean).length,
        );
        if (remaining.length > 0) {
          const last = lines[maxLines - 1];
          lines[maxLines - 1] =
            last.length > maxChars - 1 ? last.slice(0, maxChars - 1) + '…' : last + '…';
        }
      }
      return lines;
    }

    function formatAmount(amount: number): string {
      if (Math.abs(amount) >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
      if (Math.abs(amount) >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
      if (Math.abs(amount) >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
      return `$${amount.toLocaleString()}`;
    }

    function leafClicked(event: any, p: d3.HierarchyRectangularNode<Node>) {
      // For leaf nodes, just fire onClick and maybe select it
      const nodePath = p.ancestors().map(n => n.data.name).reverse();
      onClick(p.data, nodePath);
    }

    function clicked(event: any, p: d3.HierarchyRectangularNode<Node>) {
      parent.datum(p.parent || root);

      currentFocus = p;
      const nodePath = p.ancestors().map(n => n.data.name).reverse();
      onClick(p.data, nodePath);
      updateCenterText(p);

      root.each(d => {
        d.target = {
          x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
          x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
          y0: Math.max(0, d.y0 - p.depth),
          y1: Math.max(0, d.y1 - p.depth)
        } as any;
      });

      const t = svg.transition().duration(750);

      // Transition the data on all arcs, even the ones that aren’t visible,
      // so that if this transition is interrupted, entering arcs will start
      // the next transition from the desired position.
      path.transition(t as any)
        .tween('data', d => {
          const i = d3.interpolate(d.current || d, d.target);
          return t => { d.current = i(t); };
        })
        .filter(function(d) {
          return +this.getAttribute('fill-opacity')! || arcVisible(d.target);
        })
        .attr('fill-opacity', d => arcVisible(d.target) ? (d.children ? 0.8 : 0.6) : 0)
        .attr('pointer-events', d => arcVisible(d.target) ? 'auto' : 'none')
        .attrTween('d', d => () => arc(d.current as any) as string);

      label.filter(function(d) {
          return +this.getAttribute('fill-opacity')! || labelVisible(d.target);
        }).transition(t as any)
        .attr('fill-opacity', d => +labelVisible(d.target))
        .attrTween('transform', d => () => labelTransform(d.current));
    }
    
    // Add window resize listener
    const handleResize = () => {
      // Re-trigger layout
      // A full React re-render would be better, but doing a manual update works too.
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);

  }, [data, onClick, onHover]);

  return (
    <div ref={wrapperRef} className="sunburst-wrapper w-full h-full flex items-center justify-center">
      <svg ref={svgRef}></svg>
    </div>
  );
};
