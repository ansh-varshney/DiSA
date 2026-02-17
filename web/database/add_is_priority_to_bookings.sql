-- Add is_priority column to bookings table
-- This allows admin to create priority reservations

ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS is_priority BOOLEAN DEFAULT FALSE;

-- Update existing bookings to be non-priority
UPDATE bookings 
SET is_priority = FALSE 
WHERE is_priority IS NULL;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Added is_priority column to bookings table';
  RAISE NOTICE 'All existing bookings marked as non-priority (is_priority = false)';
END $$;
