-- ============================================
-- CampusPlay Sports Court Management System
-- Base Database Schema
-- ============================================
-- This script creates the core database structure including:
-- - Enum types for roles, booking statuses, and equipment conditions
-- - Core tables: profiles, courts, equipment, bookings, announcements
-- - Row Level Security (RLS) policies
--
-- RUN THIS FIRST when setting up a new database
-- ============================================

-- Create Enum Types
CREATE TYPE user_role AS ENUM ('student', 'manager', 'admin', 'superuser');
CREATE TYPE booking_status AS ENUM ('pending_confirmation', 'confirmed', 'waiting_manager', 'active', 'completed', 'cancelled', 'rejected');
CREATE TYPE equipment_condition AS ENUM ('good', 'minor_damage', 'damaged', 'lost');

-- ============================================
-- Profiles Table (Extends Supabase Auth)
-- ============================================
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE,
  full_name TEXT,
  role user_role DEFAULT 'student',
  phone_number TEXT,
  avatar_url TEXT,
  student_id TEXT, -- For Roll Number
  branch TEXT,
  points INTEGER DEFAULT 0,
  is_eligible_for_consecutive BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Turn on RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policies for Profiles
CREATE POLICY "Public profiles are viewable by everyone"
ON public.profiles FOR SELECT
USING (true);

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = id);

-- ============================================
-- Courts Table
-- ============================================
CREATE TABLE public.courts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL, -- e.g. "Badminton Court 1"
  sport TEXT NOT NULL, -- "Badminton", "Tennis"
  type TEXT, -- "Synthetic", "Wooden"
  capacity INTEGER DEFAULT 4,
  is_active BOOLEAN DEFAULT TRUE,
  maintenance_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.courts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Courts are viewable by everyone" ON public.courts FOR SELECT USING (true);
CREATE POLICY "Only Admins can modify courts" ON public.courts FOR ALL USING (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and (profiles.role = 'admin' OR profiles.role = 'superuser')
  )
);

-- ============================================
-- Equipment Table
-- ============================================
CREATE TABLE public.equipment (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  sport TEXT NOT NULL,
  condition equipment_condition DEFAULT 'good',
  is_available BOOLEAN DEFAULT TRUE,
  total_usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Equipment viewable by everyone" ON public.equipment FOR SELECT USING (true);

-- ============================================
-- Bookings Table
-- ============================================
CREATE TABLE public.bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) NOT NULL,
  court_id UUID REFERENCES public.courts(id) NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  status booking_status DEFAULT 'pending_confirmation',
  players_list JSONB, -- Array of player IDs or Objects: [{id, status: 'confirmed'}]
  equipment_ids UUID[] DEFAULT '{}', -- Array of equipment IDs
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
-- Basic policies for bookings
CREATE POLICY "Users can view their own bookings" ON public.bookings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create bookings" ON public.bookings FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================
-- Announcements Table
-- ============================================
CREATE TABLE public.announcements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Announcements viewable by everyone" ON public.announcements FOR SELECT USING (true);

-- ============================================
-- Setup Complete
-- ============================================
-- Next step: Run 02_admin_schema_extension.sql
