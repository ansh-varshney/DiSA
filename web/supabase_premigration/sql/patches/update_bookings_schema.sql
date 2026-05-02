-- Add is_maintenance status to bookings
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS is_maintenance BOOLEAN DEFAULT FALSE;

-- Add num_players count to bookings (useful for quick display without parsing JSON)
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS num_players INTEGER DEFAULT 0;

-- Index for faster filtering of maintenance bookings
CREATE INDEX IF NOT EXISTS idx_bookings_maintenance ON public.bookings(is_maintenance);
