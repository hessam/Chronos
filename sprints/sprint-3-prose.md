# Sprint 3 — Prose Pipeline

**Duration:** 2 weeks · **Goal:** Writers go from event to draft to exported manuscript.

> [!CAUTION]
> **DATA SAFETY:** No DB schema changes this sprint. All work is frontend-only. Existing data untouched.

---

## Tickets

### B-04 · Style Profile Store (P1)
**New file:** `frontend/src/services/styleProfileService.ts`

**How it works:**
1. After writer accepts or rejects a prose draft, capture key properties:
   - Metaphor density, sentence length distribution, voice markers, ending type
2. Save to `style_profiles` table (created in Sprint 2) via API
3. On next generation, load the project's style profile and inject into prompt
4. Show the profile to the writer as editable preferences in a "Style" panel

**Replaces:** The current hardcoded `stylePresets.ts` system becomes the fallback for projects without a learned profile.

**Acceptance:** Accept 3 drafts → style profile is populated. Next generation uses the learned profile.

---

### B-05 · Iterative Prose Generation Loop (P1)
**Files:** `aiService.ts`, `CoWriteView.tsx`

**Full loop:**
1. Load event context from graph (existing)
2. Generate draft (existing `generateAgenticProse`)
3. **NEW:** AI self-critiques against style profile + rules (separate analytical call)
4. **NEW:** Auto-revise based on critique (re-call creative mode with critique context)
5. Show writer the diff (existing diff view)
6. Writer accepts, requests changes, or regenerates
7. **NEW:** Log each draft to `prose_drafts` table with draft number, content, self-critique, user action

**Acceptance:** Generation shows "Generating → Self-critiquing → Revising → Done" progress. Draft history visible in Prose Tab (E-06).

---

### B-02 · Manuscript Export (P0)
**New file:** `frontend/src/services/exportService.ts`

**Export flow:**
1. Collect all events with `properties.draft_text` that have been accepted
2. Order by narrative sequence (use `sort_order` or relationship-based ordering)
3. Group into chapters (events linked to chapter entities)
4. Format with proper headings: `# Chapter X: [Chapter Name]` → event prose
5. Output as:
   - `.txt` — plain text with chapter breaks
   - `.docx` — using `docx` npm package (add to dependencies)

**UI:** "Export Manuscript" button in workspace header or project settings.

**Acceptance:** Clicking export downloads a `.docx` file with all accepted prose assembled in chapter order.

---

### R-05 · Remove Story Health Score (P1)
**File:** `AnalyticsPage.tsx`

Remove the summary cards showing numeric counts as a "health" metric. This page will be repurposed for E-07.

---

### E-07 · Story Flags (Replaces Health Dashboard) (P2)
**File:** `AnalyticsPage.tsx` → refactored or replaced

Strip to 3 actionable flags only:
1. **POV Distribution** — simple bar chart showing which characters have the most POV events. Uses `analyzePOVBalance` data
2. **Pacing Flag** — warns if events are clustered in the same date range with no gaps
3. **Unresolved Arc Warnings** — arcs without a linked resolution event

Each flag links directly to the relevant entity/event.

**Acceptance:** Analytics page shows 3 flag sections with actionable links. No numeric scores.

---

### R-09 · Verify No Batch Generation Path (P3)
Already enforced by beat-by-beat flow. Verify no hidden batch path exists in `CoWriteView.tsx` or `aiService.ts`.

---

## Definition of Done
- [ ] Style profiles are learned and applied to generation
- [ ] Prose generation includes self-critique and auto-revision
- [ ] Draft history is logged in `prose_drafts` table
- [ ] Manuscript exports as `.docx` and `.txt`
- [ ] Analytics page shows 3 flags, no numeric scores
- [ ] **All existing DB data and entity properties untouched**
- [ ] `npx tsc --noEmit` — zero type errors
