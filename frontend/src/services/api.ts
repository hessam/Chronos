import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Project, Entity } from '../store/appStore';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Only create real client if env vars are set
let supabase: SupabaseClient;

if (supabaseUrl && supabaseAnonKey) {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
} else {
    console.warn('⚠️ Supabase credentials not configured. Running in demo mode.');
    supabase = {
        auth: {
            getSession: async () => ({ data: { session: null }, error: null }),
            getUser: async () => ({ data: { user: null }, error: null }),
            signUp: async () => { throw new Error('Supabase not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env'); },
            signInWithPassword: async () => { throw new Error('Supabase not configured.'); },
            signOut: async () => ({ error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => { } } } }),
            refreshSession: async () => ({ data: { session: null }, error: null }),
        },
    } as unknown as SupabaseClient;
}

export { supabase };

// ─── Supabase Direct CRUD API ──────────────────────────────────

export const api = {
    // ─── Projects ─────────────────────────────────────────────
    async getProjects(): Promise<{ projects: Project[] }> {
        const { data, error } = await supabase
            .from('projects')
            .select('*')
            .order('updated_at', { ascending: false });
        if (error) throw new Error(error.message);
        return { projects: (data || []) as Project[] };
    },

    async getProject(id: string): Promise<{ project: Project }> {
        const { data, error } = await supabase
            .from('projects')
            .select('*')
            .eq('id', id)
            .single();
        if (error) throw new Error(error.message);
        return { project: data as Project };
    },

    async createProject(body: { name: string; description: string }): Promise<{ project: Project }> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { data, error } = await supabase
            .from('projects')
            .insert({ ...body, user_id: user.id })
            .select()
            .single();
        if (error) throw new Error(error.message);
        return { project: data as Project };
    },

    async updateProject(id: string, body: Partial<Project>): Promise<{ project: Project }> {
        const { data, error } = await supabase
            .from('projects')
            .update(body)
            .eq('id', id)
            .select()
            .single();
        if (error) throw new Error(error.message);
        return { project: data as Project };
    },

    async deleteProject(id: string): Promise<void> {
        const { error } = await supabase
            .from('projects')
            .delete()
            .eq('id', id);
        if (error) throw new Error(error.message);
    },

    // ─── Entities ─────────────────────────────────────────────
    async getEntities(
        projectId: string,
        opts?: { type?: string; search?: string; limit?: number }
    ): Promise<{ entities: Entity[] }> {
        let query = supabase
            .from('entities')
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false });

        if (opts?.type && opts.type !== 'all') {
            query = query.eq('entity_type', opts.type);
        }
        if (opts?.search) {
            query = query.ilike('name', `%${opts.search}%`);
        }
        if (opts?.limit) {
            query = query.limit(opts.limit);
        }

        const { data, error } = await query;
        if (error) throw new Error(error.message);
        return { entities: (data || []) as Entity[] };
    },

    async createEntity(
        projectId: string,
        body: { entity_type: string; name: string; description: string; properties: Record<string, unknown> }
    ): Promise<{ entity: Entity }> {
        const { data, error } = await supabase
            .from('entities')
            .insert({ ...body, project_id: projectId })
            .select()
            .single();
        if (error) throw new Error(error.message);
        return { entity: data as Entity };
    },

    async updateEntity(
        id: string,
        body: Partial<{ name: string; description: string; properties: Record<string, unknown>; position_x: number; position_y: number; color: string | null; entity_type: string }>
    ): Promise<{ entity: Entity }> {
        const { data, error } = await supabase
            .from('entities')
            .update(body)
            .eq('id', id)
            .select()
            .single();
        if (error) throw new Error(error.message);
        return { entity: data as Entity };
    },

    async deleteEntity(id: string): Promise<void> {
        const { error } = await supabase
            .from('entities')
            .delete()
            .eq('id', id);
        if (error) throw new Error(error.message);
    },

    // ─── Relationships ────────────────────────────────────────
    async getRelationships(projectId: string): Promise<{ relationships: unknown[] }> {
        const { data, error } = await supabase
            .from('relationships')
            .select('*')
            .eq('project_id', projectId);
        if (error) throw new Error(error.message);
        return { relationships: data || [] };
    },

    async createRelationship(
        projectId: string,
        body: { from_entity_id: string; to_entity_id: string; relationship_type: string; label?: string }
    ): Promise<{ relationship: unknown }> {
        const { data, error } = await supabase
            .from('relationships')
            .insert({ ...body, project_id: projectId })
            .select()
            .single();
        if (error) throw new Error(error.message);
        return { relationship: data };
    },

    async deleteRelationship(id: string): Promise<void> {
        const { error } = await supabase
            .from('relationships')
            .delete()
            .eq('id', id);
        if (error) throw new Error(error.message);
    },
};
