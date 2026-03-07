# Sprint 2 — Intelligence Layer

**Duration:** 2 weeks · **Goal:** Writers can set up a project with AI and have issues caught automatically.

> [!CAUTION]
> **DATA SAFETY:** DB migrations in this sprint are ADDITIVE only. New tables are created alongside existing ones. No existing tables, columns, or rows are altered or deleted. All existing entities and relationships remain intact.

---

## Tickets

### DB · Add 4 New Tables (P0)
**New file:** `database/migrations/006_coauthor_tables.sql`

```sql
-- All migrations are ADDITIVE. No existing tables are modified.

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    context JSONB DEFAULT '[]',
    decisions_made JSONB DEFAULT '[]',
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived'))
);

CREATE TABLE IF NOT EXISTS prose_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    draft_number INT DEFAULT 1,
    content TEXT DEFAULT '',
    word_count INT DEFAULT 0,
    self_critique JSONB,
    user_feedback TEXT,
    quality_score REAL,
    accepted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS style_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
    preferences JSONB DEFAULT '{}',
    anti_patterns JSONB DEFAULT '[]',
    examples JSONB DEFAULT '[]',
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    suggestion_type TEXT NOT NULL,
    content JSONB DEFAULT '{}',
    reasoning TEXT,
    user_action TEXT DEFAULT 'pending'
        CHECK (user_action IN ('accepted', 'rejected', 'modified', 'pending')),
    created_at TIMESTAMPTZ DEFAULT now()
);
```

**API Routes:** Add CRUD endpoints for each table in `api/src/routes/v1/`.

**Acceptance:** Tables exist in Supabase. API routes return 200. Existing data untouched.

---

### B-07 · Project Setup Wizard (P2)
**New file:** `frontend/src/components/ProjectWizard.tsx`

3-step modal triggered from `ProjectsPage.tsx`:
1. **Step 1:** Project name + genre selector (sci-fi, fantasy, thriller, literary, other)
2. **Step 2:** Starting mode — Blank, From Premise, From Characters
3. **Step 3:** If "From Premise" → AI intake (B-01). If "Blank" → go to workspace.

**Acceptance:** New project creation uses the wizard. Genre is saved to project properties.

---

### B-01 · AI Onboarding Funnel (P0)
**New file:** `frontend/src/components/StoryIntake.tsx`

Triggered from Project Wizard step 3 when user selects "From Premise."

**Flow:**
1. Show prompt: "Tell me about your story in a few sentences."
2. User types free-text premise
3. Call Anthropic (Creative mode, temp 0.8) with entity extraction prompt
4. AI returns structured JSON: `{ characters: [...], events: [...], timelines: [...] }`
5. Show extracted entities to user for confirmation (checkboxes)
6. On confirm → bulk-create entities via existing `api.createEntity()` calls
7. Navigate to workspace with populated graph

**Target:** Writer sees a populated project within 60 seconds of signup.

**Acceptance:** Entering a 2-sentence premise creates 5-10 entities. User can deselect any before creation.

---

### B-03 · Issues Inbox (P0)
**New file:** `frontend/src/components/IssuesInbox.tsx`

Persistent sidebar panel (not a modal) listing detected issues.

**Each issue shows:**
- Severity badge (🔴 error, ⚠️ warning, 💡 suggestion)
- Title (e.g., "Timeline Paradox: Event A before Event B")
- Affected entities (clickable links)
- "Resolve" button → navigates to the relevant entity

**Data source:** Results from `checkConsistency()` and `analyzeRippleEffects()`, stored in component state (Sprint 2) or `ai_suggestions` table (Sprint 4).

**Acceptance:** Issues panel visible in workspace sidebar. Shows real issues from consistency checks.

---

### E-04 · Async Consistency Checker (P0)
**Files:** `WorkspacePage.tsx`, `ConflictModal.tsx`

**Change:** After any entity save (create/update), run `checkConsistency()` in the background (non-blocking). Push results to Issues Inbox instead of showing a modal.

**Keep:** The option to manually trigger a check from the Issues Inbox header.

**Remove:** The blocking `ConflictModal` pattern. The modal component can be deleted or repurposed.

**Acceptance:** Editing an entity never blocks the UI with a modal. Issues appear in the inbox within 5-10 seconds.

---

### E-05 · Streamline Character Schema (P1)
**File:** `WorkspacePage.tsx` (entity edit form)

Update the character create/edit form to show 6 core fields:
- **Name** (existing)
- **Role** (new property: protagonist, antagonist, supporting, etc.)
- **Want** (new property: external goal)
- **Need** (new property: internal arc)
- **Ghost** (new property: backstory trauma)
- **Notes** (existing description field)

**Implementation:** Store as `properties.role`, `properties.want`, `properties.need`, `properties.ghost`. Keep JSONB flexible — power users can still add custom properties.

> [!IMPORTANT]
> Existing character entities with other properties must continue to display their data. The new fields are ADDITIVE to the existing properties, not replacements.

**Acceptance:** Creating a new character shows the 6-field form. Existing characters still display all their current properties.

---

### E-06 · Prose Tab in Event Card (P1)
**New file or section in:** `WorkspacePage.tsx` or `ProseTab.tsx`

Add a "Prose" tab inside the event detail panel (right sidebar):
- Draft text editor (uses existing `properties.draft_text`)
- Word count display
- "Generate Prose" button (wires to `generateAgenticProse`)
- Draft history (reads from `prose_drafts` table)
- Accepted/rejected status badge

**Acceptance:** Event detail panel has a Prose tab. Draft text can be viewed, edited, and generated from within the event card.

---

## Definition of Done
- [ ] 4 new DB tables exist and API routes work
- [ ] Project creation uses 3-step wizard
- [ ] AI onboarding extracts entities from a premise
- [ ] Issues Inbox shows consistency issues in sidebar
- [ ] Entity saves trigger async background checks
- [ ] Character form shows 6 core fields
- [ ] Event card has a Prose tab
- [ ] **All existing entities, relationships, and properties are unchanged**
- [ ] `npx tsc --noEmit` — zero type errors
