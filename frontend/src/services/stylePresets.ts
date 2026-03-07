/**
 * Style Presets System
 * 
 * Each preset contains concrete reference prose (positive + negative examples),
 * hard constraints, cliché blacklists, and character voice rules.
 * The AI prompt is built from these presets, not from vague labels.
 */

export interface StylePreset {
    id: string;
    name: string;
    description: string;

    /** 2-3 paragraphs of reference prose the AI MUST match in style */
    positiveExamples: string[];

    /** 2-3 paragraphs the AI must NOT produce */
    negativeExamples: string[];

    /** Concrete bullet rules injected into the prompt */
    hardConstraints: string[];

    /** Exact phrases banned from output */
    clicheBlacklist: string[];

    /** Filter words to penalize (seemed, felt, appeared, etc.) */
    filterWords: string[];

    /** Numeric targets */
    targets: {
        maxMetaphorsPerParagraph: number;
        minShortSentencePercent: number;  // percent of sentences < 10 words
        minSensoryChannels: number;       // out of 5 (sight, sound, smell, touch, taste)
        avgSentenceLength: { min: number; max: number };  // word count range
    };
}

// ─── KUBRICK / CLARKE — Sparse, clinical, technical ──────────────────────

const kubrick: StylePreset = {
    id: 'kubrick',
    name: 'Kubrick / Clarke',
    description: 'Sparse, clinical, technical. Builds dread through understatement. Short declarative sentences.',

    positiveExamples: [
        `The sound was faint. At first, Bowman thought it was feedback in his headset. He adjusted the gain. The sound continued. It was regular and pulsing, not mechanical. Something organic. Which was impossible.`,

        `Anselm ran the quantum stability diagnostic for the third time that hour. Timeline integrity held at one hundred percent. Temperature read 2.9 Kelvin, nominal for the depth. The crystalline structure around him was silent, locked at the particle level. Nothing should move here. Nothing could move here. But at 07:23:41, the acoustic sensor registered a frequency. 440 Hertz. Source: unknown. He stared at the readout. Something was vibrating in a place where vibration should not exist.`,

        `Three hundred meters of crystalline lattice separated him from the surface. The quantum locks held every atom frozen in its probability state. His suit registered the ambient temperature at 2.9 Kelvin. The emergency console glowed with steady green indicators. Everything was nominal. Then the waveform appeared on his display — an organic acoustic signature, coherent across three billion years of quantum-locked stasis. Impossible. Decoherence should have collapsed it in microseconds.`,
    ],

    negativeExamples: [
        `Shadows pulsed with a life of their own as his heart pounded with the weight of an impossible decision, each beat echoing through the chamber like a drum of fate.`,

        `Deep within the heart of the crystalline core, fingers danced over the cold console as time itself bent to subjective whim, a cacophony of timelines crashing together in a symphony of chaos.`,

        `Compassion clashed violently with duty, the protocols etched into his psyche a relentless tide against the urge to free whatever entity cried out in agony from its eternal prison of quantum solitude.`,
    ],

    hardConstraints: [
        'Maximum 1 metaphor per paragraph. Zero metaphors preferred.',
        'Vary sentence lengths naturally. Mix short declarative sentences (5-8 words) with medium ones (10-18 words). Never more than 2 short sentences in a row.',
        'Include specific technical details: instrument readings with units, measurements, timestamps, temperatures in Kelvin.',
        'NO abstract emotion descriptions. Show emotions through physical reactions and instrument data only.',
        'Ground EVERY paragraph in at least 2 senses (sight, sound, touch, smell, taste).',
        'Character thoughts must reflect their profession. A physicist thinks in physics — equations, units, measurements, anomaly classification.',
        'NO exclamation marks. Understatement builds dread, not exclamation.',
        'Write COMPLETE sentences, not fragments. Even short sentences need a subject and verb.',
        'Use in-universe technology and terminology. No modern-day anachronisms (no fluorescent lights, no copper wires, no household voltages).',
    ],

    clicheBlacklist: [
        'heart pounded', 'heart pounding', 'heart hammered', 'heart racing',
        'fingers danced', 'fingers flew',
        'storm of conflict', 'storm of emotion', 'storm raged',
        'deep within the heart', 'at the heart of',
        'time itself', 'fabric of reality', 'fabric of existence',
        'ripple through', 'rippled through',
        'shadows pulsed', 'shadows danced', 'shadows crept',
        'a chill ran down', 'chill crawled along', 'chill down his spine',
        'blood ran cold', 'blood froze',
        'pierced the silence', 'shattered the silence', 'broke the silence',
        'weight of the decision', 'weight of the world',
        'impossible shriek', 'haunting shriek', 'terrible shriek',
        'cacophony of', 'symphony of',
        'relentless tide', 'relentless force',
        'etched into his', 'etched into her',
        'time stood still', 'time seemed to stop',
        'felt a surge of', 'surge of adrenaline',
        'desperate plea', 'desperate cry',
        'sent shivers', 'sent a shiver',
    ],

    filterWords: [
        'seemed', 'felt', 'appeared', 'somehow', 'suddenly', 'very', 'really',
        'just', 'quite', 'rather', 'slightly', 'somewhat', 'merely',
        'more than mere', 'barely a', 'stark violation', 'utter',
    ],

    targets: {
        maxMetaphorsPerParagraph: 1,
        minShortSentencePercent: 33,
        minSensoryChannels: 3,
        avgSentenceLength: { min: 6, max: 15 },
    },
};

// ─── LITERARY — Dense, layered, Cormac McCarthy ──────────────────────────

const literary: StylePreset = {
    id: 'literary',
    name: 'Literary / McCarthy',
    description: 'Dense, rhythmic, minimal punctuation. Concrete imagery, no sentimentality.',

    positiveExamples: [
        `He walked out in the gray light and stood and he saw for a brief moment the absolute truth of the world. The cold relentless circling of the intestate earth. Darkness implacable. The blind dogs of the sun in their running. The crushing black vacuum of the universe.`,

        `The man squatted and looked at him. He was just a tramp. He stood up and looked downriver and back again. Come on, he said. The boy didnt move. He went back. Come on, he said. He looked at the boy. The boy looked at him.`,

        `The corridor stretched forty meters. Gray concrete. No windows. The emergency light at the far end strobed red. Every surface ran with condensation. He could taste the copper in the recirculated air.`,
    ],

    negativeExamples: [
        `She felt overwhelmed by the beauty of the sunset, its magnificent colors painting the sky in a breathtaking display of nature's artistry that filled her heart with wonder.`,

        `His emotions were a complex tapestry of joy and sorrow, woven together by the threads of memory and the relentless passage of time that had shaped his tortured soul.`,

        `The darkness descended upon them like a velvet curtain, shrouding the world in its obsidian embrace as they huddled together against the encroaching void.`,
    ],

    hardConstraints: [
        'Favor parataxis: short clauses joined by "and" rather than subordinate clauses.',
        'Minimal dialogue tags. "He said." Never "he exclaimed" or "he whispered urgently."',
        'Concrete > Abstract. A "thirty-caliber rifle" not "a weapon."',
        'No semicolons. Few commas. Let rhythm come from conjunction and repetition.',
        'Ground every description in tangible, physical reality. Soil, steel, skin, blood.',
        'Emotions conveyed through action and gesture, never named directly.',
        'Maximum 2 metaphors per paragraph, and they must be drawn from the natural/physical world.',
    ],

    clicheBlacklist: [
        'heart pounded', 'heart sank', 'tears streamed',
        'breathtaking', 'awe-inspiring', 'magnificent',
        'tapestry of', 'mosaic of', 'symphony of',
        'velvet curtain', 'obsidian embrace',
        'tortured soul', 'heavy heart',
        'overwhelming sense of', 'wave of emotion',
        'the darkness descended', 'shadows loomed',
        'piercing gaze', 'steely resolve',
    ],

    filterWords: [
        'seemed', 'felt', 'appeared', 'somehow', 'very', 'really',
        'rather', 'quite', 'slightly', 'somewhat',
        'beautiful', 'wonderful', 'terrible', 'horrible', 'amazing',
    ],

    targets: {
        maxMetaphorsPerParagraph: 2,
        minShortSentencePercent: 25,
        minSensoryChannels: 3,
        avgSentenceLength: { min: 5, max: 20 },
    },
};

// ─── COMMERCIAL — Pacey, thriller, page-turner ───────────────────────────

const commercial: StylePreset = {
    id: 'commercial',
    name: 'Commercial / Thriller',
    description: 'Fast-paced, action-forward, chapter-ending hooks. Short paragraphs.',

    positiveExamples: [
        `The lock clicked. Reacher pushed the door open with his left hand. His right hand held the Glock level. The room was empty. Almost empty. A chair in the center. Duct tape on the arms. Blood on the floor. Three drops. Still wet.`,

        `She had nine seconds. The timer on the device confirmed it, red digits counting backward with mechanical precision. Nine seconds to cross twelve meters of open hallway with a guard at each end.`,

        `The phone rang at 3:47 AM. Jack picked up on the second ring. "We have a situation," Mason said. No greeting, no apology for the hour. Jack was already reaching for his shoes.`,
    ],

    negativeExamples: [
        `The sun-dappled meadow stretched before her, a tapestry of wildflowers swaying gently in the perfumed breeze as she contemplated the very nature of existence itself.`,

        `He pondered the philosophical implications of his predicament, weighing each possibility against the other in an internal dialogue that stretched across the vast landscape of his consciousness.`,
    ],

    hardConstraints: [
        'Short paragraphs: 1-4 sentences max.',
        'End every scene on a hook or unanswered question.',
        'Action scenes: sentences under 10 words.',
        'Show time pressure through concrete countdowns, distances, body counts.',
        'No internal monologue longer than 2 sentences. Get back to action.',
        'Dialogue is clipped: no speeches. Max 2 sentences per character per exchange.',
        'Every paragraph must advance the plot. If it doesn\'t move forward, cut it.',
    ],

    clicheBlacklist: [
        'heart pounded', 'blood ran cold', 'steely gaze',
        'against all odds', 'the clock was ticking',
        'there was no turning back', 'little did he know',
        'a chill ran down', 'with bated breath',
        'fought for his life', 'a race against time',
    ],

    filterWords: [
        'seemed', 'felt', 'appeared', 'somehow', 'suddenly',
        'began to', 'started to', 'proceeded to',
    ],

    targets: {
        maxMetaphorsPerParagraph: 1,
        minShortSentencePercent: 40,
        minSensoryChannels: 2,
        avgSentenceLength: { min: 4, max: 12 },
    },
};

// ─── CINEMATIC — Visual, Spielberg-like, wide shots ──────────────────────

const cinematic: StylePreset = {
    id: 'cinematic',
    name: 'Cinematic / Spielberg',
    description: 'Visual, camera-angle thinking. Wide establishing shots, then close on faces.',

    positiveExamples: [
        `The facility filled the valley floor. From the ridge, it looked like a grid of white rectangles pressed into the earth, connected by covered walkways. Steam rose from three cooling towers on the western edge. A single road in. No road out.`,

        `Close on her hands: steady. Left hand on the containment seal, right hand reaching for the release. Her reflection in the polished steel surface was calm, almost bored. Behind her, through the observation window, the cloud formation was changing.`,

        `Morning light cut through the hangar doors in a flat beam, catching dust motes and cigarette smoke. The bomber sat in the center of the concrete floor, tarpaulins pulled back, engines exposed. Twenty-seven men stood around it. Nobody spoke.`,
    ],

    negativeExamples: [
        `She felt a deep connection to the universe as the stars twinkled in the cosmos, each one whispering ancient secrets to her weary but hopeful soul.`,
    ],

    hardConstraints: [
        'Open scenes with WIDE establishing shots: location, scale, time of day.',
        'Then CUT TO close-ups: hands, faces, small details.',
        'Describe what a CAMERA would show, not what a narrator would explain.',
        'Light and shadow are characters. Always note the quality of light.',
        'Sound design: note ambient sounds, silence, and contrast.',
        'No internal monologue in action scenes. Only what is visible and audible.',
        'Transitions: use hard cuts between paragraphs, not flowing prose transitions.',
    ],

    clicheBlacklist: [
        'heart pounded', 'deep connection',
        'whispered ancient secrets', 'twinkling stars',
        'the world seemed to stop', 'time froze',
        'the air was electric', 'electricity crackled',
    ],

    filterWords: [
        'seemed', 'felt', 'appeared', 'somehow', 'very', 'really',
        'beautiful', 'amazing', 'incredible',
    ],

    targets: {
        maxMetaphorsPerParagraph: 2,
        minShortSentencePercent: 25,
        minSensoryChannels: 3,
        avgSentenceLength: { min: 8, max: 18 },
    },
};

// ─── MINIMALIST — Hemingway, iceberg theory ──────────────────────────────

const minimalist: StylePreset = {
    id: 'minimalist',
    name: 'Minimalist / Hemingway',
    description: 'Iceberg theory. What is left unsaid matters more than what is said.',

    positiveExamples: [
        `They sat at the table. The girl looked out at the hills. "They look like white elephants," she said. "I've never seen one," the man said and drank his beer. "No, you wouldn't have."`,

        `He sat down on the bed. The room was small and the window was open. Outside he could hear traffic on the bridge. He took off his shoes and set them on the floor. Then he lay back and looked at the ceiling.`,

        `The station was empty. He checked the schedule. The train was late. He put the timetable back in his pocket and walked to the end of the platform. There was nothing to see. He walked back.`,
    ],

    negativeExamples: [
        `His heart was overwhelmed by the enormity of his grief, a vast ocean of sadness that threatened to drown him in its unfathomable depths.`,
    ],

    hardConstraints: [
        'Simple words only. Never use a complex word where a simple one works.',
        'Maximum 15 words per sentence.',
        'Emotion is expressed through what characters DO, never what they feel.',
        'Dialogue carries the story. Narration is minimal.',
        'Never explain. Trust the reader to understand subtext.',
        'Objects matter. Name specific objects: "a bottle of Fundador", not "a bottle."',
        'No adverbs. Cut every -ly word.',
    ],

    clicheBlacklist: [
        'heart pounded', 'heart sank', 'tears streamed',
        'overwhelming', 'unfathomable', 'enormous grief',
        'ocean of sadness', 'wave of emotion',
        'profound', 'existential', 'transcendent',
    ],

    filterWords: [
        'seemed', 'felt', 'appeared', 'somehow', 'very', 'really',
        'just', 'quite', 'somewhat', 'rather', 'slightly',
        'suddenly', 'incredibly', 'extremely', 'absolutely',
    ],

    targets: {
        maxMetaphorsPerParagraph: 0,
        minShortSentencePercent: 50,
        minSensoryChannels: 2,
        avgSentenceLength: { min: 4, max: 12 },
    },
};

// ─── Registry ────────────────────────────────────────────────────────────

export const STYLE_PRESETS: Record<string, StylePreset> = {
    kubrick,
    literary,
    commercial,
    cinematic,
    minimalist,
};

export const STYLE_PRESET_LIST: StylePreset[] = Object.values(STYLE_PRESETS);

export function getStylePreset(id: string): StylePreset | undefined {
    return STYLE_PRESETS[id];
}

/**
 * Compiles a style preset into a prompt block ready for injection.
 * This is the key function that transforms a preset into AI instructions.
 */
export function compileStylePrompt(preset: StylePreset): string {
    const positiveBlock = preset.positiveExamples
        .map((ex, i) => `Example ${i + 1}:\n"${ex}"`)
        .join('\n\n');

    const negativeBlock = preset.negativeExamples
        .map((ex, i) => `Bad Example ${i + 1}:\n"${ex}"`)
        .join('\n\n');

    const constraintBlock = preset.hardConstraints
        .map((c, i) => `${i + 1}. ${c}`)
        .join('\n');

    const blacklistSample = preset.clicheBlacklist.slice(0, 15).map(c => `"${c}"`).join(', ');

    return `## STYLE: ${preset.name}
${preset.description}

### HARD CONSTRAINTS (MANDATORY — violation = regeneration)
${constraintBlock}

### WRITE LIKE THIS (match this style exactly):
${positiveBlock}

### DO NOT WRITE LIKE THIS (these patterns are banned):
${negativeBlock}

### BANNED PHRASES (instant failure if used):
${blacklistSample}

### BANNED FILTER WORDS (remove from your output):
${preset.filterWords.slice(0, 10).map(w => `"${w}"`).join(', ')}
`;
}
