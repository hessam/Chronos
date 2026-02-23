import { Entity, Relationship } from '../store/appStore';

export interface ContextReport {
    includedEntities: Entity[];
    excludedEntities: Entity[];
    estimatedTokens: number;
    breakdown: {
        characters: number;
        locations: number;
        timelines: number;
        events: number;
        themes: number;
        concepts: number;
    };
}

export interface SmartContextParams {
    currentEvent: Entity;
    allEntities: Entity[];
    allRelationships: Relationship[];
    causalChainDepth: number; // 1, 2, or 3 hops
    characterHistoryDepth: number; // e.g. 5
    includeScientificConcepts: boolean;
    maxTokens?: number; // Target max budget, e.g. 90000
}

/**
 * Calculates a relevance score for an entity relative to the current event.
 */
function calculateRelevance(
    entity: Entity,
    currentEvent: Entity,
    allRelationships: Relationship[],
    causalDepthMap: Map<string, number>
): number {
    let score = 0;

    // Direct relationship (1 hop)
    const isDirect = allRelationships.some(r =>
        (r.from_entity_id === currentEvent.id && r.to_entity_id === entity.id) ||
        (r.from_entity_id === entity.id && r.to_entity_id === currentEvent.id)
    );
    if (isDirect) {
        score += 100;
    }

    // Same timeline
    if (entity.properties?.timeline_id && currentEvent.properties?.timeline_id &&
        entity.properties.timeline_id === currentEvent.properties.timeline_id) {
        score += 50;
    }

    // Same location
    if (entity.properties?.location_id && currentEvent.properties?.location_id &&
        entity.properties.location_id === currentEvent.properties.location_id) {
        score += 40;
    }

    // Temporal proximity (if they are both events with sort_order/time)
    if (entity.entity_type === 'event' &&
        typeof entity.sort_order === 'number' &&
        typeof currentEvent.sort_order === 'number') {
        const timeDiff = Math.abs(entity.sort_order - currentEvent.sort_order);
        if (timeDiff < 7) {
            score += 30;
        }
    }

    // Same POV character
    if (entity.properties?.pov_character_id && currentEvent.properties?.pov_character_id &&
        entity.properties.pov_character_id === currentEvent.properties.pov_character_id) {
        score += 30;
    }

    // Causal chain (tracked via BFS depth map)
    const depth = causalDepthMap.get(entity.id);
    if (depth !== undefined && depth > 0) {
        // e.g. Depth 1 is direct, Depth 2 gets 20 points
        if (depth === 2) score += 20;
        else if (depth === 3) score += 10;
    }

    // Thematic connection (they share a theme)
    // Find themes connected to current event
    const eventThemes = allRelationships
        .filter(r => r.from_entity_id === currentEvent.id || r.to_entity_id === currentEvent.id)
        .map(r => r.from_entity_id === currentEvent.id ? r.to_entity_id : r.from_entity_id);

    // Find themes connected to this entity
    const entityThemes = allRelationships
        .filter(r => r.from_entity_id === entity.id || r.to_entity_id === entity.id)
        .map(r => r.from_entity_id === entity.id ? r.to_entity_id : r.from_entity_id);

    const sharedTheme = eventThemes.some(tId => entityThemes.includes(tId));
    if (sharedTheme) {
        score += 10;
    }

    return score;
}

/**
 * Builds the Causal Depth map using BFS up to maxDepth.
 * Traces 'causes', 'leads_to', 'triggered_by', 'triggers' relationships.
 */
function buildCausalDepthMap(startEventId: string, relationships: Relationship[], maxDepth: number): Map<string, number> {
    const causalTypes = ['causes', 'leads_to', 'triggered_by', 'triggers'];
    const depthMap = new Map<string, number>();
    depthMap.set(startEventId, 0);

    let queue = [{ id: startEventId, depth: 0 }];

    while (queue.length > 0) {
        const current = queue.shift()!;
        if (current.depth >= maxDepth) continue;

        const nextHops = relationships
            .filter(r =>
                causalTypes.includes(r.relationship_type) &&
                (r.from_entity_id === current.id || r.to_entity_id === current.id)
            )
            .map(r => r.from_entity_id === current.id ? r.to_entity_id : r.from_entity_id);

        for (const nextId of nextHops) {
            if (!depthMap.has(nextId)) {
                depthMap.set(nextId, current.depth + 1);
                queue.push({ id: nextId, depth: current.depth + 1 });
            }
        }
    }
    return depthMap;
}

/**
 * Estimates tokens. 1 token ~= 4 chars, roughly ~1.3 tokens per word.
 */
function estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.split(/\s+/).length * 1.3);
}

function getEntityTokens(entity: Entity): number {
    let tokens = estimateTokens(entity.name) + estimateTokens(entity.description || '');
    if (entity.properties) {
        tokens += estimateTokens(JSON.stringify(entity.properties));
    }
    return tokens;
}

export function buildSmartContext(params: SmartContextParams): ContextReport {
    const { currentEvent, allEntities, allRelationships, causalChainDepth, includeScientificConcepts, maxTokens = 90000 } = params;

    // 1. Mandatory inclusions
    const includedSet = new Set<string>();
    includedSet.add(currentEvent.id);

    // Tier 1: Direct Relationships
    const directIds = allRelationships
        .filter(r => r.from_entity_id === currentEvent.id || r.to_entity_id === currentEvent.id)
        .map(r => r.from_entity_id === currentEvent.id ? r.to_entity_id : r.from_entity_id);

    directIds.forEach(id => includedSet.add(id));

    // Tier 2: Causal Chain
    const causalDepthMap = buildCausalDepthMap(currentEvent.id, allRelationships, causalChainDepth);
    for (const [id, depth] of causalDepthMap.entries()) {
        if (depth <= causalChainDepth) {
            includedSet.add(id);
        }
    }

    // 2. Score all other entities
    const scoredEntities = allEntities
        .filter(e => !includedSet.has(e.id) && e.id !== currentEvent.id)
        .map(e => ({
            entity: e,
            score: calculateRelevance(e, currentEvent, allRelationships, causalDepthMap)
        }))
        // Filter out scientific concepts if setting is off
        .filter(({ entity }) => {
            if (!includeScientificConcepts && entity.entity_type === 'note') {
                // Heuristic: Assuming scientific_concept notes have that as a tag or property
                // We'll just skip 'notes' broadly here unless they are scored very high
                // For a more robust check, you might have note_type on the entity
                if (entity.properties?.note_type === 'scientific_concept') {
                    return false; // exclude
                }
            }
            return true;
        });

    // 3. Take Top 20 relevant + Mandatory
    const topScored = scoredEntities.filter(se => se.score > 50).sort((a, b) => b.score - a.score).slice(0, 20);
    topScored.forEach(se => includedSet.add(se.entity.id));

    // 4. Build output arrays and budget
    let currentTokens = 0;
    const finalIncluded: Entity[] = [];
    const finalExcluded: Entity[] = [];

    const breakdown = {
        characters: 0,
        locations: 0,
        timelines: 0,
        events: 0,
        themes: 0,
        concepts: 0
    };

    // Sort entities based on inclusion and token budget
    allEntities.forEach(entity => {
        if (includedSet.has(entity.id)) {
            const tokens = getEntityTokens(entity);
            // Even if it's 'included', we must check budget (except for Tier 0/1 which we force if possible)
            // For now, simple budget adherence:
            if (currentTokens + tokens <= maxTokens) {
                finalIncluded.push(entity);
                currentTokens += tokens;

                // Update breakdown
                if (entity.entity_type === 'character') breakdown.characters++;
                else if (entity.entity_type === 'location') breakdown.locations++;
                else if (entity.entity_type === 'timeline') breakdown.timelines++;
                else if (entity.entity_type === 'event') breakdown.events++;
                else if (entity.entity_type === 'theme') breakdown.themes++;
                else breakdown.concepts++; // Treat others as concepts/notes
            } else {
                finalExcluded.push(entity);
            }
        } else {
            finalExcluded.push(entity);
        }
    });

    return {
        includedEntities: finalIncluded,
        excludedEntities: finalExcluded,
        estimatedTokens: currentTokens,
        breakdown
    };
}
