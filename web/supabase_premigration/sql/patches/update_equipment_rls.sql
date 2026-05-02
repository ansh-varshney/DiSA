-- ============================================
-- Update Equipment Table RLS Policies
-- ============================================
-- This script updates the equipment table's RLS policies
-- to allow both 'admin' and 'superuser' roles to manage equipment

-- Drop the old policy
DROP POLICY IF EXISTS "Equipment viewable by everyone" ON public.equipment;
DROP POLICY IF EXISTS "Admins can manage equipment" ON public.equipment;

-- Recreate policies with superuser support
CREATE POLICY "Equipment viewable by everyone" 
ON public.equipment 
FOR SELECT 
USING (true);

CREATE POLICY "Admins and superusers can manage equipment" 
ON public.equipment 
FOR ALL 
USING (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() 
    and (profiles.role = 'admin' OR profiles.role = 'superuser')
  )
);

-- ============================================
-- Verification
-- ============================================
-- Check that policies are updated
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'equipment';
