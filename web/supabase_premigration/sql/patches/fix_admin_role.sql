-- Quick fix: Update your profile to admin role
-- Run this in Supabase SQL Editor

-- Update the specific user to admin
UPDATE public.profiles 
SET role = 'admin'
WHERE id = '269ff854-2a13-43ea-b723-79b0a04c8fda';

-- Verify the change
SELECT id, full_name, email, role, student_id 
FROM public.profiles 
WHERE id = '269ff854-2a13-43ea-b723-79b0a04c8fda';
