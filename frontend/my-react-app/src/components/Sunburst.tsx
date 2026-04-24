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
        
      onHover(d.data, event.clientX, event.clientY);
    })
    .on('mouseleave', (event, d) => {
      d3.select(event.currentTarget as Element)
        .style('stroke', '#fff')
        .style('stroke-width', '0.5px')
        .attr('fill-opacity', arcVisible(d.current || d) ? (d.children ? 0.8 : 0.6) : 0);
        
      onHover(null, 0, 0);
    });

    const format = d3.format(',d');
    path.append('title')
      .text(d => `${d.ancestors().map(d => d.data.name).reverse().join('/')}\n${d.value ? format(d.value) : ''}`);

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
      .text(d => d.data.name.length > 20 ? d.data.name.slice(0, 20) + '...' : d.data.name)
      .style('fill', '#1f2937') // Dark text for contrast
      .style('font-weight', '500')
      .style('font-family', 'var(--font-primary)');

    const parent = svg.append('circle')
      .datum(root)
      .attr('r', radius)
      .attr('fill', 'none')
      .attr('pointer-events', 'all')
      .on('click', clicked);

    // Center text showing current root
    const centerText = svg.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0em')
      .style('pointer-events', 'none')
      .style('font-family', 'var(--font-primary)')
      .style('fill', 'var(--text-main)')
      .style('font-size', '14px')
      .style('font-weight', '600');
    
    const centerSubText = svg.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '1.5em')
      .style('pointer-events', 'none')
      .style('font-family', 'var(--font-secondary)')
      .style('fill', 'var(--text-muted)')
      .style('font-size', '12px');

    function updateCenterText(p: d3.HierarchyRectangularNode<Node>) {
      const name = p.data.name;
      centerText.text(name.length > 25 ? name.slice(0, 25) + '...' : name);
      
      const total = p.value || 0;
      if (p.data.amount !== null || total > 0) {
        centerSubText.text(total > 1000000 ? `$${(total/1000000).toFixed(1)}M` : total.toString());
      } else {
        centerSubText.text('');
      }
    }
    
    updateCenterText(root);

    // Tween functions
    function arcVisible(d: any) {
      return d.y1 <= 4 && d.y0 >= 1 && d.x1 > d.x0;
    }

    function labelVisible(d: any) {
      return d.y1 <= 4 && d.y0 >= 1 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.05;
    }

    function labelTransform(d: any) {
      const x = (d.x0 + d.x1) / 2 * 180 / Math.PI;
      const y = (d.y0 + d.y1) / 2 * radius;
      return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
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
