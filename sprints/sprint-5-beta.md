# Sprint 5 — Beta Hardening

**Duration:** 2 weeks · **Goal:** Real users, real stories, real feedback.

> [!CAUTION]
> **DATA SAFETY:** No schema changes. Bug fixes only modify frontend logic. Any data migration for beta users must be opt-in and non-destructive.

---

## Tickets

### BETA · Closed Beta Launch
- Recruit 20-30 writers (target: epic/sci-fi/fantasy authors)
- Provide onboarding guide (1-page quick start)
- Create a feedback channel (Discord, email, or in-app form)
- Set up error monitoring (Sentry or equivalent)

---

### OBS · Analytics Instrumentation
Track key metrics:
- **Time to first entity** (from signup to populated graph)
- **Time to first draft** (from entity creation to accepted prose)
- **Feature adoption** (which features are actually used)
- **Issues resolved** (from Issues Inbox)
- **Export count** (how many manuscripts exported)
- **Session duration** and **return rate**

Implementation: Lightweight event tracking (localStorage counters or Supabase-based events table).

---

### FIX · Top 5 Beta Issues
Reserve capacity for the top 5 issues reported by beta users. These are unknown at sprint planning time.

**Categories to anticipate:**
- AI quality issues (prompt refinement)
- UI confusion (workflow clarity)
- Performance issues (slow queries, long AI responses)
- Missing features that block core workflows
- Data bugs (entity display errors)

---

### PERF · Performance Audit
Benchmark and optimize:
- [ ] **Graph query speed:** Entity list load time < 500ms for 500+ entities
- [ ] **AI response latency:** Prose generation < 15s, consistency check < 10s
- [ ] **Export speed:** Manuscript export < 5s for 50 events
- [ ] **Initial page load:** Workspace loads in < 2s
- [ ] **Memory usage:** < 200MB for a project with 500 entities

**Optimization targets if needed:**
- Paginate entity queries (load 50 at a time)
- Cache AI responses (5-minute TTL, already implemented)
- Virtualize long lists in sidebar
- Lazy-load non-critical components

---

## Definition of Done
- [ ] 20+ beta users onboarded
- [ ] Analytics tracking active
- [ ] Top 5 beta issues resolved
- [ ] Performance benchmarks met
- [ ] No data corruption or loss reported
- [ ] **All existing and beta user data is safe**
