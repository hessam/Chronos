import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { ProseDraft, Entity, Relationship } from '../store/appStore';
import { buildSmartContext, compileStoryState } from '../services/contextBuilder';
import { generateAgenticProse } from '../services/aiService';

interface ProseTabProps {
    entityId: string;
    projectId: string;
    entityName: string;
    initialDraft?: string;
    onDraftChange?: (text: string) => void;
}

export default function ProseTab({ entityId, projectId, entityName, initialDraft, onDraftChange }: ProseTabProps) {
    const queryClient = useQueryClient();
    const [draftText, setDraftText] = useState(initialDraft || '');
    const [isExpanded, setIsExpanded] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);

    const { data: draftsData } = useQuery({
        queryKey: ['prose_drafts', entityId],
        queryFn: () => api.getProseDrafts(entityId),
        enabled: !!entityId,
    });

    const saveDraft = useMutation({
        mutationFn: ({ content, ai_feedback }: { content: string, ai_feedback?: string }) => api.createProseDraft(projectId, {
            entity_id: entityId,
            content,
            word_count: content.split(/\s+/).filter(Boolean).length,
            status: 'draft',
            ai_feedback,
        }),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['prose_drafts', entityId] });
            setDraftText(data.draft.content);
        },
    });

    const updateStatus = useMutation({
        mutationFn: ({ id, status }: { id: string; status: ProseDraft['status'] }) =>
            api.updateProseDraft(id, { status }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['prose_drafts', entityId] });
        },
    });

    const drafts = draftsData?.drafts || [];
    const latestDraft = drafts[0];
    const wordCount = draftText.split(/\s+/).filter(Boolean).length;

    const handleSave = () => {
        if (!draftText.trim()) return;
        saveDraft.mutate({ content: draftText });
        onDraftChange?.(draftText);
    };

    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            const entitiesData = queryClient.getQueryData<{ entities: Entity[] }>(['entities', projectId, 'all']);
            const relsData = queryClient.getQueryData<{ relationships: Relationship[] }>(['relationships', projectId]);

            if (!entitiesData || !relsData) {
                alert("Please wait for project data to load...");
                return;
            }

            const currentEvent = entitiesData.entities.find(e => e.id === entityId);
            if (!currentEvent) throw new Error("Event not found");

            const contextReport = buildSmartContext({
                currentEvent,
                allEntities: entitiesData.entities,
                allRelationships: relsData.relationships,
                causalChainDepth: 2,
                characterHistoryDepth: 5,
                includeScientificConcepts: false
            });

            const beats = (currentEvent.properties.scene_beats as { type: string; description: string }[]) || [];

            const storyState = compileStoryState({
                currentEvent,
                allEntities: entitiesData.entities,
                allRelationships: relsData.relationships,
                causalChainDepth: 2,
                characterHistoryDepth: 5,
                includeScientificConcepts: false,
                contextReport,
                currentBeats: beats
            });

            const { profile } = await api.getStyleProfile(projectId);
            const styleProfile = profile?.preferences as Record<string, string | number> | undefined;

            const result = await generateAgenticProse({
                instruction: draftText ? "Continue the scene." : "Write the scene from the beginning.",
                storyState,
                currentDraft: draftText,
                styleProfile,
            });

            saveDraft.mutate({
                content: result.diff.newText,
                ai_feedback: result.selfCritique
            });
            onDraftChange?.(result.diff.newText);

        } catch (err) {
            console.error(err);
            alert("Generation failed: " + (err as Error).message);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div>
            {/* Section header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 0', border: 'none', background: 'none', cursor: 'pointer',
                    color: 'var(--text-primary)', fontSize: 'var(--text-sm)', fontWeight: 600,
                }}
            >
                <span>✍️ Prose Draft</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {latestDraft && (
                        <span style={{
                            fontSize: 9, padding: '1px 6px', borderRadius: 'var(--radius-full)',
                            background: latestDraft.status === 'accepted' ? 'rgba(16,185,129,0.15)' : 'rgba(99,102,241,0.1)',
                            color: latestDraft.status === 'accepted' ? '#10b981' : 'var(--accent)',
                            fontWeight: 600,
                        }}>
                            v{latestDraft.version} · {latestDraft.status}
                        </span>
                    )}
                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                        {wordCount > 0 ? `${wordCount} words` : ''}
                    </span>
                    <span style={{ fontSize: 10 }}>{isExpanded ? '▾' : '▸'}</span>
                </div>
            </button>

            {isExpanded && (
                <div style={{ marginTop: 4 }}>
                    {/* Editor */}
                    <textarea
                        className="textarea"
                        value={draftText}
                        onChange={(e) => setDraftText(e.target.value)}
                        placeholder={`Write the prose for "${entityName}"...`}
                        rows={8}
                        style={{
                            fontSize: 'var(--text-sm)',
                            lineHeight: 1.7,
                            fontFamily: "'Georgia', 'Crimson Text', serif",
                            resize: 'vertical',
                            minHeight: 120,
                        }}
                    />

                    {/* Action bar */}
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        marginTop: 6, gap: 8,
                    }}>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                            {wordCount} words · {drafts.length} draft{drafts.length !== 1 ? 's' : ''} saved
                        </span>
                        <div style={{ display: 'flex', gap: 4 }}>
                            <button
                                className="btn btn-primary btn-sm"
                                style={{ fontSize: 'var(--text-xs)', padding: '2px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
                                onClick={handleGenerate}
                                disabled={isGenerating}
                            >
                                {isGenerating ? (
                                    <>
                                        <div className="spinner" style={{ width: 10, height: 10, borderWidth: 2 }}></div>
                                        Generating...
                                    </>
                                ) : '✨ Generate Prose'}
                            </button>
                            <button
                                className="btn btn-secondary btn-sm"
                                style={{ fontSize: 'var(--text-xs)', padding: '2px 10px' }}
                                onClick={handleSave}
                                disabled={saveDraft.isPending || !draftText.trim()}
                            >
                                {saveDraft.isPending ? 'Saving...' : '💾 Save Draft'}
                            </button>
                        </div>
                    </div>

                    {/* Draft history */}
                    {drafts.length > 0 && (
                        <div style={{ marginTop: 12 }}>
                            <div style={{
                                fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)',
                                marginBottom: 6,
                            }}>
                                Draft History
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {drafts.slice(0, 5).map(draft => (
                                    <div
                                        key={draft.id}
                                        style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '6px 10px',
                                            borderRadius: 'var(--radius-sm)',
                                            background: 'rgba(255,255,255,0.02)',
                                            border: '1px solid var(--border)',
                                            fontSize: 'var(--text-xs)',
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ fontWeight: 600 }}>v{draft.version}</span>
                                            <span style={{ color: 'var(--text-tertiary)' }}>
                                                {draft.word_count} words
                                            </span>
                                            <span style={{
                                                fontSize: 9, padding: '0px 5px', borderRadius: 'var(--radius-full)',
                                                background: draft.status === 'accepted' ? 'rgba(16,185,129,0.15)'
                                                    : draft.status === 'rejected' ? 'rgba(239,68,68,0.15)'
                                                        : 'rgba(99,102,241,0.1)',
                                                color: draft.status === 'accepted' ? '#10b981'
                                                    : draft.status === 'rejected' ? '#ef4444'
                                                        : 'var(--accent)',
                                                fontWeight: 600,
                                            }}>
                                                {draft.status}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', gap: 2 }}>
                                            <button
                                                className="btn btn-ghost btn-sm"
                                                style={{ fontSize: 10, padding: '0 4px', height: 'auto' }}
                                                onClick={() => setDraftText(draft.content)}
                                                title="Load this version"
                                            >
                                                ↩
                                            </button>
                                            {draft.status !== 'accepted' && (
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    style={{ fontSize: 10, padding: '0 4px', height: 'auto', color: '#10b981' }}
                                                    onClick={() => {
                                                        updateStatus.mutate({ id: draft.id, status: 'accepted' });
                                                        // Run style analysis in the background
                                                        setTimeout(async () => {
                                                            try {
                                                                // Fetch existing profile first
                                                                const { profile } = await api.getStyleProfile(projectId);
                                                                const existingPrefs = profile?.preferences as Record<string, string | number> || {};

                                                                // Learn from the new text
                                                                const { analyzeStyleFromProse } = await import('../services/aiService');
                                                                const result = await analyzeStyleFromProse(draft.content, existingPrefs);

                                                                // Save back to DB
                                                                await api.upsertStyleProfile(projectId, result.preferences);
                                                                console.log('✅ Style profile updated based on accepted draft');
                                                            } catch (err) {
                                                                console.error('Failed to analyze style:', err);
                                                            }
                                                        }, 500);
                                                    }}
                                                    title="Accept"
                                                >
                                                    ✓
                                                </button>
                                            )}
                                            {draft.status !== 'rejected' && (
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    style={{ fontSize: 10, padding: '0 4px', height: 'auto', color: '#ef4444' }}
                                                    onClick={() => updateStatus.mutate({ id: draft.id, status: 'rejected' })}
                                                    title="Reject"
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
