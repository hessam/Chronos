import { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import type { Entity } from '../store/appStore';

interface TimelineCanvasProps {
    entities: Entity[];
    onEntitySelect: (entity: Entity) => void;
    selectedEntityId?: string | null;
}

// ─── Color Palette ──────────────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
    character: '#6366f1',  // indigo
    timeline: '#06b6d4',   // cyan
    event: '#f59e0b',      // amber
    arc: '#8b5cf6',        // violet
    theme: '#ec4899',      // pink
    location: '#10b981',   // emerald
    note: '#94a3b8',       // slate
};

const TYPE_ICONS: Record<string, string> = {
    character: '👤',
    timeline: '⏱',
    event: '⚡',
    arc: '📈',
    theme: '💡',
    location: '📍',
    note: '📝',
};

// ─── Layout helpers ─────────────────────────────────────────
interface PositionedNode {
    entity: Entity;
    x: number;
    y: number;
    color: string;
}

function layoutNodes(entities: Entity[]): PositionedNode[] {
    // Group entities by type and place them in swim-lanes
    const timelines = entities.filter(e => e.entity_type === 'timeline');
    const events = entities.filter(e => e.entity_type === 'event');
    const characters = entities.filter(e => e.entity_type === 'character');
    const others = entities.filter(e =>
        !['timeline', 'event', 'character'].includes(e.entity_type)
    );

    const nodes: PositionedNode[] = [];
    const laneHeight = 120;
    const nodeSpacing = 200;
    let currentLane = 0;

    // Timelines as horizontal swim-lanes
    timelines.forEach((entity, i) => {
        const hasPos = entity.position_x !== 0 || entity.position_y !== 0;
        nodes.push({
            entity,
            x: hasPos ? entity.position_x : 80,
            y: hasPos ? entity.position_y : 100 + i * laneHeight,
            color: entity.color || TYPE_COLORS.timeline,
        });
        currentLane = i + 1;
    });

    // Events spread horizontally
    events.forEach((entity, i) => {
        const hasPos = entity.position_x !== 0 || entity.position_y !== 0;
        nodes.push({
            entity,
            x: hasPos ? entity.position_x : 200 + i * nodeSpacing,
            y: hasPos ? entity.position_y : 100 + currentLane * laneHeight,
            color: entity.color || TYPE_COLORS.event,
        });
    });
    if (events.length > 0) currentLane++;

    // Characters in a row
    characters.forEach((entity, i) => {
        const hasPos = entity.position_x !== 0 || entity.position_y !== 0;
        nodes.push({
            entity,
            x: hasPos ? entity.position_x : 200 + i * nodeSpacing,
            y: hasPos ? entity.position_y : 100 + currentLane * laneHeight,
            color: entity.color || TYPE_COLORS.character,
        });
    });
    if (characters.length > 0) currentLane++;

    // Others
    others.forEach((entity, i) => {
        const hasPos = entity.position_x !== 0 || entity.position_y !== 0;
        nodes.push({
            entity,
            x: hasPos ? entity.position_x : 200 + i * nodeSpacing,
            y: hasPos ? entity.position_y : 100 + currentLane * laneHeight,
            color: entity.color || TYPE_COLORS[entity.entity_type] || '#64748b',
        });
    });

    return nodes;
}

// ─── Component ──────────────────────────────────────────────
export default function TimelineCanvas({ entities, onEntitySelect, selectedEntityId }: TimelineCanvasProps) {
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

    // Resize observer
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const resizeObserver = new ResizeObserver((entries) => {
            const { width, height } = entries[0].contentRect;
            setDimensions({ width: Math.max(width, 400), height: Math.max(height, 300) });
        });
        resizeObserver.observe(container);
        return () => resizeObserver.disconnect();
    }, []);

    const renderCanvas = useCallback(() => {
        if (!svgRef.current) return;
        const svg = d3.select(svgRef.current);

        svg.selectAll('*').remove();

        const { width, height } = dimensions;
        svg.attr('width', width).attr('height', height);

        // ─── Defs: gradients, filters ────────────────────
        const defs = svg.append('defs');

        // Glow filter
        const filter = defs.append('filter').attr('id', 'glow');
        filter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'coloredBlur');
        const feMerge = filter.append('feMerge');
        feMerge.append('feMergeNode').attr('in', 'coloredBlur');
        feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

        // Selected glow
        const selFilter = defs.append('filter').attr('id', 'selectedGlow');
        selFilter.append('feGaussianBlur').attr('stdDeviation', '6').attr('result', 'coloredBlur');
        const selMerge = selFilter.append('feMerge');
        selMerge.append('feMergeNode').attr('in', 'coloredBlur');
        selMerge.append('feMergeNode').attr('in', 'SourceGraphic');

        // ─── Zoom behavior ───────────────────────────────
        const g = svg.append('g').attr('class', 'canvas-root');

        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 4])
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
            });

        (svg as unknown as d3.Selection<SVGSVGElement, unknown, null, undefined>).call(zoom);

        // ─── Background grid ─────────────────────────────
        const gridSize = 40;
        const gridGroup = g.append('g').attr('class', 'grid');

        for (let x = 0; x < width * 3; x += gridSize) {
            gridGroup.append('line')
                .attr('x1', x - width).attr('y1', -height)
                .attr('x2', x - width).attr('y2', height * 2)
                .attr('stroke', 'rgba(255,255,255,0.03)')
                .attr('stroke-width', 1);
        }
        for (let y = 0; y < height * 3; y += gridSize) {
            gridGroup.append('line')
                .attr('x1', -width).attr('y1', y - height)
                .attr('x2', width * 2).attr('y2', y - height)
                .attr('stroke', 'rgba(255,255,255,0.03)')
                .attr('stroke-width', 1);
        }

        // ─── Layout ──────────────────────────────────────
        const nodes = layoutNodes(entities);

        if (nodes.length === 0) return;

        // ─── Timeline swim-lane lines ────────────────────
        const timelineNodes = nodes.filter(n => n.entity.entity_type === 'timeline');
        timelineNodes.forEach(tl => {
            g.append('line')
                .attr('x1', tl.x - 20)
                .attr('y1', tl.y)
                .attr('x2', tl.x + width * 2)
                .attr('y2', tl.y)
                .attr('stroke', tl.color)
                .attr('stroke-opacity', 0.15)
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', '8 4');
        });

        // ─── Entity nodes ────────────────────────────────
        const nodeGroup = g.selectAll('.entity-node')
            .data(nodes, (d: unknown) => (d as PositionedNode).entity.id)
            .join('g')
            .attr('class', 'entity-node')
            .attr('transform', d => `translate(${d.x}, ${d.y})`)
            .style('cursor', 'pointer');

        // Drag behavior
        const drag = d3.drag<SVGGElement, PositionedNode>()
            .on('start', function () {
                d3.select(this).raise();
            })
            .on('drag', function (event, d) {
                d.x = event.x;
                d.y = event.y;
                d3.select(this).attr('transform', `translate(${d.x}, ${d.y})`);
            });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nodeGroup.call(drag as any);

        // Node background (rounded rect)
        nodeGroup.append('rect')
            .attr('x', -70)
            .attr('y', -28)
            .attr('width', 140)
            .attr('height', 56)
            .attr('rx', 12)
            .attr('ry', 12)
            .attr('fill', d => {
                const c = d3.color(d.color);
                return c ? c.copy({ opacity: 0.12 }).toString() : 'rgba(99,102,241,0.12)';
            })
            .attr('stroke', d => d.entity.id === selectedEntityId ? d.color : 'rgba(255,255,255,0.08)')
            .attr('stroke-width', d => d.entity.id === selectedEntityId ? 2 : 1)
            .attr('filter', d => d.entity.id === selectedEntityId ? 'url(#selectedGlow)' : 'none');

        // Colored accent bar
        nodeGroup.append('rect')
            .attr('x', -70)
            .attr('y', -28)
            .attr('width', 4)
            .attr('height', 56)
            .attr('rx', 2)
            .attr('fill', d => d.color);

        // Type icon
        nodeGroup.append('text')
            .attr('x', -52)
            .attr('y', 5)
            .attr('font-size', '16px')
            .attr('text-anchor', 'middle')
            .text(d => TYPE_ICONS[d.entity.entity_type] || '📋');

        // Entity name
        nodeGroup.append('text')
            .attr('x', -38)
            .attr('y', -6)
            .attr('font-size', '12px')
            .attr('font-weight', '600')
            .attr('fill', '#e2e8f0')
            .attr('font-family', 'Inter, sans-serif')
            .text(d => {
                const name = d.entity.name;
                return name.length > 14 ? name.slice(0, 13) + '…' : name;
            });

        // Entity type label
        nodeGroup.append('text')
            .attr('x', -38)
            .attr('y', 10)
            .attr('font-size', '10px')
            .attr('fill', '#94a3b8')
            .attr('font-family', 'Inter, sans-serif')
            .attr('text-transform', 'capitalize')
            .text(d => d.entity.entity_type);

        // Click handler
        nodeGroup.on('click', (_event, d) => {
            onEntitySelect(d.entity);
        });

        // Hover effects
        nodeGroup
            .on('mouseenter', function (_, d) {
                d3.select(this).select('rect:first-child')
                    .transition().duration(150)
                    .attr('stroke', d.color)
                    .attr('stroke-width', 2)
                    .attr('filter', 'url(#glow)');
            })
            .on('mouseleave', function (_, d) {
                const isSelected = d.entity.id === selectedEntityId;
                d3.select(this).select('rect:first-child')
                    .transition().duration(150)
                    .attr('stroke', isSelected ? d.color : 'rgba(255,255,255,0.08)')
                    .attr('stroke-width', isSelected ? 2 : 1)
                    .attr('filter', isSelected ? 'url(#selectedGlow)' : 'none');
            });

        // ─── Fit to content on initial render ────────────
        if (nodes.length > 0) {
            const padding = 80;
            const xs = nodes.map(n => n.x);
            const ys = nodes.map(n => n.y);
            const minX = Math.min(...xs) - padding;
            const minY = Math.min(...ys) - padding;
            const maxX = Math.max(...xs) + padding;
            const maxY = Math.max(...ys) + padding;
            const contentWidth = maxX - minX + 140;
            const contentHeight = maxY - minY + 56;

            const scale = Math.min(
                width / contentWidth,
                height / contentHeight,
                1.5
            );
            const translateX = (width - contentWidth * scale) / 2 - minX * scale;
            const translateY = (height - contentHeight * scale) / 2 - minY * scale;

            (svg as unknown as d3.Selection<SVGSVGElement, unknown, null, undefined>).call(
                zoom.transform,
                d3.zoomIdentity.translate(translateX, translateY).scale(scale)
            );
        }
    }, [entities, dimensions, selectedEntityId, onEntitySelect]);

    useEffect(() => {
        renderCanvas();
    }, [renderCanvas]);

    return (
        <div
            ref={containerRef}
            style={{
                width: '100%',
                height: '100%',
                position: 'relative',
                overflow: 'hidden',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-primary)',
            }}
        >
            <svg
                ref={svgRef}
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'block',
                }}
            />

            {/* Empty state */}
            {entities.length === 0 && (
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>🌌</div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-md)', fontWeight: 600 }}>
                        Timeline Canvas
                    </p>
                    <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)', maxWidth: 320, textAlign: 'center', marginTop: 4 }}>
                        Create timelines, events, and characters in the sidebar to see them visualized here.
                    </p>
                </div>
            )}

            {/* Controls overlay */}
            <div style={{
                position: 'absolute',
                bottom: 12,
                right: 12,
                display: 'flex',
                gap: 4,
                background: 'rgba(15,23,42,0.8)',
                backdropFilter: 'blur(8px)',
                borderRadius: 8,
                padding: 4,
                border: '1px solid rgba(255,255,255,0.06)',
            }}>
                <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                        if (!svgRef.current) return;
                        const s = d3.select(svgRef.current) as unknown as d3.Selection<SVGSVGElement, unknown, null, undefined>;
                        s.transition().duration(300).call(d3.zoom<SVGSVGElement, unknown>().scaleBy, 1.3);
                    }}
                    title="Zoom in"
                    style={{ fontSize: 16, width: 32, height: 32, padding: 0 }}
                >+</button>
                <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                        if (!svgRef.current) return;
                        const s = d3.select(svgRef.current) as unknown as d3.Selection<SVGSVGElement, unknown, null, undefined>;
                        s.transition().duration(300).call(d3.zoom<SVGSVGElement, unknown>().scaleBy, 0.7);
                    }}
                    title="Zoom out"
                    style={{ fontSize: 16, width: 32, height: 32, padding: 0 }}
                >−</button>
                <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => renderCanvas()}
                    title="Reset view"
                    style={{ fontSize: 12, width: 32, height: 32, padding: 0 }}
                >⟲</button>
            </div>

            {/* Legend */}
            <div style={{
                position: 'absolute',
                top: 12,
                right: 12,
                display: 'flex',
                gap: 12,
                background: 'rgba(15,23,42,0.7)',
                backdropFilter: 'blur(8px)',
                borderRadius: 8,
                padding: '6px 12px',
                border: '1px solid rgba(255,255,255,0.06)',
                fontSize: 11,
                color: 'var(--text-tertiary)',
            }}>
                {Object.entries(TYPE_COLORS).slice(0, 4).map(([type, color]) => (
                    <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                        <span style={{ textTransform: 'capitalize' }}>{type}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
