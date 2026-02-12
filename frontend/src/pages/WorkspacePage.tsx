import { useEffect, useState, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { useAppStore, Entity, Project } from '../store/appStore';
import { useAuthStore } from '../store/authStore';
import TimelineCanvas from '../components/TimelineCanvas';

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

    // Fetch entities
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

    // Delete entity
    const deleteEntity = useMutation({
        mutationFn: (id: string) => api.deleteEntity(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['entities', projectId] });
            setSelectedEntity(null);
        },
    });

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

    const entities = entitiesData?.entities || [];
    const filteredEntities = entities;

    return (
        <div className="app-layout">
            {/* ─── Left Sidebar ──────────────────────────────── */}
            <aside className="sidebar">
                {/* Project Header */}
                <div style={{ padding: 'var(--space-2)', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/projects')}>← Back</button>
                        <button className="btn btn-ghost btn-sm" onClick={signOut}>Sign Out</button>
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
                            entities={filteredEntities}
                            onEntitySelect={setSelectedEntity}
                            selectedEntityId={null}
                        />
                    </div>
                ) : (
                    <div style={{ padding: 'var(--space-3)', overflowY: 'auto', flex: 1 }}>
                        <div style={{ maxWidth: 720 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => setSelectedEntity(null)}
                                    title="Back to canvas"
                                >← Canvas</button>
                                <span style={{ fontSize: 32 }}>{ENTITY_ICONS[selectedEntity.entity_type]}</span>
                                <div style={{ flex: 1 }}>
                                    <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 600 }}>{selectedEntity.name}</h1>
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

                            {selectedEntity.description && (
                                <div style={{ marginBottom: 'var(--space-3)' }}>
                                    <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, marginBottom: 'var(--space-1)', color: 'var(--text-secondary)' }}>Description</h3>
                                    <p style={{ lineHeight: 1.6 }}>{selectedEntity.description}</p>
                                </div>
                            )}

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
                        <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>🧠 AI Suggestions</h3>
                        <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
                            AI features coming in Sprint 2. Select an entity and use AI to generate ideas, check consistency, or discover relationships.
                        </p>
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
                                    placeholder={newEntityType === 'character' ? 'Alice' : newEntityType === 'timeline' ? 'Primary Reality' : 'Event name'}
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
