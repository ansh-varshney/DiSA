-- Add category column to feedback_complaints table
-- Supports: general, emergency_by_manager, lost_equipment

ALTER TABLE feedback_complaints
ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'general';

-- Add booking_id reference for traceability
ALTER TABLE feedback_complaints
ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL;

-- Create index for fast category filtering
CREATE INDEX IF NOT EXISTS idx_feedback_complaints_category
    ON feedback_complaints(category);

-- Update any existing rows to have 'general' category
UPDATE feedback_complaints SET category = 'general' WHERE category IS NULL;
