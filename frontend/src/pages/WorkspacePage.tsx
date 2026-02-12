import { useEffect, useState, FormEvent, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { useAppStore, Entity } from '../store/appStore';
import { useAuthStore } from '../store/authStore';
import TimelineCanvas from '../components/TimelineCanvas';
import {
    generateIdeas,
    hasConfiguredProvider,
    loadAISettings,
    type GeneratedIdea,
    type GenerateIdeasResult,
} from '../services/aiService';

const ENTITY_ICONS: Record<string, string> = {
    character: '👤',
    timeline: '⏱',
    event: '⚡',
    arc: '📈',
    theme: '💡',
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
    const entityTypes = [...new Set(allEntities.map(e => e.entity_type))];
    const aiConfigured = hasConfiguredProvider();

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
                            {filteredEntities.map((entity) => (
                                <div
                                    key={entity.id}
                                    className={`entity-item ${selectedEntity?.id === entity.id ? 'active' : ''}`}
                                    onClick={() => setSelectedEntity(entity)}
                                >
                                    <div className="entity-icon">{ENTITY_ICONS[entity.entity_type]}</div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entity.name}</div>
                                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>{entity.entity_type}</div>
                                    </div>
                                </div>
                            ))}
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
                            entities={allEntities}
                            onEntitySelect={setSelectedEntity}
                            selectedEntityId={null}
                            onEntityPositionUpdate={handlePositionUpdate}
                            hiddenTypes={hiddenTypes}
                        />
                    </div>
                ) : (
                    <div style={{ padding: 'var(--space-3)', overflowY: 'auto', flex: 1 }}>
                        <div style={{ maxWidth: 720 }}>
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
                                            {selectedEntity.name}
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
                                        {selectedEntity.description || <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>No description. Click to add one.</span>}
                                    </p>
                                )}
                            </div>

                            {Object.keys(selectedEntity.properties).length > 0 && (
                                <div style={{ marginBottom: 'var(--space-3)' }}>
                                    <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 'var(--space-1)', color: 'var(--text-secondary)' }}>Properties</h3>
                                    {Object.entries(selectedEntity.properties).map(([key, value]) => (
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
                        <input className="input" value={selectedEntity.name} readOnly />
                    </div>
                    <div className="form-group">
                        <label className="label">Type</label>
                        <input className="input" value={selectedEntity.entity_type} readOnly style={{ textTransform: 'capitalize' }} />
                    </div>
                    <div className="form-group">
                        <label className="label">Description</label>
                        <textarea className="textarea" value={selectedEntity.description} readOnly rows={4} />
                    </div>

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
