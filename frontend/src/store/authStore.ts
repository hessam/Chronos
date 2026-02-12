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

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    session: null,
    isLoading: true,
    isAuthenticated: false,

    initialize: async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            set({
                user: session?.user ?? null,
                session,
                isAuthenticated: !!session,
                isLoading: false,
            });

            // Listen for auth changes
            supabase.auth.onAuthStateChange((_event, session) => {
                set({
                    user: session?.user ?? null,
                    session,
                    isAuthenticated: !!session,
                });
            });
        } catch (err) {
            console.warn('Auth initialization failed:', err);
            set({ isLoading: false, isAuthenticated: false });
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
