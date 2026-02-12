import { create } from 'zustand';
import { supabase } from '../services/api';
import type { User, Session } from '@supabase/supabase-js';

interface AuthState {
    user: User | null;
    session: Session | null;
    isLoading: boolean;
    isAuthenticated: boolean;

    initialize: () => Promise<void>;
    signUp: (email: string, password: string, name: string) => Promise<void>;
    signIn: (email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
}

// Timeout for auth initialization — prevents infinite blank page
const AUTH_TIMEOUT_MS = 8000;

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    session: null,
    isLoading: true,
    isAuthenticated: false,

    initialize: async () => {
        // Guard against double initialization
        if (!get().isLoading) return;

        let resolved = false;

        // Timeout fallback: if Supabase is slow, stop loading and show login
        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                console.warn('⚠️ Auth initialization timed out after', AUTH_TIMEOUT_MS, 'ms — falling back to unauthenticated.');
                set({ isLoading: false, isAuthenticated: false });
            }
        }, AUTH_TIMEOUT_MS);

        try {
            const { data: { session }, error } = await supabase.auth.getSession();

            if (error) {
                console.warn('Auth session check failed:', error.message);
            }

            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                set({
                    user: session?.user ?? null,
                    session,
                    isAuthenticated: !!session,
                    isLoading: false,
                });
            }

            // Listen for auth changes (sign-in, sign-out, token refresh)
            supabase.auth.onAuthStateChange((_event, session) => {
                set({
                    user: session?.user ?? null,
                    session,
                    isAuthenticated: !!session,
                    isLoading: false, // Always mark loading as done on any auth event
                });
            });

            // Note: subscription lives for the app lifetime (no cleanup needed)
        } catch (err) {
            clearTimeout(timeout);
            if (!resolved) {
                resolved = true;
                console.warn('Auth initialization failed:', err);
                set({ isLoading: false, isAuthenticated: false });
            }
        }
    },

    signUp: async (email, password, name) => {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { name } },
        });
        if (error) throw error;
        set({ user: data.user, session: data.session, isAuthenticated: !!data.session });
    },

    signIn: async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        set({ user: data.user, session: data.session, isAuthenticated: true });
    },

    signOut: async () => {
        await supabase.auth.signOut();
        set({ user: null, session: null, isAuthenticated: false });
    },
}));
