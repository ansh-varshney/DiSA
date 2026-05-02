-- ============================================
-- CampusPlay Points & Ban System Migration
-- Run this in Supabase SQL Editor AFTER
-- 01_base_schema.sql and 02_admin_schema_extension.sql
-- ============================================

-- ─── 1. Profile column additions ─────────────────────────────────────────────

-- gender and year (may already exist from prior migration, safe with IF NOT EXISTS)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS year TEXT;

-- banned_until: set when a student accumulates 3 late-arrival violations
-- Null means not banned.  Non-null and future means currently banned.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banned_until TIMESTAMP WITH TIME ZONE;

-- last_points_reset: tracks when points were last zeroed for this student
-- Lets us auto-reset at the start of every new month without a cron job.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_points_reset DATE;

-- ─── 2. RLS: let admins update any profile ───────────────────────────────────
-- The existing policy only lets a user update their own row.
-- Admins need to be able to update banned_until and points on any student.
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile"
ON public.profiles FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p2
    WHERE p2.id = auth.uid()
      AND p2.role IN ('admin', 'superuser', 'manager')
  )
);

-- ─── 3. Atomic points update RPC ─────────────────────────────────────────────
-- Avoids read-modify-write races when multiple manager actions happen quickly.
CREATE OR REPLACE FUNCTION update_student_points(p_student_id UUID, p_delta INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profiles
  SET points = COALESCE(points, 0) + p_delta
  WHERE id = p_student_id
    AND role = 'student';
END;
$$;

-- ─── 4. Monthly points reset RPC ─────────────────────────────────────────────
-- Resets points to 0 for every student that hasn't been reset this calendar month.
-- Idempotent: calling it multiple times in the same month is safe.
-- Returns the number of students whose points were reset.
CREATE OR REPLACE FUNCTION reset_monthly_points()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.profiles
  SET points           = 0,
      last_points_reset = CURRENT_DATE
  WHERE role = 'student'
    AND (
      last_points_reset IS NULL
      OR last_points_reset < DATE_TRUNC('month', CURRENT_DATE)::date
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ─── 5. Late-ban check RPC ───────────────────────────────────────────────────
-- Called after every 'students_late' violation is inserted.
-- If the student now has >= 3 such violations, applies a 14-day booking ban.
-- Returns TRUE if the ban was (re)applied, FALSE otherwise.
CREATE OR REPLACE FUNCTION check_and_apply_late_ban(p_student_id UUID)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_late_count integer;
  v_banned     boolean := false;
BEGIN
  SELECT COUNT(*) INTO v_late_count
  FROM public.student_violations
  WHERE student_id    = p_student_id
    AND violation_type = 'students_late';

  IF v_late_count >= 3 THEN
    UPDATE public.profiles
    SET banned_until = NOW() + INTERVAL '14 days'
    WHERE id = p_student_id
      -- Only extend the ban, never shorten an existing one
      AND (banned_until IS NULL OR banned_until < NOW() + INTERVAL '14 days');

    v_banned := true;
  END IF;

  RETURN v_banned;
END;
$$;

-- ─── 6. Clear defaulter RPC ──────────────────────────────────────────────────
-- Admin "clear" action: wipes all violations and lifts any active ban.
CREATE OR REPLACE FUNCTION clear_student_defaulter(p_student_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.student_violations
  WHERE student_id = p_student_id;

  UPDATE public.profiles
  SET banned_until = NULL
  WHERE id = p_student_id;
END;
$$;

-- ─── 7. Indexes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_banned_until
  ON public.profiles(banned_until)
  WHERE banned_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_violations_type
  ON public.student_violations(violation_type);

CREATE INDEX IF NOT EXISTS idx_violations_student_type
  ON public.student_violations(student_id, violation_type);

-- ─── Done ─────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE '✓ Points & Ban System migration applied successfully.';
  RAISE NOTICE '  New columns  : profiles.banned_until, profiles.last_points_reset, profiles.gender, profiles.year';
  RAISE NOTICE '  New RPCs     : update_student_points, reset_monthly_points, check_and_apply_late_ban, clear_student_defaulter';
  RAISE NOTICE '  New indexes  : idx_profiles_banned_until, idx_violations_type, idx_violations_student_type';
END $$;
