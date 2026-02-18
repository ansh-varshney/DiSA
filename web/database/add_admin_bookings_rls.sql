-- ============================================
-- Add Admin RLS Policies for Bookings Table
-- ============================================
-- Fixes: Admin cannot cancel/delete bookings because
-- current RLS only allows users to SELECT/INSERT their own bookings.
-- This adds policies for admin/superuser to manage ALL bookings.

-- Allow admins/superusers to view ALL bookings (not just their own)
CREATE POLICY "Admins and superusers can view all bookings" 
ON public.bookings FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() 
    AND (profiles.role = 'admin' OR profiles.role = 'superuser')
  )
);

-- Allow admins/superusers to update ANY booking
CREATE POLICY "Admins and superusers can update bookings" 
ON public.bookings FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() 
    AND (profiles.role = 'admin' OR profiles.role = 'superuser')
  )
);

-- Allow admins/superusers to delete ANY booking
CREATE POLICY "Admins and superusers can delete bookings" 
ON public.bookings FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() 
    AND (profiles.role = 'admin' OR profiles.role = 'superuser')
  )
);

-- Allow admins/superusers to insert bookings (for priority/maintenance reservations)
CREATE POLICY "Admins and superusers can insert bookings" 
ON public.bookings FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() 
    AND (profiles.role = 'admin' OR profiles.role = 'superuser')
  )
);

-- Verification
SELECT policyname, cmd 
FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'bookings'
ORDER BY policyname;
