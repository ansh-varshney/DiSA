-- ============================================
-- Admin Schema Extensions for DiSA
-- ============================================
-- Run this in your Supabase SQL Editor after the main supa_schema.sql
-- This extends the database with tables needed for admin workflows

-- ============================================
-- 1. New Enum Types
-- ============================================

CREATE TYPE court_condition AS ENUM ('excellent', 'good', 'needs_maintenance');
CREATE TYPE violation_severity AS ENUM ('minor', 'moderate', 'severe');
CREATE TYPE complaint_status AS ENUM ('open', 'in_progress', 'resolved');

-- ============================================
-- 2. Equipment Table Extensions
-- ============================================

-- Add vendor and cost tracking fields to existing equipment table
ALTER TABLE public.equipment 
ADD COLUMN IF NOT EXISTS vendor_name TEXT,
ADD COLUMN IF NOT EXISTS cost DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS purchase_date DATE,
ADD COLUMN IF NOT EXISTS expected_lifespan_days INTEGER DEFAULT 365;

-- Add admin-only modification policy for equipment
CREATE POLICY "Only admins can modify equipment" 
ON public.equipment FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);

-- ============================================
-- 3. Courts Table Extensions
-- ============================================

-- Add condition and maintenance tracking fields
ALTER TABLE public.courts 
ADD COLUMN IF NOT EXISTS condition court_condition DEFAULT 'good',
ADD COLUMN IF NOT EXISTS last_maintenance_date DATE,
ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0;

-- Update existing policy name for clarity (drop old, create new)
DROP POLICY IF EXISTS "Only Admins can modify courts" ON public.courts;
CREATE POLICY "Only admins can insert/update/delete courts" 
ON public.courts 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);

-- ============================================
-- 4. Student Violations Table
-- ============================================

CREATE TABLE IF NOT EXISTS public.student_violations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  violation_type TEXT NOT NULL, -- 'late_arrival', 'equipment_damage', 'no_show', etc.
  severity violation_severity DEFAULT 'minor',
  reason TEXT NOT NULL,
  reported_by UUID REFERENCES public.profiles(id), -- Manager or System (NULL = system)
  points_deducted INTEGER DEFAULT 0,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL, -- Related booking if applicable
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.student_violations ENABLE ROW LEVEL SECURITY;

-- Policies: Everyone can view, only admins/managers can insert
CREATE POLICY "Violations viewable by all authenticated users" 
ON public.student_violations FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Only admins and managers can create violations" 
ON public.student_violations FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() 
    AND profiles.role IN ('admin', 'manager')
  )
);

CREATE POLICY "Only admins can update/delete violations" 
ON public.student_violations FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);

-- ============================================
-- 5. Feedback & Complaints Table
-- ============================================

CREATE TABLE IF NOT EXISTS public.feedback_complaints (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status complaint_status DEFAULT 'open',
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- Admin who resolved it
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.feedback_complaints ENABLE ROW LEVEL SECURITY;

-- Policies: Students can create and view their own, admins can view/update all
CREATE POLICY "Students can create feedback" 
ON public.feedback_complaints FOR INSERT 
WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Students can view their own feedback" 
ON public.feedback_complaints FOR SELECT 
USING (auth.uid() = student_id);

CREATE POLICY "Admins can view all feedback" 
ON public.feedback_complaints FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);

CREATE POLICY "Admins can update feedback status" 
ON public.feedback_complaints FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);

-- ============================================
-- 6. Coordinators Table
-- ============================================

CREATE TABLE IF NOT EXISTS public.coordinators (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL, -- 'Coach', 'Team Captain', 'Assistant Coach'
  sport TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.coordinators ENABLE ROW LEVEL SECURITY;

-- Policies: Everyone can view, only admins can modify
CREATE POLICY "Coordinators viewable by all" 
ON public.coordinators FOR SELECT 
USING (true);

CREATE POLICY "Only admins can manage coordinators" 
ON public.coordinators FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);

-- ============================================
-- 7. Announcements Policies Enhancement
-- ============================================

-- Add admin-only modification policy for announcements
CREATE POLICY "Only admins can create announcements" 
ON public.announcements FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);

CREATE POLICY "Only admins can update/delete announcements" 
ON public.announcements FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);

-- ============================================
-- 8. Indexes for Performance
-- ============================================

-- Violations indexes
CREATE INDEX IF NOT EXISTS idx_violations_student ON public.student_violations(student_id);
CREATE INDEX IF NOT EXISTS idx_violations_created ON public.student_violations(created_at DESC);

-- Feedback indexes
CREATE INDEX IF NOT EXISTS idx_feedback_student ON public.feedback_complaints(student_id);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON public.feedback_complaints(status);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON public.feedback_complaints(created_at DESC);

-- Coordinators indexes
CREATE INDEX IF NOT EXISTS idx_coordinators_sport ON public.coordinators(sport);

-- Courts indexes (for new fields)
CREATE INDEX IF NOT EXISTS idx_courts_sport ON public.courts(sport);
CREATE INDEX IF NOT EXISTS idx_courts_condition ON public.courts(condition);

-- Equipment indexes (for new fields)
CREATE INDEX IF NOT EXISTS idx_equipment_sport ON public.equipment(sport);
CREATE INDEX IF NOT EXISTS idx_equipment_condition ON public.equipment(condition);

-- ============================================
-- 9. Triggers for Automatic Updates
-- ============================================

-- Trigger to increment court usage_count when booking is completed
CREATE OR REPLACE FUNCTION increment_court_usage() 
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    UPDATE public.courts 
    SET usage_count = usage_count + 1 
    WHERE id = NEW.court_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS booking_completed_trigger ON public.bookings;
CREATE TRIGGER booking_completed_trigger
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION increment_court_usage();

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE 'Admin schema extensions applied successfully!';
  RAISE NOTICE 'New tables: student_violations, feedback_complaints, coordinators';
  RAISE NOTICE 'Extended tables: equipment, courts';
  RAISE NOTICE 'All RLS policies configured for admin-only access';
END $$;
