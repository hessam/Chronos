# Chronos: UI/UX Design Guide
**Narrative Command Center**

**Version:** 1.0 (Codename: Chronos UI v1.0)  
**Date:** February 10, 2026  
**Design Lead:** UI/UX Team  
**Status:** Design Standard

---

## Design Philosophy

> **The UI is a precision instrument, not a digital clutter factory.**

Chronos is not a crayon box—it's a **narrative command center**. The interface must be a transparent layer that allows absolute focus on story data. Every pixel earns its keep. No visual noise. Zero exceptions.

### Core Principles

1. **Content-First**: The UI is a lens, not a filter. It exists to reveal and manipulate complex data with minimal cognitive load.
2. **Direct Manipulation**: Click, drag, drop. Eliminate all intermediary steps. No unnecessary modals or menus.
3. **Contextual Intelligence**: AI appears precisely when and where it's contextually relevant, not as a separate, clunky module.

Apple's grid system and minimalism are not aesthetic choices—they are **engineering principles** for consistency, clarity, and speed.

---

## 1. Grid System & Spacing (First Principles)

### 8pt Grid Adherence (Non-Negotiable)

**Requirement:** All vertical and horizontal spacing, element sizing, margins, and padding **must** be multiples of 8 points.

**Permitted Values:**
```
8pt, 16pt, 24pt, 32pt, 40pt, 48pt, 56pt, 64pt, 72pt, 80pt, etc.
```

**Rationale:** Enforces absolute visual consistency and predictability. Reduces decision fatigue for designers. Enables pixel-perfect alignment across all screen densities.

### Spacing Standards

| Element | Spacing | Use Case |
|---------|---------|----------|
| **Default Margin** | 24pt (3 units) | Content margins within panels, around main canvas |
| **Gutter** | 16pt (2 units) | Space between major UI blocks (sidebar ↔ main ↔ panel) |
| **Component Padding** | 16pt | Internal padding for cards, buttons, input fields |
| **Tight Spacing** | 8pt | Between related elements (label + value, icon + text) |
| **Section Spacing** | 32pt | Between distinct UI sections within a panel |
| **Large Spacing** | 48pt | Between major content blocks |

### Visual Example

```
┌─────────────────────────────────────────────────────────────┐
│ [24pt margin]                                               │
│     ┌─────────────────────────────────────────────┐         │
│     │ Component (padding: 16pt)                   │         │
│     │   [8pt] Icon  Label                         │         │
│     │   [8pt] Icon  Label                         │         │
│     └─────────────────────────────────────────────┘         │
│ [32pt section break]                                        │
│     ┌─────────────────────────────────────────────┐         │
│     │ Next Component                              │         │
│     └─────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

**Metric:** All UI elements align to an 8pt grid overlay with **100% accuracy**.  
**Tool:** Figma grid overlay set to 8pt base grid.  
**Owner:** UI/UX Lead

---

## 2. Typography (Ruthless Precision)

### Font Family: SF Pro

**Display (Headlines, Titles):**
- Font: SF Pro Display
- Weights: Medium (500), Semibold (600)
- Use for: Entity names, timeline titles, section headers

**Text (Body, Labels):**
- Font: SF Pro Text
- Weights: Regular (400), Medium (500)
- Use for: Descriptions, notes, labels, UI text

### Type Scale

Strict adherence to predefined sizes with calculated line heights for readability:

| Size | Line Height | Weight | Use Case |
|------|-------------|--------|----------|
| **32pt** | 40pt | Semibold | Page titles, main entity names |
| **24pt** | 32pt | Semibold | Section headers, timeline titles |
| **20pt** | 28pt | Medium | Subsection headers |
| **16pt** | 24pt | Medium | Primary body text, entity descriptions |
| **14pt** | 20pt | Regular | Secondary text, labels |
| **12pt** | 16pt | Regular | Tertiary text, metadata, timestamps |
| **10pt** | 14pt | Regular | Fine print, helper text |

### Text Hierarchy Example

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Alice                                    [32pt Semibold]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Biography                                [20pt Medium]
Born in Neo-Tokyo, 2157. Former pilot   [16pt Regular]
turned resistance leader.

Motivations                              [20pt Medium]
• Revenge for her mentor's death        [14pt Regular]
• Redemption for past betrayals

Last modified: 2026-02-10 14:32         [12pt Regular]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Metric:** Readability score (Flesch-Kincaid) for body text >70.  
**Owner:** UI/UX Lead

---

## 3. Color Palette (Monochromatic Control)

### Default: Dark Mode

Dark mode is the **primary and default** interface mode. Light mode is optional post-MVP.

### Color System

#### Background Colors
```
Primary Background:   #121212  (Near-black)
Secondary Background: #1E1E1E  (Cards, containers)
Tertiary Background:  #2A2A2A  (Raised elements, hover states)
Border/Divider:       #3A3A3A  (Subtle separators)
```

#### Text Colors
```
Primary Text:    #E0E0E0  (High contrast, main content)
Secondary Text:  #A0A0A0  (Labels, metadata)
Tertiary Text:   #606060  (Disabled states, placeholders)
```

#### Accent Color (Single, High-Contrast)

**Primary Accent:**
```
Electric Blue:   #3366FF
```

**Use for:**
- Interactive elements (buttons, links)
- Selected states
- AI suggestions
- Focus indicators
- Progress indicators

**Alternative Accent (if blue conflicts with content):**
```
Electric Green:  #00FF99
```

#### Semantic Colors (Minimal Use)

```
Error/Conflict:  #FF4444  (Red)
Success:         #00CC66  (Green)
Warning:         #FFB800  (Amber)
Info:            #3366FF  (Blue - same as accent)
```

**Usage Rule:** Semantic colors are used **sparingly** and only for high-impact feedback (conflict flags, success confirmations, critical warnings).

### Color Application

```
┌────────────────────────────────────────┐
│ #1E1E1E (Card Background)              │
│                                        │
│  Character Name (#E0E0E0)              │
│  Last edited 2h ago (#A0A0A0)          │
│                                        │
│  [#3366FF AI Suggest] [#3A3A3A Edit]   │
│                                        │
└────────────────────────────────────────┘
```

**Metric:** All color contrasts meet **WCAG AA standards** (minimum 4.5:1 for text, 3:1 for UI components).  
**Tool:** Contrast checker plugin in Figma.  
**Owner:** UI/UX Lead

---

## 4. Core Layout: Tripartite Command Structure

The application uses a **consistent three-pane layout** designed for maximum information density and contextual awareness.

```
┌──────────────┬───────────────────────────────────┬──────────────┐
│              │                                   │              │
│   LEFT       │        MAIN CONTENT AREA          │    RIGHT     │
│   SIDEBAR    │                                   │  CONTEXTUAL  │
│              │         (Dynamic Canvas)          │    PANEL     │
│   280pt      │                                   │    320pt     │
│ (collapsible)│                                   │ (on-demand)  │
│              │                                   │              │
└──────────────┴───────────────────────────────────┴──────────────┘
```

### Left Sidebar: Navigation & Entity List

**Width:** Fixed **280pt** (collapsible to 64pt icon-only mode)

**Components (Top to Bottom):**

1. **Global Search Bar** (Persistent)
   - Height: 40pt
   - Position: Top of sidebar (24pt margin)
   - Functionality: Instant, fuzzy search across **all** entities and notes
   - Placeholder: "Search everything..."
   - Shortcut: `Cmd/Ctrl + K`

2. **Primary Entity Filters**
   - Height: 48pt per button
   - Icons + Labels (collapsible to icons only)
   - Options: Characters, Timelines, Events, Arcs, Themes, Locations, Notes
   - Active state: Accent color (#3366FF) background

3. **Entity List (Filtered)**
   - Scrollable list showing entities matching selected filter
   - Item height: 56pt
   - Format: Icon + Name + Metadata (e.g., "3 events")
   - Interaction: Click to open in main area, drag to link/place

**Interaction:**
- **Drag-and-drop:** Drag entities from list onto main canvas or other entities
- **Collapse:** Click icon button to collapse to 64pt icon-only mode
- **Context menu:** Right-click entity for quick actions (edit, delete, duplicate)

---

### Main Content Area: Dynamic Canvas

**Width:** Flexible (fills space between sidebars)

**Views (Context-Dependent):**

#### 1. Timeline Canvas (Primary View)

**When:** User selects "Timelines" filter or clicks a timeline

**Features:**
- **Infinite canvas:** Pan (drag) and zoom (mouse wheel/pinch)
- **Multiple timelines:** Stacked horizontally, labeled on left
- **Event nodes:** Positioned chronologically on timelines
- **Cross-timeline connections:** Dashed lines for events spanning timelines
- **Time axis:** Bottom ruler showing dates/labels

**Visual Example:**
```
Timeline A ────○────────○───────○──────────────○────>
                │         ╲     ╱
Timeline B ─────○──────────○───○──────○───────────────>
                │
Timeline C ─────○──────────────────────○──────────────>
               
              [Year 2157]        [2158]        [2159]
```

**Controls (Overlay, Bottom Right):**
- Zoom: +/- buttons
- Fit to view button
- Toggle timeline visibility
- Filter events by character/theme

---

#### 2. Entity Detail View

**When:** User clicks individual entity (character, event, etc.)

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│ [Icon] Alice                             [Edit] [×] │ ← 32pt title
├─────────────────────────────────────────────────────┤
│                                                     │
│ Biography                       [AI Generate Ideas] │
│ Born in Neo-Tokyo, 2157...                          │
│ [Editable text area]                                │
│                                                     │
│ ──────────────────────────────────                  │
│                                                     │
│ Motivations                                         │
│ • Revenge                                           │
│ • Redemption                                        │
│                                                     │
│ ──────────────────────────────────                  │
│                                                     │
│ Related Entities                                    │
│ ○ Event: "Battle of Station X"  → View             │
│ ○ Timeline: "Primary Reality"    → View             │
│ ○ Character: "Bob" (Mentor)      → View             │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

#### 3. Relationship Graph View

**When:** User clicks "Explore Connections" on entity

**Features:**
- Force-directed graph layout
- Node size reflects connection count
- Edge labels show relationship type
- Filter by depth (1-3 hops)
- Click node to focus, dim others

**Visual Example:**
```
         Theme: Betrayal
              ↑
              │
    Alice ────┼──── Bob
      ↓       │       ↑
   Event:     │     Event:
   "Meets"    │     "Revenge"
              ↓
          Timeline A
```

**Metric:** Main content area redraws/updates **<50ms** for typical operations.  
**Owner:** Frontend Lead

---

### Right Contextual Panel: AI & Properties Inspector

**Width:** Fixed **320pt** (appears/disappears on demand)

**Visibility:**
- **Shown when:** Entity is selected, AI is invoked, or user pins panel open
- **Hidden when:** Nothing selected and user hasn't pinned it
- **Animation:** Slide in/out (200ms ease-out)

**Components (Top to Bottom):**

#### 1. Properties Inspector

**Editable Fields for Selected Entity:**
```
┌────────────────────────────┐
│ Properties                 │
├────────────────────────────┤
│ Name                       │
│ [Alice________________]    │
│                            │
│ Type                       │
│ [Character ▾]              │
│                            │
│ Timeline Presence          │
│ ☑ Primary Reality          │
│ ☐ Alternate Future         │
│                            │
│ Internal Conflicts         │
│ + Add conflict             │
│ • Loyalty vs. Duty  [×]    │
└────────────────────────────┘
```

---

#### 2. Linked Entities Display (Zero-Click Navigation)

**List of Directly Connected Entities:**
```
┌────────────────────────────┐
│ Linked Entities (5)        │
├────────────────────────────┤
│ Events (3)                 │
│ → Battle of Station X      │
│ → Alice meets Bob          │
│ → Betrayal                 │
│                            │
│ Characters (1)             │
│ → Bob (Mentor)             │
│                            │
│ Timelines (1)              │
│ → Primary Reality          │
└────────────────────────────┘
```

**Interaction:** Click any item to navigate to it (loads in main area)

---

#### 3. AI Suggestion Block (Contextual Intelligence)

**Dynamically Populated Based on Selected Entity:**

```
┌────────────────────────────┐
│ 🧠 AI Suggestions          │
├────────────────────────────┤
│ [#3366FF Accent Color]     │
│                            │
│ Plot Ideas (3)             │
│ ─────────────────          │
│ • What if Alice's          │
│   betrayal was staged by   │
│   her future self?         │
│   [✓ Accept] [× Dismiss]   │
│                            │
│ • Alice could discover a   │
│   hidden agenda...         │
│   [✓ Accept] [× Dismiss]   │
│                            │
│ ──────────────────         │
│                            │
│ Conflicts Detected (1)     │
│ ⚠ Alice is present at two  │
│   locations simultaneously │
│   on Timeline A            │
│   [View Details]           │
└────────────────────────────┘
```

**Styling:**
- Background: Slightly lighter than panel (#2A2A2A)
- Border-left: 4pt solid #3366FF (accent)
- Icon: Neural network symbol in accent color

**Interaction:**
- **Accept:** Applies suggestion (e.g., creates note, modifies entity)
- **Dismiss:** Removes suggestion
- **View Details:** Expands conflict explanation

**Owner:** AI/ML Lead + UI/UX Lead

---

## 5. Interaction Patterns (Direct Manipulation)

### Pattern 1: Drag-and-Drop Entity Linking

**Requirement:** Core graph manipulation mechanic.

**Flow:**
1. User drags entity from sidebar or main canvas
2. Hovers over target entity (target highlights with accent color)
3. Drops entity on target
4. **Contextual pop-up appears immediately:**

```
┌───────────────────────────────┐
│ Create Relationship           │
├───────────────────────────────┤
│ Alice → Event: "Battle"       │
│                               │
│ Relationship Type:            │
│ [Participates in_______ ▾]    │
│                               │
│ or enter custom:              │
│ [___________________]         │
│                               │
│     [Cancel]  [Create]        │
└───────────────────────────────┘
```

**Metric:** Average relationship creation time **<3 seconds**.  
**Owner:** UI/UX Lead

---

### Pattern 2: In-Context Editing

**Requirement:** No modals for minor edits.

**Flow:**
1. User **double-clicks** any text field (name, description, note)
2. Field becomes editable immediately (border color changes to accent)
3. User types, presses Enter to save or Esc to cancel
4. Auto-save after 2 seconds of inactivity

**Visual States:**
```
View Mode:   Alice               (no border)
Edit Mode:   [Alice_______]      (#3366FF border, 2pt)
Saving...    [Alice_______] ⟳    (spinner icon)
```

**Owner:** UI/UX Lead

---

### Pattern 3: AI Invocation (Contextual Intelligence)

**Requirement:** AI appears when relevant, not as separate module.

**Trigger:**
- Subtle AI icon (⚡ or 🧠) appears near editable fields
- Hover state: Icon brightens (accent color)
- Click: Opens AI context menu

**Context Menu:**
```
┌─────────────────────────┐
│ Generate Ideas          │
│ Check Consistency       │
│ Suggest Relationships   │
│ Expand Description      │
└─────────────────────────┘
```

**Result:** AI output appears in Right Contextual Panel

**Metric:** AI invocation to suggestion display **<5 seconds**.  
**Owner:** AI/ML Lead

---

### Pattern 4: Visual Conflict Flagging

**Requirement:** Real-time consistency warnings.

**Implementation:**
- AI detects conflict (e.g., character in two places, plot paradox)
- Affected entities get **red outline** (2pt, #FF4444)
- Small warning icon (⚠) badge on entity card
- Clicking icon or entity shows conflict details in Right Panel

**Visual Example:**
```
┌────────────────────────────┐ ← Red border
│ Event: "Alice at Station X"│
│ Timeline A, 2157-03-15     │ [⚠]
└────────────────────────────┘

Right Panel:
⚠ Conflict Detected
Alice is also present at "Event Y" 
at the same time on Timeline A.

Suggested fix:
• Change date of this event
• Remove Alice from Event Y
[Apply] [Dismiss]
```

**Metric:** Conflicts visible **immediately** upon detection (<1s).  
**Owner:** AI/ML Lead + UI/UX Lead

---

## 6. Modal Dialogs & Notifications (Occam's Razor)

### Minimalist Modals

**Use ONLY for:**
1. **Destructive actions** (e.g., "Delete entity? Irreversible.")
2. **Complex data entry** (e.g., defining custom relationship with multiple parameters)

**Design:**
- Centered on screen
- Translucent overlay background (#000000 at 60% opacity)
- Modal: #1E1E1E background, 8pt rounded corners
- Max width: 480pt
- Padding: 32pt
- Buttons: Right-aligned, 8pt spacing

**Example (Delete Confirmation):**
```
        ┌────────────────────────────────┐
        │ Delete Character?              │
        │                                │
        │ This will permanently delete   │
        │ "Alice" and all associated     │
        │ relationships. This cannot be  │
        │ undone.                        │
        │                                │
        │        [Cancel]  [Delete]      │
        └────────────────────────────────┘
                    ↑           ↑
                 Default    Destructive
                          (Red #FF4444)
```

---

### Non-Intrusive Notifications (Toast)

**Use for:**
- Success messages ("Character saved")
- Error messages ("Failed to save")
- Info messages ("Sync complete")

**Design:**
- Position: Bottom center of screen
- Background: #2A2A2A with subtle shadow
- Height: 48pt
- Padding: 16pt
- Fade in (200ms), persist 3s, fade out (200ms)
- Multiple toasts stack vertically (8pt spacing)

**Visual Example:**
```
                ┌────────────────────────┐
                │ ✓ Character saved      │
                └────────────────────────┘
```

**Persistent Notifications:**
- For critical errors requiring user action
- Shown in top-right corner
- Dismissible with [×] button
- Max 3 simultaneous notifications

**Owner:** UI/UX Lead

---

## 7. Component Library (Reusable Elements)

### Buttons

**Sizes:**
- Small: 32pt height
- Medium: 40pt height (default)
- Large: 48pt height

**Variants:**

| Variant | Background | Text | Use |
|---------|-----------|------|-----|
| **Primary** | #3366FF | #FFFFFF | Main actions (Save, Create) |
| **Secondary** | Transparent | #E0E0E0 | Secondary actions (Cancel) |
| **Destructive** | #FF4444 | #FFFFFF | Delete, Remove |
| **Ghost** | Transparent (hover: #2A2A2A) | #A0A0A0 | Tertiary actions |

**Example:**
```
[  Save  ]     [ Cancel ]     [ Delete ]
  Primary       Secondary     Destructive
```

---

### Input Fields

**Height:** 40pt  
**Padding:** 12pt horizontal, 10pt vertical  
**Border:** 1pt solid #3A3A3A (default), #3366FF (focus)  
**Border-radius:** 4pt

**States:**
```
Default:  [________________]    #3A3A3A border
Focus:    [________________]    #3366FF border
Error:    [________________]    #FF4444 border
Disabled: [________________]    #606060 text, #2A2A2A bg
```

---

### Cards (Entity Cards)

**Purpose:** Display entity summaries in lists

**Size:** Flexible width, 72pt height (compact) or 120pt (expanded)  
**Padding:** 16pt  
**Background:** #1E1E1E  
**Border:** 1pt solid #3A3A3A  
**Border-radius:** 8pt

**Layout:**
```
┌────────────────────────────────────────┐
│ [Icon]  Alice                   [...]  │ ← Name (16pt)
│         Last edited 2h ago             │ ← Meta (12pt)
│         3 events, 2 relationships      │
└────────────────────────────────────────┘
```

**Hover State:** Border becomes #3366FF, background lightens to #2A2A2A

---

### Icons

**Size:** 16pt, 20pt, 24pt (multiples of 4pt)  
**Style:** Line icons, 2pt stroke  
**Color:** Inherits from parent (usually #A0A0A0, accent on hover)

**Key Icons:**
- Characters: 👤
- Timelines: ⏱
- Events: ⚡
- Themes: 💡
- Locations: 📍
- Relationships: 🔗
- AI: 🧠 or ⚡
- Search: 🔍
- Edit: ✏️
- Delete: 🗑
- Add: +
- Warning: ⚠

---

## 8. Responsive Behavior

### Minimum Screen Size

**Requirement:** Design for **1440×900** minimum (standard laptop)

### Breakpoints

| Breakpoint | Width | Layout Changes |
|-----------|-------|----------------|
| **Desktop** | >1440pt | Full three-pane layout |
| **Small Desktop** | 1024-1440pt | Right panel auto-hides unless pinned |
| **Tablet** | 768-1024pt | Left sidebar collapses to icon-only, right panel overlay |

**Mobile:** Out of scope for MVP (desktop-first)

---

## 9. Accessibility (WCAG AA Compliance)

### Color Contrast

**Minimum Ratios:**
- Text: 4.5:1 (WCAG AA)
- Large text (20pt+): 3:1
- UI components: 3:1

### Keyboard Navigation

**Requirements:**
- All interactive elements must be keyboard-accessible
- Tab order follows visual hierarchy (left → center → right)
- Focus indicators: 2pt #3366FF outline
- Shortcuts:
  - `Cmd/Ctrl + K`: Global search
  - `Cmd/Ctrl + N`: New entity
  - `Cmd/Ctrl + S`: Save
  - `Esc`: Close modal/panel
  - `Space`: Select/activate
  - Arrow keys: Navigate lists

### Screen Reader Support

- All icons have aria-labels
- Semantic HTML (proper heading hierarchy)
- Live regions for dynamic content updates

---

## 10. Animation & Motion

### Principle: Functional, Not Decorative

**Duration Standards:**
- Micro-interactions: **100-200ms** (button hover, focus)
- Panel transitions: **200-300ms** (sidebar expand, right panel slide)
- Page transitions: **300-400ms** (view switching)

**Easing:** `ease-out` for entrances, `ease-in` for exits, `ease-in-out` for movement

**Examples:**

| Interaction | Animation | Duration |
|------------|-----------|----------|
| Button hover | Background color | 100ms |
| Panel open | Slide in from right | 200ms |
| Modal open | Fade in + scale (0.95→1) | 200ms |
| Toast appear | Slide up + fade in | 200ms |
| Loading spinner | Rotate (continuous) | 1000ms loop |

**Rule:** No animation should delay user action. Transitions happen **during** user interaction, not after.

---

## 11. Performance Standards

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Initial Load** | <2s | Full app ready (Lighthouse) |
| **Main Canvas Render** | <2s | 500 events on timeline |
| **UI Update (CRUD)** | <50ms | Entity create/update/delete |
| **Search Results** | <100ms | Global search response |
| **AI Indicator Latency** | <5s | From click to suggestion display |
| **Drag-and-Drop Latency** | <16ms | 60fps (no jank) |

**Tools:**
- Chrome DevTools Performance tab
- Lighthouse CI
- React Profiler

**Owner:** Frontend Lead + UI/UX Lead

---

## 12. Design System Deliverables

### For Development Team

1. **Figma Design Library**
   - All components with variants
   - 8pt grid overlay
   - Typography styles
   - Color tokens
   - Icon library

2. **CSS Variables / Design Tokens**
```css
:root {
  /* Spacing */
  --space-1: 8px;
  --space-2: 16px;
  --space-3: 24px;
  --space-4: 32px;
  
  /* Colors */
  --bg-primary: #121212;
  --bg-secondary: #1E1E1E;
  --text-primary: #E0E0E0;
  --accent: #3366FF;
  --error: #FF4444;
  
  /* Typography */
  --font-display: 'SF Pro Display', -apple-system, sans-serif;
  --font-text: 'SF Pro Text', -apple-system, sans-serif;
  --font-size-xl: 32px;
  --font-size-lg: 24px;
  --font-size-md: 16px;
  --font-size-sm: 14px;
  
  /* Transitions */
  --transition-fast: 100ms ease-out;
  --transition-medium: 200ms ease-out;
}
```

3. **Component Code (React + TypeScript)**
   - Storybook with all component variants
   - Unit tests for interactive components
   - Accessibility tests

---

## 13. Implementation Checklist

### Sprint 1 (Foundation)
- [ ] Set up 8pt grid system in Figma
- [ ] Define color tokens and typography scale
- [ ] Create base components (Button, Input, Card)
- [ ] Implement left sidebar with search
- [ ] Build basic main canvas area
- [ ] Dark mode only

### Sprint 2 (Core Layout)
- [ ] Complete three-pane layout
- [ ] Right contextual panel (show/hide)
- [ ] Drag-and-drop foundation
- [ ] Entity cards with states
- [ ] Timeline canvas (basic rendering)

### Sprint 3 (AI Integration)
- [ ] AI suggestion block component
- [ ] Conflict flagging UI
- [ ] Toast notification system
- [ ] Modal dialogs (delete confirmation)

### Sprint 4-6 (Polish)
- [ ] Animations and transitions
- [ ] Keyboard shortcuts
- [ ] Accessibility audit (WCAG AA)
- [ ] Performance optimization
- [ ] Responsive behavior (tablet)

---

## 14. Quality Gates (Non-Negotiable)

Before any UI ships to production:

1. **8pt Grid Compliance:** 100% of elements aligned
2. **Color Contrast:** WCAG AA verified via automated tools
3. **Performance:** All metrics met (see Section 11)
4. **Keyboard Navigation:** All features accessible via keyboard
5. **Design System Usage:** No ad-hoc styles, all components from library

**Review Process:** UI/UX Lead must approve all designs before development.

---

## Appendix A: Visual Reference

### Full Application Layout (Desktop, 1440pt width)

```
┌──────────────┬─────────────────────────────────────────┬──────────────┐
│   SIDEBAR    │         MAIN CONTENT AREA               │   CONTEXT    │
│   280pt      │                                         │   320pt      │
├──────────────┤                                         ├──────────────┤
│ [Search]     │  ┌─ Timeline A ─────○────────○─────>    │ Properties   │
│              │  │                   │         ╲        │ ────────────  │
│ ☑ Characters │  ├─ Timeline B ──────○──────────○──>    │ Name:        │
│ ☐ Timelines  │  │                                      │ [Alice___]   │
│ ☐ Events     │  └─ Timeline C ───────○─────────────>   │              │
│ ☐ Arcs       │                                         │ Type:        │
│              │     [2157]      [2158]      [2159]      │ [Character▾] │
│ ──────────── │                                         │              │
│              │  Zoom: [─][+]   [Fit View]  [Settings] │ ──────────── │
│ Alice        │                                         │              │
│ Bob          │                                         │ 🧠 AI Ideas  │
│ Eve          │                                         │ ────────────  │
│ Commander Y  │                                         │ • What if... │
│              │                                         │   [✓] [×]    │
└──────────────┴─────────────────────────────────────────┴──────────────┘
```

---

## Appendix B: Design Rationale

### Why 8pt Grid?
- **Consistency:** Eliminates arbitrary spacing decisions
- **Scalability:** Works across all screen densities (1x, 1.5x, 2x, 3x)
- **Speed:** Designers and developers align faster

### Why Dark Mode Default?
- **Focus:** Reduces visual fatigue during long writing sessions
- **Contrast:** Makes accent colors and data visualizations pop
- **Industry Standard:** Common in professional creative tools (Figma, VS Code, Premiere Pro)

### Why Single Accent Color?
- **Clarity:** Reduces cognitive load (one color = interactive/important)
- **Consistency:** Easier to maintain brand identity
- **Accessibility:** High contrast ensures visibility

### Why Three-Pane Layout?
- **Context:** Left shows what's available, center shows work area, right shows details
- **Efficiency:** Everything within two clicks
- **Familiarity:** Similar to email clients, IDEs, file browsers (learned behavior)

---

**End of UI Guide**

*This is not about making it "pretty." This is about making it **unfailingly efficient** and **intuitively powerful**. The UI is the direct interface to Chronos's brain. If the UI is clunky, the brain is useless. Deliver this with precision.*
