-- ============================================
-- Enable Superuser Role for Testing
-- ============================================
-- This script sets your account to "superuser" role
-- which allows access to all three portals (student, manager, admin)
-- for testing purposes.

-- Update your account to superuser
UPDATE public.profiles 
SET role = 'superuser'
WHERE email = 'varshney.ansh04@gmail.com';

-- Verify the change
SELECT id, full_name, email, role, student_id 
FROM public.profiles 
WHERE email = 'varshney.ansh04@gmail.com';

-- ============================================
-- What This Does:
-- ============================================
-- 1. Sets your role to "superuser"
-- 2. Home page will show you a portal selector
-- 3. You can click any portal (Student, Manager, Admin)
-- 4. All three layouts allow "superuser" access
-- 5. Regular users are unaffected - only your account

-- ============================================
-- To Switch Back to a Specific Role:
-- ============================================
-- Run ONE of these commands:

-- To become a student:
-- UPDATE public.profiles SET role = 'student' WHERE email = 'varshney.ansh04@gmail.com';

-- To become a manager:
-- UPDATE public.profiles SET role = 'manager' WHERE email = 'varshney.ansh04@gmail.com';

-- To become an admin:
-- UPDATE public.profiles SET role = 'admin' WHERE email = 'varshney.ansh04@gmail.com';

