import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { Entity, Relationship, TimelineVariant } from '../store/appStore';
import { useTimelineLayout } from '../hooks/useTimelineLayout';
import type { TimelineLane } from '../hooks/useTimelineLayout';

/* ================================================================
   TimelineExplorer — Multi-dimensional timeline swim-lane editor
   ================================================================ */

interface TimelineExplorerProps {
    entities: Entity[];
    relationships: Relationship[];
    timelines: Entity[];
    variants: TimelineVariant[];
    focusedTimelineId: string | null;
    onEntitySelect: (entity: Entity) => void;
    selectedEntityId: string | null;
    onReorderEntity?: (entityId: string, newSortOrder: number) => void;
    onMoveToTimeline?: (entityId: string, timelineId: string | null) => void;
}

export default function TimelineExplorer({
    entities,
    relationships,
    timelines,
    variants,
    focusedTimelineId,
    onEntitySelect,
    selectedEntityId,
    onReorderEntity,
    onMoveToTimeline,
}: TimelineExplorerProps) {
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
    const [showCausality, setShowCausality] = useState(true);

    const {
        lanes,
        eventNodes,
        causalArrows,
        conflicts,
        totalWidth,
        LANE_LABEL_W,
        EVENT_W,
        EVENT_H,
    } = useTimelineLayout(entities, relationships, timelines, variants, focusedTimelineId);

    // ─── Resize ─────────────────────────────────────────────────
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(entries => {
            const { width, height } = entries[0].contentRect;
            setDimensions({ width, height });
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // ─── Render ─────────────────────────────────────────────────
    useEffect(() => {
        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        const g = svg.append('g').attr('class', 'timeline-root');

        // Zoom
        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.15, 3])
            .on('zoom', (event) => g.attr('transform', event.transform));
        svg.call(zoom as any);

        const canvasW = Math.max(totalWidth, dimensions.width);

        // ─── Lanes ──────────────────────────────────────────────
        const laneG = g.append('g').attr('class', 'lanes');
        for (const lane of lanes) {
            if (lane.collapsed) {
                // Collapsed lane: thin indicator bar
                laneG.append('rect')
                    .attr('x', 0)
                    .attr('y', lane.y)
                    .attr('width', canvasW)
                    .attr('height', lane.height)
                    .attr('fill', lane.color + '06')
                    .attr('stroke', lane.color + '15')
                    .attr('stroke-width', 0.5)
                    .attr('rx', 3);

                laneG.append('text')
                    .attr('x', 10)
                    .attr('y', lane.y + lane.height / 2 + 4)
                    .text(`${lane.label}`)
                    .attr('fill', lane.color)
                    .attr('font-size', 9)
                    .attr('font-weight', 500)
                    .attr('opacity', 0.4);

                laneG.append('text')
                    .attr('x', LANE_LABEL_W - 16)
                    .attr('y', lane.y + lane.height / 2 + 3)
                    .text('(empty)')
                    .attr('fill', lane.color)
                    .attr('font-size', 8)
                    .attr('text-anchor', 'end')
                    .attr('opacity', 0.25);
            } else {
                // Full lane with alternating background
                const idx = lanes.indexOf(lane);
                const bgOpacity = idx % 2 === 0 ? '0a' : '06';

                laneG.append('rect')
                    .attr('x', 0)
                    .attr('y', lane.y)
                    .attr('width', canvasW)
                    .attr('height', lane.height)
                    .attr('fill', lane.color + bgOpacity)
                    .attr('stroke', lane.color + '25')
                    .attr('stroke-width', 1)
                    .attr('rx', 4);

                // Left color accent bar
                laneG.append('rect')
                    .attr('x', 0)
                    .attr('y', lane.y + 4)
                    .attr('width', 3)
                    .attr('height', lane.height - 8)
                    .attr('fill', lane.color)
                    .attr('opacity', 0.6)
                    .attr('rx', 1.5);

                // Lane label
                laneG.append('text')
                    .attr('x', 10)
                    .attr('y', lane.y + 18)
                    .text(lane.label.length > 22 ? lane.label.slice(0, 20) + '…' : lane.label)
                    .attr('fill', lane.color)
                    .attr('font-size', 11)
                    .attr('font-weight', 600)
                    .attr('opacity', 0.9);

                // Event count badge
                const badge = laneG.append('g')
                    .attr('transform', `translate(${LANE_LABEL_W - 20}, ${lane.y + 8})`);
                badge.append('rect')
                    .attr('width', 22)
                    .attr('height', 16)
                    .attr('rx', 8)
                    .attr('fill', lane.color + '30');
                badge.append('text')
                    .attr('x', 11)
                    .attr('y', 12)
                    .text(String(lane.eventCount))
                    .attr('fill', lane.color)
                    .attr('font-size', 9)
                    .attr('font-weight', 700)
                    .attr('text-anchor', 'middle');

                // Timeline axis line
                laneG.append('line')
                    .attr('x1', LANE_LABEL_W)
                    .attr('y1', lane.y + lane.height / 2)
                    .attr('x2', canvasW)
                    .attr('y2', lane.y + lane.height / 2)
                    .attr('stroke', lane.color + '12')
                    .attr('stroke-width', 1)
                    .attr('stroke-dasharray', '4,4');
            }
        }

        // ─── Causal arrows ──────────────────────────────────────
        if (showCausality && causalArrows.length > 0) {
            const arrowG = g.append('g').attr('class', 'causal-arrows');

            svg.select('defs').remove();
            svg.append('defs')
                .append('marker')
                .attr('id', 'tl-arrow')
                .attr('viewBox', '0 -5 10 10')
                .attr('refX', 8)
                .attr('refY', 0)
                .attr('markerWidth', 6)
                .attr('markerHeight', 6)
                .attr('orient', 'auto')
                .append('path')
                .attr('d', 'M0,-5L10,0L0,5')
                .attr('fill', '#f59e0b');

            for (const arrow of causalArrows) {
                const dx = arrow.toX - arrow.fromX;
                const dy = arrow.toY - arrow.fromY;
                const dr = Math.sqrt(dx * dx + dy * dy) * 0.6;

                arrowG.append('path')
                    .attr('d', `M${arrow.fromX},${arrow.fromY}A${dr},${dr} 0 0,1 ${arrow.toX},${arrow.toY}`)
                    .attr('fill', 'none')
                    .attr('stroke', '#f59e0b')
                    .attr('stroke-width', 1.5)
                    .attr('stroke-opacity', 0.5)
                    .attr('stroke-dasharray', '5,3')
                    .attr('marker-end', 'url(#tl-arrow)');

                const midX = (arrow.fromX + arrow.toX) / 2;
                const midY = (arrow.fromY + arrow.toY) / 2 - 8;
                arrowG.append('text')
                    .attr('x', midX)
                    .attr('y', midY)
                    .text(arrow.type)
                    .attr('font-size', 8)
                    .attr('fill', '#f59e0b')
                    .attr('text-anchor', 'middle')
                    .attr('opacity', 0.6);
            }
        }

        // ─── Event cards ────────────────────────────────────────
        const eventG = g.append('g').attr('class', 'events');

        for (const node of eventNodes) {
            const eg = eventG.append('g')
                .attr('transform', `translate(${node.x},${node.y})`)
                .attr('cursor', 'pointer');

            const lane = lanes.find((l: TimelineLane) => l.id === node.laneId);
            const isSelected = node.entity.id === selectedEntityId;
            const borderColor = node.hasConflict ? '#ef4444' : isSelected ? '#6366f1' : (lane?.color || '#4b5563');

            eg.append('rect')
                .attr('width', EVENT_W)
                .attr('height', EVENT_H)
                .attr('rx', 6)
                .attr('fill', 'var(--bg-secondary, #1e1e2e)')
                .attr('stroke', borderColor)
                .attr('stroke-width', isSelected ? 2.5 : 1.2)
                .attr('filter', isSelected ? 'drop-shadow(0 0 8px rgba(99,102,241,0.4))' : 'none');

            // Left accent bar matching lane color
            if (lane) {
                eg.append('rect')
                    .attr('x', 0)
                    .attr('y', 4)
                    .attr('width', 3)
                    .attr('height', EVENT_H - 8)
                    .attr('fill', lane.color)
                    .attr('opacity', 0.7)
                    .attr('rx', 1.5);
            }

            if (node.hasConflict) {
                eg.append('circle')
                    .attr('cx', EVENT_W - 8)
                    .attr('cy', 8)
                    .attr('r', 7)
                    .attr('fill', '#ef4444');
                eg.append('text')
                    .attr('x', EVENT_W - 8)
                    .attr('y', 12)
                    .text('⚠')
                    .attr('font-size', 9)
                    .attr('text-anchor', 'middle')
                    .style('pointer-events', 'none');
                eg.append('title').text(node.conflictReason || 'Temporal conflict');
            }

            // Compact name
            const maxNameLen = EVENT_W > 150 ? 20 : 14;
            const name = node.entity.name.length > maxNameLen
                ? node.entity.name.slice(0, maxNameLen - 2) + '…'
                : node.entity.name;
            eg.append('text')
                .attr('x', 8).attr('y', EVENT_H > 56 ? 22 : 18)
                .text(name)
                .attr('fill', '#e5e7eb')
                .attr('font-size', EVENT_H > 56 ? 11 : 10)
                .attr('font-weight', 600);

            // Description (only if tall enough)
            if (EVENT_H > 56) {
                const desc = node.entity.description || '';
                const maxDescLen = EVENT_W > 150 ? 35 : 20;
                const shortDesc = desc.length > maxDescLen ? desc.slice(0, maxDescLen - 2) + '…' : desc;
                eg.append('text')
                    .attr('x', 8).attr('y', 38)
                    .text(shortDesc)
                    .attr('fill', '#9ca3af')
                    .attr('font-size', 9);
            }

            // Sort order badge
            eg.append('text')
                .attr('x', 8).attr('y', EVENT_H - 6)
                .text(`#${node.entity.sort_order ?? '–'}`)
                .attr('fill', '#6b7280')
                .attr('font-size', 8);

            eg.on('click', () => onEntitySelect(node.entity));

            // Drag for reordering / cross-lane move
            const dragBehavior = d3.drag<SVGGElement, unknown>()
                .on('start', function () {
                    d3.select(this).raise();
                })
                .on('drag', function (event) {
                    d3.select(this).attr('transform', `translate(${event.x},${event.y})`);
                })
                .on('end', function (event) {
                    const targetLane = lanes.find((l: TimelineLane) =>
                        event.y >= l.y && event.y <= l.y + l.height && !l.collapsed
                    );

                    if (targetLane && targetLane.id !== node.laneId) {
                        const tlId = targetLane.id === 'canonical' ? null : targetLane.id;
                        onMoveToTimeline?.(node.entity.id, tlId);
                    } else {
                        const eventsInLane = eventNodes
                            .filter((n) => n.laneId === node.laneId)
                            .sort((a, b) => a.x - b.x);
                        const newIndex = eventsInLane.findIndex((n) => event.x < n.x + EVENT_W / 2);
                        const finalIndex = newIndex === -1 ? eventsInLane.length - 1 : newIndex;
                        onReorderEntity?.(node.entity.id, finalIndex);
                    }
                });

            eg.call(dragBehavior as any);
        }
    }, [eventNodes, lanes, causalArrows, showCausality, dimensions, totalWidth, selectedEntityId, LANE_LABEL_W, EVENT_W, EVENT_H, onEntitySelect, onReorderEntity, onMoveToTimeline]);

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', background: 'var(--bg-primary)' }}>
            {/* Toolbar */}
            <div style={{
                position: 'absolute', top: 8, left: 8, zIndex: 10,
                display: 'flex', gap: 6, alignItems: 'center',
            }}>
                <button
                    onClick={() => setShowCausality(p => !p)}
                    style={{
                        padding: '3px 10px', fontSize: 10, borderRadius: 12,
                        border: '1px solid var(--border)',
                        background: showCausality ? '#f59e0b' : 'var(--bg-secondary)',
                        color: showCausality ? '#000' : 'var(--text-secondary)',
                        cursor: 'pointer', transition: 'all 0.15s',
                    }}
                >
                    {showCausality ? '🔗 Causality On' : '🔗 Causality Off'}
                </button>
            </div>

            {/* Conflict count */}
            {conflicts.length > 0 && (
                <div style={{
                    position: 'absolute', top: 8, right: 8, zIndex: 10,
                    padding: '4px 12px', borderRadius: 12,
                    background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
                    color: '#ef4444', fontSize: 11, fontWeight: 500,
                }}>
                    ⚠ {conflicts.length} temporal {conflicts.length === 1 ? 'conflict' : 'conflicts'}
                </div>
            )}

            <svg
                ref={svgRef}
                width={dimensions.width}
                height={dimensions.height}
                style={{ display: 'block' }}
            />

            <div style={{
                position: 'absolute', bottom: 8, right: 8,
                fontSize: 10, color: 'var(--text-tertiary)',
                background: 'var(--bg-secondary)', padding: '3px 8px', borderRadius: 6,
                border: '1px solid var(--border)',
            }}>
                {lanes.filter(l => !l.collapsed).length} lanes · {eventNodes.length} events · {causalArrows.length} arrows
            </div>
        </div>
    );
}
