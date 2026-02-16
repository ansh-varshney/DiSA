-- ============================================
-- Add Pictures and Notes to Equipment Table
-- ============================================

-- Add new fields to equipment table
ALTER TABLE public.equipment 
ADD COLUMN IF NOT EXISTS pictures TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';

-- Verify changes
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'equipment' 
AND column_name IN ('pictures', 'notes', 'usage_count', 'expected_lifespan_days');

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Equipment table updated with pictures and notes fields!';
END $$;
