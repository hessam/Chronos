-- ============================================================
-- Chronos: Database Schema
-- Migration 006 - Co-Author Intelligence Tables
-- ============================================================

-- ============================================================
-- 1. Conversations Table
-- Persists AI chat threads per project
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT DEFAULT 'New Conversation',
  context_entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
  messages JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. Prose Drafts Table
-- Tracks every draft iteration for an event's prose
-- ============================================================
CREATE TABLE IF NOT EXISTS prose_drafts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  content TEXT NOT NULL DEFAULT '',
  word_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'revised', 'accepted', 'rejected')),
  ai_feedback TEXT DEFAULT NULL,
  style_scores JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. Style Profiles Table
-- Per-project learned writing style preferences
-- ============================================================
CREATE TABLE IF NOT EXISTS style_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  profile_name TEXT NOT NULL DEFAULT 'Default',
  preferences JSONB DEFAULT '{
    "sentence_length": "mixed",
    "metaphor_density": "moderate",
    "dialogue_ratio": 0.3,
    "pov_style": "third_limited",
    "tense": "past",
    "tone": "neutral",
    "vocabulary_level": "literary"
  }',
  learned_from INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT one_profile_per_project UNIQUE (project_id, profile_name)
);

-- ============================================================
-- 4. Issues Table
-- Persistent inbox for consistency/quality issues
-- ============================================================
CREATE TABLE IF NOT EXISTS issues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
  related_entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
  issue_type TEXT NOT NULL CHECK (issue_type IN ('contradiction', 'causality', 'pov', 'pacing', 'arc', 'continuity', 'other')),
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'error')),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  suggestion TEXT DEFAULT '',
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 5. Indexes
-- ============================================================
CREATE INDEX idx_conversations_project ON conversations(project_id);
CREATE INDEX idx_conversations_entity ON conversations(context_entity_id);
CREATE INDEX idx_prose_drafts_entity ON prose_drafts(entity_id);
CREATE INDEX idx_prose_drafts_project ON prose_drafts(project_id);
CREATE INDEX idx_prose_drafts_status ON prose_drafts(status);
CREATE INDEX idx_style_profiles_project ON style_profiles(project_id);
CREATE INDEX idx_issues_project ON issues(project_id);
CREATE INDEX idx_issues_entity ON issues(entity_id);
CREATE INDEX idx_issues_resolved ON issues(resolved);
CREATE INDEX idx_issues_type ON issues(issue_type);

-- ============================================================
-- 6. Updated_at Triggers
-- ============================================================
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_style_profiles_updated_at
  BEFORE UPDATE ON style_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 7. Row Level Security
-- ============================================================
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE prose_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE style_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;

-- Conversations
CREATE POLICY "Users can view conversations in own projects"
  ON conversations FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can create conversations in own projects"
  ON conversations FOR INSERT
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can update conversations in own projects"
  ON conversations FOR UPDATE
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete conversations in own projects"
  ON conversations FOR DELETE
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- Prose Drafts
CREATE POLICY "Users can view prose_drafts in own projects"
  ON prose_drafts FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can create prose_drafts in own projects"
  ON prose_drafts FOR INSERT
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can update prose_drafts in own projects"
  ON prose_drafts FOR UPDATE
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete prose_drafts in own projects"
  ON prose_drafts FOR DELETE
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- Style Profiles
CREATE POLICY "Users can view style_profiles in own projects"
  ON style_profiles FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can create style_profiles in own projects"
  ON style_profiles FOR INSERT
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can update style_profiles in own projects"
  ON style_profiles FOR UPDATE
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete style_profiles in own projects"
  ON style_profiles FOR DELETE
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- Issues
CREATE POLICY "Users can view issues in own projects"
  ON issues FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can create issues in own projects"
  ON issues FOR INSERT
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can update issues in own projects"
  ON issues FOR UPDATE
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete issues in own projects"
  ON issues FOR DELETE
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
