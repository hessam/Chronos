export interface ProseAnalysisResult {
    severity: 'critical' | 'major' | 'minor' | 'good';
    message: string;
    fix: string | null;
}

export interface FullProseDiagnostics {
    overusedWords: ProseAnalysisResult | null;
    purpleProse: ProseAnalysisResult | null;
    senses: ProseAnalysisResult | null;
    monotony: ProseAnalysisResult | null;
    stasis: ProseAnalysisResult | null;
    filterWords: ProseAnalysisResult | null;
    wordCount: number;
}

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
const sentenceCount = (text: string) => Math.max(1, (text.match(/[.!?]+/g) || []).length);

export function analyzeProseChunk(text: string): FullProseDiagnostics {
    if (!text || text.trim().length === 0) {
        return {
            overusedWords: null, purpleProse: null, senses: null,
            monotony: null, stasis: null, filterWords: null, wordCount: 0
        };
    }

    return {
        overusedWords: detectRepetition(text),
        purpleProse: detectPurpleProse(text),
        senses: detectSenses(text),
        monotony: detectMonotony(text),
        stasis: detectStasis(text),
        filterWords: detectFilterWords(text),
        wordCount: wordCount(text)
    };
}

// ─── 1. Repetition Detector ──────────────────────────────
function extractNouns(text: string): string[] {
    // Simple heuristic: words > 3 chars that aren't common stop words
    const stopWords = new Set(['that', 'with', 'from', 'this', 'were', 'have', 'been', 'what', 'their', 'there', 'they', 'when', 'which', 'could', 'would', 'should']);
    return text.toLowerCase().match(/\b[a-z]{4,}\b/g)?.filter(w => !stopWords.has(w)) || [];
}

function detectRepetition(text: string): ProseAnalysisResult | null {
    const words = extractNouns(text);
    const frequency: Record<string, number> = {};

    words.forEach(word => {
        frequency[word] = (frequency[word] || 0) + 1;
    });

    const maxRepetitions = wordCount(text) > 500 ? 5 : 3;
    const overused = Object.entries(frequency)
        .filter(([_, count]) => count > maxRepetitions)
        .map(([word, count]) => ({ word, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5); // Take top 5

    if (overused.length > 0) {
        return {
            severity: 'major',
            message: `Overused words: ${overused.map(w => `"${w.word}" (${w.count}x)`).join(', ')}`,
            fix: 'Use pronouns, synonyms, or restructure sentences to avoid repetition.'
        };
    }
    return null;
}

// ─── 2. Purple Prose Detector ────────────────────────────
function detectPurpleProse(text: string): ProseAnalysisResult | null {
    const textLower = text.toLowerCase();
    const metaphorMarkers = ['as if', 'like a', 'like an', 'seemed to', 'appeared to', 'as though'];
    const complexModifiers = ['haunting', 'ethereal', 'labyrinthine', 'ephemeral', 'visceral', 'crystalline', 'tumult', 'tapestry'];

    let metaphorCount = 0;
    for (const marker of metaphorMarkers) {
        let idx = textLower.indexOf(marker);
        while (idx !== -1) {
            metaphorCount++;
            idx = textLower.indexOf(marker, idx + 1);
        }
    }

    let modifierCount = 0;
    for (const mod of complexModifiers) {
        let idx = textLower.indexOf(mod);
        while (idx !== -1) {
            modifierCount++;
            idx = textLower.indexOf(mod, idx + 1);
        }
    }

    const sCount = sentenceCount(text);
    const metaphorDensity = metaphorCount / sCount;
    const modifierDensity = modifierCount / wordCount(text);

    if (metaphorDensity > 0.4 || modifierDensity > 0.05) {
        return {
            severity: 'critical',
            message: `Purple prose detected. High density of elaborate metaphors (${metaphorCount}) or flowery adjectives (${modifierCount}).`,
            fix: 'Simplify sentences. Save metaphors for crucial moments. Trust your hard nouns.'
        };
    }
    return null;
}

// ─── 3. Sensory Grounding ────────────────────────────────
function detectSenses(text: string): ProseAnalysisResult | null {
    const textLower = text.toLowerCase();
    const senses = {
        sight: ['saw', 'looked', 'saw', 'shimmered', 'glowed', 'bright', 'dark', 'shadow', 'color'],
        sound: ['heard', 'scream', 'echo', 'whispered', 'sound', 'noise', 'quiet', 'loud', 'bang'],
        touch: ['felt', 'touched', 'cold', 'warm', 'rough', 'smooth', 'heat', 'chill', 'soft', 'hard'],
        smell: ['smelled', 'scent', 'aroma', 'stench', 'odor', 'breathed', 'smoke'],
        taste: ['tasted', 'bitter', 'sweet', 'metallic', 'blood', 'tongue', 'mouth'] // Added logical words for taste
    };

    const sensesUsed = Object.keys(senses).filter(sense =>
        (senses as any)[sense].some((word: string) => textLower.includes(word))
    );

    if (wordCount(text) > 100 && sensesUsed.length < 3) {
        return {
            severity: 'major',
            message: `Only ${sensesUsed.length} senses actively used (${sensesUsed.join(', ')}). Missing sensory grounding.`,
            fix: `Add grounding details for: ${Object.keys(senses).filter(s => !sensesUsed.includes(s)).join(', ')}`
        };
    }
    return null;
}

// ─── 4. Stasis & Forward Momentum ────────────────────────
function detectStasis(text: string): ProseAnalysisResult | null {
    // Only flag stasis for longer chunks where something SHOULD happen
    if (wordCount(text) < 150) return null;

    const textLower = text.toLowerCase();
    const actionVerbs = ['moved', 'walked', 'ran', 'spoke', 'said', 'asked', 'decided', 'pressed', 'grabbed', 'pushed', 'pulled', 'opened', 'closed', 'shook'];

    let actionCount = 0;
    for (const action of actionVerbs) {
        if (textLower.includes(action)) actionCount++;
    }

    const paragraphs = text.split(/\n\n+/).length;

    if (actionCount <= 1 && paragraphs > 3) {
        return {
            severity: 'critical',
            message: 'Scene lacks forward momentum. Lots of description but protagonist takes almost no physical action.',
            fix: 'Add concrete physical action: movement, dialogue, interaction with the environment, or a firm decision.'
        };
    }
    return null;
}

// ─── 5. Sentence Monotony ────────────────────────────────
function detectMonotony(text: string): ProseAnalysisResult | null {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    if (sentences.length < 5) return null;

    const structures = sentences.map(s => {
        const commaCount = (s.match(/,/g) || []).length;
        const wCount = s.trim().split(/\s+/).length;
        return { commas: commaCount, length: wCount };
    });

    // Check for "medium-long sentence with lots of commas" pattern
    const longComplexSentences = structures.filter(s => s.commas >= 2 && s.length >= 15).length;

    if (longComplexSentences / sentences.length > 0.6) {
        return {
            severity: 'major',
            message: `Over ${(longComplexSentences / sentences.length * 100).toFixed(0)}% of sentences are long and complex. Monotonous rhythm.`,
            fix: 'Vary rhythm. Add short punchy sentences (3-8 words) between the long descriptive ones.'
        };
    }
    return null;
}

// ─── 6. Filter Words & Passive Voice ─────────────────────
function detectFilterWords(text: string): ProseAnalysisResult | null {
    const textLower = text.toLowerCase();
    const filterWords = ['seemed to', 'felt like', 'could hear', 'could see', 'realized that', 'noticed that', 'was drawn', 'was given'];

    let filterCount = 0;
    for (const filter of filterWords) {
        let idx = textLower.indexOf(filter);
        while (idx !== -1) {
            filterCount++;
            idx = textLower.indexOf(filter, idx + 1);
        }
    }

    if (filterCount > 3) {
        return {
            severity: 'minor',
            message: `Found ${filterCount} filter words (seemed, felt, could) or passive constructions.`,
            fix: 'Show directly. Instead of "he could hear the scream," use "the scream echoed."'
        };
    }
    return null;
}
