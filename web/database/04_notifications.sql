-- ============================================
-- DiSA Notification & Play Request System
-- Run AFTER 03_points_ban_system.sql
-- ============================================

-- ─── 1. Notifications table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_id  UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  sender_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  type          TEXT NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  data          JSONB DEFAULT '{}',
  is_read       BOOLEAN DEFAULT FALSE NOT NULL,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Each user can read/update only their own notifications
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = recipient_id);

CREATE POLICY "Users can mark own notifications read"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = recipient_id);

-- Service role (SECURITY DEFINER RPCs / admin client) handles INSERT for all users
-- No insert policy needed for regular authenticated users — admin client bypasses RLS

-- ─── 2. Play requests table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.play_requests (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id      UUID REFERENCES public.bookings(id) ON DELETE CASCADE NOT NULL,
  requester_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  recipient_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  -- 'pending' | 'accepted' | 'rejected' | 'expired'
  status          TEXT DEFAULT 'pending' NOT NULL,
  notification_id UUID REFERENCES public.notifications(id) ON DELETE SET NULL,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  responded_at    TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.play_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parties can view their play requests"
  ON public.play_requests FOR SELECT
  USING (auth.uid() = recipient_id OR auth.uid() = requester_id);

-- ─── 3. Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notifications_recipient
  ON public.notifications(recipient_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON public.notifications(recipient_id, created_at DESC)
  WHERE is_read = FALSE;

CREATE INDEX IF NOT EXISTS idx_play_requests_recipient
  ON public.play_requests(recipient_id, status);

CREATE INDEX IF NOT EXISTS idx_play_requests_booking
  ON public.play_requests(booking_id);

-- ─── Done ─────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE '✓ Notification & Play Request migration applied successfully.';
  RAISE NOTICE '  New tables  : notifications, play_requests';
  RAISE NOTICE '  Indexes     : idx_notifications_recipient, idx_notifications_unread, idx_play_requests_*';
END $$;
