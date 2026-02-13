# **Low-Effort, High-Impact Features for Novel Writing**

Based on Chronos's existing infrastructure, here are features that leverage what's already built:

---

## **1. NARRATIVE SEQUENCE BUILDER**

**What it does:** Auto-generates reading order from relationships

**How it works:**
- Add new relationship type: `happens_before` / `happens_after`
- AI scans all `event` nodes with temporal relationships
- Outputs: "Chapter 1: Event X → Chapter 2: Event Y → Chapter 3: Event Z"
- User can drag-drop to reorder

**Why low-effort:**
- Uses existing relationship system
- Simple sorting algorithm
- No new database tables

**Value:** Instantly converts graph into linear story structure

---

## **2. SCENE CARD GENERATOR**

**What it does:** For each `event` node, AI generates a scene outline

**How it works:**
- User clicks "Generate Scene" on event
- AI prompt: "Based on this event, connected characters, location, and themes, write a 200-word scene outline covering: POV, goal, conflict, resolution"
- Output saved as expandable property on the event node

**Why low-effort:**
- Uses existing AI infrastructure (just a new prompt template)
- Stores in existing `properties` JSON field
- No UI changes needed (shows in context panel)

**Value:** Turns abstract events into writeable scenes

---

## **3. CHARACTER VOICE SAMPLES**

**What it does:** AI writes 3 dialogue lines for each character based on their description

**How it works:**
- User clicks "Generate Voice" on character node
- AI analyzes character description + connected themes/arcs
- Returns 3 sample dialogue lines showing personality
- Saved in character properties

**Why low-effort:**
- Single AI call per character
- Uses existing properties storage
- Temperature 0.9 for creative variety

**Value:** Helps writer "hear" character voices before drafting

---

## **4. CONTINUITY CHECKER (Enhanced)**

**What it does:** Track concrete facts (dates, ages, physical descriptions) across timeline

**How it works:**
- User tags specific facts in entity descriptions with `#fact{date:2157}` or `#fact{age:32}`
- Consistency AI scans for contradictions: "Character A is age 32 in Event 1 (year 2157) but age 28 in Event 2 (year 2160)"
- Flags temporal math errors

**Why low-effort:**
- Extend existing consistency checking
- Parse simple hashtag syntax
- No new tables (facts stored in description text)

**Value:** Catches timeline math errors automatically

---

## **5. CHAPTER ASSEMBLER**

**What it does:** Group events into chapters, estimate word count

**How it works:**
- New entity type: `chapter` (already supported—just a label change)
- Drag events into chapter nodes
- AI estimates: "This chapter has 4 events × ~2000 words each = ~8000 words"
- Shows progress: "Chapter 3: 0/8000 words written"

**Why low-effort:**
- Uses existing entity grouping (parent-child relationships)
- Simple math calculation
- Display as property badge on canvas

**Value:** Gives writer structural roadmap + progress tracking

---

## **6. MISSING SCENE DETECTOR**

**What it does:** AI identifies narrative gaps

**How it works:**
- User clicks "Find Gaps" on timeline
- AI analyzes event sequence: "Event A ends with Character X in Location Y. Event B starts with Character X in Location Z. Missing: transition scene showing travel."
- Suggests missing events as ghost nodes (dotted outline)
- User can click to create or dismiss

**Why low-effort:**
- Runs on existing events + relationships
- Creative AI analysis (uses idea generation engine)
- Ghost nodes = just CSS + temp state (not saved until confirmed)

**Value:** Prevents plot holes before writing

---

## **7. EMOTIONAL BEAT TRACKER**

**What it does:** Track emotional arc across events

**How it works:**
- Add property to events: `emotion_level` (-5 to +5 slider)
- Canvas displays color gradient on event nodes (red = low, green = high)
- Draw line graph below timeline showing emotional peaks/valleys
- AI suggests: "Your act 2 has no emotional low point—consider adding failure/setback"

**Why low-effort:**
- Single number property per event
- Simple SVG line chart (already have canvas rendering)
- AI analysis uses existing consistency check pattern

**Value:** Visualizes pacing at a glance

---

## **8. POV CONSISTENCY VALIDATOR**

**What it does:** Ensures each scene has clear POV character

**How it works:**
- Add dropdown property to events: `pov_character`
- Consistency AI flags: "Event X has no POV character assigned"
- Canvas shows small avatar icon on event cards indicating POV
- AI warns: "Character A's POV appears 14 times, Character B only twice—imbalance?"

**Why low-effort:**
- Dropdown references existing character nodes
- Visual indicator = just a 24px icon
- Validation = simple count check

**Value:** Prevents POV confusion in multi-POV novels

---

## **9. WORLDBUILDING WIKI EXPORT**

**What it does:** Auto-generate reference document from nodes

**How it works:**
- User clicks "Export Wiki"
- System generates markdown file:
  ```
  # Characters
  ## Anselm Kai
  [description]
  Connected to: [linked entities]
  
  # Locations
  ## The Lattice Core
  [description]
  ```
- Downloads as .md or copies to clipboard

**Why low-effort:**
- Template rendering of existing data
- No AI needed
- Uses existing entity/relationship queries

**Value:** Shareable reference doc for beta readers or co-writers

---

## **10. DRAFT INTEGRATION PLACEHOLDER**

**What it does:** Link actual manuscript text to event nodes

**How it works:**
- Add text field to events: `draft_text` (optional)
- User pastes drafted scene into event
- Word count badge updates automatically
- Search finds text across all events

**Why low-effort:**
- Just a textarea in context panel
- Word count = `text.split(' ').length`
- Uses existing search infrastructure

**Value:** Keeps outline and draft in one place

---

## **11. RELATIONSHIP STRENGTH VISUALIZER**

**What it does:** Show relationship importance via line thickness

**How it works:**
- Add optional `strength` property to relationships (1-5)
- Canvas renders thicker/thinner lines based on strength
- AI suggests: "Character A and B have 12 interactions but low strength—develop their bond?"

**Why low-effort:**
- Single number property
- SVG stroke-width adjustment (already rendering curves)
- Simple count + analysis

**Value:** Visualizes which relationships drive the plot

---

## **12. TEMPORAL DISTANCE CALCULATOR**

**What it does:** Show time gaps between events

**How it works:**
- Add optional `timestamp` to events (year/day)
- Draw timeline lane with proportional spacing
- Label gaps: "3 years later" between events
- AI flags: "10-year gap with no explained character aging"

**Why low-effort:**
- Optional timestamp field
- Layout math (already have lane positioning)
- Consistency check extension

**Value:** Makes time jumps visible

---

## **PRIORITY RANKING (Lowest Effort → Highest Value)**

| Feature | Effort | Value | Priority |
|---------|--------|-------|----------|
| **Scene Card Generator** | 1/5 | 5/5 | ⭐⭐⭐⭐⭐ |
| **Narrative Sequence Builder** | 1/5 | 5/5 | ⭐⭐⭐⭐⭐ |
| **Missing Scene Detector** | 2/5 | 5/5 | ⭐⭐⭐⭐⭐ |
| **Character Voice Samples** | 1/5 | 4/5 | ⭐⭐⭐⭐ |
| **Worldbuilding Wiki Export** | 1/5 | 4/5 | ⭐⭐⭐⭐ |
| **Chapter Assembler** | 2/5 | 4/5 | ⭐⭐⭐⭐ |
| **Emotional Beat Tracker** | 2/5 | 4/5 | ⭐⭐⭐⭐ |
| **POV Consistency Validator** | 1/5 | 3/5 | ⭐⭐⭐ |
| **Continuity Checker (Enhanced)** | 2/5 | 3/5 | ⭐⭐⭐ |
| **Draft Integration Placeholder** | 1/5 | 3/5 | ⭐⭐⭐ |
| **Relationship Strength Visualizer** | 1/5 | 2/5 | ⭐⭐ |
| **Temporal Distance Calculator** | 2/5 | 2/5 | ⭐⭐ |

---

## **QUICKEST WIN: Build These 3 First**

1. **Scene Card Generator** — Immediate writing utility
2. **Narrative Sequence Builder** — Turns graph into story spine
3. **Missing Scene Detector** — Prevents plot holes

All three use existing AI infrastructure, require no new tables, and deliver massive writer value.