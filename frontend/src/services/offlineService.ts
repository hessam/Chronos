/**
 * Offline Service (E6-US1)
 * Detects online/offline status, queues operations, and syncs on reconnect.
 */

export interface QueuedOperation {
    id: string;
    operation: 'INSERT' | 'UPDATE' | 'DELETE';
    table: string;
    payload: Record<string, unknown>;
    timestamp: number;
}

const DB_NAME = 'chronos-offline';
const STORE_NAME = 'operations';
const CACHE_STORE = 'entity-cache';
const DB_VERSION = 1;

type StatusCallback = (online: boolean, pendingCount: number) => void;
type SyncCallback = (progress: number, total: number) => void;

let statusListeners: Set<StatusCallback> = new Set();
let syncListeners: Set<SyncCallback> = new Set();

// ─── IndexedDB Helpers ────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(CACHE_STORE)) {
                db.createObjectStore(CACHE_STORE, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function addToQueue(op: QueuedOperation): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(op);
        tx.oncomplete = () => { resolve(); notifyStatus(); };
        tx.onerror = () => reject(tx.error);
    });
}

async function getQueue(): Promise<QueuedOperation[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => resolve(req.result as QueuedOperation[]);
        req.onerror = () => reject(req.error);
    });
}

async function removeFromQueue(id: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function getPendingCount(): Promise<number> {
    const queue = await getQueue();
    return queue.length;
}

// ─── Cache Helpers ────────────────────────────────────────

export async function cacheEntities(entities: Record<string, unknown>[]): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(CACHE_STORE, 'readwrite');
        const store = tx.objectStore(CACHE_STORE);
        for (const entity of entities) {
            store.put(entity);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function getCachedEntities(): Promise<Record<string, unknown>[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(CACHE_STORE, 'readonly');
        const req = tx.objectStore(CACHE_STORE).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

// ─── Status Tracking ──────────────────────────────────────

export function isOnline(): boolean {
    return navigator.onLine;
}

async function notifyStatus(): Promise<void> {
    const online = isOnline();
    const count = await getPendingCount();
    statusListeners.forEach(cb => cb(online, count));
}

export function onStatusChange(callback: StatusCallback): () => void {
    statusListeners.add(callback);
    return () => statusListeners.delete(callback);
}

export function onSyncProgress(callback: SyncCallback): () => void {
    syncListeners.add(callback);
    return () => syncListeners.delete(callback);
}

// ─── Queue Operations ─────────────────────────────────────

export async function queueOperation(
    operation: QueuedOperation['operation'],
    table: string,
    payload: Record<string, unknown>
): Promise<void> {
    const op: QueuedOperation = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        operation,
        table,
        payload,
        timestamp: Date.now(),
    };
    await addToQueue(op);
}

// ─── Sync Engine ──────────────────────────────────────────

import { supabase } from './api';

export async function syncPendingOperations(): Promise<{ synced: number; failed: number }> {
    if (!isOnline()) return { synced: 0, failed: 0 };

    const queue = await getQueue();
    if (queue.length === 0) return { synced: 0, failed: 0 };

    // Sort by timestamp
    queue.sort((a, b) => a.timestamp - b.timestamp);

    let synced = 0;
    let failed = 0;

    for (let i = 0; i < queue.length; i++) {
        const op = queue[i];
        syncListeners.forEach(cb => cb(i + 1, queue.length));

        try {
            switch (op.operation) {
                case 'INSERT': {
                    const { error } = await supabase.from(op.table).insert(op.payload);
                    if (error) throw error;
                    break;
                }
                case 'UPDATE': {
                    const id = op.payload.id as string;
                    const { id: _id, ...rest } = op.payload;
                    void _id;
                    const { error } = await supabase.from(op.table).update(rest).eq('id', id);
                    if (error) throw error;
                    break;
                }
                case 'DELETE': {
                    const { error } = await supabase.from(op.table).delete().eq('id', op.payload.id as string);
                    if (error) throw error;
                    break;
                }
            }
            await removeFromQueue(op.id);
            synced++;
        } catch (err) {
            console.warn(`Sync failed for ${op.id}:`, err);
            failed++;
        }
    }

    await notifyStatus();
    return { synced, failed };
}

// ─── Initialize Listeners ─────────────────────────────────

export function initOfflineListeners(): () => void {
    const handleOnline = () => {
        notifyStatus();
        syncPendingOperations();
    };
    const handleOffline = () => notifyStatus();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    notifyStatus();

    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        statusListeners = new Set();
        syncListeners = new Set();
    };
}
