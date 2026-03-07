-- Fix RLS policies for student_violations table
-- The admin defaulters page is failing because there's no SELECT policy for admins/managers

-- Enable RLS if not already enabled
ALTER TABLE student_violations ENABLE ROW LEVEL SECURITY;

-- Drop any conflicting policies
DROP POLICY IF EXISTS "Admins can view violations" ON student_violations;
DROP POLICY IF EXISTS "Managers can view violations" ON student_violations;
DROP POLICY IF EXISTS "Students can view own violations" ON student_violations;
DROP POLICY IF EXISTS "Admins and managers can manage violations" ON student_violations;

-- Allow admins and managers full access
CREATE POLICY "Admins and managers can manage violations"
ON student_violations FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'manager', 'superuser')
    )
);

-- Allow students to view only their own violations
CREATE POLICY "Students can view own violations"
ON student_violations FOR SELECT
USING (auth.uid() = student_id);
