/**
 * Post-Generation Prose Validator
 * 
 * Runs client-side checks on AI-generated prose BEFORE showing it to the user.
 * Returns a list of issues found. If critical issues exist, the caller can
 * trigger an auto-retry with the issues as revision instructions.
 */

import type { StylePreset } from './stylePresets';

export interface ValidationIssue {
    severity: 'critical' | 'major' | 'minor';
    category: string;
    message: string;
    detail?: string;
}

export interface ValidationResult {
    passed: boolean;
    score: number;          // 0-100
    issues: ValidationIssue[];
    stats: {
        wordCount: number;
        sentenceCount: number;
        avgSentenceLength: number;
        shortSentencePercent: number;
        clichesFound: string[];
        filterWordsFound: string[];
        sensoryChannels: string[];
    };
}

/**
 * Validates generated prose against a style preset's constraints.
 */
export function validateProse(
    text: string,
    preset: StylePreset,
    targetWordCount?: number
): ValidationResult {
    const issues: ValidationIssue[] = [];

    // Basic stats
    const words = text.trim().split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
    const sentenceCount = sentences.length;
    const sentenceLengths = sentences.map(s => s.split(/\s+/).filter(Boolean).length);
    const avgSentenceLength = sentenceCount > 0
        ? Math.round(sentenceLengths.reduce((a, b) => a + b, 0) / sentenceCount)
        : 0;
    const shortSentences = sentenceLengths.filter(l => l < 10).length;
    const shortSentencePercent = sentenceCount > 0
        ? Math.round((shortSentences / sentenceCount) * 100)
        : 0;

    // ─── Check 1: Cliché Detection ───────────────────────────────────────
    const textLower = text.toLowerCase();
    const clichesFound: string[] = [];
    for (const cliche of preset.clicheBlacklist) {
        if (textLower.includes(cliche.toLowerCase())) {
            clichesFound.push(cliche);
        }
    }
    if (clichesFound.length > 0) {
        issues.push({
            severity: 'critical',
            category: 'cliche',
            message: `${clichesFound.length} banned cliché(s) detected`,
            detail: clichesFound.map(c => `"${c}"`).join(', ')
        });
    }

    // ─── Check 2: Filter Words ───────────────────────────────────────────
    const filterWordsFound: string[] = [];
    for (const fw of preset.filterWords) {
        // Match whole word only
        const regex = new RegExp(`\\b${fw}\\b`, 'gi');
        if (regex.test(text)) {
            filterWordsFound.push(fw);
        }
    }
    const filterWordDensity = filterWordsFound.length / Math.max(wordCount, 1);
    if (filterWordDensity > 0.01) {
        issues.push({
            severity: 'major',
            category: 'filter_words',
            message: `Too many filter words (${filterWordsFound.length} found, ${(filterWordDensity * 100).toFixed(1)}% density)`,
            detail: filterWordsFound.map(w => `"${w}"`).join(', ')
        });
    }

    // ─── Check 3: Sentence Variety ───────────────────────────────────────
    if (shortSentencePercent < preset.targets.minShortSentencePercent && sentenceCount > 3) {
        issues.push({
            severity: 'major',
            category: 'sentence_variety',
            message: `Not enough short sentences: ${shortSentencePercent}% under 10 words (need ${preset.targets.minShortSentencePercent}%+)`,
        });
    }

    // ─── Check 4: Word Count ─────────────────────────────────────────────
    if (targetWordCount) {
        const tolerance = targetWordCount * 0.15;
        if (wordCount < targetWordCount - tolerance) {
            issues.push({
                severity: 'major',
                category: 'word_count',
                message: `Too short: ${wordCount} words (target: ${targetWordCount} ±15%)`
            });
        } else if (wordCount > targetWordCount + tolerance) {
            issues.push({
                severity: 'minor',
                category: 'word_count',
                message: `Too long: ${wordCount} words (target: ${targetWordCount} ±15%)`
            });
        }
    }

    // ─── Check 5: Sensory Coverage ───────────────────────────────────────
    const sensoryChannels: string[] = [];
    const sensoryKeywords: Record<string, string[]> = {
        sight: ['saw', 'looked', 'watched', 'light', 'dark', 'shadow', 'color', 'bright', 'dim', 'glow', 'red', 'blue', 'green', 'gray', 'white', 'black', 'reflected', 'flicker', 'visible', 'display', 'screen', 'eye'],
        sound: ['heard', 'sound', 'noise', 'silence', 'echo', 'voice', 'hum', 'buzz', 'crackle', 'whisper', 'scream', 'ring', 'click', 'beep', 'tone', 'frequency', 'acoustic'],
        touch: ['felt', 'cold', 'warm', 'hot', 'rough', 'smooth', 'pressure', 'grip', 'touch', 'vibrat', 'weight', 'surface', 'skin', 'finger', 'hand', 'metal'],
        smell: ['smell', 'scent', 'odor', 'stench', 'fragrance', 'nose', 'ozone', 'acrid', 'musty', 'sharp'],
        taste: ['taste', 'tongue', 'bitter', 'sweet', 'sour', 'salty', 'mouth', 'metallic', 'copper'],
    };

    for (const [sense, keywords] of Object.entries(sensoryKeywords)) {
        if (keywords.some(kw => textLower.includes(kw))) {
            sensoryChannels.push(sense);
        }
    }

    if (sensoryChannels.length < preset.targets.minSensoryChannels) {
        const missing = Object.keys(sensoryKeywords).filter(s => !sensoryChannels.includes(s));
        issues.push({
            severity: 'minor',
            category: 'sensory',
            message: `Only ${sensoryChannels.length}/${preset.targets.minSensoryChannels} required senses covered. Missing: ${missing.join(', ')}`,
        });
    }

    // ─── Score Calculation ────────────────────────────────────────────────
    let score = 100;
    for (const issue of issues) {
        if (issue.severity === 'critical') score -= 30;
        else if (issue.severity === 'major') score -= 15;
        else score -= 5;
    }
    score = Math.max(0, score);

    return {
        passed: issues.filter(i => i.severity === 'critical').length === 0,
        score,
        issues,
        stats: {
            wordCount,
            sentenceCount,
            avgSentenceLength,
            shortSentencePercent,
            clichesFound,
            filterWordsFound,
            sensoryChannels,
        },
    };
}

/**
 * Builds a revision prompt from validation issues.
 * Used when auto-retrying after failed validation.
 */
export function buildRevisionPrompt(
    originalText: string,
    issues: ValidationIssue[]
): string {
    const issueList = issues
        .map(i => `- [${i.severity.toUpperCase()}] ${i.message}${i.detail ? `: ${i.detail}` : ''}`)
        .join('\n');

    return `The following prose was rejected by the quality validator. Revise it to fix ALL issues.

## GENERATED PROSE (REJECTED)
"""
${originalText}
"""

## ISSUES TO FIX
${issueList}

## INSTRUCTIONS
1. Fix every listed issue
2. Maintain the same narrative content and story beats
3. Do NOT add purple prose or abstractions while fixing
4. Return the revised prose in the same JSON format as before
`;
}
