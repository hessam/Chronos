# ADR-001: Timeline Variants — Per-Timeline Entity Overrides

**Status:** Accepted  
**Date:** February 12, 2026  
**Deciders:** Architecture Team  
**Supersedes:** None

---

## Context

Chronos manages multi-timeline narratives where the same entity (character, event, location, arc, theme) can exist **differently across timelines**. Examples:

- A **character** is alive in Timeline A but dead in Timeline B
- An **event** happens on Monday with a knife in one timeline, on Wednesday with poison in another
- A **location** is a castle in one timeline, ruins in another
- An **arc** resolves with betrayal in one timeline, redemption in another

The current data model stores a single "canonical" version of each entity with no structured way to express **timeline-specific variations**. The `properties` JSONB field could theoretically hold per-timeline data, but it would be unstructured, unindexable, and invisible to the UI.

This is not a niche feature — it is fundamental to what makes Chronos a **multi-timeline** tool rather than just a single-timeline narrative manager.

---

## Decision

Introduce a **`timeline_variants`** table that stores per-timeline overrides for any entity type. This is a generic, polymorphic approach — one table covers characters, events, locations, arcs, themes, and notes.

### Data Model

```sql
CREATE TABLE timeline_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    timeline_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,

    -- Overrides (NULL = inherit from canonical entity)
    variant_name TEXT,
    variant_description TEXT,
    variant_properties JSONB DEFAULT '{}',

    -- Timeline-specific canvas positioning
    position_x FLOAT,
    position_y FLOAT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT unique_entity_timeline UNIQUE(entity_id, timeline_id),
    CONSTRAINT timeline_must_be_timeline CHECK (
        timeline_id IN (SELECT id FROM entities WHERE entity_type = 'timeline')
    )
);
```

### Resolution Logic

When displaying an entity in the context of a specific timeline, the frontend merges the canonical data with any variant overrides:

```typescript
function resolveEntity(entity: Entity, timelineId: string, variants: TimelineVariant[]): Entity {
    const variant = variants.find(v => v.entity_id === entity.id && v.timeline_id === timelineId);
    if (!variant) return entity; // canonical — no override for this timeline

    return {
        ...entity,
        name: variant.variant_name ?? entity.name,
        description: variant.variant_description ?? entity.description,
        properties: { ...entity.properties, ...variant.variant_properties },
        position_x: variant.position_x ?? entity.position_x,
        position_y: variant.position_y ?? entity.position_y,
    };
}
```

### Canvas Presentation Modes

| Mode | Behavior |
|------|----------|
| **No timeline focus** | Entities show canonical data; variant indicator badge visible |
| **Timeline selected** | Entities resolve with that timeline's overrides |
| **Compare mode** | Side-by-side cards showing differences across 2–3 timelines |
| **Cross-lane connectors** | Shared entities render a connecting line between swim-lanes |

### UI Impact

- Entity detail panel gains a **"Timeline Variants"** tab listing all timelines the entity participates in
- Each variant is editable independently
- A **variant indicator** (small colored dots) appears on entity nodes that have overrides
- The existing E2-US4 (cross-timeline indicators) is superseded by this richer model

---

## Alternatives Considered

### 1. Duplicate Entities Per Timeline
Create separate entity records for each timeline-specific version.

**Rejected because:**
- Breaks the single-source-of-truth principle
- Editing canonical properties requires N updates
- Loses the concept of "same entity, different manifestation"
- No structured way to diff or merge

### 2. JSONB Field Inside Entity
Store variants as a nested map inside `entities.properties`:
```json
{ "timeline_overrides": { "timeline-uuid": { "status": "dead" } } }
```

**Rejected because:**
- Cannot be indexed efficiently for per-timeline queries
- No referential integrity (timeline UUIDs are unchecked strings)
- Mixes canonical and variant data in one record
- Harder to enforce RLS per-timeline

### 3. Separate Junction Tables Per Entity Type
E.g., `timeline_characters`, `timeline_events`, `timeline_locations`.

**Rejected because:**
- Violates the polymorphic design principle (one table for all entity types)
- N tables to maintain, N sets of RLS policies
- The override pattern is identical regardless of entity type

---

## Consequences

### Positive
- **Universal**: One table handles all 7 entity types
- **Backward-compatible**: Entities without variants work exactly as before
- **Queryable**: Can efficiently find "all entities that differ in Timeline B"
- **Aligns with E2-US4**: Cross-timeline indicators become a natural consequence of variant data
- **Enables AI**: Consistency checker can compare variants across timelines to detect contradictions

### Negative
- Additional query complexity: entity reads in timeline context require a JOIN
- UI complexity: must clearly communicate "canonical vs. override" to writers
- Migration: existing entities have no variants — empty table initially

### Risks
- **Performance**: JOIN on every entity read when a timeline is focused. Mitigated by index on `(entity_id, timeline_id)` and caching resolved entities.
- **UX confusion**: Writers may not understand the canonical/variant distinction. Mitigated by sensible defaults — entities without variants simply show their canonical data.

---

## Implementation Plan

**Target:** Sprint 3 (new story E2-US5, 8 story points)  
**Dependencies:** E2-US2 (multi-timeline view) ✅

| Layer | What to build |
|-------|---------------|
| **Database** | Migration 002: `timeline_variants` table + RLS + indexes |
| **API** | CRUD endpoints for variants; resolve logic in entity GET |
| **Frontend** | Variant tab in entity detail; variant indicator on canvas nodes |
| **AI** | Pass variant context to consistency checker (E3-US4) |

---

## References

- [Architecture: Data Model](file:///Users/hessammousavi/Documents/GitHub/Chronos/docs/architecture.md#data-architecture)
- [Schema: 001_initial_schema.sql](file:///Users/hessammousavi/Documents/GitHub/Chronos/database/migrations/001_initial_schema.sql)
- [Product Backlog: E2-US4](file:///Users/hessammousavi/Documents/GitHub/Chronos/docs/product-backlog.md)
