/**
 * Analytics Dashboard (E6-US4)
 * Shows project statistics: entity counts, timeline coverage, relationship density.
 */
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import type { Entity } from '../store/appStore';

const ENTITY_ICONS: Record<string, string> = {
    character: '👤', timeline: '📅', event: '⚡',
    arc: '🎭', theme: '💡', location: '📍', note: '📝',
};

const TYPE_COLORS: Record<string, string> = {
    character: '#6366f1', timeline: '#06b6d4', event: '#f59e0b',
    arc: '#ec4899', theme: '#8b5cf6', location: '#10b981', note: '#64748b',
};

export default function AnalyticsPage() {
    const { projectId } = useParams<{ projectId: string }>();
    const navigate = useNavigate();

    const { data: projectData } = useQuery({
        queryKey: ['project', projectId],
        queryFn: () => api.getProject(projectId!),
        enabled: !!projectId,
    });

    const { data: entitiesData } = useQuery({
        queryKey: ['allEntities', projectId],
        queryFn: () => api.getEntities(projectId!),
        enabled: !!projectId,
    });

    const { data: relData } = useQuery({
        queryKey: ['relationships', projectId],
        queryFn: () => api.getRelationships(projectId!),
        enabled: !!projectId,
    });

    const entities = entitiesData?.entities || [];
    const relationships = relData?.relationships || [];
    const project = projectData?.project;

    // Count by type
    const typeCounts: Record<string, number> = {};
    for (const e of entities) {
        typeCounts[e.entity_type] = (typeCounts[e.entity_type] || 0) + 1;
    }
    const maxCount = Math.max(...Object.values(typeCounts), 1);

    // Timeline coverage
    const timelines = entities.filter(e => e.entity_type === 'timeline');
    const events = entities.filter(e => e.entity_type === 'event');

    // Relationship types
    const relTypes: Record<string, number> = {};
    for (const r of relationships) {
        const type = (r as Record<string, unknown>).relationship_type as string || 'unknown';
        relTypes[type] = (relTypes[type] || 0) + 1;
    }

    // AI usage stats from localStorage
    const aiStats = {
        ideasGenerated: parseInt(localStorage.getItem('chronos_ai_ideas_count') || '0'),
        consistencyChecks: parseInt(localStorage.getItem('chronos_ai_consistency_count') || '0'),
        rippleAnalyses: parseInt(localStorage.getItem('chronos_ai_ripple_count') || '0'),
    };

    // Recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentEntities = entities.filter(e => new Date(e.updated_at) > sevenDaysAgo);

    return (
        <div style={{
            minHeight: '100vh', background: 'var(--bg-primary)',
            padding: 'var(--space-4)', maxWidth: 1000, margin: '0 auto',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 'var(--space-4)',
            }}>
                <div>
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => navigate(`/project/${projectId}`)}
                        style={{ marginBottom: 8 }}
                    >← Back to Workspace</button>
                    <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, margin: 0 }}>
                        📊 Analytics — {project?.name || 'Loading...'}
                    </h1>
                    <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)', marginTop: 4 }}>
                        Project insights and statistics
                    </p>
                </div>
            </div>

            {/* Summary Cards */}
            <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-3)',
                marginBottom: 'var(--space-4)',
            }}>
                {[
                    { label: 'Entities', value: entities.length, icon: '📦', color: '#6366f1' },
                    { label: 'Relationships', value: relationships.length, icon: '🔗', color: '#ec4899' },
                    { label: 'Timelines', value: timelines.length, icon: '📅', color: '#06b6d4' },
                    { label: 'Events', value: events.length, icon: '⚡', color: '#f59e0b' },
                ].map(card => (
                    <div key={card.label} style={{
                        background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--border)', padding: 'var(--space-3)',
                        textAlign: 'center',
                    }}>
                        <div style={{ fontSize: 28, marginBottom: 4 }}>{card.icon}</div>
                        <div style={{
                            fontSize: 28, fontWeight: 700, color: card.color,
                            fontFamily: 'var(--font-mono, monospace)',
                        }}>
                            {card.value}
                        </div>
                        <div style={{
                            fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)',
                            textTransform: 'uppercase', letterSpacing: 1, marginTop: 4,
                        }}>
                            {card.label}
                        </div>
                    </div>
                ))}
            </div>

            {/* Entity Distribution */}
            <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)',
                marginBottom: 'var(--space-4)',
            }}>
                <div style={{
                    background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border)', padding: 'var(--space-3)',
                }}>
                    <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>
                        Entity Distribution
                    </h3>
                    {Object.entries(typeCounts)
                        .sort((a, b) => b[1] - a[1])
                        .map(([type, count]) => (
                            <div key={type} style={{ marginBottom: 12 }}>
                                <div style={{
                                    display: 'flex', justifyContent: 'space-between',
                                    fontSize: 'var(--text-sm)', marginBottom: 4,
                                }}>
                                    <span>{ENTITY_ICONS[type] || '📄'} {type}</span>
                                    <span style={{ fontWeight: 600, color: TYPE_COLORS[type] || '#888' }}>
                                        {count}
                                    </span>
                                </div>
                                <div style={{
                                    height: 6, background: 'var(--bg-primary)',
                                    borderRadius: 3, overflow: 'hidden',
                                }}>
                                    <div style={{
                                        height: '100%',
                                        width: `${(count / maxCount) * 100}%`,
                                        background: TYPE_COLORS[type] || '#888',
                                        borderRadius: 3,
                                        transition: 'width 0.5s ease',
                                    }} />
                                </div>
                            </div>
                        ))}
                    {Object.keys(typeCounts).length === 0 && (
                        <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
                            No entities created yet.
                        </p>
                    )}
                </div>

                {/* Relationship Types */}
                <div style={{
                    background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border)', padding: 'var(--space-3)',
                }}>
                    <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>
                        Relationship Types
                    </h3>
                    {Object.entries(relTypes)
                        .sort((a, b) => b[1] - a[1])
                        .map(([type, count]) => (
                            <div key={type} style={{
                                display: 'flex', justifyContent: 'space-between',
                                padding: '8px 12px', borderRadius: 'var(--radius-md)',
                                background: 'var(--bg-primary)', marginBottom: 6,
                                border: '1px solid var(--border)',
                            }}>
                                <span style={{ fontSize: 'var(--text-sm)' }}>🔗 {type}</span>
                                <span style={{
                                    fontWeight: 600, color: '#ec4899', fontSize: 'var(--text-sm)',
                                    fontFamily: 'var(--font-mono, monospace)',
                                }}>
                                    {count}
                                </span>
                            </div>
                        ))}
                    {Object.keys(relTypes).length === 0 && (
                        <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
                            No relationships created yet.
                        </p>
                    )}
                </div>
            </div>

            {/* AI Usage & Recent Activity */}
            <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)',
            }}>
                <div style={{
                    background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border)', padding: 'var(--space-3)',
                }}>
                    <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>
                        🤖 AI Usage
                    </h3>
                    {[
                        { label: 'Ideas Generated', value: aiStats.ideasGenerated, icon: '💡' },
                        { label: 'Consistency Checks', value: aiStats.consistencyChecks, icon: '🔍' },
                        { label: 'Ripple Analyses', value: aiStats.rippleAnalyses, icon: '🌊' },
                    ].map(stat => (
                        <div key={stat.label} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '8px 12px', borderRadius: 'var(--radius-md)',
                            background: 'var(--bg-primary)', marginBottom: 6,
                            border: '1px solid var(--border)',
                        }}>
                            <span style={{ fontSize: 'var(--text-sm)' }}>
                                {stat.icon} {stat.label}
                            </span>
                            <span style={{
                                fontWeight: 600, fontSize: 'var(--text-sm)',
                                fontFamily: 'var(--font-mono, monospace)', color: '#8b5cf6',
                            }}>
                                {stat.value}
                            </span>
                        </div>
                    ))}
                </div>

                <div style={{
                    background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border)', padding: 'var(--space-3)',
                }}>
                    <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>
                        📋 Recent Activity (7 days)
                    </h3>
                    {recentEntities.slice(0, 8).map((e: Entity) => (
                        <div key={e.id} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '6px 12px', borderRadius: 'var(--radius-md)',
                            background: 'var(--bg-primary)', marginBottom: 4,
                            border: '1px solid var(--border)',
                        }}>
                            <span style={{ fontSize: 'var(--text-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                                {ENTITY_ICONS[e.entity_type] || '📄'} {e.name}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                                {new Date(e.updated_at).toLocaleDateString()}
                            </span>
                        </div>
                    ))}
                    {recentEntities.length === 0 && (
                        <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
                            No recent changes.
                        </p>
                    )}
                    {recentEntities.length > 8 && (
                        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8, textAlign: 'center' }}>
                            +{recentEntities.length - 8} more changes
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
