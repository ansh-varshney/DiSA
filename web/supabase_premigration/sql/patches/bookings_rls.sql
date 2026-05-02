-- Fix RLS for bookings table so admins/managers can read all bookings (needed for Booking Logs page)
-- Run this in the Supabase SQL editor

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Drop conflicting policies if they exist
DROP POLICY IF EXISTS "Admins can view all bookings" ON bookings;
DROP POLICY IF EXISTS "Admins and managers can view all bookings" ON bookings;

-- Admins and managers can read all bookings
CREATE POLICY "Admins and managers can view all bookings"
ON bookings FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'manager', 'superuser')
    )
);

-- Students can only see their own bookings (existing behaviour)
DROP POLICY IF EXISTS "Students can view own bookings" ON bookings;
CREATE POLICY "Students can view own bookings"
ON bookings FOR SELECT
USING (auth.uid() = user_id);
