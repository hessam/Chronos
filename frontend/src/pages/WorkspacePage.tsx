import { useEffect, useState, FormEvent, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { useAppStore, resolveEntity } from '../store/appStore';
import type { Entity } from '../store/appStore';
import { useAuthStore } from '../store/authStore';
import TimelineCanvas from '../components/TimelineCanvas';
import { generateIdeas, hasConfiguredProvider } from '../services/aiService';
import type { GeneratedIdea, GenerateIdeasResult } from '../services/aiService';

const ENTITY_ICONS: Record<string, string> = {
    character: '👤',
    timeline: '📅',
    event: '⚡',
    arc: '📐',
    theme: '🎭',
    location: '📍',
    note: '📝',
    all: '📋',
};

const ENTITY_LABELS: Record<string, string> = {
    character: 'Characters',
    timeline: 'Timelines',
    event: 'Events',
    arc: 'Arcs',
    theme: 'Themes',
    location: 'Locations',
    note: 'Notes',
};

// Colors for variant timeline dots
const VARIANT_DOT_COLORS = [
    '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
    '#06b6d4', '#f97316', '#ef4444', '#84cc16', '#14b8a6',
];

export default function WorkspacePage() {
    const { projectId } = useParams<{ projectId: string }>();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const signOut = useAuthStore((s) => s.signOut);
    const {
        currentProject, setCurrentProject,
        selectedEntity, setSelectedEntity,
        entityFilter, setEntityFilter,
        contextPanelOpen,
        focusedTimelineId, setFocusedTimelineId,
    } = useAppStore();

    const [searchQuery, setSearchQuery] = useState('');
    const [showCreateEntity, setShowCreateEntity] = useState(false);
    const [newEntityName, setNewEntityName] = useState('');
    const [newEntityDesc, setNewEntityDesc] = useState('');
    const [newEntityType, setNewEntityType] = useState<Entity['entity_type']>('character');
    const [newEntityProps, setNewEntityProps] = useState('');

    // AI State
    const [aiIdeas, setAiIdeas] = useState<GeneratedIdea[]>([]);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);
    const [aiResult, setAiResult] = useState<GenerateIdeasResult | null>(null);

    // Entity editing
    const [editingField, setEditingField] = useState<string | null>(null);
    const [editNameVal, setEditNameVal] = useState('');
    const [editDescVal, setEditDescVal] = useState('');

    // Timeline visibility toggles
    const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());

    // Variant editing state
    const [activeDetailTab, setActiveDetailTab] = useState<'details' | 'variants'>('details');
    const [editingVariantTimeline, setEditingVariantTimeline] = useState<string | null>(null);
    const [variantNameVal, setVariantNameVal] = useState('');
    const [variantDescVal, setVariantDescVal] = useState('');

    // Fetch project
    const { data: projectData } = useQuery({
        queryKey: ['project', projectId],
        queryFn: () => api.getProject(projectId!),
        enabled: !!projectId,
    });

    useEffect(() => {
        if (projectData?.project) setCurrentProject(projectData.project);
        return () => setCurrentProject(null);
    }, [projectData, setCurrentProject]);

    // Fetch entities (unfiltered for canvas — we filter in the sidebar)
    const { data: allEntitiesData } = useQuery({
        queryKey: ['entities', projectId, 'all'],
        queryFn: () => api.getEntities(projectId!, { limit: 200 }),
        enabled: !!projectId,
    });

    // Filtered for sidebar
    const entityQueryKey = ['entities', projectId, entityFilter, searchQuery];
    const { data: entitiesData, isLoading: entitiesLoading } = useQuery({
        queryKey: entityQueryKey,
        queryFn: () => api.getEntities(projectId!, {
            type: entityFilter !== 'all' ? entityFilter : undefined,
            search: searchQuery || undefined,
            limit: 100,
        }),
        enabled: !!projectId,
    });

    // Fetch all variants for this project (batch load for canvas indicators + focus mode)
    const { data: variantsData } = useQuery({
        queryKey: ['variants', projectId],
        queryFn: () => api.getProjectVariants(projectId!),
        enabled: !!projectId,
    });

    // Fetch variants for selected entity (for variant tab)
    const { data: entityVariantsData } = useQuery({
        queryKey: ['variants', 'entity', selectedEntity?.id],
        queryFn: () => api.getVariants(selectedEntity!.id),
        enabled: !!selectedEntity,
    });

    // Create entity
    const createEntity = useMutation({
        mutationFn: (body: { entity_type: string; name: string; description: string; properties: Record<string, unknown> }) =>
            api.createEntity(projectId!, body),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['entities', projectId] });
            setShowCreateEntity(false);
            setNewEntityName('');
            setNewEntityDesc('');
            setNewEntityProps('');
        },
    });

    // Update entity
    const updateEntity = useMutation({
        mutationFn: ({ id, body }: { id: string; body: Parameters<typeof api.updateEntity>[1] }) =>
            api.updateEntity(id, body),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['entities', projectId] });
        },
    });

    // Delete entity
    const deleteEntity = useMutation({
        mutationFn: (id: string) => api.deleteEntity(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['entities', projectId] });
            setSelectedEntity(null);
        },
    });

    // Upsert variant
    const upsertVariant = useMutation({
        mutationFn: (body: { entity_id: string; timeline_id: string; variant_name?: string | null; variant_description?: string | null; variant_properties?: Record<string, unknown> }) =>
            api.upsertVariant(projectId!, body),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['variants'] });
            setEditingVariantTimeline(null);
        },
    });

    // Delete variant
    const deleteVariant = useMutation({
        mutationFn: ({ entityId, timelineId }: { entityId: string; timelineId: string }) =>
            api.deleteVariant(entityId, timelineId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['variants'] });
        },
    });

    // Position update callback (E2-US3: drag persistence)
    const handlePositionUpdate = useCallback((entityId: string, x: number, y: number) => {
        updateEntity.mutate({ id: entityId, body: { position_x: x, position_y: y } });
    }, [updateEntity]);

    // Entity field save
    const handleSaveField = (field: string) => {
        if (!selectedEntity) return;
        const body: Record<string, string> = {};
        if (field === 'name') body.name = editNameVal;
        if (field === 'description') body.description = editDescVal;
        updateEntity.mutate(
            { id: selectedEntity.id, body },
            {
                onSuccess: (result) => {
                    setSelectedEntity(result.entity);
                    setEditingField(null);
                },
            }
        );
    };

    // Save variant override
    const handleSaveVariant = (timelineId: string) => {
        if (!selectedEntity) return;
        upsertVariant.mutate({
            entity_id: selectedEntity.id,
            timeline_id: timelineId,
            variant_name: variantNameVal || null,
            variant_description: variantDescVal || null,
        });
    };

    // AI idea generation (E3-US3)
    const handleGenerateIdeas = async () => {
        if (!selectedEntity) return;
        setAiLoading(true);
        setAiError(null);
        setAiIdeas([]);

        try {
            const allEntities = allEntitiesData?.entities || [];
            // Get 1-hop linked entities for context
            const linkedEntities = allEntities
                .filter(e => e.id !== selectedEntity.id)
                .slice(0, 5)
                .map(e => ({ name: e.name, type: e.entity_type, description: e.description }));

            const result = await generateIdeas({
                entityName: selectedEntity.name,
                entityType: selectedEntity.entity_type,
                entityDescription: selectedEntity.description,
                linkedEntities,
                projectContext: currentProject?.description,
            });

            setAiIdeas(result.ideas);
            setAiResult(result);
        } catch (err) {
            setAiError(err instanceof Error ? err.message : 'Failed to generate ideas');
        } finally {
            setAiLoading(false);
        }
    };

    // Save AI idea as Note entity
    const saveIdeaAsNote = (idea: GeneratedIdea) => {
        createEntity.mutate({
            entity_type: 'note',
            name: idea.title,
            description: idea.description,
            properties: { source: 'ai_generated', confidence: idea.confidence },
        });
    };

    function handleCreateEntity(e: FormEvent) {
        e.preventDefault();
        let properties = {};
        if (newEntityProps.trim()) {
            try { properties = JSON.parse(newEntityProps); }
            catch { /* ignore parse errors */ }
        }
        createEntity.mutate({
            entity_type: newEntityType,
            name: newEntityName.trim(),
            description: newEntityDesc.trim(),
            properties,
        });
    }

    const toggleType = (type: string) => {
        setHiddenTypes(prev => {
            const next = new Set(prev);
            if (next.has(type)) next.delete(type);
            else next.add(type);
            return next;
        });
    };

    const allEntities = allEntitiesData?.entities || [];
    const filteredEntities = entitiesData?.entities || [];
    const allVariants = variantsData?.variants || [];
    const entityVariants = entityVariantsData?.variants || [];
    const entityTypes = [...new Set(allEntities.map(e => e.entity_type))];
    const aiConfigured = hasConfiguredProvider();

    // Get list of timeline entities for focus dropdown and variant tab
    const timelines = allEntities.filter(e => e.entity_type === 'timeline');

    // Build a map of entity_id → timeline_ids that have variants (for canvas indicators)
    const variantMap = new Map<string, string[]>();
    for (const v of allVariants) {
        const existing = variantMap.get(v.entity_id) || [];
        existing.push(v.timeline_id);
        variantMap.set(v.entity_id, existing);
    }

    // Timeline color map for variant dots
    const timelineColorMap = new Map<string, string>();
    timelines.forEach((t, i) => {
        timelineColorMap.set(t.id, VARIANT_DOT_COLORS[i % VARIANT_DOT_COLORS.length]);
    });

    // Resolve entities for canvas when in focus mode
    const canvasEntities = focusedTimelineId
        ? allEntities.map(e => resolveEntity(e, focusedTimelineId, allVariants))
        : allEntities;

    // Resolve selected entity for display when in focus mode
    const displayEntity = selectedEntity
        ? resolveEntity(selectedEntity, focusedTimelineId, allVariants)
        : null;

    return (
        <div className="app-layout">
            {/* ─── Left Sidebar ──────────────────────────────── */}
            <aside className="sidebar">
                {/* Project Header */}
                <div style={{ padding: 'var(--space-2)', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/projects')}>← Back</button>
                        <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/settings')} title="AI Settings">⚙️</button>
                            <button className="btn btn-ghost btn-sm" onClick={signOut}>Sign Out</button>
                        </div>
                    </div>
                    <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginTop: 'var(--space-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {currentProject?.name || 'Loading...'}
                    </h2>
                </div>

                {/* Search */}
                <div className="search-bar">
                    <span className="search-icon">🔍</span>
                    <input
                        className="input"
                        placeholder="Search entities..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                {/* Entity Filters */}
                <div className="filter-tabs">
                    <button
                        className={`filter-tab ${entityFilter === 'all' ? 'active' : ''}`}
                        onClick={() => setEntityFilter('all')}
                    >
                        All
                    </button>
                    {Object.entries(ENTITY_LABELS).map(([type, label]) => (
                        <button
                            key={type}
                            className={`filter-tab ${entityFilter === type ? 'active' : ''}`}
                            onClick={() => setEntityFilter(type as Entity['entity_type'])}
                        >
                            {ENTITY_ICONS[type]} {label}
                        </button>
                    ))}
                </div>

                {/* Timeline Focus Mode (E2-US5) */}
                {timelines.length > 0 && (
                    <div style={{ padding: '0 var(--space-2) var(--space-1)' }}>
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '6px 10px',
                            background: focusedTimelineId ? 'rgba(99,102,241,0.1)' : 'var(--bg-secondary)',
                            borderRadius: 'var(--radius-md)',
                            border: focusedTimelineId ? '1px solid rgba(99,102,241,0.3)' : '1px solid var(--border)',
                            transition: 'all 0.2s',
                        }}>
                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                                🔭 Focus:
                            </span>
                            <select
                                className="input"
                                value={focusedTimelineId || ''}
                                onChange={(e) => setFocusedTimelineId(e.target.value || null)}
                                style={{
                                    fontSize: 'var(--text-xs)', padding: '2px 6px', height: 'auto',
                                    border: 'none', background: 'transparent', flex: 1,
                                    color: focusedTimelineId ? 'var(--accent)' : 'var(--text-secondary)',
                                    fontWeight: focusedTimelineId ? 600 : 400,
                                }}
                            >
                                <option value="">All Timelines (canonical)</option>
                                {timelines.map(t => (
                                    <option key={t.id} value={t.id}>📅 {t.name}</option>
                                ))}
                            </select>
                            {focusedTimelineId && (
                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => setFocusedTimelineId(null)}
                                    style={{ padding: '0 4px', height: 'auto', fontSize: 12, lineHeight: 1 }}
                                    title="Clear focus"
                                >✕</button>
                            )}
                        </div>
                    </div>
                )}

                {/* Timeline Visibility Toggles */}
                {entityTypes.length > 1 && (
                    <div style={{ padding: '0 var(--space-2) var(--space-1)', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', width: '100%', marginBottom: 2 }}>Canvas visibility:</span>
                        {entityTypes.map(type => (
                            <button
                                key={type}
                                onClick={() => toggleType(type)}
                                style={{
                                    fontSize: 'var(--text-xs)',
                                    padding: '2px 8px',
                                    borderRadius: 'var(--radius-full)',
                                    border: '1px solid var(--border)',
                                    background: hiddenTypes.has(type) ? 'transparent' : 'var(--bg-tertiary)',
                                    color: hiddenTypes.has(type) ? 'var(--text-tertiary)' : 'var(--text-primary)',
                                    cursor: 'pointer',
                                    textDecoration: hiddenTypes.has(type) ? 'line-through' : 'none',
                                    opacity: hiddenTypes.has(type) ? 0.5 : 1,
                                    transition: 'all 0.15s',
                                    textTransform: 'capitalize',
                                }}
                            >
                                {ENTITY_ICONS[type]} {type}
                            </button>
                        ))}
                    </div>
                )}

                {/* Entity List */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--space-1)' }}>
                    {entitiesLoading ? (
                        <div className="loading-center" style={{ height: 100 }}><div className="spinner" /></div>
                    ) : filteredEntities.length === 0 ? (
                        <div className="empty-state" style={{ padding: 'var(--space-3)' }}>
                            <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>No entities yet</p>
                        </div>
                    ) : (
                        <div className="entity-list">
                            {filteredEntities.map((entity) => {
                                const entityVariantTimelines = variantMap.get(entity.id) || [];
                                return (
                                    <div
                                        key={entity.id}
                                        className={`entity-item ${selectedEntity?.id === entity.id ? 'active' : ''}`}
                                        onClick={() => { setSelectedEntity(entity); setActiveDetailTab('details'); }}
                                    >
                                        <div className="entity-icon">{ENTITY_ICONS[entity.entity_type]}</div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {focusedTimelineId ? resolveEntity(entity, focusedTimelineId, allVariants).name : entity.name}
                                            </div>
                                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>{entity.entity_type}</div>
                                        </div>
                                        {/* Variant indicator dots */}
                                        {entityVariantTimelines.length > 0 && (
                                            <div style={{ display: 'flex', gap: 2, alignItems: 'center' }} title={`Variants in ${entityVariantTimelines.length} timeline(s)`}>
                                                {entityVariantTimelines.slice(0, 4).map(tlId => (
                                                    <div
                                                        key={tlId}
                                                        style={{
                                                            width: 6, height: 6, borderRadius: '50%',
                                                            background: timelineColorMap.get(tlId) || '#888',
                                                            border: tlId === focusedTimelineId ? '1.5px solid white' : 'none',
                                                            boxShadow: tlId === focusedTimelineId ? '0 0 0 1px rgba(99,102,241,0.5)' : 'none',
                                                        }}
                                                    />
                                                ))}
                                                {entityVariantTimelines.length > 4 && (
                                                    <span style={{ fontSize: 8, color: 'var(--text-tertiary)' }}>+{entityVariantTimelines.length - 4}</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Add Entity Button */}
                <div style={{ padding: 'var(--space-2)', borderTop: '1px solid var(--border)' }}>
                    <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setShowCreateEntity(true)}>
                        + New Entity
                    </button>
                </div>
            </aside>

            {/* ─── Main Content ──────────────────────────────── */}
            <main className="main-content" style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
                {!selectedEntity ? (
                    <div style={{ flex: 1, position: 'relative' }}>
                        <TimelineCanvas
                            entities={canvasEntities}
                            onEntitySelect={setSelectedEntity}
                            selectedEntityId={null}
                            onEntityPositionUpdate={handlePositionUpdate}
                            hiddenTypes={hiddenTypes}
                        />
                        {/* Focus mode banner */}
                        {focusedTimelineId && (
                            <div style={{
                                position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
                                padding: '4px 16px', borderRadius: 'var(--radius-full)',
                                background: 'rgba(99,102,241,0.15)', backdropFilter: 'blur(8px)',
                                border: '1px solid rgba(99,102,241,0.3)',
                                fontSize: 'var(--text-xs)', color: 'var(--accent)', fontWeight: 500,
                                display: 'flex', alignItems: 'center', gap: 6,
                                zIndex: 10,
                            }}>
                                🔭 Focused: {timelines.find(t => t.id === focusedTimelineId)?.name || 'Unknown'}
                                <button
                                    onClick={() => setFocusedTimelineId(null)}
                                    style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: '0 2px', fontSize: 12 }}
                                >✕</button>
                            </div>
                        )}
                    </div>
                ) : displayEntity && (
                    <div style={{ padding: 'var(--space-3)', overflowY: 'auto', flex: 1 }}>
                        <div style={{ maxWidth: 720 }}>
                            {/* Header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => { setSelectedEntity(null); setAiIdeas([]); setAiError(null); }}
                                    title="Back to canvas"
                                >← Canvas</button>
                                <span style={{ fontSize: 32 }}>{ENTITY_ICONS[selectedEntity.entity_type]}</span>
                                <div style={{ flex: 1 }}>
                                    {editingField === 'name' ? (
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            <input
                                                className="input"
                                                value={editNameVal}
                                                onChange={(e) => setEditNameVal(e.target.value)}
                                                autoFocus
                                                style={{ fontSize: 'var(--text-xl)', fontWeight: 600 }}
                                            />
                                            <button className="btn btn-primary btn-sm" onClick={() => handleSaveField('name')}>Save</button>
                                            <button className="btn btn-ghost btn-sm" onClick={() => setEditingField(null)}>✕</button>
                                        </div>
                                    ) : (
                                        <h1
                                            style={{ fontSize: 'var(--text-2xl)', fontWeight: 600, cursor: 'pointer' }}
                                            onClick={() => { setEditingField('name'); setEditNameVal(selectedEntity.name); }}
                                            title="Click to edit"
                                        >
                                            {displayEntity.name}
                                            {focusedTimelineId && displayEntity.name !== selectedEntity.name && (
                                                <span style={{
                                                    fontSize: 'var(--text-xs)', color: 'var(--accent)',
                                                    marginLeft: 8, padding: '1px 6px',
                                                    background: 'rgba(99,102,241,0.1)', borderRadius: 'var(--radius-full)',
                                                    verticalAlign: 'middle',
                                                }}>overridden</span>
                                            )}
                                        </h1>
                                    )}
                                    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>{selectedEntity.entity_type}</span>
                                </div>
                                <button
                                    className="btn btn-destructive btn-sm"
                                    onClick={() => {
                                        if (confirm(`Delete "${selectedEntity.name}"?`)) {
                                            deleteEntity.mutate(selectedEntity.id);
                                        }
                                    }}
                                >
                                    Delete
                                </button>
                            </div>

                            {/* Tab Selector: Details | Variants */}
                            {selectedEntity.entity_type !== 'timeline' && timelines.length > 0 && (
                                <div style={{
                                    display: 'flex', gap: 0, marginBottom: 'var(--space-3)',
                                    borderBottom: '2px solid var(--border)',
                                }}>
                                    <button
                                        onClick={() => setActiveDetailTab('details')}
                                        style={{
                                            padding: '8px 16px', fontSize: 'var(--text-sm)', fontWeight: 500,
                                            background: 'none', border: 'none', cursor: 'pointer',
                                            color: activeDetailTab === 'details' ? 'var(--accent)' : 'var(--text-tertiary)',
                                            borderBottom: activeDetailTab === 'details' ? '2px solid var(--accent)' : '2px solid transparent',
                                            marginBottom: -2, transition: 'all 0.15s',
                                        }}
                                    >
                                        📋 Details
                                    </button>
                                    <button
                                        onClick={() => setActiveDetailTab('variants')}
                                        style={{
                                            padding: '8px 16px', fontSize: 'var(--text-sm)', fontWeight: 500,
                                            background: 'none', border: 'none', cursor: 'pointer',
                                            color: activeDetailTab === 'variants' ? 'var(--accent)' : 'var(--text-tertiary)',
                                            borderBottom: activeDetailTab === 'variants' ? '2px solid var(--accent)' : '2px solid transparent',
                                            marginBottom: -2, transition: 'all 0.15s',
                                            display: 'flex', alignItems: 'center', gap: 6,
                                        }}
                                    >
                                        🔀 Timeline Variants
                                        {entityVariants.length > 0 && (
                                            <span style={{
                                                fontSize: 'var(--text-xs)', padding: '0 6px',
                                                borderRadius: 'var(--radius-full)',
                                                background: 'rgba(99,102,241,0.15)', color: 'var(--accent)',
                                                fontWeight: 600,
                                            }}>{entityVariants.length}</span>
                                        )}
                                    </button>
                                </div>
                            )}

                            {/* ─── Details Tab ─── */}
                            {activeDetailTab === 'details' && (
                                <>
                                    {/* Description (editable) */}
                                    <div style={{ marginBottom: 'var(--space-3)' }}>
                                        <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 'var(--space-1)', color: 'var(--text-secondary)' }}>Description</h3>
                                        {editingField === 'description' ? (
                                            <div>
                                                <textarea
                                                    className="textarea"
                                                    value={editDescVal}
                                                    onChange={(e) => setEditDescVal(e.target.value)}
                                                    rows={4}
                                                    autoFocus
                                                />
                                                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                                                    <button className="btn btn-primary btn-sm" onClick={() => handleSaveField('description')}>Save</button>
                                                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingField(null)}>Cancel</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <p
                                                style={{ lineHeight: 1.6, cursor: 'pointer', padding: 8, borderRadius: 'var(--radius-sm)', border: '1px solid transparent' }}
                                                onClick={() => { setEditingField('description'); setEditDescVal(selectedEntity.description); }}
                                                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                                                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'transparent')}
                                                title="Click to edit"
                                            >
                                                {displayEntity.description || <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>No description. Click to add one.</span>}
                                                {focusedTimelineId && displayEntity.description !== selectedEntity.description && (
                                                    <span style={{
                                                        fontSize: 'var(--text-xs)', color: 'var(--accent)',
                                                        marginLeft: 8, padding: '1px 6px',
                                                        background: 'rgba(99,102,241,0.1)', borderRadius: 'var(--radius-full)',
                                                    }}>overridden</span>
                                                )}
                                            </p>
                                        )}
                                    </div>

                                    {Object.keys(displayEntity.properties).length > 0 && (
                                        <div style={{ marginBottom: 'var(--space-3)' }}>
                                            <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 'var(--space-1)', color: 'var(--text-secondary)' }}>Properties</h3>
                                            {Object.entries(displayEntity.properties).map(([key, value]) => (
                                                <div key={key} style={{ display: 'flex', gap: 'var(--space-2)', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                                                    <span style={{ fontWeight: 500, minWidth: 120, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}</span>
                                                    <span>{Array.isArray(value) ? value.join(', ') : String(value)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* AI Idea Generation (E3-US3) */}
                                    <div style={{
                                        marginTop: 'var(--space-3)',
                                        padding: 'var(--space-3)',
                                        background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.06))',
                                        borderRadius: 'var(--radius-lg)',
                                        border: '1px solid rgba(99,102,241,0.15)',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                                            <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                                                🧠 AI Ideas
                                            </h3>
                                            <button
                                                className="btn btn-primary btn-sm"
                                                onClick={handleGenerateIdeas}
                                                disabled={aiLoading}
                                                style={{ gap: 6 }}
                                            >
                                                {aiLoading ? (
                                                    <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Thinking...</>
                                                ) : '✨ Generate Ideas'}
                                            </button>
                                        </div>

                                        {!aiConfigured && !aiLoading && aiIdeas.length === 0 && (
                                            <div style={{
                                                padding: 'var(--space-2)',
                                                background: 'var(--warning-muted)',
                                                borderRadius: 'var(--radius-md)',
                                                fontSize: 'var(--text-sm)',
                                                color: 'var(--warning)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8,
                                            }}>
                                                ⚠️ No API key configured.{' '}
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => navigate('/settings')}
                                                    style={{ color: 'var(--accent)', fontSize: 'var(--text-sm)', padding: '2px 8px', height: 'auto' }}
                                                >
                                                    Go to Settings →
                                                </button>
                                            </div>
                                        )}

                                        {aiError && (
                                            <div style={{
                                                padding: 'var(--space-2)',
                                                background: 'var(--error-muted)',
                                                borderRadius: 'var(--radius-md)',
                                                fontSize: 'var(--text-sm)',
                                                color: 'var(--error)',
                                            }}>
                                                {aiError}
                                            </div>
                                        )}

                                        {aiIdeas.length > 0 && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                                                {aiResult && (
                                                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 4 }}>
                                                        Generated by {aiResult.provider}/{aiResult.model} {aiResult.cached ? '(cached)' : ''}
                                                    </div>
                                                )}
                                                {aiIdeas.map((idea) => (
                                                    <div
                                                        key={idea.id}
                                                        style={{
                                                            padding: 'var(--space-2)',
                                                            background: 'var(--bg-secondary)',
                                                            borderRadius: 'var(--radius-md)',
                                                            border: '1px solid var(--border)',
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                                            <strong style={{ fontSize: 'var(--text-base)' }}>{idea.title}</strong>
                                                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                                                <span style={{
                                                                    fontSize: 'var(--text-xs)',
                                                                    padding: '2px 6px',
                                                                    borderRadius: 'var(--radius-full)',
                                                                    background: idea.confidence > 0.8 ? 'var(--success-muted)' : idea.confidence > 0.5 ? 'var(--warning-muted)' : 'var(--error-muted)',
                                                                    color: idea.confidence > 0.8 ? 'var(--success)' : idea.confidence > 0.5 ? 'var(--warning)' : 'var(--error)',
                                                                }}>
                                                                    {Math.round(idea.confidence * 100)}%
                                                                </span>
                                                                <button
                                                                    className="btn btn-ghost btn-sm"
                                                                    onClick={() => navigator.clipboard.writeText(`${idea.title}\n${idea.description}`)}
                                                                    title="Copy"
                                                                    style={{ padding: '2px 6px', height: 'auto', fontSize: 12 }}
                                                                >📋</button>
                                                                <button
                                                                    className="btn btn-ghost btn-sm"
                                                                    onClick={() => saveIdeaAsNote(idea)}
                                                                    title="Save as Note"
                                                                    style={{ padding: '2px 6px', height: 'auto', fontSize: 12 }}
                                                                >💾</button>
                                                            </div>
                                                        </div>
                                                        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                                            {idea.description}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {aiConfigured && !aiLoading && aiIdeas.length === 0 && !aiError && (
                                            <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
                                                Click "Generate Ideas" to get AI-powered plot suggestions based on this {selectedEntity.entity_type}.
                                            </p>
                                        )}
                                    </div>

                                    {/* Metadata */}
                                    <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-2)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                                        <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
                                            Created: {new Date(selectedEntity.created_at).toLocaleString()} • Updated: {new Date(selectedEntity.updated_at).toLocaleString()}
                                        </p>
                                    </div>
                                </>
                            )}

                            {/* ─── Timeline Variants Tab ─── */}
                            {activeDetailTab === 'variants' && (
                                <div>
                                    <div style={{
                                        padding: 'var(--space-2)',
                                        background: 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(139,92,246,0.04))',
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid rgba(99,102,241,0.1)',
                                        marginBottom: 'var(--space-3)',
                                        fontSize: 'var(--text-sm)', color: 'var(--text-secondary)',
                                    }}>
                                        Define how <strong>{selectedEntity.name}</strong> differs across timelines.
                                        Empty fields inherit from the canonical entity.
                                    </div>

                                    {timelines.length === 0 ? (
                                        <div style={{ padding: 'var(--space-3)', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                                            <p>No timelines in this project yet.</p>
                                            <p style={{ fontSize: 'var(--text-sm)' }}>Create a Timeline entity first to define variants.</p>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                                            {timelines.map((timeline, idx) => {
                                                const variant = entityVariants.find(v => v.timeline_id === timeline.id);
                                                const isEditing = editingVariantTimeline === timeline.id;
                                                const tlColor = VARIANT_DOT_COLORS[idx % VARIANT_DOT_COLORS.length];

                                                return (
                                                    <div
                                                        key={timeline.id}
                                                        style={{
                                                            padding: 'var(--space-2)',
                                                            borderRadius: 'var(--radius-md)',
                                                            border: variant ? `1px solid ${tlColor}40` : '1px solid var(--border)',
                                                            background: variant ? `${tlColor}08` : 'var(--bg-secondary)',
                                                            transition: 'all 0.2s',
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isEditing || variant ? 8 : 0 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: tlColor }} />
                                                                <span style={{ fontWeight: 500, fontSize: 'var(--text-base)' }}>📅 {timeline.name}</span>
                                                                {variant && (
                                                                    <span style={{
                                                                        fontSize: 'var(--text-xs)', padding: '1px 8px',
                                                                        borderRadius: 'var(--radius-full)',
                                                                        background: `${tlColor}20`, color: tlColor,
                                                                        fontWeight: 600,
                                                                    }}>has overrides</span>
                                                                )}
                                                            </div>
                                                            <div style={{ display: 'flex', gap: 4 }}>
                                                                {variant && !isEditing && (
                                                                    <button
                                                                        className="btn btn-destructive btn-sm"
                                                                        style={{ fontSize: 'var(--text-xs)', padding: '2px 8px', height: 'auto' }}
                                                                        onClick={() => {
                                                                            if (confirm(`Remove variant for "${timeline.name}"?`)) {
                                                                                deleteVariant.mutate({ entityId: selectedEntity.id, timelineId: timeline.id });
                                                                            }
                                                                        }}
                                                                    >Remove</button>
                                                                )}
                                                                {!isEditing ? (
                                                                    <button
                                                                        className="btn btn-secondary btn-sm"
                                                                        style={{ fontSize: 'var(--text-xs)', padding: '2px 8px', height: 'auto' }}
                                                                        onClick={() => {
                                                                            setEditingVariantTimeline(timeline.id);
                                                                            setVariantNameVal(variant?.variant_name || '');
                                                                            setVariantDescVal(variant?.variant_description || '');
                                                                        }}
                                                                    >{variant ? 'Edit' : '+ Add Override'}</button>
                                                                ) : (
                                                                    <button
                                                                        className="btn btn-ghost btn-sm"
                                                                        style={{ fontSize: 'var(--text-xs)', padding: '2px 8px', height: 'auto' }}
                                                                        onClick={() => setEditingVariantTimeline(null)}
                                                                    >Cancel</button>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Show existing variant data (read-only) */}
                                                        {variant && !isEditing && (
                                                            <div style={{ paddingLeft: 16, fontSize: 'var(--text-sm)' }}>
                                                                {variant.variant_name && (
                                                                    <div style={{ marginBottom: 4 }}>
                                                                        <span style={{ color: 'var(--text-tertiary)', marginRight: 8 }}>Name:</span>
                                                                        <span style={{ fontWeight: 500 }}>{variant.variant_name}</span>
                                                                        {variant.variant_name !== selectedEntity.name && (
                                                                            <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', marginLeft: 6 }}>
                                                                                (canonical: {selectedEntity.name})
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                )}
                                                                {variant.variant_description && (
                                                                    <div>
                                                                        <span style={{ color: 'var(--text-tertiary)', marginRight: 8 }}>Description:</span>
                                                                        <span>{variant.variant_description}</span>
                                                                    </div>
                                                                )}
                                                                {!variant.variant_name && !variant.variant_description && (
                                                                    <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                                                                        Override saved (empty fields use canonical data)
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}

                                                        {/* Edit form */}
                                                        {isEditing && (
                                                            <div style={{ paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                                <div>
                                                                    <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', display: 'block', marginBottom: 2 }}>
                                                                        Name override (leave empty to use canonical: "{selectedEntity.name}")
                                                                    </label>
                                                                    <input
                                                                        className="input"
                                                                        value={variantNameVal}
                                                                        onChange={(e) => setVariantNameVal(e.target.value)}
                                                                        placeholder={selectedEntity.name}
                                                                        style={{ fontSize: 'var(--text-sm)' }}
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', display: 'block', marginBottom: 2 }}>
                                                                        Description override
                                                                    </label>
                                                                    <textarea
                                                                        className="textarea"
                                                                        value={variantDescVal}
                                                                        onChange={(e) => setVariantDescVal(e.target.value)}
                                                                        placeholder={selectedEntity.description || 'How does this entity differ in this timeline?'}
                                                                        rows={3}
                                                                        style={{ fontSize: 'var(--text-sm)' }}
                                                                    />
                                                                </div>
                                                                <div style={{ display: 'flex', gap: 6 }}>
                                                                    <button
                                                                        className="btn btn-primary btn-sm"
                                                                        onClick={() => handleSaveVariant(timeline.id)}
                                                                        disabled={upsertVariant.isPending}
                                                                    >
                                                                        {upsertVariant.isPending ? 'Saving...' : 'Save Variant'}
                                                                    </button>
                                                                    <button
                                                                        className="btn btn-ghost btn-sm"
                                                                        onClick={() => setEditingVariantTimeline(null)}
                                                                    >Cancel</button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>

            {/* ─── Context Panel ─────────────────────────────── */}
            {contextPanelOpen && selectedEntity && (
                <aside className="context-panel" style={{ padding: 'var(--space-2)' }}>
                    <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>Properties</h3>
                    <div className="form-group">
                        <label className="label">Name</label>
                        <input className="input" value={displayEntity?.name || selectedEntity.name} readOnly />
                    </div>
                    <div className="form-group">
                        <label className="label">Type</label>
                        <input className="input" value={selectedEntity.entity_type} readOnly style={{ textTransform: 'capitalize' }} />
                    </div>
                    <div className="form-group">
                        <label className="label">Description</label>
                        <textarea className="textarea" value={displayEntity?.description || selectedEntity.description} readOnly rows={4} />
                    </div>

                    {/* Variant quick info */}
                    {(variantMap.get(selectedEntity.id)?.length || 0) > 0 && (
                        <div style={{
                            borderTop: '1px solid var(--border)', marginTop: 'var(--space-2)', paddingTop: 'var(--space-2)',
                        }}>
                            <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-1)', color: 'var(--text-secondary)' }}>
                                🔀 Variants ({variantMap.get(selectedEntity.id)?.length || 0})
                            </h3>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {(variantMap.get(selectedEntity.id) || []).map(tlId => {
                                    const tl = timelines.find(t => t.id === tlId);
                                    return (
                                        <span key={tlId} style={{
                                            fontSize: 'var(--text-xs)', padding: '2px 8px',
                                            borderRadius: 'var(--radius-full)',
                                            background: `${timelineColorMap.get(tlId) || '#888'}20`,
                                            color: timelineColorMap.get(tlId) || '#888',
                                            border: `1px solid ${timelineColorMap.get(tlId) || '#888'}30`,
                                        }}>{tl?.name || 'Unknown'}</span>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div style={{ borderTop: '1px solid var(--border)', marginTop: 'var(--space-2)', paddingTop: 'var(--space-2)' }}>
                        <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>🧠 AI Quick Actions</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={handleGenerateIdeas}
                                disabled={aiLoading}
                                style={{ justifyContent: 'flex-start' }}
                            >
                                ✨ Generate Ideas
                            </button>
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => navigate('/settings')}
                                style={{ justifyContent: 'flex-start' }}
                            >
                                ⚙️ AI Settings
                            </button>
                        </div>
                    </div>
                </aside>
            )}

            {/* Create Entity Modal */}
            {showCreateEntity && (
                <div className="modal-overlay" onClick={() => setShowCreateEntity(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h2 className="modal-title">Create New Entity</h2>
                        <form onSubmit={handleCreateEntity}>
                            <div className="form-group">
                                <label className="label">Type</label>
                                <select
                                    className="input"
                                    value={newEntityType}
                                    onChange={(e) => setNewEntityType(e.target.value as Entity['entity_type'])}
                                >
                                    {Object.entries(ENTITY_LABELS).map(([type, label]) => (
                                        <option key={type} value={type}>{ENTITY_ICONS[type]} {label.slice(0, -1)}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="label">Name</label>
                                <input
                                    className="input"
                                    value={newEntityName}
                                    onChange={(e) => setNewEntityName(e.target.value)}
                                    placeholder={
                                        newEntityType === 'character' ? 'Alice' :
                                            newEntityType === 'timeline' ? 'Primary Reality' :
                                                newEntityType === 'event' ? 'The Great Betrayal' :
                                                    newEntityType === 'arc' ? 'Hero\'s Journey' :
                                                        newEntityType === 'theme' ? 'Redemption' :
                                                            newEntityType === 'location' ? 'Crystal Palace' :
                                                                'My Note'
                                    }
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="form-group">
                                <label className="label">Description</label>
                                <textarea
                                    className="textarea"
                                    value={newEntityDesc}
                                    onChange={(e) => setNewEntityDesc(e.target.value)}
                                    placeholder="Describe this entity..."
                                />
                            </div>
                            <div className="form-group">
                                <label className="label">Properties (JSON, optional)</label>
                                <textarea
                                    className="textarea"
                                    value={newEntityProps}
                                    onChange={(e) => setNewEntityProps(e.target.value)}
                                    placeholder={newEntityType === 'character'
                                        ? '{"motivations": ["Revenge"], "biography": "Born in..."}'
                                        : newEntityType === 'event'
                                            ? '{"timestamp": "2157-06-15", "participants": []}'
                                            : newEntityType === 'arc'
                                                ? '{"phases": ["Setup", "Confrontation", "Resolution"]}'
                                                : newEntityType === 'location'
                                                    ? '{"coordinates": "", "atmosphere": "mysterious"}'
                                                    : '{}'}
                                    style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}
                                />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateEntity(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={createEntity.isPending}>
                                    {createEntity.isPending ? 'Creating...' : `Create ${ENTITY_LABELS[newEntityType]?.slice(0, -1) || 'Entity'}`}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
