/**
 * Conflict Resolution Modal (E5-US3)
 * Shows side-by-side diff when concurrent edits conflict.
 */
import { useState } from 'react';
import type { Entity } from '../store/appStore';

interface ConflictModalProps {
    localEntity: Entity;
    serverEntity: Entity;
    conflictFields: string[];
    onKeepMine: () => void;
    onAcceptTheirs: () => void;
    onMerge: (merged: Partial<Entity>) => void;
    onCancel: () => void;
}

export default function ConflictModal({
    localEntity,
    serverEntity,
    conflictFields,
    onKeepMine,
    onAcceptTheirs,
    onMerge,
    onCancel,
}: ConflictModalProps) {
    const [mergedValues, setMergedValues] = useState<Record<string, string>>(() => {
        const initial: Record<string, string> = {};
        const localAny = localEntity as unknown as Record<string, unknown>;
        for (const field of conflictFields) {
            initial[field] = (localAny[field] as string) || '';
        }
        return initial;
    });
    const [mode, setMode] = useState<'compare' | 'merge'>('compare');

    const fieldLabels: Record<string, string> = {
        name: 'Name',
        description: 'Description',
        entity_type: 'Type',
        color: 'Color',
    };

    return (
        <div className="modal-overlay" style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }}>
            <div style={{
                background: 'var(--bg-primary)', borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border)', maxWidth: 800, width: '90%',
                maxHeight: '80vh', overflow: 'auto', padding: 'var(--space-4)',
                boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
            }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                    <div>
                        <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: '#f59e0b', margin: 0 }}>
                            ⚠️ Edit Conflict Detected
                        </h2>
                        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', marginTop: 4 }}>
                            Another user modified "{serverEntity.name}" while you were editing.
                        </p>
                    </div>
                    <button onClick={onCancel} style={{
                        background: 'none', border: 'none', color: 'var(--text-tertiary)',
                        fontSize: 20, cursor: 'pointer', padding: 4,
                    }}>✕</button>
                </div>

                {/* Mode Toggle */}
                <div style={{
                    display: 'flex', gap: 0, marginBottom: 'var(--space-3)',
                    borderRadius: 'var(--radius-md)', overflow: 'hidden',
                    border: '1px solid var(--border)',
                }}>
                    <button
                        onClick={() => setMode('compare')}
                        style={{
                            flex: 1, padding: '8px 16px', border: 'none', cursor: 'pointer',
                            background: mode === 'compare' ? 'rgba(99,102,241,0.15)' : 'var(--bg-secondary)',
                            color: mode === 'compare' ? 'var(--accent)' : 'var(--text-tertiary)',
                            fontWeight: mode === 'compare' ? 600 : 400, fontSize: 'var(--text-sm)',
                        }}
                    >Compare Versions</button>
                    <button
                        onClick={() => setMode('merge')}
                        style={{
                            flex: 1, padding: '8px 16px', border: 'none', cursor: 'pointer',
                            background: mode === 'merge' ? 'rgba(99,102,241,0.15)' : 'var(--bg-secondary)',
                            color: mode === 'merge' ? 'var(--accent)' : 'var(--text-tertiary)',
                            fontWeight: mode === 'merge' ? 600 : 400, fontSize: 'var(--text-sm)',
                        }}
                    >Manual Merge</button>
                </div>

                {mode === 'compare' ? (
                    /* Side-by-side comparison */
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                        <div>
                            <h3 style={{
                                fontSize: 'var(--text-sm)', fontWeight: 600, color: '#6366f1',
                                marginBottom: 'var(--space-2)', textTransform: 'uppercase', letterSpacing: 1,
                            }}>Your Version</h3>
                            {conflictFields.map(field => (
                                <div key={field} style={{
                                    padding: 'var(--space-2)', background: 'rgba(99,102,241,0.05)',
                                    borderRadius: 'var(--radius-md)', marginBottom: 8,
                                    border: '1px solid rgba(99,102,241,0.15)',
                                }}>
                                    <label style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                                        {fieldLabels[field] || field}
                                    </label>
                                    <p style={{ margin: '4px 0 0', fontSize: 'var(--text-sm)', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                                        {String((localEntity as unknown as Record<string, unknown>)[field] || '(empty)')}
                                    </p>
                                </div>
                            ))}
                        </div>
                        <div>
                            <h3 style={{
                                fontSize: 'var(--text-sm)', fontWeight: 600, color: '#10b981',
                                marginBottom: 'var(--space-2)', textTransform: 'uppercase', letterSpacing: 1,
                            }}>Server Version</h3>
                            {conflictFields.map(field => (
                                <div key={field} style={{
                                    padding: 'var(--space-2)', background: 'rgba(16,185,129,0.05)',
                                    borderRadius: 'var(--radius-md)', marginBottom: 8,
                                    border: '1px solid rgba(16,185,129,0.15)',
                                }}>
                                    <label style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                                        {fieldLabels[field] || field}
                                    </label>
                                    <p style={{ margin: '4px 0 0', fontSize: 'var(--text-sm)', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                                        {String((serverEntity as unknown as Record<string, unknown>)[field] || '(empty)')}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    /* Manual merge editor */
                    <div>
                        {conflictFields.map(field => (
                            <div key={field} style={{ marginBottom: 'var(--space-2)' }}>
                                <label style={{
                                    fontSize: 'var(--text-sm)', fontWeight: 600,
                                    color: 'var(--text-secondary)', display: 'block', marginBottom: 4,
                                }}>
                                    {fieldLabels[field] || field}
                                </label>
                                <textarea
                                    className="input"
                                    value={mergedValues[field] || ''}
                                    onChange={(e) => setMergedValues(prev => ({ ...prev, [field]: e.target.value }))}
                                    rows={field === 'description' ? 4 : 1}
                                    style={{ width: '100%', resize: 'vertical' }}
                                />
                                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => setMergedValues(prev => ({
                                            ...prev,
                                            [field]: String((localEntity as unknown as Record<string, unknown>)[field] || ''),
                                        }))}
                                        style={{ fontSize: 11 }}
                                    >← Use mine</button>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => setMergedValues(prev => ({
                                            ...prev,
                                            [field]: String((serverEntity as unknown as Record<string, unknown>)[field] || ''),
                                        }))}
                                        style={{ fontSize: 11 }}
                                    >Use theirs →</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Actions */}
                <div style={{
                    display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)',
                    marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)',
                    borderTop: '1px solid var(--border)',
                }}>
                    <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
                    <button
                        className="btn"
                        onClick={onKeepMine}
                        style={{ background: '#6366f1', color: 'white' }}
                    >Keep Mine</button>
                    <button
                        className="btn"
                        onClick={onAcceptTheirs}
                        style={{ background: '#10b981', color: 'white' }}
                    >Accept Theirs</button>
                    {mode === 'merge' && (
                        <button
                            className="btn"
                            onClick={() => onMerge(mergedValues as unknown as Partial<Entity>)}
                            style={{ background: '#f59e0b', color: 'white' }}
                        >Save Merged</button>
                    )}
                </div>
            </div>
        </div>
    );
}
