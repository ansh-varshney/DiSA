-- ============================================
-- STEP 2: Update existing court records to use new enum values
-- ============================================
-- Run this SECOND (after step 1 has committed)

-- Update courts that have 'needs_maintenance' to 'minor_damage'
UPDATE courts 
SET condition = 'minor_damage'
WHERE condition = 'needs_maintenance';

-- Update courts that have 'excellent' to 'good'  
UPDATE courts 
SET condition = 'good'
WHERE condition = 'excellent';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Step 2 complete: Updated existing court records';
  RAISE NOTICE 'Now run step 3 to clean up old enum values';
END $$;
