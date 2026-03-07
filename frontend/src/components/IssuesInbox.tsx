import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { Issue, Entity } from '../store/appStore';

const SEVERITY_STYLES: Record<Issue['severity'], { bg: string; border: string; icon: string; color: string }> = {
    error: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.3)', icon: '🔴', color: '#ef4444' },
    warning: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)', icon: '🟡', color: '#f59e0b' },
    info: { bg: 'rgba(99,102,241,0.08)', border: 'rgba(99,102,241,0.3)', icon: '🔵', color: '#6366f1' },
};

const TYPE_LABELS: Record<Issue['issue_type'], string> = {
    contradiction: 'Contradiction',
    causality: 'Causality Break',
    pov: 'POV Issue',
    pacing: 'Pacing',
    arc: 'Unresolved Arc',
    continuity: 'Continuity',
    other: 'Other',
};

export default function IssuesInbox({
    projectId,
    entities,
    onNavigateToEntity,
}: {
    projectId: string;
    entities: Entity[];
    onNavigateToEntity: (entity: Entity) => void;
}) {
    const queryClient = useQueryClient();
    const [showResolved, setShowResolved] = useState(false);
    const [filterType, setFilterType] = useState<Issue['issue_type'] | 'all'>('all');

    const { data, isLoading } = useQuery({
        queryKey: ['issues', projectId, showResolved],
        queryFn: () => api.getIssues(projectId, { resolved: showResolved }),
        enabled: !!projectId,
    });

    const resolveIssue = useMutation({
        mutationFn: (id: string) => api.resolveIssue(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['issues', projectId] }),
    });

    const deleteIssue = useMutation({
        mutationFn: (id: string) => api.deleteIssue(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['issues', projectId] }),
    });

    const issues = data?.issues || [];
    const filtered = filterType === 'all' ? issues : issues.filter(i => i.issue_type === filterType);

    const entityMap = new Map(entities.map(e => [e.id, e]));

    const counts = {
        error: issues.filter(i => i.severity === 'error').length,
        warning: issues.filter(i => i.severity === 'warning').length,
        info: issues.filter(i => i.severity === 'info').length,
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header */}
            <div style={{
                padding: 'var(--space-2) var(--space-3)',
                borderBottom: '1px solid var(--border)',
                background: 'var(--bg-primary)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 700, margin: 0 }}>
                        📋 Issues Inbox
                    </h3>
                    <div style={{ display: 'flex', gap: 4 }}>
                        {counts.error > 0 && (
                            <span style={{
                                fontSize: 10, padding: '2px 8px', borderRadius: 'var(--radius-full)',
                                background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 700,
                            }}>{counts.error} errors</span>
                        )}
                        {counts.warning > 0 && (
                            <span style={{
                                fontSize: 10, padding: '2px 8px', borderRadius: 'var(--radius-full)',
                                background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 700,
                            }}>{counts.warning} warnings</span>
                        )}
                    </div>
                </div>

                {/* Filter bar */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <select
                        className="input"
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value as Issue['issue_type'] | 'all')}
                        style={{ flex: 1, height: 28, fontSize: 'var(--text-xs)', padding: '0 6px' }}
                    >
                        <option value="all">All types</option>
                        {Object.entries(TYPE_LABELS).map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                        ))}
                    </select>
                    <button
                        className={`btn btn-ghost btn-sm`}
                        style={{
                            fontSize: 'var(--text-xs)', padding: '2px 8px', height: 28,
                            background: showResolved ? 'rgba(99,102,241,0.1)' : undefined,
                        }}
                        onClick={() => setShowResolved(!showResolved)}
                    >
                        {showResolved ? '✅ Resolved' : '⏳ Open'}
                    </button>
                </div>
            </div>

            {/* Issue list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2)' }}>
                {isLoading ? (
                    <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                        Loading issues...
                    </div>
                ) : filtered.length === 0 ? (
                    <div style={{
                        padding: 'var(--space-4)', textAlign: 'center',
                        color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)',
                    }}>
                        {showResolved ? 'No resolved issues.' : '✨ No open issues — your story is consistent!'}
                    </div>
                ) : (
                    filtered.map(issue => {
                        const style = SEVERITY_STYLES[issue.severity];
                        const entity = issue.entity_id ? entityMap.get(issue.entity_id) : null;
                        const related = issue.related_entity_id ? entityMap.get(issue.related_entity_id) : null;

                        return (
                            <div
                                key={issue.id}
                                style={{
                                    padding: '10px 12px',
                                    borderRadius: 'var(--radius-md)',
                                    background: style.bg,
                                    border: `1px solid ${style.border}`,
                                    marginBottom: 8,
                                    transition: 'all 0.15s',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                    <span style={{ fontSize: 14, flexShrink: 0 }}>{style.icon}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                            fontSize: 'var(--text-sm)', fontWeight: 600,
                                            color: 'var(--text-primary)', marginBottom: 2,
                                        }}>
                                            {issue.title}
                                        </div>
                                        <div style={{
                                            fontSize: 'var(--text-xs)', color: 'var(--text-secondary)',
                                            marginBottom: 6, lineHeight: 1.4,
                                        }}>
                                            {issue.description}
                                        </div>

                                        {/* Entity links */}
                                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                                            <span style={{
                                                fontSize: 9, padding: '1px 6px',
                                                borderRadius: 'var(--radius-full)',
                                                background: `${style.color}15`, color: style.color,
                                                fontWeight: 600,
                                            }}>
                                                {TYPE_LABELS[issue.issue_type]}
                                            </span>
                                            {entity && (
                                                <button
                                                    className="btn btn-ghost"
                                                    style={{
                                                        fontSize: 9, padding: '1px 6px', height: 'auto',
                                                        color: 'var(--accent)', textDecoration: 'underline',
                                                    }}
                                                    onClick={() => onNavigateToEntity(entity)}
                                                >
                                                    → {entity.name}
                                                </button>
                                            )}
                                            {related && (
                                                <button
                                                    className="btn btn-ghost"
                                                    style={{
                                                        fontSize: 9, padding: '1px 6px', height: 'auto',
                                                        color: 'var(--accent)', textDecoration: 'underline',
                                                    }}
                                                    onClick={() => onNavigateToEntity(related)}
                                                >
                                                    → {related.name}
                                                </button>
                                            )}
                                        </div>

                                        {/* Suggestion */}
                                        {issue.suggestion && (
                                            <div style={{
                                                fontSize: 'var(--text-xs)', color: 'var(--text-secondary)',
                                                padding: '4px 8px', background: 'rgba(255,255,255,0.04)',
                                                borderRadius: 'var(--radius-sm)', fontStyle: 'italic',
                                                borderLeft: `2px solid ${style.color}`,
                                            }}>
                                                💡 {issue.suggestion}
                                            </div>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                                        {!issue.resolved && (
                                            <button
                                                className="btn btn-ghost btn-sm"
                                                title="Resolve"
                                                style={{ padding: 2, fontSize: 12, color: '#10b981' }}
                                                onClick={() => resolveIssue.mutate(issue.id)}
                                                disabled={resolveIssue.isPending}
                                            >
                                                ✓
                                            </button>
                                        )}
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            title="Dismiss"
                                            style={{ padding: 2, fontSize: 12, color: 'var(--text-tertiary)' }}
                                            onClick={() => deleteIssue.mutate(issue.id)}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
