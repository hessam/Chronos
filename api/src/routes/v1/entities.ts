import { FastifyInstance } from 'fastify';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth.js';
import { createUserClient } from '../../config/supabase.js';
import {
    createEntitySchema,
    updateEntitySchema,
    paginationSchema,
    EntityType,
} from '../../types/schemas.js';

export async function entityRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', authMiddleware);

    // ─── List Entities ─────────────────────────────────────────
    fastify.get('/:projectId/entities', async (request, reply) => {
        const { accessToken } = request as AuthenticatedRequest;
        const { projectId } = request.params as { projectId: string };
        const queryParams = request.query as Record<string, string>;

        const query = paginationSchema.safeParse(queryParams);
        const { page, limit } = query.success ? query.data : { page: 1, limit: 50 };
        const entityType = queryParams.type as EntityType | undefined;
        const search = queryParams.search;

        const db = createUserClient(accessToken);
        const from = (page - 1) * limit;

        let q = db
            .from('entities')
            .select('*', { count: 'exact' })
            .eq('project_id', projectId)
            .order('updated_at', { ascending: false })
            .range(from, from + limit - 1);

        if (entityType) {
            q = q.eq('entity_type', entityType);
        }

        if (search) {
            q = q.ilike('name', `%${search}%`);
        }

        const { data, error, count } = await q;

        if (error) {
            return reply.code(500).send({ error: error.message });
        }

        return { entities: data, total: count, page, limit };
    });

    // ─── Get Entity ────────────────────────────────────────────
    fastify.get('/entities/:id', async (request, reply) => {
        const { accessToken } = request as AuthenticatedRequest;
        const { id } = request.params as { id: string };

        const db = createUserClient(accessToken);
        const { data, error } = await db
            .from('entities')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !data) {
            return reply.code(404).send({ error: 'Entity not found' });
        }

        // Fetch relationships for this entity
        const { data: relationships } = await db
            .from('relationships')
            .select(`
        id,
        relationship_type,
        label,
        metadata,
        from_entity_id,
        to_entity_id,
        created_at
      `)
            .or(`from_entity_id.eq.${id},to_entity_id.eq.${id}`);

        return { entity: data, relationships: relationships || [] };
    });

    // ─── Create Entity ─────────────────────────────────────────
    fastify.post('/:projectId/entities', async (request, reply) => {
        const { accessToken } = request as AuthenticatedRequest;
        const { projectId } = request.params as { projectId: string };

        const parsed = createEntitySchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ error: parsed.error.errors[0].message });
        }

        const db = createUserClient(accessToken);
        const { data, error } = await db
            .from('entities')
            .insert({ ...parsed.data, project_id: projectId })
            .select()
            .single();

        if (error) {
            return reply.code(500).send({ error: error.message });
        }

        return reply.code(201).send({ entity: data });
    });

    // ─── Update Entity ──────────────────────────────────────────
    fastify.put('/entities/:id', async (request, reply) => {
        const { accessToken } = request as AuthenticatedRequest;
        const { id } = request.params as { id: string };

        const parsed = updateEntitySchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ error: parsed.error.errors[0].message });
        }

        const db = createUserClient(accessToken);
        const { data, error } = await db
            .from('entities')
            .update(parsed.data)
            .eq('id', id)
            .select()
            .single();

        if (error || !data) {
            return reply.code(404).send({ error: 'Entity not found' });
        }

        return { entity: data };
    });

    // ─── Delete Entity ─────────────────────────────────────────
    fastify.delete('/entities/:id', async (request, reply) => {
        const { accessToken } = request as AuthenticatedRequest;
        const { id } = request.params as { id: string };

        const db = createUserClient(accessToken);
        const { error } = await db
            .from('entities')
            .delete()
            .eq('id', id);

        if (error) {
            return reply.code(500).send({ error: error.message });
        }

        return reply.code(204).send();
    });
}
