-- ============================================
-- Court Management Database Updates
-- ============================================

-- 1. Add court_id column for auto-generated IDs
ALTER TABLE courts
ADD COLUMN IF NOT EXISTS court_id TEXT;

-- 2. Add pictures column for image storage
ALTER TABLE courts
ADD COLUMN IF NOT EXISTS pictures TEXT[];

-- 3. Add notes column
ALTER TABLE courts
ADD COLUMN IF NOT EXISTS notes TEXT;

-- 4. Create unique constraint on court_id
ALTER TABLE courts
ADD CONSTRAINT unique_court_id UNIQUE (court_id);

-- 5. Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_court_id ON courts(court_id);

-- 6. Verify/update maintenance fields
-- (last_maintenance_date should already exist, adding next_check_date)
ALTER TABLE courts
ADD COLUMN IF NOT EXISTS next_check_date DATE;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Court management schema updated!';
  RAISE NOTICE 'Added: court_id, pictures, notes, next_check_date';
END $$;
