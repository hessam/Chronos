import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import type { Entity } from '../store/appStore';

/* ================================================================
   CorrelationPanel — Co-Relation Analyzer
   Query tool to find indirect connections between entities.
   "Show me all characters impacted by X within N degrees of separation"
   ================================================================ */

const ENTITY_ICONS: Record<string, string> = {
    character: '👤', event: '⚡', timeline: '🕐', arc: '📐',
    theme: '💎', location: '📍', note: '📝', chapter: '📖',
};

const RELATIONSHIP_TYPES = [
    'causes', 'branches_into', 'creates', 'inspires', 'makes',
    'parent_of', 'originates_in', 'involves', 'located_at',
    'motivates', 'prevents', 'references', 'requires', 'threatens',
    'blocks', 'arrives_before', 'sibling_of', 'currently_in',
    'exists_in', 'ends_at', 'separates', 'costs', 'could_restore', 'means',
];

const ENTITY_TYPES = ['character', 'event', 'timeline', 'arc', 'theme', 'location', 'note', 'chapter'];

const DEGREE_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];

interface CorrelationPanelProps {
    entities: Entity[];
    projectId: string;
    onClose: () => void;
    onHighlightChange: (ids: Set<string> | null) => void;
    onEntitySelect: (entity: Entity) => void;
    initialSourceId?: string | null;
}

export function CorrelationPanel({
    entities,
    projectId,
    onClose,
    onHighlightChange,
    onEntitySelect,
    initialSourceId = null,
}: CorrelationPanelProps) {
    const [sourceId, setSourceId] = useState<string | null>(initialSourceId);
    const [depth, setDepth] = useState(2);
    const [relTypeFilter, setRelTypeFilter] = useState<Set<string>>(new Set());
    const [entityTypeFilter, setEntityTypeFilter] = useState<Set<string>>(new Set());
    const [showRelFilters, setShowRelFilters] = useState(false);
    const [showEntityFilters, setShowEntityFilters] = useState(false);

    // Query for related entities
    const { data: queryResult, isLoading, isError } = useQuery({
        queryKey: ['correlation', sourceId, depth, Array.from(relTypeFilter).sort(), Array.from(entityTypeFilter).sort()],
        queryFn: () => api.getRelatedEntities(
            sourceId!,
            depth,
            projectId,
            {
                relationshipTypes: relTypeFilter.size > 0 ? Array.from(relTypeFilter) : undefined,
                entityTypes: entityTypeFilter.size > 0 ? Array.from(entityTypeFilter) : undefined,
            }
        ),
        enabled: !!sourceId,
    });

    // Update graph highlight whenever results change
    useEffect(() => {
        if (!queryResult || !sourceId) {
            onHighlightChange(null);
            return;
        }
        const ids = new Set<string>([sourceId, ...queryResult.entities.map(e => e.id)]);
        onHighlightChange(ids);
    }, [queryResult, sourceId]); // eslint-disable-line react-hooks/exhaustive-deps

    const toggleRelType = (type: string) => {
        setRelTypeFilter(prev => {
            const next = new Set(prev);
            if (next.has(type)) next.delete(type); else next.add(type);
            return next;
        });
    };

    const toggleEntityType = (type: string) => {
        setEntityTypeFilter(prev => {
            const next = new Set(prev);
            if (next.has(type)) next.delete(type); else next.add(type);
            return next;
        });
    };

    const clearAll = () => {
        setSourceId(null);
        onHighlightChange(null);
    };

    // Group results by degree
    const groupedResults = new Map<number, Entity[]>();
    if (queryResult) {
        for (const entity of queryResult.entities) {
            const degree = queryResult.degrees.get(entity.id) ?? 99;
            if (!groupedResults.has(degree)) groupedResults.set(degree, []);
            groupedResults.get(degree)!.push(entity);
        }
    }

    const sourceName = entities.find(e => e.id === sourceId)?.name || '';

    return (
        <div style={{
            position: 'absolute', top: 0, right: 0, bottom: 0,
            width: 340, zIndex: 20,
            background: 'rgba(15, 23, 42, 0.97)',
            borderLeft: '1px solid #1e293b',
            display: 'flex', flexDirection: 'column',
            backdropFilter: 'blur(12px)',
            boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
            animation: 'slideInRight 0.2s ease-out',
        }}>
            {/* Header */}
            <div style={{
                padding: '12px 14px', borderBottom: '1px solid #1e293b',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>🔍</span>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#e2e8f0' }}>Co-Relation Analyzer</div>
                        <div style={{ fontSize: 9, color: '#475569' }}>Find indirect connections</div>
                    </div>
                </div>
                <button
                    onClick={() => { onHighlightChange(null); onClose(); }}
                    style={{
                        background: 'none', border: 'none', color: '#64748b',
                        cursor: 'pointer', fontSize: 16, padding: '2px 6px',
                    }}
                >✕</button>
            </div>

            {/* Source Selector */}
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #1e293b' }}>
                <label style={{ fontSize: 9, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                    Source Entity
                </label>
                <select
                    value={sourceId || ''}
                    onChange={(e) => setSourceId(e.target.value || null)}
                    style={{
                        width: '100%', padding: '6px 8px', borderRadius: 6,
                        background: '#1e293b', border: '1px solid #334155',
                        color: '#e2e8f0', fontSize: 12, outline: 'none',
                    }}
                >
                    <option value="">— Select an entity —</option>
                    {entities.map(e => (
                        <option key={e.id} value={e.id}>
                            {ENTITY_ICONS[e.entity_type] || '📄'} {e.name}
                        </option>
                    ))}
                </select>

                {/* Depth Slider */}
                <div style={{ marginTop: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={{ fontSize: 9, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                            Degrees of Separation
                        </label>
                        <span style={{
                            fontSize: 14, fontWeight: 700, color: DEGREE_COLORS[depth - 1] || '#6366f1',
                            fontFamily: 'monospace',
                        }}>{depth}</span>
                    </div>
                    <input
                        type="range" min={1} max={5} value={depth}
                        onChange={(e) => setDepth(Number(e.target.value))}
                        style={{ width: '100%', accentColor: DEGREE_COLORS[depth - 1] || '#6366f1', marginTop: 2 }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#475569' }}>
                        <span>Direct</span><span>Deep</span>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div style={{ padding: '8px 14px', borderBottom: '1px solid #1e293b' }}>
                {/* Relationship Type Filter */}
                <button
                    onClick={() => setShowRelFilters(p => !p)}
                    style={{
                        width: '100%', background: 'none', border: 'none', color: '#94a3b8',
                        fontSize: 10, fontWeight: 600, cursor: 'pointer', display: 'flex',
                        alignItems: 'center', justifyContent: 'space-between', padding: '4px 0',
                    }}
                >
                    <span>🔗 Relationship Types {relTypeFilter.size > 0 ? `(${relTypeFilter.size})` : '(all)'}</span>
                    <span>{showRelFilters ? '▾' : '▸'}</span>
                </button>
                {showRelFilters && (
                    <div style={{
                        display: 'flex', flexWrap: 'wrap', gap: 3, padding: '4px 0',
                        maxHeight: 100, overflowY: 'auto',
                    }}>
                        {RELATIONSHIP_TYPES.map(type => (
                            <button
                                key={type}
                                onClick={() => toggleRelType(type)}
                                style={{
                                    fontSize: 8, padding: '2px 6px', borderRadius: 10,
                                    border: '1px solid',
                                    borderColor: relTypeFilter.has(type) ? '#6366f1' : '#334155',
                                    background: relTypeFilter.has(type) ? 'rgba(99,102,241,0.2)' : 'transparent',
                                    color: relTypeFilter.has(type) ? '#a5b4fc' : '#64748b',
                                    cursor: 'pointer',
                                }}
                            >{type}</button>
                        ))}
                    </div>
                )}

                {/* Entity Type Filter */}
                <button
                    onClick={() => setShowEntityFilters(p => !p)}
                    style={{
                        width: '100%', background: 'none', border: 'none', color: '#94a3b8',
                        fontSize: 10, fontWeight: 600, cursor: 'pointer', display: 'flex',
                        alignItems: 'center', justifyContent: 'space-between', padding: '4px 0',
                    }}
                >
                    <span>📋 Entity Types {entityTypeFilter.size > 0 ? `(${entityTypeFilter.size})` : '(all)'}</span>
                    <span>{showEntityFilters ? '▾' : '▸'}</span>
                </button>
                {showEntityFilters && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '4px 0' }}>
                        {ENTITY_TYPES.map(type => (
                            <button
                                key={type}
                                onClick={() => toggleEntityType(type)}
                                style={{
                                    fontSize: 9, padding: '2px 8px', borderRadius: 10,
                                    border: '1px solid',
                                    borderColor: entityTypeFilter.has(type) ? '#6366f1' : '#334155',
                                    background: entityTypeFilter.has(type) ? 'rgba(99,102,241,0.2)' : 'transparent',
                                    color: entityTypeFilter.has(type) ? '#a5b4fc' : '#64748b',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                                }}
                            >
                                {ENTITY_ICONS[type]} {type}
                            </button>
                        ))}
                    </div>
                )}

                {sourceId && (
                    <button
                        onClick={clearAll}
                        style={{
                            marginTop: 6, width: '100%', padding: '4px 0',
                            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                            borderRadius: 6, color: '#f87171', fontSize: 10, cursor: 'pointer',
                        }}
                    >✕ Clear Query</button>
                )}
            </div>

            {/* Results */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px' }}>
                {!sourceId ? (
                    <div style={{
                        textAlign: 'center', padding: '40px 20px',
                        color: '#475569', fontSize: 11,
                    }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                        <div style={{ fontWeight: 600 }}>Select a source entity</div>
                        <div style={{ fontSize: 10, marginTop: 4 }}>
                            to discover connections across your story
                        </div>
                    </div>
                ) : isLoading ? (
                    <div style={{ textAlign: 'center', padding: 20, color: '#64748b', fontSize: 11 }}>
                        <div style={{ fontSize: 20, animation: 'spin 1s linear infinite' }}>⟳</div>
                        Traversing graph…
                    </div>
                ) : isError ? (
                    <div style={{ textAlign: 'center', padding: 20, color: '#f87171', fontSize: 11 }}>
                        ⚠ Error loading data
                    </div>
                ) : queryResult && queryResult.entities.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 20, color: '#475569', fontSize: 11 }}>
                        No connections found within {depth} degree{depth > 1 ? 's' : ''} of separation
                    </div>
                ) : (
                    <>
                        {/* Summary */}
                        <div style={{
                            padding: '6px 10px', borderRadius: 8,
                            background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
                            marginBottom: 10, fontSize: 10, color: '#a5b4fc',
                        }}>
                            <strong>{queryResult?.entities.length}</strong> entities connected to{' '}
                            <strong>{sourceName}</strong> within{' '}
                            <strong>{depth}</strong> degree{depth > 1 ? 's' : ''}
                            {relTypeFilter.size > 0 && <> via <strong>{relTypeFilter.size}</strong> relation types</>}
                        </div>

                        {/* Grouped by degree */}
                        {Array.from(groupedResults.entries())
                            .sort(([a], [b]) => a - b)
                            .map(([degree, degreeEntities]) => (
                                <div key={degree} style={{ marginBottom: 10 }}>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        marginBottom: 4, padding: '2px 0',
                                    }}>
                                        <div style={{
                                            width: 8, height: 8, borderRadius: '50%',
                                            background: DEGREE_COLORS[degree - 1] || '#64748b',
                                            boxShadow: `0 0 6px ${DEGREE_COLORS[degree - 1] || '#64748b'}`,
                                        }} />
                                        <span style={{
                                            fontSize: 9, fontWeight: 700, color: DEGREE_COLORS[degree - 1] || '#64748b',
                                            textTransform: 'uppercase',
                                        }}>
                                            {degree === 1 ? 'Direct' : `${degree} Degrees`} — {degreeEntities.length}
                                        </span>
                                    </div>
                                    {degreeEntities.map(entity => (
                                        <button
                                            key={entity.id}
                                            onClick={() => onEntitySelect(entity)}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 8,
                                                width: '100%', padding: '6px 8px', borderRadius: 6,
                                                background: 'rgba(30,41,59,0.5)', border: '1px solid #1e293b',
                                                color: '#e2e8f0', cursor: 'pointer', marginBottom: 3,
                                                textAlign: 'left', fontSize: 11,
                                                transition: 'background 0.15s',
                                            }}
                                            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(99,102,241,0.15)')}
                                            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(30,41,59,0.5)')}
                                        >
                                            <span style={{ fontSize: 14 }}>{ENTITY_ICONS[entity.entity_type] || '📄'}</span>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: 11 }}>{entity.name}</div>
                                                <div style={{ fontSize: 8, color: '#64748b' }}>{entity.entity_type}</div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ))}
                    </>
                )}
            </div>

            {/* Footer stats */}
            {queryResult && (
                <div style={{
                    padding: '6px 14px', borderTop: '1px solid #1e293b',
                    fontSize: 8, color: '#475569', display: 'flex', justifyContent: 'space-between',
                }}>
                    <span>{queryResult.paths.length} edges traversed</span>
                    <span>{groupedResults.size} depth levels</span>
                </div>
            )}

            {/* Inline CSS animation */}
            <style>{`
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `}</style>
        </div>
    );
}
