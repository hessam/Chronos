import { FastifyInstance } from 'fastify';
import { supabase } from '../../config/supabase.js';
import { signUpSchema, loginSchema } from '../../types/schemas.js';

export async function authRoutes(fastify: FastifyInstance) {
    // ─── Sign Up ───────────────────────────────────────────────
    fastify.post('/signup', async (request, reply) => {
        const parsed = signUpSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ error: parsed.error.errors[0].message });
        }

        const { email, password, name } = parsed.data;

        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { name },
            },
        });

        if (error) {
            return reply.code(400).send({ error: error.message });
        }

        return reply.code(201).send({
            user: {
                id: data.user?.id,
                email: data.user?.email,
                name: data.user?.user_metadata?.name,
            },
            session: data.session,
        });
    });

    // ─── Login ─────────────────────────────────────────────────
    fastify.post('/login', async (request, reply) => {
        const parsed = loginSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({ error: parsed.error.errors[0].message });
        }

        const { email, password } = parsed.data;

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            return reply.code(401).send({ error: 'Invalid email or password' });
        }

        return {
            user: {
                id: data.user.id,
                email: data.user.email,
                name: data.user.user_metadata?.name,
            },
            session: {
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
                expires_at: data.session.expires_at,
            },
        };
    });

    // ─── Refresh Token ────────────────────────────────────────
    fastify.post('/refresh', async (request, reply) => {
        const { refresh_token } = request.body as { refresh_token: string };

        if (!refresh_token) {
            return reply.code(400).send({ error: 'Refresh token is required' });
        }

        const { data, error } = await supabase.auth.refreshSession({
            refresh_token,
        });

        if (error) {
            return reply.code(401).send({ error: 'Invalid refresh token' });
        }

        return {
            session: {
                access_token: data.session!.access_token,
                refresh_token: data.session!.refresh_token,
                expires_at: data.session!.expires_at,
            },
        };
    });

    // ─── Get Current User ─────────────────────────────────────
    fastify.get('/me', async (request, reply) => {
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return reply.code(401).send({ error: 'Not authenticated' });
        }

        const token = authHeader.split(' ')[1];
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            return reply.code(401).send({ error: 'Invalid token' });
        }

        return {
            user: {
                id: user.id,
                email: user.email,
                name: user.user_metadata?.name,
                created_at: user.created_at,
            },
        };
    });

    // ─── Logout ────────────────────────────────────────────────
    fastify.post('/logout', async (request, reply) => {
        const authHeader = request.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            await supabase.auth.signOut();
        }
        return { message: 'Logged out successfully' };
    });
}
