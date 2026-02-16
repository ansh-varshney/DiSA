-- ============================================
-- Check Admin Role Status
-- ============================================
-- This script checks the current logged-in user's role
-- and helps diagnose why admin redirect might not be working

-- Get YOUR user ID and role information
-- Replace 'YOUR_EMAIL@example.com' with the email you use to log in
SELECT 
    id as user_id,
    full_name,
    email,
    role,
    student_id,
    created_at,
    updated_at
FROM public.profiles
WHERE email = 'YOUR_EMAIL@example.com'; -- REPLACE THIS WITH YOUR EMAIL

-- Or if you know your user ID, use this:
-- SELECT 
--     id as user_id,
--     full_name,
--     email,
--     role,
--     student_id,
--     created_at,
--     updated_at
-- FROM public.profiles
-- WHERE id = 'YOUR-USER-ID-HERE';

-- ============================================
-- What to Look For:
-- ============================================
-- 1. Check the 'role' column in the results
-- 2. It should show 'admin' if you're supposed to be an admin
-- 3. If it shows 'student', 'manager', or NULL, that's the problem!
--
-- ============================================
-- If Your Role Is Wrong:
-- ============================================
-- Run this command to fix it (replace the email):
--
-- UPDATE public.profiles 
-- SET role = 'admin'
-- WHERE email = 'YOUR_EMAIL@example.com';
--
-- Then refresh your browser and try logging in again.
