-- ============================================================
-- Chronos: Timeline Variants Schema
-- Migration 002 - Per-Timeline Entity Overrides (ADR-001)
-- ============================================================

-- ============================================================
-- 1. Timeline Variants Table
-- Stores per-timeline overrides for any entity type.
-- NULL fields inherit from the canonical entity.
-- ============================================================
CREATE TABLE IF NOT EXISTS timeline_variants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  timeline_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,

  -- Override fields (NULL = inherit from canonical entity)
  variant_name TEXT,
  variant_description TEXT,
  variant_properties JSONB DEFAULT '{}',

  -- Timeline-specific canvas positioning
  position_x FLOAT,
  position_y FLOAT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One variant per entity per timeline
  CONSTRAINT unique_entity_timeline UNIQUE(entity_id, timeline_id)
);

-- ============================================================
-- 2. Indexes
-- ============================================================

-- Primary lookup: variants for a given entity
CREATE INDEX idx_variants_entity_id ON timeline_variants(entity_id);

-- Lookup: all variants scoped to a specific timeline
CREATE INDEX idx_variants_timeline_id ON timeline_variants(timeline_id);

-- Lookup: all variants in a project (for batch loading)
CREATE INDEX idx_variants_project_id ON timeline_variants(project_id);

-- Composite: entity + timeline (covered by UNIQUE but explicit for clarity)
CREATE INDEX idx_variants_entity_timeline ON timeline_variants(entity_id, timeline_id);

-- ============================================================
-- 3. Updated_at Trigger (reuses function from migration 001)
-- ============================================================
CREATE TRIGGER update_timeline_variants_updated_at
  BEFORE UPDATE ON timeline_variants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 4. Row Level Security (RLS)
-- ============================================================
ALTER TABLE timeline_variants ENABLE ROW LEVEL SECURITY;

-- Users can view variants in their own projects
CREATE POLICY "Users can view variants in own projects"
  ON timeline_variants FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- Users can create variants in their own projects
CREATE POLICY "Users can create variants in own projects"
  ON timeline_variants FOR INSERT
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- Users can update variants in their own projects
CREATE POLICY "Users can update variants in own projects"
  ON timeline_variants FOR UPDATE
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- Users can delete variants in their own projects
CREATE POLICY "Users can delete variants in own projects"
  ON timeline_variants FOR DELETE
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
