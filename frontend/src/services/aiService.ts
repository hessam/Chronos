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
