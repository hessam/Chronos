# Chronos: Sprint Plan
**Agile Delivery Roadmap**

**Version:** 1.1  
**Last Updated:** February 12, 2026  
**Sprint Duration:** 2 weeks (10 working days)  
**Total Sprints:** 6  
**Team Capacity:** 40 story points per sprint (9-person team)  
**Current Sprint:** Sprint 2

---

## Sprint Strategy

### Key Principle: Usable System After Sprint 1

Sprint 1 delivers a **minimum viable vertical slice**—users can:
- ✅ Create an account and log in
- ✅ Create their first project
- ✅ Add characters and events
- ✅ Create a basic timeline
- ✅ Visualize events on timeline canvas
- ✅ **Use basic AI to generate ideas**

This ensures immediate value and early user feedback.

---

## Sprint Overview

```mermaid
gantt
    title Chronos 6-Sprint Delivery Plan
    dateFormat YYYY-MM-DD
    section Sprint 1
    Foundation + MVP Canvas    :s1, 2026-02-24, 10d
    section Sprint 2
    Timeline Features + AI Basics :s2, after s1, 10d
    section Sprint 3
    AI Intelligence Layer      :s3, after s2, 10d
    section Sprint 4
    Relationship Graph         :s4, after s3, 10d
    section Sprint 5
    Collaboration              :s5, after s4, 10d
    section Sprint 6
    Performance & Launch       :s6, after s5, 10d
```

---

## Sprint 1: Foundation & Minimum Viable Product ✅ COMPLETED
**Dates:** Feb 10 - Feb 12, 2026  
**Goal:** Deliver a working system where users can create, visualize, and get AI assistance  
**Demo:** User creates project, adds 3 characters, 5 events, sees timeline, generates AI ideas  
**Outcome:** All 6 stories completed (42 points delivered)

### User Stories (42 points)

| ID | Story | Points | Owner | Status |
|----|-------|--------|-------|--------|
| E1-US1 | User registration and authentication | 5 | Backend Lead | ✅ Completed |
| E1-US2 | Project creation and management | 3 | Backend Lead | ✅ Completed |
| E1-US3 | Character entity CRUD | 8 | Full Stack | ✅ Completed |
| E1-US4 | Timeline entity CRUD | 5 | Full Stack | ✅ Completed |
| E1-US5 | Event entity CRUD | 8 | Full Stack | ✅ Completed |
| E2-US1 | Basic timeline canvas | 13 | Frontend Lead | ✅ Completed |

### Sprint 1 Retrospective

**What went well:**
- Full vertical slice delivered: auth → projects → entities → canvas
- Supabase direct integration eliminated need for backend REST proxy
- D3.js timeline canvas with zoom, pan, and drag working end-to-end
- All CRUD operations verified through browser E2E testing

**What to improve:**
- Add unit tests (skipped in Sprint 1 for speed)
- Set up CI/CD pipeline
- Index performance not yet validated at scale

**Key decisions:**
- Frontend CRUD goes directly through Supabase client (no backend proxy)
- D3.js chosen over React Flow for timeline canvas
- Polymorphic entities table handles all entity types

---

## Sprint 2: Enhanced Timeline + AI Foundation
**Dates:** Feb 12 - Feb 26, 2026  
**Goal:** Multi-timeline view and basic AI integration  
**Demo:** User manages 3 parallel timelines, asks AI for plot ideas  
**Status:** 🟢 In Progress

### User Stories (42 points)

| ID | Story | Points | Owner | Status |
|----|-------|--------|-------|--------|
| E2-US2 | Multi-timeline view | 8 | Frontend Lead | Not Started |
| E2-US3 | Event drag-and-drop on timeline | 5 | Frontend Lead | Not Started |
| E3-US1 | Multi-AI provider setup | 8 | Backend Lead | Not Started |
| E3-US2 | AI model selection UI | 5 | Full Stack | Not Started |
| E3-US3 | AI idea generation | 13 | AI/ML Lead | Not Started |
| E1-US6 | Additional entity types (Arc, Theme, Location) | 3 | Backend | Not Started |

**Sprint Backlog Details:**

#### Week 1 Focus: Timeline Enhancements + AI Backend
- **Days 1-2:** Multi-timeline swim-lane view (E2-US2) — extend TimelineCanvas to support parallel timeline rendering
- **Days 3-4:** Event drag-and-drop (E2-US3) — enhance D3 drag behavior with position persistence
- **Day 5:** Additional entity type polish (E1-US6) — Arc, Theme, Location CRUD already partially supported by polymorphic table

#### Week 2 Focus: AI Integration
- **Days 6-7:** Multi-AI provider backend (E3-US1) — abstraction layer for OpenAI/Anthropic/Google
- **Day 8:** AI model selection settings UI (E3-US2)
- **Days 9-10:** AI idea generation feature (E3-US3) — contextual prompt templates, sidebar display, save as Note

### Sprint 2 Deliverables

**✅ Features:**
1. View up to 10 timelines in parallel with swim-lane layout
2. Drag events to different timeline positions with snap-to-grid
3. Toggle timeline visibility
4. **AI idea generation based on character/event context**
5. Model selection (OpenAI, Anthropic, Google)
6. Arc, Theme, Location entity types (basic CRUD)

**✅ Technical:**
- AI orchestration service with abstraction layer
- Multi-provider support (OpenAI, Anthropic, Google)
- Circuit breaker pattern for AI failover
- Response caching (in-memory or Redis)
- Enhanced D3.js canvas with multi-timeline rendering

---

## Sprint 3: AI Intelligence & Consistency
**Dates:** Mar 24 - Apr 4, 2026  
**Goal:** Consistency checking and ripple analysis  
**Demo:** User changes event, sees AI-detected conflicts and suggestions

### User Stories (39 points)

| ID | Story | Points | Owner |
|----|-------|--------|-------|
| E2-US4 | Cross-timeline event indicators | 5 | Frontend Lead |
| E3-US4 | AI consistency checking | 13 | AI/ML Lead |
| E3-US5 | Ripple effect analysis (Antigravity) | 21 | AI/ML + Backend |

### Sprint 3 Deliverables

**✅ Features:**
1. Visual indicators for cross-timeline events
2. **"Check Consistency" button on timelines/arcs**
3. AI flags contradictions (character presence, causality)
4. **Ripple analysis when editing critical events**
5. AI suggests specific changes to resolve conflicts
6. Preview changes before applying

**✅ Technical:**
- Graph traversal queries (recursive CTEs)
- Batch AI requests for performance
- Conflict detection algorithms

---

## Sprint 4: Relationship Graph
**Dates:** Apr 7 - Apr 18, 2026  
**Goal:** Dynamic relationships and graph visualization  
**Demo:** User creates "Alice betrays Bob" relationship, explores 2-hop connections

### User Stories (39 points)

| ID | Story | Points | Owner |
|----|-------|--------|-------|
| E4-US1 | Create custom relationships | 8 | Full Stack |
| E4-US2 | Relationship visualization | 5 | Frontend Lead |
| E4-US3 | Graph traversal queries | 13 | Backend Lead |
| E4-US4 | Visual relationship graph | 13 | Frontend Lead |

### Sprint 4 Deliverables

**✅ Features:**
1. Drag-and-drop relationship creation
2. User-defined relationship types
3. Relationship sidebar on entity view
4. **"Explore Connections" with depth selector**
5. Force-directed graph visualization
6. Filter graph by relationship type

**✅ Technical:**
- Relationships table with adjacency list
- PostgreSQL recursive CTE queries
- D3.js graph rendering

---

## Sprint 5: Real-time Collaboration
**Dates:** Apr 21 - May 2, 2026  
**Goal:** Multi-user editing with presence and conflict resolution  
**Demo:** Two users edit same project, see real-time updates, resolve conflict

### User Stories (37 points)

| ID | Story | Points | Owner |
|----|-------|--------|-------|
| E5-US1 | Real-time updates | 13 | Backend Lead |
| E5-US2 | Presence indicators | 8 | Full Stack |
| E5-US3 | Conflict resolution UI | 13 | Full Stack |
| E6-US2 | Full-text search | 8 | Backend |

### Sprint 5 Deliverables

**✅ Features:**
1. Real-time entity updates (<500ms latency)
2. Avatar icons show active users
3. Highlight entities being edited
4. **Conflict resolution modal (side-by-side diff)**
5. Global search (entities, relationships)

**✅ Technical:**
- Supabase Realtime WebSocket subscriptions
- CRDT-like merge logic
- PostgreSQL FTS with GIN index

---

## Sprint 6: Performance, Offline, & Launch Prep
**Dates:** May 5 - May 16, 2026  
**Goal:** Production-ready system with offline support and analytics  
**Demo:** Work offline, reconnect, auto-sync; show analytics dashboard

### User Stories (38 points)

| ID | Story | Points | Owner |
|----|-------|--------|-------|
| E6-US1 | Offline mode with sync queue | 13 | Frontend Lead |
| E6-US3 | Performance optimization | 8 | Full Stack |
| E6-US4 | Analytics dashboard | 5 | Frontend |
| * | Bug fixes from beta testing | 8 | All |
| * | Documentation and onboarding | 5 | Product + Design |

### Sprint 6 Deliverables

**✅ Features:**
1. **Full offline mode with sync queue**
2. Offline indicator in UI
3. Auto-sync on reconnection
4. Analytics dashboard (entity counts, timeline coverage)
5. Performance meets all targets
6. In-app onboarding tutorial

**✅ Technical:**
- IndexedDB sync queue
- Performance monitoring (Sentry)
- Load testing (10K entities)
- P95 API latency <150ms verified

**✅ Launch Readiness:**
- Zero critical bugs
- <5 high-priority bugs
- All E2E tests passing
- Documentation complete
- Marketing site live
- Beta user feedback incorporated

---

## Sprint Ceremonies

### Daily Standup (15 minutes)
- **When:** 9:30 AM daily
- **Format:** What I did, what I'm doing, blockers
- **Tool:** Slack huddle or Zoom

### Sprint Planning (4 hours)
- **Day 1 of sprint**
- Review backlog, select stories, commit to sprint goal
- Break stories into tasks

### Sprint Review / Demo (2 hours)
- **Last day of sprint**
- Demo to stakeholders
- Gather feedback

### Sprint Retrospective (1.5 hours)
- **Last day of sprint, after review**
- What went well, what to improve, action items

### Backlog Refinement (2 hours)
- **Mid-sprint (Day 5)**
- Refine upcoming sprint stories, estimate new stories

---

## Risk Management

### Sprint-Specific Risks

| Sprint | Risk | Mitigation |
|--------|------|------------|
| 1 | Timeline canvas performance | Use virtualization, limit initial render |
| 2 | AI provider outages | Implement circuit breaker early |
| 3 | Ripple analysis too slow | Limit graph depth, cache results |
| 4 | Graph visualization complexity | Start with simple layout, iterate |
| 5 | Real-time sync conflicts | Implement CRDT-inspired merge |
| 6 | Offline sync edge cases | Extensive testing, conflict queue |

---

## Success Metrics by Sprint

| Sprint | Key Metric | Target |
|--------|-----------|--------|
| **1** | User can create timeline with events | 100% success rate |
| **2** | AI idea generation response time | <5s |
| **3** | Consistency check accuracy | >80% (will improve to 85% post-MVP) |
| **4** | Graph query latency (3-hop) | <200ms |
| **5** | Real-time update latency | <500ms |
| **6** | P95 API latency | <150ms |

---

## Team Assignments

### Sprint 1 Assignments

| Team Member | Primary Stories | Support Stories |
|------------|----------------|----------------|
| **Lead Architect** | E1-US1, Database schema | Code reviews |
| **Backend Engineer 1** | E1-US2, E1-US3 API | E1-US5 API |
| **Backend Engineer 2** | E1-US4, E1-US5 API | DevOps setup |
| **Frontend Engineer 1** | E2-US1 Timeline canvas | E1-US3 UI |
| **Frontend Engineer 2** | E1-US3 UI, E1-US4 UI | E1-US5 UI |
| **Full Stack Engineer** | E1-US5 integration | Testing |
| **UI Designer** | Timeline canvas design | Component library |
| **DevOps Engineer** | CI/CD pipeline, Vercel | Monitoring setup |
| **AI/ML Lead** | Research AI providers | Prompt templates |

---

## Sprint 1 Detailed Task Breakdown

### E1-US1: Authentication (5 points) ✅

**Backend Tasks:**
- [x] Set up Supabase project
- [x] Configure email auth
- [x] Create users table with RLS
- [x] Implement JWT refresh logic
- [x] Write API tests

**Frontend Tasks:**
- [x] Create sign-up form component
- [x] Create login form component
- [x] Implement auth state management (Zustand)
- [x] Add protected routes
- [x] Handle token refresh

---

### E2-US1: Timeline Canvas (13 points) ✅

**Frontend Tasks:**
- [x] Research D3.js vs React Flow → D3.js v7 chosen
- [x] Set up canvas component (TimelineCanvas.tsx)
- [x] Implement swim-lane timeline layout
- [x] Render entity nodes from Supabase data
- [x] Add zoom functionality (mouse wheel)
- [x] Add pan functionality (drag canvas)
- [x] Implement entity click handler
- [x] Add empty state
- [x] Type legend and zoom controls overlay

---

## Sprint 2 Detailed Task Breakdown

### E2-US2: Multi-Timeline View (8 points)

**Frontend Tasks:**
- [ ] Extend TimelineCanvas to render multiple timelines as horizontal swim-lanes
- [ ] Color-code each timeline lane with its assigned color
- [ ] Add timeline labels on left axis
- [ ] Implement timeline visibility toggles in sidebar
- [ ] Support reordering timelines via drag in sidebar
- [ ] Render events positioned on their assigned timeline lane
- [ ] Add connecting lines for events shared across timelines

**Definition of Done:**
- Canvas displays up to 10 timelines in parallel
- Each timeline has distinct color and label
- Toggling visibility hides/shows timeline lane
- Performance acceptable with 100+ events across 5 timelines

---

### E2-US3: Event Drag-and-Drop (5 points)

**Frontend Tasks:**
- [ ] Enhance D3 drag behavior for event nodes
- [ ] Add ghost marker visual during drag
- [ ] Implement snap-to-grid for precise placement
- [ ] Persist new position to Supabase (position_x/position_y)
- [ ] Add undo support for accidental drags
- [ ] Show coordinate tooltip during drag

**Definition of Done:**
- Events can be dragged to new positions on canvas
- Position changes persist across page reload
- Drag latency <50ms
- Visual ghost marker shows during drag

---

### E3-US1: Multi-AI Provider Setup (8 points)

**Backend Tasks:**
- [ ] Create AI abstraction layer (`services/ai/`)
- [ ] Implement OpenAI provider adapter
- [ ] Implement Anthropic provider adapter
- [ ] Implement Google Gemini provider adapter
- [ ] Add circuit breaker pattern for failover
- [ ] Add response caching (5 min TTL)
- [ ] Environment variable configuration for API keys
- [ ] Cost tracking per provider

**Definition of Done:**
- AI service supports OpenAI, Anthropic, Google
- Provider configured via environment variables
- Circuit breaker triggers after 3 consecutive failures
- Failover time <2s

---

### E3-US2: AI Model Selection UI (5 points)

**Frontend Tasks:**
- [ ] Create Settings page / modal
- [ ] Add AI provider dropdown (OpenAI, Anthropic, Google)
- [ ] Add model selection per provider
- [ ] Show estimated cost per 1K tokens
- [ ] Persist selection in user settings (Supabase)
- [ ] Add route and navigation link

**Definition of Done:**
- Settings panel shows available models
- User can set default model
- Selection persists across sessions
- Cost estimate visible for each model

---

### E3-US3: AI Idea Generation (13 points)

**Backend Tasks:**
- [ ] Create AI idea generation endpoint
- [ ] Build contextual prompt templates (character, event, timeline)
- [ ] Include linked entities (1-hop) in prompt context
- [ ] Return structured response (3-5 ideas with titles)

**Frontend Tasks:**
- [ ] Add "Generate Ideas" button on entity detail view
- [ ] Create AI ideas sidebar panel
- [ ] Display generated ideas with copy-to-clipboard
- [ ] Add "Save as Note" action per idea
- [ ] Show loading spinner during generation
- [ ] Error handling and retry UI

**Definition of Done:**
- User selects entity and clicks "Generate Ideas"
- AI generates 3-5 plot ideas in <5s
- Ideas displayed in dedicated panel
- User can copy or save ideas as Note entities

---

### E1-US6: Additional Entity Types (3 points)

**Tasks:**
- [ ] Verify Arc, Theme, Location types work with existing polymorphic table
- [ ] Add entity-type-specific property templates
- [ ] Add icons and color scheme for new types in sidebar
- [ ] Test create/edit/delete for each new type

**Definition of Done:**
- Arc, Theme, Location entities can be created/edited/deleted
- Each type has appropriate icon and color in sidebar and canvas
- Filtering by type works correctly

---

## Post-Sprint Activities

### Sprint 1 Beta Release
- **Target:** 5-10 internal beta testers
- **Duration:** 3 days parallel to Sprint 2
- **Feedback:** Usability issues, bugs, feature requests

### Sprint 3 External Beta
- **Target:** 50 external users (writers from fiction communities)
- **Goal:** Validate AI accuracy and consistency checking UX

### Sprint 6 Launch
- **Public release on Product Hunt, Hacker News**
- **Marketing campaign begins**
- **Support infrastructure live**

---

## Velocity Tracking

| Sprint | Planned Points | Completed Points | Velocity |
|--------|---------------|------------------|----------|
| 1 | 42 | 42 | 42 |
| 2 | 42 | — | — |
| 3 | 39 | TBD | TBD |
| 4 | 39 | TBD | TBD |
| 5 | 37 | TBD | TBD |
| 6 | 38 | TBD | TBD |

**Adjustment Strategy:** If velocity <80% planned, reduce subsequent sprint capacity by 20%.  
**Sprint 1 Notes:** All 6 stories completed at 100% velocity. Team delivered full vertical slice.

---

## Definition of "Usable System" (Sprint 1)

A user can complete this workflow end-to-end without errors:

1. Sign up for account
2. Verify email and log in
3. Create project "My Sci-Fi Epic"
4. Add character "Alice" with bio
5. Add character "Bob" with bio
6. Add character "Eve" with bio
7. Create timeline "Primary Timeline"
8. Create event "Alice meets Bob" on timeline
9. Create event "Bob betrays Alice" on timeline
10. Create event "Alice seeks revenge" on timeline
11. **View timeline canvas with all 3 events positioned correctly**
12. Zoom in to see event details
13. Click event to open details sidebar
14. Edit event description
15. Log out and log back in (data persists)

**Success Criteria:** 10/10 beta testers complete this flow without assistance.

---

**End of Sprint Plan**

*This plan is a living document. We will adjust based on velocity, feedback, and changing priorities.*
