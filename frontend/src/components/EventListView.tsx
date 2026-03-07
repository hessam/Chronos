import { useState, useMemo } from 'react';
import type { Entity, Relationship } from '../store/appStore';

interface EventListViewProps {
    entities: Entity[];
    relationships: Relationship[];
    onSelectEntity: (entity: Entity) => void;
}

type SortField = 'title' | 'type' | 'status' | 'wordCount' | 'timeline' | 'pov' | 'date';
type SortDir = 'asc' | 'desc';

const ENTITY_ICONS: Record<string, string> = {
    character: '👤',
    timeline: '📅',
    location: '📍',
    theme: '💭',
    event: '🎬',
    note: '📝',
    arc: '📈',
    chapter: '🔖',
};

export default function EventListView({ entities, relationships, onSelectEntity }: EventListViewProps) {
    const [viewMode, setViewMode] = useState<'table' | 'timeline'>('table');
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<'all' | 'event'>('all');

    const [sortField, setSortField] = useState<SortField>('timeline');
    const [sortDir, setSortDir] = useState<SortDir>('asc');

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDir('asc');
        }
    };

    // Derived Data
    const tableData = useMemo(() => {
        let filtered = entities;

        if (typeFilter !== 'all') {
            filtered = filtered.filter(e => e.entity_type === typeFilter);
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(e => e.name.toLowerCase().includes(q) || (e.description || '').toLowerCase().includes(q));
        }

        const data = filtered.map(entity => {
            const props = entity.properties as Record<string, unknown> | undefined;
            const draftText = typeof props?.draft_text === 'string' ? props.draft_text : '';
            const wordCount = draftText ? draftText.split(/\\s+/).filter(Boolean).length : 0;
            const hasDraft = !!draftText;
            const datePos = typeof props?.chronological_position === 'number' ? props.chronological_position : 0;

            // Find related timelines and POVs
            const relatedRels = relationships.filter(r => r.from_entity_id === entity.id || r.to_entity_id === entity.id);

            const timelineIds = relatedRels
                .filter(r => r.relationship_type === 'occurs_in')
                .map(r => r.from_entity_id === entity.id ? r.to_entity_id : r.from_entity_id);
            const timelineNames = entities.filter(e => timelineIds.includes(e.id)).map(e => e.name).join(', ');

            const povIds = relatedRels
                .filter(r => ['involves', 'observes', 'experiences', 'knows'].includes(r.relationship_type)) // Just loosely gathering character links
                .map(r => r.from_entity_id === entity.id ? r.to_entity_id : r.from_entity_id);
            const povNames = entities.filter(e => e.entity_type === 'character' && povIds.includes(e.id)).map(e => e.name).join(', ');

            return {
                ...entity,
                wordCount,
                hasDraft,
                datePos,
                timelineNames,
                povNames,
            };
        });

        return data.sort((a, b) => {
            let valA: any = a.name;
            let valB: any = b.name;

            switch (sortField) {
                case 'title':
                    valA = a.name; valB = b.name;
                    break;
                case 'type':
                    valA = a.entity_type; valB = b.entity_type;
                    break;
                case 'status':
                    valA = a.hasDraft ? 1 : 0; valB = b.hasDraft ? 1 : 0;
                    break;
                case 'wordCount':
                    valA = a.wordCount; valB = b.wordCount;
                    break;
                case 'timeline':
                    valA = a.timelineNames; valB = b.timelineNames;
                    break;
                case 'pov':
                    valA = a.povNames; valB = b.povNames;
                    break;
                case 'date':
                    valA = a.datePos; valB = b.datePos;
                    break;
            }

            if (valA < valB) return sortDir === 'asc' ? -1 : 1;
            if (valA > valB) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
    }, [entities, relationships, searchQuery, typeFilter, sortField, sortDir]);

    return (
        <div style={{
            flex: 1, width: '100%', height: '100%',
            display: 'flex', flexDirection: 'column',
            padding: 'var(--space-3)',
            overflowY: 'auto'
        }}>
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: 'var(--space-3)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, margin: 0 }}>
                        📋 Entities & Events
                    </h2>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 'var(--radius-full)' }}>
                        {tableData.length} items
                    </span>
                </div>

                {/* Toolbar */}
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    {/* View Toggle */}
                    <div style={{
                        display: 'flex', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 2, border: '1px solid var(--border)'
                    }}>
                        <button
                            onClick={() => setViewMode('table')}
                            style={{
                                padding: '4px 12px', fontSize: 'var(--text-xs)', fontWeight: viewMode === 'table' ? 600 : 400,
                                background: viewMode === 'table' ? 'var(--bg-primary)' : 'transparent',
                                color: viewMode === 'table' ? 'var(--text-primary)' : 'var(--text-tertiary)',
                                border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                                boxShadow: viewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                            }}
                        >
                            Table
                        </button>
                        <button
                            onClick={() => setViewMode('timeline')}
                            style={{
                                padding: '4px 12px', fontSize: 'var(--text-xs)', fontWeight: viewMode === 'timeline' ? 600 : 400,
                                background: viewMode === 'timeline' ? 'var(--bg-primary)' : 'transparent',
                                color: viewMode === 'timeline' ? 'var(--text-primary)' : 'var(--text-tertiary)',
                                border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                                boxShadow: viewMode === 'timeline' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                            }}
                        >
                            Timeline
                        </button>
                    </div>

                    <select
                        className="input"
                        style={{ padding: '6px 12px', fontSize: 'var(--text-sm)', width: 140 }}
                        value={typeFilter}
                        onChange={e => setTypeFilter(e.target.value as any)}
                    >
                        <option value="all">All Types</option>
                        <option value="event">Events Only</option>
                    </select>

                    <input
                        className="input"
                        placeholder="Search..."
                        style={{ padding: '6px 12px', fontSize: 'var(--text-sm)', width: 200 }}
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {viewMode === 'table' ? (
                <div style={{
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border)',
                    overflow: 'hidden',
                    background: 'var(--bg-primary)',
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                            <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--bg-secondary)' }}>
                                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                    {[
                                        { key: 'title', label: 'Title', width: '30%' },
                                        { key: 'type', label: 'Type', width: '10%' },
                                        { key: 'timeline', label: 'Timeline', width: '15%' },
                                        { key: 'pov', label: 'POV', width: '15%' },
                                        { key: 'status', label: 'Status', width: '15%' },
                                        { key: 'wordCount', label: 'Words', width: '15%' }
                                    ].map(col => (
                                        <th
                                            key={col.key}
                                            onClick={() => handleSort(col.key as SortField)}
                                            style={{
                                                padding: '10px 12px', textAlign: 'left', fontWeight: 600,
                                                color: 'var(--text-secondary)', cursor: 'pointer',
                                                userSelect: 'none', width: col.width
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                {col.label}
                                                {sortField === col.key && (
                                                    <span style={{ fontSize: 10, color: 'var(--accent)' }}>
                                                        {sortDir === 'asc' ? '▲' : '▼'}
                                                    </span>
                                                )}
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {tableData.map(entity => (
                                    <tr
                                        key={entity.id}
                                        onClick={() => onSelectEntity(entity)}
                                        style={{
                                            borderBottom: '1px solid var(--border)',
                                            cursor: 'pointer',
                                            transition: 'background 0.15s',
                                        }}
                                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                    >
                                        <td style={{ padding: '10px 12px', fontWeight: 500, color: 'var(--text-primary)' }}>
                                            {ENTITY_ICONS[entity.entity_type] || '📄'} {entity.name}
                                        </td>
                                        <td style={{ padding: '10px 12px', color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>
                                            {entity.entity_type}
                                        </td>
                                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>
                                            {entity.timelineNames || <span style={{ color: 'var(--text-tertiary)', opacity: 0.5 }}>—</span>}
                                        </td>
                                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>
                                            {entity.povNames || <span style={{ color: 'var(--text-tertiary)', opacity: 0.5 }}>—</span>}
                                        </td>
                                        <td style={{ padding: '10px 12px' }}>
                                            {entity.hasDraft ? (
                                                <span style={{ color: '#10b981', fontSize: '11px', fontWeight: 600, background: 'rgba(16,185,129,0.1)', padding: '2px 6px', borderRadius: 4 }}>✓ Drafted</span>
                                            ) : (
                                                <span style={{ color: 'var(--text-tertiary)', fontSize: '11px', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: 4 }}>Empty</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                                            {entity.wordCount > 0 ? entity.wordCount.toLocaleString() : '0'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {tableData.length === 0 && (
                            <div style={{ padding: 'var(--space-8) var(--space-4)', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                                No entities match your filters.
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div style={{ flex: 1, minHeight: 0, position: 'relative', background: 'var(--bg-primary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', padding: 'var(--space-4)', overflow: 'hidden' }}>
                    {/* SVG 2D Timeline visualization replacing the canvas */}
                    {(() => {
                        const events = tableData.filter(e => e.entity_type === 'event');
                        if (events.length === 0) {
                            return <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', paddingTop: 100 }}>No events to render on timeline.</div>;
                        }

                        // Super simple timeline renderer: Extract all timelines, plot events horizontally by sort_order / properties.chronological_position
                        const tracks = Array.from(new Set(events.map(e => e.timelineNames || 'Unassigned')));

                        return (
                            <div style={{ width: '100%', height: '100%', overflow: 'auto' }}>
                                <svg width={Math.max(800, events.length * 150)} height={Math.max(400, tracks.length * 120)}>
                                    {tracks.map((trackName, tIdx) => {
                                        const y = 60 + tIdx * 120;
                                        const trackEvents = events.filter(e => (e.timelineNames || 'Unassigned') === trackName);
                                        trackEvents.sort((a, b) => a.datePos - b.datePos);

                                        return (
                                            <g key={trackName}>
                                                <text x={20} y={y - 20} fill="var(--text-secondary)" fontSize={12} fontWeight={600}>{trackName}</text>
                                                <line x1={20} y1={y} x2={Math.max(800, events.length * 150) - 20} y2={y} stroke="var(--border)" strokeWidth={2} />

                                                {trackEvents.map((evt, eIdx) => {
                                                    const x = 150 + eIdx * 150;
                                                    return (
                                                        <g key={evt.id} transform={`translate(${x}, ${y})`} style={{ cursor: 'pointer' }} onClick={() => onSelectEntity(evt)}>
                                                            <circle r={8} fill={evt.hasDraft ? '#10b981' : 'var(--bg-tertiary)'} stroke="var(--border)" strokeWidth={2} />
                                                            <text y={20} textAnchor="middle" fill="var(--text-primary)" fontSize={12} width={120}>
                                                                {evt.name.length > 15 ? evt.name.substring(0, 15) + '...' : evt.name}
                                                            </text>
                                                        </g>
                                                    );
                                                })}
                                            </g>
                                        );
                                    })}
                                </svg>
                            </div>
                        );
                    })()}
                </div>
            )}
        </div>
    );
}
