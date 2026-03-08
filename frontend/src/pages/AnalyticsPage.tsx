/**
 * Story Flags Dashboard (E-07)
 * Replaces the old analytics page with 3 actionable flags:
 * 1. POV Balance — shows how evenly events are distributed across POV characters
 * 2. Pacing Flags — detects clusters of events with no temporal gaps
 * 3. Unresolved Arcs — lists arcs without a resolution relationship
 */
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import type { Entity, Relationship } from '../store/appStore';

// ─── Helpers ─────────────────────────────────────────────────

function computePOVBalance(events: Entity[]): { name: string; count: number; id: string }[] {
    const povMap = new Map<string, { name: string; count: number; id: string }>();
    let unassigned = 0;

    for (const ev of events) {
        const pov = ev.properties?.pov_character as { id: string; name: string } | null;
        if (pov?.id) {
            const entry = povMap.get(pov.id) || { name: pov.name, count: 0, id: pov.id };
            entry.count++;
            povMap.set(pov.id, entry);
        } else {
            unassigned++;
        }
    }

    const result = Array.from(povMap.values()).sort((a, b) => b.count - a.count);
    if (unassigned > 0) result.push({ name: 'Unassigned', count: unassigned, id: '' });
    return result;
}

interface PacingFlag {
    events: Entity[];
    reason: string;
}

function detectPacingIssues(events: Entity[]): PacingFlag[] {
    const flags: PacingFlag[] = [];
    const sorted = [...events]
        .filter(e => typeof e.sort_order === 'number')
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    // Detect clusters (3+ events with consecutive sort orders)
    let cluster: Entity[] = [];
    for (let i = 0; i < sorted.length; i++) {
        if (cluster.length === 0) {
            cluster.push(sorted[i]);
        } else {
            const gap = (sorted[i].sort_order || 0) - (sorted[i - 1].sort_order || 0);
            if (gap <= 1) {
                cluster.push(sorted[i]);
            } else {
                if (cluster.length >= 3) {
                    flags.push({
                        events: [...cluster],
                        reason: `${cluster.length} events clustered tightly — consider adding breathing room.`,
                    });
                }
                cluster = [sorted[i]];
            }
        }
    }
    if (cluster.length >= 3) {
        flags.push({
            events: [...cluster],
            reason: `${cluster.length} events clustered tightly at the end — consider spacing them out.`,
        });
    }

    // Detect large gaps (> 5 positions)
    for (let i = 1; i < sorted.length; i++) {
        const gap = (sorted[i].sort_order || 0) - (sorted[i - 1].sort_order || 0);
        if (gap > 5) {
            flags.push({
                events: [sorted[i - 1], sorted[i]],
                reason: `Large gap (${gap} positions) between "${sorted[i - 1].name}" and "${sorted[i].name}" — possible missing scene.`,
            });
        }
    }

    return flags;
}

interface ArcFlag {
    arc: Entity;
    status: 'no_events' | 'no_resolution';
}

function detectUnresolvedArcs(arcs: Entity[], relationships: Relationship[], events: Entity[]): ArcFlag[] {
    const flags: ArcFlag[] = [];
    const eventIds = new Set(events.map(e => e.id));

    for (const arc of arcs) {
        // Find events connected to this arc
        const connectedEvents = relationships.filter(
            r =>
                (r.from_entity_id === arc.id && eventIds.has(r.to_entity_id)) ||
                (r.to_entity_id === arc.id && eventIds.has(r.from_entity_id))
        );

        if (connectedEvents.length === 0) {
            flags.push({ arc, status: 'no_events' });
        } else {
            // Check if there's a "resolves" or "completes" relationship
            const hasResolution = relationships.some(
                r =>
                ((r.from_entity_id === arc.id || r.to_entity_id === arc.id) &&
                    (r.relationship_type === 'resolves' || r.relationship_type === 'completes' ||
                        r.relationship_type === 'resolution'))
            );
            if (!hasResolution) {
                flags.push({ arc, status: 'no_resolution' });
            }
        }
    }
    return flags;
}

// ─── Color palette ───────────────────────────────────────────
const POV_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ec4899', '#06b6d4', '#8b5cf6', '#f97316', '#ef4444'];

// ─── Component ───────────────────────────────────────────────
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

    const { data: issuesData } = useQuery({
        queryKey: ['issues', projectId],
        queryFn: () => api.getIssues(projectId!, { resolved: false }),
        enabled: !!projectId,
    });

    const entities = entitiesData?.entities || [];
    const relationships = (relData?.relationships || []) as Relationship[];
    const project = projectData?.project;
    const openIssues = issuesData?.issues || [];

    const events = entities.filter(e => e.entity_type === 'event');
    const arcs = entities.filter(e => e.entity_type === 'arc');

    const povBalance = computePOVBalance(events);
    const pacingFlags = detectPacingIssues(events);
    const arcFlags = detectUnresolvedArcs(arcs, relationships, events);

    const totalPOV = povBalance.reduce((s, p) => s + p.count, 0) || 1;

    // Severity summary
    const totalFlags = pacingFlags.length + arcFlags.length + openIssues.length;
    const severityColor = totalFlags === 0 ? '#10b981' : totalFlags <= 3 ? '#f59e0b' : '#ef4444';
    const severityLabel = totalFlags === 0 ? 'All Clear' : totalFlags <= 3 ? 'Needs Attention' : 'Action Required';

    const cardStyle = {
        background: 'var(--bg-secondary)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)',
        padding: 'var(--space-3)',
        marginBottom: 'var(--space-3)',
    };

    return (
        <div style={{
            minHeight: '100vh', background: 'var(--bg-primary)',
            padding: 'var(--space-4)', maxWidth: 900, margin: '0 auto',
        }}>
            {/* Header */}
            <div style={{ marginBottom: 'var(--space-4)' }}>
                <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => navigate(`/project/${projectId}`)}
                    style={{ marginBottom: 8 }}
                >← Back to Workspace</button>
                <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, margin: 0 }}>
                    🚩 Story Flags — {project?.name || 'Loading...'}
                </h1>
                <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)', marginTop: 4 }}>
                    Actionable flags to keep your narrative on track
                </p>
            </div>

            {/* Overall Health Indicator */}
            <div style={{
                ...cardStyle,
                display: 'flex', alignItems: 'center', gap: 16,
                background: `linear-gradient(135deg, ${severityColor}10, var(--bg-secondary))`,
                border: `1px solid ${severityColor}30`,
            }}>
                <div style={{
                    width: 48, height: 48, borderRadius: '50%',
                    background: `${severityColor}20`, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: 24, flexShrink: 0,
                }}>
                    {totalFlags === 0 ? '✅' : totalFlags <= 3 ? '⚠️' : '🚨'}
                </div>
                <div>
                    <div style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: severityColor }}>
                        {severityLabel}
                    </div>
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                        {totalFlags === 0
                            ? 'No story flags detected. Your narrative looks solid!'
                            : `${totalFlags} flag${totalFlags !== 1 ? 's' : ''} detected across your story.`}
                    </div>
                </div>
            </div>

            {/* Flag 1: POV Balance */}
            <div style={cardStyle}>
                <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    👁️ POV Balance
                    <span style={{
                        fontSize: 'var(--text-xs)', padding: '2px 8px',
                        borderRadius: 'var(--radius-full)',
                        background: povBalance.length <= 1 ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)',
                        color: povBalance.length <= 1 ? '#f59e0b' : '#10b981',
                        fontWeight: 600,
                    }}>
                        {povBalance.length <= 1 ? 'Single POV' : `${povBalance.length} POVs`}
                    </span>
                </h3>

                {events.length === 0 ? (
                    <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
                        No events created yet. Add events to see POV distribution.
                    </p>
                ) : (
                    <>
                        {/* Stacked bar */}
                        <div style={{
                            display: 'flex', height: 28, borderRadius: 'var(--radius-md)',
                            overflow: 'hidden', marginBottom: 12,
                        }}>
                            {povBalance.map((p, i) => (
                                <div
                                    key={p.id || 'unassigned'}
                                    style={{
                                        width: `${(p.count / totalPOV) * 100}%`,
                                        background: p.id ? POV_COLORS[i % POV_COLORS.length] : '#64748b',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 10, color: '#fff', fontWeight: 600,
                                        minWidth: p.count > 0 ? 24 : 0,
                                        transition: 'width 0.4s ease',
                                    }}
                                    title={`${p.name}: ${p.count} events`}
                                >
                                    {(p.count / totalPOV) > 0.08 ? p.name.split(' ')[0] : ''}
                                </div>
                            ))}
                        </div>

                        {/* Legend */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {povBalance.map((p, i) => (
                                <div
                                    key={p.id || 'unassigned'}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 4,
                                        fontSize: 'var(--text-xs)', cursor: p.id ? 'pointer' : 'default',
                                    }}
                                    onClick={() => p.id && navigate(`/project/${projectId}`)}
                                >
                                    <div style={{
                                        width: 8, height: 8, borderRadius: '50%',
                                        background: p.id ? POV_COLORS[i % POV_COLORS.length] : '#64748b',
                                    }} />
                                    <span>{p.name}</span>
                                    <span style={{ color: 'var(--text-tertiary)' }}>({p.count})</span>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* Flag 2: Pacing Issues */}
            <div style={cardStyle}>
                <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    ⏱️ Pacing
                    <span style={{
                        fontSize: 'var(--text-xs)', padding: '2px 8px',
                        borderRadius: 'var(--radius-full)',
                        background: pacingFlags.length === 0 ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                        color: pacingFlags.length === 0 ? '#10b981' : '#f59e0b',
                        fontWeight: 600,
                    }}>
                        {pacingFlags.length === 0 ? 'Good' : `${pacingFlags.length} issue${pacingFlags.length !== 1 ? 's' : ''}`}
                    </span>
                </h3>

                {pacingFlags.length === 0 ? (
                    <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
                        {events.length === 0
                            ? 'No events to analyze yet.'
                            : '✅ Event pacing looks well-distributed. No clusters or large gaps detected.'}
                    </p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {pacingFlags.map((flag, i) => (
                            <div key={i} style={{
                                padding: '10px 14px',
                                borderRadius: 'var(--radius-md)',
                                background: 'rgba(245,158,11,0.06)',
                                border: '1px solid rgba(245,158,11,0.15)',
                                fontSize: 'var(--text-sm)',
                            }}>
                                <div style={{ fontWeight: 600, marginBottom: 4 }}>⚠️ {flag.reason}</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                    {flag.events.map(ev => (
                                        <span
                                            key={ev.id}
                                            style={{
                                                fontSize: 11, padding: '1px 6px',
                                                borderRadius: 'var(--radius-full)',
                                                background: 'rgba(245,158,11,0.12)',
                                                color: '#f59e0b', cursor: 'pointer',
                                            }}
                                            onClick={() => navigate(`/project/${projectId}`)}
                                        >
                                            ⚡ {ev.name}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Flag 3: Unresolved Arcs */}
            <div style={cardStyle}>
                <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    🎭 Arcs
                    <span style={{
                        fontSize: 'var(--text-xs)', padding: '2px 8px',
                        borderRadius: 'var(--radius-full)',
                        background: arcFlags.length === 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                        color: arcFlags.length === 0 ? '#10b981' : '#ef4444',
                        fontWeight: 600,
                    }}>
                        {arcFlags.length === 0 ? 'Resolved' : `${arcFlags.length} unresolved`}
                    </span>
                </h3>

                {arcs.length === 0 ? (
                    <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
                        No arcs created yet. Add story arcs to track their resolution.
                    </p>
                ) : arcFlags.length === 0 ? (
                    <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
                        ✅ All arcs have events and resolution paths.
                    </p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {arcFlags.map(flag => (
                            <div
                                key={flag.arc.id}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '8px 14px',
                                    borderRadius: 'var(--radius-md)',
                                    background: flag.status === 'no_events' ? 'rgba(239,68,68,0.06)' : 'rgba(245,158,11,0.06)',
                                    border: `1px solid ${flag.status === 'no_events' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)'}`,
                                    cursor: 'pointer',
                                }}
                                onClick={() => navigate(`/project/${projectId}`)}
                            >
                                <div>
                                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                                        🎭 {flag.arc.name}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                                        {flag.status === 'no_events'
                                            ? 'No events linked to this arc'
                                            : 'Arc has events but no resolution relationship'}
                                    </div>
                                </div>
                                <span style={{
                                    fontSize: 10, padding: '2px 8px',
                                    borderRadius: 'var(--radius-full)',
                                    background: flag.status === 'no_events' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                                    color: flag.status === 'no_events' ? '#ef4444' : '#f59e0b',
                                    fontWeight: 600,
                                }}>
                                    {flag.status === 'no_events' ? 'Orphaned' : 'Open'}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Open Consistency Issues */}
            {openIssues.length > 0 && (
                <div style={cardStyle}>
                    <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 600, marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        🔍 Consistency Issues
                        <span style={{
                            fontSize: 'var(--text-xs)', padding: '2px 8px',
                            borderRadius: 'var(--radius-full)',
                            background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 600,
                        }}>
                            {openIssues.length} open
                        </span>
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {openIssues.slice(0, 5).map(issue => (
                            <div
                                key={issue.id}
                                style={{
                                    padding: '8px 12px', borderRadius: 'var(--radius-md)',
                                    background: 'var(--bg-primary)', border: '1px solid var(--border)',
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    cursor: 'pointer',
                                }}
                                onClick={() => navigate(`/project/${projectId}`)}
                            >
                                <span style={{
                                    fontSize: 10, padding: '1px 6px', borderRadius: 'var(--radius-full)',
                                    background: issue.severity === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                                    color: issue.severity === 'error' ? '#ef4444' : '#f59e0b',
                                    fontWeight: 600,
                                }}>
                                    {issue.severity}
                                </span>
                                <span style={{ fontSize: 'var(--text-sm)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {issue.title}
                                </span>
                            </div>
                        ))}
                        {openIssues.length > 5 && (
                            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 4 }}>
                                +{openIssues.length - 5} more issues
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
