-- ============================================
-- Migration: Add gender and year fields to profiles
-- Run this in your Supabase SQL Editor
-- ============================================

-- Add gender column (Male, Female, Other, Prefer not to say)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender TEXT;

-- Add academic year column (1st Year, 2nd Year, 3rd Year, 4th Year, 5th Year+, PG, PhD)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS year TEXT;

-- Optional: Add a comment for documentation
COMMENT ON COLUMN public.profiles.gender IS 'Student gender: Male, Female, Other, Prefer not to say';
COMMENT ON COLUMN public.profiles.year IS 'Academic year: 1st Year, 2nd Year, 3rd Year, 4th Year, 5th Year+, PG, PhD';
