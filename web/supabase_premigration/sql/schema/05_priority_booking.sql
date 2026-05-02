-- ============================================
-- CampusPlay Priority Booking & RPC Updates
-- Run AFTER 03_points_ban_system.sql
-- ============================================

-- ─── 1. Profile column ───────────────────────────────────────────────────────
-- Tracks how many 90-min priority bookings a student can still make this month.
-- Set to 1 for the top-5 leaderboard students on each monthly reset; consumed
-- to 0 when they actually use the 90-min slot.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS priority_booking_remaining INTEGER DEFAULT 0;

-- ─── 2. reset_monthly_points (updated) ───────────────────────────────────────
-- Changes from v1:
--   • Snapshots the top-5 students by points BEFORE zeroing (awards priority bookings)
--   • Returns JSON { reset_count, top5_ids } so the app layer can send notifications
--     to the recipients.  Return type changed from integer → json.
CREATE OR REPLACE FUNCTION reset_monthly_points()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count       INTEGER;
  v_top5_ids    UUID[];
  v_needs_reset BOOLEAN;
BEGIN
  -- Early-exit: if every student was already reset this calendar month, do nothing.
  SELECT EXISTS(
    SELECT 1 FROM public.profiles
    WHERE role = 'student'
      AND (
        last_points_reset IS NULL
        OR last_points_reset < DATE_TRUNC('month', CURRENT_DATE)::date
      )
    LIMIT 1
  ) INTO v_needs_reset;

  IF NOT v_needs_reset THEN
    RETURN json_build_object('reset_count', 0, 'top5_ids', '[]'::json);
  END IF;

  -- Snapshot the top 5 before zeroing their scores
  SELECT ARRAY_AGG(id)
  INTO v_top5_ids
  FROM (
    SELECT id
    FROM public.profiles
    WHERE role = 'student'
    ORDER BY COALESCE(points, 0) DESC
    LIMIT 5
  ) sub;

  -- Award one 90-min priority booking slot to the top 5
  IF v_top5_ids IS NOT NULL THEN
    UPDATE public.profiles
    SET priority_booking_remaining = 1
    WHERE id = ANY(v_top5_ids);
  END IF;

  -- Reset all students who have not yet been reset this month
  UPDATE public.profiles
  SET points            = 0,
      last_points_reset = CURRENT_DATE
  WHERE role = 'student'
    AND (
      last_points_reset IS NULL
      OR last_points_reset < DATE_TRUNC('month', CURRENT_DATE)::date
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN json_build_object(
    'reset_count', v_count,
    'top5_ids',    COALESCE(TO_JSON(v_top5_ids), '[]'::json)
  );
END;
$$;

-- ─── 3. check_and_apply_late_ban (updated) ───────────────────────────────────
-- Changes from v1:
--   • Return type changed from boolean → TIMESTAMP WITH TIME ZONE
--   • Returns the actual banned_until value from the DB so the application layer
--     uses the authoritative timestamp in notifications (not a locally-computed one).
--   • Returns NULL when no ban was applied (count < 3).
CREATE OR REPLACE FUNCTION check_and_apply_late_ban(p_student_id UUID)
RETURNS TIMESTAMP WITH TIME ZONE
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_late_count  INTEGER;
  v_banned_until TIMESTAMP WITH TIME ZONE;
BEGIN
  SELECT COUNT(*) INTO v_late_count
  FROM public.student_violations
  WHERE student_id     = p_student_id
    AND violation_type = 'students_late';

  IF v_late_count >= 3 THEN
    -- Only extend the ban, never shorten an existing one
    UPDATE public.profiles
    SET banned_until = NOW() + INTERVAL '14 days'
    WHERE id = p_student_id
      AND (banned_until IS NULL OR banned_until < NOW() + INTERVAL '14 days')
    RETURNING banned_until INTO v_banned_until;

    -- If the ban was already set to a later date (no row updated), read the current value
    IF v_banned_until IS NULL THEN
      SELECT banned_until INTO v_banned_until
      FROM public.profiles
      WHERE id = p_student_id;
    END IF;
  END IF;

  RETURN v_banned_until; -- NULL when no ban applies
END;
$$;

-- ─── Done ─────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE '✓ Priority Booking migration applied successfully.';
  RAISE NOTICE '  New column  : profiles.priority_booking_remaining';
  RAISE NOTICE '  Updated RPCs: reset_monthly_points (returns json), check_and_apply_late_ban (returns timestamptz)';
END $$;
