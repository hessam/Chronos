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

    // ─── Graph Traversal (N-depth BFS) ──────────────────────────
    async getRelatedEntities(
        entityId: string,
        depth: number = 2,
        projectId?: string,
        opts?: { relationshipTypes?: string[]; entityTypes?: string[] }
    ): Promise<{
        entities: Entity[];
        paths: { from: string; to: string; type: string; degree: number }[];
        degrees: Map<string, number>;
    }> {
        type Edge = { from_entity_id: string; to_entity_id: string; relationship_type: string };

        // Fetch ALL relationships for the project in one query (fast for moderate projects)
        let query = supabase
            .from('relationships')
            .select('from_entity_id, to_entity_id, relationship_type');
        if (projectId) query = query.eq('project_id', projectId);
        const { data: allRels, error: relError } = await query;
        if (relError) throw new Error(relError.message);

        const edges = (allRels || []) as Edge[];

        // Apply relationship type filter
        const filteredEdges = opts?.relationshipTypes?.length
            ? edges.filter(e => opts.relationshipTypes!.includes(e.relationship_type))
            : edges;

        // Build adjacency list (bidirectional)
        const adj = new Map<string, { neighbor: string; edge: Edge }[]>();
        for (const e of filteredEdges) {
            if (!adj.has(e.from_entity_id)) adj.set(e.from_entity_id, []);
            if (!adj.has(e.to_entity_id)) adj.set(e.to_entity_id, []);
            adj.get(e.from_entity_id)!.push({ neighbor: e.to_entity_id, edge: e });
            adj.get(e.to_entity_id)!.push({ neighbor: e.from_entity_id, edge: e });
        }

        // BFS from source entity
        const visited = new Map<string, number>(); // entityId → degree
        visited.set(entityId, 0);
        const paths: { from: string; to: string; type: string; degree: number }[] = [];
        const seenEdges = new Set<string>();

        let frontier = [entityId];
        for (let d = 1; d <= Math.min(depth, 5); d++) {
            const nextFrontier: string[] = [];
            for (const nodeId of frontier) {
                for (const { neighbor, edge } of (adj.get(nodeId) || [])) {
                    // Track unique edges
                    const edgeKey = `${edge.from_entity_id}→${edge.to_entity_id}→${edge.relationship_type}`;
                    if (!seenEdges.has(edgeKey)) {
                        seenEdges.add(edgeKey);
                        paths.push({ from: edge.from_entity_id, to: edge.to_entity_id, type: edge.relationship_type, degree: d });
                    }
                    if (!visited.has(neighbor)) {
                        visited.set(neighbor, d);
                        nextFrontier.push(neighbor);
                    }
                }
            }
            frontier = nextFrontier;
            if (frontier.length === 0) break;
        }

        // Remove source entity from results
        visited.delete(entityId);

        if (visited.size === 0) {
            return { entities: [], paths: [], degrees: new Map() };
        }

        // Fetch entities
        const { data: entityData, error: entityError } = await supabase
            .from('entities')
            .select('*')
            .in('id', Array.from(visited.keys()));

        if (entityError) throw new Error(entityError.message);

        let resultEntities = (entityData || []) as Entity[];

        // Apply entity type filter
        if (opts?.entityTypes?.length) {
            resultEntities = resultEntities.filter(e => opts.entityTypes!.includes(e.entity_type));
        }

        return { entities: resultEntities, paths, degrees: visited };
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
