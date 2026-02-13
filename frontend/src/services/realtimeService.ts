/**
 * Supabase Realtime Service (E5-US1)
 * Subscribes to project-level changes and invalidates React Query cache.
 */
import { supabase } from './api';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { QueryClient } from '@tanstack/react-query';

let activeChannel: RealtimeChannel | null = null;
let activeProjectId: string | null = null;

export interface RealtimeEvent {
    table: string;
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
    new: Record<string, unknown>;
    old: Record<string, unknown>;
}

type RealtimeCallback = (event: RealtimeEvent) => void;
const listeners: Set<RealtimeCallback> = new Set();

export function onRealtimeEvent(callback: RealtimeCallback): () => void {
    listeners.add(callback);
    return () => listeners.delete(callback);
}

function notifyListeners(event: RealtimeEvent) {
    listeners.forEach(cb => cb(event));
}

/**
 * Subscribe to realtime changes for a project.
 * Invalidates TanStack Query cache keys on any change.
 */
export function subscribeToProject(
    projectId: string,
    queryClient: QueryClient
): void {
    // Don't re-subscribe if already on the same project
    if (activeProjectId === projectId && activeChannel) return;

    // Clean up previous subscription
    unsubscribeFromProject();

    activeProjectId = projectId;

    activeChannel = supabase
        .channel(`project-${projectId}`)
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'entities', filter: `project_id=eq.${projectId}` },
            (payload) => {
                queryClient.invalidateQueries({ queryKey: ['entities', projectId] });
                queryClient.invalidateQueries({ queryKey: ['allEntities', projectId] });
                notifyListeners({
                    table: 'entities',
                    eventType: payload.eventType as RealtimeEvent['eventType'],
                    new: (payload.new || {}) as Record<string, unknown>,
                    old: (payload.old || {}) as Record<string, unknown>,
                });
            }
        )
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'relationships', filter: `project_id=eq.${projectId}` },
            (payload) => {
                queryClient.invalidateQueries({ queryKey: ['relationships', projectId] });
                notifyListeners({
                    table: 'relationships',
                    eventType: payload.eventType as RealtimeEvent['eventType'],
                    new: (payload.new || {}) as Record<string, unknown>,
                    old: (payload.old || {}) as Record<string, unknown>,
                });
            }
        )
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'timeline_variants', filter: `project_id=eq.${projectId}` },
            (payload) => {
                queryClient.invalidateQueries({ queryKey: ['variants'] });
                queryClient.invalidateQueries({ queryKey: ['projectVariants', projectId] });
                notifyListeners({
                    table: 'timeline_variants',
                    eventType: payload.eventType as RealtimeEvent['eventType'],
                    new: (payload.new || {}) as Record<string, unknown>,
                    old: (payload.old || {}) as Record<string, unknown>,
                });
            }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log(`✅ Realtime connected: project ${projectId}`);
            } else if (status === 'CHANNEL_ERROR') {
                console.warn('⚠️ Realtime channel error, will retry...');
            }
        });
}

/**
 * Unsubscribe from the current project channel.
 */
export function unsubscribeFromProject(): void {
    if (activeChannel) {
        supabase.removeChannel(activeChannel);
        activeChannel = null;
        activeProjectId = null;
    }
}

/**
 * Check if realtime is currently active.
 */
export function isRealtimeActive(): boolean {
    return activeChannel !== null;
}
