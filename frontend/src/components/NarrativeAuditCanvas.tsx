import { useState, useMemo } from 'react';
import type { Entity, Relationship } from '../store/appStore';
import { CAUSAL_TYPES } from '../constants/relationships';

/* ── Icon map (duplicated from WorkspacePage for self-containment) ── */
const ENTITY_ICONS: Record<string, string> = {
    character: '👤', event: '⚡', timeline: '🌿', arc: '📖',
    theme: '💎', location: '📍', note: '📝', chapter: '📑',
};

/* ── Safely extract a display string from a property value ── */
function safeStr(val: unknown): string {
    if (val == null) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'object' && val !== null && 'name' in val) return String((val as { name: unknown }).name);
    return String(val);
}

/* ── Props ── */
interface NarrativeAuditCanvasProps {
    entities: Entity[];
    relationships: Relationship[];
    onEntitySelect: (entity: Entity) => void;
    onEntityUpdate: (id: string, body: Partial<Entity>) => void;
    onEntityDelete: (id: string) => void;
    onEntityCreate: (body: { entity_type: Entity['entity_type']; name: string; description: string; properties: Record<string, unknown> }) => void;
    onRelationshipCreate: (body: { from_entity_id: string; to_entity_id: string; relationship_type: string; metadata: Record<string, unknown> }) => void;
}



/* ── Helper: Build arc chains by walking causal relationships ── */
function buildArcChains(
    entities: Entity[],
    relationships: Relationship[],
) {
    const arcs = entities.filter(e => e.entity_type === 'arc');
    const events = entities.filter(e => e.entity_type === 'event');
    const eventMap = new Map(events.map(e => [e.id, e]));
    const arcIdSet = new Set(arcs.map(a => a.id));
    const eventIdSet = new Set(events.map(e => e.id));

    // Build adjacency for causal rels (from → to[])
    const adj = new Map<string, string[]>();
    const hasIncoming = new Set<string>();
    for (const rel of relationships) {
        if (!CAUSAL_TYPES.has(rel.relationship_type)) continue;
        if (!eventIdSet.has(rel.from_entity_id) || !eventIdSet.has(rel.to_entity_id)) continue;
        if (!adj.has(rel.from_entity_id)) adj.set(rel.from_entity_id, []);
        adj.get(rel.from_entity_id)!.push(rel.to_entity_id);
        hasIncoming.add(rel.to_entity_id);
    }

    // For each arc, find events linked to it via ANY relationship type
    // (not just 'involves' / 'parent_of' — the user may use any type)
    const arcEvents = new Map<string, string[]>(); // arc_id → event ids
    for (const rel of relationships) {
        let arcId: string | null = null;
        let eventId: string | null = null;
        if (arcIdSet.has(rel.from_entity_id) && eventIdSet.has(rel.to_entity_id)) {
            arcId = rel.from_entity_id;
            eventId = rel.to_entity_id;
        } else if (arcIdSet.has(rel.to_entity_id) && eventIdSet.has(rel.from_entity_id)) {
            arcId = rel.to_entity_id;
            eventId = rel.from_entity_id;
        }
        if (arcId && eventId) {
            if (!arcEvents.has(arcId)) arcEvents.set(arcId, []);
            arcEvents.get(arcId)!.push(eventId);
        }
    }

    // Walk chains from root events
    const visitedGlobal = new Set<string>();

    function walkChain(entityId: string, depth: number): { entity: Entity; depth: number }[] {
        if (visitedGlobal.has(entityId)) return [];
        visitedGlobal.add(entityId);
        const entity = eventMap.get(entityId);
        if (!entity) return [];
        const result: { entity: Entity; depth: number }[] = [{ entity, depth }];
        const children = adj.get(entityId) || [];
        for (const childId of children) {
            result.push(...walkChain(childId, depth + 1));
        }
        return result;
    }

    const chains: { arc: Entity; events: { entity: Entity; depth: number }[] }[] = [];

    for (const arc of arcs) {
        const rootIds = arcEvents.get(arc.id) || [];
        // Find roots: events linked to arc that have no incoming causal from within arc set
        const roots = rootIds.filter(id => !hasIncoming.has(id));
        // If no roots found, just use all linked events
        const startIds = roots.length > 0 ? roots : rootIds;

        const chainEvents: { entity: Entity; depth: number }[] = [];
        for (const rootId of startIds) {
            chainEvents.push(...walkChain(rootId, 0));
        }
        chains.push({ arc, events: chainEvents });
    }

    // Find orphan events (not visited by any chain)
    const orphans = events.filter(e => !visitedGlobal.has(e.id));

    return { chains, orphans };
}

/* ── Helper: Parse a story-time value into display string + numeric sort key ── */
function parseStoryTime(raw: unknown): { display: string; sortKey: number } | null {
    if (raw == null) return null;
    // Story-time object: { year, day, hour, label }
    if (typeof raw === 'object' && raw !== null) {
        const obj = raw as Record<string, unknown>;
        const year = (obj.year as number) ?? 0;
        const day = (obj.day as number) ?? 0;
        const hour = (obj.hour as number) ?? 0;
        const label = (obj.label as string) || '';
        const sortKey = year * 365 + day + hour / 24;
        const display = label ? `Y${year} D${day} — ${label}` : `Y${year} D${day}`;
        return { display, sortKey };
    }
    // Legacy ISO date string or plain string
    if (typeof raw === 'string' && raw.trim()) {
        const d = new Date(raw);
        const sortKey = isNaN(d.getTime()) ? 0 : d.getTime() / (1000 * 60 * 60 * 24);
        return { display: raw, sortKey };
    }
    // Number (treat as sort key)
    if (typeof raw === 'number') {
        return { display: `T${raw}`, sortKey: raw };
    }
    return null;
}

/* ── Helper: Group events chronologically ── */
function groupByTimestamp(events: Entity[]): { label: string; events: Entity[] }[] {
    const timestamped: { entity: Entity; display: string; sortKey: number }[] = [];
    const noTimestamp: Entity[] = [];

    for (const e of events) {
        const parsed = parseStoryTime(e.properties?.timestamp);
        if (parsed) timestamped.push({ entity: e, ...parsed });
        else noTimestamp.push(e);
    }

    // Sort by sort_order first, then by numeric sort key
    timestamped.sort((a, b) => {
        const orderA = a.entity.sort_order ?? 999;
        const orderB = b.entity.sort_order ?? 999;
        if (orderA !== orderB) return orderA - orderB;
        return a.sortKey - b.sortKey;
    });

    // Group by display label
    const groups: { label: string; events: Entity[] }[] = [];
    let currentLabel = '';
    let currentGroup: Entity[] = [];
    for (const { entity, display } of timestamped) {
        if (display !== currentLabel) {
            if (currentGroup.length > 0) groups.push({ label: currentLabel, events: currentGroup });
            currentLabel = display;
            currentGroup = [entity];
        } else {
            currentGroup.push(entity);
        }
    }
    if (currentGroup.length > 0) groups.push({ label: currentLabel, events: currentGroup });
    if (noTimestamp.length > 0) groups.push({ label: '(no timestamp)', events: noTimestamp });

    return groups;
}

/* ══════════════════════════════════════════════════════
   Component
   ══════════════════════════════════════════════════════ */
export default function NarrativeAuditCanvas({
    entities,
    relationships,
    onEntitySelect,
    onEntityUpdate,
    onEntityDelete,
    onEntityCreate,
}: NarrativeAuditCanvasProps) {

    const [search, setSearch] = useState('');
    const [renameKey, setRenameKey] = useState<string | null>(null); // "panel:entityId"
    const [renameVal, setRenameVal] = useState('');
    const [deleteConfirmKey, setDeleteConfirmKey] = useState<string | null>(null); // "panel:entityId"
    const [addingToArc, setAddingToArc] = useState<string | null>(null);
    const [newEventName, setNewEventName] = useState('');

    const events = useMemo(() => entities.filter(e => e.entity_type === 'event'), [entities]);
    const arcs = useMemo(() => entities.filter(e => e.entity_type === 'arc'), [entities]);
    const characters = useMemo(() => entities.filter(e => e.entity_type === 'character'), [entities]);

    const { chains, orphans } = useMemo(
        () => buildArcChains(entities, relationships),
        [entities, relationships],
    );

    const timelineGroups = useMemo(
        () => groupByTimestamp(events),
        [events],
    );

    // Search filter
    const matchesSearch = (name: string) =>
        !search || name.toLowerCase().includes(search.toLowerCase());

    // Stats
    const totalEvents = events.length;

    /* ── Export as Markdown ── */
    const exportMarkdown = () => {
        let md = '';
        // Arc chains
        for (const { arc, events: chainEvts } of chains) {
            md += `${arc.name.toUpperCase()}:\n`;
            for (const { entity, depth } of chainEvts) {
                const indent = '    '.repeat(depth);
                const arrow = depth > 0 ? '→ ' : '';
                const pov = safeStr(entity.properties?.pov_character);
                const povStr = pov ? ` (POV: ${pov})` : '';
                md += `${indent}${arrow}${entity.name}${povStr}\n`;
            }
            md += '\n';
        }
        md += '-----------------------------------------\n\n';
        // Chronological
        let num = 1;
        for (const group of timelineGroups) {
            md += `${group.label}:\n`;
            for (const entity of group.events) {
                const pov = safeStr(entity.properties?.pov_character);
                const povStr = pov ? ` ← POV: ${pov}` : '';
                md += `${num}. ${entity.name}${povStr}\n`;
                num++;
            }
            md += '\n';
        }
        navigator.clipboard.writeText(md);
    };

    /* ── Inline action renderers ── */
    const renderInlineActions = (entity: Entity, panel: string) => {
        const key = `${panel}:${entity.id}`;
        if (deleteConfirmKey === key) {
            return (
                <span style={{ display: 'inline-flex', gap: 4, marginLeft: 8, alignItems: 'center' }}
                    onClick={(e) => e.stopPropagation()}>
                    <span style={{ fontSize: 11, color: 'var(--error)' }}>Delete?</span>
                    <button onClick={() => { onEntityDelete(entity.id); setDeleteConfirmKey(null); }}
                        style={{ background: 'var(--error)', color: '#fff', border: 'none', borderRadius: 3, padding: '0 5px', fontSize: 11, cursor: 'pointer' }}>✓</button>
                    <button onClick={() => setDeleteConfirmKey(null)}
                        style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: 'none', borderRadius: 3, padding: '0 5px', fontSize: 11, cursor: 'pointer' }}>✕</button>
                </span>
            );
        }
        return (
            <span className="audit-row-actions" style={{ display: 'inline-flex', gap: 2, marginLeft: 6, opacity: 0, transition: 'opacity 0.15s' }}
                onClick={(e) => e.stopPropagation()}>
                <button title="Rename" onClick={() => { setRenameKey(key); setRenameVal(entity.name); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-tertiary)', padding: '0 3px' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}>✏️</button>
                <button title="Delete" onClick={() => setDeleteConfirmKey(key)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-tertiary)', padding: '0 3px' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--error)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}>🗑️</button>
            </span>
        );
    };

    const renderEntityName = (entity: Entity, panel: string, showIcon = false) => {
        const key = `${panel}:${entity.id}`;
        if (renameKey === key) {
            return (
                <input
                    className="input"
                    autoFocus
                    value={renameVal}
                    onChange={(e) => setRenameVal(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ display: 'inline', width: 200, fontSize: 'inherit', padding: '1px 6px', height: 'auto', verticalAlign: 'baseline' }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && renameVal.trim()) {
                            onEntityUpdate(entity.id, { name: renameVal.trim() });
                            setRenameKey(null);
                        }
                        if (e.key === 'Escape') setRenameKey(null);
                    }}
                    onBlur={() => {
                        if (renameVal.trim() && renameVal.trim() !== entity.name)
                            onEntityUpdate(entity.id, { name: renameVal.trim() });
                        setRenameKey(null);
                    }}
                />
            );
        }
        return (
            <span
                style={{ cursor: 'pointer' }}
                onClick={() => onEntitySelect(entity)}
                title={entity.description || undefined}
            >
                {showIcon && <span style={{ marginRight: 4 }}>{ENTITY_ICONS[entity.entity_type]}</span>}
                {entity.name}
            </span>
        );
    };

    /* ── POV tag ── */
    const renderPovTag = (entity: Entity) => {
        const pov = safeStr(entity.properties?.pov_character);
        if (!pov) return null;
        return (
            <span style={{
                marginLeft: 8, fontSize: 11, padding: '1px 6px',
                borderRadius: 'var(--radius-full)', background: 'rgba(99,102,241,0.12)',
                color: 'var(--accent)', fontStyle: 'italic',
            }}>
                POV: {pov}
            </span>
        );
    };

    /* ── Add event to chain ── */
    const renderAddToChain = (arcId: string, _afterEntityId: string | null) => {
        if (addingToArc !== arcId) return null;
        return (
            <div style={{ display: 'flex', gap: 6, padding: '4px 0 4px 24px', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>→</span>
                <input
                    className="input"
                    autoFocus
                    placeholder="New event name…"
                    value={newEventName}
                    onChange={(e) => setNewEventName(e.target.value)}
                    style={{ flex: 1, fontSize: 13, padding: '3px 8px', height: 'auto' }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && newEventName.trim()) {
                            onEntityCreate({
                                entity_type: 'event',
                                name: newEventName.trim(),
                                description: '',
                                properties: {},
                            });
                            // We can't link relationship here since we don't have the new ID yet
                            // The user can link it via the Relationships tab
                            setAddingToArc(null);
                            setNewEventName('');
                        }
                        if (e.key === 'Escape') { setAddingToArc(null); setNewEventName(''); }
                    }}
                />
                <button onClick={() => { setAddingToArc(null); setNewEventName(''); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 14 }}>✕</button>
            </div>
        );
    };

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', height: '100%',
            background: 'var(--bg-primary)', color: 'var(--text-primary)',
        }}>
            {/* ── Toolbar ── */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)',
                flexShrink: 0,
            }}>
                <span style={{ fontSize: 16 }}>📋</span>
                <span style={{ fontWeight: 700, fontSize: 14 }}>Narrative Audit</span>
                <input
                    className="input"
                    placeholder="Filter events…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{
                        width: 180, height: 28, fontSize: 12, padding: '0 10px',
                        borderRadius: 'var(--radius-full)', background: 'var(--bg-tertiary)',
                        border: 'none',
                    }}
                />
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {totalEvents} events · {arcs.length} arcs · {orphans.length} unlinked · {characters.length} characters
                </span>
                <button
                    onClick={exportMarkdown}
                    style={{
                        padding: '4px 10px', fontSize: 11, borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border)', background: 'var(--bg-tertiary)',
                        color: 'var(--text-secondary)', cursor: 'pointer',
                        transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                    title="Copy as sample.md format to clipboard"
                >
                    📎 Export MD
                </button>
            </div>

            {/* ── Two-Panel Body ── */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                {/* ── Left: Arc Chains ── */}
                <div style={{
                    flex: 1, overflowY: 'auto', padding: '16px 20px',
                    borderRight: '1px solid var(--border)',
                }}>
                    <h3 style={{
                        fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)',
                        textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12,
                    }}>Arc Chains</h3>

                    {chains.length === 0 && (
                        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                            No arcs found. Create arc entities and link events with causal relationships.
                        </p>
                    )}

                    {chains.map(({ arc, events: chainEvts }) => (
                        <div key={arc.id} style={{ marginBottom: 20 }}>
                            {/* Arc header */}
                            <div
                                className="audit-row"
                                style={{
                                    fontWeight: 700, fontSize: 13, color: 'var(--text-primary)',
                                    textTransform: 'uppercase', letterSpacing: 0.5,
                                    marginBottom: 6, padding: '4px 0',
                                    cursor: 'pointer',
                                }}
                            >
                                {renderEntityName(arc, 'arc', true)}
                                {renderInlineActions(arc, 'arc')}
                            </div>

                            {/* Chain events */}
                            {chainEvts.filter(({ entity }) => matchesSearch(entity.name)).map(({ entity, depth }) => (
                                <div
                                    key={entity.id}
                                    className="audit-row"
                                    style={{
                                        paddingLeft: depth * 20 + 8,
                                        fontSize: 13, lineHeight: '24px',
                                        display: 'flex', alignItems: 'center',
                                        borderRadius: 'var(--radius-sm)',
                                        transition: 'background 0.1s',
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                >
                                    {depth > 0 && (
                                        <span style={{ color: 'var(--text-tertiary)', marginRight: 6, fontSize: 12, flexShrink: 0 }}>→</span>
                                    )}
                                    {renderEntityName(entity, 'arc')}
                                    {renderPovTag(entity)}
                                    {renderInlineActions(entity, 'arc')}
                                </div>
                            ))}

                            {/* Add event to chain */}
                            {renderAddToChain(arc.id, chainEvts.length > 0 ? chainEvts[chainEvts.length - 1].entity.id : null)}
                            {addingToArc !== arc.id && (
                                <button
                                    onClick={() => { setAddingToArc(arc.id); setNewEventName(''); }}
                                    style={{
                                        marginLeft: 28, marginTop: 4, padding: '3px 10px',
                                        background: 'none', border: '1px dashed var(--border)',
                                        borderRadius: 'var(--radius-md)', cursor: 'pointer',
                                        color: 'var(--text-tertiary)', fontSize: 11,
                                        transition: 'all 0.15s',
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-tertiary)'; }}
                                >
                                    + Add Event
                                </button>
                            )}
                        </div>
                    ))}

                    {/* Orphan events */}
                    {orphans.length > 0 && (
                        <div style={{ marginTop: 16 }}>
                            <div style={{
                                fontSize: 12, fontWeight: 700, color: 'var(--warning)',
                                marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
                            }}>
                                ⚠️ Unlinked Events ({orphans.length})
                            </div>
                            {orphans.filter(e => matchesSearch(e.name)).map(entity => (
                                <div
                                    key={entity.id}
                                    className="audit-row"
                                    style={{
                                        fontSize: 13, lineHeight: '24px', paddingLeft: 8,
                                        display: 'flex', alignItems: 'center',
                                        borderRadius: 'var(--radius-sm)',
                                        transition: 'background 0.1s',
                                        color: 'var(--text-secondary)',
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                >
                                    <span style={{ color: 'var(--warning)', marginRight: 6, fontSize: 10 }}>●</span>
                                    {renderEntityName(entity, 'orphan')}
                                    {renderPovTag(entity)}
                                    {renderInlineActions(entity, 'orphan')}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── Right: Chronological Timeline ── */}
                <div style={{
                    flex: 1, overflowY: 'auto', padding: '16px 20px',
                }}>
                    <h3 style={{
                        fontSize: 12, fontWeight: 700, color: 'var(--text-tertiary)',
                        textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12,
                    }}>Chronological Timeline</h3>

                    {timelineGroups.length === 0 && (
                        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                            No events found. Create event entities and set their timestamp property.
                        </p>
                    )}

                    {(() => {
                        let globalNum = 1;
                        return timelineGroups.map((group) => (
                            <div key={group.label} style={{ marginBottom: 16 }}>
                                <div style={{
                                    fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
                                    marginBottom: 4, paddingBottom: 4,
                                    borderBottom: '1px solid rgba(100,116,139,0.15)',
                                }}>
                                    {group.label === '(no timestamp)'
                                        ? <span style={{ color: 'var(--warning)' }}>⚠️ {group.label}</span>
                                        : group.label}
                                </div>
                                {group.events.filter(e => matchesSearch(e.name)).map(entity => {
                                    const num = globalNum++;
                                    return (
                                        <div
                                            key={entity.id}
                                            className="audit-row"
                                            style={{
                                                fontSize: 13, lineHeight: '24px',
                                                display: 'flex', alignItems: 'center',
                                                borderRadius: 'var(--radius-sm)',
                                                padding: '2px 4px',
                                                transition: 'background 0.1s',
                                            }}
                                            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                        >
                                            <span style={{
                                                minWidth: 28, fontSize: 11, color: 'var(--text-tertiary)',
                                                fontWeight: 600, flexShrink: 0,
                                            }}>{num}.</span>
                                            {renderEntityName(entity, 'timeline')}
                                            {renderPovTag(entity)}
                                            {renderInlineActions(entity, 'timeline')}
                                        </div>
                                    );
                                })}
                            </div>
                        ));
                    })()}
                </div>
            </div>

            {/* ── Inline CSS for hover actions ── */}
            <style>{`
                .audit-row:hover .audit-row-actions {
                    opacity: 1 !important;
                }
            `}</style>
        </div>
    );
}
