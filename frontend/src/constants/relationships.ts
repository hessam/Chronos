export const RELATIONSHIP_TYPES = [
    'causes',
    'branches_into',
    'inspires',
    'makes',
    'parent_of',
    'sibling_of',
    'caused_by',
    'occurs_in',
    'happens_at',
    'located_at',
    'involves',
    'explores_theme',
    'demonstrates',
    'contrasts_with',
    'sets_up',
    'observes',
    'leads_to',
    'parallels',
    'foreshadows',
    'threatens',
    'concludes',
    'reveals',
    'arrives_before',
    'currently_in',
    'means',
    'creates',
    'originates_in',
    'references',
    'costs'
] as const;

export type RelationshipType = typeof RELATIONSHIP_TYPES[number];

// Types that drive the DAG (left-to-right flow) and Arc Chains
export const CAUSAL_TYPES = new Set<string>([
    'causes',
    'caused_by',
    'leads_to',
    'creates',
    'sets_up',
    'concludes',
    'branches_into',
    'inspires',
    'makes',
    'originates_in',
    'threatens',
    'parent_of', // Often used to show lineage/flow, so treated as causal
]);

// Types that are strictly structural (not causal)
export const STRUCTURAL_TYPES = new Set<string>([
    'sibling_of',
    'occurs_in',
    'happens_at',
    'located_at',
    'involves',
    'explores_theme',
    'demonstrates',
    'contrasts_with',
    'observes',
    'parallels',
    'foreshadows',
    'reveals',
    'arrives_before',
    'currently_in',
    'means',
    'references',
    'costs'
]);

// Definition of Quick Connect options and UI styles
export const QUICK_REL_TYPES: Array<{ value: string; label: string; color: string }> = [
    { value: 'causes', label: '⚡ Causes', color: '#f59e0b' },
    { value: 'leads_to', label: '➡️ Leads To', color: '#f59e0b' },
    { value: 'creates', label: '✨ Creates', color: '#10b981' },
    { value: 'threatens', label: '⚠️ Threatens', color: '#ef4444' },
    { value: 'inspires', label: '💡 Inspires', color: '#eab308' },
    { value: 'sets_up', label: '🏗️ Sets Up', color: '#8b5cf6' },
    { value: 'involves', label: '🤝 Involves', color: '#6366f1' },
    { value: 'happens_at', label: '📍 Happens At', color: '#ec4899' },
    { value: 'occurs_in', label: '🌐 Occurs In', color: '#ec4899' },
    { value: 'references', label: '📎 References', color: '#64748b' },
    { value: 'parent_of', label: '🌳 Parent Of', color: '#06b6d4' },
    { value: 'branches_into', label: '🔀 Branches Into', color: '#f97316' },
    { value: 'explores_theme', label: '💎 Explores Theme', color: '#c084fc' },
    { value: 'demonstrates', label: '📝 Demonstrates', color: '#94a3b8' },
];

export const isValidRelationshipType = (type: string): type is RelationshipType => {
    return RELATIONSHIP_TYPES.includes(type as RelationshipType);
};

// Entity-specific restrictions. If a type is in here, it can only be used between the specified valid entity types.
export const RELATIONSHIP_CONSTRAINTS: Record<string, { from?: string[]; to?: string[] }> = {
    branches_into: { to: ['timeline'] },
    parent_of: { from: ['character'], to: ['character'] },
    sibling_of: { from: ['character'], to: ['character'] },
    happens_at: { to: ['location'] },
    located_at: { to: ['location'] },
    involves: { to: ['character', 'arc'] },
    explores_theme: { to: ['theme'] },
    demonstrates: { from: ['note'] },
    currently_in: { to: ['timeline', 'location'] }
};
