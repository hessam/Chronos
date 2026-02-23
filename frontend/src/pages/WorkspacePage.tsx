import { useEffect, useState, useRef, useMemo, FormEvent, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { useAppStore, resolveEntity } from '../store/appStore';
import type { Entity, Relationship } from '../store/appStore';
import { useAuthStore } from '../store/authStore';
import CausalityGraph from '../components/CausalityGraph';
import { CorrelationPanel } from '../components/CorrelationPanel';
import TimelineExplorer from '../components/TimelineExplorer';
import NarrativeAuditCanvas from '../components/NarrativeAuditCanvas';
import CoWriteView from '../components/CoWriteView';
import { generateIdeas, hasConfiguredProvider, checkConsistency, analyzeRippleEffects, generateSceneCard, buildNarrativeSequence, detectMissingScenes, generateCharacterVoice, generateWikiMarkdown, analyzePOVBalance, assembleChapter, analyzeTemporalGaps, SEVERITY_ICONS, CATEGORY_LABELS, IMPACT_ICONS } from '../services/aiService';
import type { GeneratedIdea, GenerateIdeasResult, GenerateIdeasRequest, ConsistencyReport, ConsistencyIssue, RippleReport, SceneCard, NarrativeStep, MissingScene, VoiceSample, POVIssue, ChapterBlueprint, TemporalGap } from '../services/aiService';
import { subscribeToProject, unsubscribeFromProject, onRealtimeEvent } from '../services/realtimeService';
import { trackPresence, stopPresence, broadcastEditingEntity } from '../services/presenceService';

import { BeatSequencer } from '../components/BeatSequencer';
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
        entityFilter, setEntityFilter,
        contextPanelOpen,
        focusedTimelineId, setFocusedTimelineId,
        activeUsers, setActiveUsers,
    } = useAppStore();

    const [searchQuery, setSearchQuery] = useState('');
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [newEntityType]);

    // AI State
    const [aiIdeasCache, setAiIdeasCache] = useState<Record<string, GeneratedIdea[]>>({});
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);
    const [aiResult, setAiResult] = useState<GenerateIdeasResult | null>(null);

    // Derived AI ideas for current entity
    const aiIdeas = (selectedEntity && aiIdeasCache[selectedEntity.id]) || [];

    // Reset AI error/result when switching entities (but keep ideas in cache)
    useEffect(() => {
        setAiResult(null);
        setAiError(null);
    }, [selectedEntity?.id]);

    // Entity editing
    const [editingField, setEditingField] = useState<string | null>(null);
    const [editNameVal, setEditNameVal] = useState('');
    const [editDescVal, setEditDescVal] = useState('');
    const [sidebarConfirmDeleteId, setSidebarConfirmDeleteId] = useState<string | null>(null);
    const [sidebarRenameId, setSidebarRenameId] = useState<string | null>(null);
    const [sidebarRenameVal, setSidebarRenameVal] = useState('');

    // Timeline visibility toggles
    const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
    const [viewMode, setViewMode] = useState<'graph' | 'timeline' | 'audit' | 'cowrite'>('graph');
    // Drag-and-drop reorder state (events only)
    const [draggedEntityId, setDraggedEntityId] = useState<string | null>(null);
    const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
    // Variant editing state
    const [activeDetailTab, setActiveDetailTab] = useState<'details' | 'variants' | 'relationships' | 'beats'>('details');
    const [editingVariantTimeline, setEditingVariantTimeline] = useState<string | null>(null);
    const [variantNameVal, setVariantNameVal] = useState('');
    const [variantDescVal, setVariantDescVal] = useState('');

    // Handlers
    const handleGenerateIdeas = async () => {
        if (!selectedEntity) return;
        setAiLoading(true);
        setAiError(null);
        try {
            const allEntities = allEntitiesData?.entities || [];
            // Get 1-hop linked entities for context
            const linkedEntities = allEntities
                .filter(e => e.id !== selectedEntity.id)
                .slice(0, 5)
                .map(e => ({ name: e.name, type: e.entity_type, description: e.description || '' }));

            const request: GenerateIdeasRequest = {
                entityName: selectedEntity.name,
                entityType: selectedEntity.entity_type,
                entityDescription: selectedEntity.description || '',
                linkedEntities,
                projectContext: currentProject?.description || '',
                properties: selectedEntity.properties,
            };

            const result = await generateIdeas(request);
            if ('error' in result && result.error) throw new Error(String(result.error));

            setAiResult(result);
            // Save to cache for this entity
            setAiIdeasCache(prev => ({
                ...prev,
                [selectedEntity.id]: result.ideas
            }));
        } catch (err) {
            setAiError(err instanceof Error ? err.message : 'Failed to generate ideas');
        } finally {
            setAiLoading(false);
        }
    };
    // Consistency checking state (E3-US4)
    const [consistencyReport, setConsistencyReport] = useState<ConsistencyReport | null>(null);
    const [isCheckingConsistency, setIsCheckingConsistency] = useState(false);
    const [consistencyError, setConsistencyError] = useState<string | null>(null);
    const [showConsistencyReport, setShowConsistencyReport] = useState(false);

    // Ripple effect analysis state (E3-US5)
    const [rippleReport, setRippleReport] = useState<RippleReport | null>(null);
    const [isAnalyzingRipple, setIsAnalyzingRipple] = useState(false);
    const [showRippleModal, setShowRippleModal] = useState(false);
    const [pendingSaveField, setPendingSaveField] = useState<string | null>(null);
    const [rippleError, setRippleError] = useState<string | null>(null);

    // Scene Card Generator state
    const [sceneCard, setSceneCard] = useState<SceneCard | null>(null);
    const [sceneLoading, setSceneLoading] = useState(false);
    const [sceneError, setSceneError] = useState<string | null>(null);
    const [editingSceneField, setEditingSceneField] = useState<keyof SceneCard | null>(null);
    const [sceneFieldDraft, setSceneFieldDraft] = useState('');

    // Narrative Sequence Builder state
    const [showSequenceModal, setShowSequenceModal] = useState(false);
    const [sequenceSteps, setSequenceSteps] = useState<NarrativeStep[]>([]);
    const [sequenceLoading, setSequenceLoading] = useState(false);
    const [sequenceError, setSequenceError] = useState<string | null>(null);

    // Missing Scene Detector state
    const [showGapsModal, setShowGapsModal] = useState(false);
    const [gapScenes, setGapScenes] = useState<MissingScene[]>([]);
    const [gapLoading, setGapLoading] = useState(false);
    const [gapError, setGapError] = useState<string | null>(null);

    // Character Voice Samples state
    const [voiceSamples, setVoiceSamples] = useState<VoiceSample[]>([]);
    const [voiceLoading, setVoiceLoading] = useState(false);
    const [voiceError, setVoiceError] = useState<string | null>(null);

    // Emotional Beat Tracker state
    const [emotionLevel, setEmotionLevel] = useState<number>(0);

    // Voice sample editing state
    const [editingVoiceIdx, setEditingVoiceIdx] = useState<number | null>(null);
    const [voiceLineDraft, setVoiceLineDraft] = useState('');
    const [voiceCtxDraft, setVoiceCtxDraft] = useState('');

    // Chapter Assembler state
    const [chapterBlueprint, setChapterBlueprint] = useState<ChapterBlueprint | null>(null);
    const [chapterLoading, setChapterLoading] = useState(false);
    const [chapterError, setChapterError] = useState<string | null>(null);

    // POV Analysis state
    const [povIssues, setPovIssues] = useState<POVIssue[]>([]);
    const [povDistribution, setPovDistribution] = useState<Record<string, number>>({});
    const [povLoading, setPovLoading] = useState(false);

    // Draft text state
    const [draftText, setDraftText] = useState('');
    const [showDraftSection, setShowDraftSection] = useState(false);

    // Relationship strength state
    const [relStrength, setRelStrength] = useState(3);

    // Temporal gaps
    const [temporalGaps, setTemporalGaps] = useState<TemporalGap[]>([]);

    // Sidebar tools dropdown
    const [showToolsMenu, setShowToolsMenu] = useState(false);
    const toolsMenuRef = useRef<HTMLDivElement>(null);

    // Relationship state (Sprint 4)
    const [showCreateRelModal, setShowCreateRelModal] = useState(false);
    const [relFromId, setRelFromId] = useState<string | null>(null);
    const [relToId, setRelToId] = useState<string | null>(null);
    const [relType, setRelType] = useState('involves');
    const [relLabel, setRelLabel] = useState('');

    // Co-Relation Analyzer state
    const [showAnalyzer, setShowAnalyzer] = useState(false);
    const [correlationHighlight, setCorrelationHighlight] = useState<Set<string> | null>(null);
    const [analyzerSourceId, setAnalyzerSourceId] = useState<string | null>(null);

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
            setActiveUsers
        );
        return () => stopPresence();
    }, [projectId, user, setActiveUsers]);

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
    const entityQueryKey = ['entities', projectId, entityFilter, searchQuery];
    const { data: entitiesData, isLoading: entitiesLoading } = useQuery({
        queryKey: entityQueryKey,
        queryFn: () => api.getEntities(projectId!, {
            type: entityFilter !== 'all' ? entityFilter : undefined,
            search: searchQuery || undefined,
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
    const reorderEntities = useMutation({
        mutationFn: (updates: { id: string; sort_order: number }[]) => api.reorderEntities(updates),
        onMutate: async (updates) => {
            // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
            await queryClient.cancelQueries({ queryKey: ['entities', projectId] });

            // Snapshot the previous value
            const previousEntities = queryClient.getQueryData<any>(['entities', projectId, 'all']);

            // Optimistically update to the new value
            if (previousEntities?.entities) {
                const newEntities = [...previousEntities.entities];
                updates.forEach(update => {
                    const entity = newEntities.find(e => e.id === update.id);
                    if (entity) entity.sort_order = update.sort_order;
                });
                // Sort by new order
                newEntities.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

                queryClient.setQueryData(['entities', projectId, 'all'], {
                    ...previousEntities,
                    entities: newEntities
                });
            }

            return { previousEntities };
        },
        onSuccess: () => {
            // Invalidate ALL entity queries to ensure consistency
            queryClient.invalidateQueries({ queryKey: ['entities', projectId] });
        },
        onError: (err, _updates, context) => {
            console.error('Reorder failed:', err);
            // Rollback if failed
            if (context?.previousEntities) {
                queryClient.setQueryData(['entities', projectId, 'all'], context.previousEntities);
            }
        }
    });

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

    // Position update callback (E2-US3: drag persistence)
    const handlePositionUpdate = useCallback((entityId: string, x: number, y: number) => {
        updateEntity.mutate({ id: entityId, body: { position_x: x, position_y: y } });
    }, [updateEntity]);

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

        // Only intercept description changes when AI is configured
        if (field === 'description' && aiConfigured && editDescVal !== (selectedEntity.description || '')) {
            setPendingSaveField(field);
            setIsAnalyzingRipple(true);
            setRippleError(null);
            setRippleReport(null);
            setShowRippleModal(true);

            try {
                // Get related entities using graph traversal
                const { entities: related, paths } = await api.getRelatedEntities(
                    selectedEntity.id, 2, projectId
                );

                // Build relationship type map
                const relMap: Record<string, string> = {};
                for (const p of paths) {
                    if (p.from === selectedEntity.id) relMap[p.to] = p.type;
                    if (p.to === selectedEntity.id) relMap[p.from] = p.type;
                }

                const report = await analyzeRippleEffects({
                    editedEntity: {
                        name: selectedEntity.name,
                        type: selectedEntity.entity_type,
                        descriptionBefore: selectedEntity.description || '',
                        descriptionAfter: editDescVal,
                    },
                    relatedEntities: related.map(e => ({
                        name: e.name,
                        type: e.entity_type,
                        description: e.description || '',
                        relationshipType: relMap[e.id] || 'related',
                    })),
                    projectName: currentProject?.name || 'Unknown',
                });

                setRippleReport(report);
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Analysis failed';
                setRippleError(msg);
            } finally {
                setIsAnalyzingRipple(false);
            }
        } else {
            // No interception needed — save directly
            commitSave(field);
        }
    };

    const handleRippleProceed = () => {
        if (pendingSaveField) {
            commitSave(pendingSaveField);
        }
        setShowRippleModal(false);
        setPendingSaveField(null);
        setRippleReport(null);
    };

    const handleRippleCancel = () => {
        setShowRippleModal(false);
        setPendingSaveField(null);
        setRippleReport(null);
        setRippleError(null);
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



    // Save AI idea as Note entity
    const saveIdeaAsNote = (idea: GeneratedIdea) => {
        createEntity.mutate({
            entity_type: 'note',
            name: idea.title,
            description: idea.description,
            properties: { source: 'ai_generated', confidence: idea.confidence },
        });
    };

    // Scene Card Generator handler
    const handleGenerateScene = async () => {
        if (!selectedEntity || selectedEntity.entity_type !== 'event') return;
        setSceneLoading(true);
        setSceneError(null);
        setSceneCard(null);
        try {
            const allEntities = allEntitiesData?.entities || [];
            const allRels = (relationshipsData?.relationships || []) as Relationship[];
            const connectedIds = allRels
                .filter(r => r.from_entity_id === selectedEntity.id || r.to_entity_id === selectedEntity.id)
                .map(r => r.from_entity_id === selectedEntity.id ? r.to_entity_id : r.from_entity_id);
            const connected = allEntities.filter(e => connectedIds.includes(e.id));
            const result = await generateSceneCard({
                eventName: selectedEntity.name,
                eventDescription: selectedEntity.description,
                connectedCharacters: connected.filter(e => e.entity_type === 'character').map(e => ({ name: e.name, description: e.description })),
                connectedLocations: connected.filter(e => e.entity_type === 'location').map(e => ({ name: e.name, description: e.description })),
                connectedThemes: connected.filter(e => e.entity_type === 'theme').map(e => ({ name: e.name, description: e.description })),
                projectContext: currentProject?.description,
            });
            setSceneCard(result.sceneCard);
            // Auto-save to entity properties
            updateEntity.mutate({
                id: selectedEntity.id,
                body: { properties: { ...selectedEntity.properties, scene_card: result.sceneCard } },
            });
        } catch (err) {
            setSceneError(err instanceof Error ? err.message : 'Failed to generate scene card');
        } finally {
            setSceneLoading(false);
        }
    };

    // Save manually edited scene card field
    const saveSceneField = (field: keyof SceneCard, value: string) => {
        if (!sceneCard || !selectedEntity) return;
        const updated = { ...sceneCard, [field]: value };
        setSceneCard(updated);
        setEditingSceneField(null);
        updateEntity.mutate({
            id: selectedEntity.id,
            body: { properties: { ...selectedEntity.properties, scene_card: updated } },
        });
    };

    // Load saved data when selecting an entity
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        const props = selectedEntity?.properties as Record<string, unknown> | undefined;
        // Scene card (events only)
        if (selectedEntity?.entity_type === 'event' && props) {
            setSceneCard((props.scene_card as SceneCard) || null);
            setEmotionLevel(typeof props.emotion_level === 'number' ? props.emotion_level : 0);
        } else {
            setSceneCard(null);
            setEmotionLevel(0);
        }
        // Voice samples (characters only)
        if (selectedEntity?.entity_type === 'character' && props) {
            setVoiceSamples((props.voice_samples as VoiceSample[]) || []);
        } else {
            setVoiceSamples([]);
        }
        setSceneError(null);
        setVoiceError(null);
        setEditingSceneField(null);
        setEditingVoiceIdx(null);
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
    const handleBuildSequence = async () => {
        setSequenceLoading(true);
        setSequenceError(null);
        setSequenceSteps([]);
        setShowSequenceModal(true);
        try {
            const allEntities = allEntitiesData?.entities || [];
            const allRels = (relationshipsData?.relationships || []) as Relationship[];
            const events = allEntities.filter(e => e.entity_type === 'event');
            const entityMap = new Map(allEntities.map(e => [e.id, e]));
            const rels = allRels.map(r => ({
                fromName: entityMap.get(r.from_entity_id)?.name || '',
                toName: entityMap.get(r.to_entity_id)?.name || '',
                type: r.relationship_type,
            })).filter(r => r.fromName && r.toName);
            const result = await buildNarrativeSequence({
                events: events.map(e => ({ id: e.id, name: e.name, description: e.description })),
                relationships: rels,
                projectName: currentProject?.name || '',
            });
            setSequenceSteps(result.steps);
        } catch (err) {
            setSequenceError(err instanceof Error ? err.message : 'Failed to build sequence');
        } finally {
            setSequenceLoading(false);
        }
    };

    // Missing Scene Detector handler
    const handleFindGaps = async () => {
        setGapLoading(true);
        setGapError(null);
        setGapScenes([]);
        setShowGapsModal(true);
        try {
            const allEntities = allEntitiesData?.entities || [];
            const allRels = (relationshipsData?.relationships || []) as Relationship[];
            const entityMap = new Map(allEntities.map(e => [e.id, e]));
            const result = await detectMissingScenes({
                events: allEntities.filter(e => e.entity_type === 'event').map(e => ({ name: e.name, description: e.description })),
                characters: allEntities.filter(e => e.entity_type === 'character').map(e => ({ name: e.name, description: e.description })),
                locations: allEntities.filter(e => e.entity_type === 'location').map(e => ({ name: e.name, description: e.description })),
                relationships: allRels.map(r => ({
                    fromName: entityMap.get(r.from_entity_id)?.name || '',
                    toName: entityMap.get(r.to_entity_id)?.name || '',
                    type: r.relationship_type,
                })).filter(r => r.fromName && r.toName),
                projectName: currentProject?.name || '',
            });
            setGapScenes(result.scenes);
        } catch (err) {
            setGapError(err instanceof Error ? err.message : 'Failed to detect gaps');
        } finally {
            setGapLoading(false);
        }
    };

    // Create event from gap suggestion
    const createEventFromGap = (gap: MissingScene) => {
        createEntity.mutate({
            entity_type: 'event',
            name: gap.title,
            description: gap.description,
            properties: { source: 'ai_gap_detection', afterEvent: gap.afterEvent, beforeEvent: gap.beforeEvent },
        });
        setGapScenes(prev => prev.filter(g => g.id !== gap.id));
    };

    // Character Voice Samples handler
    const handleGenerateVoice = async () => {
        if (!selectedEntity || selectedEntity.entity_type !== 'character') return;
        setVoiceLoading(true);
        setVoiceError(null);
        setVoiceSamples([]);
        try {
            const allEntities = allEntitiesData?.entities || [];
            const allRels = (relationshipsData?.relationships || []) as Relationship[];
            const connectedIds = allRels
                .filter(r => r.from_entity_id === selectedEntity.id || r.to_entity_id === selectedEntity.id)
                .map(r => r.from_entity_id === selectedEntity.id ? r.to_entity_id : r.from_entity_id);
            const connected = allEntities.filter(e => connectedIds.includes(e.id));
            const result = await generateCharacterVoice({
                characterName: selectedEntity.name,
                characterDescription: selectedEntity.description,
                connectedThemes: connected.filter(e => e.entity_type === 'theme').map(e => ({ name: e.name, description: e.description })),
                connectedArcs: connected.filter(e => e.entity_type === 'arc').map(e => ({ name: e.name, description: e.description })),
                projectContext: currentProject?.description,
            });
            setVoiceSamples(result.samples);
            // Auto-save to entity properties
            updateEntity.mutate({
                id: selectedEntity.id,
                body: { properties: { ...selectedEntity.properties, voice_samples: result.samples } },
            });
        } catch (err) {
            setVoiceError(err instanceof Error ? err.message : 'Failed to generate voice samples');
        } finally {
            setVoiceLoading(false);
        }
    };

    // Worldbuilding Wiki Export handler
    const handleExportWiki = () => {
        const allEntities = allEntitiesData?.entities || [];
        const allRels = (relationshipsData?.relationships || []) as Relationship[];
        const entityMap = new Map(allEntities.map(e => [e.id, e]));
        const rels = allRels.map(r => ({
            fromName: entityMap.get(r.from_entity_id)?.name || '',
            toName: entityMap.get(r.to_entity_id)?.name || '',
            type: r.relationship_type,
            label: r.label,
        })).filter(r => r.fromName && r.toName);

        const md = generateWikiMarkdown({
            projectName: currentProject?.name || 'Untitled Project',
            entities: allEntities.map(e => ({ name: e.name, entity_type: e.entity_type, description: e.description, properties: e.properties as Record<string, unknown> })),
            relationships: rels,
        });

        // Download as .md file
        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(currentProject?.name || 'chronos').replace(/\s+/g, '-').toLowerCase()}-wiki.md`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Copy wiki to clipboard
    const handleCopyWiki = async () => {
        const allEntities = allEntitiesData?.entities || [];
        const allRels = (relationshipsData?.relationships || []) as Relationship[];
        const entityMap = new Map(allEntities.map(e => [e.id, e]));
        const rels = allRels.map(r => ({
            fromName: entityMap.get(r.from_entity_id)?.name || '',
            toName: entityMap.get(r.to_entity_id)?.name || '',
            type: r.relationship_type,
            label: r.label,
        })).filter(r => r.fromName && r.toName);

        const md = generateWikiMarkdown({
            projectName: currentProject?.name || 'Untitled Project',
            entities: allEntities.map(e => ({ name: e.name, entity_type: e.entity_type, description: e.description, properties: e.properties as Record<string, unknown> })),
            relationships: rels,
        });

        await navigator.clipboard.writeText(md);
    };

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
    const handleAnalyzePOV = async () => {
        setPovLoading(true);
        setPovIssues([]);
        try {
            const allEntities = allEntitiesData?.entities || [];
            const events = allEntities.filter(e => e.entity_type === 'event').map(e => ({
                name: e.name,
                povCharacter: (e.properties as Record<string, unknown>)?.pov_character ? ((e.properties as Record<string, unknown>).pov_character as { name: string })?.name : undefined,
                emotionLevel: (e.properties as Record<string, unknown>)?.emotion_level as number | undefined,
            }));
            const characters = allEntities.filter(e => e.entity_type === 'character').map(e => ({ name: e.name, description: e.description }));
            const result = await analyzePOVBalance({ events, characters, projectContext: currentProject?.description });
            setPovIssues(result.issues);
            setPovDistribution(result.distribution);
        } catch { /* silent */ } finally { setPovLoading(false); }
    };

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
    const handleAssembleChapter = async () => {
        if (!selectedEntity || selectedEntity.entity_type !== 'chapter') return;
        setChapterLoading(true);
        setChapterError(null);
        setChapterBlueprint(null);
        try {
            const allEntities = allEntitiesData?.entities || [];
            const allRels = (relationshipsData?.relationships || []) as Relationship[];
            // Find events connected to this chapter
            const connectedIds = allRels
                .filter(r => r.from_entity_id === selectedEntity.id || r.to_entity_id === selectedEntity.id)
                .map(r => r.from_entity_id === selectedEntity.id ? r.to_entity_id : r.from_entity_id);
            const connectedEvents = allEntities
                .filter(e => connectedIds.includes(e.id) && e.entity_type === 'event')
                .map(e => {
                    const props = e.properties as Record<string, unknown>;
                    const sc = props?.scene_card as { pov?: string; goal?: string; conflict?: string; outcome?: string; openingLine?: string } | undefined;
                    const dt = props?.draft_text as string | undefined;
                    return {
                        name: e.name,
                        description: e.description,
                        sceneCard: sc || undefined,
                        emotionLevel: props?.emotion_level as number | undefined,
                        povCharacter: (props?.pov_character as { name: string })?.name,
                        draftWordCount: dt ? dt.split(/\s+/).filter(Boolean).length : undefined,
                    };
                });
            const connectedCharIds = new Set<string>();
            for (const ev of connectedEvents.map(e => allEntities.find(a => a.name === e.name)!).filter(Boolean)) {
                allRels.filter(r => r.from_entity_id === ev.id || r.to_entity_id === ev.id)
                    .forEach(r => { connectedCharIds.add(r.from_entity_id); connectedCharIds.add(r.to_entity_id); });
            }
            const characters = allEntities
                .filter(e => connectedCharIds.has(e.id) && e.entity_type === 'character')
                .map(e => ({
                    name: e.name,
                    description: e.description,
                    voiceSamples: ((e.properties as Record<string, unknown>)?.voice_samples as Array<{ line: string; context: string }>) || undefined,
                }));
            const entityMap = new Map(allEntities.map(e => [e.id, e]));
            const relationships = allRels
                .filter(r => connectedIds.includes(r.from_entity_id) || connectedIds.includes(r.to_entity_id))
                .map(r => ({
                    from: entityMap.get(r.from_entity_id)?.name || '',
                    to: entityMap.get(r.to_entity_id)?.name || '',
                    type: r.relationship_type,
                    label: r.label,
                })).filter(r => r.from && r.to);

            const result = await assembleChapter({
                chapterName: selectedEntity.name,
                chapterDescription: selectedEntity.description,
                events: connectedEvents,
                characters,
                relationships,
                projectContext: currentProject?.description,
            });
            setChapterBlueprint(result.blueprint);
            // Auto-save blueprint to chapter properties
            updateEntity.mutate({
                id: selectedEntity.id,
                body: { properties: { ...selectedEntity.properties, chapter_blueprint: result.blueprint } },
            });
        } catch (err) {
            setChapterError(err instanceof Error ? err.message : 'Failed to assemble chapter');
        } finally {
            setChapterLoading(false);
        }
    };

    // Temporal gap calculation (Feature 12)
    const handleCalcTemporalGaps = () => {
        const allEntities = allEntitiesData?.entities || [];
        const events = allEntities
            .filter(e => e.entity_type === 'event')
            .map(e => ({
                name: e.name,
                timestamp: (e.properties as Record<string, unknown>)?.timestamp as string | undefined,
                description: e.description,
            }));
        setTemporalGaps(analyzeTemporalGaps(events));
    };

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

    const toggleType = (type: string) => {
        setHiddenTypes(prev => {
            const next = new Set(prev);
            if (next.has(type)) next.delete(type);
            else next.add(type);
            return next;
        });
    };

    // AI consistency checking (E3-US4)
    const handleCheckConsistency = async () => {
        if (isCheckingConsistency) return;
        setIsCheckingConsistency(true);
        setConsistencyError(null);

        try {
            const entitiesToCheck = allEntities.map(e => ({
                name: e.name,
                type: e.entity_type,
                description: e.description,
                properties: e.properties as Record<string, unknown> | undefined,
            }));

            const report = await checkConsistency({
                entities: entitiesToCheck,
                projectName: currentProject?.name || 'Untitled Project',
                scope: focusedTimelineId ? 'timeline' : 'project',
                scopeTimelineName: focusedTimelineId
                    ? timelines.find(t => t.id === focusedTimelineId)?.name
                    : undefined,
            });

            setConsistencyReport(report);
            setShowConsistencyReport(true);
        } catch (err) {
            setConsistencyError(err instanceof Error ? err.message : 'Consistency check failed');
            setShowConsistencyReport(true);
        } finally {
            setIsCheckingConsistency(false);
        }
    };

    // Navigate to entity by name (for consistency report)
    const navigateToEntityByName = (name: string) => {
        const entity = allEntities.find(e => e.name.toLowerCase() === name.toLowerCase());
        if (entity) {
            setSelectedEntity(entity);
            setActiveDetailTab('details');
        }
    };

    const allEntities = allEntitiesData?.entities || [];
    const rawFilteredEntities = entitiesData?.entities || [];
    const allVariants = variantsData?.variants || [];
    const entityVariants = entityVariantsData?.variants || [];
    const entityTypes = [...new Set(allEntities.map(e => e.entity_type))];
    const aiConfigured = hasConfiguredProvider();

    // When a timeline is focused, filter sidebar to show related entities
    const filteredEntities = useMemo(() => {
        if (!focusedTimelineId) return rawFilteredEntities;

        // Build set of entity IDs connected to this timeline via relationships
        const connectedIds = new Set<string>();
        for (const r of projectRelationships) {
            if (r.from_entity_id === focusedTimelineId) connectedIds.add(r.to_entity_id);
            if (r.to_entity_id === focusedTimelineId) connectedIds.add(r.from_entity_id);
        }
        // Also include entities with variants for this timeline
        for (const v of allVariants) {
            if (v.timeline_id === focusedTimelineId) connectedIds.add(v.entity_id);
        }

        return rawFilteredEntities.filter(e => {
            // Always show the focused timeline itself
            if (e.id === focusedTimelineId) return true;
            // Show entities connected to this timeline
            if (connectedIds.has(e.id)) return true;
            // Show non-event entities (characters, locations, etc.) always
            if (e.entity_type !== 'event' && e.entity_type !== 'timeline') return true;
            return false;
        });
    }, [rawFilteredEntities, focusedTimelineId, projectRelationships, allVariants]);

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
                        <div style={{ display: 'flex', gap: 4, position: 'relative' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/project/${projectId}/analytics`)} title="Analytics">📊</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setShowToolsMenu(!showToolsMenu)} title="Tools Menu" style={{ fontSize: 16 }}>⋯</button>
                            {showToolsMenu && (
                                <div ref={toolsMenuRef} style={{
                                    position: 'absolute', top: '100%', right: 0, marginTop: 4,
                                    background: 'var(--bg-primary)', border: '1px solid var(--border)',
                                    borderRadius: 'var(--radius-lg)', padding: 'var(--space-1)',
                                    minWidth: 220, zIndex: 100,
                                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                                    backdropFilter: 'blur(12px)',
                                }} onClick={e => e.stopPropagation()}>
                                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', padding: '4px 10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>AI Tools</div>
                                    <button className="btn btn-ghost btn-sm" onClick={() => { handleBuildSequence(); setShowToolsMenu(false); }} disabled={sequenceLoading} style={{ width: '100%', justifyContent: 'flex-start', padding: '6px 10px', borderRadius: 'var(--radius-md)' }}>📖 Build Reading Sequence</button>
                                    <button className="btn btn-ghost btn-sm" onClick={() => { handleFindGaps(); setShowToolsMenu(false); }} disabled={gapLoading} style={{ width: '100%', justifyContent: 'flex-start', padding: '6px 10px', borderRadius: 'var(--radius-md)' }}>🔍 Find Missing Scenes</button>
                                    <button className="btn btn-ghost btn-sm" onClick={() => { handleAnalyzePOV(); setShowToolsMenu(false); }} disabled={povLoading} style={{ width: '100%', justifyContent: 'flex-start', padding: '6px 10px', borderRadius: 'var(--radius-md)' }}>👁️ Analyze POV Balance</button>
                                    <button className="btn btn-ghost btn-sm" onClick={() => { handleCalcTemporalGaps(); setShowToolsMenu(false); }} style={{ width: '100%', justifyContent: 'flex-start', padding: '6px 10px', borderRadius: 'var(--radius-md)' }}>🕐 Show Temporal Gaps</button>
                                    {selectedEntity?.entity_type === 'character' && (
                                        <button className="btn btn-ghost btn-sm" onClick={() => { handleGenerateVoice(); setShowToolsMenu(false); }} disabled={voiceLoading} style={{ width: '100%', justifyContent: 'flex-start', padding: '6px 10px', borderRadius: 'var(--radius-md)' }}>🗣️ Generate Voice Samples</button>
                                    )}
                                    <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', padding: '4px 10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Export</div>
                                    <button className="btn btn-ghost btn-sm" onClick={() => { handleExportWiki(); setShowToolsMenu(false); }} style={{ width: '100%', justifyContent: 'flex-start', padding: '6px 10px', borderRadius: 'var(--radius-md)' }}>📚 Export Wiki (.md)</button>
                                    <button className="btn btn-ghost btn-sm" onClick={() => { handleCopyWiki(); setShowToolsMenu(false); }} style={{ width: '100%', justifyContent: 'flex-start', padding: '6px 10px', borderRadius: 'var(--radius-md)' }}>📋 Copy Wiki to Clipboard</button>
                                    <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                                    <button className="btn btn-ghost btn-sm" onClick={() => { navigate('/settings'); setShowToolsMenu(false); }} style={{ width: '100%', justifyContent: 'flex-start', padding: '6px 10px', borderRadius: 'var(--radius-md)' }}>⚙️ AI Settings</button>
                                    <button className="btn btn-ghost btn-sm" onClick={signOut} style={{ width: '100%', justifyContent: 'flex-start', padding: '6px 10px', borderRadius: 'var(--radius-md)' }}>🚪 Sign Out</button>
                                </div>
                            )}
                        </div>
                    </div>
                    <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginTop: 'var(--space-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {currentProject?.name || 'Loading...'}
                    </h2>
                    {/* Active Users (E5-US2) */}
                    {activeUsers.length > 0 && (
                        <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                            {activeUsers.map(u => (
                                <div key={u.userId} title={`${u.userName}${u.editingEntityId ? ' (editing)' : ''}`} style={{
                                    width: 24, height: 24, borderRadius: '50%',
                                    background: u.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 11, fontWeight: 700, color: 'white',
                                    border: u.editingEntityId ? '2px solid #f59e0b' : '2px solid transparent',
                                    transition: 'border-color 0.2s',
                                }}>
                                    {u.userName.charAt(0).toUpperCase()}
                                </div>
                            ))}
                        </div>
                    )}
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
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => { setGlobalSearchOpen(true); setGlobalSearchQuery(''); }}
                        title="Global Search (⌘K)"
                        style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', padding: '2px 6px', fontSize: 10, color: 'var(--text-tertiary)', border: '1px solid var(--border)', borderRadius: 4 }}
                    >⌘K</button>
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

                {/* View Mode Toggle */}
                {timelines.length > 0 && (
                    <div style={{ padding: '0 var(--space-2) var(--space-1)' }}>
                        <div style={{
                            display: 'flex', gap: 0, borderRadius: 'var(--radius-md)',
                            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                            overflow: 'hidden',
                        }}>
                            <button
                                onClick={() => { setViewMode('graph'); setSelectedEntity(null); setAiError(null); }}
                                style={{
                                    flex: 1, padding: '5px 8px', fontSize: 'var(--text-xs)',
                                    fontWeight: viewMode === 'graph' ? 600 : 400,
                                    background: viewMode === 'graph' ? 'rgba(99,102,241,0.15)' : 'transparent',
                                    color: viewMode === 'graph' ? 'var(--accent)' : 'var(--text-tertiary)',
                                    border: 'none', cursor: 'pointer',
                                    borderRight: '1px solid var(--border)',
                                    transition: 'all 0.15s',
                                }}
                            >
                                🕸️ Causality Graph
                            </button>
                            <button
                                onClick={() => { setViewMode('timeline'); setSelectedEntity(null); setAiError(null); }}
                                style={{
                                    flex: 1, padding: '5px 8px', fontSize: 'var(--text-xs)',
                                    fontWeight: viewMode === 'timeline' ? 600 : 400,
                                    background: viewMode === 'timeline' ? 'rgba(99,102,241,0.15)' : 'transparent',
                                    color: viewMode === 'timeline' ? 'var(--accent)' : 'var(--text-tertiary)',
                                    border: 'none', cursor: 'pointer',
                                    transition: 'all 0.15s',
                                }}
                            >
                                📐 Timeline Explorer
                            </button>
                            <button
                                onClick={() => { setViewMode('audit'); setSelectedEntity(null); setAiError(null); }}
                                style={{
                                    flex: 1, padding: '5px 8px', fontSize: 'var(--text-xs)',
                                    fontWeight: viewMode === 'audit' ? 600 : 400,
                                    background: viewMode === 'audit' ? 'rgba(99,102,241,0.15)' : 'transparent',
                                    color: viewMode === 'audit' ? 'var(--accent)' : 'var(--text-tertiary)',
                                    border: 'none', cursor: 'pointer',
                                    transition: 'all 0.15s',
                                }}
                            >
                                📋 Narrative Audit
                            </button>
                            <button
                                onClick={() => { setViewMode('cowrite'); setSelectedEntity(null); setAiError(null); }}
                                style={{
                                    flex: 1, padding: '5px 8px', fontSize: 'var(--text-xs)',
                                    fontWeight: viewMode === 'cowrite' ? 600 : 400,
                                    background: viewMode === 'cowrite' ? 'rgba(99,102,241,0.15)' : 'transparent',
                                    color: viewMode === 'cowrite' ? 'var(--accent)' : 'var(--text-tertiary)',
                                    border: 'none', cursor: 'pointer',
                                    transition: 'all 0.15s',
                                }}
                            >
                                ✍️ Co-Write
                            </button>
                        </div>
                    </div>
                )}

                {/* AI Consistency Check Button (E3-US4) */}
                <div style={{ padding: '0 var(--space-2) var(--space-1)' }}>
                    <button
                        className="btn btn-sm"
                        onClick={aiConfigured ? handleCheckConsistency : () => navigate('/settings')}
                        disabled={aiConfigured && (isCheckingConsistency || allEntities.length === 0)}
                        title={!aiConfigured ? 'Configure an AI API key in Settings first' : undefined}
                        style={{
                            width: '100%',
                            fontSize: 'var(--text-xs)',
                            padding: '6px 10px',
                            background: !aiConfigured ? 'var(--bg-secondary)'
                                : consistencyReport && !consistencyError
                                    ? (consistencyReport.issues.length === 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.08)')
                                    : 'var(--bg-secondary)',
                            border: !aiConfigured ? '1px solid var(--border)'
                                : consistencyReport && !consistencyError
                                    ? (consistencyReport.issues.length === 0 ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(239,68,68,0.2)')
                                    : '1px solid var(--border)',
                            color: !aiConfigured ? 'var(--text-tertiary)'
                                : isCheckingConsistency ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                            borderRadius: 'var(--radius-md)',
                            cursor: isCheckingConsistency ? 'wait' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            transition: 'all 0.2s',
                        }}
                    >
                        {!aiConfigured ? (
                            '🔍 Check Consistency (Set API Key →)'
                        ) : isCheckingConsistency ? (
                            <><div className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} /> Analyzing...</>
                        ) : consistencyReport && !consistencyError ? (
                            consistencyReport.issues.length === 0 ? '✅ No Issues Found' : `🔍 ${consistencyReport.issues.length} Issue${consistencyReport.issues.length !== 1 ? 's' : ''} Found`
                        ) : (
                            '🔍 Check Consistency'
                        )}
                    </button>
                    {consistencyError && (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--error)', marginTop: 4, padding: '4px 8px', background: 'rgba(239,68,68,0.08)', borderRadius: 'var(--radius-sm)' }}>
                            {consistencyError}
                        </div>
                    )}
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
                            {filteredEntities.map((entity) => {
                                const entityVariantTimelines = variantMap.get(entity.id) || [];
                                const isEvent = entity.entity_type === 'event';
                                const isDragged = draggedEntityId === entity.id;

                                return (
                                    <div
                                        key={entity.id}
                                        className={`entity-item ${selectedEntity?.id === entity.id ? 'active' : ''}`}
                                        onClick={() => { setSelectedEntity(entity); setActiveDetailTab('details'); }}
                                        draggable={isEvent && !focusedTimelineId}
                                        onDragStart={isEvent ? (e) => {
                                            setDraggedEntityId(entity.id);
                                            e.dataTransfer.effectAllowed = 'move';
                                            e.dataTransfer.setData('text/plain', entity.id);
                                            // Make the drag image slightly transparent
                                            if (e.currentTarget instanceof HTMLElement) {
                                                e.currentTarget.style.opacity = '0.4';
                                            }
                                        } : undefined}
                                        onDragEnd={isEvent ? (e) => {
                                            if (e.currentTarget instanceof HTMLElement) {
                                                e.currentTarget.style.opacity = '1';
                                            }
                                            // Perform the reorder
                                            if (draggedEntityId && dropTargetIndex !== null && !reorderEntities.isPending) {
                                                // CRITICAL: Always use the FULL list of events for reordering source
                                                // to prevent sort_order gaps or overwrites when filters are active.
                                                const allEvents = (allEntitiesData?.entities || []).filter(ev => ev.entity_type === 'event');

                                                const dragIdx = allEvents.findIndex(ev => ev.id === draggedEntityId);
                                                if (dragIdx !== -1) {
                                                    const reordered = [...allEvents];
                                                    const [moved] = reordered.splice(dragIdx, 1);

                                                    // Calculate drop position in the full list
                                                    // Since we drag in a filtered view, we need to map dropTargetIndex
                                                    // from filteredEntities back to allEvents.
                                                    const currentEvents = filteredEntities.filter(ev => ev.entity_type === 'event');
                                                    let finalDropIdx;

                                                    if (dropTargetIndex >= currentEvents.length) {
                                                        // Dropped at the very end
                                                        finalDropIdx = allEvents.length;
                                                    } else {
                                                        const targetEntity = currentEvents[dropTargetIndex];
                                                        finalDropIdx = allEvents.findIndex(ev => ev.id === targetEntity.id);
                                                    }

                                                    if (finalDropIdx !== -1 && dragIdx !== finalDropIdx) {
                                                        reordered.splice(finalDropIdx > dragIdx ? finalDropIdx - 1 : finalDropIdx, 0, moved);
                                                        const updates = reordered.map((ev, idx) => ({ id: ev.id, sort_order: idx }));
                                                        reorderEntities.mutate(updates);
                                                    }
                                                }
                                            }
                                            setDraggedEntityId(null);
                                            setDropTargetIndex(null);
                                        } : undefined}
                                        onDragOver={isEvent ? (e) => {
                                            e.preventDefault();
                                            e.dataTransfer.dropEffect = 'move';
                                            // Calculate which half of the item we're over
                                            const events = filteredEntities.filter(ev => ev.entity_type === 'event');
                                            const eventIndex = events.findIndex(ev => ev.id === entity.id);
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            const midY = rect.top + rect.height / 2;
                                            const targetIdx = e.clientY < midY ? eventIndex : eventIndex + 1;
                                            setDropTargetIndex(targetIdx);
                                        } : undefined}
                                        onDragLeave={isEvent ? () => {
                                            // Only clear if leaving the list area entirely
                                        } : undefined}
                                        onDrop={isEvent ? (e) => {
                                            e.preventDefault();
                                        } : undefined}
                                        style={{
                                            position: 'relative',
                                            paddingRight: isEvent ? 36 : 12,
                                            opacity: isDragged ? 0.4 : 1,
                                            cursor: isEvent && !focusedTimelineId ? 'grab' : 'pointer',
                                            transition: 'opacity 0.15s',
                                        }}
                                    >
                                        {/* Drop indicator line */}
                                        {isEvent && dropTargetIndex !== null && draggedEntityId && draggedEntityId !== entity.id && (() => {
                                            const events = filteredEntities.filter(ev => ev.entity_type === 'event');
                                            const eventIndex = events.findIndex(ev => ev.id === entity.id);
                                            if (dropTargetIndex === eventIndex) {
                                                return (
                                                    <div style={{
                                                        position: 'absolute', top: -1, left: 4, right: 4,
                                                        height: 2, background: '#6366f1', borderRadius: 1, zIndex: 10,
                                                        boxShadow: '0 0 6px rgba(99,102,241,0.5)',
                                                    }} />
                                                );
                                            }
                                            return null;
                                        })()}

                                        <div className="entity-icon">{ENTITY_ICONS[entity.entity_type]}</div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            {sidebarRenameId === entity.id ? (
                                                <input
                                                    className="input"
                                                    autoFocus
                                                    value={sidebarRenameVal}
                                                    onChange={(e) => setSidebarRenameVal(e.target.value)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    style={{ fontSize: 'var(--text-sm)', padding: '2px 6px', height: 'auto', width: '100%' }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' && sidebarRenameVal.trim()) {
                                                            updateEntity.mutate({ id: entity.id, body: { name: sidebarRenameVal.trim() } });
                                                            setSidebarRenameId(null);
                                                        }
                                                        if (e.key === 'Escape') setSidebarRenameId(null);
                                                    }}
                                                    onBlur={() => {
                                                        if (sidebarRenameVal.trim() && sidebarRenameVal.trim() !== entity.name) {
                                                            updateEntity.mutate({ id: entity.id, body: { name: sidebarRenameVal.trim() } });
                                                        }
                                                        setSidebarRenameId(null);
                                                    }}
                                                />
                                            ) : (
                                                <>
                                                    <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {focusedTimelineId ? resolveEntity(entity, focusedTimelineId, allVariants).name : entity.name}
                                                    </div>
                                                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', textTransform: 'capitalize' }}>{entity.entity_type}</div>
                                                </>
                                            )}
                                        </div>

                                        {/* Hover Action Buttons */}
                                        {sidebarConfirmDeleteId === entity.id ? (
                                            <div
                                                style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--error)' }}>Delete?</span>
                                                <button
                                                    onClick={() => {
                                                        deleteEntity.mutate(entity.id);
                                                        setSidebarConfirmDeleteId(null);
                                                        if (selectedEntity?.id === entity.id) setSelectedEntity(null);
                                                    }}
                                                    style={{
                                                        background: 'var(--error)', color: 'white', border: 'none',
                                                        borderRadius: 'var(--radius-sm)', padding: '1px 6px',
                                                        fontSize: 11, cursor: 'pointer',
                                                    }}
                                                >✓</button>
                                                <button
                                                    onClick={() => setSidebarConfirmDeleteId(null)}
                                                    style={{
                                                        background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
                                                        border: 'none', borderRadius: 'var(--radius-sm)',
                                                        padding: '1px 6px', fontSize: 11, cursor: 'pointer',
                                                    }}
                                                >✕</button>
                                            </div>
                                        ) : (
                                            <div
                                                className="sidebar-actions"
                                                style={{
                                                    display: 'flex', gap: 2, alignItems: 'center', flexShrink: 0,
                                                    opacity: 0, transition: 'opacity 0.15s',
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <button
                                                    title="Rename"
                                                    onClick={() => { setSidebarRenameId(entity.id); setSidebarRenameVal(entity.name); }}
                                                    style={{
                                                        background: 'none', border: 'none', cursor: 'pointer',
                                                        color: 'var(--text-tertiary)', fontSize: 12, padding: '2px 4px',
                                                        borderRadius: 'var(--radius-sm)',
                                                    }}
                                                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
                                                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                                                >✏️</button>
                                                <button
                                                    title="Delete"
                                                    onClick={() => setSidebarConfirmDeleteId(entity.id)}
                                                    style={{
                                                        background: 'none', border: 'none', cursor: 'pointer',
                                                        color: 'var(--text-tertiary)', fontSize: 12, padding: '2px 4px',
                                                        borderRadius: 'var(--radius-sm)',
                                                    }}
                                                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--error)')}
                                                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                                                >🗑️</button>
                                            </div>
                                        )}

                                        {/* Drag handle (Events only) */}
                                        {isEvent && !focusedTimelineId && (
                                            <div
                                                className="drag-handle"
                                                style={{
                                                    position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    width: 20, height: 28, cursor: 'grab',
                                                    color: 'var(--text-tertiary)', fontSize: 14,
                                                    opacity: 0.4, transition: 'opacity 0.15s',
                                                    userSelect: 'none',
                                                }}
                                                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.9'; }}
                                                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.4'; }}
                                                onClick={(e) => e.stopPropagation()}
                                                title="Drag to reorder"
                                            >
                                                ⠿
                                            </div>
                                        )}

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
                {/* Consistency Report Panel (E3-US4) */}
                {showConsistencyReport && consistencyReport && consistencyReport.issues.length > 0 && (
                    <div style={{
                        borderBottom: '1px solid var(--border)',
                        background: 'var(--bg-secondary)',
                        maxHeight: 300, overflowY: 'auto',
                    }}>
                        {/* Report header */}
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '8px 16px',
                            background: 'rgba(239,68,68,0.05)',
                            borderBottom: '1px solid var(--border)',
                            position: 'sticky', top: 0, zIndex: 5,
                            backdropFilter: 'blur(8px)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                                <span>🔍 Consistency Report</span>
                                <span style={{
                                    padding: '1px 8px', borderRadius: 'var(--radius-full)',
                                    fontSize: 'var(--text-xs)', fontWeight: 500,
                                    background: 'rgba(239,68,68,0.1)', color: 'var(--error)',
                                }}>
                                    {consistencyReport.issues.filter(i => i.severity === 'error').length} errors
                                </span>
                                <span style={{
                                    padding: '1px 8px', borderRadius: 'var(--radius-full)',
                                    fontSize: 'var(--text-xs)', fontWeight: 500,
                                    background: 'rgba(245,158,11,0.1)', color: '#f59e0b',
                                }}>
                                    {consistencyReport.issues.filter(i => i.severity === 'warning').length} warnings
                                </span>
                                {consistencyReport.cached && (
                                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>(cached)</span>
                                )}
                            </div>
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => setShowConsistencyReport(false)}
                                style={{ fontSize: 12, padding: '2px 8px' }}
                            >✕ Close</button>
                        </div>

                        {/* Issue cards */}
                        <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {consistencyReport.issues.map((issue: ConsistencyIssue) => (
                                <div
                                    key={issue.id}
                                    style={{
                                        padding: '10px 14px',
                                        background: 'var(--bg-primary)',
                                        borderRadius: 'var(--radius-md)',
                                        border: `1px solid ${issue.severity === 'error' ? 'rgba(239,68,68,0.2)'
                                            : issue.severity === 'warning' ? 'rgba(245,158,11,0.2)'
                                                : 'var(--border)'
                                            }`,
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                        <span style={{ fontSize: 14 }}>{SEVERITY_ICONS[issue.severity]}</span>
                                        <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)', flex: 1 }}>{issue.title}</span>
                                        <span style={{
                                            fontSize: 'var(--text-xs)', padding: '1px 6px',
                                            borderRadius: 'var(--radius-full)',
                                            background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)',
                                        }}>
                                            {CATEGORY_LABELS[issue.category]}
                                        </span>
                                    </div>
                                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: '0 0 6px 22px', lineHeight: 1.5 }}>
                                        {issue.description}
                                    </p>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 22, flexWrap: 'wrap' }}>
                                        {/* Affected entities */}
                                        {issue.entityNames.map((name: string, idx: number) => (
                                            <button
                                                key={idx}
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => navigateToEntityByName(name)}
                                                style={{
                                                    fontSize: 'var(--text-xs)', padding: '1px 6px',
                                                    color: 'var(--accent)', textDecoration: 'underline',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                {name}
                                            </button>
                                        ))}
                                        {/* Suggested fix */}
                                        {issue.suggestedFix && (
                                            <span style={{
                                                fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)',
                                                fontStyle: 'italic', marginLeft: 'auto',
                                            }}>
                                                💡 {issue.suggestedFix}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {!selectedEntity ? (
                    <div style={{ flex: 1, position: 'relative' }}>
                        {viewMode === 'graph' ? (
                            <div style={{ position: 'relative', flex: 1, width: '100%', height: '100%' }}>
                                <CausalityGraph
                                    entities={canvasEntities}
                                    relationships={projectRelationships}
                                    timelines={timelines}
                                    variants={allVariants}
                                    onEntitySelect={setSelectedEntity}
                                    selectedEntityId={null}
                                    hiddenTypes={hiddenTypes}
                                    focusedTimelineId={focusedTimelineId}
                                    onEntityPositionUpdate={handlePositionUpdate}
                                    onCreateRelationship={(fromId, toId) => {
                                        setRelFromId(fromId);
                                        setRelToId(toId);
                                        setShowCreateRelModal(true);
                                    }}
                                    onDeleteRelationship={(id) => deleteRelationship.mutate(id)}
                                    correlationHighlight={correlationHighlight}
                                    analyzerActive={showAnalyzer}
                                    onToggleAnalyzer={() => setShowAnalyzer(p => !p)}
                                    onEntityCreate={(type, name, x, y) => {
                                        createEntity.mutate({
                                            entity_type: type,
                                            name,
                                            description: '',
                                            properties: { position_x: x, position_y: y },
                                        });
                                    }}
                                    onEntityDelete={(id) => {
                                        deleteEntity.mutate(id);
                                    }}
                                    onEntityRename={(id, newName) => {
                                        updateEntity.mutate({ id, body: { name: newName } });
                                    }}
                                    onFindConnections={(entityId) => {
                                        setAnalyzerSourceId(entityId);
                                        setShowAnalyzer(true);
                                    }}
                                    onCreateRelationshipWithType={(fromId, toId, type) => {
                                        createRelationship.mutate({
                                            from_entity_id: fromId,
                                            to_entity_id: toId,
                                            relationship_type: type,
                                        });
                                    }}
                                />
                                {showAnalyzer && projectId && (
                                    <CorrelationPanel
                                        entities={allEntities}
                                        projectId={projectId}
                                        onClose={() => { setShowAnalyzer(false); setCorrelationHighlight(null); }}
                                        onHighlightChange={setCorrelationHighlight}
                                        onEntitySelect={(entity) => setSelectedEntity(entity)}
                                        initialSourceId={analyzerSourceId}
                                    />
                                )}
                            </div>
                        ) : viewMode === 'audit' ? (
                            <NarrativeAuditCanvas
                                entities={allEntities}
                                relationships={projectRelationships}
                                onEntitySelect={setSelectedEntity}
                                onEntityUpdate={(id, body) => updateEntity.mutate({ id, body })}
                                onEntityDelete={(id) => deleteEntity.mutate(id)}
                                onEntityCreate={(body) => createEntity.mutate({
                                    entity_type: body.entity_type,
                                    name: body.name,
                                    description: body.description,
                                    properties: body.properties,
                                })}
                                onRelationshipCreate={(body) => createRelationship.mutate({
                                    from_entity_id: body.from_entity_id,
                                    to_entity_id: body.to_entity_id,
                                    relationship_type: body.relationship_type,
                                    metadata: body.metadata,
                                })}
                            />
                        ) : viewMode === 'cowrite' ? (
                            <CoWriteView
                                entities={allEntities}
                                relationships={projectRelationships}
                                onEntityUpdate={(id, body) => updateEntity.mutate({ id, body })}
                                projectContext={currentProject?.description || ''}
                            />
                        ) : (
                            <TimelineExplorer
                                entities={canvasEntities}
                                relationships={projectRelationships}
                                timelines={timelines}
                                variants={allVariants}
                                focusedTimelineId={focusedTimelineId}
                                onEntitySelect={setSelectedEntity}
                                selectedEntityId={null}
                                onReorderEntity={(entityId, newOrder) => {
                                    if (reorderEntities.isPending) return;
                                    // CRITICAL: Always use full list for consistent sort_order
                                    const events = (allEntitiesData?.entities || []).filter(e => e.entity_type === 'event');
                                    const reordered = events.filter(e => e.id !== entityId);
                                    const moved = events.find(e => e.id === entityId);
                                    if (moved) {
                                        reordered.splice(newOrder, 0, moved);
                                        const updates = reordered.map((e, idx) => ({ id: e.id, sort_order: idx }));
                                        reorderEntities.mutate(updates);
                                    }
                                }}
                            />
                        )}
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
                                    onClick={() => { setSelectedEntity(null); setAiError(null); }}
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

                            {/* ─── Relationships Tab (Sprint 4) ─── */}
                            {activeDetailTab === 'beats' && selectedEntity.entity_type === 'event' && (
                                <div style={{ height: 'calc(100vh - 200px)' }}> {/* Constrain height for scrolling */}
                                    <BeatSequencer
                                        entity={selectedEntity}
                                        projectDescription={currentProject?.description || ''}
                                        onUpdate={(updates) => updateEntity.mutate({ id: selectedEntity.id, body: updates })}
                                    />
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
                            {selectedEntity?.entity_type === 'event' && (
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={handleGenerateScene}
                                    disabled={sceneLoading}
                                    style={{ justifyContent: 'flex-start' }}
                                >
                                    {sceneLoading ? '⏳ Generating...' : '🎬 Generate Scene Card'}
                                </button>
                            )}
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={handleBuildSequence}
                                disabled={sequenceLoading}
                                style={{ justifyContent: 'flex-start' }}
                            >
                                {sequenceLoading ? '⏳ Building...' : '📖 Build Reading Sequence'}
                            </button>
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={handleFindGaps}
                                disabled={gapLoading}
                                style={{ justifyContent: 'flex-start' }}
                            >
                                {gapLoading ? '⏳ Scanning...' : '🔍 Find Missing Scenes'}
                            </button>
                            {selectedEntity?.entity_type === 'character' && (
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={handleGenerateVoice}
                                    disabled={voiceLoading}
                                    style={{ justifyContent: 'flex-start' }}
                                >
                                    {voiceLoading ? '⏳ Generating...' : '🗣️ Generate Voice Samples'}
                                </button>
                            )}
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => navigate('/settings')}
                                style={{ justifyContent: 'flex-start' }}
                            >
                                ⚙️ AI Settings
                            </button>
                        </div>

                        {/* Scene Card Display */}
                        {sceneError && (
                            <div style={{ marginTop: 'var(--space-2)', padding: 'var(--space-2)', background: 'var(--danger-muted)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', color: 'var(--danger)' }}>
                                ❌ {sceneError}
                            </div>
                        )}
                        {sceneCard && (
                            <div style={{
                                marginTop: 'var(--space-2)', padding: 'var(--space-3)',
                                background: 'linear-gradient(135deg, rgba(234,179,8,0.08), rgba(249,115,22,0.06))',
                                borderRadius: 'var(--radius-lg)', border: '1px solid rgba(234,179,8,0.2)',
                            }}>
                                <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 'var(--space-2)' }}>
                                    🎬 Scene Card
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={handleGenerateScene}
                                        disabled={sceneLoading}
                                        title="Regenerate with AI"
                                        style={{ padding: '0 6px', fontSize: 11 }}
                                    >
                                        {sceneLoading ? '⏳' : '🔄'}
                                    </button>
                                    <button className="btn btn-ghost btn-sm" onClick={() => { setSceneCard(null); if (selectedEntity) updateEntity.mutate({ id: selectedEntity.id, body: { properties: { ...selectedEntity.properties, scene_card: undefined } } }); }} style={{ marginLeft: 'auto', padding: '0 4px', fontSize: 10 }}>✕</button>
                                </h4>
                                {([
                                    { label: '👤 POV', field: 'pov' as keyof SceneCard },
                                    { label: '🎯 Goal', field: 'goal' as keyof SceneCard },
                                    { label: '⚔️ Conflict', field: 'conflict' as keyof SceneCard },
                                    { label: '🏁 Resolution', field: 'resolution' as keyof SceneCard },
                                    { label: '🌍 Setting', field: 'settingNotes' as keyof SceneCard },
                                ] as const).map(({ label, field }) => sceneCard[field] && (
                                    <div key={label} style={{ marginBottom: 'var(--space-1)' }}>
                                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer' }} onClick={() => { setEditingSceneField(field); setSceneFieldDraft(sceneCard[field]); }}>{label} ✏️</span>
                                        {editingSceneField === field ? (
                                            <div style={{ marginTop: 2 }}>
                                                <textarea
                                                    className="input"
                                                    value={sceneFieldDraft}
                                                    onChange={e => setSceneFieldDraft(e.target.value)}
                                                    rows={3}
                                                    style={{ fontSize: 'var(--text-sm)', width: '100%', resize: 'vertical' }}
                                                    autoFocus
                                                />
                                                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                                                    <button className="btn btn-primary btn-sm" onClick={() => saveSceneField(field, sceneFieldDraft)} style={{ padding: '2px 8px', fontSize: 11 }}>Save</button>
                                                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingSceneField(null)} style={{ padding: '2px 8px', fontSize: 11 }}>Cancel</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <p style={{ fontSize: 'var(--text-sm)', margin: '2px 0 0', lineHeight: 1.4, cursor: 'pointer' }} onClick={() => { setEditingSceneField(field); setSceneFieldDraft(sceneCard[field]); }}>{sceneCard[field]}</p>
                                        )}
                                    </div>
                                ))}
                                {sceneCard.openingLine && (
                                    <div style={{ marginTop: 'var(--space-2)' }}>
                                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer' }} onClick={() => { setEditingSceneField('openingLine'); setSceneFieldDraft(sceneCard.openingLine); }}>📝 Opening Line ✏️</span>
                                        {editingSceneField === 'openingLine' ? (
                                            <div style={{ marginTop: 2 }}>
                                                <textarea
                                                    className="input"
                                                    value={sceneFieldDraft}
                                                    onChange={e => setSceneFieldDraft(e.target.value)}
                                                    rows={2}
                                                    style={{ fontSize: 'var(--text-sm)', width: '100%', resize: 'vertical' }}
                                                    autoFocus
                                                />
                                                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                                                    <button className="btn btn-primary btn-sm" onClick={() => saveSceneField('openingLine', sceneFieldDraft)} style={{ padding: '2px 8px', fontSize: 11 }}>Save</button>
                                                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingSceneField(null)} style={{ padding: '2px 8px', fontSize: 11 }}>Cancel</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ padding: 'var(--space-2)', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-md)', fontStyle: 'italic', fontSize: 'var(--text-sm)', borderLeft: '3px solid var(--accent)', cursor: 'pointer' }} onClick={() => { setEditingSceneField('openingLine'); setSceneFieldDraft(sceneCard.openingLine); }}>
                                                "{sceneCard.openingLine}"
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Voice Samples Display (characters only) */}
                        {voiceError && (
                            <div style={{ marginTop: 'var(--space-2)', padding: 'var(--space-2)', background: 'var(--danger-muted)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', color: 'var(--danger)' }}>
                                ❌ {voiceError}
                            </div>
                        )}
                        {voiceSamples.length > 0 && (
                            <div style={{
                                marginTop: 'var(--space-2)', padding: 'var(--space-3)',
                                background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(59,130,246,0.06))',
                                borderRadius: 'var(--radius-lg)', border: '1px solid rgba(139,92,246,0.2)',
                            }}>
                                <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 'var(--space-2)' }}>
                                    🗣️ Character Voice
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={handleGenerateVoice}
                                        disabled={voiceLoading}
                                        title="Regenerate voice samples"
                                        style={{ padding: '0 6px', fontSize: 11 }}
                                    >
                                        {voiceLoading ? '⏳' : '🔄'}
                                    </button>
                                    <button className="btn btn-ghost btn-sm" onClick={() => { setVoiceSamples([]); if (selectedEntity) updateEntity.mutate({ id: selectedEntity.id, body: { properties: { ...selectedEntity.properties, voice_samples: undefined } } }); }} style={{ marginLeft: 'auto', padding: '0 4px', fontSize: 10 }}>✕</button>
                                </h4>
                                {voiceSamples.map((sample, idx) => (
                                    <div key={idx} style={{ marginBottom: 'var(--space-2)' }}>
                                        {editingVoiceIdx === idx ? (
                                            <div>
                                                <textarea
                                                    className="input"
                                                    value={voiceLineDraft}
                                                    onChange={e => setVoiceLineDraft(e.target.value)}
                                                    rows={2}
                                                    style={{ fontSize: 'var(--text-sm)', width: '100%', resize: 'vertical', fontStyle: 'italic' }}
                                                    autoFocus
                                                    placeholder="Dialogue line…"
                                                />
                                                <input
                                                    className="input"
                                                    value={voiceCtxDraft}
                                                    onChange={e => setVoiceCtxDraft(e.target.value)}
                                                    style={{ fontSize: 'var(--text-xs)', width: '100%', marginTop: 4 }}
                                                    placeholder="Context note…"
                                                />
                                                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                                                    <button className="btn btn-primary btn-sm" onClick={() => {
                                                        const updated = [...voiceSamples];
                                                        updated[idx] = { line: voiceLineDraft, context: voiceCtxDraft };
                                                        setVoiceSamples(updated);
                                                        setEditingVoiceIdx(null);
                                                        if (selectedEntity) updateEntity.mutate({ id: selectedEntity.id, body: { properties: { ...selectedEntity.properties, voice_samples: updated } } });
                                                    }} style={{ padding: '2px 8px', fontSize: 11 }}>Save</button>
                                                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingVoiceIdx(null)} style={{ padding: '2px 8px', fontSize: 11 }}>Cancel</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <div style={{ padding: 'var(--space-2)', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-md)', fontStyle: 'italic', fontSize: 'var(--text-sm)', borderLeft: '3px solid rgba(139,92,246,0.6)', cursor: 'pointer' }} onClick={() => { setEditingVoiceIdx(idx); setVoiceLineDraft(sample.line); setVoiceCtxDraft(sample.context); }} title="Click to edit">
                                                    "{sample.line}"
                                                </div>
                                                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 2, display: 'block', cursor: 'pointer' }} onClick={() => { setEditingVoiceIdx(idx); setVoiceLineDraft(sample.line); setVoiceCtxDraft(sample.context); }}>{sample.context}</span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

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

                        {/* Chapter Assembler (chapter entities only — Feature 5) */}
                        {selectedEntity?.entity_type === 'chapter' && (() => {
                            const allEntities = allEntitiesData?.entities || [];
                            const allRels = (relationshipsData?.relationships || []) as Relationship[];
                            const connectedIds = allRels
                                .filter(r => r.from_entity_id === selectedEntity.id || r.to_entity_id === selectedEntity.id)
                                .map(r => r.from_entity_id === selectedEntity.id ? r.to_entity_id : r.from_entity_id);
                            const connectedEvents = allEntities.filter(e => connectedIds.includes(e.id) && e.entity_type === 'event');
                            const savedBlueprint = (selectedEntity.properties as Record<string, unknown>)?.chapter_blueprint as ChapterBlueprint | undefined;
                            const bp = chapterBlueprint || savedBlueprint;
                            const estWords = connectedEvents.length * 2000;
                            const draftedWords = connectedEvents.reduce((sum, e) => {
                                const dt = (e.properties as Record<string, unknown>)?.draft_text as string | undefined;
                                return sum + (dt ? dt.split(/\s+/).filter(Boolean).length : 0);
                            }, 0);

                            return (
                                <div style={{
                                    marginTop: 'var(--space-2)', padding: 'var(--space-3)',
                                    background: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(251,146,60,0.06))',
                                    borderRadius: 'var(--radius-lg)', border: '1px solid rgba(245,158,11,0.2)',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                                        <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                                            📖 Chapter Assembly
                                        </h4>
                                        <button
                                            className="btn btn-primary btn-sm"
                                            onClick={handleAssembleChapter}
                                            disabled={chapterLoading || connectedEvents.length === 0}
                                            style={{ gap: 4, fontSize: 'var(--text-xs)' }}
                                        >
                                            {chapterLoading ? <><div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> Assembling...</> : '🔮 Assemble'}
                                        </button>
                                    </div>

                                    {/* Connected events summary */}
                                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
                                        <span style={{ fontWeight: 600 }}>{connectedEvents.length}</span> scenes linked
                                        {' · '}
                                        <span style={{ fontWeight: 600 }}>~{estWords.toLocaleString()}</span>w estimated
                                        {draftedWords > 0 && <>{' · '}<span style={{ color: 'var(--accent)', fontWeight: 600 }}>{draftedWords.toLocaleString()}</span>w drafted</>}
                                    </div>

                                    {/* Progress bar */}
                                    {estWords > 0 && (
                                        <div style={{ height: 4, borderRadius: 2, background: 'rgba(100,116,139,0.2)', marginBottom: 'var(--space-2)', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${Math.min(100, (draftedWords / estWords) * 100)}%`, background: 'var(--accent)', borderRadius: 2, transition: 'width 0.3s ease' }} />
                                        </div>
                                    )}

                                    {connectedEvents.length === 0 && (
                                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', padding: 'var(--space-2)', textAlign: 'center', background: 'rgba(0,0,0,0.15)', borderRadius: 'var(--radius-md)' }}>
                                            Link event entities to this chapter using relationships to begin
                                        </div>
                                    )}

                                    {chapterError && (
                                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--error)', padding: 'var(--space-1)', background: 'rgba(239,68,68,0.1)', borderRadius: 'var(--radius-md)', marginTop: 4 }}>
                                            {chapterError}
                                        </div>
                                    )}

                                    {/* Blueprint display */}
                                    {bp && (
                                        <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-xs)' }}>
                                            <div style={{ padding: 'var(--space-2)', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-1)' }}>
                                                <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Synopsis</div>
                                                <div style={{ color: 'var(--text-primary)', lineHeight: 1.5 }}>{bp.synopsis}</div>
                                            </div>

                                            {bp.openingHook && (
                                                <div style={{ padding: 'var(--space-2)', background: 'rgba(34,197,94,0.08)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-1)', borderLeft: '3px solid rgba(34,197,94,0.5)' }}>
                                                    <div style={{ fontWeight: 600, color: '#22c55e', marginBottom: 2 }}>🎣 Opening Hook</div>
                                                    <div style={{ fontStyle: 'italic', color: 'var(--text-primary)' }}>"{bp.openingHook}"</div>
                                                </div>
                                            )}

                                            {bp.structure && bp.structure.length > 0 && (
                                                <div style={{ padding: 'var(--space-2)', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-1)' }}>
                                                    <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Structure</div>
                                                    {bp.structure.map((s, i) => (
                                                        <div key={i} style={{ padding: '4px 0', borderBottom: i < bp.structure.length - 1 ? '1px solid rgba(100,116,139,0.1)' : 'none', display: 'flex', gap: 8, alignItems: 'baseline' }}>
                                                            <span style={{
                                                                padding: '1px 6px', borderRadius: 'var(--radius-full)', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase',
                                                                background: s.beat === 'climax' ? 'rgba(239,68,68,0.2)' : s.beat === 'rising' ? 'rgba(34,197,94,0.2)' : s.beat === 'resolution' ? 'rgba(99,102,241,0.2)' : 'rgba(100,116,139,0.2)',
                                                                color: s.beat === 'climax' ? '#ef4444' : s.beat === 'rising' ? '#22c55e' : s.beat === 'resolution' ? '#6366f1' : '#94a3b8',
                                                            }}>{s.beat}</span>
                                                            <span style={{ color: 'var(--text-primary)' }}>{s.scene}</span>
                                                            <span style={{ marginLeft: 'auto', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>{s.emotionalNote}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {bp.closingHook && (
                                                <div style={{ padding: 'var(--space-2)', background: 'rgba(245,158,11,0.08)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-1)', borderLeft: '3px solid rgba(245,158,11,0.5)' }}>
                                                    <div style={{ fontWeight: 600, color: '#f59e0b', marginBottom: 2 }}>🔗 Closing Hook</div>
                                                    <div style={{ fontStyle: 'italic', color: 'var(--text-primary)' }}>"{bp.closingHook}"</div>
                                                </div>
                                            )}

                                            {bp.tensions && bp.tensions.length > 0 && (
                                                <div style={{ padding: 'var(--space-2)', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-1)' }}>
                                                    <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>⚡ Unresolved Tensions</div>
                                                    {bp.tensions.map((t, i) => (
                                                        <div key={i} style={{ padding: '2px 0', color: 'var(--text-primary)' }}>• {t}</div>
                                                    ))}
                                                </div>
                                            )}

                                            {bp.characterArcs && bp.characterArcs.length > 0 && (
                                                <div style={{ padding: 'var(--space-2)', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-md)' }}>
                                                    <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>👤 Character Arcs</div>
                                                    {bp.characterArcs.map((ca, i) => (
                                                        <div key={i} style={{ padding: '2px 0', color: 'var(--text-primary)' }}>
                                                            <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{ca.character}</span>: {ca.arc}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
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
            )}

            {/* Ripple Effect Preview Modal (E3-US5) */}
            {showRippleModal && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 9999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                }}>
                    <div style={{
                        background: 'var(--bg-primary)', border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-lg)', maxWidth: 620, width: '90%',
                        maxHeight: '80vh', display: 'flex', flexDirection: 'column',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                    }}>
                        {/* Header */}
                        <div style={{
                            padding: '16px 20px', borderBottom: '1px solid var(--border)',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 20 }}>⚡</span>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: 'var(--text-base)' }}>Ripple Effect Preview</div>
                                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                                        Editing: {selectedEntity?.name}
                                    </div>
                                </div>
                            </div>
                            <button className="btn btn-ghost btn-sm" onClick={handleRippleCancel}
                                style={{ fontSize: 16, padding: '2px 6px' }}>✕</button>
                        </div>

                        {/* Content */}
                        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
                            {/* Description diff */}
                            <div style={{
                                marginBottom: 16, padding: 12, borderRadius: 'var(--radius-md)',
                                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                                fontSize: 'var(--text-xs)',
                            }}>
                                <div style={{ color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 600 }}>Description Change:</div>
                                <div style={{ color: 'rgba(239,68,68,0.8)', textDecoration: 'line-through', marginBottom: 4 }}>
                                    {selectedEntity?.description?.slice(0, 150) || '(empty)'}{(selectedEntity?.description?.length || 0) > 150 ? '...' : ''}
                                </div>
                                <div style={{ color: 'rgba(16,185,129,0.9)' }}>
                                    {editDescVal.slice(0, 150)}{editDescVal.length > 150 ? '...' : ''}
                                </div>
                            </div>

                            {/* Loading state */}
                            {isAnalyzingRipple && (
                                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                                    <div className="spinner" style={{ width: 28, height: 28, borderWidth: 2.5, margin: '0 auto 12px' }} />
                                    <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                                        Analyzing cascading effects...
                                    </div>
                                    <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', marginTop: 4 }}>
                                        Checking related entities for potential impacts
                                    </div>
                                </div>
                            )}

                            {/* Error state */}
                            {rippleError && (
                                <div style={{
                                    padding: 12, borderRadius: 'var(--radius-md)',
                                    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                                    color: 'var(--error)', fontSize: 'var(--text-sm)', marginBottom: 12,
                                }}>
                                    ⚠️ {rippleError}
                                </div>
                            )}

                            {/* Results */}
                            {rippleReport && !isAnalyzingRipple && (
                                <>
                                    {rippleReport.effects.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)' }}>
                                            <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                                            <div style={{ fontWeight: 600 }}>No Cascading Effects Detected</div>
                                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 4 }}>
                                                This change appears safe for related entities.
                                            </div>
                                        </div>
                                    ) : (
                                        <div>
                                            <div style={{
                                                fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)',
                                                marginBottom: 8, fontWeight: 600,
                                            }}>
                                                {rippleReport.effects.length} predicted impact{rippleReport.effects.length !== 1 ? 's' : ''}:
                                            </div>
                                            {rippleReport.effects.map((effect) => (
                                                <div key={effect.id} style={{
                                                    padding: '10px 12px', marginBottom: 8,
                                                    borderRadius: 'var(--radius-md)',
                                                    background: effect.impactLevel === 'high' ? 'rgba(239,68,68,0.06)'
                                                        : effect.impactLevel === 'medium' ? 'rgba(234,179,8,0.06)'
                                                            : 'rgba(16,185,129,0.06)',
                                                    border: `1px solid ${effect.impactLevel === 'high' ? 'rgba(239,68,68,0.2)'
                                                        : effect.impactLevel === 'medium' ? 'rgba(234,179,8,0.2)'
                                                            : 'rgba(16,185,129,0.2)'}`,
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                                        <span>{IMPACT_ICONS[effect.impactLevel]}</span>
                                                        <span style={{
                                                            fontWeight: 600, fontSize: 'var(--text-sm)',
                                                            color: 'var(--text-primary)',
                                                        }}>
                                                            {effect.affectedEntityName}
                                                        </span>
                                                        <span style={{
                                                            fontSize: 10, padding: '1px 6px',
                                                            borderRadius: 'var(--radius-sm)',
                                                            background: 'var(--bg-tertiary)',
                                                            color: 'var(--text-tertiary)', textTransform: 'uppercase',
                                                        }}>
                                                            {effect.impactLevel}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: 4 }}>
                                                        {effect.description}
                                                    </div>
                                                    {effect.suggestedAdjustment && (
                                                        <div style={{
                                                            fontSize: 'var(--text-xs)', color: 'var(--accent)',
                                                            display: 'flex', alignItems: 'flex-start', gap: 4, marginTop: 4,
                                                        }}>
                                                            <span>💡</span> {effect.suggestedAdjustment}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Actions */}
                        <div style={{
                            padding: '12px 20px', borderTop: '1px solid var(--border)',
                            display: 'flex', justifyContent: 'flex-end', gap: 8,
                        }}>
                            <button className="btn btn-secondary btn-sm" onClick={handleRippleCancel}
                                disabled={isAnalyzingRipple}>
                                Cancel
                            </button>
                            <button className="btn btn-primary btn-sm" onClick={handleRippleProceed}
                                disabled={isAnalyzingRipple}
                                style={{
                                    background: rippleReport && rippleReport.effects.length > 0
                                        ? 'rgba(234,179,8,0.9)' : 'var(--accent)',
                                    borderColor: rippleReport && rippleReport.effects.length > 0
                                        ? 'rgba(234,179,8,1)' : 'var(--accent)',
                                }}>
                                {isAnalyzingRipple ? 'Analyzing...' : rippleReport && rippleReport.effects.length > 0
                                    ? '⚠️ Save Anyway' : '✅ Save'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Create Relationship Modal (Sprint 4) ─── */}
            {showCreateRelModal && (
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
            )}

            {/* ─── Global Search Overlay (⌘K) ──────────────── */}
            {globalSearchOpen && (
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
            )}

            {/* Narrative Sequence Modal */}
            {showSequenceModal && (
                <div className="modal-overlay" onClick={() => setShowSequenceModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, maxHeight: '80vh', overflow: 'auto' }}>
                        <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            📖 Narrative Sequence
                            <button className="btn btn-ghost btn-sm" onClick={() => setShowSequenceModal(false)} style={{ marginLeft: 'auto' }}>✕</button>
                        </h2>
                        {sequenceLoading && (
                            <div style={{ textAlign: 'center', padding: 'var(--space-4)' }}>
                                <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3, margin: '0 auto' }} />
                                <p style={{ marginTop: 'var(--space-2)', color: 'var(--text-secondary)' }}>AI is analyzing event order...</p>
                            </div>
                        )}
                        {sequenceError && (
                            <div style={{ padding: 'var(--space-2)', background: 'var(--danger-muted)', borderRadius: 'var(--radius-md)', color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>
                                ❌ {sequenceError}
                            </div>
                        )}
                        {sequenceSteps.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                                {sequenceSteps.sort((a, b) => a.chapterNumber - b.chapterNumber).map((step, i) => (
                                    <div key={i} style={{
                                        display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start',
                                        padding: 'var(--space-2)', background: 'var(--bg-secondary)',
                                        borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
                                    }}>
                                        <div style={{
                                            minWidth: 36, height: 36, borderRadius: '50%',
                                            background: 'var(--accent)', color: '#000', fontWeight: 700,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 'var(--text-sm)',
                                        }}>{step.chapterNumber}</div>
                                        <div style={{ flex: 1 }}>
                                            <p style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>⚡ {step.entityName}</p>
                                            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 2 }}>{step.reasoning}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {!sequenceLoading && sequenceSteps.length === 0 && !sequenceError && (
                            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 'var(--space-3)' }}>No events to sequence. Add some event entities first.</p>
                        )}
                    </div>
                </div>
            )}

            {/* Missing Scenes Modal */}
            {showGapsModal && (
                <div className="modal-overlay" onClick={() => setShowGapsModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, maxHeight: '80vh', overflow: 'auto' }}>
                        <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            🔍 Missing Scenes
                            <button className="btn btn-ghost btn-sm" onClick={() => setShowGapsModal(false)} style={{ marginLeft: 'auto' }}>✕</button>
                        </h2>
                        {gapLoading && (
                            <div style={{ textAlign: 'center', padding: 'var(--space-4)' }}>
                                <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3, margin: '0 auto' }} />
                                <p style={{ marginTop: 'var(--space-2)', color: 'var(--text-secondary)' }}>AI is scanning for narrative gaps...</p>
                            </div>
                        )}
                        {gapError && (
                            <div style={{ padding: 'var(--space-2)', background: 'var(--danger-muted)', borderRadius: 'var(--radius-md)', color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>
                                ❌ {gapError}
                            </div>
                        )}
                        {gapScenes.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                                {gapScenes.map(gap => (
                                    <div key={gap.id} style={{
                                        padding: 'var(--space-2)', background: 'var(--bg-secondary)',
                                        borderRadius: 'var(--radius-md)', border: '1px dashed rgba(234,179,8,0.4)',
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <p style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--warning)' }}>⚡ {gap.title}</p>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                <button className="btn btn-primary btn-sm" onClick={() => createEventFromGap(gap)} style={{ padding: '2px 8px', fontSize: 11 }}>✅ Create</button>
                                                <button className="btn btn-ghost btn-sm" onClick={() => setGapScenes(prev => prev.filter(g => g.id !== gap.id))} style={{ padding: '2px 6px', fontSize: 11 }}>✕</button>
                                            </div>
                                        </div>
                                        <p style={{ fontSize: 'var(--text-sm)', margin: '4px 0', lineHeight: 1.4 }}>{gap.description}</p>
                                        <div style={{ display: 'flex', gap: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                                            {gap.afterEvent && <span>After: <strong>{gap.afterEvent}</strong></span>}
                                            {gap.beforeEvent && <span>Before: <strong>{gap.beforeEvent}</strong></span>}
                                        </div>
                                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 4, fontStyle: 'italic' }}>{gap.reason}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                        {!gapLoading && gapScenes.length === 0 && !gapError && (
                            <p style={{ textAlign: 'center', color: 'var(--success)', padding: 'var(--space-3)' }}>✅ No narrative gaps detected! Your story is well-connected.</p>
                        )}
                    </div>
                </div>
            )}

            {/* POV Analysis Results Panel */}
            {povIssues.length > 0 && (
                <div className="modal-overlay" onClick={() => setPovIssues([])}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 550, maxHeight: '80vh', overflow: 'auto' }}>
                        <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            👁️ POV Balance Analysis
                            <button className="btn btn-ghost btn-sm" onClick={() => setPovIssues([])} style={{ marginLeft: 'auto' }}>✕</button>
                        </h2>
                        {/* Distribution chart */}
                        {Object.keys(povDistribution).length > 0 && (
                            <div style={{ marginBottom: 'var(--space-3)' }}>
                                <h4 style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-1)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>POV Distribution</h4>
                                {Object.entries(povDistribution).sort((a, b) => b[1] - a[1]).map(([char, count]) => {
                                    const total = Object.values(povDistribution).reduce((a, b) => a + b, 0);
                                    const pct = Math.round((count / total) * 100);
                                    return (
                                        <div key={char} style={{ marginBottom: 4 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', marginBottom: 2 }}>
                                                <span style={{ fontWeight: 600 }}>{char}</span>
                                                <span style={{ color: 'var(--text-tertiary)' }}>{count} scenes ({pct}%)</span>
                                            </div>
                                            <div style={{ height: 6, borderRadius: 3, background: 'rgba(100,116,139,0.2)', overflow: 'hidden' }}>
                                                <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width 0.3s ease' }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        {/* Issues list */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                            {povIssues.map(issue => (
                                <div key={issue.id} style={{
                                    padding: 'var(--space-2)', borderRadius: 'var(--radius-md)',
                                    background: issue.severity === 'error' ? 'rgba(239,68,68,0.08)' : issue.severity === 'warning' ? 'rgba(245,158,11,0.08)' : 'rgba(99,102,241,0.08)',
                                    border: `1px solid ${issue.severity === 'error' ? 'rgba(239,68,68,0.2)' : issue.severity === 'warning' ? 'rgba(245,158,11,0.2)' : 'rgba(99,102,241,0.15)'}`,
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                        <span>{issue.severity === 'error' ? '🔴' : issue.severity === 'warning' ? '🟡' : '💡'}</span>
                                        <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{issue.title}</span>
                                    </div>
                                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>{issue.description}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Temporal Gaps Results Panel */}
            {temporalGaps.length > 0 && (
                <div className="modal-overlay" onClick={() => setTemporalGaps([])}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 550, maxHeight: '80vh', overflow: 'auto' }}>
                        <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            🕐 Temporal Gaps
                            <button className="btn btn-ghost btn-sm" onClick={() => setTemporalGaps([])} style={{ marginLeft: 'auto' }}>✕</button>
                        </h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                            {temporalGaps.map(gap => (
                                <div key={gap.id} style={{
                                    padding: 'var(--space-2)', borderRadius: 'var(--radius-md)',
                                    background: gap.warning ? 'rgba(245,158,11,0.08)' : 'var(--bg-secondary)',
                                    border: `1px solid ${gap.warning ? 'rgba(245,158,11,0.2)' : 'var(--border)'}`,
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>{gap.gapLabel}</span>
                                        {gap.warning && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)' }}>⚠️</span>}
                                    </div>
                                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ fontWeight: 600 }}>{gap.fromEvent}</span>
                                        <span style={{ color: 'var(--text-tertiary)' }}>→</span>
                                        <span style={{ fontWeight: 600 }}>{gap.toEvent}</span>
                                    </div>
                                    {gap.warning && (
                                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)', marginTop: 4, fontStyle: 'italic' }}>{gap.warning}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
