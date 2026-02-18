import { useState, useCallback, useRef } from 'react';

// ─── Types ──────────────────────────────────────────────────────
export interface UndoAction {
    type: string;
    label: string;
    apply: () => Promise<void> | void;
    revert: () => Promise<void> | void;
}

interface UndoState {
    past: UndoAction[];
    future: UndoAction[];
}

const MAX_STACK = 50;

// ─── Hook ───────────────────────────────────────────────────────
export function useUndoRedo() {
    const [state, setState] = useState<UndoState>({ past: [], future: [] });
    const busyRef = useRef(false);

    const push = useCallback(async (action: UndoAction) => {
        await action.apply();
        setState(s => ({
            past: [...s.past.slice(-(MAX_STACK - 1)), action],
            future: [],
        }));
    }, []);

    const undo = useCallback(async () => {
        if (busyRef.current) return;
        setState(s => {
            const last = s.past[s.past.length - 1];
            if (!last) return s;
            busyRef.current = true;
            Promise.resolve(last.revert()).then(() => { busyRef.current = false; });
            return {
                past: s.past.slice(0, -1),
                future: [last, ...s.future],
            };
        });
    }, []);

    const redo = useCallback(async () => {
        if (busyRef.current) return;
        setState(s => {
            const next = s.future[0];
            if (!next) return s;
            busyRef.current = true;
            Promise.resolve(next.apply()).then(() => { busyRef.current = false; });
            return {
                past: [...s.past, next],
                future: s.future.slice(1),
            };
        });
    }, []);

    return {
        undo,
        redo,
        push,
        canUndo: state.past.length > 0,
        canRedo: state.future.length > 0,
        lastAction: state.past[state.past.length - 1]?.label || null,
    };
}
