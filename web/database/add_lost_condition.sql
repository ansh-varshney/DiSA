-- Add 'lost' to the court_condition enum (used by equipment.condition)
-- Run this in Supabase SQL Editor ONCE

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'lost'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'court_condition')
    ) THEN
        ALTER TYPE court_condition ADD VALUE 'lost';
        RAISE NOTICE '✅ Added "lost" to court_condition enum';
    ELSE
        RAISE NOTICE 'ℹ️ "lost" already exists in court_condition enum';
    END IF;
END $$;
