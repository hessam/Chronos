import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import type { Entity, Relationship, TimelineVariant } from '../store/appStore';
import { resolveEntity } from '../store/appStore';

/* ================================================================
   TimelineCanvas — Mission Control Edition
   SpaceX-grade narrative visualization
   ================================================================ */

// ─── Props ──────────────────────────────────────────────────────
interface TimelineCanvasProps {
    entities: Entity[];
    relationships?: Relationship[];
    onEntitySelect: (entity: Entity) => void;
    selectedEntityId?: string | null;
    onEntityPositionUpdate?: (entityId: string, x: number, y: number) => void;
    hiddenTypes?: Set<string>;
    onCreateRelationship?: (fromId: string, toId: string) => void;
    onDeleteRelationship?: (relId: string) => void;
    consistencyStatus?: Map<string, 'ok' | 'warning' | 'error'>;
    entityVariantCounts?: Map<string, number>;
    viewMode?: 'type' | 'timeline';
    focusedTimelineId?: string | null;
    variants?: TimelineVariant[];
    timelines?: Entity[];
}

// ─── Color Palette ──────────────────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
    character: '#6366f1',  // indigo
    timeline: '#06b6d4',  // cyan
    event: '#f59e0b',  // amber
    arc: '#8b5cf6',  // violet
    theme: '#ec4899',  // pink
    location: '#10b981',  // emerald
    note: '#94a3b8',  // slate
    chapter: '#f97316',  // orange
};

const TYPE_ICONS: Record<string, string> = {
    character: '👤',
    timeline: '⏱',
    event: '⚡',
    arc: '📈',
    theme: '💡',
    location: '📍',
    note: '📝',
    chapter: '📖',
};

// ─── Status colors ──────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
    ok: '#00cc66',
    warning: '#ffb800',
    error: '#ff4444',
};

// ─── Emotion color gradient (red ← amber ← neutral → amber → green) ─
function emotionColor(level: number): string {
    if (level <= -5) return '#ef4444';
    if (level <= -3) return '#f97316';
    if (level <= -1) return '#f59e0b';
    if (level === 0) return '#94a3b8';
    if (level <= 2) return '#84cc16';
    if (level <= 4) return '#22c55e';
    return '#10b981';
}
function getEmotionLevel(entity: Entity): number {
    const props = entity.properties as Record<string, unknown> | undefined;
    return typeof props?.emotion_level === 'number' ? props.emotion_level : 0;
}

// ─── Layout & sizing constants ──────────────────────────────────
const NODE_W = 300;
const NODE_H = 130;
const NODE_R = 12;
const LANE_H = 200;
const LANE_GAP = 16;
const NODE_SPACING = 350;
const LANE_LABEL_W = 180;
const SNAP_SIZE = 20;
const DOT_SPACING = 24;

function snap(v: number): number {
    return Math.round(v / SNAP_SIZE) * SNAP_SIZE;
}

// ─── Layout types ───────────────────────────────────────────────
interface PositionedNode {
    entity: Entity;
    x: number;
    y: number;
    color: string;
    laneIndex: number;
}

type LaneDef = { type: string; label: string; color: string; count: number };

function buildLanes(entities: Entity[]): LaneDef[] {
    const seen = new Set<string>();
    const lanes: LaneDef[] = [];
    const order = ['timeline', 'event', 'character', 'arc', 'theme', 'location', 'note'];
    for (const t of order) {
        const count = entities.filter(e => e.entity_type === t).length;
        if (count > 0) {
            seen.add(t);
            lanes.push({
                type: t,
                label: t.charAt(0).toUpperCase() + t.slice(1) + 's',
                color: TYPE_COLORS[t] || '#64748b',
                count,
            });
        }
    }
    for (const e of entities) {
        if (!seen.has(e.entity_type)) {
            seen.add(e.entity_type);
            const count = entities.filter(x => x.entity_type === e.entity_type).length;
            lanes.push({
                type: e.entity_type,
                label: e.entity_type,
                color: TYPE_COLORS[e.entity_type] || '#64748b',
                count,
            });
        }
    }
    return lanes;
}

function layoutNodes(entities: Entity[], hiddenTypes: Set<string>): { nodes: PositionedNode[]; lanes: LaneDef[] } {
    const visibleEntities = entities.filter(e => !hiddenTypes.has(e.entity_type));
    const lanes = buildLanes(visibleEntities);
    const nodes: PositionedNode[] = [];

    lanes.forEach((lane, laneIdx) => {
        const laneEntities = visibleEntities.filter(e => e.entity_type === lane.type);
        const laneY = 50 + laneIdx * (LANE_H + LANE_GAP);
        laneEntities.forEach((entity, i) => {
            nodes.push({
                entity,
                x: LANE_LABEL_W + 40 + i * NODE_SPACING,
                y: laneY + LANE_H / 2,
                color: entity.entity_type === 'event' && getEmotionLevel(entity) !== 0
                    ? emotionColor(getEmotionLevel(entity))
                    : (entity.color || lane.color),
                laneIndex: laneIdx,
            });
        });
    });

    return { nodes, lanes };
}

// ─── Timeline-based layout (one lane per timeline + canonical) ───
interface TimelineNode extends PositionedNode {
    timelineId: string | null; // null = canonical
    isShared: boolean;         // appears in multiple timelines
    hasDiff: boolean;          // variant differs from canonical
}

function layoutTimelineNodes(
    entities: Entity[],
    hiddenTypes: Set<string>,
    timelines: Entity[],
    variants: TimelineVariant[],
    focusedTimelineId: string | null,
): { nodes: TimelineNode[]; lanes: LaneDef[] } {
    const nonTimelineEntities = entities.filter(
        e => e.entity_type !== 'timeline' && !hiddenTypes.has(e.entity_type)
    );

    // Build lanes: one per timeline + canonical
    const lanes: LaneDef[] = timelines.map(tl => ({
        type: tl.id,
        label: tl.name,
        color: tl.color || TYPE_COLORS.timeline || '#f59e0b',
        count: 0,
    }));
    lanes.push({
        type: '__canonical__',
        label: 'Canonical / Shared',
        color: '#64748b',
        count: 0,
    });

    // Build a map: entityId → set of timeline IDs it has variants in
    const entityTimelines = new Map<string, Set<string>>();
    for (const v of variants) {
        if (!entityTimelines.has(v.entity_id)) {
            entityTimelines.set(v.entity_id, new Set());
        }
        entityTimelines.get(v.entity_id)!.add(v.timeline_id);
    }

    const nodes: TimelineNode[] = [];
    const laneCounters = new Map<string, number>(); // laneType → horizontal index

    for (const entity of nonTimelineEntities) {
        const tlIds = entityTimelines.get(entity.id);
        const isShared = (tlIds?.size ?? 0) > 1;

        if (tlIds && tlIds.size > 0) {
            // Place in each timeline lane where it has a variant
            for (const tlId of tlIds) {
                const laneIdx = lanes.findIndex(l => l.type === tlId);
                if (laneIdx === -1) continue;
                // Skip non-focused lanes if focus active
                if (focusedTimelineId && tlId !== focusedTimelineId) continue;

                const resolved = resolveEntity(entity, tlId, variants);
                const hasDiff = resolved.name !== entity.name || resolved.description !== entity.description;
                const hIdx = laneCounters.get(tlId) ?? 0;
                laneCounters.set(tlId, hIdx + 1);
                lanes[laneIdx].count++;

                nodes.push({
                    entity: resolved,
                    x: LANE_LABEL_W + hIdx * NODE_SPACING,
                    y: 80 + laneIdx * (LANE_H + LANE_GAP),
                    color: entity.color || TYPE_COLORS[entity.entity_type] || '#64748b',
                    laneIndex: laneIdx,
                    timelineId: tlId,
                    isShared,
                    hasDiff,
                });
            }
        } else {
            // No variants — put in canonical lane
            const canonIdx = lanes.findIndex(l => l.type === '__canonical__');
            const hIdx = laneCounters.get('__canonical__') ?? 0;
            laneCounters.set('__canonical__', hIdx + 1);
            lanes[canonIdx].count++;

            nodes.push({
                entity,
                x: LANE_LABEL_W + hIdx * NODE_SPACING,
                y: 80 + canonIdx * (LANE_H + LANE_GAP),
                color: entity.color || TYPE_COLORS[entity.entity_type] || '#64748b',
                laneIndex: canonIdx,
                timelineId: null,
                isShared: false,
                hasDiff: false,
            });
        }
    }

    // Remove empty lanes (except if focused)
    const filteredLanes = lanes.filter(l => l.count > 0 || l.type === focusedTimelineId);
    // Re-index node laneIndex
    for (const node of nodes) {
        node.laneIndex = filteredLanes.findIndex(l => l.type === (node as TimelineNode).timelineId || (l.type === '__canonical__' && (node as TimelineNode).timelineId === null));
        node.y = 80 + node.laneIndex * (LANE_H + LANE_GAP);
    }

    return { nodes, lanes: filteredLanes };
}

// ─── Helpers ────────────────────────────────────────────────────
function truncateText(text: string, maxLen: number): string {
    if (!text) return '';
    return text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text;
}

function hexToRgba(hex: string, alpha: number): string {
    const c = d3.color(hex);
    if (!c) return `rgba(100,100,100,${alpha})`;
    return c.copy({ opacity: alpha }).toString();
}

// ─── Component ──────────────────────────────────────────────────
export default function TimelineCanvas({
    entities,
    relationships = [],
    onEntitySelect,
    selectedEntityId,
    onEntityPositionUpdate,
    hiddenTypes = new Set(),
    consistencyStatus,
    entityVariantCounts,
    viewMode = 'type',
    focusedTimelineId,
    variants = [],
    timelines = [],
}: TimelineCanvasProps) {
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
    const [showRelationships, setShowRelationships] = useState(true);
    const [showMinimap, setShowMinimap] = useState(true);

    // Resize observer (debounced — Fix 4)
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        let timerId: ReturnType<typeof setTimeout>;
        const observer = new ResizeObserver((entries) => {
            clearTimeout(timerId);
            timerId = setTimeout(() => {
                const { width, height } = entries[0].contentRect;
                setDimensions({ width: Math.max(width, 400), height: Math.max(height, 300) });
            }, 100);
        });
        observer.observe(container);
        return () => { clearTimeout(timerId); observer.disconnect(); };
    }, []);
    // ─── Memoized layout computation (Fix 5) ──────────────────
    const layoutResult = useMemo(() => {
        if (viewMode === 'timeline' && timelines.length > 0) {
            return layoutTimelineNodes(entities, hiddenTypes, timelines, variants, focusedTimelineId ?? null);
        }
        return layoutNodes(entities, hiddenTypes);
    }, [entities, hiddenTypes, viewMode, timelines, variants, focusedTimelineId]);

    const renderCanvas = useCallback(() => {
        if (!svgRef.current) return;
        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        const { width, height } = dimensions;
        svg.attr('width', width).attr('height', height);

        // ─── Defs: filters & gradients ──────────────────────
        const defs = svg.append('defs');

        // Glow filter (strong)
        const glow = defs.append('filter').attr('id', 'glow').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
        glow.append('feGaussianBlur').attr('stdDeviation', '6').attr('result', 'blur');
        const glowMerge = glow.append('feMerge');
        glowMerge.append('feMergeNode').attr('in', 'blur');
        glowMerge.append('feMergeNode').attr('in', 'SourceGraphic');

        // Selected glow (stronger)
        const selGlow = defs.append('filter').attr('id', 'selectedGlow').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
        selGlow.append('feGaussianBlur').attr('stdDeviation', '8').attr('result', 'blur');
        const selMerge = selGlow.append('feMerge');
        selMerge.append('feMergeNode').attr('in', 'blur');
        selMerge.append('feMergeNode').attr('in', 'SourceGraphic');

        // Status pulse filter
        const pulseFilter = defs.append('filter').attr('id', 'statusPulse').attr('x', '-100%').attr('y', '-100%').attr('width', '300%').attr('height', '300%');
        pulseFilter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'blur');
        const pulseMerge = pulseFilter.append('feMerge');
        pulseMerge.append('feMergeNode').attr('in', 'blur');
        pulseMerge.append('feMergeNode').attr('in', 'SourceGraphic');

        // Arrow marker for relationships
        defs.append('marker')
            .attr('id', 'arrowhead')
            .attr('viewBox', '0 0 10 7')
            .attr('refX', 10).attr('refY', 3.5)
            .attr('markerWidth', 8).attr('markerHeight', 6)
            .attr('orient', 'auto')
            .append('polygon')
            .attr('points', '0 0, 10 3.5, 0 7')
            .attr('fill', 'rgba(255,255,255,0.3)');

        // ─── Zoom ───────────────────────────────────────────
        const g = svg.append('g').attr('class', 'canvas-root');

        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.05, 5])
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
            });

        (svg as unknown as d3.Selection<SVGSVGElement, unknown, null, undefined>).call(zoom);

        // ─── Background: dot grid (Fix 1: SVG pattern — 2 DOM nodes instead of ~173k) ───
        const gridExtent = 5000;
        defs.append('pattern')
            .attr('id', 'dotGrid')
            .attr('width', DOT_SPACING).attr('height', DOT_SPACING)
            .attr('patternUnits', 'userSpaceOnUse')
            .append('circle')
            .attr('cx', DOT_SPACING / 2).attr('cy', DOT_SPACING / 2)
            .attr('r', 0.8)
            .attr('fill', 'rgba(255,255,255,0.04)');

        const gridGroup = g.append('g').attr('class', 'grid');
        gridGroup.append('rect')
            .attr('x', -gridExtent).attr('y', -gridExtent)
            .attr('width', gridExtent * 2).attr('height', gridExtent * 2)
            .attr('fill', 'url(#dotGrid)');

        // Crosshair at origin
        gridGroup.append('line')
            .attr('x1', -gridExtent).attr('y1', 0).attr('x2', gridExtent).attr('y2', 0)
            .attr('stroke', 'rgba(255,255,255,0.03)').attr('stroke-width', 1);
        gridGroup.append('line')
            .attr('x1', 0).attr('y1', -gridExtent).attr('x2', 0).attr('y2', gridExtent)
            .attr('stroke', 'rgba(255,255,255,0.03)').attr('stroke-width', 1);

        // ─── Layout (from memoized result) ───────────────────────
        const nodes: PositionedNode[] = layoutResult.nodes;
        const lanes: LaneDef[] = layoutResult.lanes;
        const timelineNodes: TimelineNode[] = viewMode === 'timeline'
            ? layoutResult.nodes as TimelineNode[] : [];
        if (nodes.length === 0) return;

        // ─── Time axis ruler (horizontal, above lanes) ──────────
        const axisY = 50;
        g.append('line')
            .attr('x1', LANE_LABEL_W - 10).attr('y1', axisY)
            .attr('x2', LANE_LABEL_W + Math.max(nodes.length, 3) * NODE_SPACING + 200).attr('y2', axisY)
            .attr('stroke', 'rgba(99,102,241,0.15)')
            .attr('stroke-width', 1.5);
        // Tick marks
        const axisLabel = g.append('text')
            .attr('x', LANE_LABEL_W - 5).attr('y', axisY - 8)
            .attr('font-size', '9px')
            .attr('font-family', 'SF Mono, monospace')
            .attr('fill', 'rgba(99,102,241,0.4)')
            .attr('text-transform', 'uppercase')
            .attr('letter-spacing', '1px');
        axisLabel.text('TIME AXIS (UTC/MISSION TIME)');
        for (let i = 0; i < Math.max(nodes.length, 3) + 1; i++) {
            const tx = LANE_LABEL_W + i * NODE_SPACING;
            g.append('line')
                .attr('x1', tx).attr('y1', axisY - 5)
                .attr('x2', tx).attr('y2', axisY + 5)
                .attr('stroke', 'rgba(99,102,241,0.2)')
                .attr('stroke-width', 1);
            g.append('circle')
                .attr('cx', tx).attr('cy', axisY)
                .attr('r', 3)
                .attr('fill', 'rgba(99,102,241,0.25)');
        }

        // ─── Swim-lane backgrounds ──────────────────────────────────
        lanes.forEach((lane, i) => {
            const laneY = 50 + i * (LANE_H + LANE_GAP);
            const isFocusedLane = viewMode === 'timeline' && focusedTimelineId && lane.type === focusedTimelineId;
            const isDimmed = viewMode === 'timeline' && focusedTimelineId && lane.type !== focusedTimelineId;
            const laneOpacity = isDimmed ? 0.2 : 1;

            // Lane background
            g.append('rect')
                .attr('x', -3000).attr('y', laneY)
                .attr('width', 12000).attr('height', LANE_H)
                .attr('fill', hexToRgba(lane.color, isFocusedLane ? 0.06 : 0.02))
                .attr('rx', 0)
                .attr('opacity', laneOpacity);

            // Lane top separator (glowing line)
            g.append('line')
                .attr('x1', -3000).attr('y1', laneY)
                .attr('x2', 12000).attr('y2', laneY)
                .attr('stroke', hexToRgba(lane.color, isFocusedLane ? 0.35 : 0.20))
                .attr('stroke-width', isFocusedLane ? 2 : 1.5)
                .attr('opacity', laneOpacity)
                .attr('filter', isFocusedLane ? 'url(#glow)' : 'none');

            // Lane header background
            g.append('rect')
                .attr('x', 4).attr('y', laneY + 4)
                .attr('width', LANE_LABEL_W - 8).attr('height', 32)
                .attr('rx', 8)
                .attr('fill', hexToRgba(lane.color, isFocusedLane ? 0.18 : 0.10))
                .attr('stroke', hexToRgba(lane.color, 0.2))
                .attr('stroke-width', 1)
                .attr('opacity', laneOpacity);

            // Lane icon + label
            const isTimelineMode = viewMode === 'timeline';
            const icon = isTimelineMode
                ? (lane.type === '__canonical__' ? '⭐' : '📅')
                : (TYPE_ICONS[lane.type] || '📋');
            g.append('text')
                .attr('x', 16).attr('y', laneY + 25)
                .attr('font-size', '13px')
                .attr('font-weight', '700')
                .attr('fill', lane.color)
                .attr('font-family', 'Inter, sans-serif')
                .attr('letter-spacing', '0.5px')
                .attr('opacity', laneOpacity)
                .text(`${icon} ${lane.label.toUpperCase()}`);

            // Lane entity count badge
            g.append('text')
                .attr('x', LANE_LABEL_W - 24)
                .attr('y', laneY + 23)
                .attr('font-size', '9px')
                .attr('font-weight', '500')
                .attr('fill', hexToRgba(lane.color, 0.5))
                .attr('font-family', 'SF Mono, monospace')
                .attr('text-anchor', 'end')
                .attr('opacity', laneOpacity)
                .text(`${lane.count}`);

            // Lane center guide line (dashed)
            g.append('line')
                .attr('x1', LANE_LABEL_W)
                .attr('y1', laneY + LANE_H / 2)
                .attr('x2', 12000)
                .attr('y2', laneY + LANE_H / 2)
                .attr('stroke', hexToRgba(lane.color, 0.06))
                .attr('stroke-width', 1)
                .attr('stroke-dasharray', '6 4')
                .attr('opacity', laneOpacity);
        });

        // ─── Cross-timeline connectors (Timeline View only) ───
        if (viewMode === 'timeline' && timelineNodes.length > 0) {
            // Group nodes by original entity ID
            const entityGroups = new Map<string, TimelineNode[]>();
            for (const node of timelineNodes) {
                const origId = node.entity.id;
                if (!entityGroups.has(origId)) entityGroups.set(origId, []);
                entityGroups.get(origId)!.push(node);
            }

            const connectorGroup = g.append('g').attr('class', 'cross-timeline-connectors');
            entityGroups.forEach((group) => {
                if (group.length < 2) return;
                // Sort by y position
                group.sort((a, b) => a.y - b.y);
                const midX = group[0].x; // Use x of first occurrence

                // Vertical dashed connector
                connectorGroup.append('line')
                    .attr('x1', midX).attr('y1', group[0].y)
                    .attr('x2', midX).attr('y2', group[group.length - 1].y)
                    .attr('stroke', 'rgba(255,255,255,0.12)')
                    .attr('stroke-width', 1)
                    .attr('stroke-dasharray', '4 4');

                // Dots at each appearance
                group.forEach(node => {
                    connectorGroup.append('circle')
                        .attr('cx', midX).attr('cy', node.y)
                        .attr('r', 3)
                        .attr('fill', node.color)
                        .attr('opacity', 0.6);
                });

                // "Shared" label
                connectorGroup.append('text')
                    .attr('x', midX + 8)
                    .attr('y', (group[0].y + group[group.length - 1].y) / 2)
                    .attr('font-size', '8px')
                    .attr('fill', 'rgba(255,255,255,0.25)')
                    .attr('font-family', 'SF Mono, monospace')
                    .text('⇅ shared');
            });
        }

        // ─── Relationship lines ─────────────────────────────
        if (showRelationships && relationships.length > 0) {
            const nodeMap = new Map(nodes.map(n => [n.entity.id, n]));
            const linkGroup = g.append('g').attr('class', 'links');

            relationships.forEach((rel) => {
                const source = nodeMap.get(rel.from_entity_id);
                const target = nodeMap.get(rel.to_entity_id);
                if (!source || !target) return;

                const sx = source.x + NODE_W / 2;
                const sy = source.y;
                const tx = target.x - NODE_W / 2;
                const ty = target.y;
                const mx = (sx + tx) / 2;

                // Strength-based line thickness (Feature 11)
                const strength = (rel.metadata as Record<string, unknown>)?.strength as number || 3;
                const lineWidth = 0.5 + (strength * 0.6); // 1.1 to 3.5
                const lineOpacity = 0.3 + (strength * 0.14); // 0.44 to 1.0

                // Curved path
                const path = linkGroup.append('path')
                    .attr('d', `M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${tx} ${ty}`)
                    .attr('fill', 'none')
                    .attr('stroke', `url(#link-grad-${rel.id})`)
                    .attr('stroke-width', lineWidth)
                    .attr('stroke-dasharray', '8 4')
                    .attr('marker-end', 'url(#arrowhead)')
                    .attr('opacity', lineOpacity)
                    .attr('class', 'canvas-link-animated')
                    .style('pointer-events', 'stroke');

                // Gradient for the link
                const grad = defs.append('linearGradient')
                    .attr('id', `link-grad-${rel.id}`)
                    .attr('gradientUnits', 'userSpaceOnUse')
                    .attr('x1', sx).attr('y1', sy)
                    .attr('x2', tx).attr('y2', ty);
                grad.append('stop').attr('offset', '0%').attr('stop-color', source.color).attr('stop-opacity', 0.6);
                grad.append('stop').attr('offset', '100%').attr('stop-color', target.color).attr('stop-opacity', 0.6);

                // Relationship label (floating on curve)
                const labelBg = linkGroup.append('rect')
                    .attr('x', mx - 30).attr('y', (sy + ty) / 2 - 16)
                    .attr('width', 60).attr('height', 16)
                    .attr('rx', 8)
                    .attr('fill', 'rgba(10,15,26,0.8)')
                    .attr('stroke', 'rgba(255,255,255,0.08)')
                    .attr('stroke-width', 0.5);
                const labelText = rel.relationship_type || rel.label || '';
                if (labelText) {
                    const tw = Math.max(60, labelText.length * 6 + 16);
                    labelBg.attr('width', tw).attr('x', mx - tw / 2);
                    linkGroup.append('text')
                        .attr('x', mx).attr('y', (sy + ty) / 2 - 5)
                        .attr('text-anchor', 'middle')
                        .attr('font-size', '10px')
                        .attr('font-family', 'Inter, sans-serif')
                        .attr('fill', 'rgba(255,255,255,0.55)')
                        .attr('font-style', 'italic')
                        .text(labelText);
                } else {
                    labelBg.remove();
                }

                // Hover effects
                path.on('mouseenter', function () {
                    d3.select(this).attr('stroke-width', lineWidth + 1.5).attr('opacity', Math.min(1, lineOpacity + 0.25));
                }).on('mouseleave', function () {
                    d3.select(this).attr('stroke-width', lineWidth).attr('opacity', lineOpacity);
                });
            });
        }

        // ─── Entity nodes (Glassmorphism) ───────────────────
        const nodeGroup = g.selectAll('.entity-node')
            .data(nodes, (d: unknown) => (d as PositionedNode).entity.id)
            .join('g')
            .attr('class', 'entity-node canvas-node-enter')
            .attr('transform', d => `translate(${d.x}, ${d.y})`)
            .style('cursor', 'grab');

        // Drag behavior
        let dragMoved = false;
        const drag = d3.drag<SVGGElement, PositionedNode>()
            .on('start', function () {
                dragMoved = false;
                d3.select(this).raise().style('cursor', 'grabbing');
            })
            .on('drag', function (event, d) {
                dragMoved = true;
                d.x = snap(event.x);
                d.y = snap(event.y);
                d3.select(this).attr('transform', `translate(${d.x}, ${d.y})`);
            })
            .on('end', function (_, d) {
                d3.select(this).style('cursor', 'grab');
                if (dragMoved && onEntityPositionUpdate) {
                    onEntityPositionUpdate(d.entity.id, d.x, d.y);
                }
            });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nodeGroup.call(drag as any);

        // --- Card outer glow (behind main card) ---
        nodeGroup.append('rect')
            .attr('x', -NODE_W / 2 - 3)
            .attr('y', -NODE_H / 2 - 3)
            .attr('width', NODE_W + 6)
            .attr('height', NODE_H + 6)
            .attr('rx', NODE_R + 3)
            .attr('ry', NODE_R + 3)
            .attr('fill', 'none')
            .attr('stroke', d => hexToRgba(d.color, d.entity.id === selectedEntityId ? 0.5 : 0.15))
            .attr('stroke-width', d => d.entity.id === selectedEntityId ? 2 : 1)
            .attr('filter', 'url(#glow)')
            .attr('opacity', d => d.entity.id === selectedEntityId ? 0.8 : 0.4);

        // --- Card background (glassmorphism) ---
        nodeGroup.append('rect')
            .attr('x', -NODE_W / 2)
            .attr('y', -NODE_H / 2)
            .attr('width', NODE_W)
            .attr('height', NODE_H)
            .attr('rx', NODE_R)
            .attr('ry', NODE_R)
            .attr('fill', d => hexToRgba(d.color, 0.10))
            .attr('stroke', d => d.entity.id === selectedEntityId ? d.color : hexToRgba(d.color, 0.3))
            .attr('stroke-width', d => d.entity.id === selectedEntityId ? 1.5 : 1);

        // --- Left accent bar (gradient glow) ---
        nodeGroup.append('rect')
            .attr('x', -NODE_W / 2)
            .attr('y', -NODE_H / 2 + 4)
            .attr('width', 5)
            .attr('height', NODE_H - 8)
            .attr('rx', 2.5)
            .attr('fill', d => d.color)
            .attr('filter', 'url(#glow)');

        // --- Type icon (top-left inside card) ---
        nodeGroup.append('text')
            .attr('x', -NODE_W / 2 + 20)
            .attr('y', -NODE_H / 2 + 26)
            .attr('font-size', '16px')
            .attr('text-anchor', 'middle')
            .text(d => TYPE_ICONS[d.entity.entity_type] || '📋');

        // --- Entity name (bold uppercase) ---
        nodeGroup.append('text')
            .attr('x', -NODE_W / 2 + 34)
            .attr('y', -NODE_H / 2 + 28)
            .attr('font-size', '14px')
            .attr('font-weight', '700')
            .attr('fill', '#e2e8f0')
            .attr('font-family', 'Inter, sans-serif')
            .attr('letter-spacing', '0.3px')
            .text(d => truncateText(d.entity.name.toUpperCase(), 24));

        // --- Description preview (2 lines, richer) ---
        nodeGroup.each(function (d) {
            const desc = d.entity.description || '';
            if (!desc) return;
            const group = d3.select(this);
            const lines = [desc.slice(0, 40), desc.slice(40, 78)];
            lines.forEach((line, i) => {
                if (!line) return;
                group.append('text')
                    .attr('x', -NODE_W / 2 + 16)
                    .attr('y', -NODE_H / 2 + 48 + i * 15)
                    .attr('font-size', '11px')
                    .attr('fill', 'rgba(148,163,184,0.7)')
                    .attr('font-family', 'Inter, sans-serif')
                    .text(truncateText(line.trim(), 36) + (i === 1 && desc.length > 78 ? '…' : ''));
            });
        });

        // --- Entity type label (subtle, bottom-left) ---
        nodeGroup.append('text')
            .attr('x', -NODE_W / 2 + 16)
            .attr('y', NODE_H / 2 - 12)
            .attr('font-size', '10px')
            .attr('fill', 'rgba(148,163,184,0.4)')
            .attr('font-family', 'Inter, sans-serif')
            .attr('text-transform', 'capitalize')
            .text(d => d.entity.entity_type);

        // --- Emotion indicator (event nodes only) ---
        nodeGroup.each(function (d) {
            if (d.entity.entity_type !== 'event') return;
            const eLevel = getEmotionLevel(d.entity);
            if (eLevel === 0) return;
            const group = d3.select(this);
            const eColor = emotionColor(eLevel);
            const emoji = eLevel >= 3 ? '😄' : eLevel >= 1 ? '🙂' : eLevel <= -3 ? '😢' : '😟';
            // Emotion bar at bottom
            group.append('rect')
                .attr('x', -NODE_W / 2)
                .attr('y', NODE_H / 2 - 4)
                .attr('width', NODE_W)
                .attr('height', 4)
                .attr('rx', 2)
                .attr('fill', eColor)
                .attr('opacity', 0.7);
            // Emotion emoji badge (bottom center-left)
            group.append('text')
                .attr('x', -NODE_W / 2 + 50)
                .attr('y', NODE_H / 2 - 12)
                .attr('font-size', '10px')
                .attr('fill', eColor)
                .text(`${emoji} ${eLevel > 0 ? '+' : ''}${eLevel}`);
        });

        // --- POV Character badge (event nodes only — Feature 8) ---
        nodeGroup.each(function (d) {
            if (d.entity.entity_type !== 'event') return;
            const props = d.entity.properties as Record<string, unknown>;
            const pov = props?.pov_character as { name: string } | undefined;
            if (!pov?.name) return;
            const group = d3.select(this);
            const povText = `👁️ ${pov.name}`;
            const badgeW = Math.max(60, povText.length * 6 + 16);
            group.append('rect')
                .attr('x', NODE_W / 2 - badgeW - 8)
                .attr('y', -NODE_H / 2 + 6)
                .attr('width', badgeW)
                .attr('height', 18)
                .attr('rx', 9)
                .attr('fill', 'rgba(99,102,241,0.15)')
                .attr('stroke', 'rgba(99,102,241,0.3)')
                .attr('stroke-width', 0.5);
            group.append('text')
                .attr('x', NODE_W / 2 - badgeW / 2 - 8)
                .attr('y', -NODE_H / 2 + 18)
                .attr('font-size', '9px')
                .attr('font-family', 'Inter, sans-serif')
                .attr('fill', '#818cf8')
                .attr('text-anchor', 'middle')
                .text(povText);
        });

        // --- Word count badge (event/chapter nodes — Feature 10/5) ---
        nodeGroup.each(function (d) {
            if (d.entity.entity_type !== 'event' && d.entity.entity_type !== 'chapter') return;
            const props = d.entity.properties as Record<string, unknown>;
            const dt = props?.draft_text as string | undefined;
            if (!dt) return;
            const wc = dt.split(/\s+/).filter(Boolean).length;
            if (wc === 0) return;
            const group = d3.select(this);
            const wcText = `📝 ${wc.toLocaleString()}w`;
            const badgeW = Math.max(50, wcText.length * 6 + 12);
            group.append('rect')
                .attr('x', -NODE_W / 2 + 8)
                .attr('y', -NODE_H / 2 + 6)
                .attr('width', badgeW)
                .attr('height', 18)
                .attr('rx', 9)
                .attr('fill', 'rgba(34,197,94,0.12)')
                .attr('stroke', 'rgba(34,197,94,0.25)')
                .attr('stroke-width', 0.5);
            group.append('text')
                .attr('x', -NODE_W / 2 + 8 + badgeW / 2)
                .attr('y', -NODE_H / 2 + 18)
                .attr('font-size', '9px')
                .attr('font-family', 'SF Mono, monospace')
                .attr('fill', '#22c55e')
                .attr('text-anchor', 'middle')
                .text(wcText);
        });

        // --- Connection count badge (bottom-right, full text) ---
        if (relationships.length > 0) {
            const relCounts = new Map<string, number>();
            relationships.forEach(r => {
                relCounts.set(r.from_entity_id, (relCounts.get(r.from_entity_id) || 0) + 1);
                relCounts.set(r.to_entity_id, (relCounts.get(r.to_entity_id) || 0) + 1);
            });

            nodeGroup.each(function (d) {
                const count = relCounts.get(d.entity.id);
                if (!count) return;
                const group = d3.select(this);
                const badgeText = `🔗 ${count} connections`;
                const badgeW = Math.max(90, badgeText.length * 6 + 16);

                // Badge background
                group.append('rect')
                    .attr('x', NODE_W / 2 - badgeW - 8)
                    .attr('y', NODE_H / 2 - 24)
                    .attr('width', badgeW)
                    .attr('height', 18)
                    .attr('rx', 9)
                    .attr('fill', hexToRgba(d.color, 0.12))
                    .attr('stroke', hexToRgba(d.color, 0.25))
                    .attr('stroke-width', 0.5);

                // Badge text
                group.append('text')
                    .attr('x', NODE_W / 2 - badgeW / 2 - 8)
                    .attr('y', NODE_H / 2 - 12)
                    .attr('font-size', '9px')
                    .attr('font-family', 'SF Mono, monospace')
                    .attr('fill', d.color)
                    .attr('text-anchor', 'middle')
                    .text(badgeText);
            });
        }

        // --- Variant indicator dots (top-right) ---
        if (entityVariantCounts) {
            nodeGroup.each(function (d) {
                const variantCount = entityVariantCounts.get(d.entity.id);
                if (!variantCount || variantCount === 0) return;
                const group = d3.select(this);

                // 🔀 badge
                group.append('text')
                    .attr('x', NODE_W / 2 - 14)
                    .attr('y', -NODE_H / 2 + 20)
                    .attr('font-size', '10px')
                    .attr('text-anchor', 'middle')
                    .text('🔀');

                // Variant count
                group.append('text')
                    .attr('x', NODE_W / 2 - 4)
                    .attr('y', -NODE_H / 2 + 20)
                    .attr('font-size', '8px')
                    .attr('fill', '#8b5cf6')
                    .attr('font-family', 'SF Mono, monospace')
                    .text(`${variantCount}`);
            });
        }

        // --- Divergence markers (timeline view: diamond ◇ on diffed nodes) ---
        if (viewMode === 'timeline' && timelineNodes.length > 0) {
            nodeGroup.each(function (d) {
                const tn = timelineNodes.find(n => n.entity.id === d.entity.id && n.x === d.x && n.y === d.y);
                if (!tn?.hasDiff) return;
                const group = d3.select(this);

                // Diamond shape (rotated square)
                group.append('rect')
                    .attr('x', NODE_W / 2 - 18)
                    .attr('y', -NODE_H / 2 - 4)
                    .attr('width', 10)
                    .attr('height', 10)
                    .attr('rx', 2)
                    .attr('transform', `rotate(45, ${NODE_W / 2 - 13}, ${NODE_H / 2 - 43})`)
                    .attr('fill', '#a855f7')
                    .attr('opacity', 0.8)
                    .attr('filter', 'url(#glow)');

                // Label
                group.append('text')
                    .attr('x', NODE_W / 2 - 4)
                    .attr('y', -NODE_H / 2 + 6)
                    .attr('font-size', '7px')
                    .attr('fill', '#a855f7')
                    .attr('font-family', 'SF Mono, monospace')
                    .attr('font-weight', '600')
                    .text('DIFF');
            });
        }
        // --- Status indicator (styled pill badge) ---
        if (consistencyStatus) {
            const STATUS_LABELS: Record<string, string> = { ok: '✔ CONSISTENT', warning: '⚠ HAS WARNINGS', error: '✗ ERROR' };
            nodeGroup.each(function (d) {
                const status = consistencyStatus.get(d.entity.id);
                if (!status) return;
                const group = d3.select(this);
                const statusColor = STATUS_COLORS[status];
                const label = STATUS_LABELS[status] || status;
                const pillW = Math.max(80, label.length * 6 + 16);

                // Pill background
                group.append('rect')
                    .attr('x', NODE_W / 2 - pillW - 8)
                    .attr('y', -NODE_H / 2 + 4)
                    .attr('width', pillW)
                    .attr('height', 18)
                    .attr('rx', 9)
                    .attr('fill', hexToRgba(statusColor, 0.12))
                    .attr('stroke', hexToRgba(statusColor, 0.3))
                    .attr('stroke-width', 0.5);

                // Pill icon dot
                group.append('circle')
                    .attr('cx', NODE_W / 2 - pillW - 8 + 10)
                    .attr('cy', -NODE_H / 2 + 13)
                    .attr('r', 3)
                    .attr('fill', statusColor)
                    .attr('class', 'canvas-status-dot');

                // Pill text
                group.append('text')
                    .attr('x', NODE_W / 2 - pillW / 2 - 2)
                    .attr('y', -NODE_H / 2 + 17)
                    .attr('font-size', '8px')
                    .attr('font-family', 'SF Mono, monospace')
                    .attr('font-weight', '600')
                    .attr('fill', statusColor)
                    .attr('text-anchor', 'middle')
                    .text(label);
            });
        }

        // --- Temporal gap labels between timestamped events (Feature 12 — Story Calendar) ---
        {
            // Parse story-time object or legacy ISO string into sortable numeric value
            const parseStoryTime = (ts: unknown): { totalDays: number; display: string } | null => {
                if (!ts) return null;
                // New story-time object: { year, day, hour, label }
                if (typeof ts === 'object' && ts !== null) {
                    const obj = ts as Record<string, unknown>;
                    const year = (obj.year as number) ?? 0;
                    const day = (obj.day as number) ?? 0;
                    const hour = (obj.hour as number) ?? 0;
                    const totalDays = year * 365 + day + hour / 24;
                    const label = obj.label as string || '';
                    const display = label ? `Y${year} D${day} — ${label}` : `Y${year} D${day}`;
                    return { totalDays, display };
                }
                // Legacy: ISO date string
                if (typeof ts === 'string') {
                    const d = new Date(ts);
                    if (isNaN(d.getTime())) return null;
                    const totalDays = d.getTime() / (1000 * 60 * 60 * 24);
                    return { totalDays, display: ts };
                }
                return null;
            };

            const formatStoryGap = (diffDays: number): string => {
                const absDays = Math.abs(diffDays);
                const direction = diffDays >= 0 ? 'later' : 'earlier';
                if (absDays >= 365) {
                    const years = Math.round(absDays / 365);
                    return `${years} year${years > 1 ? 's' : ''} ${direction}`;
                } else if (absDays >= 30) {
                    const months = Math.round(absDays / 30);
                    return `${months} month${months > 1 ? 's' : ''} ${direction}`;
                } else {
                    const days = Math.round(absDays);
                    return `${days} day${days > 1 ? 's' : ''} ${direction}`;
                }
            };

            const timedEvents = nodes
                .filter(n => n.entity.entity_type === 'event' && (n.entity.properties as Record<string, unknown>)?.timestamp)
                .map(n => {
                    const parsed = parseStoryTime((n.entity.properties as Record<string, unknown>).timestamp);
                    return parsed ? { node: n, totalDays: parsed.totalDays, display: parsed.display } : null;
                })
                .filter((e): e is NonNullable<typeof e> => e !== null)
                .sort((a, b) => a.totalDays - b.totalDays);

            const gapGroup = g.append('g').attr('class', 'temporal-gaps');

            for (let i = 0; i < timedEvents.length - 1; i++) {
                const from = timedEvents[i];
                const to = timedEvents[i + 1];
                const diffDays = to.totalDays - from.totalDays;
                if (Math.abs(diffDays) < 0.01) continue;

                const label = formatStoryGap(diffDays);

                // Position between the two nodes
                const midX = (from.node.x + to.node.x) / 2;
                const midY = (from.node.y + to.node.y) / 2 - NODE_H / 2 - 22;
                const tw = Math.max(70, label.length * 6 + 20);

                // Dotted connector line
                gapGroup.append('line')
                    .attr('x1', from.node.x + NODE_W / 2 + 4)
                    .attr('y1', from.node.y - NODE_H / 2 - 10)
                    .attr('x2', to.node.x - NODE_W / 2 - 4)
                    .attr('y2', to.node.y - NODE_H / 2 - 10)
                    .attr('stroke', diffDays < 0 ? 'rgba(239,68,68,0.25)' : 'rgba(148,163,184,0.2)')
                    .attr('stroke-width', 1)
                    .attr('stroke-dasharray', diffDays < 0 ? '6 3' : '4 3');

                // Label pill background
                gapGroup.append('rect')
                    .attr('x', midX - tw / 2)
                    .attr('y', midY - 8)
                    .attr('width', tw)
                    .attr('height', 16)
                    .attr('rx', 8)
                    .attr('fill', diffDays < 0 ? 'rgba(127,29,29,0.85)' : 'rgba(15,23,42,0.85)')
                    .attr('stroke', diffDays < 0 ? 'rgba(239,68,68,0.2)' : 'rgba(148,163,184,0.15)')
                    .attr('stroke-width', 0.5);

                // Label text
                gapGroup.append('text')
                    .attr('x', midX)
                    .attr('y', midY + 4)
                    .attr('text-anchor', 'middle')
                    .attr('font-size', '9px')
                    .attr('font-family', 'Inter, sans-serif')
                    .attr('fill', diffDays < 0 ? 'rgba(252,165,165,0.8)' : 'rgba(148,163,184,0.65)')
                    .attr('font-style', 'italic')
                    .text(`⏳ ${label}`);
            }
        }

        // --- Click handler ---
        nodeGroup.on('click', (_event, d) => {
            if (!dragMoved) {
                onEntitySelect(d.entity);
            }
        });

        // --- Hover effects (lift + glow) ---
        nodeGroup
            .on('mouseenter', function (_, d) {
                const group = d3.select(this);
                group.select('rect:nth-child(2)')
                    .transition().duration(150)
                    .attr('fill', hexToRgba(d.color, 0.15))
                    .attr('stroke', d.color)
                    .attr('stroke-width', 1.5);
                group.select('rect:nth-child(1)')
                    .transition().duration(150)
                    .attr('stroke', hexToRgba(d.color, 0.5))
                    .attr('opacity', 0.7)
                    .attr('filter', 'url(#glow)');
            })
            .on('mouseleave', function (_, d) {
                const isSelected = d.entity.id === selectedEntityId;
                const group = d3.select(this);
                group.select('rect:nth-child(2)')
                    .transition().duration(200)
                    .attr('fill', hexToRgba(d.color, 0.10))
                    .attr('stroke', isSelected ? d.color : hexToRgba(d.color, 0.3))
                    .attr('stroke-width', isSelected ? 1.5 : 1);
                group.select('rect:nth-child(1)')
                    .transition().duration(200)
                    .attr('stroke', hexToRgba(d.color, isSelected ? 0.5 : 0.15))
                    .attr('opacity', isSelected ? 0.8 : 0.4)
                    .attr('filter', 'url(#glow)');
            });

        // ─── Fit to content ─────────────────────────────────
        if (nodes.length > 0) {
            const padding = 120;
            const xs = nodes.map(n => n.x);
            const ys = nodes.map(n => n.y);
            const minX = Math.min(...xs) - padding - NODE_W / 2;
            const minY = Math.min(...ys) - padding - NODE_H / 2;
            const maxX = Math.max(...xs) + padding + NODE_W / 2;
            const maxY = Math.max(...ys) + padding + NODE_H / 2;
            const contentWidth = maxX - minX;
            const contentHeight = maxY - minY;

            const scale = Math.min(width / contentWidth, height / contentHeight, 1.2);
            const translateX = (width - contentWidth * scale) / 2 - minX * scale;
            const translateY = (height - contentHeight * scale) / 2 - minY * scale;

            (svg as unknown as d3.Selection<SVGSVGElement, unknown, null, undefined>).call(
                zoom.transform,
                d3.zoomIdentity.translate(translateX, translateY).scale(scale)
            );
        }

    }, [layoutResult, relationships, dimensions, selectedEntityId, onEntitySelect, onEntityPositionUpdate, hiddenTypes, showRelationships, consistencyStatus, entityVariantCounts, viewMode, focusedTimelineId]);

    useEffect(() => {
        renderCanvas();
    }, [renderCanvas]);

    // ─── Gather stats ───────────────────────────────────────
    const uniqueTypes = useMemo(() => [...new Set(entities.map(e => e.entity_type))], [entities]);
    const timelineCount = useMemo(() => entities.filter(e => e.entity_type === 'timeline').length, [entities]);

    return (
        <div
            ref={containerRef}
            style={{
                width: '100%',
                height: '100%',
                position: 'relative',
                overflow: 'hidden',
                borderRadius: 'var(--radius-md)',
                background: '#0a0f1a',
            }}
        >
            <svg
                ref={svgRef}
                style={{ width: '100%', height: '100%', display: 'block' }}
            />

            {/* ─── Scan line overlay ─────────────────────── */}
            {entities.length > 0 && (
                <div style={{
                    position: 'absolute', inset: 0, pointerEvents: 'none',
                    overflow: 'hidden', zIndex: 1,
                }}>
                    <div className="canvas-scan-line" style={{
                        position: 'absolute', left: 0, right: 0,
                        height: 1,
                        background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.08) 20%, rgba(99,102,241,0.15) 50%, rgba(99,102,241,0.08) 80%, transparent)',
                    }} />
                </div>
            )}

            {/* ─── Empty state ────────────────────────────── */}
            {entities.length === 0 && (
                <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    pointerEvents: 'none',
                }}>
                    <div style={{ fontSize: 56, marginBottom: 16, opacity: 0.8 }}>🌌</div>
                    <p style={{ color: '#e2e8f0', fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
                        Mission Control Canvas
                    </p>
                    <p style={{ color: '#64748b', fontSize: 13, maxWidth: 340, textAlign: 'center', lineHeight: 1.5 }}>
                        Create timelines, events, and characters in the sidebar to see them visualized here with relationships and graphs.
                    </p>
                </div>
            )}

            {/* ─── Stats HUD (top-left) ──────────────────── */}
            <div style={{
                position: 'absolute', top: 12, left: 12,
                display: 'flex', flexDirection: 'column', gap: 4,
                background: 'rgba(10,15,26,0.9)',
                backdropFilter: 'blur(14px)',
                borderRadius: 12,
                padding: '10px 18px',
                border: '1px solid rgba(99,102,241,0.15)',
                fontFamily: 'SF Mono, monospace', color: '#94a3b8',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 700, color: '#e2e8f0', letterSpacing: 1.5, fontSize: 11, textTransform: 'uppercase' }}>
                        ⏳ CHRONOS
                    </span>
                    <span style={{ color: 'rgba(99,102,241,0.4)', fontSize: 10 }}>│</span>
                    <span style={{ fontSize: 9, letterSpacing: 0.5, color: '#64748b', textTransform: 'uppercase' }}>
                        NARRATIVE SYSTEMS
                    </span>
                    <span style={{ color: 'rgba(99,102,241,0.4)', fontSize: 10 }}>│</span>
                    <span style={{ fontSize: 9, letterSpacing: 0.5, color: '#64748b', textTransform: 'uppercase' }}>
                        RELATIONS TRACKER
                    </span>
                </div>
                <div style={{ display: 'flex', gap: 14, fontSize: 12 }}>
                    <span style={{ fontWeight: 700, color: '#e2e8f0' }}>
                        {entities.length}
                        <span style={{ fontSize: 9, fontWeight: 400, color: '#64748b', marginLeft: 4, textTransform: 'uppercase' }}>ENTITIES</span>
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.08)' }}>•</span>
                    <span style={{ fontWeight: 700, color: '#e2e8f0' }}>
                        {relationships.length}
                        <span style={{ fontSize: 9, fontWeight: 400, color: '#64748b', marginLeft: 4, textTransform: 'uppercase' }}>RELATIONSHIPS</span>
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.08)' }}>•</span>
                    <span style={{ fontWeight: 700, color: '#e2e8f0' }}>
                        {timelineCount}
                        <span style={{ fontSize: 9, fontWeight: 400, color: '#64748b', marginLeft: 4, textTransform: 'uppercase' }}>TIMELINES</span>
                    </span>
                </div>
            </div>

            {/* ─── Legend (top-right) ─────────────────────── */}
            <div style={{
                position: 'absolute', top: 12, right: 12,
                display: 'flex', gap: 10,
                background: 'rgba(10,15,26,0.85)',
                backdropFilter: 'blur(12px)',
                borderRadius: 10,
                padding: '6px 14px',
                border: '1px solid rgba(255,255,255,0.06)',
                fontSize: 10, color: '#94a3b8',
            }}>
                {uniqueTypes.length > 0
                    ? uniqueTypes.map(type => (
                        <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <div style={{
                                width: 7, height: 7, borderRadius: '50%',
                                background: TYPE_COLORS[type] || '#64748b',
                                boxShadow: `0 0 6px ${TYPE_COLORS[type] || '#64748b'}`,
                            }} />
                            <span style={{ textTransform: 'capitalize' }}>{type}</span>
                        </div>
                    ))
                    : <span style={{ opacity: 0.5 }}>No entities</span>
                }
            </div>

            {/* ─── Controls toolbar (bottom-right) ─────── */}
            <div style={{
                position: 'absolute', bottom: 12, right: 12,
                display: 'flex', gap: 2,
                background: 'rgba(10,15,26,0.9)',
                backdropFilter: 'blur(12px)',
                borderRadius: 10,
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
                    style={{ fontSize: 14, width: 32, height: 32, padding: 0, color: '#94a3b8' }}
                >+</button>
                <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                        if (!svgRef.current) return;
                        const s = d3.select(svgRef.current) as unknown as d3.Selection<SVGSVGElement, unknown, null, undefined>;
                        s.transition().duration(300).call(d3.zoom<SVGSVGElement, unknown>().scaleBy, 0.7);
                    }}
                    title="Zoom out"
                    style={{ fontSize: 14, width: 32, height: 32, padding: 0, color: '#94a3b8' }}
                >−</button>
                <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => renderCanvas()}
                    title="Fit to content"
                    style={{ fontSize: 11, width: 32, height: 32, padding: 0, color: '#94a3b8' }}
                >⟲</button>
                <div style={{ width: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 2px' }} />
                <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowRelationships(v => !v)}
                    title={showRelationships ? 'Hide relationships' : 'Show relationships'}
                    style={{
                        fontSize: 11, width: 32, height: 32, padding: 0,
                        color: showRelationships ? '#6366f1' : '#94a3b8',
                    }}
                >🔗</button>
                <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowMinimap(v => !v)}
                    title={showMinimap ? 'Hide minimap' : 'Show minimap'}
                    style={{
                        fontSize: 11, width: 32, height: 32, padding: 0,
                        color: showMinimap ? '#06b6d4' : '#94a3b8',
                    }}
                >🗺</button>
            </div>

            {/* ─── Status bar (bottom-left) ──────────────── */}
            <div style={{
                position: 'absolute', bottom: 12, left: 12,
                background: 'rgba(10,15,26,0.9)',
                backdropFilter: 'blur(14px)',
                borderRadius: 10,
                padding: '6px 16px',
                border: '1px solid rgba(99,102,241,0.12)',
                fontSize: 11, color: '#64748b',
                fontFamily: 'SF Mono, monospace',
                display: 'flex', gap: 10, alignItems: 'center',
            }}>
                <span style={{ fontSize: 14 }}>⏳</span>
                <span style={{ fontWeight: 700, color: '#94a3b8', letterSpacing: 1.5, fontSize: 10, textTransform: 'uppercase' as const }}>
                    CHRONOS
                </span>
                <span style={{ opacity: 0.2 }}>|</span>
                <span style={{ fontSize: 9, opacity: 0.5 }}>Drag to reposition • Scroll to zoom</span>
            </div>

            {/* ─── Minimap (bottom-right, above toolbar) ─── */}
            {showMinimap && entities.length > 0 && (() => {
                const visibleEnts = entities.filter(e => !hiddenTypes.has(e.entity_type));
                const minPx = Math.min(...visibleEnts.map(e => e.position_x), 0) - 100;
                const minPy = Math.min(...visibleEnts.map(e => e.position_y), 0) - 100;
                const maxPx = Math.max(...visibleEnts.map(e => e.position_x), 100);
                const maxPy = Math.max(...visibleEnts.map(e => e.position_y), 100);
                const vbW = Math.max(800, maxPx - minPx + 200);
                const vbH = Math.max(400, maxPy - minPy + 200);
                const vb = `${minPx} ${minPy} ${vbW} ${vbH}`;

                return (
                    <div style={{
                        position: 'absolute', bottom: 54, right: 12,
                        width: 180, height: 110,
                        background: 'rgba(10,15,26,0.9)',
                        backdropFilter: 'blur(12px)',
                        borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.06)',
                        overflow: 'hidden',
                        padding: 6,
                    }}>
                        <svg width="168" height="98" viewBox={vb}>
                            {/* Relationship lines */}
                            {(() => {
                                const entityMap = new Map(visibleEnts.map(e => [e.id, e]));
                                return relationships.map(rel => {
                                    const from = entityMap.get(rel.from_entity_id);
                                    const to = entityMap.get(rel.to_entity_id);
                                    if (!from || !to) return null;
                                    return (
                                        <line
                                            key={rel.id}
                                            x1={from.position_x} y1={from.position_y}
                                            x2={to.position_x} y2={to.position_y}
                                            stroke="rgba(99,102,241,0.3)"
                                            strokeWidth={2}
                                        />
                                    );
                                });
                            })()}
                            {/* Entity dots */}
                            {visibleEnts.map(e => (
                                <rect
                                    key={e.id}
                                    x={e.position_x - 6}
                                    y={e.position_y - 3}
                                    width={12}
                                    height={6}
                                    rx={2}
                                    fill={TYPE_COLORS[e.entity_type] || '#64748b'}
                                    opacity={e.id === selectedEntityId ? 1 : 0.7}
                                    stroke={e.id === selectedEntityId ? '#fff' : 'none'}
                                    strokeWidth={1}
                                />
                            ))}
                            {/* Viewport rectangle */}
                            <rect
                                x={minPx + vbW * 0.2}
                                y={minPy + vbH * 0.2}
                                width={vbW * 0.6}
                                height={vbH * 0.6}
                                fill="none"
                                stroke="rgba(99,102,241,0.2)"
                                strokeWidth={3}
                                strokeDasharray="8 4"
                                rx={4}
                            />
                        </svg>
                        <div style={{
                            position: 'absolute', top: 4, left: 8,
                            fontSize: 7, color: '#64748b', fontFamily: 'SF Mono, monospace',
                            textTransform: 'uppercase', letterSpacing: 1,
                        }}>
                            OVERVIEW
                        </div>
                    </div>
                );
            })()}

            {/* ─── Emotional Arc Line Graph ──────────────────── */}
            {(() => {
                const events = entities.filter(e => e.entity_type === 'event');
                const emotionData = events.map(e => ({ name: e.name, level: getEmotionLevel(e), id: e.id })).filter(d => d.level !== 0);
                if (emotionData.length < 2) return null;
                const graphW = 900;
                const graphH = 100;
                const padX = 40;
                const padY = 16;
                const innerW = graphW - padX * 2;
                const innerH = graphH - padY * 2;
                return (
                    <div style={{
                        position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
                        maxWidth: graphW, width: 'calc(100% - 16px)',
                        background: 'rgba(15,23,42,0.85)',
                        border: '1px solid rgba(100,116,139,0.2)',
                        borderRadius: 8, padding: '8px 0',
                        backdropFilter: 'blur(8px)', zIndex: 10,
                    }}>
                        <div style={{ fontSize: 9, color: '#64748b', fontFamily: 'SF Mono, monospace', textTransform: 'uppercase', letterSpacing: 1, paddingLeft: 12, marginBottom: 4 }}>
                            EMOTIONAL ARC
                        </div>
                        <svg width="100%" viewBox={`0 0 ${graphW} ${graphH}`} preserveAspectRatio="xMidYMid meet">
                            <line x1={padX} y1={padY + innerH / 2} x2={graphW - padX} y2={padY + innerH / 2} stroke="rgba(148,163,184,0.2)" strokeWidth={1} strokeDasharray="4 4" />
                            <text x={padX - 4} y={padY + 4} fontSize={8} fill="#64748b" textAnchor="end">+5</text>
                            <text x={padX - 4} y={padY + innerH / 2 + 3} fontSize={8} fill="#64748b" textAnchor="end">0</text>
                            <text x={padX - 4} y={padY + innerH} fontSize={8} fill="#64748b" textAnchor="end">-5</text>
                            <polyline
                                fill="none"
                                stroke="url(#emotionGrad)"
                                strokeWidth={2}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                points={emotionData.map((d, i) => {
                                    const x = padX + (i / (emotionData.length - 1)) * innerW;
                                    const y = padY + ((5 - d.level) / 10) * innerH;
                                    return `${x},${y}`;
                                }).join(' ')}
                            />
                            <defs>
                                <linearGradient id="emotionGrad" x1="0" y1="0" x2="1" y2="0">
                                    {emotionData.map((d, i) => (
                                        <stop key={i} offset={`${(i / (emotionData.length - 1)) * 100}%`} stopColor={emotionColor(d.level)} />
                                    ))}
                                </linearGradient>
                            </defs>
                            {emotionData.map((d, i) => {
                                const x = padX + (i / (emotionData.length - 1)) * innerW;
                                const y = padY + ((5 - d.level) / 10) * innerH;
                                return (
                                    <g key={d.id}>
                                        <circle cx={x} cy={y} r={4} fill={emotionColor(d.level)} stroke="#0f172a" strokeWidth={1.5} />
                                        <text x={x} y={graphH - 2} fontSize={7} fill="#94a3b8" textAnchor="middle">{d.name.slice(0, 12)}</text>
                                    </g>
                                );
                            })}
                        </svg>
                    </div>
                );
            })()}
        </div>
    );
}
