/**
 * Offline Indicator Component (E6-US1)
 * Fixed pill showing online/offline status and pending sync operations.
 */
import { useState, useEffect } from 'react';
import { isOnline, onStatusChange, onSyncProgress, syncPendingOperations } from '../services/offlineService';

export default function OfflineIndicator() {
    const [online, setOnline] = useState(isOnline());
    const [pendingCount, setPendingCount] = useState(0);
    const [syncProgress, setSyncProgress] = useState<{ current: number; total: number } | null>(null);
    const [showDetails, setShowDetails] = useState(false);

    useEffect(() => {
        const unsub1 = onStatusChange((isOnl, count) => {
            setOnline(isOnl);
            setPendingCount(count);
        });
        const unsub2 = onSyncProgress((current, total) => {
            setSyncProgress(current >= total ? null : { current, total });
        });

        return () => { unsub1(); unsub2(); };
    }, []);

    // Don't render if online and no pending
    if (online && pendingCount === 0 && !syncProgress) return null;

    return (
        <div style={{
            position: 'fixed', bottom: 16, left: 16, zIndex: 9998,
        }}>
            <button
                onClick={() => setShowDetails(!showDetails)}
                style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 16px', borderRadius: 'var(--radius-full)',
                    border: `1px solid ${online ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                    background: online ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                    color: online ? '#10b981' : '#ef4444',
                    fontSize: 'var(--text-sm)', fontWeight: 500,
                    cursor: 'pointer', backdropFilter: 'blur(12px)',
                    transition: 'all 0.2s',
                }}
            >
                <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: online ? '#10b981' : '#ef4444',
                    boxShadow: `0 0 8px ${online ? '#10b981' : '#ef4444'}`,
                }} />
                {online ? 'Online' : 'Offline'}
                {pendingCount > 0 && (
                    <span style={{
                        background: 'rgba(245,158,11,0.2)', color: '#f59e0b',
                        padding: '2px 8px', borderRadius: 'var(--radius-full)',
                        fontSize: 11, fontWeight: 600,
                    }}>
                        {pendingCount} pending
                    </span>
                )}
            </button>

            {/* Details Popup */}
            {showDetails && (
                <div style={{
                    position: 'absolute', bottom: '100%', left: 0, marginBottom: 8,
                    background: 'var(--bg-primary)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-lg)', padding: 'var(--space-3)',
                    minWidth: 240, boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
                }}>
                    <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, margin: '0 0 8px', color: 'var(--text-primary)' }}>
                        {online ? '🟢 Connected' : '🔴 Disconnected'}
                    </h4>
                    {pendingCount > 0 && (
                        <>
                            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '0 0 8px' }}>
                                {pendingCount} change{pendingCount !== 1 ? 's' : ''} waiting to sync
                            </p>
                            {online && (
                                <button
                                    className="btn btn-sm"
                                    onClick={() => syncPendingOperations()}
                                    style={{
                                        width: '100%', background: '#6366f1', color: 'white',
                                        fontSize: 12, padding: '6px 12px',
                                    }}
                                >
                                    Sync Now
                                </button>
                            )}
                        </>
                    )}
                    {syncProgress && (
                        <div style={{ marginTop: 8 }}>
                            <div style={{
                                height: 4, background: 'var(--bg-secondary)',
                                borderRadius: 2, overflow: 'hidden',
                            }}>
                                <div style={{
                                    height: '100%', background: '#6366f1',
                                    width: `${(syncProgress.current / syncProgress.total) * 100}%`,
                                    transition: 'width 0.3s',
                                }} />
                            </div>
                            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                                Syncing {syncProgress.current}/{syncProgress.total}...
                            </p>
                        </div>
                    )}
                    {pendingCount === 0 && online && (
                        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>
                            All changes synced ✓
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
