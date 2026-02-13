/**
 * Supabase Presence Service (E5-US2)
 * Tracks active users and what they're editing in a project.
 */
import { supabase } from './api';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface PresenceUser {
    userId: string;
    userName: string;
    email: string;
    editingEntityId: string | null;
    color: string;
    joinedAt: string;
}

const PRESENCE_COLORS = [
    '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4',
    '#f97316', '#8b5cf6', '#ef4444', '#84cc16', '#14b8a6',
];

let presenceChannel: RealtimeChannel | null = null;
let presenceCallback: ((users: PresenceUser[]) => void) | null = null;
let currentUserId: string | null = null;

function getColorForUser(userId: string): string {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        hash = ((hash << 5) - hash) + userId.charCodeAt(i);
        hash |= 0;
    }
    return PRESENCE_COLORS[Math.abs(hash) % PRESENCE_COLORS.length];
}

function syncPresenceState() {
    if (!presenceChannel || !presenceCallback) return;

    const state = presenceChannel.presenceState();
    const users: PresenceUser[] = [];
    const seen = new Set<string>();

    for (const key of Object.keys(state)) {
        const presences = state[key] as Array<Record<string, unknown>>;
        for (const p of presences) {
            const userId = p.userId as string;
            if (userId === currentUserId || seen.has(userId)) continue;
            seen.add(userId);
            users.push({
                userId,
                userName: (p.userName as string) || 'Unknown',
                email: (p.email as string) || '',
                editingEntityId: (p.editingEntityId as string | null) || null,
                color: getColorForUser(userId),
                joinedAt: (p.joinedAt as string) || new Date().toISOString(),
            });
        }
    }

    presenceCallback(users);
}

/**
 * Start tracking presence for a project.
 */
export function trackPresence(
    projectId: string,
    userId: string,
    userName: string,
    email: string,
    onChange: (users: PresenceUser[]) => void
): void {
    // Clean up previous
    stopPresence();

    currentUserId = userId;
    presenceCallback = onChange;

    presenceChannel = supabase.channel(`presence-${projectId}`, {
        config: { presence: { key: userId } },
    });

    presenceChannel
        .on('presence', { event: 'sync' }, () => {
            syncPresenceState();
        })
        .on('presence', { event: 'join' }, () => {
            syncPresenceState();
        })
        .on('presence', { event: 'leave' }, () => {
            syncPresenceState();
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await presenceChannel?.track({
                    userId,
                    userName,
                    email,
                    editingEntityId: null,
                    joinedAt: new Date().toISOString(),
                });
            }
        });
}

/**
 * Broadcast which entity the current user is editing.
 */
export async function broadcastEditingEntity(entityId: string | null): Promise<void> {
    if (!presenceChannel || !currentUserId) return;

    await presenceChannel.track({
        userId: currentUserId,
        editingEntityId: entityId,
        joinedAt: new Date().toISOString(),
    });
}

/**
 * Stop presence tracking.
 */
export function stopPresence(): void {
    if (presenceChannel) {
        presenceChannel.untrack();
        supabase.removeChannel(presenceChannel);
        presenceChannel = null;
        currentUserId = null;
        presenceCallback = null;
    }
}
