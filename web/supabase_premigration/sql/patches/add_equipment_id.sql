-- Add equipment_id column to equipment table
ALTER TABLE equipment
ADD COLUMN IF NOT EXISTS equipment_id TEXT;

-- Create an index for faster lookups
CREATE INDEX IF NOT EXISTS idx_equipment_id ON equipment(equipment_id);

-- Add a unique constraint to ensure equipment IDs are unique
ALTER TABLE equipment
ADD CONSTRAINT unique_equipment_id UNIQUE (equipment_id);
