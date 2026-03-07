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

import type { StoryState } from './contextBuilder';

export interface AgenticProseRequest {
    instruction: string;
    storyState: StoryState;
    currentDraft: string;
    projectContext?: string;
    styleProfile?: Record<string, string | number>;
    targetWordCount?: number;
}

export interface AgenticProseResult {
    assumptions: string;
    diff: {
        targetTextToReplace: string | null;
        newText: string;
    };
    selfCritique?: string;
    attempt?: number;
}

export async function generateAgenticProse(
    req: AgenticProseRequest,
    settings?: AISettings
): Promise<AgenticProseResult> {
    const aiSettings = settings || loadAISettings();

    // Compile learned style profile
    let styleBlock = '';
    if (req.styleProfile && Object.keys(req.styleProfile).length > 0) {
        styleBlock = `## STYLE PROFILE (Apply these preferences)
${Object.entries(req.styleProfile).map(([k, v]) => `- ${k.replace('_', ' ').toUpperCase()}: ${v}`).join('\n')}`;
    }

    // Build scene boundary block
    const sceneBoundaryBlock = `## SCENE BOUNDARIES (CRITICAL — do NOT violate)

PREVIOUS EVENT: ${req.storyState.sceneMandates.prevEventSummary}
THIS SCENE: ${req.storyState.sceneMandates.beats.map((b, i) => `${i + 1}. [${b.type}] ${b.description}`).join('\n')}
${req.storyState.sceneMandates.sceneEndCondition ? `THIS SCENE MUST END WITH: ${req.storyState.sceneMandates.sceneEndCondition}` : ''}
NEXT EVENT: ${req.storyState.sceneMandates.nextEventSummary}

⚠️ You MUST NOT write content that belongs to the NEXT EVENT. Stay within THIS SCENE's beats only.
⚠️ If the next event involves a different action, decision, or revelation — STOP BEFORE reaching it.`;

    const basePrompt = `You are an expert fiction writer acting as a co-author. You write publishable-quality prose.

## 1. HARD CONSTRAINTS (MANDATORY)

1. SHOW, DON'T TELL. Ground every moment in physical senses. Never name emotions directly.
2. NO PURPLE PROSE. Use hard, concrete nouns and active verbs. No abstractions.
3. Character thoughts MUST reflect their profession, speech patterns, and knowledge level.
4. Every paragraph must include at least 2 sensory channels (sight, sound, touch, smell, taste).
5. Obey the Canonical Story State implicitly. Do not contradict established facts.
${req.targetWordCount ? `6. Target word count for generated prose: ${req.targetWordCount} words (±15%).` : ''}

${styleBlock}

${req.projectContext || ''}

## 2. SCENE BOUNDARIES
${sceneBoundaryBlock}

## 3. CANONICAL STORY STATE

- **POV Character:** ${req.storyState.sceneMandates.povCharacter}
- **Location:** ${req.storyState.sceneMandates.location}
- **Active Characters:**
${req.storyState.characters.map(c => `  - ${c.name}: ${c.description} [Attributes: ${JSON.stringify(c.attributes)}]`).join('\n')}

## 4. Current Draft Prose
"""
${req.currentDraft}
"""

## 5. User Instruction
${req.instruction}

## 6. OUTPUT FORMAT

Respond EXACTLY with valid JSON — no markdown fences, no explanation:
{
  "assumptions": "A 1-2 sentence declaration proving you understand the POV, Location, Timeline state, and Scene Boundaries.",
  "diff": {
    "targetTextToReplace": "The EXACT existing string from the Current Draft you are replacing. If the instruction is to continue/append, set this to null.",
    "newText": "The newly generated or edited narrative prose."
  }
}
`;

    const provider = aiSettings.defaultProvider;
    const model = aiSettings.defaultModel;
    const apiKey = aiSettings.apiKeys[provider];

    if (!apiKey) {
        throw new Error(`No API key configured for ${provider}. Go to Settings to add one.`);
    }

    let currentPrompt = basePrompt;
    let finalResult: AgenticProseResult | null = null;
    let combinedCritique = '';

    for (let attempt = 1; attempt <= 2; attempt++) {
        console.log(`[ProseGen] Attempt ${attempt} generating draft...`);
        const raw = await callProvider(provider, model, currentPrompt, apiKey);

        let jsonStr = raw;
        const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) jsonStr = jsonMatch[1];

        const result = JSON.parse(jsonStr.trim()) as AgenticProseResult;

        if (!result.diff.newText) {
            throw new Error("AI failed to generate new text.");
        }

        if (attempt === 2) {
            // Already revised, accept it
            finalResult = result;
            break;
        }

        // --- SELF-CRITIQUE ---
        console.log(`[ProseGen] Running self-critique on draft...`);
        const critiquePrompt = `You are a harsh literary editor. Review this prose draft against the target constraints.
        
DRAFT:
"""
${result.diff.newText}
"""

CONSTRAINTS:
${styleBlock || 'Show, don\'t tell. Concrete sensory details.'}

OUTPUT FORMAT:
Respond exactly with valid JSON:
{
    "met_constraints": true or false,
    "critique": "If false, provide a 1-2 sentence harsh critique on what to fix. If true, empty string."
}`;

        try {
            const critiqueRaw = await callProviderForAnalysis(provider, model, critiquePrompt, apiKey);
            let critJsonStr = critiqueRaw;
            const critMatch = critiqueRaw.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (critMatch) critJsonStr = critMatch[1];

            const critiqueParsed = JSON.parse(critJsonStr.trim());

            if (critiqueParsed.met_constraints || !critiqueParsed.critique) {
                console.log(`[ProseGen] Self-critique passed!`);
                finalResult = result;
                combinedCritique = 'Passed initial style critique.';
                break;
            } else {
                console.log(`[ProseGen] Self-critique failed:`, critiqueParsed.critique);
                combinedCritique = critiqueParsed.critique;
                currentPrompt = `${basePrompt}\n\n## REVISION REQUEST (Attempt 2)\nYour previous draft failed peer review. EDITOR NOTES:\n${critiqueParsed.critique}\n\nPlease revise the prose to address these notes.`;
            }
        } catch (e) {
            console.warn('[ProseGen] Self-critique failed to parse, accepting draft.', e);
            finalResult = result;
            break;
        }
    }

    if (!finalResult) throw new Error("Failed to generate prose.");

    finalResult.selfCritique = combinedCritique;
    return finalResult;
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

// ─── Story Premise → Entity Extraction (Sprint 2: Onboarding) ────

export interface ExtractedEntity {
    entity_type: 'character' | 'timeline' | 'event' | 'location' | 'theme' | 'arc';
    name: string;
    description: string;
    properties: Record<string, unknown>;
}

export interface ExtractedRelationship {
    from_name: string;
    to_name: string;
    relationship_type: string;
    label: string;
}

export interface ExtractionResult {
    entities: ExtractedEntity[];
    relationships: ExtractedRelationship[];
    summary: string;
}

export async function extractEntitiesFromPremise(
    premise: string,
    settings?: AISettings
): Promise<ExtractionResult> {
    const s = settings || loadAISettings();
    const provider = s.defaultProvider;
    const model = s.defaultModel;
    const apiKey = s.apiKeys[provider];

    if (!apiKey) {
        throw new Error(`No API key configured for ${provider}. Go to Settings to add one.`);
    }

    const prompt = `You are a narrative structure analyst. Given this story premise, extract the key entities and relationships.

PREMISE:
${premise}

Respond with ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "entities": [
    {
      "entity_type": "character|timeline|event|location|theme|arc",
      "name": "Name",
      "description": "Brief description (1-2 sentences)",
      "properties": {}
    }
  ],
  "relationships": [
    {
      "from_name": "Entity A name",
      "to_name": "Entity B name",
      "relationship_type": "appears_in|participates_in|causes|related_to|belongs_to|opposes|allies_with",
      "label": "Brief label"
    }
  ],
  "summary": "One-sentence summary of the extracted narrative structure"
}

RULES:
- Extract 5-15 entities across types (characters, events, timelines, locations)
- For characters: include "role" (protagonist/antagonist/supporting) and "motivation" in properties
- For events: include approximate chronological "order" (number) in properties
- For timelines: create 1-3 timeline threads that events happen on
- Create relationships between entities that are connected in the premise
- Keep descriptions concise but informative
- Only create entities clearly mentioned or strongly implied by the premise`;

    const raw = await callProvider(provider, model, prompt, apiKey);

    // Parse JSON from response (handle markdown code fences)
    let jsonStr = raw.trim();
    if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    }

    try {
        const parsed = JSON.parse(jsonStr) as ExtractionResult;
        // Validate structure
        if (!Array.isArray(parsed.entities)) {
            throw new Error('Invalid response: missing entities array');
        }
        return parsed;
    } catch (err) {
        console.error('Failed to parse AI extraction response:', raw);
        throw new Error('AI returned invalid JSON. Please try again.');
    }
}

// ─── Consistency Checking (E3-US4) ──────────────────────────

export type IssueSeverity = 'info' | 'warning' | 'error';
export type IssueCategory = 'contradiction' | 'causality' | 'pov' | 'pacing' | 'arc' | 'continuity' | 'other';

export interface ConsistencyIssue {
    severity: IssueSeverity;
    issue_type: IssueCategory;
    title: string;
    description: string;
    suggestion: string;
    entity_id?: string;
    related_entity_id?: string;
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
        id: string;
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
    info: '💡',
};

const CATEGORY_LABELS: Record<IssueCategory, string> = {
    contradiction: 'Contradiction',
    causality: 'Causality Break',
    pov: 'POV Issue',
    pacing: 'Pacing',
    arc: 'Unresolved Arc',
    continuity: 'Continuity',
    other: 'Other',
};

export { SEVERITY_ICONS, CATEGORY_LABELS };

function buildConsistencyPrompt(req: CheckConsistencyRequest): string {
    let prompt = `You are a narrative consistency analyzer for a multi - timeline storytelling tool called Chronos.

## Task
Analyze the following narrative elements for ** logical inconsistencies, contradictions, and plot holes **.Be thorough but fair — only flag genuine issues, not stylistic choices.

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
        prompt += `\n### ${type.charAt(0).toUpperCase() + type.slice(1)} s\n`;
        for (const e of entities) {
            prompt += `- ** ${e.name}**: ${e.description || '(no description)'} `;
            if (e.properties && Object.keys(e.properties).length > 0) {
                const props = Object.entries(e.properties)
                    .filter(([, v]) => v !== null && v !== undefined && v !== '')
                    .map(([k, v]) => `${k}: ${v} `)
                    .join(', ');
                if (props) prompt += ` [${props}]`;
            }
            prompt += '\n';
        }
    }

    prompt += `
## Analysis Categories
Look for these specific types of issues:

1. **contradiction** — Direct contradictions in facts, traits, or states.
2. **causality** — Effects without causes, or events that should logically prevent subsequent events.
3. **continuity** — Timeline paradoxes, temporal gaps, or sequence errors.
4. **arc** — Unresolved narrative arcs or abandoned subplots.
5. **pov** — Shifts or errors in point-of-view constraints (if applicable).
6. **pacing** — Narrative pacing issues.
7. **other** — Any other logical gap.

## Response Format
Respond ONLY with valid JSON in this exact format:
{
    "issues": [
        {
            "severity": "info|warning|error",
            "issue_type": "contradiction|causality|pov|pacing|arc|continuity|other",
            "title": "Short descriptive title (max 10 words)",
            "description": "2-3 sentence explanation of the issue",
            "entity_name": "Name of primary affected entity",
            "related_entity_name": "Name of secondary affected entity (or null)",
            "suggestion": "Specific suggestion to resolve"
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
                        'Authorization': `Bearer ${apiKey} `
                    },
                    body: JSON.stringify({
                        model,
                        messages: [{ role: 'user', content: prompt }],
                        temperature: 0.3,   // Lower for analysis
                        max_tokens: 4000    // More room for detailed report
                    })
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
                        'anthropic-dangerous-direct-browser-access': 'true'
                    },
                    body: JSON.stringify({
                        model,
                        max_tokens: 4000,
                        messages: [{ role: 'user', content: prompt }]
                    })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error?.message || 'Anthropic API error');
                text = data.content[0].text;
                break;
            }
            case 'google': {
                response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { temperature: 0.3, maxOutputTokens: 4000 }
                    })
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
                (issue: any) => {
                    const primaryEntity = req.entities.find(e => e.name === issue.entity_name);
                    const relatedEntity = req.entities.find(e => e.name === issue.related_entity_name);

                    return {
                        severity: (['info', 'warning', 'error'].includes(issue.severity)
                            ? issue.severity : 'warning') as IssueSeverity,
                        issue_type: (['contradiction', 'causality', 'pov', 'pacing', 'arc', 'continuity', 'other'].includes(issue.issue_type)
                            ? issue.issue_type : 'other') as IssueCategory,
                        title: issue.title || 'Untitled Issue',
                        description: issue.description || '',
                        suggestion: issue.suggestion || '',
                        entity_id: primaryEntity?.id,
                        related_entity_id: relatedEntity?.id,
                    };
                }
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

// ─── Style Profile Analysis (Sprint 3: B-04) ────────────────
export interface StyleAnalysisResult {
    preferences: Record<string, string | number>;
    model: string;
    provider: AIProvider;
}

export async function analyzeStyleFromProse(
    prose: string,
    existingPreferences?: Record<string, string | number>,
    settings?: AISettings
): Promise<StyleAnalysisResult> {
    const aiSettings = settings || loadAISettings();
    const provider = aiSettings.defaultProvider;
    const model = aiSettings.defaultModel;
    const apiKey = aiSettings.apiKeys[provider];

    if (!apiKey) {
        throw new Error(`No API key configured for ${provider}. Go to Settings to add one.`);
    }

    const currentStyleContext = existingPreferences && Object.keys(existingPreferences).length > 0
        ? `\nCurrent Style Profile Metrics:\n${JSON.stringify(existingPreferences, null, 2)}\n\nUpdate these metrics based on the new text.`
        : '';

    const prompt = `You are an expert NLP style analyst. Analyze the following piece of creative prose and determine the author's writing style preferences.

PROSE TO ANALYZE:
"""
${prose}
"""${currentStyleContext}

Return a JSON object containing EXACTLY these keys with the appropriate values based on the text (update existing metrics or generate new ones):
{
  "sentence_length": "short|mixed|long",
  "metaphor_density": "low|moderate|high",
  "dialogue_ratio": 0.0 to 1.0 (float representing percentage of dialogue),
  "pov_style": "first|second|third_limited|third_omniscient",
  "tense": "past|present",
  "tone": "neutral|dark|humorous|somber|lyrical|clinical",
  "vocabulary_level": "simple|standard|literary"
}

Respond ONLY with valid JSON. No markdown formatting, no explanations.`;

    // We can use callProviderForAnalysis since it has temp 0.3, suitable for analytical tasks
    const raw = await callProviderForAnalysis(provider, model, prompt, apiKey);

    // Parse JSON
    let jsonStr = raw;
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1];

    try {
        const parsed = JSON.parse(jsonStr.trim());
        return {
            preferences: parsed,
            model,
            provider
        };
    } catch (err) {
        throw new Error('Failed to parse style analysis from AI: ' + raw);
    }
}
