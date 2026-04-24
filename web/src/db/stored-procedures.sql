-- ============================================================================
-- Campus Play — Stored Procedures
-- Run this ONCE after the Drizzle migration has created all tables.
-- Command: psql -U campus_play_user -d campus_play -f src/db/stored-procedures.sql
-- ============================================================================

-- ─── 1. Atomically adjust a student's points ─────────────────────────────────
CREATE OR REPLACE FUNCTION update_student_points(p_student_id UUID, p_delta INTEGER)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE profiles
  SET points = COALESCE(points, 0) + p_delta
  WHERE id = p_student_id
    AND role = 'student';
END;
$$;

-- ─── 2. Monthly points reset + top-5 priority booking awards ─────────────────
CREATE OR REPLACE FUNCTION reset_monthly_points()
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  v_count       INTEGER;
  v_top5_ids    UUID[];
  v_needs_reset BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM profiles
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

  SELECT ARRAY_AGG(id)
  INTO v_top5_ids
  FROM (
    SELECT id
    FROM profiles
    WHERE role = 'student'
    ORDER BY COALESCE(points, 0) DESC
    LIMIT 5
  ) sub;

  IF v_top5_ids IS NOT NULL THEN
    UPDATE profiles
    SET priority_booking_remaining = 1
    WHERE id = ANY(v_top5_ids);
  END IF;

  UPDATE profiles
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

-- ─── 3. Check late violations and apply 14-day ban if >= 3 ───────────────────
CREATE OR REPLACE FUNCTION check_and_apply_late_ban(p_student_id UUID)
RETURNS TIMESTAMP WITH TIME ZONE
LANGUAGE plpgsql
AS $$
DECLARE
  v_late_count   INTEGER;
  v_banned_until TIMESTAMP WITH TIME ZONE;
BEGIN
  SELECT COUNT(*) INTO v_late_count
  FROM student_violations
  WHERE student_id     = p_student_id
    AND violation_type = 'students_late';

  IF v_late_count >= 3 THEN
    UPDATE profiles
    SET banned_until = NOW() + INTERVAL '14 days'
    WHERE id = p_student_id
      AND (banned_until IS NULL OR banned_until < NOW() + INTERVAL '14 days')
    RETURNING banned_until INTO v_banned_until;

    IF v_banned_until IS NULL THEN
      SELECT banned_until INTO v_banned_until
      FROM profiles
      WHERE id = p_student_id;
    END IF;
  END IF;

  RETURN v_banned_until;
END;
$$;

-- ─── 4. Admin clear: wipe all violations and lift ban ────────────────────────
CREATE OR REPLACE FUNCTION clear_student_defaulter(p_student_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM student_violations
  WHERE student_id = p_student_id;

  UPDATE profiles
  SET banned_until = NULL
  WHERE id = p_student_id;
END;
$$;

-- ─── 5. Trigger: increment court usage count on booking completion ────────────
CREATE OR REPLACE FUNCTION increment_court_usage()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    UPDATE courts
    SET usage_count = usage_count + 1
    WHERE id = NEW.court_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_completed_trigger ON bookings;
CREATE TRIGGER booking_completed_trigger
  AFTER UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION increment_court_usage();

-- ─── 6. Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_banned_until
  ON profiles(banned_until) WHERE banned_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_violations_student_type
  ON student_violations(student_id, violation_type);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient
  ON notifications(recipient_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications(recipient_id, created_at DESC)
  WHERE is_read = FALSE;

CREATE INDEX IF NOT EXISTS idx_play_requests_recipient
  ON play_requests(recipient_id, status);

CREATE INDEX IF NOT EXISTS idx_play_requests_booking
  ON play_requests(booking_id);

CREATE INDEX IF NOT EXISTS idx_feedback_category
  ON feedback_complaints(category);

CREATE INDEX IF NOT EXISTS idx_courts_sport
  ON courts(sport);

CREATE INDEX IF NOT EXISTS idx_equipment_sport
  ON equipment(sport);
