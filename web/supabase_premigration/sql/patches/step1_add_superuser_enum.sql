-- ============================================
-- STEP 1: Add 'superuser' to user_role enum
-- ============================================
-- Run this script FIRST, then wait for it to complete
-- DO NOT run step 2 until this completes successfully

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'superuser';

-- Verify the enum now includes 'superuser'
SELECT enumlabel 
FROM pg_enum 
WHERE enumtypid = 'user_role'::regtype 
ORDER BY enumsortorder;

-- ============================================
-- Expected Output:
-- ============================================
-- You should see a list containing:
--   student
--   manager
--   admin
--   superuser
--
-- ============================================
-- Next Step:
-- ============================================
-- After this completes successfully, run:
-- step2_update_to_superuser.sql
