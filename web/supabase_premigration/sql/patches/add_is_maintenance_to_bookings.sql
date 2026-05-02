-- Add is_maintenance column to bookings table
-- This allows admin to reserve slots for court maintenance

ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS is_maintenance BOOLEAN DEFAULT FALSE;

-- Update existing bookings to be non-maintenance
UPDATE bookings 
SET is_maintenance = FALSE 
WHERE is_maintenance IS NULL;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Added is_maintenance column to bookings table';
  RAISE NOTICE 'All existing bookings marked as non-maintenance (is_maintenance = false)';
END $$;
