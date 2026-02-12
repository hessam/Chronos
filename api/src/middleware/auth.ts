import { FastifyRequest, FastifyReply } from 'fastify';
import { supabase } from '../config/supabase.js';

export interface AuthenticatedRequest extends FastifyRequest {
    userId: string;
    accessToken: string;
}

export async function authMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.code(401).send({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.split(' ')[1];

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
        return reply.code(401).send({ error: 'Invalid or expired token' });
    }

    (request as AuthenticatedRequest).userId = user.id;
    (request as AuthenticatedRequest).accessToken = token;
}
