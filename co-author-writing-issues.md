# **AI CO-AUTHOR CRITIQUE SYSTEM**

## **Critical Analysis of Generated Prose**

---

### **🔴 FATAL FLAWS**

**1. PURPLE PROSE OVERLOAD**
- **Issue:** Every sentence is overwrought with metaphor
- **Example:** "a tapestry of shimmering colors playing against his skin, as if time were attempting to stitch itself into his very being"
- **Impact:** Reader exhaustion, loss of clarity
- **Detection rule:** Flag when >60% of sentences contain complex metaphors
- **Fix suggestion:** "Simplify 70% of sentences. Save metaphors for key moments."

---

**2. REPETITIVE STRUCTURE**
- **Issue:** Same sentence pattern repeated 8 times
- **Pattern:** `[Subject] [action verb], [comma], [elaborate metaphorical clause]`
- **Example 1:** "Anselm stood motionless..., his eyes tracing..., as if time were..."
- **Example 2:** "A chill curled along Anselm's spine, tracing his nerves..., as the scream..."
- **Detection rule:** Flag when >3 consecutive sentences use identical grammatical structure
- **Fix suggestion:** "Vary sentence length: short (5-10 words), medium (15-20), long (25+). Current: all long."

---

**3. ZERO FORWARD MOMENTUM**
- **Issue:** 8 paragraphs, 0 plot advancement
- **What happens:** Anselm stands still thinking poetically
- **Scene function:** None - no decision made, no action taken, no information revealed
- **Detection rule:** Flag scenes where protagonist doesn't move, speak, or decide anything
- **Fix suggestion:** "Add concrete action: Anselm checks instruments, recalls a memory, speaks aloud, or presses the button. Scene needs events."

---

**4. TELLING THROUGH METAPHOR (Not Showing)**
- **Issue:** Every emotion described via abstract imagery instead of concrete detail
- **Example:** "time folded in upon itself" ← What does this look like?
- **Example:** "empathy, a haunting melody that resonated with the core of his humanity" ← Vague
- **Detection rule:** Flag when emotions described only through metaphors, never physical sensations
- **Fix suggestion:** "Replace 50% of metaphors with physical details: sweat, trembling hands, racing pulse, dry throat."

---

**5. WORD REPETITION**
- **"scream"** appears 15 times in 8 paragraphs
- **"crystalline/crystal"** appears 9 times
- **"lattice/Lattice Core"** appears 12 times
- **"trembling/tremble"** appears 5 times
- **Detection rule:** Flag when same noun appears >3 times per 1000 words
- **Fix suggestion:** "Use pronouns ('it'), synonyms, or restructure to avoid repetition."

---

### **🟡 MAJOR ISSUES**

**6. NO SENSORY GROUNDING**
- **Issue:** All description is visual/metaphorical, missing 4 senses
- **Missing:** Smell (metallic? ozone?), Taste (fear?), Touch (temperature?), Sound (beyond scream)
- **Detection rule:** Flag when scenes use <3 senses
- **Fix suggestion:** "Add: cold metal under fingertips, taste of copper, smell of ozone, sound of own breathing."

---

**7. UNCLEAR SPATIAL RELATIONSHIPS**
- **Issue:** Reader cannot visualize the scene
- **Questions unanswered:** How big is the room? Where is Anselm standing relative to the lever? How far must he reach?
- **Detection rule:** Flag when scenes lack spatial markers (distance, size, position)
- **Fix suggestion:** "Add orientation: 'Three meters from the lever.' 'The core stretched 30 meters above.' 'He stood at the chamber's center.'"

---

**8. ABSTRACT TIME PASSAGE**
- **Issue:** No indication of how long this scene lasts
- **How long does Anselm stand there?** 10 seconds? 10 minutes? Unknown.
- **Detection rule:** Flag scenes with no temporal markers
- **Fix suggestion:** "Add time anchors: 'For fifteen seconds, he...' or 'His chronometer showed 07:23:41.'"

---

**9. NO CHARACTER VOICE**
- **Issue:** Narrator sounds like purple prose generator, not Anselm's perspective
- **POV problem:** Supposed to be close third (Anselm POV), but reads like omniscient literary narrator
- **Detection rule:** Flag when POV character's thoughts aren't in their voice
- **Fix suggestion:** "Anselm is a physicist. His internal monologue should include technical observations, not only poetic metaphors."

---

**10. THESAURUS ABUSE**
- **Words used once then abandoned:** tumult, labyrinthine, tempest, elegy, precipice, marrow (x2), tapestry (x3)
- **Effect:** Feels like writer consulting thesaurus every sentence
- **Detection rule:** Flag when vocabulary sophistication varies wildly sentence-to-sentence
- **Fix suggestion:** "Choose consistent diction level. Academic? Poetic? Technical? Stick to it."

---

### **💡 MODERATE ISSUES**

**11. PASSIVE CONSTRUCTIONS**
- **Count:** 12 passive voice constructions in 8 paragraphs
- **Examples:** "was drawn," "was given voice," "seemed to breathe," "was a tumult"
- **Detection rule:** Flag when >20% of sentences use passive voice
- **Fix suggestion:** "Convert to active: 'The scream drew him' not 'He was drawn.'"

---

**12. FILTER WORDS**
- **Count:** "seemed" (7x), "felt" (4x), "could" (3x)
- **Effect:** Creates distance between reader and action
- **Detection rule:** Flag overuse of: seemed, felt, appeared, looked like, sounded like
- **Fix suggestion:** "Show directly: 'The scream clawed' not 'seemed to claw.'"

---

**13. MODIFIER OVERLOAD**
- **Every noun has 2+ adjectives:** "haunting melody," "crystalline facets," "visceral echo," "relentless plea"
- **Detection rule:** Flag when >40% of nouns are modified
- **Fix suggestion:** "Trust nouns. 'The scream' is stronger than 'the harrowing, soul-stripping cry.'"

---

**14. NO DIALOGUE**
- **Issue:** 8 paragraphs of internal description, 0 spoken words
- **Effect:** Monotonous, no pacing variation
- **Detection rule:** Flag scenes >1000 words with no dialogue
- **Fix suggestion:** "Add: Anselm speaks to himself, recalls someone's words, or radio chatter interrupts."

---

**15. UNCLEAR STAKES**
- **Issue:** We know Anselm is deciding something, but not why it matters
- **Missing:** What happens if he presses? What happens if he doesn't? What's he risking?
- **Detection rule:** Flag decision scenes where consequences aren't stated
- **Fix suggestion:** "Add: Anselm recalls the briefing warning, or internal thought about protocol consequences."

---

## **DETECTION ALGORITHMS FOR AI**

### **Auto-Flag System:**

```javascript
// Purple Prose Detector
function detectPurpleProse(text) {
  const metaphorMarkers = ['as if', 'like a', 'seemed to', 'appeared to'];
  const complexModifiers = ['haunting', 'ethereal', 'labyrinthine', 'ephemeral'];
  
  const metaphorDensity = countOccurrences(text, metaphorMarkers) / sentenceCount(text);
  const modifierDensity = countOccurrences(text, complexModifiers) / wordCount(text);
  
  if (metaphorDensity > 0.6 || modifierDensity > 0.1) {
    return {
      severity: 'critical',
      message: 'Purple prose detected. Over 60% of sentences use elaborate metaphors.',
      fix: 'Simplify 70% of sentences. Save metaphors for crucial moments.'
    };
  }
}

// Zero Momentum Detector
function detectStasis(scene) {
  const actions = countVerbs(scene, ['moved', 'walked', 'spoke', 'decided', 'pressed']);
  const paragraphs = scene.split('\n\n').length;
  
  if (actions === 0 && paragraphs > 3) {
    return {
      severity: 'critical',
      message: 'Scene has no forward momentum. Protagonist takes no action.',
      fix: 'Add concrete action: movement, dialogue, decision, or revelation.'
    };
  }
}

// Repetition Detector
function detectRepetition(text) {
  const words = extractNouns(text);
  const frequency = {};
  
  words.forEach(word => {
    frequency[word] = (frequency[word] || 0) + 1;
  });
  
  const overused = Object.entries(frequency)
    .filter(([word, count]) => count > 3 && wordCount(text) < 1000)
    .map(([word, count]) => ({ word, count }));
  
  if (overused.length > 0) {
    return {
      severity: 'major',
      message: `Words overused: ${overused.map(w => `"${w.word}" (${w.count}x)`).join(', ')}`,
      fix: 'Use pronouns, synonyms, or restructure sentences to avoid repetition.'
    };
  }
}

// Sensory Grounding Detector
function detectSenses(text) {
  const senses = {
    sight: ['saw', 'looked', 'appeared', 'shimmered', 'glowed'],
    sound: ['heard', 'scream', 'echo', 'whispered'],
    touch: ['felt', 'touched', 'cold', 'warm', 'rough'],
    smell: ['smelled', 'scent', 'aroma', 'stench', 'odor'],
    taste: ['tasted', 'bitter', 'sweet', 'metallic']
  };
  
  const sensesUsed = Object.keys(senses).filter(sense => 
    senses[sense].some(word => text.includes(word))
  );
  
  if (sensesUsed.length < 3) {
    return {
      severity: 'major',
      message: `Only ${sensesUsed.length} senses used (${sensesUsed.join(', ')}). Missing sensory grounding.`,
      fix: `Add missing senses: ${Object.keys(senses).filter(s => !sensesUsed.includes(s)).join(', ')}`
    };
  }
}

// Sentence Structure Monotony
function detectMonotony(text) {
  const sentences = text.split(/[.!?]+/);
  const structures = sentences.map(s => {
    const commaCount = (s.match(/,/g) || []).length;
    const wordCount = s.split(' ').length;
    return { commas: commaCount, length: wordCount };
  });
  
  // Check if >50% of sentences have similar structure
  const longComplexSentences = structures.filter(s => s.commas > 2 && s.length > 20).length;
  
  if (longComplexSentences / sentences.length > 0.5) {
    return {
      severity: 'major',
      message: 'Over 50% of sentences are long and complex. Monotonous rhythm.',
      fix: 'Vary sentence length: Add short sentences (5-10 words) between long ones.'
    };
  }
}
```

---

## **AI CO-AUTHOR SUGGESTIONS (What App Should Say)**

### **Immediate Feedback:**

```
⚠️ CRITICAL ISSUES DETECTED

Purple Prose: 85% severity
Your prose is beautiful but exhausting. Readers will struggle to follow the story.

Suggested rewrites for Paragraph 1:

CURRENT (118 words):
"Anselm stood motionless in the dim luminescence of the Lattice Core, his eyes tracing the labyrinthine weave of machinery that seemed to breathe and pulse with a life of its own..."

SUGGESTED (32 words):
"Three hundred meters below the Lattice surface, Anselm heard it: a scream that shouldn't exist. His hand hovered over the emergency release. The sound was aware. It was suffering."

Why this works:
✅ Shorter (32 vs 118 words)
✅ Concrete details (300 meters, emergency release)
✅ Clear conflict (shouldn't exist vs. does exist)
✅ Forward momentum (sets up decision)

[Apply Suggestion] [See More Options] [Keep Original]
```

---

### **Scene-Level Feedback:**

```
📊 SCENE ANALYSIS: "Anselm Hears the Screaming"

Structure Score: 3/10

Issues:
🔴 No plot advancement (0 events occur)
🔴 No character decision (scene ends where it began)
🔴 No sensory grounding (missing smell, touch, taste)
🟡 Repetitive language ("scream" 15x, "crystalline" 9x)
🟡 No dialogue (1000+ words of description only)

What readers expect in this scene:
1. Anselm discovers the scream ✓
2. Anselm investigates the source ✗
3. Anselm makes a choice about it ✗

Suggestions:

ADD EVENT 1: "Anselm Traces the Sound"
  Position: After paragraph 2
  Purpose: Gives him physical action, moves scene forward
  Draft: "He followed the sound to sector 7-G, where the quantum locks held strongest..."

ADD EVENT 2: "Anselm Finds the Release Mechanism"
  Position: After paragraph 5
  Purpose: Introduces the actual choice
  Draft: "Behind the crystalline panel: a lever marked 'Emergency Release - Protocol 7-Alpha: NEVER USE'..."

ADD EVENT 3: "Anselm's Hand Touches the Lever"
  Position: Final paragraph
  Purpose: Ends on cliffhanger
  Draft: "His finger touched metal. Cold. Real. Seven seconds to decide."

[Generate Full Revision] [Add Events Manually] [See Alternative Structure]
```

---

## **FEATURE: STYLE ANALYSIS**

### **Prose DNA Report:**

```
Your Writing Style Analysis

Sentence Length:
  Average: 34 words (Target: 15-20)
  Shortest: 18 words
  Longest: 61 words
  Recommendation: ⚠️ Add variety. Include 5-10 word sentences.

Vocabulary Sophistication:
  Grade level: 16 (college senior)
  Rare words: 23% (labyrinthine, ephemeral, precipice)
  Recommendation: ⚠️ Too sophisticated for general audience. Target: 12th grade.

Metaphor Density:
  Metaphors per 100 words: 8.2 (Target: 2-3)
  Recommendation: 🔴 Critical overuse. Reduce by 70%.

POV Consistency:
  Close third person: 60%
  Omniscient narrator: 40%
  Recommendation: ⚠️ POV drift detected. Stay in Anselm's head.

Pacing:
  Action beats: 0
  Description: 100%
  Dialogue: 0%
  Recommendation: 🔴 Static scene. Add action/dialogue.

Compare to target style (Kubrick's 2001):
  Your style: Flowery, metaphorical, slow
  Target style: Sparse, technical, precise
  Match: 25%

[See Kubrick Examples] [Adjust Style] [Set New Target]
```

---

## **FEATURE ADDITIONS FOR CHRONOS**

### **1. Prose Quality Analyzer**
- Runs automatically on every scene generated
- Flags purple prose, repetition, stasis, filter words
- Suggests specific line-level edits

### **2. Style Comparison Tool**
- User uploads reference text (e.g., chapter from Kubrick, Clarke, Le Guin)
- AI analyzes reference style (sentence length, vocabulary, metaphor density)
- Generates scenes matching that style

### **3. Rewrite Engine with Options**
```
Generate scene with style:

○ Kubrick (sparse, technical, cold)
○ Clarke (clear, scientific, optimistic)
○ Le Guin (philosophical, human, warm)
○ McCarthy (brutal, sparse, visceral)
○ Custom (upload your own reference)

[Generate] [Compare Styles] [Blend Two Styles]
```

### **4. Real-Time Writing Coach**
- As AI generates prose, shows live quality meters:
  - Purple Prose: ████░░░░░░ 40%
  - Forward Momentum: ██░░░░░░░░ 20%
  - Sensory Grounding: ████████░░ 80%
- User can adjust sliders: "More action, less description"

### **5. Scene Structure Enforcer**
```
Before generating prose, AI asks:

What must happen in this scene?
☑ Anselm hears scream (inciting sound)
☑ Anselm investigates source
☑ Anselm discovers release mechanism
☑ Anselm decides to press or not press

Without these beats, scene has no purpose.

[Generate with Structure] [Skip Structure] [Edit Beats]
```

---

## **SUMMARY: WHAT THE APP NEEDS**

### **Detection Systems:**
1. Purple prose detector (metaphor density)
2. Stasis detector (zero-action scenes)
3. Repetition counter (word frequency)
4. Sensory audit (5 senses check)
5. POV drift detector (perspective consistency)
6. Sentence structure analyzer (monotony detection)

### **Suggestion Systems:**
1. Line-level rewrite options
2. Scene structure enforcement
3. Pacing adjustment sliders
4. Style matching to references
5. Automatic trimming ("cut 30% of metaphors")

### **User Controls:**
1. Style preset selection
2. Desired pacing (slow/medium/fast)
3. Prose density (sparse/balanced/rich)
4. Technical detail level (low/medium/high)

**Core principle:** AI should generate prose that serves the story, not prose that admires itself.

Prompt Tachtique:
LLMs process text from left to right — each token can only look back at what came before it, never forward. This means that when you write a long prompt with context at the beginning and a question at the end, the model answers the question having "seen" the context, but the context tokens were generated without any awareness of what question was coming. This asymmetry is a basic structural property of how these models work.

The paper asks what happens if you just send the prompt twice in a row, so that every part of the input gets a second pass where it can attend to every other part. The answer is that accuracy goes up across seven different benchmarks and seven different models (from the Gemini, ChatGPT, Claude, and DeepSeek series of LLMs), with no increase in the length of the model's output and no meaningful increase in response time — because processing the input is done in parallel by the hardware anyway.

There are no new losses to compute, no finetuning, no clever prompt engineering beyond the repetition itself. 

The gap between this technique and doing nothing is sometimes small, sometimes large (one model went from 21% to 97% on a task involving finding a name in a list). If you are thinking about how to get better results from these models without paying for longer outputs or slower responses, that's a fairly concrete and low-effort finding.
