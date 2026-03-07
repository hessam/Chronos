import { useEffect, useState, useRef, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import EventListView from '../components/EventListView';

import { useAppStore, resolveEntity } from '../store/appStore';
import type { Entity, Relationship } from '../store/appStore';
import { useAuthStore } from '../store/authStore';

import { subscribeToProject, unsubscribeFromProject, onRealtimeEvent } from '../services/realtimeService';
import { trackPresence, stopPresence, broadcastEditingEntity } from '../services/presenceService';

import { RELATIONSHIP_TYPES } from '../constants/relationships';

const ENTITY_ICONS: Record<string, string> = {
    character: '👤',
    timeline: '📅',
    event: '⚡',
    arc: '📐',
    theme: '🎭',
    location: '📍',
    note: '📝',
    chapter: '📖',
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
    chapter: 'Chapters',
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
    const user = useAuthStore((s) => s.user);
    const {
        currentProject, setCurrentProject,
        selectedEntity, setSelectedEntity,
        entityFilter,
        contextPanelOpen,
        focusedTimelineId, setFocusedTimelineId,
    } = useAppStore();

    const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
    const [globalSearchQuery, setGlobalSearchQuery] = useState('');
    const globalSearchRef = useRef<HTMLInputElement>(null);
    const [showCreateEntity, setShowCreateEntity] = useState(false);
    const [newEntityName, setNewEntityName] = useState('');
    const [newEntityDesc, setNewEntityDesc] = useState('');
    const [newEntityType, setNewEntityType] = useState<Entity['entity_type']>('character');
    const [newEntityProps, setNewEntityProps] = useState('');
    const [newEntityStructuredProps, setNewEntityStructuredProps] = useState<{ key: string; value: string }[]>([]);

    // Type-aware default property fields
    const TYPE_DEFAULT_FIELDS: Record<string, { key: string; placeholder: string }[]> = {
        character: [
            { key: 'motivations', placeholder: 'Revenge, justice, love...' },
            { key: 'biography', placeholder: 'Born in a small village...' },
            { key: 'traits', placeholder: 'Brave, cunning, loyal...' },
        ],
        event: [
            { key: 'timestamp', placeholder: '2157-06-15 or "Day 3"' },
            { key: 'participants', placeholder: 'Alice, Bob, The Council' },
            { key: 'outcome', placeholder: 'The alliance was shattered...' },
        ],
        arc: [
            { key: 'phases', placeholder: 'Setup, Confrontation, Resolution' },
            { key: 'theme', placeholder: 'Coming of age, betrayal...' },
        ],
        location: [
            { key: 'atmosphere', placeholder: 'Mysterious, foreboding...' },
            { key: 'significance', placeholder: 'Central hub of the rebellion...' },
        ],
        theme: [
            { key: 'symbolism', placeholder: 'The broken clock, the red door...' },
        ],
        note: [],
        chapter: [
            { key: 'pov_character', placeholder: 'Alice' },
            { key: 'word_target', placeholder: '3000' },
        ],
    };

    // Sync default fields when type changes
    useEffect(() => {
        const defaults = TYPE_DEFAULT_FIELDS[newEntityType] || [];
        setNewEntityStructuredProps(defaults.map(d => ({ key: d.key, value: '' })));
    }, [newEntityType]);

    // AI State

    // Derived AI ideas for current entity

    // Reset AI error/result when switching entities (but keep ideas in cache)

    // Entity editing
    const [editingField, setEditingField] = useState<string | null>(null);
    const [editNameVal, setEditNameVal] = useState('');
    const [editDescVal, setEditDescVal] = useState('');

    // Timeline visibility toggles
    // Drag-and-drop reorder state (events only)
    // Variant editing state
    const [activeDetailTab, setActiveDetailTab] = useState<'details' | 'variants' | 'relationships' | 'beats'>('details');
    const [editingVariantTimeline, setEditingVariantTimeline] = useState<string | null>(null);
    const [variantNameVal, setVariantNameVal] = useState('');
    const [variantDescVal, setVariantDescVal] = useState('');

    // Handlers
    // Consistency checking state (E3-US4)

    // Ripple effect analysis state (E3-US5)

    // Scene Card Generator state

    // Narrative Sequence Builder state

    // Missing Scene Detector state

    // Character Voice Samples state

    // Emotional Beat Tracker state
    const [emotionLevel, setEmotionLevel] = useState<number>(0);

    // Voice sample editing state

    // Chapter Assembler state

    // POV Analysis state

    // Draft text state
    const [draftText, setDraftText] = useState('');
    const [showDraftSection, setShowDraftSection] = useState(false);

    // Relationship strength state
    const [relStrength, setRelStrength] = useState(3);

    // Temporal gaps

    // Sidebar tools dropdown
    const [showToolsMenu, setShowToolsMenu] = useState(false);
    const toolsMenuRef = useRef<HTMLDivElement>(null);

    // Relationship state (Sprint 4)
    const [showCreateRelModal, setShowCreateRelModal] = useState(false);
    const [relFromId, setRelFromId] = useState<string | null>(null);
    const [relToId, setRelToId] = useState<string | null>(null);
    const [relType, setRelType] = useState('involves');
    const [relLabel, setRelLabel] = useState('');



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

    // ─── Realtime Subscription (E5-US1) ──────────────────────
    useEffect(() => {
        if (!projectId) return;
        subscribeToProject(projectId, queryClient);
        return () => unsubscribeFromProject();
    }, [projectId, queryClient]);

    // ─── Realtime Toast Notifications (E5-US1) ──────────────
    useEffect(() => {
        const unsub = onRealtimeEvent((event) => {
            if (event.table === 'entities' && event.eventType === 'UPDATE') {
                const name = (event.new as Record<string, unknown>).name || 'Entity';
                console.log(`🔄 ${name} was updated by another user`);
            }
        });
        return unsub;
    }, []);

    // ─── Presence Tracking (E5-US2) ──────────────────────────
    useEffect(() => {
        if (!projectId || !user) return;
        trackPresence(
            projectId,
            user.id,
            user.user_metadata?.full_name || user.email || 'User',
            user.email || '',
            () => { } // presence updates not displayed in new sidebar
        );
        return () => stopPresence();
    }, [projectId, user]);

    // Broadcast editing entity for presence
    useEffect(() => {
        broadcastEditingEntity(selectedEntity?.id || null);
    }, [selectedEntity]);

    // ─── Global Search (Cmd+K) ──────────────────────────────
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setGlobalSearchOpen(prev => !prev);
                setGlobalSearchQuery('');
            }
            if (e.key === 'Escape') {
                setGlobalSearchOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        if (globalSearchOpen && globalSearchRef.current) {
            globalSearchRef.current.focus();
        }
    }, [globalSearchOpen]);

    // Global search query
    const { data: globalSearchData } = useQuery({
        queryKey: ['search', projectId, globalSearchQuery],
        queryFn: () => api.searchEntities(projectId!, globalSearchQuery),
        enabled: !!projectId && globalSearchQuery.length >= 2,
    });

    // Fetch entities (unfiltered for canvas — we filter in the sidebar)
    const { data: allEntitiesData } = useQuery({
        queryKey: ['entities', projectId, 'all'],
        queryFn: () => api.getEntities(projectId!),
        enabled: !!projectId,
    });

    // Validated: Sync selectedEntity with fresh data from allEntitiesData to prevent stale state interactions
    useEffect(() => {
        if (selectedEntity && allEntitiesData?.entities) {
            const freshEntity = allEntitiesData.entities.find(e => e.id === selectedEntity.id);
            if (freshEntity && freshEntity.updated_at !== selectedEntity.updated_at) {
                // Determine if properties changed deeply or just trust updated_at
                // For safety, just update.
                setSelectedEntity(freshEntity);
            }
        }
    }, [allEntitiesData, selectedEntity, setSelectedEntity]);

    // Filtered for sidebar

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

    // Fetch relationships for the project
    const { data: relationshipsData } = useQuery({
        queryKey: ['relationships', projectId],
        queryFn: () => api.getRelationships(projectId!),
        enabled: !!projectId,
    });
    const projectRelationships = (relationshipsData?.relationships || []) as Relationship[];

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
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ['entities', projectId] });
            // Keep selectedEntity state in sync so subsequent property mutations use fresh data
            if (selectedEntity && result.entity && (result.entity as Entity).id === selectedEntity.id) {
                setSelectedEntity(result.entity as Entity);
            }
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

    // Reorder entities

    // Create relationship (Sprint 4)
    const createRelationship = useMutation({
        mutationFn: (body: { from_entity_id: string; to_entity_id: string; relationship_type: string; label?: string; metadata?: Record<string, unknown> }) =>
            api.createRelationship(projectId!, body),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['relationships', projectId] });
            setShowCreateRelModal(false);
            setRelFromId(null);
            setRelToId(null);
            setRelType('involves');
            setRelLabel('');
        },
    });

    // Delete relationship (Sprint 4)
    const deleteRelationship = useMutation({
        mutationFn: (id: string) => api.deleteRelationship(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['relationships', projectId] });
        },
    });



    // Entity field save (with ripple analysis interception for E3-US5)
    const commitSave = (field: string) => {
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

    const handleSaveField = async (field: string) => {
        if (!selectedEntity) return;

        // No interception needed — save directly
        commitSave(field);
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






    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        const props = selectedEntity?.properties as Record<string, unknown> | undefined;
        // Emotion level (events only)
        if (selectedEntity?.entity_type === 'event' && props) {
            setEmotionLevel(typeof props.emotion_level === 'number' ? props.emotion_level : 0);
        } else {
            setEmotionLevel(0);
        }
    }, [selectedEntity?.id]);

    // Close tools menu on click outside
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) {
                setShowToolsMenu(false);
            }
        };
        if (showToolsMenu) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showToolsMenu]);

    // Narrative Sequence Builder handler

    // Missing Scene Detector handler

    // Create event from gap suggestion

    // Character Voice Samples handler

    // Worldbuilding Wiki Export handler

    // Copy wiki to clipboard

    // Emotional Beat Tracker — update emotion level on event
    const handleEmotionChange = (value: number) => {
        setEmotionLevel(value);
        if (!selectedEntity || selectedEntity.entity_type !== 'event') return;
        updateEntity.mutate({
            id: selectedEntity.id,
            body: { properties: { ...selectedEntity.properties, emotion_level: value } },
        });
    };

    // POV Character assignment (Feature 8)
    const handlePOVChange = (characterId: string) => {
        if (!selectedEntity || selectedEntity.entity_type !== 'event') return;
        const allEntities = allEntitiesData?.entities || [];
        const char = allEntities.find(e => e.id === characterId);
        const povData = characterId ? { id: characterId, name: char?.name || '' } : null;
        updateEntity.mutate({
            id: selectedEntity.id,
            body: { properties: { ...selectedEntity.properties, pov_character: povData } },
        });
    };

    // POV Balance Analysis (Feature 8)

    // Draft text save (Feature 10)
    const handleSaveDraft = (text: string) => {
        if (!selectedEntity || selectedEntity.entity_type !== 'event') return;
        setDraftText(text);
        updateEntity.mutate({
            id: selectedEntity.id,
            body: { properties: { ...selectedEntity.properties, draft_text: text } },
        });
    };

    // Chapter Assembly (Feature 5)

    // Temporal gap calculation (Feature 12)

    // Story-time save for events (Feature 12 — Story Calendar)
    const handleStoryTimeChange = (field: string, value: number | string) => {
        if (!selectedEntity || selectedEntity.entity_type !== 'event') return;
        const current = (selectedEntity.properties as Record<string, unknown>)?.timestamp;
        const storyTime: Record<string, unknown> = typeof current === 'object' && current !== null
            ? { ...(current as Record<string, unknown>) }
            : { year: 0, day: 0, hour: 0, label: '' };
        storyTime[field] = value;
        updateEntity.mutate({
            id: selectedEntity.id,
            body: { properties: { ...selectedEntity.properties, timestamp: storyTime } },
        });
    };

    function handleCreateEntity(e: FormEvent) {
        e.preventDefault();
        // Build properties from structured fields
        const properties: Record<string, unknown> = {};
        for (const { key, value } of newEntityStructuredProps) {
            const k = key.trim().replace(/\s+/g, '_').toLowerCase();
            if (!k || !value.trim()) continue;
            // Try to parse JSON values (arrays, numbers, booleans)
            let parsed: unknown = value;
            try { parsed = JSON.parse(value); } catch { /* keep as string */ }
            properties[k] = parsed;
        }
        // Also merge any raw JSON props (fallback for advanced users)
        if (newEntityProps.trim()) {
            try { Object.assign(properties, JSON.parse(newEntityProps)); }
            catch { /* ignore parse errors */ }
        }
        createEntity.mutate({
            entity_type: newEntityType,
            name: newEntityName.trim(),
            description: newEntityDesc.trim(),
            properties,
        });
    }




    const allEntities = allEntitiesData?.entities || [];
    const allVariants = variantsData?.variants || [];
    const entityVariants = entityVariantsData?.variants || [];

    // When a timeline is focused, filter sidebar to show related entities

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


    // Resolve selected entity for display when in focus mode
    const displayEntity = selectedEntity
        ? resolveEntity(selectedEntity, focusedTimelineId, allVariants)
        : null;

    return (
        <div className="app-layout">
            {/* ─── Left Sidebar ──────────────────────────────── */}
            <aside className="sidebar" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)' }}>
                {/* Project Header */}
                <div style={{ padding: 'var(--space-2)', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/projects')}>← Back</button>
                        <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/project/${projectId}/analytics`)} title="Analytics">📊</button>
                            <button className="btn btn-ghost btn-sm" onClick={signOut} title="Sign Out">🚪</button>
                        </div>
                    </div>
                    <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {currentProject?.name || 'Loading...'}
                    </h2>
                </div>

                {/* 3 Panels */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {/* Panel 1: Events */}
                    <div style={{ borderBottom: '8px solid var(--bg-primary)' }}>
                        <div style={{ padding: 'var(--space-2)', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 10 }}>
                            <span>Events</span>
                            <button className="btn btn-ghost btn-sm" onClick={() => { setNewEntityType('event'); setShowCreateEntity(true); }} style={{ padding: '0 8px', fontSize: 16 }}>+</button>
                        </div>
                        <div style={{ padding: '0 var(--space-1)' }}>
                            <EventListView entities={allEntities} relationships={projectRelationships} onSelectEntity={setSelectedEntity} />
                        </div>
                    </div>

                    {/* Panel 2: Entities */}
                    <div style={{ borderBottom: '8px solid var(--bg-primary)' }}>
                        <div style={{ padding: 'var(--space-2)', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 10 }}>
                            <span>Entities</span>
                            <button className="btn btn-ghost btn-sm" onClick={() => { setNewEntityType('character'); setShowCreateEntity(true); }} style={{ padding: '0 8px', fontSize: 16 }}>+</button>
                        </div>
                        <div style={{ padding: 'var(--space-1)' }}>
                            {allEntities.filter(e => e.entity_type !== 'event').length === 0 ? (
                                <div style={{ padding: 'var(--space-2)', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)', textAlign: 'center' }}>No entities yet</div>
                            ) : (
                                allEntities.filter(e => e.entity_type !== 'event').map(entity => (
                                    <div
                                        key={entity.id}
                                        onClick={() => { setSelectedEntity(entity); setActiveDetailTab('details'); }}
                                        style={{
                                            padding: '6px 10px',
                                            margin: '2px 0',
                                            cursor: 'pointer',
                                            borderRadius: 'var(--radius-sm)',
                                            background: selectedEntity?.id === entity.id ? 'var(--bg-tertiary)' : 'transparent',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 'var(--space-2)',
                                            transition: 'background 0.15s',
                                        }}
                                        onMouseEnter={(e) => { if (selectedEntity?.id !== entity.id) e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; }}
                                        onMouseLeave={(e) => { if (selectedEntity?.id !== entity.id) e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        <span style={{ fontSize: 16 }}>{ENTITY_ICONS[entity.entity_type] || '📄'}</span>
                                        <span style={{ fontSize: 'var(--text-sm)', fontWeight: selectedEntity?.id === entity.id ? 600 : 400, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entity.name}</span>
                                        <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{entity.entity_type}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Panel 3: Relationships */}
                    <div>
                        <div style={{ padding: 'var(--space-2)', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 10 }}>
                            <span>Relationships</span>
                        </div>
                        <div style={{ padding: 'var(--space-3)', textAlign: 'center' }}>
                            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>Select an entity to view its relationships in the right panel.</p>
                        </div>
                    </div>
                </div>
            </aside>

            {/* ─── Main Content ──────────────────────────────── */}
            <main className="main-content" style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
                {/* Consistency Report Panel (E3-US4) */}

                {!selectedEntity ? (
                    <div style={{ flex: 1, position: 'relative' }}>

                            /* Event List View — Sprint 1 E-01 placeholder */
                        <div style={{
                            flex: 1, width: '100%', height: '100%',
                            display: 'flex', flexDirection: 'column',
                            padding: 'var(--space-3)',
                            overflowY: 'auto',
                        }}>
                            <div style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                marginBottom: 'var(--space-3)',
                            }}>
                                <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, margin: 0 }}>
                                    📋 Events
                                </h2>
                                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                                    {allEntities.filter(e => e.entity_type === 'event').length} events
                                </span>
                            </div>
                            {/* Event table */}
                            <div style={{
                                borderRadius: 'var(--radius-lg)',
                                border: '1px solid var(--border)',
                                overflow: 'hidden',
                            }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                                    <thead>
                                        <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Title</th>
                                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Type</th>
                                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {allEntities
                                            .filter(e => entityFilter === 'all' || e.entity_type === entityFilter)
                                            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                                            .map(entity => {
                                                const props = entity.properties as Record<string, unknown> | undefined;
                                                const hasDraft = !!(props?.draft_text);
                                                return (
                                                    <tr
                                                        key={entity.id}
                                                        onClick={() => setSelectedEntity(entity)}
                                                        style={{
                                                            borderBottom: '1px solid var(--border)',
                                                            cursor: 'pointer',
                                                            background: 'transparent',
                                                            transition: 'background 0.1s',
                                                        }}
                                                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                                                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                                    >
                                                        <td style={{ padding: '10px 12px', fontWeight: 500 }}>
                                                            {ENTITY_ICONS[entity.entity_type] || '📄'} {entity.name}
                                                        </td>
                                                        <td style={{ padding: '10px 12px', color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>
                                                            {entity.entity_type}
                                                        </td>
                                                        <td style={{ padding: '10px 12px' }}>
                                                            {hasDraft ? (
                                                                <span style={{ color: '#10b981', fontSize: 'var(--text-xs)', fontWeight: 600 }}>✓ Drafted</span>
                                                            ) : (
                                                                <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>—</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                    </tbody>
                                </table>
                                {allEntities.length === 0 && (
                                    <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                                        No entities yet. Create one from the sidebar.
                                    </div>
                                )}
                            </div>
                        </div>

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
                                    onClick={() => { setSelectedEntity(null); }}
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

                            {/* Tab Selector: Details | Variants | Relationships */}
                            {selectedEntity.entity_type !== 'timeline' && (
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
                                    {selectedEntity.entity_type === 'event' && (
                                        <button
                                            onClick={() => setActiveDetailTab('beats')}
                                            style={{
                                                padding: '8px 16px', fontSize: 'var(--text-sm)', fontWeight: 500,
                                                background: 'none', border: 'none', cursor: 'pointer',
                                                color: activeDetailTab === 'beats' ? 'var(--accent)' : 'var(--text-tertiary)',
                                                borderBottom: activeDetailTab === 'beats' ? '2px solid var(--accent)' : '2px solid transparent',
                                                marginBottom: -2, transition: 'all 0.15s',
                                            }}
                                        >
                                            🎬 Beats
                                        </button>
                                    )}
                                    {timelines.length > 0 && (
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
                                    )}
                                    <button
                                        onClick={() => setActiveDetailTab('relationships')}
                                        style={{
                                            padding: '8px 16px', fontSize: 'var(--text-sm)', fontWeight: 500,
                                            background: 'none', border: 'none', cursor: 'pointer',
                                            color: activeDetailTab === 'relationships' ? 'var(--accent)' : 'var(--text-tertiary)',
                                            borderBottom: activeDetailTab === 'relationships' ? '2px solid var(--accent)' : '2px solid transparent',
                                            marginBottom: -2, transition: 'all 0.15s',
                                            display: 'flex', alignItems: 'center', gap: 6,
                                        }}
                                    >
                                        🔗 Relationships
                                        {(() => {
                                            const count = projectRelationships.filter(r =>
                                                r.from_entity_id === selectedEntity.id || r.to_entity_id === selectedEntity.id
                                            ).length;
                                            return count > 0 ? (
                                                <span style={{
                                                    fontSize: 'var(--text-xs)', padding: '0 6px',
                                                    borderRadius: 'var(--radius-full)',
                                                    background: 'rgba(99,102,241,0.15)', color: 'var(--accent)',
                                                    fontWeight: 600,
                                                }}>{count}</span>
                                            ) : null;
                                        })()}
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

                                    {/* ─── Editable Properties Grid ─── */}
                                    <div style={{ marginBottom: 'var(--space-3)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-1)' }}>
                                            <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-secondary)' }}>Properties</h3>
                                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                                                {Object.keys(selectedEntity.properties).filter(k => !['scene_card', 'voice_samples', 'draft_text', 'pov_character', 'timestamp', 'chapter_blueprint', 'emotion_level', 'position_x', 'position_y'].includes(k)).length} fields
                                            </span>
                                        </div>
                                        {Object.entries(selectedEntity.properties)
                                            .filter(([key]) => !['scene_card', 'voice_samples', 'draft_text', 'pov_character', 'timestamp', 'chapter_blueprint', 'emotion_level', 'position_x', 'position_y'].includes(key))
                                            .map(([key, value]) => (
                                                <div key={key} style={{
                                                    display: 'flex', alignItems: 'center', gap: 8,
                                                    padding: '6px 8px', borderBottom: '1px solid var(--border)',
                                                    borderRadius: 'var(--radius-sm)',
                                                }}>
                                                    <span style={{
                                                        fontWeight: 500, minWidth: 110, color: 'var(--text-secondary)',
                                                        textTransform: 'capitalize', fontSize: 'var(--text-sm)',
                                                        flexShrink: 0,
                                                    }}>
                                                        {key.replace(/_/g, ' ')}
                                                    </span>
                                                    {editingField === `prop:${key}` ? (
                                                        <input
                                                            className="input"
                                                            autoFocus
                                                            defaultValue={typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '')}
                                                            style={{ flex: 1, fontSize: 'var(--text-sm)', padding: '4px 8px', height: 'auto' }}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    const raw = (e.target as HTMLInputElement).value;
                                                                    let parsed: unknown = raw;
                                                                    try { parsed = JSON.parse(raw); } catch { /* keep as string */ }
                                                                    const newProps = { ...selectedEntity.properties, [key]: parsed };
                                                                    updateEntity.mutate({ id: selectedEntity.id, body: { properties: newProps } });
                                                                    setEditingField(null);
                                                                }
                                                                if (e.key === 'Escape') setEditingField(null);
                                                            }}
                                                            onBlur={(e) => {
                                                                const raw = e.target.value;
                                                                let parsed: unknown = raw;
                                                                try { parsed = JSON.parse(raw); } catch { /* keep as string */ }
                                                                if (String(parsed) !== String(value)) {
                                                                    const newProps = { ...selectedEntity.properties, [key]: parsed };
                                                                    updateEntity.mutate({ id: selectedEntity.id, body: { properties: newProps } });
                                                                }
                                                                setEditingField(null);
                                                            }}
                                                        />
                                                    ) : (
                                                        <span
                                                            style={{
                                                                flex: 1, fontSize: 'var(--text-sm)', cursor: 'pointer',
                                                                padding: '4px 8px', borderRadius: 'var(--radius-sm)',
                                                                border: '1px solid transparent', transition: 'border-color 0.15s',
                                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                            }}
                                                            title={`Click to edit · ${typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')}`}
                                                            onClick={() => setEditingField(`prop:${key}`)}
                                                            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                                                            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'transparent')}
                                                        >
                                                            {value === null || value === undefined || value === ''
                                                                ? <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>empty</span>
                                                                : typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                                        </span>
                                                    )}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const newProps = { ...selectedEntity.properties };
                                                            delete newProps[key];
                                                            updateEntity.mutate({ id: selectedEntity.id, body: { properties: newProps } });
                                                        }}
                                                        title="Remove property"
                                                        style={{
                                                            background: 'none', border: 'none', cursor: 'pointer',
                                                            color: 'var(--text-tertiary)', fontSize: 12, padding: '2px 4px',
                                                            borderRadius: 'var(--radius-sm)', flexShrink: 0,
                                                            opacity: 0.4, transition: 'opacity 0.15s, color 0.15s',
                                                        }}
                                                        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--error)'; }}
                                                        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.4'; e.currentTarget.style.color = 'var(--text-tertiary)'; }}
                                                    >✕</button>
                                                </div>
                                            ))}
                                        {/* ─── Add New Property Row ─── */}
                                        {editingField === 'prop:__new__' ? (
                                            <div style={{ display: 'flex', gap: 6, padding: '6px 0', alignItems: 'center' }}>
                                                <input
                                                    className="input"
                                                    autoFocus
                                                    placeholder="key"
                                                    id="new-prop-key"
                                                    style={{ width: 110, fontSize: 'var(--text-sm)', padding: '4px 8px', height: 'auto', flexShrink: 0 }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            (document.getElementById('new-prop-val') as HTMLInputElement)?.focus();
                                                        }
                                                        if (e.key === 'Escape') setEditingField(null);
                                                    }}
                                                />
                                                <input
                                                    className="input"
                                                    placeholder="value"
                                                    id="new-prop-val"
                                                    style={{ flex: 1, fontSize: 'var(--text-sm)', padding: '4px 8px', height: 'auto' }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            const keyInput = document.getElementById('new-prop-key') as HTMLInputElement;
                                                            const valInput = e.target as HTMLInputElement;
                                                            const k = keyInput?.value.trim().replace(/\s+/g, '_').toLowerCase();
                                                            const v = valInput?.value;
                                                            if (k) {
                                                                let parsed: unknown = v;
                                                                try { parsed = JSON.parse(v); } catch { /* keep as string */ }
                                                                const newProps = { ...selectedEntity.properties, [k]: parsed };
                                                                updateEntity.mutate({ id: selectedEntity.id, body: { properties: newProps } });
                                                            }
                                                            setEditingField(null);
                                                        }
                                                        if (e.key === 'Escape') setEditingField(null);
                                                    }}
                                                />
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => setEditingField(null)}
                                                    style={{ padding: '2px 6px', fontSize: 10 }}
                                                >✕</button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setEditingField('prop:__new__')}
                                                style={{
                                                    width: '100%', padding: '8px', marginTop: 4,
                                                    background: 'none', border: '1px dashed var(--border)',
                                                    borderRadius: 'var(--radius-md)', cursor: 'pointer',
                                                    color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)',
                                                    transition: 'all 0.15s',
                                                }}
                                                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
                                                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-tertiary)'; }}
                                            >
                                                + Add Property
                                            </button>
                                        )}
                                    </div>

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

                            {activeDetailTab === 'relationships' && (
                                <div>
                                    <div style={{
                                        padding: 'var(--space-2)',
                                        background: 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(6,182,212,0.04))',
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid rgba(99,102,241,0.1)',
                                        marginBottom: 'var(--space-3)',
                                        fontSize: 'var(--text-sm)', color: 'var(--text-secondary)',
                                    }}>
                                        Connections for <strong>{selectedEntity.name}</strong>. Add relationships to other entities.
                                    </div>

                                    {/* ─── Inline Quick-Add ─── */}
                                    <div style={{
                                        display: 'flex', gap: 6, alignItems: 'center',
                                        marginBottom: 'var(--space-3)', flexWrap: 'wrap',
                                    }}>
                                        <select
                                            className="input"
                                            id="quick-rel-target"
                                            style={{ flex: 1, minWidth: 100, height: 32, fontSize: 'var(--text-sm)', padding: '0 8px' }}
                                            defaultValue=""
                                        >
                                            <option value="" disabled>Target entity…</option>
                                            {allEntities.filter((e: Entity) => e.id !== selectedEntity.id).map((e: Entity) => (
                                                <option key={e.id} value={e.id}>{ENTITY_ICONS[e.entity_type]} {e.name}</option>
                                            ))}
                                        </select>
                                        <select
                                            className="input"
                                            id="quick-rel-type"
                                            style={{ width: 120, height: 32, fontSize: 'var(--text-sm)', padding: '0 8px', flexShrink: 0 }}
                                            defaultValue="causes"
                                        >
                                            {RELATIONSHIP_TYPES.map(t => (
                                                <option key={t} value={t}>{t}</option>
                                            ))}
                                        </select>
                                        <button
                                            className="btn btn-primary btn-sm"
                                            style={{ height: 32, padding: '0 12px', flexShrink: 0 }}
                                            onClick={() => {
                                                const target = (document.getElementById('quick-rel-target') as HTMLSelectElement)?.value;
                                                const type = (document.getElementById('quick-rel-type') as HTMLSelectElement)?.value || 'causes';
                                                if (!target) return;
                                                createRelationship.mutate({
                                                    from_entity_id: selectedEntity.id,
                                                    to_entity_id: target,
                                                    relationship_type: type,
                                                    metadata: { strength: 3 },
                                                });
                                                // Reset after creation
                                                const sel = document.getElementById('quick-rel-target') as HTMLSelectElement;
                                                if (sel) sel.value = '';
                                            }}
                                        >
                                            🔗 Link
                                        </button>
                                    </div>
                                    <div style={{ textAlign: 'right', marginBottom: 'var(--space-2)' }}>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            style={{ fontSize: 'var(--text-xs)', padding: '2px 8px' }}
                                            onClick={() => {
                                                setRelFromId(selectedEntity.id);
                                                setRelToId(null);
                                                setShowCreateRelModal(true);
                                            }}
                                        >
                                            More options… (label, strength)
                                        </button>
                                    </div>

                                    {/* Relationship list */}
                                    {(() => {
                                        const entityRels = projectRelationships.filter(r =>
                                            r.from_entity_id === selectedEntity.id || r.to_entity_id === selectedEntity.id
                                        );
                                        if (entityRels.length === 0) {
                                            return (
                                                <p style={{
                                                    color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)',
                                                    textAlign: 'center', padding: 'var(--space-3)',
                                                }}>
                                                    No relationships yet. Click "Add Relationship" to connect this entity.
                                                </p>
                                            );
                                        }
                                        return entityRels.map(rel => {
                                            const isOutgoing = rel.from_entity_id === selectedEntity.id;
                                            const otherId = isOutgoing ? rel.to_entity_id : rel.from_entity_id;
                                            const other = allEntities.find((e: Entity) => e.id === otherId);
                                            return (
                                                <div key={rel.id} style={{
                                                    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                                                    padding: '8px 12px',
                                                    borderRadius: 'var(--radius-md)',
                                                    background: 'rgba(255,255,255,0.02)',
                                                    border: '1px solid var(--border)',
                                                    marginBottom: 6,
                                                }}>
                                                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)', minWidth: 16 }}>
                                                        {isOutgoing ? '→' : '←'}
                                                    </span>
                                                    <span style={{ fontSize: 16 }}>
                                                        {ENTITY_ICONS[other?.entity_type || 'note']}
                                                    </span>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{
                                                            fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-primary)',
                                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                        }}>
                                                            {other?.name || 'Unknown'}
                                                        </div>
                                                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                                            <span style={{
                                                                fontSize: 9, padding: '1px 6px',
                                                                borderRadius: 'var(--radius-full)',
                                                                background: 'rgba(99,102,241,0.1)',
                                                                color: 'var(--accent)',
                                                            }}>
                                                                {rel.relationship_type}
                                                            </span>
                                                            {rel.label && (
                                                                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                                                                    {rel.label}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <button
                                                        className="btn btn-ghost btn-sm"
                                                        title="Delete relationship"
                                                        style={{ padding: 2, fontSize: 12, color: 'var(--text-tertiary)' }}
                                                        onClick={() => deleteRelationship.mutate(rel.id)}
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            );
                                        });
                                    })()}
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
                        {/* Emotional Beat Tracker (events only) */}
                        {selectedEntity?.entity_type === 'event' && (
                            <div style={{
                                marginTop: 'var(--space-2)', padding: 'var(--space-3)',
                                background: `linear-gradient(135deg, ${emotionLevel > 0 ? 'rgba(34,197,94,0.08)' : emotionLevel < 0 ? 'rgba(239,68,68,0.08)' : 'rgba(128,128,128,0.08)'}, transparent)`,
                                borderRadius: 'var(--radius-lg)', border: `1px solid ${emotionLevel > 0 ? 'rgba(34,197,94,0.3)' : emotionLevel < 0 ? 'rgba(239,68,68,0.3)' : 'rgba(128,128,128,0.2)'}`,
                            }}>
                                <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 'var(--space-2)' }}>
                                    {emotionLevel >= 3 ? '😄' : emotionLevel >= 1 ? '🙂' : emotionLevel <= -3 ? '😢' : emotionLevel <= -1 ? '😟' : '😐'} Emotional Beat
                                    <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                        {emotionLevel > 0 ? `+${emotionLevel}` : emotionLevel} / 5
                                    </span>
                                </h4>
                                <input
                                    type="range"
                                    min={-5}
                                    max={5}
                                    value={emotionLevel}
                                    onChange={e => handleEmotionChange(Number(e.target.value))}
                                    style={{ width: '100%', accentColor: emotionLevel > 0 ? '#22c55e' : emotionLevel < 0 ? '#ef4444' : '#888' }}
                                />
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 2 }}>
                                    <span>😢 Despair</span>
                                    <span>😐 Neutral</span>
                                    <span>😄 Triumph</span>
                                </div>
                            </div>
                        )}

                        {/* POV Character Dropdown (events only) */}
                        {selectedEntity?.entity_type === 'event' && (() => {
                            const allEntities = allEntitiesData?.entities || [];
                            const characters = allEntities.filter(e => e.entity_type === 'character');
                            const currentPOV = (selectedEntity.properties as Record<string, unknown>)?.pov_character as { id: string; name: string } | null;
                            return (
                                <div style={{
                                    marginTop: 'var(--space-2)', padding: 'var(--space-3)',
                                    background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.06))',
                                    borderRadius: 'var(--radius-lg)', border: '1px solid rgba(99,102,241,0.15)',
                                }}>
                                    <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 'var(--space-2)' }}>
                                        👁️ POV Character
                                    </h4>
                                    <select
                                        className="input"
                                        value={currentPOV?.id || ''}
                                        onChange={e => handlePOVChange(e.target.value)}
                                        style={{ width: '100%', fontSize: 'var(--text-sm)' }}
                                    >
                                        <option value="">— No POV assigned —</option>
                                        {characters.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                    {currentPOV && (
                                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 4 }}>
                                            This scene is told from {currentPOV.name}'s perspective
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Story Calendar — Temporal Position (events only — Feature 12) */}
                        {selectedEntity?.entity_type === 'event' && (() => {
                            const tsRaw = (selectedEntity.properties as Record<string, unknown>)?.timestamp;
                            const ts: Record<string, unknown> = typeof tsRaw === 'object' && tsRaw !== null
                                ? (tsRaw as Record<string, unknown>)
                                : { year: 0, day: 0, hour: 0, label: '' };
                            // Migrate legacy ISO string timestamps
                            if (typeof tsRaw === 'string' && tsRaw) {
                                const d = new Date(tsRaw);
                                if (!isNaN(d.getTime())) {
                                    ts.year = d.getFullYear();
                                    ts.day = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
                                    ts.hour = d.getHours();
                                    ts.label = '';
                                }
                            }
                            const inputStyle = {
                                width: '100%', fontSize: 'var(--text-sm)',
                                padding: '6px 8px', background: 'var(--bg-secondary)',
                                border: '1px solid rgba(100,116,139,0.2)', borderRadius: 'var(--radius-md)',
                                color: 'var(--text-primary)',
                            };
                            const fieldLabel = { fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: 2, textTransform: 'uppercase' as const, letterSpacing: '0.5px' };

                            // format preview
                            const preview = `Y${ts.year ?? 0}, D${ts.day ?? 0}, H${ts.hour ?? 0}${ts.label ? ` — ${ts.label}` : ''}`;

                            return (
                                <div style={{
                                    marginTop: 'var(--space-2)', padding: 'var(--space-3)',
                                    background: 'rgba(100,116,139,0.06)',
                                    borderRadius: 'var(--radius-lg)', border: '1px solid rgba(100,116,139,0.15)',
                                }}>
                                    <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 'var(--space-2)' }}>
                                        🕐 Story Timeline Position
                                    </h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                                        <div>
                                            <div style={fieldLabel}>Year</div>
                                            <input
                                                type="number"
                                                className="input"
                                                value={(ts.year as number) ?? 0}
                                                onChange={e => handleStoryTimeChange('year', parseInt(e.target.value) || 0)}
                                                style={inputStyle}
                                                placeholder="0"
                                            />
                                        </div>
                                        <div>
                                            <div style={fieldLabel}>Day</div>
                                            <input
                                                type="number"
                                                className="input"
                                                value={(ts.day as number) ?? 0}
                                                onChange={e => handleStoryTimeChange('day', parseInt(e.target.value) || 0)}
                                                style={inputStyle}
                                                min={0}
                                                max={365}
                                                placeholder="0"
                                            />
                                        </div>
                                        <div>
                                            <div style={fieldLabel}>Hour</div>
                                            <input
                                                type="number"
                                                className="input"
                                                value={(ts.hour as number) ?? 0}
                                                onChange={e => handleStoryTimeChange('hour', parseInt(e.target.value) || 0)}
                                                style={inputStyle}
                                                min={0}
                                                max={23}
                                                placeholder="0"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <div style={fieldLabel}>Label (optional)</div>
                                        <input
                                            type="text"
                                            className="input"
                                            value={(ts.label as string) || ''}
                                            onChange={e => handleStoryTimeChange('label', e.target.value)}
                                            style={inputStyle}
                                            placeholder='e.g. "The Transformation", "After the Fall"'
                                        />
                                    </div>
                                    <div style={{
                                        fontSize: 'var(--text-xs)', color: 'var(--accent-primary)',
                                        marginTop: 8, padding: '4px 8px',
                                        background: 'rgba(99,102,241,0.08)', borderRadius: 'var(--radius-sm)',
                                        fontFamily: 'SF Mono, monospace',
                                    }}>
                                        ⏳ {preview}
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Draft Integration (events only — Feature 10) */}
                        {selectedEntity?.entity_type === 'event' && (
                            <div style={{
                                marginTop: 'var(--space-2)', padding: 'var(--space-3)',
                                background: 'rgba(100,116,139,0.06)',
                                borderRadius: 'var(--radius-lg)', border: '1px solid rgba(100,116,139,0.15)',
                            }}>
                                <h4
                                    style={{ fontSize: 'var(--text-sm)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginBottom: showDraftSection ? 'var(--space-2)' : 0, cursor: 'pointer' }}
                                    onClick={() => {
                                        setShowDraftSection(!showDraftSection);
                                        if (!showDraftSection) {
                                            setDraftText(((selectedEntity.properties as Record<string, unknown>)?.draft_text as string) || '');
                                        }
                                    }}
                                >
                                    📝 Draft Text
                                    {(() => {
                                        const dt = ((selectedEntity.properties as Record<string, unknown>)?.draft_text as string) || '';
                                        const wc = dt ? dt.split(/\s+/).filter(Boolean).length : 0;
                                        return wc > 0 ? <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--accent)', fontWeight: 500 }}>{wc.toLocaleString()}w</span> : null;
                                    })()}
                                    <span style={{ marginLeft: showDraftSection ? 0 : 'auto', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>{showDraftSection ? '▼' : '▶'}</span>
                                </h4>
                                {showDraftSection && (
                                    <>
                                        <textarea
                                            className="textarea"
                                            value={draftText}
                                            onChange={e => setDraftText(e.target.value)}
                                            onBlur={e => handleSaveDraft(e.target.value)}
                                            rows={8}
                                            placeholder="Paste or write your scene draft here..."
                                            style={{ width: '100%', fontSize: 'var(--text-sm)', fontFamily: 'Georgia, serif', lineHeight: 1.7 }}
                                        />
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 4 }}>
                                            <span>{draftText.split(/\s+/).filter(Boolean).length.toLocaleString()} words</span>
                                            <span>Auto-saves on blur</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                    </div>
                </aside>
            )
            }

            {/* Create Entity Modal */}
            {
                showCreateEntity && (
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
                                {/* ─── Type-Aware Properties ─── */}
                                <div className="form-group">
                                    <label className="label">Properties</label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {newEntityStructuredProps.map((prop, i) => (
                                            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                <input
                                                    className="input"
                                                    value={prop.key}
                                                    onChange={(e) => {
                                                        const next = [...newEntityStructuredProps];
                                                        next[i] = { ...next[i], key: e.target.value };
                                                        setNewEntityStructuredProps(next);
                                                    }}
                                                    placeholder="key"
                                                    style={{ width: 110, flexShrink: 0, fontSize: 'var(--text-sm)', padding: '4px 8px', height: 32 }}
                                                />
                                                <input
                                                    className="input"
                                                    value={prop.value}
                                                    onChange={(e) => {
                                                        const next = [...newEntityStructuredProps];
                                                        next[i] = { ...next[i], value: e.target.value };
                                                        setNewEntityStructuredProps(next);
                                                    }}
                                                    placeholder={(TYPE_DEFAULT_FIELDS[newEntityType] || []).find(d => d.key === prop.key)?.placeholder || 'value'}
                                                    style={{ flex: 1, fontSize: 'var(--text-sm)', padding: '4px 8px', height: 32 }}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setNewEntityStructuredProps(prev => prev.filter((_, j) => j !== i))}
                                                    style={{
                                                        background: 'none', border: 'none', cursor: 'pointer',
                                                        color: 'var(--text-tertiary)', fontSize: 14, padding: '2px 4px',
                                                        flexShrink: 0,
                                                    }}
                                                    title="Remove"
                                                >✕</button>
                                            </div>
                                        ))}
                                        <button
                                            type="button"
                                            onClick={() => setNewEntityStructuredProps(prev => [...prev, { key: '', value: '' }])}
                                            style={{
                                                padding: '6px', background: 'none',
                                                border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)',
                                                cursor: 'pointer', color: 'var(--text-tertiary)',
                                                fontSize: 'var(--text-sm)', transition: 'all 0.15s',
                                            }}
                                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-tertiary)'; }}
                                        >
                                            + Add Field
                                        </button>
                                    </div>
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
                )
            }

            {/* ─── Create Relationship Modal (Sprint 4) ─── */}
            {
                showCreateRelModal && (
                    <div className="modal-backdrop" onClick={() => setShowCreateRelModal(false)}>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
                            <h3 style={{ marginBottom: 'var(--space-3)' }}>🔗 Create Relationship</h3>

                            <label style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
                                From Entity
                            </label>
                            <select
                                className="input"
                                value={relFromId || ''}
                                onChange={(e) => setRelFromId(e.target.value || null)}
                                style={{ width: '100%', marginBottom: 'var(--space-2)' }}
                            >
                                <option value="">— select —</option>
                                {allEntities.map((e: Entity) => (
                                    <option key={e.id} value={e.id}>{ENTITY_ICONS[e.entity_type]} {e.name}</option>
                                ))}
                            </select>

                            <label style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
                                To Entity
                            </label>
                            <select
                                className="input"
                                value={relToId || ''}
                                onChange={(e) => setRelToId(e.target.value || null)}
                                style={{ width: '100%', marginBottom: 'var(--space-2)' }}
                            >
                                <option value="">— select —</option>
                                {allEntities.filter((e: Entity) => e.id !== relFromId).map((e: Entity) => (
                                    <option key={e.id} value={e.id}>{ENTITY_ICONS[e.entity_type]} {e.name}</option>
                                ))}
                            </select>

                            <label style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
                                Type
                            </label>
                            <select
                                className="input"
                                value={relType}
                                onChange={(e) => setRelType(e.target.value)}
                                style={{ width: '100%', marginBottom: 'var(--space-2)' }}
                            >
                                {RELATIONSHIP_TYPES.map(t => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>

                            <label style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
                                Label (optional)
                            </label>
                            <input
                                className="input"
                                placeholder="e.g. defeats, mentors, discovers"
                                value={relLabel}
                                onChange={(e) => setRelLabel(e.target.value)}
                                style={{ width: '100%', marginBottom: 'var(--space-2)' }}
                            />

                            <label style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                💪 Strength
                                <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--accent)', fontWeight: 600 }}>{relStrength}/5</span>
                            </label>
                            <input
                                type="range"
                                min={1}
                                max={5}
                                value={relStrength}
                                onChange={e => setRelStrength(Number(e.target.value))}
                                style={{ width: '100%', marginBottom: 'var(--space-3)', accentColor: 'var(--accent)' }}
                            />

                            <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
                                <button className="btn btn-ghost" onClick={() => setShowCreateRelModal(false)}>Cancel</button>
                                <button
                                    className="btn btn-primary"
                                    disabled={!relFromId || !relToId || relFromId === relToId}
                                    onClick={() => {
                                        if (!relFromId || !relToId) return;
                                        createRelationship.mutate({
                                            from_entity_id: relFromId,
                                            to_entity_id: relToId,
                                            relationship_type: relType,
                                            label: relLabel || undefined,
                                            metadata: { strength: relStrength },
                                        });
                                    }}
                                >
                                    {createRelationship.isPending ? 'Creating…' : 'Create'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* ─── Global Search Overlay (⌘K) ──────────────── */}
            {
                globalSearchOpen && (
                    <div
                        style={{
                            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
                            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                            paddingTop: '15vh', zIndex: 9999,
                        }}
                        onClick={() => setGlobalSearchOpen(false)}
                    >
                        <div
                            style={{
                                background: 'var(--bg-primary)', borderRadius: 'var(--radius-lg)',
                                border: '1px solid var(--border)', width: '90%', maxWidth: 560,
                                boxShadow: '0 25px 50px rgba(0,0,0,0.5)', overflow: 'hidden',
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Search Input */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '12px 16px', borderBottom: '1px solid var(--border)',
                            }}>
                                <span style={{ fontSize: 18 }}>🔍</span>
                                <input
                                    ref={globalSearchRef}
                                    className="input"
                                    placeholder="Search all entities..."
                                    value={globalSearchQuery}
                                    onChange={(e) => setGlobalSearchQuery(e.target.value)}
                                    style={{
                                        border: 'none', background: 'transparent',
                                        fontSize: 'var(--text-md)', flex: 1, outline: 'none',
                                    }}
                                />
                                <kbd style={{
                                    padding: '2px 6px', borderRadius: 4, fontSize: 11,
                                    color: 'var(--text-tertiary)', border: '1px solid var(--border)',
                                    background: 'var(--bg-secondary)',
                                }}>ESC</kbd>
                            </div>

                            {/* Results */}
                            <div style={{ maxHeight: 400, overflowY: 'auto', padding: '8px 0' }}>
                                {globalSearchQuery.length < 2 && (
                                    <p style={{
                                        padding: '16px', textAlign: 'center',
                                        color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)',
                                    }}>
                                        Type at least 2 characters to search...
                                    </p>
                                )}

                                {globalSearchData && Object.entries(globalSearchData.grouped).map(([type, items]) => (
                                    <div key={type}>
                                        <div style={{
                                            padding: '6px 16px', fontSize: 11, fontWeight: 600,
                                            color: 'var(--text-tertiary)', textTransform: 'uppercase',
                                            letterSpacing: 1,
                                        }}>
                                            {ENTITY_ICONS[type] || '📄'} {type}s ({items.length})
                                        </div>
                                        {items.map((entity: Entity) => (
                                            <button
                                                key={entity.id}
                                                onClick={() => {
                                                    setSelectedEntity(entity);
                                                    setGlobalSearchOpen(false);
                                                }}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 8,
                                                    width: '100%', padding: '8px 16px', border: 'none',
                                                    background: 'transparent', cursor: 'pointer',
                                                    color: 'var(--text-primary)', fontSize: 'var(--text-sm)',
                                                    textAlign: 'left', transition: 'background 0.1s',
                                                }}
                                                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                                                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                            >
                                                <span style={{ fontSize: 16 }}>{ENTITY_ICONS[entity.entity_type] || '📄'}</span>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {entity.name}
                                                    </div>
                                                    {entity.description && (
                                                        <div style={{
                                                            fontSize: 11, color: 'var(--text-tertiary)',
                                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                        }}>
                                                            {entity.description.slice(0, 80)}
                                                        </div>
                                                    )}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                ))}

                                {globalSearchQuery.length >= 2 && globalSearchData && globalSearchData.results.length === 0 && (
                                    <p style={{
                                        padding: '16px', textAlign: 'center',
                                        color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)',
                                    }}>
                                        No results found for "{globalSearchQuery}"
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

        </div>
    );
}
