/**
 * RipplePanel (Ticket B-06)
 * Inline collapsible panel shown in the Event detail view.
 * When the user edits an event's description, this panel analyses downstream effects
 * on related entities using the existing `analyzeRippleEffects` AI function.
 */
import { useState, useCallback } from 'react';
import {
    analyzeRippleEffects,
    IMPACT_ICONS,
    type RippleReport,
    type RippleEffect,
} from '../services/aiService';
import type { Entity, Relationship } from '../store/appStore';

interface RipplePanelProps {
    entity: Entity;
    allEntities: Entity[];
    relationships: Relationship[];
    projectName: string;
    /** Called when user clicks an affected entity name to navigate to it */
    onNavigateToEntity?: (entityId: string) => void;
}

export default function RipplePanel({
    entity,
    allEntities,
    relationships,
    projectName,
    onNavigateToEntity,
}: RipplePanelProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [report, setReport] = useState<RippleReport | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [lastDescription, setLastDescription] = useState(entity.description || '');

    const runAnalysis = useCallback(async () => {
        setIsAnalyzing(true);
        setError(null);

        try {
            // Build related entities from relationships
            const relatedEntities = relationships
                .filter(
                    r => r.from_entity_id === entity.id || r.to_entity_id === entity.id
                )
                .map(r => {
                    const otherId =
                        r.from_entity_id === entity.id ? r.to_entity_id : r.from_entity_id;
                    const other = allEntities.find(e => e.id === otherId);
                    return other
                        ? {
                            name: other.name,
                            type: other.entity_type,
                            description: other.description || '',
                            relationshipType: r.relationship_type || 'related_to',
                        }
                        : null;
                })
                .filter(Boolean) as {
                    name: string;
                    type: string;
                    description: string;
                    relationshipType: string;
                }[];

            const result = await analyzeRippleEffects({
                editedEntity: {
                    name: entity.name,
                    type: entity.entity_type,
                    descriptionBefore: lastDescription,
                    descriptionAfter: entity.description || '',
                },
                relatedEntities,
                projectName,
            });

            setReport(result);
            setLastDescription(entity.description || '');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Analysis failed');
        } finally {
            setIsAnalyzing(false);
        }
    }, [entity, allEntities, relationships, projectName, lastDescription]);

    const handleToggle = () => {
        const next = !isOpen;
        setIsOpen(next);
        // Auto-run analysis on first open if no report yet
        if (next && !report && !isAnalyzing) {
            runAnalysis();
        }
    };

    // Find entity by name for navigation
    const findEntityByName = (name: string): Entity | undefined =>
        allEntities.find(
            e => e.name.toLowerCase() === name.toLowerCase()
        );

    const impactColor = (level: string) =>
        level === 'high' ? '#ef4444' : level === 'medium' ? '#f59e0b' : '#10b981';

    return (
        <div
            style={{
                marginTop: 'var(--space-2)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid rgba(99,102,241,0.15)',
                background: 'rgba(99,102,241,0.04)',
                overflow: 'hidden',
            }}
        >
            {/* Header */}
            <button
                onClick={handleToggle}
                style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 14px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    textAlign: 'left',
                }}
            >
                <span style={{ fontSize: 16 }}>🌊</span>
                Ripple Effects
                {report && report.effects.length > 0 && (
                    <span
                        style={{
                            marginLeft: 'auto',
                            fontSize: 'var(--text-xs)',
                            padding: '1px 8px',
                            borderRadius: 'var(--radius-full)',
                            background: 'rgba(99,102,241,0.12)',
                            color: '#6366f1',
                            fontWeight: 600,
                        }}
                    >
                        {report.effects.length}
                    </span>
                )}
                <span
                    style={{
                        marginLeft: report?.effects.length ? 0 : 'auto',
                        fontSize: 'var(--text-xs)',
                        color: 'var(--text-tertiary)',
                        transition: 'transform 0.2s',
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
                    }}
                >
                    ▼
                </span>
            </button>

            {/* Body */}
            {isOpen && (
                <div style={{ padding: '0 14px 14px' }}>
                    {/* Re-analyze button */}
                    <button
                        onClick={runAnalysis}
                        disabled={isAnalyzing}
                        className="btn btn-ghost btn-sm"
                        style={{
                            fontSize: 11,
                            marginBottom: 8,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                        }}
                    >
                        {isAnalyzing ? (
                            <>
                                <div
                                    className="spinner"
                                    style={{ width: 10, height: 10, borderWidth: 2 }}
                                />
                                Analyzing...
                            </>
                        ) : (
                            '🔄 Re-analyze'
                        )}
                    </button>

                    {error && (
                        <div
                            style={{
                                padding: '8px 10px',
                                borderRadius: 'var(--radius-md)',
                                background: 'rgba(239,68,68,0.08)',
                                color: '#ef4444',
                                fontSize: 'var(--text-xs)',
                                marginBottom: 8,
                            }}
                        >
                            ⚠️ {error}
                        </div>
                    )}

                    {isAnalyzing && !report && (
                        <div
                            style={{
                                textAlign: 'center',
                                padding: 'var(--space-3)',
                                color: 'var(--text-tertiary)',
                                fontSize: 'var(--text-sm)',
                            }}
                        >
                            <div
                                className="spinner"
                                style={{ width: 20, height: 20, borderWidth: 2, margin: '0 auto 8px' }}
                            />
                            Analyzing ripple effects...
                        </div>
                    )}

                    {report && report.effects.length === 0 && (
                        <div
                            style={{
                                padding: '10px',
                                borderRadius: 'var(--radius-md)',
                                background: 'rgba(16,185,129,0.06)',
                                color: 'var(--text-secondary)',
                                fontSize: 'var(--text-sm)',
                                textAlign: 'center',
                            }}
                        >
                            ✅ No downstream effects detected.
                        </div>
                    )}

                    {report &&
                        report.effects.length > 0 &&
                        report.effects.map((effect: RippleEffect) => {
                            const targetEntity = findEntityByName(effect.affectedEntityName);
                            return (
                                <div
                                    key={effect.id}
                                    style={{
                                        padding: '10px 12px',
                                        borderRadius: 'var(--radius-md)',
                                        background: 'var(--bg-primary)',
                                        border: '1px solid var(--border)',
                                        marginBottom: 6,
                                    }}
                                >
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 6,
                                            marginBottom: 4,
                                        }}
                                    >
                                        <span style={{ fontSize: 12 }}>
                                            {IMPACT_ICONS[effect.impactLevel]}
                                        </span>
                                        <span
                                            style={{
                                                fontSize: 'var(--text-sm)',
                                                fontWeight: 600,
                                                cursor: targetEntity ? 'pointer' : 'default',
                                                color: targetEntity ? '#6366f1' : 'var(--text-primary)',
                                                textDecoration: targetEntity ? 'underline' : 'none',
                                            }}
                                            onClick={() =>
                                                targetEntity &&
                                                onNavigateToEntity?.(targetEntity.id)
                                            }
                                        >
                                            {effect.affectedEntityName}
                                        </span>
                                        <span
                                            style={{
                                                marginLeft: 'auto',
                                                fontSize: 9,
                                                padding: '1px 6px',
                                                borderRadius: 'var(--radius-full)',
                                                background: `${impactColor(effect.impactLevel)}15`,
                                                color: impactColor(effect.impactLevel),
                                                fontWeight: 700,
                                                textTransform: 'uppercase',
                                            }}
                                        >
                                            {effect.impactLevel}
                                        </span>
                                    </div>
                                    <p
                                        style={{
                                            margin: 0,
                                            fontSize: 'var(--text-xs)',
                                            color: 'var(--text-secondary)',
                                            lineHeight: 1.5,
                                        }}
                                    >
                                        {effect.description}
                                    </p>
                                    {effect.suggestedAdjustment && (
                                        <div
                                            style={{
                                                marginTop: 6,
                                                padding: '4px 8px',
                                                borderRadius: 'var(--radius-sm)',
                                                background: 'rgba(99,102,241,0.06)',
                                                fontSize: 11,
                                                color: '#6366f1',
                                            }}
                                        >
                                            💡 {effect.suggestedAdjustment}
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                    {report && (
                        <div
                            style={{
                                fontSize: 10,
                                color: 'var(--text-tertiary)',
                                marginTop: 8,
                                textAlign: 'right',
                            }}
                        >
                            {report.cached ? '⚡ Cached' : `🤖 ${report.provider}`} ·{' '}
                            {new Date(report.analyzedAt).toLocaleTimeString()}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
