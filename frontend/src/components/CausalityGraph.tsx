import { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import type { Entity, Relationship, TimelineVariant } from '../store/appStore';
import { useGraphEngine } from '../hooks/useGraphEngine';
import type { GraphNode, GraphLink } from '../hooks/useGraphEngine';

/* ================================================================
   CausalityGraph — DAG with context zone
   ================================================================
   LEFT: Context zone (entities with no causal edges) in a compact grid
   RIGHT: Causal DAG flow (left → right columns by causal depth)
   Edges: causal = thick arrows, structural = thin dashed
   ================================================================ */

interface CausalityGraphProps {
    entities: Entity[];
    relationships: Relationship[];
    timelines: Entity[];
    variants: TimelineVariant[];
    onEntitySelect: (entity: Entity) => void;
    selectedEntityId: string | null;
    hiddenTypes: Set<string>;
    focusedTimelineId?: string | null;
    onCreateRelationship?: (fromId: string, toId: string) => void;
    onDeleteRelationship?: (id: string) => void;
    onEntityPositionUpdate?: (id: string, x: number, y: number) => void;
}

interface ContextMenu {
    x: number; y: number;
    nodeId: string; entity: Entity;
}

const TYPE_ICONS: Record<string, string> = {
    character: '👤', event: '⚡', timeline: '🕐', arc: '📐',
    theme: '💎', location: '📍', note: '📝', chapter: '📖',
};

export default function CausalityGraph({
    entities,
    relationships,
    timelines,
    variants,
    onEntitySelect,
    selectedEntityId,
    hiddenTypes,
    focusedTimelineId = null,
    onCreateRelationship,
    onDeleteRelationship,
    onEntityPositionUpdate,
}: CausalityGraphProps) {
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
    const [relFilter, setRelFilter] = useState<Set<string> | null>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
    const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
    const [highlightedCharacter, setHighlightedCharacter] = useState<string | null>(null);
    const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
    const draggedPositions = useRef<Map<string, { x: number; y: number }>>(new Map());

    const {
        nodes,
        links,
        relationshipTypes,
        focusedEntityIds,
        maxLayer,
        contextZoneBounds,
        causalCount,
        contextCount,
    } = useGraphEngine(
        entities, relationships, selectedEntityId, hiddenTypes, relFilter,
        timelines, variants, dimensions.width, dimensions.height,
        focusedTimelineId,
    );

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

    // Character path
    const characterPathIds = useRef<Set<string>>(new Set());
    useEffect(() => {
        if (!highlightedCharacter) { characterPathIds.current = new Set(); return; }
        const path = new Set<string>();
        path.add(highlightedCharacter);
        for (const r of relationships) {
            if (r.from_entity_id === highlightedCharacter) path.add(r.to_entity_id);
            if (r.to_entity_id === highlightedCharacter) path.add(r.from_entity_id);
        }
        characterPathIds.current = path;
    }, [highlightedCharacter, relationships]);

    // ─── Draw links ─────────────────────────────────────────────
    const drawLinks = useCallback((
        linkG: d3.Selection<SVGGElement, unknown, null, undefined>,
        linksData: GraphLink[],
        nodeMap: Map<string, GraphNode>,
        isCharMode: boolean,
        charPath: Set<string>,
    ) => {
        linkG.selectAll('*').remove();

        for (const link of linksData) {
            const src = nodeMap.get(link.sourceId);
            const tgt = nodeMap.get(link.targetId);
            if (!src || !tgt) continue;

            const inCharPath = isCharMode && charPath.has(src.id) && charPath.has(tgt.id);
            const isFocused = focusedEntityIds
                ? (focusedEntityIds.has(src.id) && focusedEntityIds.has(tgt.id))
                : false;
            const dimmed = focusedEntityIds
                ? (!focusedEntityIds.has(src.id) || !focusedEntityIds.has(tgt.id))
                : false;

            // Bezier: horizontal flow
            const dx = tgt.x - src.x;
            const cpOffset = Math.max(Math.abs(dx) * 0.35, 40);
            const d = `M${src.x},${src.y} C${src.x + cpOffset},${src.y} ${tgt.x - cpOffset},${tgt.y} ${tgt.x},${tgt.y}`;

            let stroke: string, strokeWidth: number, opacity: number, dashArray = '';

            if (inCharPath) {
                stroke = '#22d3ee'; strokeWidth = 2.5; opacity = 0.9;
            } else if (link.highlighted) {
                stroke = '#f59e0b'; strokeWidth = 2; opacity = 0.8;
            } else if (link.isCausal) {
                stroke = isFocused ? '#818cf8' : '#64748b';
                strokeWidth = isFocused ? 1.6 : 1;
                opacity = dimmed ? 0.05 : (isFocused ? 0.55 : 0.2);
            } else {
                // Structural — thin dashed
                stroke = '#475569';
                strokeWidth = 0.5;
                opacity = dimmed ? 0.02 : 0.1;
                dashArray = '3,4';
            }

            if (isCharMode && !inCharPath) opacity = 0.02;

            const marker = link.isCausal
                ? `url(#${inCharPath ? 'arr-c' : link.highlighted ? 'arr-h' : 'arr-d'})`
                : '';

            linkG.append('path')
                .attr('d', d)
                .attr('fill', 'none')
                .attr('stroke', stroke)
                .attr('stroke-width', strokeWidth)
                .attr('stroke-opacity', opacity)
                .attr('stroke-dasharray', dashArray)
                .attr('marker-end', marker);
        }
    }, [focusedEntityIds]);

    // ─── Main render ────────────────────────────────────────────
    useEffect(() => {
        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();
        const g = svg.append('g').attr('class', 'graph-root');

        // Zoom
        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.05, 4])
            .on('zoom', (event) => g.attr('transform', event.transform));
        svg.call(zoom as any);
        zoomRef.current = zoom;

        // Defs
        const defs = svg.append('defs');
        for (const [id, fill] of [['arr-d', '#64748b80'], ['arr-h', '#f59e0b'], ['arr-c', '#22d3ee']] as const) {
            defs.append('marker')
                .attr('id', id).attr('viewBox', '0 -5 10 10')
                .attr('refX', 20).attr('refY', 0)
                .attr('markerWidth', 5).attr('markerHeight', 5)
                .attr('orient', 'auto')
                .append('path').attr('d', 'M0,-3.5L10,0L0,3.5').attr('fill', fill);
        }

        const glow = defs.append('filter').attr('id', 'glow');
        glow.append('feGaussianBlur').attr('stdDeviation', 3.5).attr('result', 'blur');
        glow.append('feMerge').selectAll('feMergeNode')
            .data(['blur', 'SourceGraphic']).join('feMergeNode').attr('in', d => d);

        // Apply dragged positions
        const nodeMap = new Map<string, GraphNode>();
        for (const n of nodes) {
            const dp = draggedPositions.current.get(n.id);
            if (dp) { n.x = dp.x; n.y = dp.y; }
            nodeMap.set(n.id, n);
        }

        const isCharMode = !!highlightedCharacter;
        const charPath = characterPathIds.current;

        // ─── Context zone background ────────────────────────────
        if (contextCount > 0) {
            const ctxG = g.append('g').attr('class', 'context-zone');

            ctxG.append('rect')
                .attr('x', 10).attr('y', 40)
                .attr('width', contextZoneBounds.width + 20)
                .attr('height', contextZoneBounds.height + 20)
                .attr('rx', 12).attr('ry', 12)
                .attr('fill', '#0f172a')
                .attr('stroke', '#1e293b')
                .attr('stroke-width', 1);

            ctxG.append('text')
                .attr('x', 20).attr('y', 58)
                .attr('font-size', 9).attr('font-weight', 600)
                .attr('fill', '#475569')
                .attr('text-transform', 'uppercase')
                .attr('letter-spacing', '1px')
                .text(`CONTEXT · ${contextCount} entities`);
        }

        // ─── DAG column guides ──────────────────────────────────
        const dagStartX = Math.max(contextZoneBounds.width + 60 + 40, 280);
        const guideG = g.append('g').attr('class', 'guides');

        for (let col = 0; col <= maxLayer; col++) {
            const x = dagStartX + col * 180;

            guideG.append('line')
                .attr('x1', x).attr('y1', -1000)
                .attr('x2', x).attr('y2', 6000)
                .attr('stroke', '#1e293b')
                .attr('stroke-width', 1)
                .attr('stroke-dasharray', '4,10')
                .attr('stroke-opacity', 0.4);

            const label = col === 0 ? '◆ Triggers' : col === maxLayer ? '→ Outcomes' : `Depth ${col}`;
            guideG.append('text')
                .attr('x', x).attr('y', 58)
                .attr('text-anchor', 'middle')
                .attr('font-size', 9)
                .attr('fill', '#334155')
                .attr('font-weight', 500)
                .text(label);
        }

        // ─── Links ──────────────────────────────────────────────
        const linkG = g.append('g').attr('class', 'links');
        drawLinks(linkG, links, nodeMap, isCharMode, charPath);

        // ─── Nodes ──────────────────────────────────────────────
        const nodeG = g.append('g').attr('class', 'nodes');
        const nodeEls = nodeG.selectAll<SVGGElement, GraphNode>('g.node')
            .data(nodes, d => d.id)
            .join('g')
            .attr('class', 'node')
            .attr('transform', d => `translate(${d.x},${d.y})`)
            .attr('cursor', 'pointer');

        // Opacity based on state
        nodeEls.style('opacity', (d: GraphNode) => {
            if (isCharMode) return charPath.has(d.id) ? '1' : '0.08';
            if (focusedEntityIds && !focusedEntityIds.has(d.id)) return '0.12';
            return '1';
        });

        // Timeline ring arcs
        nodeEls.each(function (d) {
            if (d.timelineColors.length === 0) return;
            const el = d3.select(this);
            const r = d.zone === 'context' ? 14 : 16;
            const n = d.timelineColors.length;
            const arcGen = d3.arc<{ startAngle: number; endAngle: number }>()
                .innerRadius(r).outerRadius(r + 2.5);

            for (let i = 0; i < n; i++) {
                el.append('path')
                    .attr('d', arcGen({
                        startAngle: (2 * Math.PI * i) / n,
                        endAngle: (2 * Math.PI * (i + 1)) / n,
                    }) || '')
                    .attr('fill', d.timelineColors[i])
                    .attr('opacity', 0.6);
            }
        });

        // Main circle
        const isCtx = (d: GraphNode) => d.zone === 'context';
        nodeEls.append('circle')
            .attr('r', d => isCtx(d) ? 10 : (d.entity.entity_type === 'character' ? 13 : 11))
            .attr('fill', d => d.color + (isCtx(d) ? '30' : '50'))
            .attr('stroke', d => {
                if (d.entity.id === selectedEntityId) return '#fff';
                if (d.highlighted) return d.color;
                return d.color + (isCtx(d) ? '40' : '60');
            })
            .attr('stroke-width', d => {
                if (d.entity.id === selectedEntityId) return 2.5;
                if (d.highlighted) return 1.5;
                return 0.7;
            });

        // Selected glow
        nodeEls.filter(d => d.entity.id === selectedEntityId)
            .append('circle')
            .attr('r', 18).attr('fill', 'none')
            .attr('stroke', '#fff').attr('stroke-width', 1)
            .attr('stroke-opacity', 0.25)
            .style('filter', 'url(#glow)');

        // Icon
        nodeEls.append('text')
            .text(d => TYPE_ICONS[d.entity.entity_type] || '•')
            .attr('text-anchor', 'middle').attr('dy', 4)
            .attr('font-size', d => isCtx(d) ? 9 : (d.entity.entity_type === 'character' ? 11 : 10))
            .style('pointer-events', 'none');

        // Label
        nodeEls.append('text')
            .text(d => {
                const max = isCtx(d) ? 10 : 13;
                return d.entity.name.length > max ? d.entity.name.slice(0, max - 1) + '…' : d.entity.name;
            })
            .attr('dy', d => isCtx(d) ? 20 : (d.entity.entity_type === 'character' ? 25 : 22))
            .attr('text-anchor', 'middle')
            .attr('font-size', d => isCtx(d) ? 6 : 7)
            .attr('font-weight', d => d.entity.id === selectedEntityId ? 600 : 400)
            .attr('fill', d => {
                if (d.highlighted) return '#e5e7eb';
                if (isCtx(d)) return '#64748b';
                return '#94a3b8';
            })
            .style('pointer-events', 'none');

        // ─── Drag with click detection ──────────────────────────
        let dsx = 0, dsy = 0, wasDrag = false;
        const THRESHOLD = 5;

        const drag = d3.drag<SVGGElement, GraphNode>()
            .on('start', function (event) {
                dsx = event.x; dsy = event.y; wasDrag = false;
                d3.select(this).raise();
            })
            .on('drag', function (event, d) {
                if (Math.abs(event.x - dsx) > THRESHOLD || Math.abs(event.y - dsy) > THRESHOLD) wasDrag = true;
                d.x = event.x; d.y = event.y;
                draggedPositions.current.set(d.id, { x: event.x, y: event.y });
                d3.select(this).attr('transform', `translate(${event.x},${event.y})`);
            })
            .on('end', function (event, d) {
                if (wasDrag) {
                    d.x = event.x; d.y = event.y;
                    draggedPositions.current.set(d.id, { x: event.x, y: event.y });
                    onEntityPositionUpdate?.(d.id, event.x, event.y);
                    drawLinks(linkG, links, nodeMap, isCharMode, charPath);
                } else {
                    handleClick(d);
                }
            });
        nodeEls.call(drag);

        function handleClick(d: GraphNode) {
            if (connectingFrom) {
                if (connectingFrom !== d.id) onCreateRelationship?.(connectingFrom, d.id);
                setConnectingFrom(null);
                return;
            }
            if (d.entity.entity_type === 'character') {
                setHighlightedCharacter(prev => prev === d.id ? null : d.id);
            }
            onEntitySelect(d.entity);
        }

        // Context menu
        nodeEls.on('contextmenu', (event, d) => {
            event.preventDefault(); event.stopPropagation();
            setContextMenu({ x: event.clientX, y: event.clientY, nodeId: d.id, entity: d.entity });
        });

        // Clear on canvas click
        svg.on('click', () => {
            setContextMenu(null);
            setConnectingFrom(null);
            setHighlightedCharacter(null);
        });

    }, [nodes, links, maxLayer, dimensions, contextZoneBounds, contextCount, drawLinks,
        onEntitySelect, onEntityPositionUpdate, onCreateRelationship,
        connectingFrom, highlightedCharacter, selectedEntityId,
        focusedTimelineId, focusedEntityIds]);

    // ─── Toolbar ────────────────────────────────────────────────
    const toggleRelFilter = (type: string) => {
        setRelFilter(prev => {
            if (!prev) return new Set([type]);
            const next = new Set(prev);
            if (next.has(type)) { next.delete(type); return next.size === 0 ? null : next; }
            next.add(type);
            return next;
        });
    };

    const fitView = useCallback(() => {
        const svg = d3.select(svgRef.current);
        if (!svg.node() || !zoomRef.current) return;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const n of nodes) {
            minX = Math.min(minX, n.x - 35);
            minY = Math.min(minY, n.y - 35);
            maxX = Math.max(maxX, n.x + 35);
            maxY = Math.max(maxY, n.y + 35);
        }
        if (!isFinite(minX)) return;
        const bw = maxX - minX || 1;
        const bh = maxY - minY || 1;
        const scale = Math.min(dimensions.width / bw, dimensions.height / bh) * 0.85;
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        svg.transition().duration(400).call(
            zoomRef.current.transform as any,
            d3.zoomIdentity
                .translate(dimensions.width / 2, dimensions.height / 2)
                .scale(Math.min(scale, 1.5))
                .translate(-cx, -cy),
        );
    }, [nodes, dimensions]);

    // Auto fit on first load
    const hasFitted = useRef(false);
    useEffect(() => {
        if (nodes.length > 0 && !hasFitted.current) {
            hasFitted.current = true;
            setTimeout(fitView, 200);
        }
    }, [nodes.length, fitView]);

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', background: '#0a0e1a' }}>
            {/* Filter toolbar */}
            <div style={{
                position: 'absolute', top: 6, left: 8, right: 8, zIndex: 10,
                display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center',
            }}>
                <span style={{ fontSize: 9, color: '#475569', marginRight: 3 }}>⚡ Relations:</span>
                {relationshipTypes.map(type => (
                    <button key={type} onClick={() => toggleRelFilter(type)} style={{
                        padding: '1px 7px', fontSize: 8, borderRadius: 10,
                        border: relFilter?.has(type) ? '1px solid #6366f1' : '1px solid #1e293b',
                        background: relFilter?.has(type) ? '#6366f118' : '#0f172a',
                        color: relFilter?.has(type) ? '#818cf8' : '#475569',
                        cursor: 'pointer', textTransform: 'capitalize',
                    }}>{type.replace(/_/g, ' ')}</button>
                ))}
                {relFilter && (
                    <button onClick={() => setRelFilter(null)} style={{
                        padding: '1px 7px', fontSize: 8, borderRadius: 10,
                        border: '1px solid #1e293b', background: 'transparent',
                        color: '#334155', cursor: 'pointer',
                    }}>Clear</button>
                )}
                <div style={{ flex: 1 }} />
                <button onClick={fitView} style={{
                    padding: '2px 8px', fontSize: 9, borderRadius: 6,
                    border: '1px solid #1e293b', background: '#0f172a',
                    color: '#94a3b8', cursor: 'pointer',
                }}>⊞ Fit</button>
            </div>

            {/* Focus + character trace indicators */}
            {focusedTimelineId && (
                <div style={{
                    position: 'absolute', top: 30, left: 8, zIndex: 10,
                    padding: '3px 10px', borderRadius: 8,
                    background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
                    color: '#818cf8', fontSize: 9, fontWeight: 500,
                }}>
                    🔭 {timelines.find(t => t.id === focusedTimelineId)?.name}
                </div>
            )}
            {highlightedCharacter && (
                <div style={{
                    position: 'absolute', top: focusedTimelineId ? 52 : 30, left: 8, zIndex: 10,
                    padding: '3px 10px', borderRadius: 8,
                    background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.2)',
                    color: '#22d3ee', fontSize: 9, fontWeight: 500,
                }}>
                    👤 {entities.find(e => e.id === highlightedCharacter)?.name}
                    <button onClick={() => setHighlightedCharacter(null)} style={{
                        marginLeft: 6, background: 'none', border: 'none', color: '#22d3ee', cursor: 'pointer', fontSize: 9,
                    }}>✕</button>
                </div>
            )}

            {/* Legend */}
            <div style={{
                position: 'absolute', bottom: 28, left: 8, zIndex: 10,
                display: 'flex', gap: 8, padding: '3px 8px', borderRadius: 6,
                background: '#0f172a', border: '1px solid #1e293b', fontSize: 7, color: '#334155',
            }}>
                <span>━ Causal</span>
                <span>╌ Structural</span>
                <span>🌈 Ring = Timeline</span>
                <span>👤 Click char = trace</span>
                <span>◆ Triggers → Outcomes</span>
            </div>

            {/* Connection mode */}
            {connectingFrom && (
                <div style={{
                    position: 'absolute', bottom: 52, left: '50%', transform: 'translateX(-50%)',
                    padding: '5px 14px', borderRadius: 20,
                    background: 'rgba(99,102,241,0.85)', color: '#fff',
                    fontSize: 10, fontWeight: 500, zIndex: 10,
                }}>🔗 Click target — ESC cancel</div>
            )}

            <svg ref={svgRef} width={dimensions.width} height={dimensions.height}
                style={{ display: 'block' }}
                onKeyDown={e => { if (e.key === 'Escape') { setConnectingFrom(null); setHighlightedCharacter(null); } }}
                tabIndex={0}
            />

            {/* Context Menu */}
            {contextMenu && (
                <div style={{
                    position: 'fixed', left: contextMenu.x, top: contextMenu.y,
                    background: '#1e293b', border: '1px solid #334155',
                    borderRadius: 8, padding: 3, minWidth: 150, zIndex: 100,
                    boxShadow: '0 8px 28px rgba(0,0,0,0.5)',
                }} onClick={() => setContextMenu(null)}>
                    <div style={{ padding: '5px 10px', color: '#475569', fontSize: 8, fontWeight: 600, textTransform: 'uppercase' }}>
                        {contextMenu.entity.name}
                    </div>
                    <button onClick={() => { onEntitySelect(contextMenu.entity); setContextMenu(null); }} style={menuStyle}>
                        📋 Details
                    </button>
                    <button onClick={() => { setConnectingFrom(contextMenu.nodeId); setContextMenu(null); }} style={menuStyle}>
                        🔗 Connect To…
                    </button>
                    {contextMenu.entity.entity_type === 'character' && (
                        <button onClick={() => { setHighlightedCharacter(contextMenu.nodeId); setContextMenu(null); }} style={menuStyle}>
                            🔍 Trace
                        </button>
                    )}
                    {relationships
                        .filter(r => r.from_entity_id === contextMenu.nodeId || r.to_entity_id === contextMenu.nodeId)
                        .slice(0, 5)
                        .map(r => {
                            const other = r.from_entity_id === contextMenu.nodeId
                                ? entities.find(e => e.id === r.to_entity_id)
                                : entities.find(e => e.id === r.from_entity_id);
                            return (
                                <button key={r.id}
                                    onClick={() => { onDeleteRelationship?.(r.id); setContextMenu(null); }}
                                    style={{ ...menuStyle, color: '#ef4444' }}>
                                    ✕ {r.relationship_type} → {other?.name?.slice(0, 18) || '?'}
                                </button>
                            );
                        })}
                </div>
            )}

            {/* Stats */}
            <div style={{
                position: 'absolute', bottom: 6, right: 8, fontSize: 8, color: '#334155',
                background: '#0f172a', padding: '2px 6px', borderRadius: 4, border: '1px solid #1e293b',
            }}>
                {causalCount} causal · {contextCount} context · {links.length} edges · {maxLayer + 1} layers
            </div>
        </div>
    );
}

const menuStyle: React.CSSProperties = {
    display: 'block', width: '100%', textAlign: 'left',
    padding: '5px 10px', background: 'none', border: 'none',
    color: '#e2e8f0', fontSize: 10, cursor: 'pointer', borderRadius: 4,
};
