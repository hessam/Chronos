# Sprint 1 — Clean & Rebuild Baseline

**Duration:** 2 weeks · **Goal:** Strip dead weight. Establish the event-list-first workspace.

> [!CAUTION]
> **DATA SAFETY:** This sprint deletes only frontend UI code. No database tables, columns, or rows are touched. All existing entities, relationships, and properties remain intact. No API routes are removed.

---

## Tickets

### R-01 · Delete Spatial Canvas (P0)
**Delete these files entirely:**
- `frontend/src/components/TimelineCanvas.tsx` (68KB)
- `frontend/src/components/NarrativeAuditCanvas.tsx` (29KB)
- `frontend/src/components/CausalityGraph.tsx` (40KB)
- `frontend/src/hooks/useGraphEngine.ts` (15KB)
- `frontend/src/hooks/useTimelineLayout.ts` (11KB)
- `frontend/src/components/timeline/` directory

**Then:** Remove all imports, state, and JSX referencing these components from `WorkspacePage.tsx`.

**Acceptance:** App builds and runs with zero references to deleted files.

---

### R-02 · Delete Temporal Scrubber (P0)
Embedded in the canvas files above. **Removed automatically with R-01.**

---

### R-03 · Single Provider AI (P0)
**File:** `aiService.ts`
- Default `AIProvider` type to `'anthropic'`
- Remove provider picker UI from `SettingsPage.tsx` (keep API key input for Anthropic only)
- **Keep** the `callProvider` abstraction and `AIProvider` type so a second provider can be added later without refactor
- **Keep** circuit breaker logic (useful for any provider)

**Acceptance:** Settings page shows only Anthropic API key. All AI calls go to Anthropic by default.

---

### R-04 · Collapse AI Modes to 2 (P1)
**File:** `aiService.ts` (2,493 lines → ~800 lines target)
- **KEEP these functions** (rename internally to use 2 temperature modes):
  - `generateAgenticProse` (Creative, temp 0.7)
  - `checkConsistency` (Analytical, temp 0.3)
  - `analyzeRippleEffects` (Analytical, temp 0.3)
  - `analyzePOVBalance` (Analytical, temp 0.3)
  - `generateIdeas` (Creative, temp 0.8)
- **ARCHIVE (delete) these functions:**
  - `generateBeatProse`, `analyzeDraftProse`, `reviseBeatProse`
  - `suggestBeats`, `checkBeatConsistency`
  - `generateSceneCard`, `buildNarrativeSequence`
  - `detectMissingScenes`, `generateCharacterVoice`
  - `assembleChapter`, `analyzeTemporalGaps`
  - `coWriteScene`, pacing analyzer
- Remove all associated interfaces, types, and prompt builders for deleted functions

**Acceptance:** `aiService.ts` exports only the 5 kept functions. Build passes.

---

### R-06, R-07, R-08 · Remove Voice/Sketch/Multi-Modal (P2)
**Already removed.** These only existed in documentation, never in code. No action needed.

---

### E-01 · Event List View (P0)
**New file:** `frontend/src/components/EventListView.tsx`

Flat, filterable, sortable table replacing the canvas as the primary workspace.

**Columns:** Title, Timeline, POV Character, Date/Position, Status (drafted/empty), Word Count

**Features:**
- Click row → opens entity in right panel (existing behavior)
- Column header click → sort asc/desc
- Search bar filters by title
- Type filter dropdown (show all entity types or just events)
- Uses existing `api.getEntities()` data — **no new API calls needed**

**Secondary tab:** Simple 2D timeline (horizontal = time, rows = timelines). Built with plain SVG or a lightweight chart lib. Not a custom renderer.

**Acceptance:** Workspace loads with a clean table view. Users can find, sort, and select events instantly.

---

### E-02 · Simplify Sidebar to 3 Panels (P0)
**File:** `WorkspacePage.tsx`

Strip the sidebar to exactly 3 collapsible panels:
1. **Entities** — grouped by type (characters, locations, themes, arcs, notes). Click to select.
2. **Events** — filtered list of events with status indicators. Click to select.
3. **Relationships** — connections for the currently selected entity. Click to navigate.

**Remove:** Deep-filter chain UI, canvas view controls, variant selector from sidebar.

**Keep:** Search bar at top, entity type icons.

**Acceptance:** Sidebar has 3 panels, no canvas-related controls, search works.

---

### E-03 · Two AI Modes (P0)
Done as part of R-03 + R-04 above. The two modes are:
- **Analytical** (temp 0.3): consistency, ripple, POV
- **Creative** (temp 0.7-0.9): prose gen, ideas

---

## Definition of Done
- [ ] `npm run dev` — both servers start without errors
- [ ] `npx tsc --noEmit` — zero type errors
- [ ] No references remain to deleted canvas files
- [ ] Workspace loads with EventListView as primary tab
- [ ] Sidebar has exactly 3 panels
- [ ] AI calls use Anthropic by default
- [ ] **All existing DB data is untouched and accessible**
