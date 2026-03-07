import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { extractEntitiesFromPremise, hasConfiguredProvider, type ExtractionResult, type ExtractedEntity } from '../services/aiService';

const ENTITY_ICONS: Record<string, string> = {
    character: '👤',
    timeline: '📅',
    event: '⚡',
    location: '📍',
    theme: '💭',
    arc: '📐',
    note: '📝',
};

interface StoryIntakeProps {
    projectId: string;
    premise: string;
    onComplete: () => void;
    onSkip: () => void;
}

type IntakePhase = 'extracting' | 'review' | 'creating' | 'done' | 'error';

export default function StoryIntake({ projectId, premise, onComplete, onSkip }: StoryIntakeProps) {
    const queryClient = useQueryClient();
    const [phase, setPhase] = useState<IntakePhase>('extracting');
    const [result, setResult] = useState<ExtractionResult | null>(null);
    const [selectedEntities, setSelectedEntities] = useState<Set<number>>(new Set());
    const [error, setError] = useState('');
    const [progress, setProgress] = useState(0);

    // Auto-extract on mount
    useEffect(() => {
        if (!hasConfiguredProvider()) {
            setError('No AI provider configured. Go to Settings to add an API key, then try again.');
            setPhase('error');
            return;
        }

        extractEntitiesFromPremise(premise)
            .then(r => {
                setResult(r);
                // Select all by default
                setSelectedEntities(new Set(r.entities.map((_, i) => i)));
                setPhase('review');
            })
            .catch(err => {
                setError(err.message);
                setPhase('error');
            });
    }, [premise]);

    // Batch create entities
    const createEntities = useMutation({
        mutationFn: async () => {
            if (!result) return;
            setPhase('creating');

            const selected = result.entities.filter((_, i) => selectedEntities.has(i));
            const entityMap = new Map<string, string>(); // name → id

            // Create entities one by one
            for (let i = 0; i < selected.length; i++) {
                const ent = selected[i];
                setProgress(Math.round(((i + 1) / selected.length) * 100));

                const { entity } = await api.createEntity(projectId, {
                    entity_type: ent.entity_type,
                    name: ent.name,
                    description: ent.description,
                    properties: ent.properties || {},
                });
                entityMap.set(ent.name, entity.id);
            }

            // Create relationships
            if (result.relationships) {
                for (const rel of result.relationships) {
                    const fromId = entityMap.get(rel.from_name);
                    const toId = entityMap.get(rel.to_name);
                    if (fromId && toId) {
                        try {
                            await api.createRelationship(projectId, {
                                from_entity_id: fromId,
                                to_entity_id: toId,
                                relationship_type: rel.relationship_type,
                                label: rel.label,
                            });
                        } catch {
                            // Non-critical: skip failed relationships
                        }
                    }
                }
            }

            return selected.length;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['entities'] });
            setPhase('done');
            setTimeout(() => onComplete(), 1500);
        },
        onError: (err: Error) => {
            setError(err.message);
            setPhase('error');
        },
    });

    const toggleEntity = (idx: number) => {
        const next = new Set(selectedEntities);
        if (next.has(idx)) next.delete(idx);
        else next.add(idx);
        setSelectedEntities(next);
    };

    const groupedEntities = result?.entities.reduce<Record<string, { ent: ExtractedEntity; idx: number }[]>>((acc, ent, idx) => {
        if (!acc[ent.entity_type]) acc[ent.entity_type] = [];
        acc[ent.entity_type].push({ ent, idx });
        return acc;
    }, {}) || {};

    // ─── Extracting phase ──────────────────────────────────
    if (phase === 'extracting') {
        return (
            <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', padding: 'var(--space-4)', minHeight: 300,
            }}>
                <div className="spinner" style={{ width: 40, height: 40, marginBottom: 16 }} />
                <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 8 }}>
                    Analyzing your story premise...
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', textAlign: 'center', maxWidth: 400 }}>
                    Chronos is reading your premise and extracting characters, events, timelines, and relationships.
                </p>
            </div>
        );
    }

    // ─── Error phase ───────────────────────────────────────
    if (phase === 'error') {
        return (
            <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: 'var(--space-4)', minHeight: 200,
            }}>
                <span style={{ fontSize: 40, marginBottom: 12 }}>⚠️</span>
                <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 8 }}>
                    Extraction failed
                </h3>
                <p style={{ color: '#ef4444', fontSize: 'var(--text-sm)', textAlign: 'center', maxWidth: 400, marginBottom: 16 }}>
                    {error}
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary" onClick={onSkip}>
                        Skip — Start Empty
                    </button>
                    <button className="btn btn-primary" onClick={() => {
                        setPhase('extracting');
                        setError('');
                        extractEntitiesFromPremise(premise)
                            .then(r => { setResult(r); setSelectedEntities(new Set(r.entities.map((_, i) => i))); setPhase('review'); })
                            .catch(err => { setError(err.message); setPhase('error'); });
                    }}>
                        🔄 Retry
                    </button>
                </div>
            </div>
        );
    }

    // ─── Creating phase ────────────────────────────────────
    if (phase === 'creating') {
        return (
            <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', padding: 'var(--space-4)', minHeight: 300,
            }}>
                <div style={{
                    width: 200, height: 6, borderRadius: 3, background: 'var(--border)',
                    marginBottom: 16, overflow: 'hidden',
                }}>
                    <div style={{
                        height: '100%', borderRadius: 3, background: 'var(--accent)',
                        width: `${progress}%`, transition: 'width 0.3s',
                    }} />
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                    Creating entities... {progress}%
                </p>
            </div>
        );
    }

    // ─── Done phase ────────────────────────────────────────
    if (phase === 'done') {
        return (
            <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', padding: 'var(--space-4)', minHeight: 200,
            }}>
                <span style={{ fontSize: 48, marginBottom: 12 }}>🎉</span>
                <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>
                    Your story world is ready!
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginTop: 4 }}>
                    {selectedEntities.size} entities created. Redirecting to workspace...
                </p>
            </div>
        );
    }

    // ─── Review phase ──────────────────────────────────────
    return (
        <div style={{ padding: 'var(--space-2)' }}>
            {result?.summary && (
                <div style={{
                    padding: '10px 14px', borderRadius: 'var(--radius-md)',
                    background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)',
                    marginBottom: 'var(--space-3)', fontSize: 'var(--text-sm)',
                    color: 'var(--text-secondary)', lineHeight: 1.5,
                }}>
                    💡 {result.summary}
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                    Extracted {result?.entities.length || 0} entities
                </span>
                <button
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: 'var(--text-xs)' }}
                    onClick={() => {
                        if (selectedEntities.size === (result?.entities.length || 0)) {
                            setSelectedEntities(new Set());
                        } else {
                            setSelectedEntities(new Set(result?.entities.map((_, i) => i) || []));
                        }
                    }}
                >
                    {selectedEntities.size === (result?.entities.length || 0) ? 'Deselect All' : 'Select All'}
                </button>
            </div>

            <div style={{ maxHeight: 350, overflowY: 'auto', marginBottom: 'var(--space-3)' }}>
                {Object.entries(groupedEntities).map(([type, items]) => (
                    <div key={type} style={{ marginBottom: 12 }}>
                        <div style={{
                            fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-tertiary)',
                            textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6,
                        }}>
                            {ENTITY_ICONS[type] || '📦'} {type}s ({items.length})
                        </div>
                        {items.map(({ ent, idx }) => (
                            <label
                                key={idx}
                                style={{
                                    display: 'flex', alignItems: 'flex-start', gap: 10,
                                    padding: '8px 10px', borderRadius: 'var(--radius-sm)',
                                    background: selectedEntities.has(idx)
                                        ? 'rgba(99,102,241,0.06)' : 'transparent',
                                    cursor: 'pointer', marginBottom: 2,
                                    transition: 'background 0.15s',
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedEntities.has(idx)}
                                    onChange={() => toggleEntity(idx)}
                                    style={{ marginTop: 3 }}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
                                        {ent.name}
                                    </div>
                                    <div style={{
                                        fontSize: 'var(--text-xs)', color: 'var(--text-secondary)',
                                        lineHeight: 1.4, marginTop: 2,
                                    }}>
                                        {ent.description}
                                    </div>
                                </div>
                            </label>
                        ))}
                    </div>
                ))}
            </div>

            {result?.relationships && result.relationships.length > 0 && (
                <div style={{
                    fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 12,
                    padding: '6px 10px', background: 'rgba(255,255,255,0.02)',
                    borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                }}>
                    🔗 {result.relationships.length} relationship{result.relationships.length !== 1 ? 's' : ''} will also be created
                </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={onSkip}>
                    Skip
                </button>
                <button
                    className="btn btn-primary"
                    onClick={() => createEntities.mutate()}
                    disabled={selectedEntities.size === 0}
                >
                    ✨ Create {selectedEntities.size} Entities
                </button>
            </div>
        </div>
    );
}
