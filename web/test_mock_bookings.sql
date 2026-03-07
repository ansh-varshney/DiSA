-- ============================================================================
-- MOCK BOOKINGS FOR TESTING (with equipment, 5-min timer)
-- Paste this into Supabase SQL Editor and run it.
--
-- TO CLEAN UP: Run the cleanup section at the bottom of this file.
-- ============================================================================

-- Add a notes column if it doesn't exist (safe, no-op if already present)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS notes text;

DO $$
DECLARE
    v_student_id uuid;
    v_court_ids uuid[];
    v_equip_ids uuid[];
    v_now timestamptz := now();
    v_start timestamptz := v_now;
    v_end timestamptz := v_now + interval '2 minutes';
    v_court_id uuid;
    v_eq1 uuid;
    v_eq2 uuid;
    v_i int;
    v_num_courts int;
    v_num_equip int;
BEGIN
    -- 1. Pick a student user
    SELECT id INTO v_student_id
    FROM profiles
    WHERE role = 'student'
    LIMIT 1;

    IF v_student_id IS NULL THEN
        RAISE EXCEPTION 'No student profile found in the database';
    END IF;

    -- 2. Pick up to 4 courts
    SELECT array_agg(id) INTO v_court_ids
    FROM (
        SELECT id FROM courts LIMIT 4
    ) sub;

    v_num_courts := coalesce(array_length(v_court_ids, 1), 0);
    IF v_num_courts < 1 THEN
        RAISE EXCEPTION 'No courts found in the database';
    END IF;

    -- 3. Pick up to 8 equipment items (2 per booking)
    SELECT array_agg(id) INTO v_equip_ids
    FROM (
        SELECT id FROM equipment WHERE is_available = true LIMIT 8
    ) sub;

    v_num_equip := coalesce(array_length(v_equip_ids, 1), 0);

    -- 4. Mark picked equipment as unavailable (simulates real booking)
    IF v_num_equip > 0 THEN
        UPDATE equipment SET is_available = false WHERE id = ANY(v_equip_ids);
    END IF;

    -- 5. Insert one active booking per court with 2 equipment each
    FOR v_i IN 1..v_num_courts LOOP
        v_court_id := v_court_ids[v_i];

        v_eq1 := NULL;
        v_eq2 := NULL;
        IF v_num_equip >= (v_i * 2 - 1) THEN
            v_eq1 := v_equip_ids[v_i * 2 - 1];
        END IF;
        IF v_num_equip >= (v_i * 2) THEN
            v_eq2 := v_equip_ids[v_i * 2];
        END IF;

        INSERT INTO bookings (
            user_id,
            court_id,
            start_time,
            end_time,
            status,
            players_list,
            equipment_ids,
            notes
        ) VALUES (
            v_student_id,
            v_court_id,
            v_start,
            v_end,
            'active',
            jsonb_build_array(v_student_id::text),
            ARRAY_REMOVE(ARRAY[v_eq1, v_eq2], NULL),
            '__MOCK_TEST_BOOKING__'
        );
    END LOOP;

    RAISE NOTICE 'Created % mock active bookings for student % ending at % (5 min from now)',
        v_num_courts, v_student_id, v_end;
    RAISE NOTICE 'Assigned % equipment items (marked unavailable)', v_num_equip;
END $$;

-- Verify:
SELECT
    b.id,
    c.name AS court_name,
    c.sport,
    b.start_time,
    b.end_time,
    b.status,
    b.equipment_ids,
    b.notes
FROM bookings b
JOIN courts c ON c.id = b.court_id
WHERE b.notes = '__MOCK_TEST_BOOKING__'
ORDER BY b.created_at DESC;


-- ============================================================================
-- CLEANUP: Run this AFTER testing to remove mock bookings + free equipment.
-- ============================================================================
/*
UPDATE equipment SET is_available = true
WHERE id IN (
    SELECT unnest(equipment_ids) FROM bookings WHERE notes = '__MOCK_TEST_BOOKING__'
);
DELETE FROM bookings WHERE notes = '__MOCK_TEST_BOOKING__';
*/
