import { useMemo } from 'react';
import type { Entity, Relationship, TimelineVariant } from '../store/appStore';

/* ================================================================
   Causality DAG Engine — with context zone separation
   ================================================================
   CAUSAL ZONE: Entities with ≥1 causal edge, in DAG columns L→R
   CONTEXT ZONE: Characters/locations/etc with NO causal edges,
   compact grid on the left side
   ================================================================ */

export interface GraphNode {
    id: string;
    entity: Entity;
    color: string;
    highlighted: boolean;
    depth: number;
    timelineIds: string[];
    timelineColors: string[];
    x: number;
    y: number;
    zone: 'causal' | 'context';  // which zone this node belongs to
}

export interface GraphLink {
    id: string;
    sourceId: string;
    targetId: string;
    relationship: Relationship;
    highlighted: boolean;
    isCausal: boolean;
}

const TYPE_COLORS: Record<string, string> = {
    character: '#6366f1',
    timeline: '#06b6d4',
    event: '#f59e0b',
    arc: '#ec4899',
    theme: '#8b5cf6',
    location: '#10b981',
    note: '#6b7280',
    chapter: '#ef4444',
};

const TIMELINE_COLORS = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#06b6d4', '#6366f1', '#14b8a6', '#f97316',
    '#84cc16', '#e879f9', '#22d3ee', '#a78bfa',
];

const CAUSAL_TYPES = new Set([
    'causes', 'branches_into', 'creates', 'inspires', 'makes',
    'parent_of', 'originates_in',
]);

// ─── DAG Layer Assignment ───────────────────────────────────────
function assignLayers(
    entityIds: string[],
    causalEdges: { from: string; to: string }[],
): Map<string, number> {
    const layers = new Map<string, number>();
    const idSet = new Set(entityIds);

    const forward = new Map<string, string[]>();
    for (const e of causalEdges) {
        if (!idSet.has(e.from) || !idSet.has(e.to)) continue;
        if (!forward.has(e.from)) forward.set(e.from, []);
        forward.get(e.from)!.push(e.to);
    }

    // Find roots (no incoming causal edges within the causal set)
    const hasIncoming = new Set<string>();
    for (const e of causalEdges) {
        if (idSet.has(e.from) && idSet.has(e.to)) hasIncoming.add(e.to);
    }
    const roots = entityIds.filter(id => !hasIncoming.has(id));

    // BFS longest-path layering
    const queue: { id: string; depth: number }[] = [];
    for (const r of roots) {
        queue.push({ id: r, depth: 0 });
        layers.set(r, 0);
    }

    while (queue.length > 0) {
        const { id, depth } = queue.shift()!;
        for (const child of (forward.get(id) || [])) {
            const existing = layers.get(child) ?? -1;
            if (depth + 1 > existing) {
                layers.set(child, depth + 1);
                queue.push({ id: child, depth: depth + 1 });
            }
        }
    }

    for (const id of entityIds) {
        if (!layers.has(id)) layers.set(id, 0);
    }

    return layers;
}

// ─── Entity → timeline mapping (direct only) ────────────────────
function mapEntitiesToTimelines(
    entities: Entity[],
    relationships: Relationship[],
    timelines: Entity[],
    variants: TimelineVariant[],
): Map<string, Set<string>> {
    const timelineIds = new Set(timelines.map(t => t.id));
    const map = new Map<string, Set<string>>();
    for (const e of entities) map.set(e.id, new Set());

    for (const r of relationships) {
        if (timelineIds.has(r.to_entity_id) && map.has(r.from_entity_id))
            map.get(r.from_entity_id)!.add(r.to_entity_id);
        if (timelineIds.has(r.from_entity_id) && map.has(r.to_entity_id))
            map.get(r.to_entity_id)!.add(r.from_entity_id);
    }
    for (const v of variants) {
        if (map.has(v.entity_id) && timelineIds.has(v.timeline_id))
            map.get(v.entity_id)!.add(v.timeline_id);
    }
    return map;
}

// ─── Layout constants ───────────────────────────────────────────
const COL_SPACING = 180;
const ROW_SPACING = 58;
const CONTEXT_COL_SPACING = 70;
const CONTEXT_ROW_SPACING = 65;
const CONTEXT_ZONE_LEFT = 40;
const DAG_ZONE_LEFT = 60;  // offset from end of context zone

// ─── Hook ───────────────────────────────────────────────────────
export function useGraphEngine(
    entities: Entity[],
    relationships: Relationship[],
    selectedEntityId: string | null,
    hiddenTypes: Set<string>,
    relationshipFilter: Set<string> | null,
    timelines: Entity[] = [],
    variants: TimelineVariant[] = [],
    _canvasWidth = 800,
    _canvasHeight = 600,
    focusedTimelineId: string | null = null,
) {
    const filteredRelationships = useMemo(() => {
        if (!relationshipFilter) return relationships;
        return relationships.filter(r => relationshipFilter.has(r.relationship_type));
    }, [relationships, relationshipFilter]);

    const entityToTimelines = useMemo(
        () => mapEntitiesToTimelines(entities, relationships, timelines, variants),
        [entities, relationships, timelines, variants]
    );

    const timelineColorMap = useMemo(() => {
        const map = new Map<string, string>();
        timelines.forEach((t, i) => map.set(t.id, TIMELINE_COLORS[i % TIMELINE_COLORS.length]));
        return map;
    }, [timelines]);

    // Visible entities (no timeline entities as nodes)
    const visibleEntities = useMemo(() => {
        const timelineIds = new Set(timelines.map(t => t.id));
        return entities.filter(e => {
            if (hiddenTypes.has(e.entity_type)) return false;
            if (timelineIds.has(e.id)) return false;
            return true;
        });
    }, [entities, timelines, hiddenTypes]);

    // Determine which entities participate in causal chains
    const { causalEntities, contextEntities } = useMemo(() => {
        const visibleIds = new Set(visibleEntities.map(e => e.id));

        // Find entities with at least one causal edge
        const hasCausalEdge = new Set<string>();
        for (const r of filteredRelationships) {
            if (!visibleIds.has(r.from_entity_id) || !visibleIds.has(r.to_entity_id)) continue;
            if (CAUSAL_TYPES.has(r.relationship_type)) {
                hasCausalEdge.add(r.from_entity_id);
                hasCausalEdge.add(r.to_entity_id);
            }
        }

        const causal: Entity[] = [];
        const context: Entity[] = [];
        for (const e of visibleEntities) {
            if (hasCausalEdge.has(e.id)) {
                causal.push(e);
            } else {
                context.push(e);
            }
        }

        return { causalEntities: causal, contextEntities: context };
    }, [visibleEntities, filteredRelationships]);

    // Causal edges for DAG
    const causalEdges = useMemo(() => {
        const causalIds = new Set(causalEntities.map(e => e.id));
        const edges: { from: string; to: string }[] = [];
        for (const r of filteredRelationships) {
            if (!causalIds.has(r.from_entity_id) || !causalIds.has(r.to_entity_id)) continue;
            if (CAUSAL_TYPES.has(r.relationship_type)) {
                edges.push({ from: r.from_entity_id, to: r.to_entity_id });
            }
        }
        return edges;
    }, [filteredRelationships, causalEntities]);

    // DAG layers for causal entities
    const layers = useMemo(
        () => assignLayers(causalEntities.map(e => e.id), causalEdges),
        [causalEntities, causalEdges]
    );

    // Compute positions
    const positions = useMemo(() => {
        const pos = new Map<string, { x: number; y: number }>();

        // ── Context zone: compact grid on the left ──────────────
        // Group context entities by type for organized display
        const contextByType = new Map<string, Entity[]>();
        for (const e of contextEntities) {
            if (!contextByType.has(e.entity_type)) contextByType.set(e.entity_type, []);
            contextByType.get(e.entity_type)!.push(e);
        }

        const contextTypes = Array.from(contextByType.keys()).sort();
        let contextMaxX = 0;
        let yOffset = 80;

        for (const type of contextTypes) {
            const ents = contextByType.get(type)!;
            const cols = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(ents.length))));

            for (let i = 0; i < ents.length; i++) {
                const col = i % cols;
                const row = Math.floor(i / cols);
                const x = CONTEXT_ZONE_LEFT + col * CONTEXT_COL_SPACING;
                const y = yOffset + row * CONTEXT_ROW_SPACING;
                pos.set(ents[i].id, { x, y });
                contextMaxX = Math.max(contextMaxX, x + CONTEXT_COL_SPACING);
            }

            yOffset += Math.ceil(ents.length / cols) * CONTEXT_ROW_SPACING + 30;
        }

        // ── Causal DAG zone: columns to the right ───────────────
        const dagStartX = Math.max(contextMaxX + DAG_ZONE_LEFT, 280);

        const layerGroups = new Map<number, string[]>();
        for (const [id, layer] of layers) {
            if (!layerGroups.has(layer)) layerGroups.set(layer, []);
            layerGroups.get(layer)!.push(id);
        }

        for (const [layer, ids] of layerGroups) {
            const x = dagStartX + layer * COL_SPACING;
            const totalHeight = (ids.length - 1) * ROW_SPACING;
            const startY = 80 + Math.max(0, (500 - totalHeight) / 2);

            for (let i = 0; i < ids.length; i++) {
                pos.set(ids[i], { x, y: startY + i * ROW_SPACING });
            }
        }

        return pos;
    }, [contextEntities, causalEntities, layers]);

    // BFS from selected entity
    const causalDepths = useMemo(() => {
        if (!selectedEntityId) return null;
        const depths = new Map<string, number>();
        depths.set(selectedEntityId, 0);
        const queue = [{ id: selectedEntityId, depth: 0 }];
        const adj = new Map<string, string[]>();
        for (const r of filteredRelationships) {
            if (!adj.has(r.from_entity_id)) adj.set(r.from_entity_id, []);
            if (!adj.has(r.to_entity_id)) adj.set(r.to_entity_id, []);
            adj.get(r.from_entity_id)!.push(r.to_entity_id);
            adj.get(r.to_entity_id)!.push(r.from_entity_id);
        }
        while (queue.length > 0) {
            const { id, depth } = queue.shift()!;
            if (depth >= 4) continue;
            for (const to of (adj.get(id) || [])) {
                if (!depths.has(to)) {
                    depths.set(to, depth + 1);
                    queue.push({ id: to, depth: depth + 1 });
                }
            }
        }
        return depths;
    }, [selectedEntityId, filteredRelationships]);

    // Focused timeline entity IDs
    const focusedEntityIds = useMemo(() => {
        if (!focusedTimelineId) return null;
        const ids = new Set<string>();
        for (const [entityId, tls] of entityToTimelines) {
            if (tls.has(focusedTimelineId)) ids.add(entityId);
        }
        return ids;
    }, [focusedTimelineId, entityToTimelines]);

    // Build nodes
    const nodes: GraphNode[] = useMemo(() => {
        const result: GraphNode[] = [];

        for (const e of causalEntities) {
            const p = positions.get(e.id) || { x: 0, y: 0 };
            const tls = entityToTimelines.get(e.id) || new Set();
            const tlIds = Array.from(tls);
            result.push({
                id: e.id, entity: e,
                color: TYPE_COLORS[e.entity_type] || '#6b7280',
                highlighted: causalDepths ? causalDepths.has(e.id) : false,
                depth: layers.get(e.id) ?? 0,
                timelineIds: tlIds,
                timelineColors: tlIds.map(id => timelineColorMap.get(id) || '#6b7280'),
                x: p.x, y: p.y,
                zone: 'causal',
            });
        }

        for (const e of contextEntities) {
            const p = positions.get(e.id) || { x: 0, y: 0 };
            const tls = entityToTimelines.get(e.id) || new Set();
            const tlIds = Array.from(tls);
            result.push({
                id: e.id, entity: e,
                color: TYPE_COLORS[e.entity_type] || '#6b7280',
                highlighted: causalDepths ? causalDepths.has(e.id) : false,
                depth: -1,
                timelineIds: tlIds,
                timelineColors: tlIds.map(id => timelineColorMap.get(id) || '#6b7280'),
                x: p.x, y: p.y,
                zone: 'context',
            });
        }

        return result;
    }, [causalEntities, contextEntities, positions, layers, entityToTimelines, timelineColorMap, causalDepths]);

    // Build links
    const links: GraphLink[] = useMemo(() => {
        const nodeIds = new Set(nodes.map(n => n.id));
        return filteredRelationships
            .filter(r => nodeIds.has(r.from_entity_id) && nodeIds.has(r.to_entity_id))
            .map(r => ({
                id: r.id,
                sourceId: r.from_entity_id,
                targetId: r.to_entity_id,
                relationship: r,
                highlighted: causalDepths
                    ? (causalDepths.has(r.from_entity_id) && causalDepths.has(r.to_entity_id))
                    : false,
                isCausal: CAUSAL_TYPES.has(r.relationship_type),
            }));
    }, [filteredRelationships, nodes, causalDepths]);

    // Relationship types
    const relationshipTypes = useMemo(() => {
        const types = new Set<string>();
        relationships.forEach(r => types.add(r.relationship_type));
        return Array.from(types).sort();
    }, [relationships]);

    // Max DAG layer
    const maxLayer = useMemo(() => {
        let max = 0;
        for (const l of layers.values()) max = Math.max(max, l);
        return max;
    }, [layers]);

    // Context zone boundary for rendering
    const contextZoneBounds = useMemo(() => {
        let maxX = 0, maxY = 0;
        for (const e of contextEntities) {
            const p = positions.get(e.id);
            if (p) {
                maxX = Math.max(maxX, p.x + 40);
                maxY = Math.max(maxY, p.y + 40);
            }
        }
        return { width: maxX, height: maxY };
    }, [contextEntities, positions]);

    return {
        nodes,
        links,
        relationshipTypes,
        causalDepths,
        focusedEntityIds,
        maxLayer,
        contextZoneBounds,
        causalCount: causalEntities.length,
        contextCount: contextEntities.length,
    };
}
