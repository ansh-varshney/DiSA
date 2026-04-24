-- ============================================
-- STEP 2: Update your account to superuser
-- ============================================
-- Run this script ONLY AFTER step1 completed successfully
-- DO NOT run this before step 1 finishes

-- Update your account to superuser role
UPDATE public.profiles 
SET role = 'superuser'
WHERE email = 'varshney.ansh04@gmail.com';

-- Verify the change worked
SELECT id, full_name, email, role, student_id 
FROM public.profiles 
WHERE email = 'varshney.ansh04@gmail.com';

-- ============================================
-- Expected Output:
-- ============================================
-- You should see your profile with:
--   role = 'superuser'
--
-- ============================================
-- Final Step:
-- ============================================
-- 1. Log out of your application
-- 2. Clear browser cache or use incognito mode
-- 3. Log back in
-- 4. You should see a portal selector on the home page
-- 5. You can now access all three portals!
