# Sprint 4 — Deepen AI + Polish

**Duration:** 2 weeks · **Goal:** Chronos feels like it understands the writer's story.

> [!CAUTION]
> **DATA SAFETY:** No schema changes. All work is frontend UI. Existing data untouched.

---

## Tickets

### B-06 · Inline Ripple Effect Visualiser (P1)
**New file:** `frontend/src/components/RipplePanel.tsx`

**What:** Collapsible inline panel shown when editing an event (not a modal).

**Contains:**
- Flat list of all downstream affected events
- Each row: entity name, relationship type (causes, enables, prevents), impact level badge (🔴🟡🟢)
- Click any row → navigates to that entity
- "Run Ripple Analysis" button at top

**Implementation:** UI wrapper over existing `analyzeRippleEffects()`. Logic is already built — this is purely presentation.

**Acceptance:** Editing an event shows a collapsible "Ripple Effects" panel below the edit form. Clicking runs analysis and shows affected events.

---

### B-08 · Conversation History Per Project (P2)
**New file:** `frontend/src/components/ConversationHistory.tsx`

**What:** AI chat threads persist across sessions and are scoped to the project.

**Flow:**
1. Every AI interaction (prose generation, consistency check, idea generation) saves its turns to the `conversations` table
2. A "History" panel in the sidebar shows past AI conversations
3. Writer can resume any previous thread
4. Past suggestions are referenced in new AI prompts for continuity

**Acceptance:** Close browser, reopen project → previous AI conversations are visible and resumable.

---

### QA · Full Regression Pass
Test every core flow end-to-end:
- [ ] Create project (wizard + AI intake)
- [ ] Create/edit/delete all entity types (character, event, timeline, arc, theme, location, note, chapter)
- [ ] Create/edit/delete relationships
- [ ] Run consistency check → issues appear in inbox
- [ ] Run ripple analysis → inline panel shows results
- [ ] Generate prose beat-by-beat → diff → accept/reject
- [ ] Export manuscript (.docx + .txt)
- [ ] Style profile learning (accept 3 drafts → profile populated)
- [ ] Timeline variant creation and switching
- [ ] Search and filter in Event List View
- [ ] Verify existing project data loads correctly

---

### UX · Polish Pass
All new features must have:
- [ ] Loading states (spinner or skeleton)
- [ ] Error states (friendly message + retry button)
- [ ] Empty states (helpful prompt when no data exists)
- [ ] Consistent styling with existing design tokens
- [ ] Keyboard accessibility (tab navigation, Enter to confirm)
- [ ] Mobile-responsive minimum (readable on tablet)

---

## Definition of Done
- [ ] Ripple panel works inline (no modals)
- [ ] Conversation history persists across sessions
- [ ] All entity CRUD operations pass regression
- [ ] All new features have loading/error/empty states
- [ ] **All existing DB data loads and displays correctly**
- [ ] `npx tsc --noEmit` — zero type errors
