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
    properties?: Record<string, unknown>;
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



    if (req.properties && req.properties.beats && Array.isArray(req.properties.beats) && req.properties.beats.length > 0) {
        prompt += `\n## Scene Beats\n`;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        req.properties.beats.forEach((b: any, i: number) => {
            prompt += `${i + 1}.[${b.type}] ${b.description} \n`;
        });
    }

    if (req.linkedEntities && req.linkedEntities.length > 0) {
        prompt += `\n## Related Entities\n`;
        req.linkedEntities.forEach(e => {
            prompt += `- ** ${e.name}** (${e.type}): ${e.description} \n`;
        });
    }

    if (req.projectContext) {
        prompt += `\n## Project Context\n${req.projectContext} \n`;
    }

    prompt += `
## Instructions
Generate exactly 5 creative ideas.For each idea, provide:
    1. A short, catchy title(max 8 words)
    2. A 2 - 3 sentence description explaining the idea
    3. A confidence score from 0.0 to 1.0 indicating how well it fits the existing narrative

Respond ONLY with valid JSON in this exact format:
    {
        "ideas": [
            { "title": "...", "description": "...", "confidence": 0.85 }
        ]
    } `;
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
        throw new Error(`Circuit breaker open for ${provider}.Will retry in ${Math.ceil((CIRCUIT_RESET_MS - (Date.now() - circuit.lastFailure)) / 1000)} s.`);
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
                        'Authorization': `Bearer ${apiKey} `,
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

// ─── Beat Prose Generation (New Feature) ────────────────────

export interface GenerateBeatProseRequest {
    beat: {
        description: string;
        type: string;
    };
    context: {
        entityName: string;
        entityDescription: string;
        previousProse?: string;
        projectContext?: string;
    };
}

export async function generateBeatProse(
    req: GenerateBeatProseRequest,
    settings?: AISettings
): Promise<string> {
    const aiSettings = settings || loadAISettings();
    const prompt = `You are an AI co-author for a novel.
    
Context:
Project: ${req.context.projectContext || 'Unknown Project'}
Scene/Event: ${req.context.entityName} (${req.context.entityDescription})

${req.context.previousProse ? `Previous Context:\n${req.context.previousProse}\n` : ''}

Current Beat (${req.beat.type}): ${req.beat.description}

Task: Write a single paragraph of high-quality narrative prose for this beat. 
Style: Show, don't tell. Engaging and atmospheric.
Output: Just the prose, nothing else.`;

    const providers: AIProvider[] = [aiSettings.defaultProvider, 'openai', 'anthropic', 'google'];
    let lastError: Error | null = null;

    for (const provider of providers) {
        if (!aiSettings.apiKeys[provider]) continue;
        const model = provider === aiSettings.defaultProvider
            ? aiSettings.defaultModel
            : AI_MODELS.find(m => m.provider === provider)?.id || '';
        if (!model) continue;

        try {
            const text = await callProvider(provider, model, prompt, aiSettings.apiKeys[provider]!);
            return text.trim();
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
        }
    }
    throw new Error(lastError?.message || 'No AI provider available');
}



export async function suggestBeats(
    context: {
        entityName: string;
        entityDescription: string;
        projectContext?: string;
    },
    settings?: AISettings
): Promise<Array<{ type: string; description: string }>> {
    const aiSettings = settings || loadAISettings();
    const prompt = `You are an expert story outliner.
    
Context:
Project: ${context.projectContext || 'Unknown'}
Event: ${context.entityName}
Description: ${context.entityDescription}

Task: Break this event down into 5-8 distinct narrative beats (micro-events).
Format: Return ONLY a JSON array of objects with "type" (action, dialogue, emotion, description, internal) and "description" fields.
Example: [{"type": "action", "description": "Hero enters the room."}, {"type": "dialogue", "description": "Villain laughs."}]`;

    const providers: AIProvider[] = [aiSettings.defaultProvider, 'openai', 'anthropic', 'google'];

    for (const provider of providers) {
        if (!aiSettings.apiKeys[provider]) continue;
        const model = provider === aiSettings.defaultProvider ? aiSettings.defaultModel : AI_MODELS.find(m => m.provider === provider)?.id || '';

        try {
            const text = await callProvider(provider, model, prompt, aiSettings.apiKeys[provider]!);
            // Clean up markdown code blocks if present
            const jsonStr = text.replace(/```json\n?|\n?```/g, '').trim();
            return JSON.parse(jsonStr);
        } catch (e) {
            console.warn(`Provider ${provider} failed for suggestBeats`, e);
        }
    }
    throw new Error('Failed to generate beats');
}

export async function checkBeatConsistency(
    beats: Array<{ type: string; description: string }>,
    context: { entityName: string; entityDescription: string },
    settings?: AISettings
): Promise<string> {
    const aiSettings = settings || loadAISettings();
    const beatsText = beats.map((b, i) => `${i + 1}. [${b.type}] ${b.description}`).join('\n');

    const prompt = `Analyze the following sequence of beats for the event "${context.entityName}".
    
Event Description: ${context.entityDescription}

Beats:
${beatsText}

Task: Check for logical consistency, pacing issues, and alignment with the event description.
Output: A concise paragraph highlighting any issues or confirming the sequence is solid.`;

    const providers: AIProvider[] = [aiSettings.defaultProvider, 'openai', 'anthropic', 'google'];

    for (const provider of providers) {
        if (!aiSettings.apiKeys[provider]) continue;
        const model = provider === aiSettings.defaultProvider ? aiSettings.defaultModel : AI_MODELS.find(m => m.provider === provider)?.id || '';

        try {
            return await callProvider(provider, model, prompt, aiSettings.apiKeys[provider]!);
        } catch (e) {
            console.warn(`Provider ${provider} failed for checkBeatConsistency`, e);
        }
    }
    throw new Error('Failed to check consistency');
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

// ─── Scene Card Generator (Advanced Feature 1) ─────────────
export interface SceneCard {
    pov: string;
    goal: string;
    conflict: string;
    resolution: string;
    settingNotes: string;
    openingLine: string;
}

export interface SceneCardResult {
    sceneCard: SceneCard;
    model: string;
    provider: AIProvider;
    cached: boolean;
}

export interface GenerateSceneRequest {
    eventName: string;
    eventDescription: string;
    connectedCharacters: Array<{ name: string; description: string }>;
    connectedLocations: Array<{ name: string; description: string }>;
    connectedThemes: Array<{ name: string; description: string }>;
    projectContext?: string;
}

function buildScenePrompt(req: GenerateSceneRequest): string {
    let prompt = `You are a professional novel scene architect for a narrative tool called Chronos.

## Task
Generate a detailed scene outline for the following event. The scene should be vivid, actionable, and ready-to-write.

## Event
- **Name:** ${req.eventName}
- **Description:** ${req.eventDescription}
`;

    if (req.connectedCharacters.length > 0) {
        prompt += `\n## Characters in this scene\n`;
        req.connectedCharacters.forEach(c => {
            prompt += `- **${c.name}**: ${c.description}\n`;
        });
    }
    if (req.connectedLocations.length > 0) {
        prompt += `\n## Location\n`;
        req.connectedLocations.forEach(l => {
            prompt += `- **${l.name}**: ${l.description}\n`;
        });
    }
    if (req.connectedThemes.length > 0) {
        prompt += `\n## Themes\n`;
        req.connectedThemes.forEach(t => {
            prompt += `- **${t.name}**: ${t.description}\n`;
        });
    }
    if (req.projectContext) {
        prompt += `\n## Project Context\n${req.projectContext}\n`;
    }

    prompt += `
## Instructions
Generate a scene outline covering:
1. **POV**: Which character's perspective (pick the most compelling)
2. **Goal**: What the POV character wants in this scene
3. **Conflict**: What opposes that goal
4. **Resolution**: How the scene ends (cliffhanger, revelation, escalation, etc.)
5. **Setting Notes**: Sensory details (sight, sound, smell, atmosphere)
6. **Opening Line**: A strong first sentence for this scene

Respond ONLY with valid JSON:
{
  "pov": "Character Name",
  "goal": "What they want...",
  "conflict": "What opposes them...",
  "resolution": "How it ends...",
  "settingNotes": "Sensory details...",
  "openingLine": "The first sentence..."
}`;
    return prompt;
}

export async function generateSceneCard(
    req: GenerateSceneRequest,
    settings?: AISettings
): Promise<SceneCardResult> {
    const aiSettings = settings || loadAISettings();

    const cacheKey = `scene:${req.eventName}:${req.eventDescription.slice(0, 50)}`;
    const cached = getCached<SceneCardResult>(cacheKey);
    if (cached) return { ...cached, cached: true };

    const prompt = buildScenePrompt(req);
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
            let jsonStr = raw;
            const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) jsonStr = jsonMatch[1];
            const parsed = JSON.parse(jsonStr.trim());

            const sceneCard: SceneCard = {
                pov: parsed.pov || '',
                goal: parsed.goal || '',
                conflict: parsed.conflict || '',
                resolution: parsed.resolution || '',
                settingNotes: parsed.settingNotes || '',
                openingLine: parsed.openingLine || '',
            };

            const result: SceneCardResult = { sceneCard, model, provider, cached: false };
            setCache(cacheKey, result);
            return result;
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            continue;
        }
    }
    throw new Error(lastError?.message || 'No AI provider configured. Go to Settings to add your API key.');
}

// ─── Narrative Sequence Builder (Advanced Feature 2) ────────
export interface NarrativeStep {
    entityId: string;
    entityName: string;
    chapterNumber: number;
    reasoning: string;
}

export interface NarrativeSequenceResult {
    steps: NarrativeStep[];
    model: string;
    provider: AIProvider;
    cached: boolean;
}

export interface BuildSequenceRequest {
    events: Array<{ id: string; name: string; description: string }>;
    relationships: Array<{ fromName: string; toName: string; type: string }>;
    projectName: string;
}

function buildSequencePrompt(req: BuildSequenceRequest): string {
    let prompt = `You are a narrative structure expert for a storytelling tool called Chronos.

## Task
Analyze the following events and their relationships to determine the optimal **reading order** (chapter sequence). Consider causality, temporal order, and dramatic pacing.

## Project: ${req.projectName}

## Events
`;
    req.events.forEach(e => {
        prompt += `- **${e.name}** (id: ${e.id}): ${e.description || '(no description)'}\n`;
    });

    if (req.relationships.length > 0) {
        prompt += `\n## Relationships Between Events\n`;
        req.relationships.forEach(r => {
            prompt += `- ${r.fromName} —[${r.type}]→ ${r.toName}\n`;
        });
    }

    prompt += `
## Instructions
Order these events into chapters. Consider:
1. Causal chains (what must happen before what)
2. Temporal relationships (happens_before, happens_after)
3. Dramatic structure (hook, rising action, climax, resolution)
4. Parallel storylines (interleave for tension)

Respond ONLY with valid JSON:
{
  "steps": [
    { "entityId": "id-here", "entityName": "Event Name", "chapterNumber": 1, "reasoning": "Why this comes first..." }
  ]
}

Order ALL events. If two events could work in either order, use dramatic pacing to decide.`;
    return prompt;
}

export async function buildNarrativeSequence(
    req: BuildSequenceRequest,
    settings?: AISettings
): Promise<NarrativeSequenceResult> {
    const aiSettings = settings || loadAISettings();

    const eventSig = req.events.map(e => e.name).sort().join(',').slice(0, 100);
    const cacheKey = `sequence:${req.projectName}:${eventSig}`;
    const cached = getCached<NarrativeSequenceResult>(cacheKey);
    if (cached) return { ...cached, cached: true };

    if (req.events.length === 0) {
        return { steps: [], model: '', provider: aiSettings.defaultProvider, cached: false };
    }

    const prompt = buildSequencePrompt(req);
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
            let jsonStr = raw;
            const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) jsonStr = jsonMatch[1];
            const parsed = JSON.parse(jsonStr.trim());

            const steps: NarrativeStep[] = (parsed.steps || []).map(
                (step: { entityId?: string; entityName?: string; chapterNumber?: number; reasoning?: string }) => ({
                    entityId: step.entityId || '',
                    entityName: step.entityName || '',
                    chapterNumber: step.chapterNumber || 0,
                    reasoning: step.reasoning || '',
                })
            );

            const result: NarrativeSequenceResult = { steps, model, provider, cached: false };
            setCache(cacheKey, result);
            return result;
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            continue;
        }
    }
    throw new Error(lastError?.message || 'No AI provider configured. Go to Settings to add your API key.');
}

// ─── Missing Scene Detector (Advanced Feature 3) ────────────
export interface MissingScene {
    id: string;
    title: string;
    description: string;
    afterEvent: string;
    beforeEvent: string;
    reason: string;
}

export interface MissingSceneResult {
    scenes: MissingScene[];
    model: string;
    provider: AIProvider;
    cached: boolean;
}

export interface DetectGapsRequest {
    events: Array<{ name: string; description: string }>;
    characters: Array<{ name: string; description: string }>;
    locations: Array<{ name: string; description: string }>;
    relationships: Array<{ fromName: string; toName: string; type: string }>;
    projectName: string;
}

function buildGapDetectionPrompt(req: DetectGapsRequest): string {
    let prompt = `You are a narrative gap analyst for a storytelling tool called Chronos.

## Task
Analyze the following events and identify **missing transition scenes, unexplained jumps, or narrative gaps**. Look for moments where the reader would ask "wait, how did we get here?"

## Project: ${req.projectName}

## Events
`;
    req.events.forEach(e => {
        prompt += `- **${e.name}**: ${e.description || '(no description)'}\n`;
    });

    if (req.characters.length > 0) {
        prompt += `\n## Characters\n`;
        req.characters.forEach(c => {
            prompt += `- **${c.name}**: ${c.description}\n`;
        });
    }
    if (req.locations.length > 0) {
        prompt += `\n## Locations\n`;
        req.locations.forEach(l => {
            prompt += `- **${l.name}**: ${l.description}\n`;
        });
    }
    if (req.relationships.length > 0) {
        prompt += `\n## Relationships\n`;
        req.relationships.forEach(r => {
            prompt += `- ${r.fromName} —[${r.type}]→ ${r.toName}\n`;
        });
    }

    prompt += `
## Analysis Instructions
Look for these types of gaps:
1. **Transition gaps** — Character moves from Location A to Location B with no travel scene
2. **Emotional jumps** — Character's emotional state changes drastically between events with no explanation
3. **Causal gaps** — An effect happens but the cause event is missing
4. **Introduction gaps** — Character appears in a scene without being introduced
5. **Setup gaps** — A skill, item, or knowledge is used but was never established

Respond ONLY with valid JSON:
{
  "scenes": [
    {
      "title": "Short title for the missing scene",
      "description": "2-3 sentence description of what should happen",
      "afterEvent": "Name of event this scene should come after",
      "beforeEvent": "Name of event this scene should come before",
      "reason": "Why this scene is needed"
    }
  ]
}

Return between 0 and 6 missing scenes. Only suggest genuinely needed scenes, not filler.
If the narrative is complete with no gaps, return: { "scenes": [] }`;
    return prompt;
}

export async function detectMissingScenes(
    req: DetectGapsRequest,
    settings?: AISettings
): Promise<MissingSceneResult> {
    const aiSettings = settings || loadAISettings();

    const eventSig = req.events.map(e => e.name).sort().join(',').slice(0, 100);
    const cacheKey = `gaps:${req.projectName}:${eventSig}`;
    const cached = getCached<MissingSceneResult>(cacheKey);
    if (cached) return { ...cached, cached: true };

    if (req.events.length === 0) {
        return { scenes: [], model: '', provider: aiSettings.defaultProvider, cached: false };
    }

    const prompt = buildGapDetectionPrompt(req);
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
            let jsonStr = raw;
            const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) jsonStr = jsonMatch[1];
            const parsed = JSON.parse(jsonStr.trim());

            const scenes: MissingScene[] = (parsed.scenes || []).map(
                (scene: { title?: string; description?: string; afterEvent?: string; beforeEvent?: string; reason?: string }, i: number) => ({
                    id: `gap-${Date.now()}-${i}`,
                    title: scene.title || 'Missing Scene',
                    description: scene.description || '',
                    afterEvent: scene.afterEvent || '',
                    beforeEvent: scene.beforeEvent || '',
                    reason: scene.reason || '',
                })
            );

            const result: MissingSceneResult = { scenes, model, provider, cached: false };
            setCache(cacheKey, result);
            return result;
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            continue;
        }
    }
    throw new Error(lastError?.message || 'No AI provider configured. Go to Settings to add your API key.');
}

// ─── Character Voice Samples (Wave 2 Feature 1) ────────────
export interface VoiceSample {
    line: string;
    context: string; // e.g. "when angry", "being sarcastic"
}

export interface VoiceSampleResult {
    samples: VoiceSample[];
    model: string;
    provider: AIProvider;
    cached: boolean;
}

export interface GenerateVoiceRequest {
    characterName: string;
    characterDescription: string;
    connectedThemes: Array<{ name: string; description: string }>;
    connectedArcs: Array<{ name: string; description: string }>;
    projectContext?: string;
}

function buildVoicePrompt(req: GenerateVoiceRequest): string {
    let prompt = `You are a dialogue expert for a narrative tool called Chronos.

## Task
Write 3 distinctive dialogue samples for this character. Each line should reveal personality, speech patterns, and emotional depth. Make them feel like lines from a finished novel.

## Character
- **Name:** ${req.characterName}
- **Description:** ${req.characterDescription}
`;

    if (req.connectedThemes.length > 0) {
        prompt += `\n## Character Themes\n`;
        req.connectedThemes.forEach(t => {
            prompt += `- **${t.name}**: ${t.description}\n`;
        });
    }
    if (req.connectedArcs.length > 0) {
        prompt += `\n## Character Arcs\n`;
        req.connectedArcs.forEach(a => {
            prompt += `- **${a.name}**: ${a.description}\n`;
        });
    }
    if (req.projectContext) {
        prompt += `\n## Story Context\n${req.projectContext}\n`;
    }

    prompt += `
## Instructions
Generate exactly 3 dialogue lines. Each should:
1. Sound distinct to THIS character (not generic)
2. Show a DIFFERENT emotion or mood
3. Include a brief context note (when/why they'd say this)

Respond ONLY with valid JSON:
{
  "samples": [
    { "line": "The exact dialogue line in quotes", "context": "Brief context: when angry at a friend" },
    { "line": "Another distinctive line", "context": "Being playful or sarcastic" },
    { "line": "A third line showing depth", "context": "A vulnerable or quiet moment" }
  ]
}`;
    return prompt;
}

export async function generateCharacterVoice(
    req: GenerateVoiceRequest,
    settings?: AISettings
): Promise<VoiceSampleResult> {
    const aiSettings = settings || loadAISettings();

    const cacheKey = `voice:${req.characterName}:${req.characterDescription.slice(0, 50)}`;
    const cached = getCached<VoiceSampleResult>(cacheKey);
    if (cached) return { ...cached, cached: true };

    const prompt = buildVoicePrompt(req);
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
            let jsonStr = raw;
            const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) jsonStr = jsonMatch[1];
            const parsed = JSON.parse(jsonStr.trim());

            const samples: VoiceSample[] = (parsed.samples || []).map(
                (s: { line?: string; context?: string }) => ({
                    line: s.line || '',
                    context: s.context || '',
                })
            );

            const result: VoiceSampleResult = { samples, model, provider, cached: false };
            setCache(cacheKey, result);
            return result;
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            continue;
        }
    }
    throw new Error(lastError?.message || 'No AI provider configured. Go to Settings to add your API key.');
}

// ─── Worldbuilding Wiki Export (Wave 2 Feature 2) ───────────
// No AI call needed — pure data formatting
export interface WikiExportRequest {
    projectName: string;
    entities: Array<{ name: string; entity_type: string; description: string; properties: Record<string, unknown> }>;
    relationships: Array<{ fromName: string; toName: string; type: string; label?: string }>;
}

export function generateWikiMarkdown(req: WikiExportRequest): string {
    const groups: Record<string, typeof req.entities> = {};
    const typeOrder = ['character', 'location', 'timeline', 'event', 'arc', 'theme', 'note'];

    for (const entity of req.entities) {
        const type = entity.entity_type;
        if (!groups[type]) groups[type] = [];
        groups[type].push(entity);
    }

    // Build relationship lookup
    const relMap = new Map<string, Array<{ target: string; type: string; label?: string }>>();
    for (const r of req.relationships) {
        if (!relMap.has(r.fromName)) relMap.set(r.fromName, []);
        relMap.get(r.fromName)!.push({ target: r.toName, type: r.type, label: r.label });
        if (!relMap.has(r.toName)) relMap.set(r.toName, []);
        relMap.get(r.toName)!.push({ target: r.fromName, type: r.type, label: r.label });
    }

    const typeLabels: Record<string, string> = {
        character: 'Characters', location: 'Locations', timeline: 'Timelines',
        event: 'Events', arc: 'Story Arcs', theme: 'Themes', note: 'Notes',
    };

    let md = `# ${req.projectName} — Worldbuilding Wiki\n\n`;
    md += `*Auto-generated by Chronos on ${new Date().toLocaleDateString()}*\n\n`;
    md += `---\n\n`;

    for (const type of typeOrder) {
        const entities = groups[type];
        if (!entities || entities.length === 0) continue;

        md += `## ${typeLabels[type] || type}\n\n`;
        for (const entity of entities.sort((a, b) => a.name.localeCompare(b.name))) {
            md += `### ${entity.name}\n\n`;
            if (entity.description) {
                md += `${entity.description}\n\n`;
            } else {
                md += `*No description*\n\n`;
            }

            const rels = relMap.get(entity.name);
            if (rels && rels.length > 0) {
                md += `**Connections:**\n`;
                for (const r of rels) {
                    md += `- ${r.type}${r.label ? ` (${r.label})` : ''} → ${r.target}\n`;
                }
                md += `\n`;
            }

            // Include scene card if present
            const sc = entity.properties?.scene_card as Record<string, string> | undefined;
            if (sc && type === 'event') {
                md += `**Scene Card:**\n`;
                if (sc.pov) md += `- POV: ${sc.pov}\n`;
                if (sc.goal) md += `- Goal: ${sc.goal}\n`;
                if (sc.conflict) md += `- Conflict: ${sc.conflict}\n`;
                if (sc.openingLine) md += `- Opening: *"${sc.openingLine}"*\n`;
                md += `\n`;
            }
        }
        md += `---\n\n`;
    }

    return md;
}

// ─── POV Balance Analysis (Feature 8) ───────────────────────

export interface POVAnalysisRequest {
    events: Array<{
        name: string;
        povCharacter?: string;
        emotionLevel?: number;
    }>;
    characters: Array<{ name: string; description: string }>;
    projectContext?: string;
}

export interface POVIssue {
    id: string;
    type: 'missing_pov' | 'imbalance' | 'head_hopping' | 'suggestion';
    severity: 'warning' | 'info' | 'error';
    title: string;
    description: string;
    eventName?: string;
}

export interface POVAnalysisResult {
    issues: POVIssue[];
    distribution: Record<string, number>;
    model: string;
    provider: AIProvider;
    cached: boolean;
}

export async function analyzePOVBalance(
    req: POVAnalysisRequest,
    settings?: AISettings
): Promise<POVAnalysisResult> {
    const aiSettings = settings || loadAISettings();

    // Build distribution from data
    const distribution: Record<string, number> = {};
    const missingPOV: string[] = [];
    const povSequence: string[] = [];

    for (const ev of req.events) {
        if (!ev.povCharacter) {
            missingPOV.push(ev.name);
        } else {
            distribution[ev.povCharacter] = (distribution[ev.povCharacter] || 0) + 1;
            povSequence.push(ev.povCharacter);
        }
    }

    // Detect head-hopping (POV changes within 2 consecutive scenes)
    const headHops: Array<{ from: string; to: string; index: number }> = [];
    for (let i = 1; i < povSequence.length; i++) {
        if (povSequence[i] !== povSequence[i - 1] && i + 1 < povSequence.length && povSequence[i + 1] !== povSequence[i]) {
            headHops.push({ from: povSequence[i - 1], to: povSequence[i], index: i });
        }
    }

    const issues: POVIssue[] = [];

    // Flag missing POVs
    for (const name of missingPOV) {
        issues.push({
            id: `pov-missing-${Date.now()}-${name}`,
            type: 'missing_pov',
            severity: 'error',
            title: `No POV character assigned`,
            description: `"${name}" has no POV character. Assign one for consistent narration.`,
            eventName: name,
        });
    }

    // Flag imbalance
    const total = Object.values(distribution).reduce((a, b) => a + b, 0);
    for (const [char, count] of Object.entries(distribution)) {
        if (total > 3 && count / total > 0.7) {
            issues.push({
                id: `pov-imbalance-${Date.now()}-${char}`,
                type: 'imbalance',
                severity: 'warning',
                title: `POV imbalance: ${char}`,
                description: `${char} has ${count}/${total} scenes (${Math.round(count / total * 100)}%). Consider more variety.`,
            });
        }
    }

    // Flag head-hopping
    for (const hop of headHops.slice(0, 3)) {
        issues.push({
            id: `pov-hop-${Date.now()}-${hop.index}`,
            type: 'head_hopping',
            severity: 'info',
            title: `Rapid POV switch`,
            description: `POV jumps ${hop.from} → ${hop.to} for only one scene. Consider grouping POV sections.`,
        });
    }

    // AI-powered deeper analysis if we have enough data
    if (req.events.length >= 3 && hasConfiguredProvider(aiSettings)) {
        try {
            const prompt = `You are a narrative structure analyst. Analyze this POV distribution for a novel:

EVENTS & POV:
${req.events.map(e => `- "${e.name}" — POV: ${e.povCharacter || 'UNASSIGNED'}${e.emotionLevel ? `, emotion: ${e.emotionLevel}` : ''}`).join('\n')}

CHARACTERS: ${req.characters.map(c => c.name).join(', ')}

Return JSON: {"suggestions":[{"title":"...","description":"..."}]}
Rules: Max 3 suggestions. Focus on: POV rhythm, emotional variety per POV, underused characters. Be specific and actionable. No generic advice.`;

            const providers: AIProvider[] = [aiSettings.defaultProvider];
            for (const p of (['openai', 'anthropic', 'google'] as AIProvider[])) {
                if (!providers.includes(p)) providers.push(p);
            }

            for (const provider of providers) {
                const apiKey = aiSettings.apiKeys[provider];
                if (!apiKey) continue;
                const model = provider === aiSettings.defaultProvider ? aiSettings.defaultModel : AI_MODELS.find(m => m.provider === provider)?.id || '';
                if (!model) continue;

                try {
                    const raw = await callProvider(provider, model, prompt, apiKey);
                    let jsonStr = raw;
                    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
                    if (jsonMatch) jsonStr = jsonMatch[1];
                    const parsed = JSON.parse(jsonStr.trim());
                    for (const s of (parsed.suggestions || [])) {
                        issues.push({
                            id: `pov-ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                            type: 'suggestion',
                            severity: 'info',
                            title: s.title,
                            description: s.description,
                        });
                    }
                    return { issues, distribution, model, provider, cached: false };
                } catch { continue; }
            }
        } catch { /* fall through to local-only results */ }
    }

    return { issues, distribution, model: 'local', provider: 'openai', cached: false };
}

// ─── Chapter Assembler (Feature 5) ──────────────────────────

export interface ChapterAssemblyRequest {
    chapterName: string;
    chapterDescription: string;
    events: Array<{
        name: string;
        description: string;
        sceneCard?: { pov?: string; goal?: string; conflict?: string; outcome?: string; openingLine?: string };
        emotionLevel?: number;
        povCharacter?: string;
        draftWordCount?: number;
    }>;
    characters: Array<{
        name: string;
        description: string;
        voiceSamples?: Array<{ line: string; context: string }>;
    }>;
    relationships: Array<{ from: string; to: string; type: string; label?: string }>;
    projectContext?: string;
    previousChapterSummary?: string;
    nextChapterHint?: string;
}

export interface ChapterBlueprint {
    synopsis: string;
    structure: Array<{ beat: string; scene: string; emotionalNote: string }>;
    estimatedWordCount: number;
    openingHook: string;
    closingHook: string;
    tensions: string[];
    characterArcs: Array<{ character: string; arc: string }>;
}

export interface ChapterAssemblyResult {
    blueprint: ChapterBlueprint;
    model: string;
    provider: AIProvider;
    cached: boolean;
}

export async function assembleChapter(
    req: ChapterAssemblyRequest,
    settings?: AISettings
): Promise<ChapterAssemblyResult> {
    const aiSettings = settings || loadAISettings();

    const cacheKey = `chapter:${req.chapterName}:${req.events.map(e => e.name).join(',')}`;
    const cached = getCached<ChapterAssemblyResult>(cacheKey);
    if (cached) return { ...cached, cached: true };

    // Build the all-inclusive, ultra-optimized prompt
    const eventBlock = req.events.map((e, i) => {
        let line = `${i + 1}. "${e.name}"`;
        if (e.description) line += ` — ${e.description}`;
        if (e.povCharacter) line += ` [POV: ${e.povCharacter}]`;
        if (e.emotionLevel !== undefined) line += ` [Emotion: ${e.emotionLevel > 0 ? '+' : ''}${e.emotionLevel}]`;
        if (e.sceneCard) {
            const sc = e.sceneCard;
            const parts = [];
            if (sc.goal) parts.push(`Goal: ${sc.goal}`);
            if (sc.conflict) parts.push(`Conflict: ${sc.conflict}`);
            if (sc.outcome) parts.push(`Outcome: ${sc.outcome}`);
            if (parts.length) line += `\n   Scene: ${parts.join(' | ')}`;
            if (sc.openingLine) line += `\n   Opens: "${sc.openingLine}"`;
        }
        if (e.draftWordCount) line += ` [${e.draftWordCount}w drafted]`;
        return line;
    }).join('\n');

    const charBlock = req.characters.map(c => {
        let line = `• ${c.name}: ${c.description || 'No description'}`;
        if (c.voiceSamples && c.voiceSamples.length > 0) {
            line += `\n  Voice: "${c.voiceSamples[0].line}" (${c.voiceSamples[0].context})`;
        }
        return line;
    }).join('\n');

    const relBlock = req.relationships.length > 0
        ? req.relationships.map(r => `• ${r.from} —[${r.type}${r.label ? `: ${r.label}` : ''}]→ ${r.to}`).join('\n')
        : 'None specified';

    const emotionArc = req.events
        .filter(e => e.emotionLevel !== undefined)
        .map(e => `${e.name}: ${e.emotionLevel! > 0 ? '+' : ''}${e.emotionLevel}`)
        .join(' → ');

    const prompt = `You are an expert novel architect. Assemble a chapter blueprint from this complete story data.

CHAPTER: "${req.chapterName}"
${req.chapterDescription ? `INTENT: ${req.chapterDescription}` : ''}
${req.previousChapterSummary ? `PREVIOUS CHAPTER: ${req.previousChapterSummary}` : ''}
${req.nextChapterHint ? `NEXT CHAPTER LEADS TO: ${req.nextChapterHint}` : ''}
${req.projectContext ? `PROJECT: ${req.projectContext}` : ''}

SCENES IN ORDER:
${eventBlock}

EMOTIONAL ARC: ${emotionArc || 'Not set'}

CHARACTERS INVOLVED:
${charBlock}

RELATIONSHIPS:
${relBlock}

Return ONLY this JSON:
{"synopsis":"2-3 sentence chapter summary","structure":[{"beat":"rising/falling/climax/resolution","scene":"event name","emotionalNote":"reader should feel X"}],"estimatedWordCount":N,"openingHook":"compelling first sentence","closingHook":"chapter-ending line that pulls reader forward","tensions":["unresolved tension 1","..."],"characterArcs":[{"character":"name","arc":"what changes for them this chapter"}]}

RULES:
- Match structure entries 1:1 with the scenes provided
- estimatedWordCount = scenes × 2000 adjusted for complexity
- openingHook must grab attention instantly
- closingHook must create urgency to read next chapter
- tensions = threads left dangling for future payoff
- characterArcs only for characters who meaningfully change
- Use the character voice samples to inform tone
- Honor the emotional arc — don't flatten peaks or valleys`;

    const providers: AIProvider[] = [aiSettings.defaultProvider];
    for (const p of (['openai', 'anthropic', 'google'] as AIProvider[])) {
        if (!providers.includes(p)) providers.push(p);
    }

    let lastError: Error | null = null;

    for (const provider of providers) {
        const apiKey = aiSettings.apiKeys[provider];
        if (!apiKey) continue;
        const model = provider === aiSettings.defaultProvider ? aiSettings.defaultModel : AI_MODELS.find(m => m.provider === provider)?.id || '';
        if (!model) continue;

        try {
            const raw = await callProvider(provider, model, prompt, apiKey);
            let jsonStr = raw;
            const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) jsonStr = jsonMatch[1];

            const blueprint = JSON.parse(jsonStr.trim()) as ChapterBlueprint;

            const result: ChapterAssemblyResult = { blueprint, model, provider, cached: false };
            setCache(cacheKey, result);
            return result;
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            continue;
        }
    }

    throw new Error(lastError?.message || 'No AI provider configured.');
}

// ─── Temporal Gap Analysis (Feature 12) ─────────────────────

export interface TemporalGap {
    id: string;
    fromEvent: string;
    toEvent: string;
    fromTimestamp: string;
    toTimestamp: string;
    gapLabel: string;
    gapDays: number;
    warning?: string;
}

export function analyzeTemporalGaps(
    events: Array<{ name: string; timestamp?: string; description: string }>
): TemporalGap[] {
    // Filter events with timestamps and sort
    const timed = events
        .filter(e => e.timestamp)
        .map(e => ({ ...e, date: new Date(e.timestamp!) }))
        .filter(e => !isNaN(e.date.getTime()))
        .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (timed.length < 2) return [];

    const gaps: TemporalGap[] = [];
    for (let i = 1; i < timed.length; i++) {
        const prev = timed[i - 1];
        const curr = timed[i];
        const diffMs = curr.date.getTime() - prev.date.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) continue;

        let label: string;
        if (diffDays < 0) {
            label = `${Math.abs(diffDays)} days earlier`;
        } else if (diffDays === 1) {
            label = 'Next day';
        } else if (diffDays < 7) {
            label = `${diffDays} days later`;
        } else if (diffDays < 30) {
            const weeks = Math.round(diffDays / 7);
            label = `${weeks} week${weeks > 1 ? 's' : ''} later`;
        } else if (diffDays < 365) {
            const months = Math.round(diffDays / 30);
            label = `${months} month${months > 1 ? 's' : ''} later`;
        } else {
            const years = Math.round(diffDays / 365);
            label = `${years} year${years > 1 ? 's' : ''} later`;
        }

        const warning = diffDays > 365 ? `Large time jump (${label}) — consider explaining what changed` : undefined;

        gaps.push({
            id: `gap-${i}`,
            fromEvent: prev.name,
            toEvent: curr.name,
            fromTimestamp: prev.timestamp!,
            toTimestamp: curr.timestamp!,
            gapLabel: label,
            gapDays: diffDays,
            warning,
        });
    }

    return gaps;
}

// ─── Co-Write Orchestrator (Wave 3 Feature 1) ──────────────

export interface CoWriteOptions {
    tone: 'literary' | 'commercial' | 'minimalist' | 'lyrical' | 'cinematic';
    pov: 'first' | 'second' | 'third_limited' | 'third_omniscient';
    tense: 'past' | 'present';
    targetWordCount: number;
    styleReference?: string;
    includeDialogue: boolean;
    emotionalIntensity: 1 | 2 | 3 | 4 | 5;
    previousChapterSummary?: string;
    nextChapterHint?: string;
}

export interface CoWriteRequest {
    eventName: string;
    eventDescription: string;
    characters: Array<{ name: string; description: string; voiceSamples?: VoiceSample[] }>;
    locations: Array<{ name: string; description: string }>;
    themes: Array<{ name: string; description: string }>;
    options: CoWriteOptions;
    projectContext?: string;
}

export interface CoWriteResult {
    prose: string;
    sceneCard: SceneCard;
    model: string;
    provider: AIProvider;
}

export async function coWriteScene(
    req: CoWriteRequest,
    settings?: AISettings
): Promise<CoWriteResult> {
    const aiSettings = settings || loadAISettings();
    
    // Step 1: Generate or refine the scene card
    const scReq: GenerateSceneRequest = {
        eventName: req.eventName,
        eventDescription: req.eventDescription,
        connectedCharacters: req.characters,
        connectedLocations: req.locations,
        connectedThemes: req.themes,
        projectContext: req.projectContext
    };
    const scResult = await generateSceneCard(scReq, aiSettings);
    
    // Step 2: Get beats
    const beatsReq = {
        entityName: req.eventName,
        entityDescription: `${req.eventDescription}\n\nScene Plan:\nPOV: ${scResult.sceneCard.pov}\nGoal: ${scResult.sceneCard.goal}\nConflict: ${scResult.sceneCard.conflict}`,
        projectContext: req.projectContext
    };
    const beats = await suggestBeats(beatsReq, aiSettings);
    
    // Step 3: Orchestrate prose generation for all beats
    let fullProse = "";
    
    const stylePrompt = `
Tone: ${req.options.tone}
POV: ${req.options.pov}
Tense: ${req.options.tense}
${req.options.styleReference ? `Style Reference: ${req.options.styleReference}` : ''}
${req.options.includeDialogue ? 'Include natural dialogue where appropriate.' : 'Keep dialogue to a minimum.'}
Emotional Intensity (1-5): ${req.options.emotionalIntensity}
    `.trim();

    for (let i = 0; i < beats.length; i++) {
        const beat = beats[i];
        
        // Context includes the style rules and previous prose
        const proseReq: GenerateBeatProseRequest = {
            beat,
            context: {
                entityName: req.eventName,
                entityDescription: `Scene Plan:\n${JSON.stringify(scResult.sceneCard)}\n\nStyle Guide:\n${stylePrompt}`,
                previousProse: fullProse.slice(-2000), // Send last ~2000 chars for continuity
                projectContext: req.projectContext
            }
        };
        
        const beatProse = await generateBeatProse(proseReq, aiSettings);
        fullProse += (fullProse ? "\n\n" : "") + beatProse;
    }
    
    return {
        prose: fullProse,
        sceneCard: scResult.sceneCard,
        model: scResult.model,
        provider: scResult.provider
    };
}

// ─── Pacing Analyzer (Wave 3 Feature 2) ────────────────────

export interface PacingPacingEvent {
    id: string;
    name: string;
    emotionLevel: number;
    wordCount?: number;
}

export interface PacingRequest {
    events: PacingPacingEvent[];
    projectName: string;
}

export interface PacingResult {
    score: number;
    actStructure: Array<{
        name: string;
        events: string[];
        pacingLabel: 'too_fast' | 'too_slow' | 'good';
    }>;
    suggestions: string[];
    model: string;
    provider: AIProvider;
}

export async function analyzePacing(
    req: PacingRequest,
    settings?: AISettings
): Promise<PacingResult> {
    const aiSettings = settings || loadAISettings();
    
    const prompt = `You are a structural editor for a novel. Analyze the pacing of these sequential events.
    
PROJECT: ${req.projectName}
EVENTS IN ORDER:
${req.events.map((e, i) => `${i+1}. ${e.name} (Emotion: ${e.emotionLevel}, Words: ${e.wordCount || 'unknown'})`).join('\n')}

Analyze the rhythm of peaks (high emotion) and valleys (low emotion). Look for:
1. Long stretches of low emotion (dragging pacing).
2. Continuous high emotion without breathing room (exhausting pacing).
3. Missing act breaks.

Return ONLY JSON:
{
  "score": 85, // 0-100 overall pacing score
  "actStructure": [
    { "name": "Act 1: Setup", "events": ["event1", "event2"], "pacingLabel": "good" }
  ],
  "suggestions": [
     "Add a quiet reflection scene after the battle to give the reader a break."
  ]
}`;

    const raw = await callProviderForAnalysis(aiSettings.defaultProvider, aiSettings.defaultModel, prompt, aiSettings.apiKeys[aiSettings.defaultProvider] || '');
    let jsonStr = raw;
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) jsonStr = match[1];
    const parsed = JSON.parse(jsonStr.trim());
    
    return {
        ...parsed,
        model: aiSettings.defaultModel,
        provider: aiSettings.defaultProvider
    };
}

// ─── Thematic Threading Analyzer (Wave 3 Feature 3) ────────

export interface ThematicRequest {
    events: Array<{ name: string; description: string; chapter?: string }>;
    themes: Array<{ name: string; description: string }>;
    relationships: Array<{ from: string; to: string; type: string }>;
    projectName: string;
}

export interface ThematicResult {
    themeCoverage: Record<string, {
        score: number; // 0-100
        strongestAct: string;
        weakestAct: string;
        suggestion: string;
    }>;
    model: string;
    provider: AIProvider;
}

export async function analyzeThematicThreading(
    req: ThematicRequest,
    settings?: AISettings
): Promise<ThematicResult> {
    const aiSettings = settings || loadAISettings();
    
    if (req.themes.length === 0) {
        return { themeCoverage: {}, model: 'local', provider: 'openai' };
    }

    const prompt = `You are a narrative editor analyzing thematic threading in a novel.
    
PROJECT: ${req.projectName}

THEMES TO TRACK:
${req.themes.map(t => `- ${t.name}: ${t.description}`).join('\n')}

EVENTS:
${req.events.map((e, i) => `${i+1}. [${e.chapter || 'No Chapter'}] ${e.name}: ${e.description}`).join('\n')}

Analyze how well each theme is explored across the beginning, middle, and end of these events.
For each theme, provide:
1. Overall score (0-100)
2. Strongest act/section
3. Weakest act/section
4. A specific suggestion to weave the theme into the weakest section.

Return ONLY JSON:
{
  "themeCoverage": {
    "Theme Name": {
      "score": 85,
      "strongestAct": "Act 1",
      "weakestAct": "Act 3",
      "suggestion": "Bring back the pocket watch motif during the final battle."
    }
  }
}`;

    const raw = await callProviderForAnalysis(aiSettings.defaultProvider, aiSettings.defaultModel, prompt, aiSettings.apiKeys[aiSettings.defaultProvider] || '');
    let jsonStr = raw;
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) jsonStr = match[1];
    const parsed = JSON.parse(jsonStr.trim());
    
    return {
        ...parsed,
        model: aiSettings.defaultModel,
        provider: aiSettings.defaultProvider
    };
}

// ─── Conflict Escalation Analyzer (Wave 3 Feature 4) ───────

export interface ConflictRequest {
    events: Array<{ name: string; description: string; charactersInvolved: string[] }>;
    projectName: string;
}

export interface ConflictResult {
    escalationScore: number; // 0-100
    curve: Array<{ eventName: string; intensity: number; type: 'internal' | 'interpersonal' | 'environmental' }>;
    plateauWarnings: string[];
    suggestions: string[];
    model: string;
    provider: AIProvider;
}

export async function analyzeConflictEscalation(
    req: ConflictRequest,
    settings?: AISettings
): Promise<ConflictResult> {
    const aiSettings = settings || loadAISettings();
    
    const prompt = `You are a developmental editor analyzing conflict escalation.
    
PROJECT: ${req.projectName}
EVENTS:
${req.events.map((e, i) => `${i+1}. ${e.name}\n   Desc: ${e.description}\n   Chars: ${e.charactersInvolved.join(', ')}`).join('\n')}

Analyze if the conflict is steadily rising. Look for:
1. Plateaus (too many events with the same conflict level).
2. De-escalation (stakes lowering instead of raising).
3. The mix of internal, interpersonal, and environmental conflict.

Return ONLY JSON:
{
  "escalationScore": 75,
  "curve": [
    { "eventName": "Event 1", "intensity": 2, "type": "interpersonal" }
  ],
  "plateauWarnings": ["Events 3-5 have the same tension level. Raise the stakes."],
  "suggestions": ["Add an internal conflict for Character A during Event 4."]
}`;

    const raw = await callProviderForAnalysis(aiSettings.defaultProvider, aiSettings.defaultModel, prompt, aiSettings.apiKeys[aiSettings.defaultProvider] || '');
    let jsonStr = raw;
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) jsonStr = match[1];
    const parsed = JSON.parse(jsonStr.trim());
    
    return {
        ...parsed,
        model: aiSettings.defaultModel,
        provider: aiSettings.defaultProvider
    };
}
