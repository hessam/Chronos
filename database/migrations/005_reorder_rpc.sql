-- ============================================================
-- Chronos: Database Schema
-- Migration 005 - Reorder RPC Function
-- ============================================================

-- Function to batch update entity sort orders
-- Used to avoid complex RLS/Constraint issues with UPSERT on partial data
CREATE OR REPLACE FUNCTION reorder_entities(updates JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER -- Ensures the function runs with the permissions of the user (respecting RLS)
AS $$
DECLARE
  item JSONB;
BEGIN
  -- Iterate through the JSON array
  FOR item IN SELECT * FROM jsonb_array_elements(updates)
  LOOP
    -- Update the specific entity
    -- RLS will automatically filter out entities the user cannot update
    UPDATE entities
    SET sort_order = (item->>'sort_order')::INTEGER,
        updated_at = NOW()
    WHERE id = (item->>'id')::UUID;
  END LOOP;
END;
$$;
