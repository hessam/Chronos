import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Project, Entity, TimelineVariant } from '../store/appStore';

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
        opts?: { type?: string; search?: string }
    ): Promise<{ entities: Entity[] }> {
        let query = supabase
            .from('entities')
            .select('*')
            .eq('project_id', projectId);

        if (opts?.type && opts.type !== 'all') {
            query = query.eq('entity_type', opts.type);
        }
        if (opts?.search) {
            const term = `%${opts.search}%`;
            query = query.or(`name.ilike.${term},description.ilike.${term}`);
        }

        const { data, error } = await query
            .order('sort_order', { ascending: true, nullsFirst: false }) // Primary sort: user defined (nulls go last)
            .order('created_at', { ascending: true }); // Secondary sort: oldest first for stable order

        if (error) throw new Error(error.message);
        return { entities: (data || []) as Entity[] };
    },

    async createEntity(
        projectId: string,
        body: { entity_type: string; name: string; description: string; properties: Record<string, unknown> }
    ): Promise<{ entity: Entity }> {
        // Get the next sort_order for this project
        const { data: maxData } = await supabase
            .from('entities')
            .select('sort_order')
            .eq('project_id', projectId)
            .order('sort_order', { ascending: false, nullsFirst: false })
            .limit(1)
            .single();
        const nextOrder = ((maxData?.sort_order as number | null) ?? -1) + 1;

        const { data, error } = await supabase
            .from('entities')
            .insert({ ...body, project_id: projectId, sort_order: nextOrder })
            .select()
            .single();
        if (error) throw new Error(error.message);
        return { entity: data as Entity };
    },

    async updateEntity(
        id: string,
        body: Partial<{ name: string; description: string; properties: Record<string, unknown>; position_x: number; position_y: number; color: string | null; entity_type: string; sort_order: number }>
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

    async reorderEntities(
        updates: { id: string; sort_order: number }[]
    ): Promise<void> {
        const { error } = await supabase.rpc('reorder_entities', { updates });

        if (error) {
            console.error('Supabase RPC Error:', error);
            throw new Error(error.message);
        }
    },

    async deleteEntity(id: string): Promise<void> {
        const { error } = await supabase
            .from('entities')
            .delete()
            .eq('id', id);
        if (error) throw new Error(error.message);
    },

    // ─── Timeline Variants ────────────────────────────────────
    async getVariants(entityId: string): Promise<{ variants: TimelineVariant[] }> {
        const { data, error } = await supabase
            .from('timeline_variants')
            .select('*')
            .eq('entity_id', entityId)
            .order('created_at', { ascending: true });
        if (error) throw new Error(error.message);
        return { variants: (data || []) as TimelineVariant[] };
    },

    async getVariantsByTimeline(timelineId: string): Promise<{ variants: TimelineVariant[] }> {
        const { data, error } = await supabase
            .from('timeline_variants')
            .select('*')
            .eq('timeline_id', timelineId)
            .order('created_at', { ascending: true });
        if (error) throw new Error(error.message);
        return { variants: (data || []) as TimelineVariant[] };
    },

    async getProjectVariants(projectId: string): Promise<{ variants: TimelineVariant[] }> {
        const { data, error } = await supabase
            .from('timeline_variants')
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: true });
        if (error) throw new Error(error.message);
        return { variants: (data || []) as TimelineVariant[] };
    },

    async upsertVariant(
        projectId: string,
        body: {
            entity_id: string;
            timeline_id: string;
            variant_name?: string | null;
            variant_description?: string | null;
            variant_properties?: Record<string, unknown>;
            position_x?: number | null;
            position_y?: number | null;
        }
    ): Promise<{ variant: TimelineVariant }> {
        const { data, error } = await supabase
            .from('timeline_variants')
            .upsert(
                { ...body, project_id: projectId },
                { onConflict: 'entity_id,timeline_id' }
            )
            .select()
            .single();
        if (error) throw new Error(error.message);
        return { variant: data as TimelineVariant };
    },

    async deleteVariant(entityId: string, timelineId: string): Promise<void> {
        const { error } = await supabase
            .from('timeline_variants')
            .delete()
            .eq('entity_id', entityId)
            .eq('timeline_id', timelineId);
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
        body: { from_entity_id: string; to_entity_id: string; relationship_type: string; label?: string; metadata?: Record<string, unknown> }
    ): Promise<{ relationship: unknown }> {
        const { data, error } = await supabase
            .from('relationships')
            .insert({ ...body, project_id: projectId, metadata: body.metadata || {} })
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

    // ─── Graph Traversal ──────────────────────────────────────
    async getRelatedEntities(
        entityId: string,
        depth: number = 2,
        projectId?: string
    ): Promise<{ entities: Entity[]; paths: { from: string; to: string; type: string }[] }> {
        // Get direct relationships (1-hop)
        let fromQuery = supabase
            .from('relationships')
            .select('from_entity_id, to_entity_id, relationship_type');
        let toQuery = supabase
            .from('relationships')
            .select('from_entity_id, to_entity_id, relationship_type');

        if (projectId) {
            fromQuery = fromQuery.eq('project_id', projectId);
            toQuery = toQuery.eq('project_id', projectId);
        }

        const [fromRes, toRes] = await Promise.all([
            fromQuery.eq('from_entity_id', entityId),
            toQuery.eq('to_entity_id', entityId),
        ]);

        if (fromRes.error) throw new Error(fromRes.error.message);
        if (toRes.error) throw new Error(toRes.error.message);

        const paths: { from: string; to: string; type: string }[] = [];
        const relatedIds = new Set<string>();

        // Collect 1-hop connections
        for (const r of (fromRes.data || [])) {
            const rel = r as { from_entity_id: string; to_entity_id: string; relationship_type: string };
            relatedIds.add(rel.to_entity_id);
            paths.push({ from: rel.from_entity_id, to: rel.to_entity_id, type: rel.relationship_type });
        }
        for (const r of (toRes.data || [])) {
            const rel = r as { from_entity_id: string; to_entity_id: string; relationship_type: string };
            relatedIds.add(rel.from_entity_id);
            paths.push({ from: rel.from_entity_id, to: rel.to_entity_id, type: rel.relationship_type });
        }

        // 2-hop: get relationships from 1-hop entities
        if (depth >= 2 && relatedIds.size > 0) {
            const hop2Ids = Array.from(relatedIds);
            const [hop2From, hop2To] = await Promise.all([
                supabase.from('relationships').select('from_entity_id, to_entity_id, relationship_type').in('from_entity_id', hop2Ids),
                supabase.from('relationships').select('from_entity_id, to_entity_id, relationship_type').in('to_entity_id', hop2Ids),
            ]);

            for (const r of (hop2From.data || [])) {
                const rel = r as { from_entity_id: string; to_entity_id: string; relationship_type: string };
                if (rel.to_entity_id !== entityId) {
                    relatedIds.add(rel.to_entity_id);
                    paths.push({ from: rel.from_entity_id, to: rel.to_entity_id, type: rel.relationship_type });
                }
            }
            for (const r of (hop2To.data || [])) {
                const rel = r as { from_entity_id: string; to_entity_id: string; relationship_type: string };
                if (rel.from_entity_id !== entityId) {
                    relatedIds.add(rel.from_entity_id);
                    paths.push({ from: rel.from_entity_id, to: rel.to_entity_id, type: rel.relationship_type });
                }
            }
        }

        // Fetch the actual entities
        if (relatedIds.size === 0) {
            return { entities: [], paths: [] };
        }

        const { data: entityData, error: entityError } = await supabase
            .from('entities')
            .select('*')
            .in('id', Array.from(relatedIds));

        if (entityError) throw new Error(entityError.message);
        return { entities: (entityData || []) as Entity[], paths };
    },

    // ─── Full-Text Search (E6-US2) ────────────────────────────
    async searchEntities(
        projectId: string,
        query: string,
        opts?: { limit?: number }
    ): Promise<{ results: Entity[]; grouped: Record<string, Entity[]> }> {
        const limit = opts?.limit || 20;
        const trimmed = query.trim();
        if (!trimmed) return { results: [], grouped: {} };

        const { data, error } = await supabase
            .from('entities')
            .select('*')
            .eq('project_id', projectId)
            .or(`name.ilike.%${trimmed}%,description.ilike.%${trimmed}%`)
            .order('updated_at', { ascending: false })
            .limit(limit);

        if (error) throw new Error(error.message);
        const results = (data || []) as Entity[];

        // Group results by entity_type
        const grouped: Record<string, Entity[]> = {};
        for (const entity of results) {
            if (!grouped[entity.entity_type]) grouped[entity.entity_type] = [];
            grouped[entity.entity_type].push(entity);
        }

        return { results, grouped };
    },

    // ─── Single Entity Fetch ──────────────────────────────────
    async getEntity(id: string): Promise<{ entity: Entity }> {
        const { data, error } = await supabase
            .from('entities')
            .select('*')
            .eq('id', id)
            .single();
        if (error) throw new Error(error.message);
        return { entity: data as Entity };
    },
};
