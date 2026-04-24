-- Update court_condition enum to match equipment conditions
-- This script updates the court_condition enum values

-- First, we need to alter the enum type
-- Drop the old enum values and add new ones

-- Step 1: Add new enum values if they don't exist
DO $$ 
BEGIN
    -- Add 'minor_damage' if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'minor_damage' AND enumtypid = (
        SELECT oid FROM pg_type WHERE typname = 'court_condition'
    )) THEN
        ALTER TYPE court_condition ADD VALUE 'minor_damage';
    END IF;

    -- Add 'damaged' if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'damaged' AND enumtypid = (
        SELECT oid FROM pg_type WHERE typname = 'court_condition'
    )) THEN
        ALTER TYPE court_condition ADD VALUE 'damaged';
    END IF;
END $$;

-- Step 2: Update existing court records to use new values
UPDATE courts 
SET condition = 'minor_damage'
WHERE condition = 'needs_maintenance';

UPDATE courts 
SET condition = 'good'
WHERE condition = 'excellent';

-- Step 3: Remove old enum values (this requires recreating the enum)
-- Since we can't directly remove enum values in PostgreSQL, we'll create a new type
-- and migrate to it

-- Create new enum with correct values
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'court_condition_new') THEN
        CREATE TYPE court_condition_new AS ENUM ('good', 'minor_damage', 'damaged');
    END IF;
END $$;

-- Alter the column to use the new type
ALTER TABLE courts 
ALTER COLUMN condition TYPE court_condition_new 
USING condition::text::court_condition_new;

-- Drop the old type
DROP TYPE IF EXISTS court_condition CASCADE;

-- Rename the new type to the original name
ALTER TYPE court_condition_new RENAME TO court_condition;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Court condition enum updated!';
  RAISE NOTICE 'New values: good, minor_damage, damaged';
END $$;
