import { FastifyInstance } from 'fastify';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth.js';
import { createUserClient } from '../../config/supabase.js';
import { createProjectSchema, updateProjectSchema, paginationSchema } from '../../types/schemas.js';

export async function projectRoutes(fastify: FastifyInstance) {
    // Apply auth middleware to all routes
    fastify.addHook('preHandler', authMiddleware);

    // ─── List Projects ─────────────────────────────────────────
    fastify.get('/', async (request, reply) => {
        const { userId, accessToken } = request as AuthenticatedRequest;
        const query = paginationSchema.safeParse(request.query);
        const { page, limit } = query.success ? query.data : { page: 1, limit: 50 };

        const db = createUserClient(accessToken);
        const from = (page - 1) * limit;

        const { data, error, count } = await db
            .from('projects')
            .select('*', { count: 'exact' })
            .eq('user_id', userId)
            .order('updated_at', { ascending: false })
            .range(from, from + limit - 1);

        if (error) {
            return reply.code(500).send({ error: error.message });
        }

        return { projects: data, total: count, page, limit };
    });

    // ─── Get Project ───────────────────────────────────────────
    fastify.get('/:id', async (request, reply) => {
        const { accessToken } = request as AuthenticatedRequest;
        const { id } = request.params as { id: string };

        const db = createUserClient(accessToken);
        const { data, error } = await db
            .from('projects')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !data) {
            return reply.code(404).send({ error: 'Project not found' });
        }

        return { project: data };
    });

    // ─── Create Project ────────────────────────────────────────
    fastify.post('/', async (request, reply) => {
        const { userId, accessToken } = request as AuthenticatedRequest;

        const parsed = createProjectSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ error: parsed.error.errors[0].message });
        }

        const db = createUserClient(accessToken);
        const { data, error } = await db
            .from('projects')
            .insert({ ...parsed.data, user_id: userId })
            .select()
            .single();

        if (error) {
            return reply.code(500).send({ error: error.message });
        }

        return reply.code(201).send({ project: data });
    });

    // ─── Update Project ────────────────────────────────────────
    fastify.put('/:id', async (request, reply) => {
        const { accessToken } = request as AuthenticatedRequest;
        const { id } = request.params as { id: string };

        const parsed = updateProjectSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ error: parsed.error.errors[0].message });
        }

        const db = createUserClient(accessToken);
        const { data, error } = await db
            .from('projects')
            .update(parsed.data)
            .eq('id', id)
            .select()
            .single();

        if (error || !data) {
            return reply.code(404).send({ error: 'Project not found' });
        }

        return { project: data };
    });

    // ─── Delete Project ────────────────────────────────────────
    fastify.delete('/:id', async (request, reply) => {
        const { accessToken } = request as AuthenticatedRequest;
        const { id } = request.params as { id: string };

        const db = createUserClient(accessToken);
        const { error } = await db
            .from('projects')
            .delete()
            .eq('id', id);

        if (error) {
            return reply.code(500).send({ error: error.message });
        }

        return reply.code(204).send();
    });
}
