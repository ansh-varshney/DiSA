-- ============================================
-- Add num_players column to bookings table
-- ============================================
-- Stores the number of players for a booking (minimum 2)

ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS num_players INTEGER DEFAULT 2;
