# SpaceX-Level Dashboard for Multi-Timeline Narrative Control

You're building something unprecedented - a **Mission Control for Relativistic Fiction**. Let's architect this properly.

## The Core Challenge

You have **5 dimensions** to visualize simultaneously:
1. **WHO** - 18+ characters (growing)
2. **WHERE** - 9+ locations (growing)
3. **WHEN** - 14+ timelines (non-linear: forward/backward/sideways)
4. **WHAT** - Events (the story beats)
5. **HOW** - Relationships (causality that might violate temporal order)

Traditional timeline UIs **fundamentally fail** for relativistic time because they assume time flows left→right. You need a **spatial-temporal graph**.

---

## The Solution: Multi-View Mission Control Dashboard

### **LAYOUT: 4-QUADRANT COMMAND CENTER**

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER: Project Name | Timeline Selector | Temporal Mode    │
├──────────────┬──────────────────────────────────────────────┤
│              │                                               │
│   ENTITY     │         MAIN CANVAS                          │
│   NAVIGATOR  │      (Spatial-Temporal Graph)                │
│              │                                               │
│   (Left)     │         (Center - 70% width)                 │
│              │                                               │
├──────────────┼──────────────────────────────────────────────┤
│  TEMPORAL    │        CONTEXT INSPECTOR                     │
│  SEQUENCER   │     (Selected Entity Details)                │
│  (Bottom)    │            (Right)                           │
└──────────────┴──────────────────────────────────────────────┘
```

---

## 1. MAIN CANVAS: Spatial-Temporal Graph (not timeline!)

### **Core Concept Shift**
Replace "swimlanes" with **TEMPORAL ZONES** - spatial regions representing different timeline states.

```
┌─────────────────────────────────────────────────────────────┐
│                    TEMPORAL CANVAS                           │
│                                                              │
│  [Timeline A Zone]     [Timeline B Zone]    [Timeline C]    │
│    ┌─────┐              ┌─────┐              ┌─────┐       │
│    │Event│─────────────>│Event│              │Event│       │
│    │ T+0 │              │ T+5 │<─────────────│ T-2 │       │
│    └─────┘              └─────┘              └─────┘       │
│       ↓                    ↑                    ↑           │
│    ┌─────┐              ┌─────┐              ┌─────┐       │
│    │Event│              │Event│              │Event│       │
│    │ T+3 │─────────────>│ T+7 │              │ T+1 │       │
│    └─────┘              └─────┘              └─────┘       │
│                                                              │
│  [Causality flows can go ANY direction - not just left→right]
└─────────────────────────────────────────────────────────────┘
```

### **Visual System**

#### **A. Timeline Zones = Color-Coded Regions**
```css
Timeline A (Primary): rgba(100, 150, 255, 0.05) /* Blue tint */
Timeline B (Alt): rgba(255, 150, 100, 0.05) /* Orange tint */
Timeline C (Collapsed): rgba(150, 255, 150, 0.05) /* Green tint */
...
```
- Zones have **subtle background color** + **border**
- Zones can **overlap** (showing timeline intersection)
- Overlapping zones = **blended colors** (Timeline A + B = purple tint)

#### **B. Event Nodes = Smart Cards with Metadata Overlay**

```
┌──────────────────────────────────────┐
│ 👁️ POV: Saar    ⚡ T+5y2m   🔗 4     │ ← Header badges
├──────────────────────────────────────┤
│  LATTICE RELEASE                     │ ← Event name
│                                      │
│  📍 Earth-Alpha Station              │ ← Location
│  👤 Saar, Anselm, Ione (+2)         │ ← Characters (show max 3 + count)
├──────────────────────────────────────┤
│  ████████░░ 80% drafted              │ ← Progress bar
└──────────────────────────────────────┘
     │
     │ IMPORTANCE RING (concentric circles)
     └─ Core event = 3 rings, Minor = 1 ring
```

**Node Size = Importance Tiers:**
- **Tier 1 (Core):** 200×140px - thick triple border
- **Tier 2 (Major):** 160×110px - double border
- **Tier 3 (Supporting):** 130×90px - single border
- **Tier 4 (Minor):** 100×70px - thin border

#### **C. Temporal Relationship Lines = Directional Flow with Time Delta**

```
     Event A                Event B
     (T+0)                  (T+5)
        │                      │
        └──────[+5 years]─────>│  ← Standard forward causality
        
        
     Event C                Event D  
     (T+10)                 (T+2)
        │                      │
        └──────[−8 years]─────>│  ← BACKWARD causality (red)
        
        
     Event E                Event F
     (T+5)                  (T+5)
        │                      │
        └──────[⏸ same time]──>│  ← Simultaneous (dotted)
```

**Line Encoding:**
- **Direction arrow** = causality direction
- **Color gradient** = time delta
  - Green→Blue = forward in time (+)
  - Red→Orange = backward in time (−)
  - Yellow = simultaneous (0 delta)
- **Thickness** = relationship strength (1-5)
- **Style** = relationship type (solid/dashed/dotted/zigzag)
- **Floating label** = time delta value

#### **D. Character/Location Presence Indicators**

**Avatars along node border:**
```
┌──────────────────────────────────────┐
│ 👁️ POV: Saar    ⚡ T+5y2m   🔗 4     │
├──────────────────────────────────────┤
│  LATTICE RELEASE                     │
│                                      │
│  📍 Earth-Alpha Station              │
│  👤 Saar, Anselm, Ione (+2)         │
├──────────────────────────────────────┤
│  ████████░░ 80% drafted              │
└──────────────────────────────────────┘
  ● ● ●                               ← Character dots (color-coded)
  └─┴─┴─ Saar (blue), Anselm (green), Ione (purple)
```

**Hover behavior:**
- Hover over character dot → **highlight all events where that character appears**
- Hover over location icon → **highlight all events at that location**

---

## 2. ENTITY NAVIGATOR (Left Sidebar - 20% width)

### **A. Active Filters Panel**
```
┌────────────────────────┐
│ 🎯 ACTIVE FILTERS      │
├────────────────────────┤
│ ☑ Timeline A (Primary) │
│ ☐ Timeline B (Alt-1)   │
│ ☐ Timeline C (Collapsed)│
│ ─────────────────────  │
│ ☑ Saar Messina        │
│ ☑ Anselm Kai          │
│ ☐ Ione's Daughter     │
│ ─────────────────────  │
│ ☑ Earth-Alpha Station │
│ ☐ Black Hole Ergo...  │
└────────────────────────┘
   [Clear All] [Focus Mode]
```

**Behavior:**
- Click timeline checkbox → Show/hide that timeline zone on canvas
- Click character checkbox → **Highlight only events involving that character**
- Click location checkbox → **Highlight only events at that location**
- Multiple selections = AND logic (show events matching ALL filters)

### **B. Entity Directory (Searchable List)**
```
┌────────────────────────┐
│ 🔍 Search entities...  │
├────────────────────────┤
│ 👤 CHARACTERS (18)     │
│  ├─ Saar Messina ●●●  │ ← Importance dots
│  ├─ Anselm Kai ●●●    │
│  ├─ Ione's Daughter ●●│
│  └─ Chen Li ●         │
│                        │
│ 📍 LOCATIONS (9)       │
│  ├─ Earth-Alpha ●●●   │
│  ├─ Beta Station ●●   │
│  └─ Black Hole... ●   │
│                        │
│ ⏱ TIMELINES (14)       │
│  ├─ Primary ━━━━━━    │
│  ├─ Leena's Branch ╌╌ │
│  └─ Echo-9 ┄┄┄┄┄┄    │
└────────────────────────┘
```

**Interactions:**
- **Click entity** → Canvas pans to first occurrence + highlights all occurrences
- **Right-click entity** → Context menu:
  - "Focus on this entity" (dims everything else)
  - "Show temporal path" (highlights all events this entity touches in chronological order)
  - "Analyze consistency" (runs AI check)

### **C. Quick Stats Dashboard**
```
┌────────────────────────┐
│ 📊 PROJECT STATS       │
├────────────────────────┤
│ Events: 23             │
│  ├─ Drafted: 12 (52%) │
│  └─ Needs scenes: 11   │
│                        │
│ Timelines: 14          │
│  ├─ Active: 3          │
│  └─ Archived: 11       │
│                        │
│ Characters: 18         │
│  ├─ Major: 4           │
│  └─ Supporting: 14     │
│                        │
│ ⚠️ Issues: 3           │
│  └─ [View Report]      │
└────────────────────────┘
```

---

## 3. TEMPORAL SEQUENCER (Bottom Panel - 15% height)

This is the **KEY INNOVATION** for non-linear time.

### **Non-Linear Timeline Scrubber**

Instead of a straight timeline, use a **temporal flow visualization**:

```
┌─────────────────────────────────────────────────────────────┐
│              TEMPORAL SEQUENCE VIEW                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  T-10y ←─┐    T-5y      T0 ──→ T+2y ──→ T+5y ──→ T+10y     │
│          │                ↓                ↑                │
│          └───────────── T+3y ─────────────┘                │
│                                                              │
│  ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ● ●        │
│  └─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─┴─        │
│   Events in narrative order (not chronological)             │
│                                                              │
│  Currently showing: Event "Lattice Release" (T+5y)          │
│  ◄ Prev Event    [Jump to Timeline A Start]    Next Event ► │
└─────────────────────────────────────────────────────────────┘
```

**Two Modes:**

#### **Mode 1: Narrative Sequence** (Default)
Shows events in **reading order** (how the story is told), with temporal jumps indicated by arrows.

#### **Mode 2: Chronological Sequence**
Shows events in **in-universe time order** (what actually happened first in the story world).

**Toggle between modes:** Button switches visualization.

### **Temporal Navigator Controls**

```
┌────────────────────────────────────────┐
│ 🕐 TEMPORAL MODE                       │
│ ○ Narrative Order  ● Chronological    │
├────────────────────────────────────────┤
│ 📍 CURRENT FOCUS                       │
│ Event: Lattice Release                 │
│ Timeline: Primary                      │
│ Time: T+5 years, 2 months             │
│                                        │
│ [◄ Prev] [⏸ Pause] [Next ►]          │
│                                        │
│ Show causality flow: ☐ Forward ☐ Back│
└────────────────────────────────────────┘
```

**"Show causality flow" checkboxes:**
- **Forward** = Highlight all events that RESULT from current event (downstream effects)
- **Back** = Highlight all events that CAUSED current event (upstream causes)
- Both checked = Show complete causal chain

---

## 4. CONTEXT INSPECTOR (Right Panel - 25% width)

### **Selected Entity Deep Dive**

When you click an event node:

```
┌─────────────────────────────────────┐
│ ⚡ LATTICE RELEASE                  │
│ Timeline: Primary • T+5y2m          │
├─────────────────────────────────────┤
│ 📝 DESCRIPTION                      │
│ Anselm finally releases the...     │
│                                     │
├─────────────────────────────────────┤
│ 👥 INVOLVED (5)                     │
│  ┌─────────────────────────┐       │
│  │ 👁️ POV: Saar Messina    │       │
│  │ • Anselm Kai (acts)     │       │
│  │ • Ione Daughter (reacts)│       │
│  │ • Chen Li (observes)    │       │
│  │ • Vebt Wife (affected)  │       │
│  └─────────────────────────┘       │
│                                     │
├─────────────────────────────────────┤
│ 📍 LOCATION                         │
│  Earth-Alpha Station                │
│  [View location details →]          │
│                                     │
├─────────────────────────────────────┤
│ 🔗 CAUSAL CONNECTIONS (4)           │
│  ┌─────────────────────────┐       │
│  │ CAUSES ▼                │       │
│  │ • Escape Plan (+3y) →   │       │
│  │ • Betrayal (+2m) →      │       │
│  │                         │       │
│  │ CAUSED BY ▲             │       │
│  │ • Discovery (-2y) ←     │       │
│  │ • Promise (-5y) ←       │       │
│  └─────────────────────────┘       │
│                                     │
├─────────────────────────────────────┤
│ 🎭 TIMELINE VARIANTS (2)            │
│  • Primary (you are here)           │
│  • Leena's Branch (diverged)        │
│  [Compare variants →]               │
│                                     │
├─────────────────────────────────────┤
│ 📊 DRAFT STATUS                     │
│  ████████░░ 2,400 / 3,000 words    │
│  [Open in editor →]                 │
└─────────────────────────────────────┘
```

---

## 5. ADVANCED VISUALIZATION MODES

### **MODE A: Character Pathfinding View**

**Trigger:** Select a character entity → Click "Show Temporal Path"

**Visualization:**
1. Dim all events where character is NOT present to 20% opacity
2. Highlight events where character IS present
3. Draw a **colored thread** connecting their appearances in temporal order
4. Show time gaps on the thread ("2 years passed")

```
     ┌─────┐
     │Event│ Saar appears (T+0)
     └──┬──┘
        │ [+3 years passed]
        ↓
     ┌─────┐
     │Event│ Saar appears (T+3)
     └──┬──┘
        │ [−5 years traveled back]
        ↓
     ┌─────┐
     │Event│ Saar appears (T-2)
     └─────┘
```

**Use case:** Track character's subjective experience of time (their personal timeline).

### **MODE B: Location Timeline View**

**Trigger:** Select a location entity → Click "Show Location History"

**Visualization:**
1. Filter to show ONLY events at this location
2. Arrange them in chronological order (in-universe time)
3. Show which timelines intersect at this location

```
EARTH-ALPHA STATION - Location History

┌──────────────────────────────────────┐
│ Timeline A    Timeline B    Overlap  │
├──────────────────────────────────────┤
│  T-5y: Discovery (A)                 │
│  T+0:  Lattice (A) + Meeting (B)  ← Both timelines! │
│  T+3:  Escape (A)                    │
│  T+7:  Collapse (B)                  │
└──────────────────────────────────────┘
```

**Use case:** Understand the history of a place across multiple timelines.

### **MODE C: Causality Graph View**

**Trigger:** Click "🕸 Causality Mode" in toolbar

**Visualization:**
- Completely removes timeline zones
- Shows ONLY events + causal relationships
- Uses force-directed graph layout (d3-force)
- Events with many causes = pulled to center
- Events with many effects = radiate outward

```
                    ┌─────┐
                    │ Root│
                    │Event│
                    └──┬──┘
               ┌───────┼───────┐
               ↓       ↓       ↓
           ┌─────┐ ┌─────┐ ┌─────┐
           │Event│ │Event│ │Event│
           │  A  │ │  B  │ │  C  │
           └──┬──┘ └──┬──┘ └──┬──┘
              └───────┴───────┘
                      ↓
                  ┌─────┐
                  │Result│
                  └─────┘
```

**Use case:** Identify narrative bottlenecks, plot holes, or circular causality.

---

## 6. TIMELINE CROSSING VISUALIZATION

### **The Big Problem:** How to show 14 timelines intersecting?

**Solution: Dynamic Timeline Boundaries**

#### **When timelines DON'T interact:**
```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ Timeline A  │  │ Timeline B  │  │ Timeline C  │
│   ┌─────┐   │  │   ┌─────┐   │  │   ┌─────┐   │
│   │Event│   │  │   │Event│   │  │   │Event│   │
│   └─────┘   │  │   └─────┘   │  │   └─────┘   │
└─────────────┘  └─────────────┘  └─────────────┘
   (Separate zones, no overlap)
```

#### **When timelines INTERSECT (same location, same time):**
```
┌─────────────────────────────────┐
│  Timeline A + B (overlapping)   │
│                                 │
│  ┌─────────────────────┐        │
│  │ Event "The Meeting" │        │
│  │ 👤 Saar (from A)     │        │
│  │ 👤 Anselm (from B)   │ ← Both characters from different timelines!
│  └─────────────────────┘        │
│                                 │
│  🔀 Timeline Intersection Point │
└─────────────────────────────────┘
```

**Visual indicators:**
- **Blended zone color** (Timeline A blue + Timeline B orange = purple)
- **🔀 Intersection badge** on event node
- **Dual timeline labels** in event header
- **Character source indicators** (Saar^A, Anselm^B)

#### **When timelines DIVERGE:**
```
                ┌─────────────┐
                │   Event     │
                │ (T+0, both) │
                └──────┬──────┘
                       │
            ┌──────────┴──────────┐
            ↓                     ↓
     ┌─────────────┐       ┌─────────────┐
     │ Timeline A  │       │ Timeline B  │
     │ (Saar stays)│       │(Saar leaves)│
     └─────────────┘       └─────────────┘
         🔀 DIVERGENCE POINT
```

**Visual indicators:**
- **Branching arrow** from parent event
- **🔀 Divergence badge**
- **Variant comparison button** ("Compare outcomes →")

---

## 7. INTERACTION PATTERNS (SpaceX-Level UX)

### **Keyboard Shortcuts (Mission Control Speed)**
```
NAVIGATION:
  Space         = Pan mode (click + drag canvas)
  Cmd/Ctrl+F    = Focus search
  Cmd/Ctrl+K    = Command palette
  
TEMPORAL:
  ← →          = Previous/Next event in sequence
  Shift+← →    = Jump to timeline start/end
  Alt+← →      = Navigate backward/forward causality
  
SELECTION:
  Click         = Select entity
  Shift+Click   = Multi-select
  Cmd+Click     = Select entire causal chain
  
VIEWS:
  1-4           = Switch between quadrant focus
  V             = Toggle timeline variant view
  C             = Toggle causality graph mode
  T             = Toggle temporal sequencer
  
AI:
  Cmd+I         = Generate ideas for selected
  Cmd+Shift+C   = Check consistency
  Cmd+R         = Ripple effect analysis
```

### **Hover States (Information Density)**

**Hover over event node:**
```
┌───────────────────────────────────────┐
│ LATTICE RELEASE                       │
│ Timeline: Primary • T+5y2m            │
│                                       │
│ Appears in:                           │
│  • 3 causal chains                    │
│  • 2 timeline variants                │
│  • Chapter 7 draft                    │
│                                       │
│ [Click for details] [Cmd+Click chain] │
└───────────────────────────────────────┘
```

**Hover over relationship line:**
```
    Event A ━━━[+5 years]━━━> Event B
                  ↑
            ┌─────┴─────┐
            │ "causes"  │
            │ Strength:4│
            │ [Edit]    │
            └───────────┘
```

**Hover over character avatar in event:**
```
    ● Saar Messina
      │
      ├─ Appears in 12 events
      ├─ POV character in 5
      ├─ Last seen: T+7y (Event "Escape")
      └─ [Track temporal path]
```

### **Right-Click Context Menus**

**On event node:**
```
┌────────────────────────────┐
│ ⚡ Quick Actions            │
├────────────────────────────┤
│ Generate Scene Card        │
│ Add to Chapter...          │
│ Duplicate to Timeline...   │
│ ─────────────────────────  │
│ Show Causal Chain          │
│ Find Missing Scenes        │
│ ─────────────────────────  │
│ Mark as Core Event         │
│ Set Importance...          │
│ ─────────────────────────  │
│ Delete                     │
└────────────────────────────┘
```

---

## 8. REAL-TIME COLLABORATION INDICATORS (SpaceX Style)

```
┌─────────────────────────────────────────────────────────────┐
│ THE UNBOUND • Timeline: Primary                             │
│                                                              │
│ 🟢 You    🔵 Sarah (editing "Escape Plan")    🟡 Mike (idle)│
└─────────────────────────────────────────────────────────────┘
```

**On canvas:**
- Other users' cursor positions shown as colored dots
- Events being edited = subtle glow in editor's color
- Real-time entity updates animate in

---

## 9. ALERT & NOTIFICATION SYSTEM

### **Consistency Alert Toast**
```
┌─────────────────────────────────────┐
│ ⚠️ Consistency Issue Detected       │
├─────────────────────────────────────┤
│ Event "Lattice Release" (T+5y)     │
│ contradicts "Discovery" (T+7y)      │
│                                     │
│ [Review Issue] [Dismiss]           │
└─────────────────────────────────────┘
```

### **Timeline Health Status**
```
Header indicator:
  🟢 All timelines consistent
  🟡 3 warnings detected
  🔴 2 critical issues
```

---

## 10. EXPORT & PRESENTATION MODE

### **"Present Timeline" Mode**
**Trigger:** Click "📽 Present" button

**Changes:**
1. Hide all UI panels (fullscreen canvas)
2. Auto-layout events in narrative sequence
3. Fade in events one by one with animations
4. Show temporal transitions with smooth paths
5. Keyboard navigation (→ = next beat)

**Use case:** Pitch your story to collaborators, show the temporal structure visually.

---

## IMPLEMENTATION ROADMAP

### **Phase 1: Foundation (2-3 weeks)**
1. ✅ Refactor canvas to use timeline zones instead of swimlanes
2. ✅ Implement node size tiering system
3. ✅ Add temporal delta labels on relationships
4. ✅ Build entity navigator with filters

### **Phase 2: Temporal Intelligence (3-4 weeks)**
5. ✅ Non-linear temporal sequencer
6. ✅ Character pathfinding view
7. ✅ Timeline intersection visualization
8. ✅ Causality graph mode

### **Phase 3: Advanced Interactions (2-3 weeks)**
9. ✅ Keyboard shortcut system
10. ✅ Context inspector panel
11. ✅ Hover state system
12. ✅ Quick stats dashboard

### **Phase 4: Collaboration & Polish (2 weeks)**
13. ✅ Real-time presence indicators
14. ✅ Alert system
15. ✅ Presentation mode
16. ✅ Performance optimization (virtualization for 100+ events)

---

## TECHNICAL ARCHITECTURE NOTES

### **Performance at Scale**
With 14 timelines × 18 characters × 9 locations = potentially 1000+ events:

1. **Canvas Virtualization**
   - Only render visible nodes (viewport culling)
   - Use `IntersectionObserver` for dynamic loading

2. **Relationship Optimization**
   - Quadtree spatial indexing for hit detection
   - Batch relationship line rendering

3. **State Management**
   - Use Zustand with selector optimization
   - Memoize expensive calculations (temporal sorting, causality chains)

4. **Database Queries**
   - Add composite indexes: `(project_id, timeline_id, timestamp)`
   - Paginate entity loading (load 50 at a time)

---

## VISUAL DESIGN TOKENS

```typescript
// chronos-spacex-theme.ts

export const TimelineColors = {
  TIMELINE_A: 'rgba(59, 130, 246, 0.08)', // Blue
  TIMELINE_B: 'rgba(249, 115, 22, 0.08)', // Orange
  TIMELINE_C: 'rgba(34, 197, 94, 0.08)',  // Green
  // ... generate 14 distinct colors
  INTERSECTION: 'rgba(168, 85, 247, 0.12)' // Purple blend
}

export const CausalityLineStyles = {
  FORWARD_TIME: {
    stroke: 'url(#gradient-green-blue)',
    strokeWidth: 2,
    markerEnd: 'url(#arrowForward)'
  },
  BACKWARD_TIME: {
    stroke: 'url(#gradient-red-orange)',
    strokeWidth: 2.5,
    markerEnd: 'url(#arrowBack)',
    strokeDasharray: '5,3' // Indicate time paradox
  },
  SIMULTANEOUS: {
    stroke: '#fbbf24',
    strokeWidth: 1.5,
    strokeDasharray: '2,2'
  }
}

export const NodeSizes = {
  TIER_1_CORE: { width: 200, height: 140 },
  TIER_2_MAJOR: { width: 160, height: 110 },
  TIER_3_SUPPORTING: { width: 130, height: 90 },
  TIER_4_MINOR: { width: 100, height: 70 }
}
```

---

## CONCLUSION

You're building a **temporal graph database visualizer** disguised as a writing tool. The key insight: **abandon linear timeline thinking entirely**.

**Critical Success Factors:**
1. ✅ **Spatial organization** (zones, not lanes)
2. ✅ **Temporal metadata everywhere** (time deltas on every connection)
3. ✅ **Multiple coordinated views** (canvas + sequencer + inspector)
4. ✅ **Entity-centric filtering** (who/where/when as first-class filters)
5. ✅ **Causality-first relationships** (show cause/effect regardless of time direction)

This is **Obsidian meets Figma meets Mission Control** for fiction writers working with relativistic time.