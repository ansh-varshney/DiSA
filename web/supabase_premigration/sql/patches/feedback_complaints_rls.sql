-- Allow admins and managers to delete feedback_complaints entries
-- Run this in Supabase SQL editor if the X delete button still doesn't work

-- First enable RLS if not already enabled
ALTER TABLE feedback_complaints ENABLE ROW LEVEL SECURITY;

-- Drop any existing delete policy to avoid conflicts
DROP POLICY IF EXISTS "Admins can delete feedback" ON feedback_complaints;
DROP POLICY IF EXISTS "Managers can delete feedback" ON feedback_complaints;

-- Allow anyone who created the entry to delete it (managers file emergency stops under their user ID)
CREATE POLICY "Author can delete feedback"
ON feedback_complaints FOR DELETE
USING (auth.uid() = student_id);

-- Allow admins and managers to delete any feedback
CREATE POLICY "Admins and managers can delete feedback"
ON feedback_complaints FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'manager', 'superuser')
    )
);
