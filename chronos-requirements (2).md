**CHRONOS**

Product Requirements & Sprint Roadmap

Rebuild Strategy  ·  v1.0  ·  March 2026

| 9 Features to REMOVE | 7 Features to EDIT | 8 Features to BUILD | 6 Sprints Total |
| :---: | :---: | :---: | :---: |

| NORTH STAR "The only writing tool where changing one event automatically shows you every scene it breaks — and rewrites them with you." |
| :---: |

# **01 — Legend**

Every requirement in this document is tagged with a type, priority, and sprint. Use the table below as your key.

| REMOVE | Feature or component to be deleted from codebase |
| :---: | :---- |
| **EDIT** | Existing feature to be modified or simplified |
| **BUILD** | New feature to be built from scratch |
| **KEEP** | Existing feature confirmed as-is, no changes needed |

Priority scale: **P0** \= Blocker (ship nothing without this)  **P1** \= Critical  **P2** \= Important  **P3** \= Nice to have

# **02 — Remove**

These components must be deleted from the codebase or design. They add complexity without proven user value and are blocking the team from focusing on the core product.

| ID | TYPE | REQUIREMENT | PRIORITY | SPRINT |
| :---: | :---: | ----- | :---: | :---: |
| **R-01** | **REMOVE** | **4-Quadrant Spatial-Temporal Canvas** The fully-custom spatial graph renderer with colored timeline zones, directional causality arrows, and temporal scrubbers. This is a 6–12 month sub-project that serves an edge-case audience. Replaced by a clean list/table view. | **P0** | Sprint 1 |
| **R-02** | **REMOVE** | **Temporal Scrubber (Narrative vs Chronological toggle)** Complex UI control that depends on the custom canvas. No substitute needed at this stage — ordering is handled in the event list view. | **P0** | Sprint 1 |
| **R-03** | **REMOVE** | **Multi-Provider AI Failover Chain (10 providers)** Over-engineered infrastructure. Strip to one provider (Anthropic Claude). Add a second provider only when user volume demands it. This complexity ships bugs, not features. | **P0** | Sprint 1 |
| **R-04** | **REMOVE** | **10 Distinct AI Algorithm Modes** Replace with 2 modes only: Analytical (temp 0.3, consistency tasks) and Creative (temp 0.7–0.9, generation tasks). Everything else is premature specialisation. | **P1** | Sprint 1 |
| **R-05** | **REMOVE** | **Story Health Score (numeric, e.g. 7.8/10)** Gamified quality scoring is meaningless to writers. Writers trust specific actionable notes, not a number. Replace entirely with the Issues Inbox (BUILD B-03). | **P1** | Sprint 2 |
| **R-06** | **REMOVE** | **Voice Interaction** Phase 4 feature with no validated demand. Remove from roadmap entirely until PMF is confirmed. | **P2** | Sprint 1 |
| **R-07** | **REMOVE** | **Sketch-to-Entity (draw relationships)** Exploratory UX that adds mobile/tablet complexity. Remove from roadmap. Entity creation via dialogue (BUILD B-01) covers this use case better. | **P2** | Sprint 1 |
| **R-08** | **REMOVE** | **Multi-Modal Interaction Layer** Encompassing voice \+ sketch features. The entire multi-modal section of the spec is cut. Text-first UI only. | **P2** | Sprint 1 |
| **R-09** | **REMOVE** | **Batch Scene Generation (generate all scenes at once)** Creates false confidence in AI output quality. Writers must review each generated scene individually. Remove batch mode; scene-by-scene generation enforces quality control. | **P3** | Sprint 3 |

# **03 — Edit**

These existing features should be kept but significantly simplified or redirected. They have genuine value but are currently over-built or misaligned.

| ID | TYPE | REQUIREMENT | PRIORITY | SPRINT |
| :---: | :---: | ----- | :---: | :---: |
| **E-01** | **EDIT** | **Main Canvas → Event List View** Replace the spatial canvas with a flat, filterable, sortable list of events. Columns: ID, title, timeline, POV character, date/position, status. This is the writer's primary workspace. Add a simple 2D timeline view (horizontal axis \= time, rows \= timelines) as a secondary tab — built with a charting library, not custom rendering. | **P0** | Sprint 1 |
| **E-02** | **EDIT** | **Entity Navigator → Simplified Sidebar** Keep the sidebar concept but reduce to 3 panels: Entities (characters, locations, themes), Events (filtered list), and Relationships (connections for the selected entity). Remove the deep-filter chain UI. Simple search \+ type filter is sufficient. | **P0** | Sprint 1 |
| **E-03** | **EDIT** | **AI Architecture → Single Provider, Two Modes** Consolidate to Anthropic Claude only. Two modes: Analytical (used for consistency checking, ripple analysis) and Creative (used for generation, suggestions). Remove all other provider integrations and algorithm variants. Keep the failover abstraction layer in code so a second provider can be added later without refactor. | **P0** | Sprint 1 |
| **E-04** | **EDIT** | **Consistency Checker → Issues Inbox** Current implementation interrupts the writer with real-time modal warnings. Change to async: run checks in the background, push results to a persistent Issues Inbox. Writer reviews and resolves on their own schedule. Keeps the core logic (ripple effect graph traversal) intact — only changes the delivery mechanism. | **P0** | Sprint 2 |
| **E-05** | **EDIT** | **Character Entity Schema → Streamline Properties** Current schema has too many optional properties that writers ignore. Reduce to: name, role, want (external goal), need (internal arc), ghost (backstory trauma), and notes. Remove unused properties. JSONB properties field remains for power users. | **P1** | Sprint 2 |
| **E-06** | **EDIT** | **Event Entity Schema → Add Prose Draft Tab** Event cards currently separate from prose generation. Add a Prose tab directly inside each event card with: draft content field, iteration history, word count, and accepted/rejected status. Writers think event-first — prose should live inside the event, not in a separate flow. | **P1** | Sprint 2 |
| **E-07** | **EDIT** | **Story Health Dashboard → Remove Score, Keep Flags** Strip out the 7.8/10 score, pie charts, and radar graphs. Keep only: POV distribution (simple bar, no score), pacing flag (events clustered in same date range), and unresolved arc warnings. All flags link directly to the relevant entity or event. | **P2** | Sprint 3 |

# **04 — Build**

New features that are missing from the current product but are critical to the core value proposition and to reaching product-market fit.

| ID | TYPE | REQUIREMENT | PRIORITY | SPRINT |
| :---: | :---: | ----- | :---: | :---: |
| **B-01** | **BUILD** | **AI Onboarding Funnel — Story Intake** New user arrives with a blank project. AI asks: 'Tell me about your story.' From the response, it automatically extracts and creates the first 5–10 entities (characters, events, timelines). User sees a populated graph within 60 seconds of signup. This is the aha moment that converts free users to paid. | **P0** | Sprint 2 |
| **B-02** | **BUILD** | **Manuscript Export** Export project as a Word (.docx) or plain text file. Events ordered by narrative sequence. Prose from each event assembled into chapters with proper headings. This is the payoff — without it, Chronos is a planning tool that never delivers. Required before any paid tier launch. | **P0** | Sprint 3 |
| **B-03** | **BUILD** | **Issues Inbox** Persistent sidebar panel (or dedicated page) listing all detected contradictions, causality breaks, POV errors, and unresolved arcs. Each issue shows: severity (error/warning), the affected entities, a plain-language description, and a Resolve button that opens the relevant entity. Issues are generated asynchronously, never as blocking modals. | **P0** | Sprint 2 |
| **B-04** | **BUILD** | **Style Profile — Adaptive Learning Store** After each accepted or rejected prose draft, store the key properties (metaphor density, sentence length distribution, ending type, voice markers). Build a per-project Style Profile. Apply profile automatically to all future prose generation in that project. Show the profile to the writer as editable preferences. | **P1** | Sprint 3 |
| **B-05** | **BUILD** | **Iterative Prose Generation Loop** Generation flow: (1) Load full event context from graph, (2) Generate draft, (3) AI self-critiques against style profile \+ rules, (4) Auto-revise, (5) Show writer with diff. Writer can accept, request specific changes, or regenerate. Each revision logged in draft history inside the event card (see E-06). | **P1** | Sprint 3 |
| **B-06** | **BUILD** | **Ripple Effect Visualiser (inline)** When a writer edits an event, show a collapsible Ripple panel inline: a flat list of all affected downstream events with their relationship type (causes, enables, prevents). Clicking any affected event opens it. No custom canvas required — this is a linked list view. The graph traversal logic already exists; this is a UI wrapper only. | **P1** | Sprint 4 |
| **B-07** | **BUILD** | **Project Setup Wizard** 3-step modal on project creation: (1) Project name \+ genre, (2) Choose starting mode (blank, from premise, from characters), (3) AI intake or manual. Replaces the current blank-slate new project experience. | **P2** | Sprint 2 |
| **B-08** | **BUILD** | **Conversation History Per Project** Store the full AI conversation thread per project, not per session. Writer can resume any previous conversation thread, see what decisions were made and why, and reference past AI suggestions. Stored in the conversations table (already in schema). | **P2** | Sprint 4 |

# **05 — Keep (No Changes)**

These components are confirmed as working well. No sprint work needed — protect them from scope creep during the rebuild.

| ID | TYPE | REQUIREMENT | PRIORITY | SPRINT |
| :---: | :---: | ----- | :---: | :---: |
| **K-01** | **KEEP** | **Knowledge Graph Data Model (core schema)** Entity nodes \+ typed relationship edges \+ JSONB properties. This is the moat. Do not simplify the underlying data model. Simplify only the UI that surfaces it. | **P0** | — |
| **K-02** | **KEEP** | **Ripple Effect / Causality Engine (logic layer)** The graph traversal that detects downstream consequences of an event change. This is the single most defensible feature. Keep the algorithm intact; only the UI delivery changes (see B-06, E-04). | **P0** | — |
| **K-03** | **KEEP** | **Timeline Variant System** Primary Reality vs Alt-Future timeline branching and divergence tracking. Core to the story type Chronos serves. No changes needed. | **P1** | — |
| **K-04** | **KEEP** | **Supabase \+ PostgreSQL Infrastructure** The cloud-first data layer is solid. No migration or changes. Add the new tables from the AI Co-Author schema (conversations, prose\_drafts, style\_profiles, ai\_suggestions) in Sprint 2\. | **P0** | — |
| **K-05** | **KEEP** | **React \+ TypeScript \+ Fastify Stack** No tech stack changes. All new features are built within this stack. | **P0** | — |
| **K-06** | **KEEP** | **Context Inspector Sidebar (entity detail panel)** The deep-dive panel showing all properties and relationships for a selected entity. Keep as-is. The Prose tab (E-06) will be added inside this panel. | **P1** | — |

# **06 — Sprint Plan**

6 two-week sprints. Each sprint has a single goal. No sprint carries forward unfinished work — scope is fixed at sprint start. P0 items must be resolved before the sprint closes.

| Sprint 1  Weeks 1–2 Goal: Clean the codebase. Remove all dead weight. Establish the new baseline UI. |
| :---- |
|  **R-01** Remove 4-Quadrant Spatial Canvas \+ all custom rendering code **R-02** Remove Temporal Scrubber component **R-03** Remove multi-provider failover chain; wire to Anthropic only **R-04** Collapse 10 AI modes to 2 (Analytical / Creative) **R-06** Remove Voice Interaction feature \+ UI **R-07** Remove Sketch-to-Entity feature \+ UI **R-08** Remove Multi-Modal interaction layer **E-01** Build Event List View as primary workspace (table \+ simple timeline tab) **E-02** Simplify Entity Navigator sidebar to 3 panels **E-03** Single-provider AI architecture with 2 modes  |

| Sprint 2  Weeks 3–4 Goal: Core intelligence layer. Writers can set up a project and have issues caught automatically. |
| :---- |
|  **B-01** AI Onboarding Funnel — Story Intake (entity auto-extraction from premise) **B-03** Issues Inbox — persistent async contradiction \+ arc warning panel **B-07** Project Setup Wizard — 3-step modal **E-04** Convert Consistency Checker from modal interrupts to async Issues Inbox **E-05** Streamline Character entity schema to 6 core properties **E-06** Add Prose tab inside Event card (with draft history) **DB** Add new DB tables: conversations, prose\_drafts, style\_profiles, ai\_suggestions  |

| Sprint 3  Weeks 5–6 Goal: Prose generation is live. Writers can go from event to draft to export. |
| :---- |
|  **B-02** Manuscript Export — .docx and .txt, ordered by narrative sequence **B-04** Style Profile store — capture accept/reject signals, build per-project profile **B-05** Iterative Prose Generation Loop — generate → self-critique → revise → show diff **R-05** Remove Story Health numeric score **R-09** Remove batch scene generation **E-07** Simplify Story Health to flags only (POV bar, pacing flag, unresolved arcs)  |

| Sprint 4  Weeks 7–8 Goal: Deepen AI co-authoring. Writers feel Chronos understands their story. |
| :---- |
|  **B-06** Ripple Effect Visualiser — inline collapsible list on event edit **B-08** Conversation History per project — resumable AI threads **QA** Full consistency regression pass across all entity types **UX** Polish: loading states, error handling, empty states for all new features  |

| Sprint 5  Weeks 9–10 Goal: Beta hardening. Real users, real stories, real feedback. |
| :---- |
|  **BETA** Closed beta with 20–30 writers (target: epic/sci-fi/fantasy authors) **OBS** Instrument analytics: feature adoption, time-to-first-draft, issues resolved **FIX** Address top 5 issues from beta feedback **PERF** Performance audit: graph query speed, AI response latency, export speed  |

| Sprint 6  Weeks 11–12 Goal: Paid tier launch. Product is shippable. |
| :---- |
|  **TIER** Define and implement Free vs Pro feature gates **ONBRD** Refine onboarding funnel based on beta data **DOCS** Write help documentation for all P0/P1 features **SHIP** Public launch — Product Hunt, writer communities, targeted outreach  |

# **07 — Database Additions**

New tables to be added in Sprint 2\. These support the AI Co-Author features and must be in place before prose generation (Sprint 3\) begins.

## **New Tables**

### **conversations**

Stores full AI conversation threads per project. Columns: id (UUID), project\_id, created\_at, context (JSONB — full turns), decisions\_made (JSONB), status (active/archived).

### **prose\_drafts**

Each AI-generated draft for an event. Columns: id, event\_id, draft\_number, content (TEXT), word\_count, self\_critique (JSONB), user\_feedback, quality\_score, accepted (BOOLEAN), created\_at.

### **style\_profiles**

Per-project learned style preferences. Columns: id, project\_id, preferences (JSONB: metaphor\_limit, sentence\_rhythm, voice, ending\_type), anti\_patterns (JSONB), examples (JSONB), updated\_at.

### **ai\_suggestions**

Log of all AI suggestions and writer responses. Columns: id, project\_id, suggestion\_type (event/character/relationship/edit), content (JSONB), reasoning, user\_action (accepted/rejected/modified/pending), created\_at.

# **08 — Build From Scratch?**

**Decision: No. Do not rebuild from scratch.**

The knowledge graph data model — entities, typed relationships, JSONB properties — is the hardest part of Chronos and it already exists and works. Rebuilding from scratch means 3–6 months of infrastructure before adding a single user-facing feature.

The correct path is product surgery: strip the codebase of everything that distracts from the core value, then build upward from the solid foundation that already exists.

## **What this rebuild does NOT touch**

* The data model (graph nodes \+ edges \+ JSONB)

* The Supabase infrastructure and auth layer

* The core causality/ripple traversal algorithm

* The React/TypeScript/Fastify stack

* The timeline variant branching logic

## **The 3 things that make or break this product**

* **Ripple Effect Engine:** The moment a writer changes one event and sees every consequence — that is the product. Protect this feature above all else.

* **Onboarding Funnel:** A writer who sees a populated story graph within 60 seconds of signup will convert. An empty canvas will not.

* **Manuscript Export:** Without export, Chronos is a planning tool that never pays off. Writers must be able to leave with something.

End of Document