-- ============================================================
-- Chronos: Migration 003 - Add 'chapter' entity type
-- Supports Chapter Assembler (Feature 5)
-- ============================================================

-- Drop the existing CHECK constraint and recreate with 'chapter' included
ALTER TABLE entities DROP CONSTRAINT IF EXISTS entities_entity_type_check;
ALTER TABLE entities ADD CONSTRAINT entities_entity_type_check 
  CHECK (entity_type IN ('character', 'timeline', 'event', 'arc', 'theme', 'location', 'note', 'chapter'));
