-- ============================================
-- Add 'superuser' to user_role enum
-- ============================================
-- This script adds the 'superuser' value to the user_role enum type
-- and then updates your account to use it.

-- Step 1: Add 'superuser' to the enum type
-- This is a one-time operation and cannot be undone easily
ALTER TYPE user_role ADD VALUE 'superuser';

-- Step 2: Verify the enum now includes 'superuser'
SELECT enumlabel 
FROM pg_enum 
WHERE enumtypid = 'user_role'::regtype 
ORDER BY enumsortorder;

-- Step 3: Update your account to superuser role
UPDATE public.profiles 
SET role = 'superuser'
WHERE email = 'varshney.ansh04@gmail.com';

-- Step 4: Verify the change worked
SELECT id, full_name, email, role, student_id 
FROM public.profiles 
WHERE email = 'varshney.ansh04@gmail.com';

-- ============================================
-- Expected Output:
-- ============================================
-- After Step 2, you should see:
--   - student
--   - manager
--   - admin
--   - superuser
--
-- After Step 4, you should see:
--   role = 'superuser'
--
-- ============================================
-- What This Does:
-- ============================================
-- 1. Adds 'superuser' as a permanent allowed value in the user_role enum
-- 2. Sets your account role to 'superuser'
-- 3. You'll be able to access all three portals (student, manager, admin)
-- 4. This change affects the database schema permanently
-- 5. Other users can also be set to 'superuser' in the future if needed
