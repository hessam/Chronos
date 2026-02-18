import { useMemo } from 'react';
import type { Entity, Relationship, TimelineVariant } from '../store/appStore';

// ─── Types ──────────────────────────────────────────────────────
export interface TimelineLane {
    id: string;         // timeline entity id, or 'canonical'
    label: string;
    color: string;
    y: number;          // vertical position
    height: number;
    eventCount: number; // how many events in this lane
    collapsed: boolean; // true if lane is empty and collapsed
}

export interface TimelineEventNode {
    entity: Entity;
    laneId: string;
    x: number;
    y: number;
    width: number;
    height: number;
    hasConflict: boolean;
    conflictReason?: string;
}

export interface CausalArrow {
    fromId: string;
    toId: string;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    type: string;
}

// ─── Adaptive constants ─────────────────────────────────────────
const COLLAPSED_LANE_H = 28;
const LANE_GAP = 8;
const LANE_LABEL_W = 180;
const MIN_EVENT_W = 120;
const MIN_EVENT_H = 48;
const MAX_EVENT_W = 180;
const MAX_EVENT_H = 72;
const EVENT_GAP = 16;

const TIMELINE_COLORS = [
    '#6366f1', '#06b6d4', '#f59e0b', '#ec4899',
    '#10b981', '#8b5cf6', '#ef4444', '#14b8a6',
    '#f97316', '#a855f7', '#eab308', '#3b82f6',
    '#22d3ee', '#fb923c', '#c084fc', '#4ade80',
];

// ─── Hook ───────────────────────────────────────────────────────
export function useTimelineLayout(
    entities: Entity[],
    relationships: Relationship[],
    timelines: Entity[],
    variants: TimelineVariant[],
    focusedTimelineId: string | null,
) {
    // Adaptive sizing: shrink when many timelines
    const timelineCount = timelines.length;
    const EVENT_W = timelineCount > 10 ? MIN_EVENT_W : timelineCount > 6 ? 150 : MAX_EVENT_W;
    const EVENT_H = timelineCount > 10 ? MIN_EVENT_H : timelineCount > 6 ? 56 : MAX_EVENT_H;
    const LANE_HEIGHT = timelineCount > 10 ? 70 : timelineCount > 6 ? 90 : 120;

    // ─── Build event-to-timeline mapping ────────────────────────
    // Uses BOTH relationships and variants to determine which timeline(s) each event belongs to
    const eventTimelineMap = useMemo(() => {
        const map = new Map<string, Set<string>>();
        const timelineIds = new Set(timelines.map(t => t.id));

        // 1. Relationships: event → timeline (any relationship type)
        for (const r of relationships) {
            // event → timeline
            if (timelineIds.has(r.to_entity_id) && !timelineIds.has(r.from_entity_id)) {
                const existing = map.get(r.from_entity_id) || new Set();
                existing.add(r.to_entity_id);
                map.set(r.from_entity_id, existing);
            }
            // timeline → event
            if (timelineIds.has(r.from_entity_id) && !timelineIds.has(r.to_entity_id)) {
                const existing = map.get(r.to_entity_id) || new Set();
                existing.add(r.from_entity_id);
                map.set(r.to_entity_id, existing);
            }
        }

        // 2. Variants: entity_id → timeline_id
        for (const v of variants) {
            if (timelineIds.has(v.timeline_id)) {
                const existing = map.get(v.entity_id) || new Set();
                existing.add(v.timeline_id);
                map.set(v.entity_id, existing);
            }
        }

        return map;
    }, [relationships, variants, timelines]);

    // ─── Assign events to lanes ─────────────────────────────────
    const { eventNodes, laneEventCounts } = useMemo(() => {
        const events = entities.filter(e => e.entity_type === 'event');
        const laneCounters = new Map<string, number>();
        const laneCounts = new Map<string, number>();
        const nodes: TimelineEventNode[] = [];

        const timelinesForLayout = focusedTimelineId
            ? timelines.filter(t => t.id === focusedTimelineId)
            : timelines;
        const validLaneIds = new Set(['canonical', ...timelinesForLayout.map(t => t.id)]);

        for (const event of events) {
            const eventTimelines = eventTimelineMap.get(event.id);
            let assignedLanes: string[] = [];

            if (focusedTimelineId) {
                // Focus mode: show event in focused lane if it belongs, else canonical
                if (eventTimelines?.has(focusedTimelineId)) {
                    assignedLanes = [focusedTimelineId];
                } else {
                    assignedLanes = ['canonical'];
                }
            } else if (eventTimelines && eventTimelines.size > 0) {
                // Show event in each timeline it belongs to
                assignedLanes = Array.from(eventTimelines).filter(id => validLaneIds.has(id));
                if (assignedLanes.length === 0) assignedLanes = ['canonical'];
            } else {
                // No timeline association → canonical
                assignedLanes = ['canonical'];
            }

            for (const laneId of assignedLanes) {
                const idx = laneCounters.get(laneId) || 0;
                laneCounters.set(laneId, idx + 1);
                laneCounts.set(laneId, (laneCounts.get(laneId) || 0) + 1);

                nodes.push({
                    entity: event,
                    laneId,
                    x: LANE_LABEL_W + idx * (EVENT_W + EVENT_GAP),
                    y: 0, // will be set after lanes are positioned
                    width: EVENT_W,
                    height: EVENT_H,
                    hasConflict: false,
                });
            }
        }

        return { eventNodes: nodes, laneEventCounts: laneCounts };
    }, [entities, eventTimelineMap, timelines, focusedTimelineId, LANE_LABEL_W, EVENT_W, EVENT_GAP, EVENT_H]);

    // ─── Build lanes with adaptive heights ──────────────────────
    const lanes: TimelineLane[] = useMemo(() => {
        const result: TimelineLane[] = [];
        let currentY = 0;

        // Canonical lane
        const canonicalCount = laneEventCounts.get('canonical') || 0;
        const canonicalCollapsed = canonicalCount === 0;
        const canonicalH = canonicalCollapsed ? COLLAPSED_LANE_H : LANE_HEIGHT;
        result.push({
            id: 'canonical',
            label: 'Canonical',
            color: '#6b7280',
            y: currentY,
            height: canonicalH,
            eventCount: canonicalCount,
            collapsed: canonicalCollapsed,
        });
        currentY += canonicalH + LANE_GAP;

        // Timeline lanes
        const timelinesForLayout = focusedTimelineId
            ? timelines.filter(t => t.id === focusedTimelineId)
            : timelines;

        timelinesForLayout.forEach((t, i) => {
            const count = laneEventCounts.get(t.id) || 0;
            const collapsed = count === 0;
            const h = collapsed ? COLLAPSED_LANE_H : LANE_HEIGHT;
            result.push({
                id: t.id,
                label: t.name,
                color: TIMELINE_COLORS[i % TIMELINE_COLORS.length],
                y: currentY,
                height: h,
                eventCount: count,
                collapsed,
            });
            currentY += h + LANE_GAP;
        });

        return result;
    }, [timelines, focusedTimelineId, laneEventCounts, LANE_HEIGHT]);

    // Position event nodes vertically based on final lane positions
    const positionedEventNodes: TimelineEventNode[] = useMemo(() => {
        const laneMap = new Map(lanes.map(l => [l.id, l]));
        return eventNodes.map(node => {
            const lane = laneMap.get(node.laneId);
            if (!lane) return node;
            return {
                ...node,
                y: lane.y + (lane.height - EVENT_H) / 2,
            };
        });
    }, [eventNodes, lanes, EVENT_H]);

    // ─── Build causal arrows between events ─────────────────────
    const causalArrows: CausalArrow[] = useMemo(() => {
        const nodeMap = new Map<string, TimelineEventNode>();
        // Use first occurrence if duplicated across lanes
        for (const n of positionedEventNodes) {
            if (!nodeMap.has(n.entity.id)) nodeMap.set(n.entity.id, n);
        }
        const arrows: CausalArrow[] = [];

        for (const r of relationships) {
            const from = nodeMap.get(r.from_entity_id);
            const to = nodeMap.get(r.to_entity_id);
            // Only draw arrows between events (not event→timeline relationships)
            if (from && to && from.entity.entity_type === 'event' && to.entity.entity_type === 'event') {
                arrows.push({
                    fromId: r.from_entity_id,
                    toId: r.to_entity_id,
                    fromX: from.x + from.width,
                    fromY: from.y + from.height / 2,
                    toX: to.x,
                    toY: to.y + to.height / 2,
                    type: r.relationship_type,
                });
            }
        }
        return arrows;
    }, [positionedEventNodes, relationships]);

    // ─── Detect temporal conflicts ──────────────────────────────
    const conflicts = useMemo(() => {
        const result: { eventId: string; reason: string }[] = [];
        for (const arrow of causalArrows) {
            const from = positionedEventNodes.find(n => n.entity.id === arrow.fromId);
            const to = positionedEventNodes.find(n => n.entity.id === arrow.toId);
            if (from && to && from.x >= to.x && from.laneId !== to.laneId) {
                result.push({
                    eventId: to.entity.id,
                    reason: `"${from.entity.name}" causes this but appears after it`,
                });
            }
        }
        for (const c of result) {
            const node = positionedEventNodes.find(n => n.entity.id === c.eventId);
            if (node) {
                node.hasConflict = true;
                node.conflictReason = c.reason;
            }
        }
        return result;
    }, [causalArrows, positionedEventNodes]);

    // ─── Canvas dimensions ──────────────────────────────────────
    const totalWidth = useMemo(() => {
        const maxX = Math.max(...positionedEventNodes.map(n => n.x + n.width), 800);
        return maxX + 100;
    }, [positionedEventNodes]);

    const totalHeight = useMemo(() => {
        if (lanes.length === 0) return 400;
        const last = lanes[lanes.length - 1];
        return last.y + last.height + 40;
    }, [lanes]);

    return {
        lanes,
        eventNodes: positionedEventNodes,
        causalArrows,
        conflicts,
        totalWidth,
        totalHeight,
        LANE_LABEL_W,
        EVENT_W,
        EVENT_H,
    };
}
