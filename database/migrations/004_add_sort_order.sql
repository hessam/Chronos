-- ============================================================
-- Chronos: Database Schema
-- Migration 004 - Add Sort Order to Entities
-- ============================================================

-- Add sort_order column to entities table
ALTER TABLE entities
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Create index for faster sorting
CREATE INDEX IF NOT EXISTS idx_entities_sort_order ON entities(sort_order);
