-- Allow Admins and Managers to VIEW all bookings
CREATE POLICY "Admins and Managers can view all bookings"
ON public.bookings FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'manager', 'superuser')
  )
);

-- Allow Admins and Managers to UPDATE all bookings (e.g. status)
CREATE POLICY "Admins and Managers can update all bookings"
ON public.bookings FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'manager', 'superuser')
  )
);
