-- ============================================
-- Update ALL RLS Policies for Superuser Support
-- ============================================
-- This script updates all admin-only RLS policies to also allow 'superuser' role
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. Equipment Table
-- ============================================
DROP POLICY IF EXISTS "Only admins can modify equipment" ON public.equipment;

CREATE POLICY "Admins and superusers can modify equipment" 
ON public.equipment FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() 
    AND (profiles.role = 'admin' OR profiles.role = 'superuser')
  )
);

-- ============================================
-- 2. Courts Table
-- ============================================
DROP POLICY IF EXISTS "Only admins can insert/update/delete courts" ON public.courts;
DROP POLICY IF EXISTS "Only Admins can modify courts" ON public.courts;

CREATE POLICY "Admins and superusers can modify courts" 
ON public.courts FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() 
    AND (profiles.role = 'admin' OR profiles.role = 'superuser')
  )
);

-- ============================================
-- 3. Student Violations Table
-- ============================================
DROP POLICY IF EXISTS "Only admins can update/delete violations" ON public.student_violations;

CREATE POLICY "Admins and superusers can update/delete violations" 
ON public.student_violations FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() 
    AND (profiles.role = 'admin' OR profiles.role = 'superuser')
  )
);

-- ============================================
-- 4. Feedback & Complaints Table
-- ============================================
DROP POLICY IF EXISTS "Admins can view all feedback" ON public.feedback_complaints;
DROP POLICY IF EXISTS "Admins can update feedback status" ON public.feedback_complaints;

CREATE POLICY "Admins and superusers can view all feedback" 
ON public.feedback_complaints FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() 
    AND (profiles.role = 'admin' OR profiles.role = 'superuser')
  )
);

CREATE POLICY "Admins and superusers can update feedback status" 
ON public.feedback_complaints FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() 
    AND (profiles.role = 'admin' OR profiles.role = 'superuser')
  )
);

-- ============================================
-- 5. Coordinators Table
-- ============================================
DROP POLICY IF EXISTS "Only admins can manage coordinators" ON public.coordinators;

CREATE POLICY "Admins and superusers can manage coordinators" 
ON public.coordinators FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() 
    AND (profiles.role = 'admin' OR profiles.role = 'superuser')
  )
);

-- ============================================
-- 6. Announcements Table
-- ============================================
DROP POLICY IF EXISTS "Only admins can create announcements" ON public.announcements;
DROP POLICY IF EXISTS "Only admins can update/delete announcements" ON public.announcements;

CREATE POLICY "Admins and superusers can create announcements" 
ON public.announcements FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() 
    AND (profiles.role = 'admin' OR profiles.role = 'superuser')
  )
);

CREATE POLICY "Admins and superusers can update/delete announcements" 
ON public.announcements FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() 
    AND (profiles.role = 'admin' OR profiles.role = 'superuser')
  )
);

-- ============================================
-- Verification
-- ============================================
SELECT tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public'
AND tablename IN ('equipment', 'courts', 'student_violations', 'feedback_complaints', 'coordinators', 'announcements')
ORDER BY tablename, policyname;

-- ============================================
-- SUCCESS!
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '✅ All RLS policies updated to support superuser role!';
END $$;
