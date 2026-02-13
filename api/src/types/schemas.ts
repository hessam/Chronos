import { z } from 'zod';

// ============================================================
// Auth Schemas
// ============================================================
export const signUpSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().min(1, 'Name is required').max(100),
});

export const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
});

// ============================================================
// Project Schemas
// ============================================================
export const createProjectSchema = z.object({
    name: z.string().min(1, 'Project name is required').max(200),
    description: z.string().max(2000).default(''),
});

export const updateProjectSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    settings: z.record(z.unknown()).optional(),
});

// ============================================================
// Entity Schemas
// ============================================================
export const entityTypes = [
    'character', 'timeline', 'event', 'arc', 'theme', 'location', 'note', 'chapter',
] as const;

export type EntityType = (typeof entityTypes)[number];

export const createEntitySchema = z.object({
    entity_type: z.enum(entityTypes),
    name: z.string().min(1, 'Name is required').max(300),
    description: z.string().max(5000).default(''),
    properties: z.record(z.unknown()).default({}),
    color: z.string().nullable().default(null),
});

export const updateEntitySchema = z.object({
    name: z.string().min(1).max(300).optional(),
    description: z.string().max(5000).optional(),
    properties: z.record(z.unknown()).optional(),
    color: z.string().nullable().optional(),
    position_x: z.number().optional(),
    position_y: z.number().optional(),
});

// ============================================================
// Relationship Schemas
// ============================================================
export const createRelationshipSchema = z.object({
    from_entity_id: z.string().uuid(),
    to_entity_id: z.string().uuid(),
    relationship_type: z.string().min(1, 'Relationship type is required').max(200),
    label: z.string().max(500).default(''),
    metadata: z.record(z.unknown()).default({}),
});

// ============================================================
// Query Schemas
// ============================================================
export const paginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
});

// ============================================================
// Type Exports
// ============================================================
export type SignUpInput = z.infer<typeof signUpSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type CreateEntityInput = z.infer<typeof createEntitySchema>;
export type UpdateEntityInput = z.infer<typeof updateEntitySchema>;
export type CreateRelationshipInput = z.infer<typeof createRelationshipSchema>;
