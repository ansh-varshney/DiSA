-- ============================================
-- STEP 3: Recreate enum with only the values we want
-- ============================================
-- Run this THIRD (after step 2 completes)
-- This removes the old unused enum values (excellent, needs_maintenance)

-- Drop the existing default first
ALTER TABLE courts ALTER COLUMN condition DROP DEFAULT;

-- Create new enum with only the values we want
CREATE TYPE court_condition_new AS ENUM ('good', 'minor_damage', 'damaged');

-- Change the column to use the new type
ALTER TABLE courts 
ALTER COLUMN condition TYPE court_condition_new 
USING condition::text::court_condition_new;

-- Drop the old type
DROP TYPE court_condition;

-- Rename the new type to the original name
ALTER TYPE court_condition_new RENAME TO court_condition;

-- Set the new default value
ALTER TABLE courts ALTER COLUMN condition SET DEFAULT 'good'::court_condition;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Step 3 complete: Court condition enum migration finished!';
  RAISE NOTICE 'Final enum values: good, minor_damage, damaged';
  RAISE NOTICE 'Default value set to: good';
END $$;
