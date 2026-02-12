import { FastifyInstance } from 'fastify';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth.js';
import { createUserClient } from '../../config/supabase.js';
import { createRelationshipSchema } from '../../types/schemas.js';

export async function relationshipRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', authMiddleware);

    // ─── List Relationships for Project ───────────────────────
    fastify.get('/:projectId/relationships', async (request, reply) => {
        const { accessToken } = request as AuthenticatedRequest;
        const { projectId } = request.params as { projectId: string };

        const db = createUserClient(accessToken);
        const { data, error } = await db
            .from('relationships')
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false });

        if (error) {
            return reply.code(500).send({ error: error.message });
        }

        return { relationships: data };
    });

    // ─── Create Relationship ──────────────────────────────────
    fastify.post('/:projectId/relationships', async (request, reply) => {
        const { accessToken } = request as AuthenticatedRequest;
        const { projectId } = request.params as { projectId: string };

        const parsed = createRelationshipSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ error: parsed.error.errors[0].message });
        }

        const db = createUserClient(accessToken);
        const { data, error } = await db
            .from('relationships')
            .insert({ ...parsed.data, project_id: projectId })
            .select()
            .single();

        if (error) {
            return reply.code(500).send({ error: error.message });
        }

        return reply.code(201).send({ relationship: data });
    });

    // ─── Delete Relationship ──────────────────────────────────
    fastify.delete('/relationships/:id', async (request, reply) => {
        const { accessToken } = request as AuthenticatedRequest;
        const { id } = request.params as { id: string };

        const db = createUserClient(accessToken);
        const { error } = await db
            .from('relationships')
            .delete()
            .eq('id', id);

        if (error) {
            return reply.code(500).send({ error: error.message });
        }

        return reply.code(204).send();
    });
}
