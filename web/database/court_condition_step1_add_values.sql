-- ============================================
-- STEP 1: Add new enum values to court_condition
-- ============================================
-- Run this FIRST and let it commit before running step 2

-- Add 'minor_damage' if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'minor_damage' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'court_condition')
    ) THEN
        ALTER TYPE court_condition ADD VALUE 'minor_damage';
    END IF;
END $$;

-- Add 'damaged' if it doesn't exist  
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'damaged' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'court_condition')
    ) THEN
        ALTER TYPE court_condition ADD VALUE 'damaged';
    END IF;
END $$;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Step 1 complete: Added minor_damage and damaged to court_condition enum';
  RAISE NOTICE 'WAIT for this to commit, then run step 2!';
END $$;
