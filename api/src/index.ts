import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';

import { authRoutes } from './routes/v1/auth.js';
import { projectRoutes } from './routes/v1/projects.js';
import { entityRoutes } from './routes/v1/entities.js';
import { relationshipRoutes } from './routes/v1/relationships.js';

dotenv.config();

const server = Fastify({
    logger: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport:
            process.env.NODE_ENV !== 'production'
                ? { target: 'pino-pretty', options: { colorize: true } }
                : undefined,
    },
});

// ─── CORS ────────────────────────────────────────────────────
await server.register(cors, {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
});

// ─── Health Check ────────────────────────────────────────────
server.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
}));

// ─── API Routes ──────────────────────────────────────────────
server.register(authRoutes, { prefix: '/api/v1/auth' });
server.register(projectRoutes, { prefix: '/api/v1/projects' });
server.register(entityRoutes, { prefix: '/api/v1/projects' });
server.register(relationshipRoutes, { prefix: '/api/v1/projects' });

// ─── Start Server ────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

try {
    await server.listen({ port: PORT, host: HOST });
    console.log(`🚀 Chronos API running at http://${HOST}:${PORT}`);
} catch (err) {
    server.log.error(err);
    process.exit(1);
}
