// ─── Chronos AI Service ─────────────────────────────────────
// Multi-provider abstraction layer with circuit breaker (E3-US1)

export type AIProvider = 'openai' | 'anthropic' | 'google';

export interface AIModel {
    id: string;
    name: string;
    provider: AIProvider;
    costPer1kTokens: number; // cents
    maxTokens: number;
}

export const AI_MODELS: AIModel[] = [
    // OpenAI
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', costPer1kTokens: 0.5, maxTokens: 128000 },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', costPer1kTokens: 0.015, maxTokens: 128000 },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai', costPer1kTokens: 1.0, maxTokens: 128000 },
    // Anthropic
    { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'anthropic', costPer1kTokens: 0.3, maxTokens: 200000 },
    { id: 'claude-3-haiku', name: 'Claude 3 Haiku', provider: 'anthropic', costPer1kTokens: 0.025, maxTokens: 200000 },
    // Google
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google', costPer1kTokens: 0.01, maxTokens: 1000000 },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'google', costPer1kTokens: 0.125, maxTokens: 2000000 },
];

export const PROVIDER_LABELS: Record<AIProvider, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    google: 'Google',
};

export const PROVIDER_COLORS: Record<AIProvider, string> = {
    openai: '#10a37f',
    anthropic: '#d97706',
    google: '#4285f4',
};

// ─── Circuit Breaker ────────────────────────────────────────
interface CircuitState {
    failures: number;
    lastFailure: number;
    isOpen: boolean;
}

const circuitStates: Record<string, CircuitState> = {};
const CIRCUIT_THRESHOLD = 3;
const CIRCUIT_RESET_MS = 30000; // 30 seconds

function getCircuit(provider: string): CircuitState {
    if (!circuitStates[provider]) {
        circuitStates[provider] = { failures: 0, lastFailure: 0, isOpen: false };
    }
    const circuit = circuitStates[provider];
    // Auto-reset after timeout
    if (circuit.isOpen && Date.now() - circuit.lastFailure > CIRCUIT_RESET_MS) {
        circuit.isOpen = false;
        circuit.failures = 0;
    }
    return circuit;
}

function recordFailure(provider: string): void {
    const circuit = getCircuit(provider);
    circuit.failures++;
    circuit.lastFailure = Date.now();
    if (circuit.failures >= CIRCUIT_THRESHOLD) {
        circuit.isOpen = true;
    }
}

function recordSuccess(provider: string): void {
    const circuit = getCircuit(provider);
    circuit.failures = 0;
    circuit.isOpen = false;
}

// ─── AI Settings (persisted in localStorage) ────────────────
export interface AISettings {
    defaultProvider: AIProvider;
    defaultModel: string;
    apiKeys: Partial<Record<AIProvider, string>>;
}

const AI_SETTINGS_KEY = 'chronos_ai_settings';

export function loadAISettings(): AISettings {
    try {
        const raw = localStorage.getItem(AI_SETTINGS_KEY);
        if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return {
        defaultProvider: 'openai',
        defaultModel: 'gpt-4o-mini',
        apiKeys: {},
    };
}

export function saveAISettings(settings: AISettings): void {
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings));
}

// ─── Response cache ─────────────────────────────────────────
const responseCache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached<T>(key: string): T | null {
    const entry = responseCache.get(key);
    if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
        return entry.data as T;
    }
    responseCache.delete(key);
    return null;
}

function setCache(key: string, data: unknown): void {
    responseCache.set(key, { data, timestamp: Date.now() });
}

// ─── AI Call Abstraction ────────────────────────────────────
export interface GenerateIdeasRequest {
    entityName: string;
    entityType: string;
    entityDescription: string;
    linkedEntities?: Array<{ name: string; type: string; description: string }>;
    projectContext?: string;
}

export interface GeneratedIdea {
    id: string;
    title: string;
    description: string;
    confidence: number; // 0-1
}

export interface GenerateIdeasResult {
    ideas: GeneratedIdea[];
    model: string;
    provider: AIProvider;
    cached: boolean;
}

// Build the idea generation prompt
function buildIdeaPrompt(req: GenerateIdeasRequest): string {
    let prompt = `You are a creative writing assistant for a multi-timeline narrative tool called Chronos.

Given the following entity from the user's narrative, generate 5 creative and relevant plot ideas, twists, or development suggestions.

## Entity
- **Name:** ${req.entityName}
- **Type:** ${req.entityType}
- **Description:** ${req.entityDescription}
`;

    if (req.linkedEntities && req.linkedEntities.length > 0) {
        prompt += `\n## Related Entities\n`;
        req.linkedEntities.forEach(e => {
            prompt += `- **${e.name}** (${e.type}): ${e.description}\n`;
        });
    }

    if (req.projectContext) {
        prompt += `\n## Project Context\n${req.projectContext}\n`;
    }

    prompt += `
## Instructions
Generate exactly 5 creative ideas. For each idea, provide:
1. A short, catchy title (max 8 words)
2. A 2-3 sentence description explaining the idea
3. A confidence score from 0.0 to 1.0 indicating how well it fits the existing narrative

Respond ONLY with valid JSON in this exact format:
{
  "ideas": [
    { "title": "...", "description": "...", "confidence": 0.85 }
  ]
}`;
    return prompt;
}

// Call AI provider
async function callProvider(
    provider: AIProvider,
    model: string,
    prompt: string,
    apiKey: string
): Promise<string> {
    const circuit = getCircuit(provider);
    if (circuit.isOpen) {
        throw new Error(`Circuit breaker open for ${provider}. Will retry in ${Math.ceil((CIRCUIT_RESET_MS - (Date.now() - circuit.lastFailure)) / 1000)}s.`);
    }

    try {
        let response: Response;
        let text: string;

        switch (provider) {
            case 'openai': {
                response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model,
                        messages: [{ role: 'user', content: prompt }],
                        temperature: 0.8,
                        max_tokens: 2000,
                    }),
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error?.message || 'OpenAI API error');
                text = data.choices[0].message.content;
                break;
            }
            case 'anthropic': {
                response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01',
                        'anthropic-dangerous-direct-browser-access': 'true',
                    },
                    body: JSON.stringify({
                        model,
                        max_tokens: 2000,
                        messages: [{ role: 'user', content: prompt }],
                    }),
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error?.message || 'Anthropic API error');
                text = data.content[0].text;
                break;
            }
            case 'google': {
                response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { temperature: 0.8, maxOutputTokens: 2000 },
                    }),
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error?.message || 'Google AI API error');
                text = data.candidates[0].content.parts[0].text;
                break;
            }
            default:
                throw new Error(`Unknown provider: ${provider}`);
        }

        recordSuccess(provider);
        return text;
    } catch (err) {
        recordFailure(provider);
        throw err;
    }
}

// ─── Idea generator with failover ───────────────────────────
export async function generateIdeas(
    req: GenerateIdeasRequest,
    settings?: AISettings
): Promise<GenerateIdeasResult> {
    const aiSettings = settings || loadAISettings();

    // Check cache
    const cacheKey = `ideas:${req.entityName}:${req.entityType}:${req.entityDescription.slice(0, 50)}`;
    const cached = getCached<GenerateIdeasResult>(cacheKey);
    if (cached) return { ...cached, cached: true };

    const prompt = buildIdeaPrompt(req);

    // Try providers in order: preferred → fallbacks
    const providers: AIProvider[] = [aiSettings.defaultProvider];
    const allProviders: AIProvider[] = ['openai', 'anthropic', 'google'];
    for (const p of allProviders) {
        if (!providers.includes(p)) providers.push(p);
    }

    let lastError: Error | null = null;

    for (const provider of providers) {
        const apiKey = aiSettings.apiKeys[provider];
        if (!apiKey) continue;

        const model = provider === aiSettings.defaultProvider
            ? aiSettings.defaultModel
            : AI_MODELS.find(m => m.provider === provider)?.id || '';

        if (!model) continue;

        try {
            const raw = await callProvider(provider, model, prompt, apiKey);

            // Parse JSON from response (handle markdown code blocks)
            let jsonStr = raw;
            const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) jsonStr = jsonMatch[1];

            const parsed = JSON.parse(jsonStr.trim());
            const ideas: GeneratedIdea[] = (parsed.ideas || []).map((idea: { title: string; description: string; confidence?: number }, i: number) => ({
                id: `idea-${Date.now()}-${i}`,
                title: idea.title,
                description: idea.description,
                confidence: idea.confidence || 0.7,
            }));

            const result: GenerateIdeasResult = {
                ideas,
                model,
                provider,
                cached: false,
            };

            setCache(cacheKey, result);
            return result;
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            console.warn(`AI provider ${provider} failed:`, lastError.message);
            continue;
        }
    }

    throw new Error(
        lastError?.message ||
        'No AI provider configured. Go to Settings to add your API key.'
    );
}

// ─── Get available models for a provider ────────────────────
export function getModelsForProvider(provider: AIProvider): AIModel[] {
    return AI_MODELS.filter(m => m.provider === provider);
}

// ─── Check if any provider is configured ────────────────────
export function hasConfiguredProvider(settings?: AISettings): boolean {
    const s = settings || loadAISettings();
    return Object.values(s.apiKeys).some(k => k && k.length > 10);
}

// ─── Consistency Checking (E3-US4) ──────────────────────────

export type IssueSeverity = 'error' | 'warning' | 'suggestion';
export type IssueCategory = 'timeline_paradox' | 'character_conflict' | 'causality_break' | 'logic_gap';

export interface ConsistencyIssue {
    id: string;
    severity: IssueSeverity;
    category: IssueCategory;
    title: string;
    description: string;
    entityNames: string[];  // Names of affected entities
    suggestedFix: string;
}

export interface ConsistencyReport {
    issues: ConsistencyIssue[];
    model: string;
    provider: AIProvider;
    cached: boolean;
    checkedAt: string;
    scope: 'project' | 'timeline';
}

export interface CheckConsistencyRequest {
    entities: Array<{
        name: string;
        type: string;
        description: string;
        properties?: Record<string, unknown>;
    }>;
    projectName: string;
    scope: 'project' | 'timeline';
    scopeTimelineName?: string;
}

const SEVERITY_ICONS: Record<IssueSeverity, string> = {
    error: '🔴',
    warning: '⚠️',
    suggestion: '💡',
};

const CATEGORY_LABELS: Record<IssueCategory, string> = {
    timeline_paradox: 'Timeline Paradox',
    character_conflict: 'Character Conflict',
    causality_break: 'Causality Break',
    logic_gap: 'Logic Gap',
};

export { SEVERITY_ICONS, CATEGORY_LABELS };

function buildConsistencyPrompt(req: CheckConsistencyRequest): string {
    let prompt = `You are a narrative consistency analyzer for a multi-timeline storytelling tool called Chronos.

## Task
Analyze the following narrative elements for **logical inconsistencies, contradictions, and plot holes**. Be thorough but fair — only flag genuine issues, not stylistic choices.

## Project: ${req.projectName}
${req.scope === 'timeline' ? `## Scope: Timeline "${req.scopeTimelineName}"` : '## Scope: Entire Project'}

## Narrative Elements
`;

    // Group entities by type for clearer context
    const grouped: Record<string, typeof req.entities> = {};
    for (const entity of req.entities) {
        if (!grouped[entity.type]) grouped[entity.type] = [];
        grouped[entity.type].push(entity);
    }

    for (const [type, entities] of Object.entries(grouped)) {
        prompt += `\n### ${type.charAt(0).toUpperCase() + type.slice(1)}s\n`;
        for (const e of entities) {
            prompt += `- **${e.name}**: ${e.description || '(no description)'}`;
            if (e.properties && Object.keys(e.properties).length > 0) {
                const props = Object.entries(e.properties)
                    .filter(([, v]) => v !== null && v !== undefined && v !== '')
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(', ');
                if (props) prompt += ` [${props}]`;
            }
            prompt += '\n';
        }
    }

    prompt += `
## Analysis Categories
Look for these specific types of issues:

1. **Timeline Paradoxes** — Events that cannot coexist in the same timeline (e.g., a character dying before an event they participate in)
2. **Character Conflicts** — Contradictory character traits, abilities, or states across different narrative elements
3. **Causality Breaks** — Effects without causes, or events that should logically prevent subsequent events
4. **Logic Gaps** — Missing connections, unexplained jumps, or narrative elements that don't fit together

## Response Format
Respond ONLY with valid JSON in this exact format:
{
  "issues": [
    {
      "severity": "error|warning|suggestion",
      "category": "timeline_paradox|character_conflict|causality_break|logic_gap",
      "title": "Short descriptive title (max 10 words)",
      "description": "2-3 sentence explanation of the issue",
      "entityNames": ["Entity1", "Entity2"],
      "suggestedFix": "Specific suggestion to resolve"
    }
  ]
}

If the narrative is consistent and you find no issues, return: { "issues": [] }
Important: Return between 0 and 10 issues. Prioritize the most critical ones.`;

    return prompt;
}

// Lower temperature for analytical accuracy
async function callProviderForAnalysis(
    provider: AIProvider,
    model: string,
    prompt: string,
    apiKey: string
): Promise<string> {
    const circuit = getCircuit(provider);
    if (circuit.isOpen) {
        throw new Error(`Circuit breaker open for ${provider}. Will retry in ${Math.ceil((CIRCUIT_RESET_MS - (Date.now() - circuit.lastFailure)) / 1000)}s.`);
    }

    try {
        let response: Response;
        let text: string;

        switch (provider) {
            case 'openai': {
                response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model,
                        messages: [{ role: 'user', content: prompt }],
                        temperature: 0.3,   // Lower for analysis
                        max_tokens: 4000,    // More room for detailed report
                    }),
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error?.message || 'OpenAI API error');
                text = data.choices[0].message.content;
                break;
            }
            case 'anthropic': {
                response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01',
                        'anthropic-dangerous-direct-browser-access': 'true',
                    },
                    body: JSON.stringify({
                        model,
                        max_tokens: 4000,
                        messages: [{ role: 'user', content: prompt }],
                    }),
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error?.message || 'Anthropic API error');
                text = data.content[0].text;
                break;
            }
            case 'google': {
                response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { temperature: 0.3, maxOutputTokens: 4000 },
                    }),
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error?.message || 'Google AI API error');
                text = data.candidates[0].content.parts[0].text;
                break;
            }
            default:
                throw new Error(`Unknown provider: ${provider}`);
        }

        recordSuccess(provider);
        return text;
    } catch (err) {
        recordFailure(provider);
        throw err;
    }
}

export async function checkConsistency(
    req: CheckConsistencyRequest,
    settings?: AISettings
): Promise<ConsistencyReport> {
    const aiSettings = settings || loadAISettings();

    // Cache key based on scope + entity count + first few entity names
    const entitySig = req.entities.map(e => e.name).sort().join(',').slice(0, 100);
    const cacheKey = `consistency:${req.scope}:${req.projectName}:${entitySig}`;
    const cached = getCached<ConsistencyReport>(cacheKey);
    if (cached) return { ...cached, cached: true };

    if (req.entities.length === 0) {
        return {
            issues: [],
            model: '',
            provider: aiSettings.defaultProvider,
            cached: false,
            checkedAt: new Date().toISOString(),
            scope: req.scope,
        };
    }

    const prompt = buildConsistencyPrompt(req);

    // Try providers in order: preferred → fallbacks
    const providers: AIProvider[] = [aiSettings.defaultProvider];
    const allProviders: AIProvider[] = ['openai', 'anthropic', 'google'];
    for (const p of allProviders) {
        if (!providers.includes(p)) providers.push(p);
    }

    let lastError: Error | null = null;

    for (const provider of providers) {
        const apiKey = aiSettings.apiKeys[provider];
        if (!apiKey) continue;

        const model = provider === aiSettings.defaultProvider
            ? aiSettings.defaultModel
            : AI_MODELS.find(m => m.provider === provider)?.id || '';

        if (!model) continue;

        try {
            const raw = await callProviderForAnalysis(provider, model, prompt, apiKey);

            // Parse JSON from response (handle markdown code blocks)
            let jsonStr = raw;
            const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) jsonStr = jsonMatch[1];

            const parsed = JSON.parse(jsonStr.trim());
            const issues: ConsistencyIssue[] = (parsed.issues || []).map(
                (issue: {
                    severity?: string;
                    category?: string;
                    title?: string;
                    description?: string;
                    entityNames?: string[];
                    suggestedFix?: string;
                }, i: number) => ({
                    id: `issue-${Date.now()}-${i}`,
                    severity: (['error', 'warning', 'suggestion'].includes(issue.severity || '')
                        ? issue.severity : 'warning') as IssueSeverity,
                    category: (['timeline_paradox', 'character_conflict', 'causality_break', 'logic_gap'].includes(issue.category || '')
                        ? issue.category : 'logic_gap') as IssueCategory,
                    title: issue.title || 'Untitled Issue',
                    description: issue.description || '',
                    entityNames: issue.entityNames || [],
                    suggestedFix: issue.suggestedFix || '',
                })
            );

            const result: ConsistencyReport = {
                issues,
                model,
                provider,
                cached: false,
                checkedAt: new Date().toISOString(),
                scope: req.scope,
            };

            setCache(cacheKey, result);
            return result;
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            console.warn(`AI consistency check failed (${provider}):`, lastError.message);
            continue;
        }
    }

    throw new Error(
        lastError?.message ||
        'No AI provider configured. Go to Settings to add your API key.'
    );
}

// ─── Ripple Effect Analysis (E3-US5) ────────────────────────

export type ImpactLevel = 'high' | 'medium' | 'low';

export interface RippleEffect {
    id: string;
    affectedEntityName: string;
    impactLevel: ImpactLevel;
    description: string;
    suggestedAdjustment: string;
}

export interface RippleReport {
    effects: RippleEffect[];
    model: string;
    provider: AIProvider;
    cached: boolean;
    analyzedAt: string;
}

export interface AnalyzeRippleRequest {
    editedEntity: {
        name: string;
        type: string;
        descriptionBefore: string;
        descriptionAfter: string;
    };
    relatedEntities: Array<{
        name: string;
        type: string;
        description: string;
        relationshipType: string; // e.g. "appears_in", "causes", etc.
    }>;
    projectName: string;
}

export const IMPACT_ICONS: Record<ImpactLevel, string> = {
    high: '🔴',
    medium: '🟡',
    low: '🟢',
};

function buildRipplePrompt(req: AnalyzeRippleRequest): string {
    let prompt = `You are a narrative impact analyzer for a multi-timeline storytelling tool called Chronos.

## Task
A user is about to change an entity's description. Analyze how this change could **cascade** to related entities and predict the ripple effects.

## Project: ${req.projectName}

## Entity Being Edited
- **Name:** ${req.editedEntity.name}
- **Type:** ${req.editedEntity.type}
- **Before:** ${req.editedEntity.descriptionBefore || '(empty)'}
- **After:** ${req.editedEntity.descriptionAfter || '(empty)'}

## Related Entities (connected within 2 hops)
`;

    if (req.relatedEntities.length === 0) {
        prompt += 'No related entities found.\n';
    } else {
        for (const e of req.relatedEntities) {
            prompt += `- **${e.name}** (${e.type}, relationship: ${e.relationshipType}): ${e.description || '(no description)'}\n`;
        }
    }

    prompt += `
## Analysis Instructions
For each related entity, determine:
1. **Will this change create an inconsistency?** (e.g., character dies but appears later)
2. **Does the change break a causal chain?** (e.g., removing a triggering event)
3. **Does the change require updating related entities?** (e.g., location destroyed, characters must relocate)

Only report genuine impacts — not every related entity will be affected.

## Response Format
Respond ONLY with valid JSON:
{
  "effects": [
    {
      "affectedEntityName": "Name of affected entity",
      "impactLevel": "high|medium|low",
      "description": "2-3 sentence explanation of the predicted impact",
      "suggestedAdjustment": "Specific suggestion to maintain consistency"
    }
  ]
}

- **high** = Direct contradiction or broken causality
- **medium** = Needs attention, may cause confusion
- **low** = Minor ripple, optional adjustment

If the change has NO impact on related entities, return: { "effects": [] }
Return at most 8 effects, prioritize by severity.`;

    return prompt;
}

export async function analyzeRippleEffects(
    req: AnalyzeRippleRequest,
    settings?: AISettings
): Promise<RippleReport> {
    const aiSettings = settings || loadAISettings();

    // Cache key based on entity name + description change hash
    const changeSig = `${req.editedEntity.name}:${req.editedEntity.descriptionBefore.slice(0, 50)}→${req.editedEntity.descriptionAfter.slice(0, 50)}`;
    const cacheKey = `ripple:${req.projectName}:${changeSig}`;
    const cached = getCached<RippleReport>(cacheKey);
    if (cached) return { ...cached, cached: true };

    // No related entities → no ripple effects
    if (req.relatedEntities.length === 0) {
        return {
            effects: [],
            model: '',
            provider: aiSettings.defaultProvider,
            cached: false,
            analyzedAt: new Date().toISOString(),
        };
    }

    const prompt = buildRipplePrompt(req);

    // Try providers in order: preferred → fallbacks
    const providers: AIProvider[] = [aiSettings.defaultProvider];
    const allProviders: AIProvider[] = ['openai', 'anthropic', 'google'];
    for (const p of allProviders) {
        if (!providers.includes(p)) providers.push(p);
    }

    let lastError: Error | null = null;

    for (const provider of providers) {
        const apiKey = aiSettings.apiKeys[provider];
        if (!apiKey) continue;

        const model = provider === aiSettings.defaultProvider
            ? aiSettings.defaultModel
            : AI_MODELS.find(m => m.provider === provider)?.id || '';

        if (!model) continue;

        try {
            const raw = await callProviderForAnalysis(provider, model, prompt, apiKey);

            // Parse JSON (handle markdown code blocks)
            let jsonStr = raw;
            const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) jsonStr = jsonMatch[1];

            const parsed = JSON.parse(jsonStr.trim());
            const effects: RippleEffect[] = (parsed.effects || []).map(
                (effect: {
                    affectedEntityName?: string;
                    impactLevel?: string;
                    description?: string;
                    suggestedAdjustment?: string;
                }, i: number) => ({
                    id: `ripple-${Date.now()}-${i}`,
                    affectedEntityName: effect.affectedEntityName || 'Unknown Entity',
                    impactLevel: (['high', 'medium', 'low'].includes(effect.impactLevel || '')
                        ? effect.impactLevel : 'medium') as ImpactLevel,
                    description: effect.description || '',
                    suggestedAdjustment: effect.suggestedAdjustment || '',
                })
            );

            const result: RippleReport = {
                effects,
                model,
                provider,
                cached: false,
                analyzedAt: new Date().toISOString(),
            };

            setCache(cacheKey, result);
            return result;
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            console.warn(`AI ripple analysis failed (${provider}):`, lastError.message);
            continue;
        }
    }

    throw new Error(
        lastError?.message ||
        'No AI provider configured. Go to Settings to add your API key.'
    );
}
